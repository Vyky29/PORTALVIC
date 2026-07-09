// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-absence-submit
// Parent reports Absent for a session → starts as Missed (proof optional within 14 days).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

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
    reason_text?: string;
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
  const reasonText = clean(body.reason_text, 800);

  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });
  if (!isIsoDate(sessionDate)) return json(400, { ok: false, error: "session_date_required" });
  if (!serviceLabel) return json(400, { ok: false, error: "service_label_required" });

  const today = todayIsoLondon();
  // Allow reporting for today / past / near future (next 21 days) — not far future.
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

  const proofDeadline = addDaysIso(sessionDate, 14);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("portal_parent_absence_reports")
    .select(
      "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_text, proof_deadline, created_at",
    )
    .eq("contact_id", contactId)
    .eq("session_date", sessionDate)
    .eq("service_label", serviceLabel)
    .maybeSingle();

  if (existing && (existing.status === "excused" || existing.status === "pending_review")) {
    return json(200, {
      ok: true,
      report: { ...existing, can_upload_proof: String(existing.proof_deadline || "") >= today },
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

  let inserted = existing;
  if (existing && (existing.status === "missed" || existing.status === "rejected")) {
    const { data: updated, error: updErr } = await supabase
      .from("portal_parent_absence_reports")
      .update({
        reason_text: reasonText || existing.reason_text,
        session_time: sessionTime || existing.session_time,
        participant_display: participantDisplay || existing.participant_display,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select(
        "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_text, proof_deadline, created_at",
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
        status: "missed",
        reason_text: reasonText,
        proof_deadline: proofDeadline,
        updated_at: now,
      })
      .select(
        "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_text, proof_deadline, created_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[parent-portal-absence-submit]", error.message);
      return json(500, { ok: false, error: "save_failed" });
    }
    inserted = created;
  }

  // Soft notify admin inbox (same channel as portal messages) — not a free-text absence flow.
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
      const bodyText =
        `Absent report: ${participantDisplay || "participant"} — ${sessionDate}` +
        (serviceLabel ? ` · ${serviceLabel}` : "") +
        (sessionTime ? ` · ${sessionTime}` : "") +
        `\nStatus: Missed session` +
        `\nProof deadline: ${proofDeadline}` +
        (reasonText ? `\nNote: ${reasonText}` : "");
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
      can_upload_proof: proofDeadline >= today,
    },
  });
});
