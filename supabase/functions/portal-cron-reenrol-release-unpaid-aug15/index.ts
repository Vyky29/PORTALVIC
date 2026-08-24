/**
 * portal-cron-reenrol-release-unpaid-aug15
 *
 * After end of Sat 15 Aug 2026 (Europe/London), auto-release MADRE seats for
 * families whose first Autumn bank payment is still unpaid so Booking Portal
 * can offer those slots.
 *
 * Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET) or admin JWT.
 * Cron: 0 23,0 * * * UTC — runs when London hour === 0 (or body.force).
 * Dry run: { "dry_run": true, "force": true }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyPortalAdminAccessToken } from "../_shared/portal_admin_auth.ts";
import {
  runUnpaidAug15PlaceRelease,
  UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
} from "../_shared/portal_reenrol_release_unpaid_aug15.ts";
import {
  runOfficeHoldSep1PlaceRelease,
  OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
} from "../_shared/portal_office_hold_release_sep1.ts";

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

function londonHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  }).format(d);
  return Number(h);
}

function londonDateIso(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const webhookSecret = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const gotSecret = req.headers.get("x-portal-webhook-secret") ?? "";
  const webhookOk = !!webhookSecret && gotSecret === webhookSecret;
  let adminOk = false;
  if (!webhookOk) {
    const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
    adminOk = verified.ok;
  }
  if (!webhookOk && !adminOk) {
    return json(403, { ok: false, error: "forbidden" });
  }

  let body: { force?: boolean; dry_run?: boolean } = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  const q = new URL(req.url).searchParams;
  if (q.get("force") === "1" || q.get("force") === "true") body.force = true;
  if (q.get("dry_run") === "1" || q.get("dry_run") === "true") body.dry_run = true;

  if (!body.force && londonHour() !== 0) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: "outside_london_midnight",
      london_hour: londonHour(),
      london_date: londonDateIso(),
      live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
    });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return json(500, { ok: false, error: "server_misconfigured" });

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await runUnpaidAug15PlaceRelease(admin, {
    force: !!body.force,
    dry_run: !!body.dry_run,
  });
  if (!result.ok) {
    console.error("[unpaid-aug15-release]", result.error);
    return json(500, result);
  }
  console.log(
    "[unpaid-aug15-release]",
    result.skipped ? "skipped" : result.dry_run ? "dry_run" : "applied",
    "candidates",
    result.candidates,
    "madre",
    result.madre_changed,
  );

  const sep1 = await runOfficeHoldSep1PlaceRelease(admin, {
    force: !!body.force,
    dry_run: !!body.dry_run,
  });
  if (!sep1.ok) {
    console.error("[office-hold-sep1-release]", sep1.error);
    return json(500, { unpaid_aug15: result, office_hold_sep1: sep1 });
  }
  console.log(
    "[office-hold-sep1-release]",
    sep1.skipped ? "skipped" : sep1.dry_run ? "dry_run" : "applied",
    "cases",
    sep1.cases?.length,
    "madre",
    sep1.madre_changed,
  );

  return json(200, {
    unpaid_aug15: result,
    office_hold_sep1: sep1,
    live_from_aug15: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
    live_from_sep1: OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
  });
});
