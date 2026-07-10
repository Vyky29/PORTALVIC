/** Payment hold helpers — soft hold, cancel one recoverable session, clear on pay. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type PaymentHoldStatus = "soft_hold" | "session_held" | "cleared" | "hard_cut";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function rosterSlug(raw: string): string {
  return clean(raw, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTimeSlotBounds(timeSlot: string): { start: string; end: string } {
  const s = clean(timeSlot, 80);
  const m = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (m) return { start: m[1], end: m[2] };
  const one = s.match(/(\d{1,2}:\d{2})/);
  return { start: one ? one[1] : "00:00", end: one ? one[1] : "00:00" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadOwnArrangementBuffer(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  is_own_arrangement: boolean;
  buffer_gbp: number;
  lines: unknown[];
  parent_person_id: string | null;
}> {
  const { data: sub } = await supabase
    .from("portal_re_enrolment_submissions")
    .select("payload, parent_person_id")
    .eq("participant_contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = (sub?.payload && typeof sub.payload === "object" ? sub.payload : {}) as Record<
    string,
    unknown
  >;
  const funding = (payload.funding && typeof payload.funding === "object"
    ? payload.funding
    : {}) as Record<string, unknown>;
  const c2627 = (funding.choices_2627 && typeof funding.choices_2627 === "object"
    ? funding.choices_2627
    : {}) as Record<string, unknown>;

  const parentPersonId = sub?.parent_person_id ? String(sub.parent_person_id) : null;
  if (clean(c2627.payment_method_code, 40) !== "own_way_flexible") {
    return {
      is_own_arrangement: false,
      buffer_gbp: 0,
      lines: [],
      parent_person_id: parentPersonId,
    };
  }

  const buffer = Number(c2627.advance_buffer_gbp) || 0;
  const lines = Array.isArray(c2627.advance_buffer_lines) ? c2627.advance_buffer_lines : [];
  return {
    is_own_arrangement: true,
    buffer_gbp: buffer,
    lines,
    parent_person_id: parentPersonId,
  };
}

export type BufferEvaluation = {
  is_own_arrangement: boolean;
  required_gbp: number;
  available_gbp: number;
  shortfall_gbp: number;
  is_low: boolean;
  open_credits_gbp: number;
  overdue_unpaid_gbp: number;
  lines: unknown[];
  parent_person_id: string | null;
};

/**
 * Prepaid buffer proxy (v1): open family credits minus overdue unpaid invoices.
 * Session-consumption accounting comes later.
 */
export async function evaluateOwnArrangementBuffer(
  supabase: SupabaseClient,
  contactId: string,
): Promise<BufferEvaluation> {
  const buf = await loadOwnArrangementBuffer(supabase, contactId);
  const empty: BufferEvaluation = {
    is_own_arrangement: false,
    required_gbp: 0,
    available_gbp: 0,
    shortfall_gbp: 0,
    is_low: false,
    open_credits_gbp: 0,
    overdue_unpaid_gbp: 0,
    lines: [],
    parent_person_id: buf.parent_person_id,
  };
  if (!buf.is_own_arrangement || buf.buffer_gbp <= 0) {
    return { ...empty, parent_person_id: buf.parent_person_id };
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: credits } = await supabase
    .from("portal_parent_family_credits")
    .select("amount_gbp")
    .eq("contact_id", contactId)
    .eq("kind", "credit")
    .eq("status", "open");

  let openCredits = 0;
  for (const c of credits || []) {
    const n = Number(c.amount_gbp);
    if (Number.isFinite(n) && n > 0) openCredits += n;
  }
  openCredits = round2(openCredits);

  const { data: overdue } = await supabase
    .from("portal_parent_invoice_share")
    .select("amount_gbp")
    .eq("contact_id", contactId)
    .eq("share_status", "ready")
    .in("payment_status", ["unpaid", "partial"])
    .lt("due_date", today);

  let overdueUnpaid = 0;
  for (const inv of overdue || []) {
    const n = Number(inv.amount_gbp);
    if (Number.isFinite(n) && n > 0) overdueUnpaid += n;
  }
  overdueUnpaid = round2(overdueUnpaid);

  const available = round2(Math.max(0, openCredits - overdueUnpaid));
  const required = round2(buf.buffer_gbp);
  const shortfall = round2(Math.max(0, required - available));

  return {
    is_own_arrangement: true,
    required_gbp: required,
    available_gbp: available,
    shortfall_gbp: shortfall,
    is_low: shortfall > 0.009,
    open_credits_gbp: openCredits,
    overdue_unpaid_gbp: overdueUnpaid,
    lines: buf.lines,
    parent_person_id: buf.parent_person_id,
  };
}

