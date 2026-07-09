// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-makeup-grant
// Create / cancel a makeup grant (typically for missed/expired absence without proof).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

const SOURCES = new Set(["no_proof", "expired_window", "admin", "excused_makeup"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
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

  let body: {
    action?: string;
    grant_id?: string;
    absence_report_id?: string;
    contact_id?: string;
    parent_person_id?: string;
    participant_display?: string;
    preferred_venue?: string;
    service_label?: string;
    source?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 20).toLowerCase() || "create";
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  if (action === "cancel") {
    const grantId = clean(body.grant_id, 60);
    if (!grantId) return portalAdminJson(400, { ok: false, error: "grant_id_required" });
    const { data: g, error: loadErr } = await admin
      .from("portal_parent_makeup_grants")
      .select("id, status")
      .eq("id", grantId)
      .maybeSingle();
    if (loadErr || !g) return portalAdminJson(404, { ok: false, error: "not_found" });
    if (g.status === "consumed" || g.status === "forfeited") {
      return portalAdminJson(409, { ok: false, error: "already_closed", status: g.status });
    }
    await admin
      .from("portal_parent_makeup_offers")
      .update({ status: "withdrawn", updated_at: now, responded_at: now })
      .eq("grant_id", grantId)
      .eq("status", "pending");
    const { data: updated, error } = await admin
      .from("portal_parent_makeup_grants")
      .update({ status: "cancelled", closed_at: now, updated_at: now })
      .eq("id", grantId)
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: "update_failed" });
    return portalAdminJson(200, { ok: true, grant: updated });
  }

  // create
  let parentPersonId = clean(body.parent_person_id, 120);
  let contactId = clean(body.contact_id, 120);
  let participantDisplay = clean(body.participant_display, 160);
  let serviceLabel = clean(body.service_label, 160);
  let preferredVenue = clean(body.preferred_venue, 80);
  const absenceId = clean(body.absence_report_id, 60);
  const source = clean(body.source, 40).toLowerCase() || "admin";
  const notes = clean(body.notes, 800);

  if (!SOURCES.has(source)) {
    return portalAdminJson(400, { ok: false, error: "invalid_source" });
  }

  if (absenceId) {
    const { data: abs, error: aErr } = await admin
      .from("portal_parent_absence_reports")
      .select(
        "id, parent_person_id, contact_id, participant_display, service_label, status, outcome",
      )
      .eq("id", absenceId)
      .maybeSingle();
    if (aErr || !abs) return portalAdminJson(404, { ok: false, error: "absence_not_found" });
    parentPersonId = String(abs.parent_person_id);
    contactId = String(abs.contact_id);
    participantDisplay = participantDisplay || clean(abs.participant_display, 160);
    serviceLabel = serviceLabel || clean(abs.service_label, 160);
  }

  if (!parentPersonId || !contactId) {
    return portalAdminJson(400, { ok: false, error: "contact_required" });
  }
  if (!preferredVenue) {
    return portalAdminJson(400, {
      ok: false,
      error: "preferred_venue_required",
      message: "Offers are by venue — set the family's preferred centre.",
    });
  }

  if (absenceId) {
    const { data: existing } = await admin
      .from("portal_parent_makeup_grants")
      .select("id, status")
      .eq("absence_report_id", absenceId)
      .maybeSingle();
    if (existing) {
      return portalAdminJson(200, { ok: true, grant: existing, already: true });
    }
  }

  const { data: created, error } = await admin
    .from("portal_parent_makeup_grants")
    .insert({
      parent_person_id: parentPersonId,
      contact_id: contactId,
      participant_display: participantDisplay,
      absence_report_id: absenceId || null,
      preferred_venue: preferredVenue,
      service_label: serviceLabel,
      status: "open",
      source,
      notes: notes || null,
      created_by: verified.userId || null,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[portal-admin-makeup-grant]", error.message);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  return portalAdminJson(200, { ok: true, grant: created });
});
