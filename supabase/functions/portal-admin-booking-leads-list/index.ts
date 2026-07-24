// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-booking-leads-list
// Admin: Booking Portal OTP leads (name / email / phone / status).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: {
    client_status?: string;
    booking_status?: string;
    q?: string;
    limit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const clientStatus = String(body.client_status || "").trim().toLowerCase();
  const bookingStatus = String(body.booking_status || "").trim().toLowerCase();
  const q = String(body.q || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 150, 1), 400);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = admin
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, source, first_page_visited, services_viewed, booking_status, registration_status, client_status, marketing_consent, email_verified_at, last_activity_at, created_at, updated_at",
    )
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (clientStatus && clientStatus !== "all") {
    query = query.eq("client_status", clientStatus);
  }
  if (bookingStatus && bookingStatus !== "all") {
    query = query.eq("booking_status", bookingStatus);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-booking-leads-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  let leads = data || [];
  if (q) {
    leads = leads.filter((row) => {
      const blob = [
        row.parent_name,
        row.email,
        row.mobile,
        row.source,
        row.booking_status,
        row.client_status,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return blob.includes(q);
    });
  }

  const since24 = Date.now() - 24 * 60 * 60 * 1000;
  const new24h = leads.filter((r) => {
    const t = new Date(String(r.created_at || "")).getTime();
    return Number.isFinite(t) && t >= since24;
  }).length;
  const verifiedN = leads.filter((r) => !!r.email_verified_at).length;
  const prospective = leads.filter((r) => r.client_status === "prospective").length;
  const regStarted = leads.filter(
    (r) =>
      r.registration_status === "started" ||
      r.registration_status === "submitted",
  ).length;

  return portalAdminJson(200, {
    ok: true,
    leads,
    meta: {
      total: leads.length,
      new_24h: new24h,
      verified: verifiedN,
      prospective,
      registration_started: regStarted,
    },
  });
});
