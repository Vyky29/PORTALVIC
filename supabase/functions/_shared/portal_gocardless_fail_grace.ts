/**
 * GoCardless instalment failed → 2h bank-transfer grace → HOLD WAITLIST if unpaid.
 * Parent copy never mentions club failure fees / ARUDD charges.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { gocardlessGetPayment } from "./gocardless.ts";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "./tide_bank_details.ts";
import {
  clearPaymentHoldForContact,
  getOpenPaymentHold,
} from "./portal_payment_holds.ts";

export const GC_FAIL_REASON = "gocardless_failed";
export const HOLD_WAITLIST_CLIENT = "HOLD WAITLIST";
export const GC_FAIL_GRACE_MS = 2 * 60 * 60 * 1000;

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normName(raw: unknown): string {
  return clean(raw, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a: unknown, b: unknown): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function formatDeadlineUk(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatGbp(n: number): string {
  return `£${round2(n).toFixed(2)}`;
}

export type GcFailLine = {
  contact_id: string;
  invoice_share_id: string;
  invoice_number: string;
  child_display: string;
  parent_display: string;
  mobile: string;
  email: string;
  amount_gbp: number;
  gocardless_payment_id: string;
  cause: string;
};

export async function resolveGcFailedInvoice(
  supabase: SupabaseClient,
  opts: {
    paymentId?: string | null;
    invoiceShareId?: string | null;
    cause?: string | null;
  },
): Promise<GcFailLine | null> {
  const paymentId = clean(opts.paymentId, 80);
  let invoiceShareId = clean(opts.invoiceShareId, 60);

  let amountFromGc = 0;
  if (paymentId) {
    const pay = await gocardlessGetPayment(paymentId);
    if (pay.ok) {
      if (pay.data.amount_pence > 0) amountFromGc = round2(pay.data.amount_pence / 100);
      if (!invoiceShareId) {
        invoiceShareId = clean(pay.data.metadata?.invoice_share_id, 60);
      }
    }
  }

  let invQ = supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, gocardless_payment_id, notes",
    );
  if (invoiceShareId) invQ = invQ.eq("id", invoiceShareId);
  else if (paymentId) invQ = invQ.eq("gocardless_payment_id", paymentId);
  else return null;

  const { data: inv, error } = await invQ.maybeSingle();
  if (error || !inv) return null;

  let amountGbp = amountFromGc;
  if (!(amountGbp > 0)) {
    const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
    const next = schedule.find(
      (r: Record<string, unknown>) =>
        String(r?.status || "pending").toLowerCase() !== "paid",
    ) as Record<string, unknown> | undefined;
    amountGbp = round2(Number(next?.amount_gbp || 0));
  }
  if (!(amountGbp > 0)) {
    amountGbp = round2(Number(inv.amount_gbp || 0) - Number(inv.amount_paid_gbp || 0));
  }
  if (!(amountGbp > 0)) return null;

  const contactId = clean(inv.contact_id, 120);
  const { data: contact } = await supabase
    .from("portal_parent_contacts")
    .select(
      "contact_id, child_display, parent_display, parent_first_name, mobile, email",
    )
    .eq("contact_id", contactId)
    .maybeSingle();

  return {
    contact_id: contactId,
    invoice_share_id: String(inv.id),
    invoice_number: clean(inv.invoice_number, 40) || "invoice",
    child_display: clean(contact?.child_display, 120) || "your child",
    parent_display:
      clean(contact?.parent_display, 120) ||
      clean(contact?.parent_first_name, 80) ||
      "there",
    mobile: clean(contact?.mobile, 40),
    email: clean(contact?.email, 120),
    amount_gbp: amountGbp,
    gocardless_payment_id: paymentId || clean(inv.gocardless_payment_id, 80),
    cause: clean(opts.cause, 200) || "failed",
  };
}

export async function upsertGcFailHold(
  supabase: SupabaseClient,
  line: GcFailLine,
  opts?: { graceDeadlineIso?: string | null; whatsappSentAt?: string | null },
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const grace =
    clean(opts?.graceDeadlineIso, 40) ||
    new Date(Date.now() + GC_FAIL_GRACE_MS).toISOString();

  const existing = await getOpenPaymentHold(supabase, line.contact_id);
  if (existing) {
    const samePay =
      clean(existing.gocardless_payment_id, 80) === line.gocardless_payment_id &&
      clean(existing.reason, 40) === GC_FAIL_REASON;
    if (samePay && existing.whatsapp_sent_at) {
      return existing;
    }
    const patch: Record<string, unknown> = {
      reason: GC_FAIL_REASON,
      status: "soft_hold",
      trigger_invoice_share_id: line.invoice_share_id,
      gocardless_payment_id: line.gocardless_payment_id || null,
      amount_gbp: line.amount_gbp,
      grace_deadline_at: existing.grace_deadline_at || grace,
      held_client_name: clean(existing.held_client_name, 120) ||
        clean(line.child_display, 120),
      notes: `GoCardless failed (${line.cause}): bank transfer ${formatGbp(line.amount_gbp)} due by ${formatDeadlineUk(grace)}`,
      updated_at: now,
    };
    if (opts?.whatsappSentAt) {
      patch.whatsapp_sent_at = opts.whatsappSentAt;
      patch.grace_deadline_at = grace;
      patch.last_reminder_at = opts.whatsappSentAt;
      patch.reminder_count = Number(existing.reminder_count || 0) + 1;
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
    contact_id: line.contact_id,
    parent_person_id: null as string | null,
    status: "soft_hold",
    reason: GC_FAIL_REASON,
    trigger_invoice_share_id: line.invoice_share_id,
    gocardless_payment_id: line.gocardless_payment_id || null,
    amount_gbp: line.amount_gbp,
    grace_deadline_at: grace,
    whatsapp_sent_at: opts?.whatsappSentAt || null,
    held_client_name: clean(line.child_display, 120) || null,
    reminder_count: opts?.whatsappSentAt ? 1 : 0,
    last_reminder_at: opts?.whatsappSentAt || null,
    notes: `GoCardless failed (${line.cause}): bank transfer ${formatGbp(line.amount_gbp)} due by ${formatDeadlineUk(grace)}`,
    created_at: now,
    updated_at: now,
  };

  const { data: parentLink } = await supabase
    .from("portal_parent_contacts")
    .select("parent_person_id")
    .eq("contact_id", line.contact_id)
    .maybeSingle();
  row.parent_person_id = clean(parentLink?.parent_person_id, 80) || null;

  const { data, error } = await supabase
    .from("portal_family_payment_holds")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data!;
}

function buildBankFailWhatsapp(lines: GcFailLine[], deadlineIso: string): string {
  const bank = tideBankDetailsFromEnv();
  const parent = clean(lines[0]?.parent_display, 80) || "there";
  const parentFirst = parent.split(/\s+/)[0] || "there";
  const deadline = formatDeadlineUk(deadlineIso);
  const total = round2(lines.reduce((n, l) => n + (Number(l.amount_gbp) || 0), 0));

  const childBits = lines.map((l) => {
    const child = clean(l.child_display, 80) || "your child";
    return `${child} (${l.invoice_number}) ${formatGbp(l.amount_gbp)}`;
  });

  const parts: string[] = [
    `Hi ${parentFirst},`,
    lines.length === 1
      ? `Direct Debit for ${childBits[0]} did not go through.`
      : `Direct Debit did not go through for:\n- ${childBits.join("\n- ")}`,
    `Please pay ${formatGbp(total)} by bank transfer and WhatsApp or email the office with a transfer screenshot within 2 hours (by ${deadline}).`,
    `Later months stay on GoCardless. If we do not receive payment in time, the place may be released.`,
  ];

  if (bank.available) {
    const ref =
      lines.length === 1
        ? suggestedTransferReference(lines[0].invoice_number, lines[0].child_display)
        : suggestedTransferReference("", clean(lines[0].parent_display, 40) || "ClubSENsational");
    parts.push(
      [
        "Bank details:",
        `Payee: ${bank.payee_name}`,
        `Sort code: ${bank.sort_code}`,
        `Account: ${bank.account_number}`,
        `Reference: ${ref}`,
      ].join("\n"),
    );
  } else {
    parts.push("Ask the office for bank details if you do not have them.");
  }

  return parts.join("\n\n");
}

/** Process one or more failed GC payments; group WhatsApp by phone. */
export async function handleGcPaymentsFailedBatch(
  supabase: SupabaseClient,
  events: Array<{
    paymentId?: string | null;
    invoiceShareId?: string | null;
    cause?: string | null;
  }>,
): Promise<{
  lines: GcFailLine[];
  holds: Record<string, unknown>[];
  whatsapp: Array<Record<string, unknown>>;
}> {
  const lines: GcFailLine[] = [];
  for (const ev of events) {
    const line = await resolveGcFailedInvoice(supabase, ev);
    if (!line) continue;
    // Idempotent skip if already notified for this payment.
    const { data: prior } = await supabase
      .from("portal_family_payment_holds")
      .select("id, whatsapp_sent_at, gocardless_payment_id, status")
      .eq("contact_id", line.contact_id)
      .eq("gocardless_payment_id", line.gocardless_payment_id)
      .eq("reason", GC_FAIL_REASON)
      .in("status", ["soft_hold", "session_held"])
      .maybeSingle();
    if (prior?.whatsapp_sent_at) {
      lines.push(line);
      continue;
    }
    lines.push(line);

    const deadline = new Date(Date.now() + GC_FAIL_GRACE_MS).toISOString();
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        notes: `GoCardless failed: ${line.cause} · bank transfer ${formatGbp(line.amount_gbp)} due by ${formatDeadlineUk(deadline)}`
          .slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.invoice_share_id);

    await upsertGcFailHold(supabase, line, { graceDeadlineIso: deadline });
  }

  // Group by phone for one WA.
  const byPhone = new Map<string, GcFailLine[]>();
  const noPhone: GcFailLine[] = [];
  for (const line of lines) {
    const e164 = normalizeParentPhoneE164(line.mobile);
    if (!e164) {
      noPhone.push(line);
      continue;
    }
    const arr = byPhone.get(e164) || [];
    arr.push(line);
    byPhone.set(e164, arr);
  }

  const holds: Record<string, unknown>[] = [];
  const whatsapp: Array<Record<string, unknown>> = [];

  for (const [phone, group] of byPhone.entries()) {
    // Skip if every line already has whatsapp_sent_at on open hold.
    let allSent = true;
    for (const g of group) {
      const open = await getOpenPaymentHold(supabase, g.contact_id);
      if (!(open && clean(open.reason, 40) === GC_FAIL_REASON && open.whatsapp_sent_at)) {
        allSent = false;
        break;
      }
    }
    if (allSent) {
      whatsapp.push({ phone: maskPhoneForLog(phone), skipped: "already_sent" });
      continue;
    }

    const sentAt = new Date().toISOString();
    const deadline = new Date(Date.parse(sentAt) + GC_FAIL_GRACE_MS).toISOString();
    const body = buildBankFailWhatsapp(group, deadline);
    const sent = await sendParentMobileMessage(phone, body, {
      kind: "gocardless_failed_bank",
    });

    const waStatus = sent.ok
      ? sent.channel === "sms"
        ? "sent_sms"
        : "sent"
      : "failed";

    await supabase.from("portal_parent_notify_log").insert({
      kind: "gocardless_failed_bank",
      channel: sent.ok && sent.channel === "sms" ? "sms" : "whatsapp",
      client_display: group.map((g) => g.child_display).join(", ").slice(0, 120),
      parent_name: group[0]?.parent_display || null,
      parent_phone: phone,
      body_text: body,
      whatsapp_status: waStatus,
      error_detail: sent.ok ? null : clean(sent.error, 200),
      meta: {
        invoice_numbers: group.map((g) => g.invoice_number),
        amounts_gbp: group.map((g) => g.amount_gbp),
        grace_deadline_at: deadline,
        gocardless_payment_ids: group.map((g) => g.gocardless_payment_id),
      },
    });

    for (const g of group) {
      const hold = await upsertGcFailHold(supabase, g, {
        graceDeadlineIso: deadline,
        whatsappSentAt: sentAt,
      });
      holds.push(hold);
    }

    whatsapp.push({
      phone: maskPhoneForLog(phone),
      status: waStatus,
      children: group.map((g) => g.child_display),
      total_gbp: round2(group.reduce((n, g) => n + g.amount_gbp, 0)),
      deadline,
    });
  }

  for (const g of noPhone) {
    const hold = await upsertGcFailHold(supabase, g);
    holds.push(hold);
    whatsapp.push({
      contact_id: g.contact_id,
      skipped: "no_parent_phone",
      invoice: g.invoice_number,
    });
  }

  return { lines, holds, whatsapp };
}

