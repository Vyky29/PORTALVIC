// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-absence-submit
// Parent reports Absent:
// - other_commitments / party / holidays / travel / birthday → status "noted" (NOT Missed)
// - unwell + can_prove=false → "missed"
// - unwell + can_prove=true (proof uploaded separately) → usually created as "missed" then proof upload → pending_review

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

const REASON_LABELS: Record<string, string> = {
  other_commitments: "Other commitments",
  party: "Party",
  holidays: "Holidays",
  travel: "Travel",
  birthday: "Birthday",
  unwell: "Unwell",
};

const NON_MISSED = new Set([
  "other_commitments",
  "party",
  "holidays",
  "travel",
  "birthday",
]);

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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

function todayIsoLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function resolveStatus(reasonCode: string, canProve: boolean): string {
  if (NON_MISSED.has(reasonCode)) return "noted";
  if (reasonCode === "unwell") return "missed";
  return "missed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: {
    contact_id?: string;
    session_date?: string;
    service_label?: string;
    session_time?: string;
    reason_code?: string;
    reason_text?: string;
    can_prove?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: "bad_json" });
  }

  const contactId = clean(body.contact_id, 120);
  const sessionDate = clean(body.session_date, 12);
  const serviceLabel = clean(body.service_label, 160);
  const sessionTime = clean(body.session_time, 40);
  const reasonCode = clean(body.reason_code, 40).toLowerCase().replace(/\s+/g, "_");
  const reasonNote = clean(body.reason_text, 800);
  const canProve = !!body.can_prove;

  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });
  if (!isIsoDate(sessionDate)) return json(400, { ok: false, error: "session_date_required" });
  if (!serviceLabel) return json(400, { ok: false, error: "service_label_required" });
  if (!REASON_LABELS[reasonCode]) {
    return json(400, { ok: false, error: "reason_code_required" });
  }
  if (reasonCode === "unwell" && canProve === undefined) {
    /* can_prove optional; default false → missed */
  }

  const today = todayIsoLondon();
  const maxFuture = addDaysIso(today, 21);
  if (sessionDate > maxFuture) {
    return json(400, { ok: false, error: "session_date_too_far" });
  }

  let participantDisplay = "";
  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (participant) {
    participantDisplay = clean(participant.display_name, 160);
  } else {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id, child_display")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
    participantDisplay = clean(fallback.data.child_display, 160);
  }

  const status = resolveStatus(reasonCode, canProve);
  const proofDeadline = addDaysIso(sessionDate, 14);
  const now = new Date().toISOString();
  const reasonLabel = REASON_LABELS[reasonCode];
  const reasonText = reasonNote
    ? `${reasonLabel} — ${reasonNote}`
    : reasonLabel;

  const { data: existing } = await supabase
    .from("portal_parent_absence_reports")
    .select(
      "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_code, reason_text, proof_deadline, created_at",
    )
    .eq("contact_id", contactId)
    .eq("session_date", sessionDate)
    .eq("service_label", serviceLabel)
    .maybeSingle();

  if (existing && (existing.status === "excused" || existing.status === "pending_review")) {
    return json(200, {
      ok: true,
      report: {
        ...existing,
        can_upload_proof:
          existing.status === "pending_review" &&
          String(existing.proof_deadline || "") >= today,
      },
      already_reported: true,
    });
  }

  if (existing && existing.status === "expired") {
    return json(403, {
      ok: false,
      error: "proof_window_closed",
      message:
        "The 2-week window to upload proof has passed. Please contact the office/admin.",
      report: { ...existing, can_upload_proof: false },
    });
  }

  const payloadExtra = {
    reason_code: reasonCode,
    can_prove: reasonCode === "unwell" ? canProve : false,
    expects_proof: reasonCode === "unwell" && canProve,
  };

  let inserted = existing;
  const rowFields = {
    reason_code: reasonCode,
    reason_text: reasonText,
    status,
    session_time: sessionTime || existing?.session_time || "",
    participant_display: participantDisplay || existing?.participant_display || "",
    proof_deadline: proofDeadline,
    payload: payloadExtra,
    updated_at: now,
  };

  if (existing && ["noted", "missed", "rejected"].includes(String(existing.status))) {
    const { data: updated, error: updErr } = await supabase
      .from("portal_parent_absence_reports")
      .update(rowFields)
      .eq("id", existing.id)
      .select(
        "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_code, reason_text, proof_deadline, created_at",
      )
      .maybeSingle();
    if (updErr) {
      console.error("[parent-portal-absence-submit] update", updErr.message);
      return json(500, { ok: false, error: "save_failed" });
    }
    inserted = updated;
  } else {
    const { data: created, error } = await supabase
      .from("portal_parent_absence_reports")
      .insert({
        parent_person_id: session.parent_person_id,
        contact_id: contactId,
        participant_display: participantDisplay,
        session_date: sessionDate,
        service_label: serviceLabel,
        session_time: sessionTime,
        ...rowFields,
      })
      .select(
        "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_code, reason_text, proof_deadline, created_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[parent-portal-absence-submit]", error.message);
      return json(500, { ok: false, error: "save_failed" });
    }
    inserted = created;
  }

  try {
    const { data: parentMeta } = await supabase
      .from("portal_parent_contacts")
      .select("parent_display, mobile")
      .eq("parent_person_id", session.parent_person_id)
      .limit(1)
      .maybeSingle();
    const phone = normalizeParentPhoneE164(String(parentMeta?.mobile || "").trim());
    if (phone) {
      const parentName = clean(parentMeta?.parent_display, 120) || "Parent";
      const statusLine =
        status === "noted"
          ? "Noted (not a Missed session)"
          : status === "missed"
          ? "Missed session"
          : status;
      const bodyText =
        `Absent report: ${participantDisplay || "participant"} — ${sessionDate}` +
        (serviceLabel ? ` · ${serviceLabel}` : "") +
        (sessionTime ? ` · ${sessionTime}` : "") +
        `\nReason: ${reasonText}` +
        `\nStatus: ${statusLine}` +
        (status === "missed" ? `\nProof deadline: ${proofDeadline}` : "") +
        (canProve && reasonCode === "unwell" ? "\nParent will upload proof." : "");
      await supabase.from("portal_parent_whatsapp_inbound").insert({
        wa_message_id: `app:absence:${inserted?.id || crypto.randomUUID()}`,
        from_phone: phone,
        contact_name: parentName,
        message_type: "text",
        body_text: bodyText,
        context_wa_id: null,
        created_at: now,
        meta: {
          source: "parent_portal_absence",
          parent_person_id: session.parent_person_id,
          contact_id: contactId,
          participant_display: participantDisplay,
          absence_report_id: inserted?.id || null,
          reason_code: reasonCode,
          status,
        },
      });
    }
  } catch (e) {
    console.error("[parent-portal-absence-submit] inbox notify", e);
  }

  return json(200, {
    ok: true,
    report: {
      ...inserted,
      can_upload_proof: status === "missed" && canProve && proofDeadline >= today,
      expects_proof: reasonCode === "unwell" && canProve,
    },
  });
});
