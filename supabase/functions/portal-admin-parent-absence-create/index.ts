// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-absence-create
// Office records an Absent when a parent phones in (instead of parent self-serve).
//
// Deploy:
//   npx supabase functions deploy portal-admin-parent-absence-create --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const REASON_LABELS: Record<string, string> = {
  other_commitments: "Other commitments",
  party: "Party",
  holidays: "Holidays",
  travel: "Travel",
  birthday: "Birthday",
  unwell: "Unwell",
  instructor_cancelled: "Instructor cancelled",
  bank_holiday: "Bank holiday",
  strike: "Strike / disruption",
  office_other: "Office note",
  club_cancelled: "Club cancelled session",
  pool_closed: "Pool / venue closed",
  facility: "Facility issue",
};

const NON_MISSED = new Set([
  "other_commitments",
  "party",
  "holidays",
  "travel",
  "birthday",
  "instructor_cancelled",
  "bank_holiday",
  "strike",
  "office_other",
]);

const CANCELLATION_REASONS = new Set([
  "club_cancelled",
  "pool_closed",
  "facility",
  "instructor_cancelled",
  "bank_holiday",
  "strike",
]);

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function resolveStatus(reasonCode: string): string {
  if (NON_MISSED.has(reasonCode)) return "noted";
  if (reasonCode === "unwell") return "missed";
  return "missed";
}

const KNOWN_VENUES = ["SwimFarm", "Northolt", "Acton", "Westway", "Hub"];

