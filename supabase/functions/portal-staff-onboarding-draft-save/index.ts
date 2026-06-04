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

const MAX_PAYLOAD_BYTES = 450_000;

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
  if (!obUrl || !obService) {
    return json(503, { ok: false, error: "onboarding_not_configured" });
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

  let body: {
    form_type?: string;
    payload?: Record<string, unknown>;
    portal_staff_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const formType = String(body.form_type ?? "").trim().toLowerCase();
  if (formType !== "job") {
    return json(400, { ok: false, error: "invalid_form_type" });
  }

  const payload = body.payload && typeof body.payload === "object"
    ? { ...body.payload }
    : {};
  const staffName = String(body.portal_staff_name ?? "").trim().slice(0, 200);
  if (staffName) {
    const meta = payload._portal && typeof payload._portal === "object"
      ? { ...(payload._portal as Record<string, unknown>) }
      : {};
    meta.staff_name = staffName;
    payload._portal = meta;
  }

  const raw = JSON.stringify(payload);
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json(413, { ok: false, error: "payload_too_large" });
  }

  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await obAdmin.from("onboarding_applicant_drafts").upsert({
    applicant_session_id: userId,
    form_type: formType,
    payload,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[portal-staff-onboarding-draft-save]", error);
    return json(500, { ok: false, error: "save_failed" });
  }

  if (staffName) {
    await obAdmin.from("onboarding_applicant_sessions").upsert({
      applicant_session_id: userId,
      portal_staff_name: staffName,
      updated_at: new Date().toISOString(),
    });
  }

  return json(200, { ok: true });
});
