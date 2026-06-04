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

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const jwt = bearerUserJwt(req);
  if (!jwt) return json(401, { ok: false, error: "unauthorized" });

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!portalUrl || !portalService) {
    return json(500, { ok: false, error: "misconfigured" });
  }

  const portalAdmin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await portalAdmin.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const userId = String(userData.user.id);
  if (!UUID_RE.test(userId)) {
    return json(400, { ok: false, error: "invalid_user" });
  }

  let job = false;
  let health = false;

  const { data: healthRow } = await portalAdmin
    .from("staff_health_questionnaire_drafts")
    .select("submitted_at")
    .eq("staff_session_id", userId)
    .maybeSingle();

  if (healthRow?.submitted_at) {
    health = true;
  }

  if (obUrl && obService) {
    const obAdmin = createClient(obUrl, obService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: drafts } = await obAdmin
      .from("onboarding_applicant_drafts")
      .select("form_type, payload")
      .eq("applicant_session_id", userId);

    for (const row of drafts ?? []) {
      const ft = String(row.form_type ?? "").toLowerCase();
      if (ft === "job") job = true;
      if (ft === "health") health = true;
    }
  }

  return json(200, {
    ok: true,
    applicant_session_id: userId,
    job,
    health,
    onboarding_configured: !!(obUrl && obService),
  });
});