/** Soft-hold when buffer low; clear soft_hold only when restored. Never auto hold_session/hard_cut. */
export async function refreshBufferHoldState(
  supabase: SupabaseClient,
  contactId: string,
  actorUserId?: string | null,
): Promise<{
  evaluation: BufferEvaluation;
  action: "none" | "soft_hold" | "cleared" | "skipped_session_held";
}> {
  const evaluation = await evaluateOwnArrangementBuffer(supabase, contactId);
  if (!evaluation.is_own_arrangement) {
    return { evaluation, action: "none" };
  }

  const open = await getOpenPaymentHold(supabase, contactId);

  if (evaluation.is_low) {
    if (open && (open.status === "session_held" || open.status === "hard_cut")) {
      return { evaluation, action: "skipped_session_held" };
    }
    await upsertSoftHold(supabase, {
      contactId,
      parentPersonId: evaluation.parent_person_id,
      bufferGbp: evaluation.required_gbp,
      bufferLines: evaluation.lines,
      notes: `Auto: prepaid below minimum (need £${evaluation.required_gbp.toFixed(2)}, have £${evaluation.available_gbp.toFixed(2)})`,
      actorUserId: actorUserId || null,
    });
    return { evaluation, action: "soft_hold" };
  }

  if (open && open.status === "soft_hold" && clean(open.reason, 40) === "own_arrangement_buffer") {
    await clearPaymentHoldForContact(supabase, contactId, "buffer_restored", actorUserId || null);
    return { evaluation, action: "cleared" };
  }

  return { evaluation, action: "none" };
}

export async function getOpenPaymentHold(
  supabase: SupabaseClient,
  contactId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("portal_family_payment_holds")
    .select("*")
    .eq("contact_id", contactId)
    .in("status", ["soft_hold", "session_held"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function upsertSoftHold(
  supabase: SupabaseClient,
  input: {
    contactId: string;
    parentPersonId?: string | null;
    bufferGbp?: number | null;
    bufferLines?: unknown[];
    invoiceShareId?: string | null;
    notes?: string | null;
    actorUserId?: string | null;
    bumpReminder?: boolean;
  },
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const existing = await getOpenPaymentHold(supabase, input.contactId);
  if (existing) {
    const patch: Record<string, unknown> = {
      updated_at: now,
      updated_by: input.actorUserId || null,
    };
    if (input.bufferGbp != null) patch.advance_buffer_gbp = input.bufferGbp;
    if (input.bufferLines) patch.advance_buffer_lines = input.bufferLines;
    if (input.invoiceShareId) patch.trigger_invoice_share_id = input.invoiceShareId;
    if (input.notes) patch.notes = clean(input.notes, 500);
    if (input.bumpReminder) {
      patch.reminder_count = Number(existing.reminder_count || 0) + 1;
      patch.last_reminder_at = now;
    }
    const { data, error } = await supabase
      .from("portal_family_payment_holds")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data || existing;
  }

  const row = {
    contact_id: input.contactId,
    parent_person_id: input.parentPersonId || null,
    status: "soft_hold",
    reason: "own_arrangement_buffer",
    advance_buffer_gbp: input.bufferGbp ?? null,
    advance_buffer_lines: input.bufferLines || [],
    reminder_count: input.bumpReminder ? 1 : 0,
    last_reminder_at: input.bumpReminder ? now : null,
    trigger_invoice_share_id: input.invoiceShareId || null,
    notes: input.notes ? clean(input.notes, 500) : null,
    created_by: input.actorUserId || null,
    updated_by: input.actorUserId || null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("portal_family_payment_holds")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data!;
}

async function findNextSessionForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  session_date: string;
  time_slot: string;
  venue: string;
  instructors: string;
  client_name: string;
  service: string;
  day: string;
} | null> {
  const { data: pax } = await supabase
    .from("portal_participants")
    .select("display_name, first_name, last_name")
    .eq("contact_id", contactId)
    .limit(1)
    .maybeSingle();
  const name =
    clean(pax?.display_name, 120) ||
    [pax?.first_name, pax?.last_name].filter(Boolean).join(" ").trim();
  if (!name) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: dated } = await supabase
    .from("portal_roster_rows")
    .select("session_date, time_slot, venue, instructors, client_name, service, day, status")
    .eq("client_name", name)
    .eq("status", "active")
    .gte("session_date", today)
    .order("session_date", { ascending: true })
    .limit(5);

  const hit = (dated || []).find((r) => r.session_date);
  if (hit) {
    return {
      session_date: String(hit.session_date).slice(0, 10),
      time_slot: clean(hit.time_slot, 80),
      venue: clean(hit.venue, 120),
      instructors: clean(hit.instructors, 120),
      client_name: clean(hit.client_name, 120) || name,
      service: clean(hit.service, 120),
      day: clean(hit.day, 40),
    };
  }

  // Fallback: next weekday from template rows (session_date null).
  const { data: templates } = await supabase
    .from("portal_roster_rows")
    .select("time_slot, venue, instructors, client_name, service, day, status, session_date")
    .eq("client_name", name)
    .eq("status", "active")
    .is("session_date", null)
    .limit(20);

  if (!templates?.length) return null;

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const now = new Date();
  for (let add = 1; add <= 14; add++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add));
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    for (const t of templates) {
      const want = dayMap[clean(t.day, 40).toLowerCase()];
      if (want === dow) {
        return {
          session_date: iso,
          time_slot: clean(t.time_slot, 80),
          venue: clean(t.venue, 120),
          instructors: clean(t.instructors, 120),
          client_name: clean(t.client_name, 120) || name,
          service: clean(t.service, 120),
          day: clean(t.day, 40),
        };
      }
    }
  }
  return null;
}

