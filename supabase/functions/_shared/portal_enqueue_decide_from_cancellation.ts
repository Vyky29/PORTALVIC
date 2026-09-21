// @ts-nocheck — Edge / Deno shared helper.
//
// Queue Absents & credits Open(decide) from a staff cancellation_reports row
// (same decision queue as Schedule Cancelled).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SLUG_CONTACT: Record<string, string> = {
  abodi_pa: "155",
  abodi_p: "155",
  abodi: "155",
  adam_p: "354",
  adam_pi: "354",
  amaar_ah: "105",
  amar_rai: "130",
  amar_ra: "130",
  anas: "7560101",
  cyrus: "79",
  gabriel: "99",
  joelle: "406",
  junaid_f: "368",
  maiyar: "48",
  mia: "385",
  mia_mesi: "385",
  mia_m: "385",
  yamik: "gap-yamik-limbu",
  yassir: "119",
  yunis: "232",
};

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type StaffCancellationEnqueueInput = {
  cancellation_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  session_date: string;
  session_time?: string | null;
  service?: string | null;
  reason_category?: string | null;
  notes?: string | null;
  submitted_by_name?: string | null;
};

export type StaffCancellationEnqueueResult = {
  ok: boolean;
  skipped?: string;
  already_reported?: boolean;
  report_id?: string | null;
  error?: string;
};

async function resolveParticipant(
  admin: SupabaseClient,
  clientId: string,
  clientName: string,
) {
  const slug = clean(clientId, 80).toLowerCase();
  const display = clean(clientName, 160);

  async function byContactId(id: string) {
    if (!id) return null;
    const { data } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, parent_person_id")
      .eq("contact_id", id)
      .maybeSingle();
    return data?.contact_id && data?.parent_person_id ? data : null;
  }

  if (slug) {
    let hit = await byContactId(slug);
    if (hit) return hit;
    const mapped = SLUG_CONTACT[slug];
    if (mapped) {
      hit = await byContactId(mapped);
      if (hit) return hit;
    }
    const fromSlug = slug.replace(/_/g, " ").trim();
    if (fromSlug && fromSlug !== slug) {
      const { data: rows } = await admin
        .from("portal_participants")
        .select("contact_id, display_name, parent_person_id")
        .ilike("display_name", fromSlug + "%")
        .limit(3);
      const ok = (rows || []).filter((r) => r.contact_id && r.parent_person_id);
      if (ok.length === 1) return ok[0];
    }
  }

  if (display) {
    const { data: exact } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, parent_person_id")
      .ilike("display_name", display)
      .limit(1)
      .maybeSingle();
    if (exact?.contact_id && exact?.parent_person_id) return exact;
    if (display.indexOf(" ") < 0) {
      const { data: rows } = await admin
        .from("portal_participants")
        .select("contact_id, display_name, parent_person_id")
        .ilike("display_name", display + "%")
        .limit(3);
      const ok = (rows || []).filter((r) => r.contact_id && r.parent_person_id);
      if (ok.length === 1) return ok[0];
    }
  }

  return null;
}

function serviceLabel(service: string, sessionTime: string): string {
  const bits = [clean(service, 80) || "Session", clean(sessionTime, 40)].filter(Boolean);
  return bits.join(" · ").slice(0, 160) || "Session";
}

/**
 * Insert / reuse a pending_review cancellation row in portal_parent_absence_reports.
 */
export async function enqueueDecideFromStaffCancellation(
  admin: SupabaseClient,
  input: StaffCancellationEnqueueInput,
): Promise<StaffCancellationEnqueueResult> {
  const sessionDate = clean(input.session_date, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { ok: false, error: "session_date_required" };
  }

  const pax = await resolveParticipant(
    admin,
    clean(input.client_id, 80),
    clean(input.client_name, 160),
  );
  if (!pax?.contact_id || !pax.parent_person_id) {
    return {
      ok: false,
      skipped: "no_participant",
      error: "no_participant",
    };
  }

  const svc = serviceLabel(clean(input.service, 80), clean(input.session_time, 40));
  const reasonCat = clean(input.reason_category, 120) || "Other";
  const notes = clean(input.notes, 400);
  const byWho = clean(input.submitted_by_name, 80);
  const reasonText = [
    "Staff cancel",
    byWho ? `(${byWho})` : "",
    "·",
    reasonCat,
    notes ? `— ${notes}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);

  const { data: existing } = await admin
    .from("portal_parent_absence_reports")
    .select("id, status, case_kind")
    .eq("contact_id", pax.contact_id)
    .eq("session_date", sessionDate)
    .eq("service_label", svc)
    .maybeSingle();

  if (existing && (existing.status === "excused" || existing.status === "pending_review")) {
    return {
      ok: true,
      already_reported: true,
      report_id: existing.id,
    };
  }

  const now = new Date().toISOString();
  const payload = {
    reason_code: "instructor_cancelled",
    source: "staff_cancellation",
    case_kind: "cancellation",
    cancellation_report_id: clean(input.cancellation_id, 60) || null,
    created_by_staff_name: byWho || null,
  };

  const rowFields = {
    parent_person_id: pax.parent_person_id,
    contact_id: pax.contact_id,
    participant_display: pax.display_name || clean(input.client_name, 160),
    session_date: sessionDate,
    service_label: svc,
    session_time: clean(input.session_time, 40),
    status: "pending_review",
    case_kind: "cancellation",
    reason_code: "instructor_cancelled",
    reason_text: reasonText,
    proof_deadline: addDaysIso(sessionDate, 14),
    payload,
    updated_at: now,
  };

  if (existing && ["noted", "missed", "rejected", "expired"].includes(String(existing.status))) {
    const { data: updated, error: uErr } = await admin
      .from("portal_parent_absence_reports")
      .update(rowFields)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();
    if (uErr) {
      console.error("[enqueueDecideFromStaffCancellation] update", uErr.message);
      return { ok: false, error: "save_failed" };
    }
    return { ok: true, report_id: updated?.id || existing.id };
  }

  const { data: created, error } = await admin
    .from("portal_parent_absence_reports")
    .insert({
      ...rowFields,
      created_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[enqueueDecideFromStaffCancellation] insert", error.message);
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, report_id: created?.id || null };
}
