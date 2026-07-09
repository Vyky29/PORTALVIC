// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-narrative-audit
// -----------------------------
// Append staff session narrative on submit (backup when DB column missing).
//
// POST JSON:
//   narrative_en, participant_name?, participant_gender?, session_date?, service?,
//   portal_session_key?, session_feedback_id?, filter_positive?, filter_relevant?
//
// Auth: active portal staff JWT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";
import { logSessionFeedbackNarrativeAudit } from "../_shared/session_feedback_narrative_audit.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({ ok: true, service: "portal-feedback-narrative-audit" });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const staff = await verifyPortalStaff(req);
  if (!staff.ok) {
    return json({ ok: false, error: staff.error }, staff.status);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const narrative = str(body.narrative_en, 12000);
  if (narrative.length < 8) {
    return json({ ok: false, error: "narrative_too_short" }, 400);
  }

  await logSessionFeedbackNarrativeAudit({
    source: "feedback_submit",
    staffUserId: staff.userId,
    staffDisplayName: staff.fullName,
    participantName: str(body.participant_name, 200),
    participantGender: str(body.participant_gender, 8),
    sessionDate: str(body.session_date, 10),
    service: str(body.service, 200),
    portalSessionKey: str(body.portal_session_key, 500),
    narrativeEn: narrative,
    filterPositive: str(body.filter_positive, 4000),
    filterRelevant: str(body.filter_relevant, 4000),
    filterStatus: "submit",
    sessionFeedbackId: str(body.session_feedback_id, 64),
    meta:
      body.meta && typeof body.meta === "object"
        ? (body.meta as Record<string, unknown>)
        : {},
  });

  return json({ ok: true });
});
