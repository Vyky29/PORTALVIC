import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

type SignedUrlBody = {
  path?: string;
  bucket?: string;
  source?: string;
};

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

  let body: SignedUrlBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const path = String(body.path || "").trim().replace(/^\/+/, "");
  const bucket = String(body.bucket || "documents").trim() || "documents";
  if (!path) {
    return portalAdminJson(400, { ok: false, error: "missing_path" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const source = String(body.source || "portal").trim().toLowerCase();
  const useOnboarding = source === "onboarding" && obUrl && obService;
  const client = createClient(useOnboarding ? obUrl : baseUrl, useOnboarding ? obService : serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    console.error("[portal-admin-hr-file-signed-url]", error?.message || "no_signed_url");
    return portalAdminJson(404, { ok: false, error: "signed_url_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    signed_url: data.signedUrl,
    bucket,
    path,
  });
});