function venueFromServiceLabel(label: string): string {
  const raw = String(label || "");
  for (let i = 0; i < KNOWN_VENUES.length; i++) {
    const v = KNOWN_VENUES[i];
    if (new RegExp("\\b" + v + "\\b", "i").test(raw)) return v;
  }
  const parts = raw.split(/\s*[·|/]\s*/);
  const last = clean(parts[parts.length - 1] || "", 40);
  if (!last || last.length > 24) return "";
  if (/activity|programme|program|centre|center|session|day/i.test(last)) return "";
  return last;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactIdRaw = clean(body.contact_id, 120);
  const rosterSlug = clean(body.roster_slug || body.anchor_client_id, 120);
  let contactId = contactIdRaw;
  let parentPersonId = clean(body.parent_person_id, 120);
  let participantDisplay = clean(body.participant_display, 160);
  const sessionDate = clean(body.session_date, 12);
  const serviceLabel = clean(body.service_label, 160);
  const sessionTime = clean(body.session_time, 40);
  const reasonCode = clean(body.reason_code, 40).toLowerCase().replace(/\s+/g, "_");
  const reasonNote = clean(body.reason_text, 800);
  const statusOverride = clean(body.status, 20).toLowerCase();
  const scheduleOverrideId = clean(body.schedule_override_id, 60) || null;
  let caseKind = clean(body.case_kind, 20).toLowerCase() || "absence";
  if (caseKind !== "absence" && caseKind !== "cancellation") caseKind = "absence";
  // Cancellation reasons force the shared decision queue (pending_review, no proof).
  if (CANCELLATION_REASONS.has(reasonCode) && clean(body.case_kind, 20) === "cancellation") {
    caseKind = "cancellation";
  }
  if (caseKind === "cancellation" && !CANCELLATION_REASONS.has(reasonCode)) {
    // Still allow office_other as cancellation when explicitly flagged.
    if (reasonCode !== "office_other") {
      return portalAdminJson(400, { ok: false, error: "cancellation_reason_required" });
    }
  }

  if (!isIsoDate(sessionDate)) {
    return portalAdminJson(400, { ok: false, error: "session_date_required" });
  }
  if (!serviceLabel) {
    return portalAdminJson(400, { ok: false, error: "service_label_required" });
  }
  if (!REASON_LABELS[reasonCode]) {
    return portalAdminJson(400, { ok: false, error: "reason_code_required" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  async function loadPax(id: string) {
    if (!id) return null;
    const { data } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, parent_person_id")
      .eq("contact_id", id)
      .maybeSingle();
    return data;
  }

  if (!contactId && rosterSlug) contactId = rosterSlug;
  let pax = contactId ? await loadPax(contactId) : null;
  if (!pax && contactId && SLUG_CONTACT[contactId.toLowerCase()]) {
    pax = await loadPax(SLUG_CONTACT[contactId.toLowerCase()]);
    if (pax) contactId = pax.contact_id;
  }
  if (!pax && rosterSlug && SLUG_CONTACT[rosterSlug.toLowerCase()]) {
    pax = await loadPax(SLUG_CONTACT[rosterSlug.toLowerCase()]);
    if (pax) contactId = pax.contact_id;
  }
  if (!pax && (rosterSlug || contactIdRaw)) {
    const guess = clean(rosterSlug || contactIdRaw, 80).replace(/_/g, " ");
    if (guess) {
      const { data: rows } = await admin
        .from("portal_participants")
        .select("contact_id, display_name, parent_person_id")
        .ilike("display_name", guess + "%")
        .limit(3);
      const ok = (rows || []).filter((r) => r.contact_id && r.parent_person_id);
      if (ok.length === 1) {
        pax = ok[0];
        contactId = pax.contact_id;
      }
    }
  }
  if (pax) {
    contactId = pax.contact_id;
    parentPersonId = parentPersonId || clean(pax.parent_person_id, 120);
    participantDisplay = participantDisplay || clean(pax.display_name, 160);
  }

  if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });

  if (!parentPersonId || !participantDisplay) {
    const { data: p } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, parent_person_id")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (p) {
      parentPersonId = parentPersonId || clean(p.parent_person_id, 120);
      participantDisplay = participantDisplay || clean(p.display_name, 160);
    }
  }
  if (!parentPersonId || !participantDisplay) {
    const { data: c } = await admin
      .from("portal_parent_contacts")
      .select("contact_id, parent_person_id, child_display")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (c) {
      parentPersonId = parentPersonId || clean(c.parent_person_id, 120);
      participantDisplay = participantDisplay || clean(c.child_display, 160);
    }
  }

  if (!parentPersonId) {
    return portalAdminJson(400, {
      ok: false,
      error: "parent_person_id_required",
      message: "Could not resolve parent for this participant.",
    });
  }

  let status = resolveStatus(reasonCode);
  if (statusOverride === "missed" || statusOverride === "noted" || statusOverride === "pending_review") {
    status = statusOverride;
  }
  if (caseKind === "cancellation") {
    // Same Absents & credits queue — awaiting office credit/refund/makeup decision.
    status = "pending_review";
  }
  // Schedule & Covers announced absent → decision queue (no parent proof required).
  if (
    caseKind === "absence" &&
    scheduleOverrideId &&
    (statusOverride === "pending_review" || statusOverride === "missed" || !statusOverride)
  ) {
    status = "pending_review";
  }

  const proofDeadline = addDaysIso(sessionDate, 14);
  const now = new Date().toISOString();
  const reasonLabel = REASON_LABELS[reasonCode];
  const sourceLabel = caseKind === "cancellation" ? "Office cancel" : "Office phone";
  const reasonText = reasonNote
    ? `${sourceLabel} · ${reasonLabel} — ${reasonNote}`
    : `${sourceLabel} · ${reasonLabel}`;

  const { data: existing } = await admin
    .from("portal_parent_absence_reports")
    .select("id, status, proof_deadline, case_kind")
    .eq("contact_id", contactId)
    .eq("session_date", sessionDate)
    .eq("service_label", serviceLabel)
    .maybeSingle();

  if (existing && (existing.status === "excused" || existing.status === "pending_review")) {
    return portalAdminJson(200, {
      ok: true,
      report: existing,
      already_reported: true,
    });
  }

  const payloadExtra = {
    reason_code: reasonCode,
    source:
      caseKind === "cancellation"
        ? scheduleOverrideId
          ? "schedule_covers"
          : "office_cancel"
        : scheduleOverrideId
          ? "schedule_covers_absent"
          : "office_phone",
    case_kind: caseKind,
    schedule_override_id: scheduleOverrideId,
    created_by_admin: verified.userId || null,
  };

  const rowFields = {
    reason_code: reasonCode,
    reason_text: reasonText,
    status,
    case_kind: caseKind,
    session_time: sessionTime || "",
    participant_display: participantDisplay || "",
    proof_deadline: proofDeadline,
    payload: payloadExtra,
    schedule_override_id: scheduleOverrideId,
    updated_at: now,
  };

  if (existing && ["noted", "missed", "rejected", "expired"].includes(String(existing.status))) {
    const { data: updated, error: updErr } = await admin
      .from("portal_parent_absence_reports")
      .update(rowFields)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (updErr) {
      console.error("[portal-admin-parent-absence-create] update", updErr.message);
      return portalAdminJson(500, { ok: false, error: "save_failed" });
    }
    const grant = await openNotedMakeupGrant(admin, updated, verified.userId || null, now);
    return portalAdminJson(200, { ok: true, report: updated, updated: true, grant });
  }

  const { data: created, error } = await admin
    .from("portal_parent_absence_reports")
    .insert({
      parent_person_id: parentPersonId,
      contact_id: contactId,
      participant_display: participantDisplay,
      session_date: sessionDate,
      service_label: serviceLabel,
      session_time: sessionTime,
      ...rowFields,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[portal-admin-parent-absence-create]", error.message);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  const grant = await openNotedMakeupGrant(admin, created, verified.userId || null, now);
  return portalAdminJson(200, { ok: true, report: created, grant });
});

/**
 * Office-phone noted absence (party, holidays, travel, other commitments):
 * open the makeup grant immediately. Unwell still waits for proof.
 * Club cancellations stay in the decide queue.
 */
async function openNotedMakeupGrant(
  admin: ReturnType<typeof createClient>,
  report: {
    id?: string;
    status?: string;
    case_kind?: string;
    parent_person_id?: string;
    contact_id?: string;
    participant_display?: string;
    service_label?: string;
    schedule_override_id?: string | null;
  } | null,
  userId: string | null,
  now: string,
) {
  if (!report || !report.id) return null;
  if (String(report.status || "") !== "noted") return null;
  if (String(report.case_kind || "") === "cancellation") return null;
  if (report.schedule_override_id) return null;
  const venue = venueFromServiceLabel(String(report.service_label || ""));
  if (!venue || !report.parent_person_id || !report.contact_id) return null;
  const { data: existing } = await admin
    .from("portal_parent_makeup_grants")
    .select("id, status, preferred_venue")
    .eq("absence_report_id", report.id)
    .maybeSingle();
  if (existing) return existing;
  const { data: grant, error } = await admin
    .from("portal_parent_makeup_grants")
    .insert({
      parent_person_id: report.parent_person_id,
      contact_id: report.contact_id,
      participant_display: report.participant_display || "",
      absence_report_id: report.id,
      preferred_venue: venue,
      service_label: report.service_label || "",
      status: "open",
      source: "no_proof",
      notes: "Office phone · makeup opened automatically",
      created_by: userId,
      updated_at: now,
    })
    .select("id, status, preferred_venue, service_label")
    .maybeSingle();
  if (error) {
    console.error("[portal-admin-parent-absence-create] makeup grant", error.message);
    return null;
  }
  await admin
    .from("portal_parent_absence_reports")
    .update({
      outcome: "makeup",
      outcome_notes: "Makeup grant opened automatically",
      updated_at: now,
    })
    .eq("id", report.id);
  return grant;
}
