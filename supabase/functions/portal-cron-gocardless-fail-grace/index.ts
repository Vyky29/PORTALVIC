// @ts-nocheck — Edge Function (Deno).
//
// portal-cron-gocardless-fail-grace
// Every few minutes: escalate expired GC-fail bank windows → HOLD WAITLIST seats.
//
// Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET) or admin JWT.
// Suggested cron: */5 * * * *

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyPortalAdminAccessToken } from "../_shared/portal_admin_auth.ts";
import {
  handleGcPaymentsFailedBatch,
  runGcFailGraceMaintenance,
} from "../_shared/portal_gocardless_fail_grace.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  const hdrSecret = (req.headers.get("x-portal-webhook-secret") || "").trim();
  let ok = !!(secret && hdrSecret && secret === hdrSecret);
  if (!ok) {
    const auth = await verifyPortalAdminAccessToken(req);
    ok = !!(auth && auth.ok);
  }
  if (!ok) return json(401, { ok: false, error: "unauthorized" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body && body.action === "open_fail_batch" && Array.isArray(body.events)) {
      const result = await handleGcPaymentsFailedBatch(admin, body.events);
      return json(200, { ok: true, ...result });
    }
    const result = await runGcFailGraceMaintenance(admin);
    return json(200, { ok: true, ...result });
  } catch (e) {
    console.error("[portal-cron-gocardless-fail-grace]", e);
    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
