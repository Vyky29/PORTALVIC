// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-makeup-confirmed-notify
// ------------------------------------
// Admin: after Schedule MakeUp save (or office confirmation), notify parent + instructor.
//
// Deploy:
//   npx supabase functions deploy portal-admin-makeup-confirmed-notify --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { notifyMakeupConfirmed } from "../_shared/portal_makeup_confirmed_notify.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

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

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const contactId = clean(body.contact_id, 120);
  const parentPersonId = clean(body.parent_person_id, 120);
  const participantDisplay = clean(body.participant_display, 160);
  if (!contactId && !parentPersonId && !participantDisplay) {
    return portalAdminJson(400, { ok: false, error: "participant_required" });
  }

  // Resolve contact from display / slug when Schedule only has client slug.
  let resolvedContact = contactId;
  let resolvedParent = parentPersonId;
  let resolvedDisplay = participantDisplay;
  if (!resolvedContact && participantDisplay) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, parent_person_id, display_name")
      .ilike("display_name", participantDisplay)
      .limit(1)
      .maybeSingle();
    if (pax?.contact_id) {
      resolvedContact = clean(pax.contact_id, 120);
      resolvedParent = resolvedParent || clean(pax.parent_person_id, 120);
      resolvedDisplay = resolvedDisplay || clean(pax.display_name, 160);
    }
  }
  if (resolvedContact && !resolvedParent) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("parent_person_id, display_name")
      .eq("contact_id", resolvedContact)
      .maybeSingle();
    if (pax) {
      resolvedParent = clean(pax.parent_person_id, 120);
      resolvedDisplay = resolvedDisplay || clean(pax.display_name, 160);
    }
  }

  const notify = await notifyMakeupConfirmed(admin, {
    parentPersonId: resolvedParent || null,
    contactId: resolvedContact || null,
    participantDisplay: resolvedDisplay || null,
    venue: clean(body.venue, 80) || null,
    sessionDate: clean(body.session_date, 12) || null,
    sessionTime: clean(body.session_time, 40) || null,
    serviceLabel: clean(body.service_label, 160) || null,
    instructorName: clean(body.instructor_name, 120) || null,
    instructorStaffKey: clean(body.instructor_staff_key || body.anchor_staff_id, 80) || null,
    source: clean(body.source, 80) || "schedule_covers",
    overrideId: clean(body.override_id, 60) || null,
    offerId: clean(body.offer_id, 60) || null,
    grantId: clean(body.grant_id, 60) || null,
    actorEmail: verified.email || null,
  });

  return portalAdminJson(200, { ok: true, notify });
});