function isNamedClient(name: string): boolean {
  const up = clean(name, 120).toUpperCase();
  if (!up) return false;
  if (
    up === "CLOSED" ||
    up === "NO PARTICIPANT" ||
    up === "NOPARTICIPANT" ||
    up === "OPEN" ||
    up === "AVAILABLE" ||
    up === "FREE" ||
    up === "HOLD WAITLIST" ||
    up === "NO CLIENT" ||
    up === "OFF" ||
    up === "MANAGER"
  ) {
    return false;
  }
  return true;
}

async function rewriteMadreClientToHoldWaitlist(
  supabase: SupabaseClient,
  clientName: string,
): Promise<{ changed: number; revision: number | null }> {
  const want = clean(clientName, 120);
  if (!want) return { changed: 0, revision: null };

  const { data: row, error } = await supabase
    .from("portal_madre_document")
    .select("term_key, revision, document")
    .eq("term_key", "summer-2026")
    .maybeSingle();
  if (error || !row?.document) return { changed: 0, revision: null };

  const doc = row.document as {
    weeks?: Array<{ staff?: Array<Record<string, unknown>> }>;
    meta?: Record<string, unknown>;
  };
  let changed = 0;
  for (const week of doc.weeks || []) {
    for (const st of week.staff || []) {
      if (!st) continue;
      const days = Array.isArray(st.days) ? (st.days as Array<Record<string, unknown>>) : [];
      for (const day of days) {
        const slots = Array.isArray(day.slots)
          ? (day.slots as Array<Record<string, unknown>>)
          : [];
        for (const slot of slots) {
          if (namesMatch(slot.client_name, want) && isNamedClient(String(slot.client_name || ""))) {
            slot.client_name = HOLD_WAITLIST_CLIENT;
            changed += 1;
          }
        }
      }
    }
  }

  if (!changed) return { changed: 0, revision: Number(row.revision) || null };

  const prevRev = Number(row.revision) || 0;
  const nextRev = prevRev + 1;
  doc.meta = doc.meta && typeof doc.meta === "object" ? doc.meta : {};
  const notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  notes.push(
    `rev ${nextRev}: GC fail grace expired — ${want} → HOLD WAITLIST (bank window missed)`,
  );
  doc.meta.notes = notes;

  const { data: updated, error: upErr } = await supabase
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: nextRev,
      updated_at: new Date().toISOString(),
    })
    .eq("term_key", "summer-2026")
    .eq("revision", prevRev)
    .select("revision")
    .maybeSingle();

  if (upErr || !updated) {
    console.error("[gc-fail-grace] madre patch", upErr?.message || "conflict");
    return { changed: 0, revision: prevRev };
  }
  return { changed, revision: Number(updated.revision) || nextRev };
}

