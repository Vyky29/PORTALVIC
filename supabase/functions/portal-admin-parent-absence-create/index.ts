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

  const contactId = clean(body.contact_id, 120);
  let parentPersonId = clean(body.parent_person_id, 120);
  let participantDisplay = clean(body.participant_display, 160);
  const sessionDate = clean(body.session_date, 12);
  const serviceLabel = clean(body.service_label, 160);
  const sessionTime = clean(body.session_time, 40);
  const reasonCode = clean(body.reason_code, 40).toLowerCase().replace(/\s+/g, "_");
  const reasonNote = clean(body.reason_text, 800);
  const statusOverride = clean(body.status, 20).toLowerCase();

  if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });
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
  if (statusOverride === "missed" || statusOverride === "noted") {
    status = statusOverride;
  }

  const proofDeadline = addDaysIso(sessionDate, 14);
  const now = new Date().toISOString();
  const reasonLabel = REASON_LABELS[reasonCode];
  const reasonText = reasonNote
    ? `Office phone · ${reasonLabel} — ${reasonNote}`
    : `Office phone · ${reasonLabel}`;

  const { data: existing } = await admin
    .from("portal_parent_absence_reports")
    .select("id, status, proof_deadline")
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
    source: "office_phone",
    created_by_admin: verified.userId || null,
  };

  const rowFields = {
    reason_code: reasonCode,
    reason_text: reasonText,
    status,
    session_time: sessionTime || "",
    participant_display: participantDisplay || "",
    proof_deadline: proofDeadline,
    payload: payloadExtra,
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
    return portalAdminJson(200, { ok: true, report: updated, updated: true });
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

  return portalAdminJson(200, { ok: true, report: created });
});
