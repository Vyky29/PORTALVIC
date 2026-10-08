// @ts-nocheck — Edge Function (Deno).
//
// portal-cron-funder-invoice-mail
// London morning: day 20 sends NHS invoices, day 25 sends H&F and NHS/ILA,
// to admin@clubsensational.org. Other days do nothing.
//
// Auth: x-portal-webhook-secret or admin JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyPortalAdminAccessToken } from "../_shared/portal_admin_auth.ts";
import {
  londonYmd,
  packsDueOnLondonDay,
  sendFunderInvoicesToSevitha,
  type FunderPack,
} from "../_shared/portal_funder_invoice_mail.ts";

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

  let ym = londonYmd().ym;
  let packs = packsDueOnLondonDay(londonYmd().day);
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.ym === "string" && Array.isArray(body.packs)) {
        ym = body.ym;
        packs = body.packs.filter((p: string) =>
          p === "hf" || p === "nhs" || p === "nhs_ila"
        ) as FunderPack[];
      }
    } catch {
      /* daily cron posts {} */
    }
  }

  if (!packs || !packs.length) {
    return json(200, { ok: true, skipped: "not_send_day", ym: londonYmd().ym });
  }

  try {
    const result = await sendFunderInvoicesToSevitha(admin, { ym, packs });
    return json(result.ok ? 200 : 500, result);
  } catch (e) {
    console.error("[portal-cron-funder-invoice-mail]", e);
    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
