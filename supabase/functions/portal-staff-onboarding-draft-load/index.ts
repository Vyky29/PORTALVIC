import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  let body: { form_type?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const formType = String(body.form_type ?? "job").trim().toLowerCase();
  if (formType !== "job") {
    return json(400, { ok: false, error: "invalid_form_type" });
  }

  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await obAdmin
    .from("onboarding_applicant_drafts")
    .select("payload, updated_at")
    .eq("applicant_session_id", userId)
    .eq("form_type", formType)
    .maybeSingle();

  if (error) {
    console.error("[portal-staff-onboarding-draft-load]", error);
    return json(500, { ok: false, error: "load_failed" });
  }

  if (!data) {
    return json(200, { ok: true, draft: null });
  }

  return json(200, {
    ok: true,
    draft: {
      payload: data.payload ?? {},
      updated_at: data.updated_at ?? null,
    },
  });
});
