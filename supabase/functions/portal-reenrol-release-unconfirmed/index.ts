/**
 * portal-reenrol-release-unconfirmed
 * Force / inspect post-deadline MADRE seat release for Autumn booking accuracy.
 *
 * POST { "force": true } — apply even before live-from date (office use).
 * GET/POST without force — apply only when London date >= 2026-07-23.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders } from "../_shared/parent_portal_auth.ts";
import { ensureReenrolUnconfirmedReleasedOnMadre } from "../_shared/portal_reenrol_release_madre.ts";

const CORS = {
  ...parentPortalCorsHeaders,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  let force = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      force = !!(body && body.force);
    } catch {
      /* empty body ok */
    }
  }
  const q = new URL(req.url).searchParams.get("force");
  if (q === "1" || q === "true") force = true;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await ensureReenrolUnconfirmedReleasedOnMadre(admin, { force });
  if (!result.ok) return json(500, result);
  return json(200, result);
});