export async function holdNextSession(
  supabase: SupabaseClient,
  input: { contactId: string; holdId: string; actorUserId?: string | null },
): Promise<{ ok: true; hold: Record<string, unknown>; session: Record<string, unknown> } | { ok: false; error: string }> {
  const session = await findNextSessionForContact(supabase, input.contactId);
  if (!session) return { ok: false, error: "no_upcoming_session" };

  const times = parseTimeSlotBounds(session.time_slot);
  const staffTok = session.instructors.split(/[,/&]|\band\b/i)[0].trim();
  const label = `${session.service || "Session"} · ${session.session_date} · ${session.time_slot}`;

  const { data: ov, error: ovErr } = await supabase
    .from("schedule_overrides")
    .insert({
      session_date: session.session_date,
      anchor_staff_id: rosterSlug(staffTok),
      anchor_start: times.start,
      anchor_end: times.end,
      anchor_venue: session.venue,
      anchor_client_id: rosterSlug(session.client_name),
      anchor_time_slot_label: session.time_slot,
      override_type: "slot_clear_client",
      payload: {
        cancelled_by_admin: true,
        feedback_resolution: "cancelled",
        payment_hold: true,
        hold_id: input.holdId,
        recoverable: true,
        reason_code: "non_payment_buffer",
      },
      reason:
        "Payment hold — session cancelled after reminders (recoverable if paid before hard cut)",
      status: "active",
      superseded_by: null,
      spreadsheet_revision: "portal:payment_hold",
    })
    .select("id")
    .maybeSingle();

  if (ovErr || !ov?.id) {
    console.error("[holdNextSession]", ovErr?.message);
    return { ok: false, error: "override_insert_failed" };
  }

  const now = new Date().toISOString();
  const { data: hold, error } = await supabase
    .from("portal_family_payment_holds")
    .update({
      status: "session_held",
      held_session_date: session.session_date,
      held_session_label: label,
      held_schedule_override_id: ov.id,
      updated_at: now,
      updated_by: input.actorUserId || null,
      notes: "One session held after reminders — parent can pay to restore before hard cut.",
    })
    .eq("id", input.holdId)
    .select("*")
    .maybeSingle();

  if (error || !hold) return { ok: false, error: "hold_update_failed" };
  return { ok: true, hold, session: { ...session, label, override_id: ov.id } };
}

export async function clearPaymentHoldForContact(
  supabase: SupabaseClient,
  contactId: string,
  clearedVia: string,
  actorUserId?: string | null,
): Promise<{ cleared: boolean; restored?: boolean }> {
  const hold = await getOpenPaymentHold(supabase, contactId);
  if (!hold) return { cleared: false };

  let restored = false;
  const ovId = clean(hold.held_schedule_override_id, 80);
  if (ovId && hold.status === "session_held") {
    const { error } = await supabase
      .from("schedule_overrides")
      .update({
        status: "cancelled",
        reason: "Payment received — session restored from payment hold",
      })
      .eq("id", ovId)
      .eq("status", "active");
    if (!error) restored = true;
  }

  const now = new Date().toISOString();
  await supabase
    .from("portal_family_payment_holds")
    .update({
      status: "cleared",
      cleared_at: now,
      cleared_via: clean(clearedVia, 40),
      updated_at: now,
      updated_by: actorUserId || null,
    })
    .eq("id", hold.id);

  return { cleared: true, restored };
}