async function rewriteRosterClientToHoldWaitlist(
  supabase: SupabaseClient,
  clientName: string,
): Promise<number> {
  const want = clean(clientName, 120);
  if (!want) return 0;
  const { data: rows } = await supabase
    .from("portal_roster_rows")
    .select("id, client_name")
    .eq("status", "active")
    .ilike("client_name", want);
  let n = 0;
  for (const r of rows || []) {
    if (!namesMatch(r.client_name, want)) continue;
    if (!isNamedClient(String(r.client_name || ""))) continue;
    const { error } = await supabase
      .from("portal_roster_rows")
      .update({
        client_name: HOLD_WAITLIST_CLIENT,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (!error) n += 1;
  }
  return n;
}

async function restoreMadreClientFromHoldWaitlist(
  supabase: SupabaseClient,
  clientName: string,
): Promise<number> {
  const want = clean(clientName, 120);
  if (!want) return 0;
  const { data: row } = await supabase
    .from("portal_madre_document")
    .select("revision, document")
    .eq("term_key", "summer-2026")
    .maybeSingle();
  if (!row?.document) return 0;
  const doc = row.document as {
    weeks?: Array<{ staff?: Array<Record<string, unknown>> }>;
    meta?: Record<string, unknown>;
  };
  let changed = 0;
  // Restore only seats that are HOLD WAITLIST where we previously had this client —
  // standing weeks may have multiple HOLD WAITLIST; restore those tagged in notes is fragile.
  // Practical approach: restore HOLD WAITLIST slots that match held_seats in hold notes is better.
  // Simpler v1: replace first N HOLD WAITLIST aquatic slots is wrong.
  // Store mapping was lost — restore by replacing HOLD WAITLIST back only on roster_rows
  // that we flipped, and on MADRE where instructors still match via roster sync.
  // For MADRE: walk slots; if client is HOLD WAITLIST and instructors slot had this child in
  // portal_roster standing before — we already update roster. MADRE: convert HOLD WAITLIST
  // slots that appear in the same staff/day/time as a roster row we restore.

  // Minimal safe restore: any HOLD WAITLIST on weeks where we find a note for this client
  // from grace expiry is ambiguous. Prefer roster + standing MADRE slots that are HOLD WAITLIST
  // for aquatic after-school where held_client was the only change — use advance_buffer_lines.
  void doc;
  void changed;
  return 0;
}

async function restoreRosterClientFromHoldWaitlist(
  supabase: SupabaseClient,
  clientName: string,
  holdId: string,
): Promise<number> {
  const want = clean(clientName, 120);
  if (!want) return 0;
  // Roster rows we escalated have client HOLD WAITLIST; we cannot know which without snapshot.
  // Use hold.advance_buffer_lines if present; else skip MADRE/roster auto-restore and leave admin.
  void holdId;
  const { data: rows } = await supabase
    .from("portal_roster_rows")
    .select("id, client_name, day, time_slot, instructors, venue, notes")
    .eq("status", "active")
    .eq("client_name", HOLD_WAITLIST_CLIENT);
  // Without snapshot, do not guess. Return 0 — admin restores or reassigns.
  void rows;
  void want;
  return 0;
}

/** Snapshot seat keys before flipping to HOLD WAITLIST (stored on hold). */
async function snapshotSeatsForClient(
  supabase: SupabaseClient,
  clientName: string,
): Promise<Array<Record<string, string>>> {
  const want = clean(clientName, 120);
  const out: Array<Record<string, string>> = [];
  const { data: rows } = await supabase
    .from("portal_roster_rows")
    .select("id, day, time_slot, instructors, venue, service, client_name")
    .eq("status", "active")
    .ilike("client_name", want);
  for (const r of rows || []) {
    if (!namesMatch(r.client_name, want)) continue;
    out.push({
      roster_id: String(r.id),
      day: clean(r.day, 40),
      time_slot: clean(r.time_slot, 80),
      instructors: clean(r.instructors, 80),
      venue: clean(r.venue, 80),
      service: clean(r.service, 80),
      client_name: want,
    });
  }
  return out;
}

export async function escalateGcFailHoldToSeatBlock(
  supabase: SupabaseClient,
  hold: Record<string, unknown>,
): Promise<{ ok: boolean; madre_changed?: number; roster_changed?: number; error?: string }> {
  const holdId = clean(hold.id, 80);
  const clientName =
    clean(hold.held_client_name, 120) ||
    clean((hold as { held_client_name?: string }).held_client_name, 120);
  if (!holdId) return { ok: false, error: "no_hold" };

  // Confirm invoice still unpaid for the failed instalment window.
  const invId = clean(hold.trigger_invoice_share_id, 80);
  if (invId) {
    const { data: inv } = await supabase
      .from("portal_parent_invoice_share")
      .select("payment_status, amount_paid_gbp")
      .eq("id", invId)
      .maybeSingle();
    const pay = clean(inv?.payment_status, 40).toLowerCase();
    if (pay === "paid" || pay === "void") {
      await clearPaymentHoldForContact(supabase, clean(hold.contact_id, 120), "paid_before_grace");
      return { ok: true, madre_changed: 0, roster_changed: 0 };
    }
    if (pay === "partial" && Number(inv?.amount_paid_gbp || 0) > 0) {
      // Instalment likely bank-paid during grace.
      await clearGcFailHoldOnPay(supabase, clean(hold.contact_id, 120), "bank_during_grace");
      return { ok: true, madre_changed: 0, roster_changed: 0 };
    }
  }

  const child =
    clientName ||
    (
      await supabase
        .from("portal_parent_contacts")
        .select("child_display")
        .eq("contact_id", clean(hold.contact_id, 120))
        .maybeSingle()
    ).data?.child_display ||
    "";
  const childClean = clean(child, 120);
  if (!childClean) return { ok: false, error: "no_client_name" };

  const seats = await snapshotSeatsForClient(supabase, childClean);
  const madre = await rewriteMadreClientToHoldWaitlist(supabase, childClean);
  const rosterChanged = await rewriteRosterClientToHoldWaitlist(supabase, childClean);

  const now = new Date().toISOString();
  await supabase
    .from("portal_family_payment_holds")
    .update({
      status: "session_held",
      held_client_name: childClean,
      held_session_label: `HOLD WAITLIST · ${childClean}`,
      advance_buffer_lines: seats,
      notes: `GC fail grace expired — ${childClean} → HOLD WAITLIST (admin can re-offer or restore)`,
      updated_at: now,
    })
    .eq("id", holdId);

  await supabase.from("portal_parent_notify_log").insert({
    kind: "gocardless_failed_seat_blocked",
    channel: "office",
    client_display: childClean,
    parent_name: null,
    parent_phone: null,
    body_text: `${childClean}: GC bank window expired — seat set to HOLD WAITLIST (madre ${madre.changed}, roster ${rosterChanged}).`,
    whatsapp_status: "skipped",
    meta: {
      hold_id: holdId,
      contact_id: hold.contact_id,
      madre_changed: madre.changed,
      roster_changed: rosterChanged,
    },
  });

  return {
    ok: true,
    madre_changed: madre.changed,
    roster_changed: rosterChanged,
  };
}

export async function runGcFailGraceMaintenance(
  supabase: SupabaseClient,
): Promise<{ scanned: number; escalated: number; cleared: number; errors: string[] }> {
  const now = new Date().toISOString();
  const { data: holds, error } = await supabase
    .from("portal_family_payment_holds")
    .select("*")
    .eq("reason", GC_FAIL_REASON)
    .eq("status", "soft_hold")
    .lt("grace_deadline_at", now)
    .limit(50);
  if (error) {
    return { scanned: 0, escalated: 0, cleared: 0, errors: [error.message] };
  }

  let escalated = 0;
  let cleared = 0;
  const errors: string[] = [];
  for (const hold of holds || []) {
    try {
      const out = await escalateGcFailHoldToSeatBlock(supabase, hold);
      if (!out.ok) errors.push(out.error || "escalate_failed");
      else if ((out.madre_changed || 0) + (out.roster_changed || 0) > 0 || out.ok) {
        escalated += 1;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return {
    scanned: (holds || []).length,
    escalated,
    cleared,
    errors,
  };
}

async function restoreSeatsFromSnapshot(
  supabase: SupabaseClient,
  clientName: string,
  seats: Array<Record<string, unknown>>,
): Promise<{ roster: number; madre: number }> {
  const want = clean(clientName, 120);
  let roster = 0;
  for (const s of seats) {
    const id = clean(s.roster_id, 80);
    if (!id) continue;
    const { data: row } = await supabase
      .from("portal_roster_rows")
      .select("id, client_name")
      .eq("id", id)
      .maybeSingle();
    if (!row) continue;
    if (clean(row.client_name, 120).toUpperCase() !== HOLD_WAITLIST_CLIENT) continue;
    const { error } = await supabase
      .from("portal_roster_rows")
      .update({ client_name: want, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) roster += 1;
  }

  // MADRE: flip HOLD WAITLIST back to client where day/time/instructor/venue match snapshot.
  const { data: madreRow } = await supabase
    .from("portal_madre_document")
    .select("revision, document")
    .eq("term_key", "summer-2026")
    .maybeSingle();
  if (!madreRow?.document || !seats.length) return { roster, madre: 0 };

  const doc = madreRow.document as {
    weeks?: Array<{ staff?: Array<Record<string, unknown>> }>;
    meta?: Record<string, unknown>;
  };
  let madre = 0;
  const seatKeys = new Set(
    seats.map((s) =>
      [
        clean(s.day, 40).toLowerCase(),
        clean(s.time_slot, 80).toLowerCase(),
        clean(s.instructors, 80).toLowerCase(),
        clean(s.venue, 80).toLowerCase(),
      ].join("|"),
    ),
  );

  for (const week of doc.weeks || []) {
    for (const st of week.staff || []) {
      if (!st) continue;
      const staffKey = clean(st.staffKey, 40).toLowerCase();
      const days = Array.isArray(st.days) ? (st.days as Array<Record<string, unknown>>) : [];
      for (const day of days) {
        const weekday = clean(day.weekday, 40).toLowerCase();
        const slots = Array.isArray(day.slots)
          ? (day.slots as Array<Record<string, unknown>>)
          : [];
        for (const slot of slots) {
          if (clean(slot.client_name, 120).toUpperCase() !== HOLD_WAITLIST_CLIENT) continue;
          const key = [
            weekday,
            clean(slot.time_slot, 80).toLowerCase(),
            clean(slot.instructors || staffKey, 80).toLowerCase(),
            clean(slot.venue, 80).toLowerCase(),
          ].join("|");
          const keyAlt = [
            weekday,
            clean(slot.time_slot, 80).toLowerCase(),
            staffKey,
            clean(slot.venue, 80).toLowerCase(),
          ].join("|");
          if (!seatKeys.has(key) && !seatKeys.has(keyAlt)) continue;
          slot.client_name = want;
          madre += 1;
        }
      }
    }
  }

  if (madre > 0) {
    const prevRev = Number(madreRow.revision) || 0;
    const nextRev = prevRev + 1;
    doc.meta = doc.meta && typeof doc.meta === "object" ? doc.meta : {};
    const notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
    notes.push(`rev ${nextRev}: GC fail bank paid — restore ${want} from HOLD WAITLIST`);
    doc.meta.notes = notes;
    await supabase
      .from("portal_madre_document")
      .update({
        document: doc,
        revision: nextRev,
        updated_at: new Date().toISOString(),
      })
      .eq("term_key", "summer-2026")
      .eq("revision", prevRev);
  }

  return { roster, madre };
}

/** Clear GC-fail hold after bank/Tide/admin pay; restore HOLD WAITLIST seats when still free. */
export async function clearGcFailHoldOnPay(
  supabase: SupabaseClient,
  contactId: string,
  clearedVia: string,
  actorUserId?: string | null,
): Promise<{ cleared: boolean; restored?: boolean; roster?: number; madre?: number }> {
  const cid = clean(contactId, 120);
  if (!cid) return { cleared: false };
  const hold = await getOpenPaymentHold(supabase, cid);
  if (!hold) return { cleared: false };
  if (clean(hold.reason, 40) !== GC_FAIL_REASON) {
    return { cleared: false };
  }

  const child = clean(hold.held_client_name, 120);
  const seats = Array.isArray(hold.advance_buffer_lines)
    ? (hold.advance_buffer_lines as Array<Record<string, unknown>>)
    : [];
  let roster = 0;
  let madre = 0;
  if (child && seats.length && clean(hold.status, 40) === "session_held") {
    const restored = await restoreSeatsFromSnapshot(supabase, child, seats);
    roster = restored.roster;
    madre = restored.madre;
  }

  const out = await clearPaymentHoldForContact(supabase, cid, clearedVia, actorUserId);
  return {
    cleared: out.cleared,
    restored: roster + madre > 0 || out.restored,
    roster,
    madre,
  };
}

// silence unused stubs from earlier draft
void restoreMadreClientFromHoldWaitlist;
void restoreRosterClientFromHoldWaitlist;
