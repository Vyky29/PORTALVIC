// @ts-nocheck — Edge Function (Deno).
//
// portal-cron-own-arrangement-buffer-check
// Daily: soft-hold own-arrangement families below prepaid buffer; clear soft_hold when restored.
// Never auto hold_session / hard_cut.
//
// Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET) or admin JWT.
// Cron: 0 5,6 * * * UTC — runs only when Europe/London hour is 6 (or body.force).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyPortalAdminAccessToken } from "../_shared/portal_admin_auth.ts";
import { refreshBufferHoldState } from "../_shared/portal_payment_holds.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";

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

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function londonHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  }).format(d);
  return Number(h);
}

function isOwnArrangementPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const funding = (payload as Record<string, unknown>).funding;
  if (!funding || typeof funding !== "object") return false;
  const c = (funding as Record<string, unknown>).choices_2627;
  if (!c || typeof c !== "object") return false;
  return clean((c as Record<string, unknown>).payment_method_code, 40) === "own_way_flexible";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

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

  let body: { force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!body.force && londonHour() !== 6) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: "outside_london_6am",
      london_hour: londonHour(),
    });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return json(500, { ok: false, error: "server_misconfigured" });

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: subs, error } = await admin
    .from("portal_re_enrolment_submissions")
    .select("participant_contact_id, payload, submitted_at")
    .eq("academic_year", REENROL_ACADEMIC_YEAR)
    .order("submitted_at", { ascending: false })
    .limit(800);

  if (error) {
    console.error("[buffer-cron] list", error.message);
    return json(500, { ok: false, error: "list_failed" });
  }

  const seen = new Set<string>();
  const contactIds: string[] = [];
  for (const row of subs || []) {
    const cid = clean(row.participant_contact_id, 120);
    if (!cid || seen.has(cid)) continue;
    if (!isOwnArrangementPayload(row.payload)) continue;
    seen.add(cid);
    contactIds.push(cid);
  }

  let softHeld = 0;
  let cleared = 0;
  let withinBuffer = 0;
  let skippedHeld = 0;
  const errors: string[] = [];

  for (const cid of contactIds) {
    try {
      const out = await refreshBufferHoldState(admin, cid, null);
      if (out.action === "soft_hold") softHeld += 1;
      else if (out.action === "cleared") cleared += 1;
      else if (out.action === "skipped_session_held") skippedHeld += 1;
      else withinBuffer += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[buffer-cron]", cid, msg);
      errors.push(`${cid}: ${msg}`);
    }
  }

  return json(200, {
    ok: true,
    checked: contactIds.length,
    soft_held: softHeld,
    cleared,
    within_buffer: withinBuffer,
    skipped_session_held: skippedHeld,
    errors: errors.slice(0, 20),
  });
});
