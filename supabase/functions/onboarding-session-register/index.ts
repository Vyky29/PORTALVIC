import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: { applicant_session_id?: string; portal_staff_name?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const sid = String(body.applicant_session_id ?? "").trim();
  const name = String(body.portal_staff_name ?? "").trim().slice(0, 200);
  if (!UUID_RE.test(sid)) {
    return json(400, { ok: false, error: "invalid_session_id" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("onboarding_applicant_sessions").upsert({
    applicant_session_id: sid,
    portal_staff_name: name || null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[onboarding-session-register]", error);
    return json(500, { ok: false, error: "save_failed" });
  }

  return json(200, { ok: true });
});
