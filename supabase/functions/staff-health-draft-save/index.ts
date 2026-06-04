import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildMakeOnboardingBody,
  postMakeOnboardingWebhook,
} from "../_shared/onboarding_make_webhook.ts";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_PAYLOAD_BYTES = 900_000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "misconfigured" });
  }

  let body: {
    staff_session_id?: string;
    payload?: Record<string, unknown>;
    staff_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const sid = String(body.staff_session_id ?? "").trim();
  if (!UUID_RE.test(sid)) {
    return json(400, { ok: false, error: "invalid_session_id" });
  }

  const payload = body.payload && typeof body.payload === "object"
    ? { ...body.payload }
    : {};
  const staffName = String(body.staff_name ?? "").trim().slice(0, 200);
  const raw = JSON.stringify(payload);
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json(413, { ok: false, error: "payload_too_large" });
  }

  const portal = payload._portal && typeof payload._portal === "object"
    ? (payload._portal as Record<string, unknown>)
    : {};
  const submittedAt = portal.submitted_at
    ? String(portal.submitted_at)
    : null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row: Record<string, unknown> = {
    staff_session_id: sid,
    staff_name: staffName || null,
    payload,
    updated_at: new Date().toISOString(),
  };
  if (submittedAt) row.submitted_at = submittedAt;

  const { error } = await admin.from("staff_health_questionnaire_drafts").upsert(row);

  if (error) {
    console.error("[staff-health-draft-save]", error);
    const msg = String(error.message || "");
    if (msg.includes("staff_health_questionnaire_drafts")) {
      return json(500, { ok: false, error: "table_missing" });
    }
    return json(500, { ok: false, error: "save_failed" });
  }

  if (submittedAt) {
    const webhookUrl = (Deno.env.get("ONBOARDING_HEALTH_QUESTIONNAIRE_MAKE_WEBHOOK_URL") ??
      "").trim();
    await postMakeOnboardingWebhook(
      webhookUrl,
      buildMakeOnboardingBody("health", sid, staffName, payload),
    );
  }

  return json(200, { ok: true });
});
