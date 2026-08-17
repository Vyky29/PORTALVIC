// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-booking-leads-upsert
// Admin: create / update potential-client tracking fields on portal_booking_leads.
// When track_status is anything other than "booked", join marketing outreach.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const TRACK_STATUSES = new Set([
  "new",
  "following_up",
  "waiting",
  "not_booking",
  "booked",
  "closed",
]);

function clean(v: unknown, max = 500): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function emailNorm(v: unknown): string {
  return clean(v, 200).toLowerCase();
}

function applyOutreachRule(
  trackStatus: string,
  prev: { marketing_consent?: boolean; outreach_joined_at?: string | null },
): { marketing_consent: boolean; outreach_joined_at: string | null } {
  const now = new Date().toISOString();
  if (trackStatus === "booked") {
    return {
      marketing_consent: !!prev.marketing_consent,
      outreach_joined_at: prev.outreach_joined_at || null,
    };
  }
  return {
    marketing_consent: true,
    outreach_joined_at: prev.outreach_joined_at || now,
  };
}

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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const id = clean(body.id, 80);
  const parentName = clean(body.parent_name, 120);
  const email = emailNorm(body.email);
  const mobile = clean(body.mobile, 40) || "0000000000";
  const enquiryNotes = clean(body.enquiry_notes, 2000);
  const activityInterest = clean(body.activity_interest, 200);
  let trackStatus = clean(body.track_status, 40).toLowerCase().replace(/\s+/g, "_");
  if (trackStatus === "booked") trackStatus = "booked";
  if (!TRACK_STATUSES.has(trackStatus)) trackStatus = "new";

  if (!email || !email.includes("@")) {
    return portalAdminJson(400, { ok: false, error: "email_required" });
  }
  if (!parentName && !id) {
    return portalAdminJson(400, { ok: false, error: "parent_name_required" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  let existing: Record<string, unknown> | null = null;

  if (id) {
    const { data } = await admin
      .from("portal_booking_leads")
      .select(
        "id, parent_name, email, mobile, enquiry_notes, activity_interest, track_status, marketing_consent, outreach_joined_at, source, privacy_notice_version",
      )
      .eq("id", id)
      .maybeSingle();
    existing = data;
  } else {
    const { data } = await admin
      .from("portal_booking_leads")
      .select(
        "id, parent_name, email, mobile, enquiry_notes, activity_interest, track_status, marketing_consent, outreach_joined_at, source, privacy_notice_version",
      )
      .eq("email_norm", email)
      .maybeSingle();
    existing = data;
  }

  const outreach = applyOutreachRule(trackStatus, {
    marketing_consent: !!existing?.marketing_consent,
    outreach_joined_at: existing?.outreach_joined_at
      ? String(existing.outreach_joined_at)
      : null,
  });

  if (existing?.id) {
    const patch: Record<string, unknown> = {
      updated_at: now,
      last_activity_at: now,
      track_status: trackStatus,
      enquiry_notes: enquiryNotes || String(existing.enquiry_notes || ""),
      activity_interest: activityInterest || String(existing.activity_interest || ""),
      marketing_consent: outreach.marketing_consent,
      outreach_joined_at: outreach.outreach_joined_at,
    };
    if (parentName) patch.parent_name = parentName;
    if (email) patch.email = email;
    if (mobile && mobile !== "0000000000") patch.mobile = mobile;

    const { data: updated, error } = await admin
      .from("portal_booking_leads")
      .update(patch)
      .eq("id", String(existing.id))
      .select(
        "id, parent_name, email, mobile, enquiry_notes, activity_interest, track_status, marketing_consent, outreach_joined_at, services_viewed, booking_status, client_status, last_activity_at",
      )
      .maybeSingle();
    if (error) {
      return portalAdminJson(500, { ok: false, error: error.message });
    }
    return portalAdminJson(200, {
      ok: true,
      lead: updated,
      outreach_joined: trackStatus !== "booked",
    });
  }

  const insert = {
    parent_name: parentName || email.split("@")[0] || "Potential client",
    email,
    mobile,
    marketing_consent: outreach.marketing_consent,
    outreach_joined_at: outreach.outreach_joined_at,
    privacy_notice_version: "office-potential-client-2026-08-17",
    privacy_accepted_at: now,
    source: "Office potential client",
    first_page_visited: "Admin · Potential clients",
    services_viewed: activityInterest ? [activityInterest] : [],
    booking_status: trackStatus === "booked" ? "booking_completed" : "new_lead",
    registration_status: "not_started",
    client_status: trackStatus === "booked" ? "active_client" : "prospective",
    enquiry_notes: enquiryNotes,
    activity_interest: activityInterest,
    track_status: trackStatus,
    last_activity_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data: created, error: insErr } = await admin
    .from("portal_booking_leads")
    .insert(insert)
    .select(
      "id, parent_name, email, mobile, enquiry_notes, activity_interest, track_status, marketing_consent, outreach_joined_at, services_viewed, booking_status, client_status, last_activity_at",
    )
    .maybeSingle();

  if (insErr) {
    return portalAdminJson(500, { ok: false, error: insErr.message });
  }

  return portalAdminJson(200, {
    ok: true,
    lead: created,
    outreach_joined: trackStatus !== "booked",
  });
});
