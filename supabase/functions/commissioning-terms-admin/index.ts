// @ts-nocheck — Edge Function (Deno).
//
// commissioning-terms-admin
// Admin/CEO: list docs, create org, send accept link, manage placements/POs/overrides.
// Additive — does not modify family T&C acceptance or re-enrolment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { sha256Hex } from "../_shared/parent_portal_auth.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function featureFlags(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from("portal_commissioning_finance_settings")
    .select("value_json")
    .eq("key", "feature_flags")
    .maybeSingle();
  const v = (data?.value_json || {}) as Record<string, unknown>;
  return {
    commissioning_terms_enabled: v.commissioning_terms_enabled !== false,
    commissioning_attendance_hard_block: v.commissioning_attendance_hard_block === true,
  };
}

function placementAlerts(row: Record<string, unknown>, po: Record<string, unknown> | null) {
  const alerts: string[] = [];
  if (!po) {
    if (["reserved_chargeable", "awaiting_po", "approved_to_attend", "active"].includes(String(row.status))) {
      alerts.push("missing_or_inactive_po");
    }
  } else {
    if (po.status === "invalid_incomplete" || po.status === "amendment_required") {
      alerts.push("po_invalid_or_amendment_required");
    }
    if (
      po.end_date &&
      row.service_start_date &&
      String(po.end_date) < String(row.final_payment_month || row.service_start_date)
    ) {
      alerts.push("po_may_end_before_service");
    }
    if (
      po.session_rate_pence != null &&
      row.session_rate_pence != null &&
      Number(po.session_rate_pence) !== Number(row.session_rate_pence)
    ) {
      alerts.push("po_rate_mismatch");
    }
    if (po.remaining_balance_pence != null && Number(po.remaining_balance_pence) <= 0) {
      alerts.push("po_insufficient_value");
    }
  }
  if (row.reservation_date && !row.attendance_authorised_from) {
    alerts.push("reserved_but_attendance_not_authorised");
  }
  if (String(row.status) === "reserved_chargeable") {
    alerts.push("chargeable_without_attendance_authorisation");
  }
  // Academic-year instalments extending past year — soft flag when final_payment_month looks like next AY
  const ay = String(row.academic_year || "");
  const finalMonth = String(row.final_payment_month || "");
  if (ay && finalMonth && /09|10|11|12|01|02|03/.test(finalMonth) && ay.indexOf("2026") >= 0 && /2027|sep|sept|oct|nov|dec|jan|feb|mar/i.test(finalMonth)) {
    alerts.push("payment_schedule_may_cross_academic_year");
  }
  return alerts;
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

  const action = clean(body.action, 60).toLowerCase() || "overview";
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const flags = await featureFlags(admin);
  if (!flags.commissioning_terms_enabled && action !== "overview") {
    return portalAdminJson(403, { ok: false, error: "feature_disabled", flags });
  }

  if (action === "overview") {
    const [{ data: docs }, { data: orgs }, { data: sends }, { data: placements }] = await Promise.all([
      admin
        .from("portal_terms_documents")
        .select("id, audience, version, title, public_path, status, effective_from")
        .order("effective_from", { ascending: false }),
      admin
        .from("portal_commissioning_orgs")
        .select("id, name, org_type, active, payment_in_arrears, notice_period_days")
        .order("name"),
      admin
        .from("portal_terms_send_events")
        .select("id, status, recipient_email, recipient_name, org_id, created_at, accepted_at, document_id")
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("portal_commissioning_placements")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const { data: late } = await admin
      .from("portal_commissioning_finance_settings")
      .select("value_json")
      .eq("key", "late_payment")
      .maybeSingle();

    return portalAdminJson(200, {
      ok: true,
      flags,
      late_payment: late?.value_json || {},
      documents: docs || [],
      orgs: orgs || [],
      recent_sends: sends || [],
      placements: placements || [],
      family_terms_path: "/parent/terms",
      commissioning_terms_path: "/commissioning/terms",
    });
  }

  if (action === "create_org") {
    const name = clean(body.name, 200);
    const orgType = clean(body.org_type, 40) || "local_authority";
    if (!name) return portalAdminJson(400, { ok: false, error: "name_required" });
    const { data, error } = await admin
      .from("portal_commissioning_orgs")
      .insert({
        name,
        org_type: orgType,
        department: clean(body.department, 120) || null,
        main_contact_name: clean(body.main_contact_name, 120) || null,
        main_contact_email: clean(body.main_contact_email, 160).toLowerCase() || null,
        finance_contact_email: clean(body.finance_contact_email, 160).toLowerCase() || null,
        payment_in_arrears: body.payment_in_arrears !== false,
        notice_period_days: Number(body.notice_period_days) || 28,
      })
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: error.message });
    return portalAdminJson(200, { ok: true, org: data });
  }

  if (action === "send_terms") {
    const orgId = clean(body.org_id, 80);
    const email = clean(body.recipient_email, 160).toLowerCase();
    const name = clean(body.recipient_name, 120);
    const role = clean(body.recipient_role, 120);
    if (!orgId || !email) {
      return portalAdminJson(400, { ok: false, error: "org_and_email_required" });
    }

    const { data: doc } = await admin
      .from("portal_terms_documents")
      .select("id, version, public_path")
      .eq("audience", "commissioning")
      .eq("status", "active")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!doc) return portalAdminJson(404, { ok: false, error: "no_active_commissioning_document" });

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expires = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

    const { data: ev, error } = await admin
      .from("portal_terms_send_events")
      .insert({
        document_id: doc.id,
        org_id: orgId,
        participant_contact_id: clean(body.participant_contact_id, 120) || null,
        recipient_email: email,
        recipient_name: name || null,
        recipient_role: role || null,
        status: "sent",
        token_hash: tokenHash,
        token_expires_at: expires,
        sent_at: new Date().toISOString(),
        created_by: verified.userId,
      })
      .select("id, status, sent_at, token_expires_at")
      .maybeSingle();

    if (error || !ev) {
      return portalAdminJson(500, { ok: false, error: error?.message || "send_failed" });
    }

    const placementId = clean(body.placement_id, 80);
    if (placementId) {
      await admin
        .from("portal_commissioning_placements")
        .update({ status: "awaiting_terms_acceptance", terms_document_id: doc.id, updated_at: new Date().toISOString() })
        .eq("id", placementId);
    }

    const acceptPath = `/commissioning/terms-accept?token=${encodeURIComponent(rawToken)}`;
    return portalAdminJson(200, {
      ok: true,
      send_event_id: ev.id,
      accept_path: acceptPath,
      // Raw token returned once for admin to copy into email / WhatsApp. Not stored plaintext.
      accept_token: rawToken,
      expires_at: ev.token_expires_at,
      document_version: doc.version,
    });
  }

  if (action === "create_placement") {
    const orgId = clean(body.org_id, 80);
    if (!orgId) return portalAdminJson(400, { ok: false, error: "org_id_required" });
    const { data, error } = await admin
      .from("portal_commissioning_placements")
      .insert({
        org_id: orgId,
        participant_contact_id: clean(body.participant_contact_id, 120) || null,
        participant_name: clean(body.participant_name, 160) || null,
        academic_year: clean(body.academic_year, 20) || null,
        service_label: clean(body.service_label, 120) || null,
        status: clean(body.status, 40) || "proposed",
        reservation_date: clean(body.reservation_date, 20) || null,
        chargeable_from: clean(body.chargeable_from, 20) || null,
        attendance_authorised_from: clean(body.attendance_authorised_from, 20) || null,
        service_start_date: clean(body.service_start_date, 20) || null,
        session_rate_pence: body.session_rate_pence != null ? Number(body.session_rate_pence) : null,
        proposed_at: new Date().toISOString(),
      })
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: error.message });
    return portalAdminJson(200, { ok: true, placement: data });
  }

  if (action === "upsert_po") {
    const orgId = clean(body.org_id, 80);
    const poNumber = clean(body.po_number, 80);
    if (!orgId || !poNumber) {
      return portalAdminJson(400, { ok: false, error: "org_and_po_required" });
    }
    const row = {
      org_id: orgId,
      placement_id: clean(body.placement_id, 80) || null,
      po_number: poNumber,
      participant_name_or_ref: clean(body.participant_name_or_ref, 160) || null,
      service_label: clean(body.service_label, 120) || null,
      sessions_approved: body.sessions_approved != null ? Number(body.sessions_approved) : null,
      session_rate_pence: body.session_rate_pence != null ? Number(body.session_rate_pence) : null,
      start_date: clean(body.start_date, 20) || null,
      end_date: clean(body.end_date, 20) || null,
      funding_period_label: clean(body.funding_period_label, 80) || null,
      total_value_pence: body.total_value_pence != null ? Number(body.total_value_pence) : null,
      remaining_balance_pence:
        body.remaining_balance_pence != null ? Number(body.remaining_balance_pence) : null,
      status: clean(body.status, 40) || "received",
      academic_year: clean(body.academic_year, 20) || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from("portal_purchase_orders")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: error.message });
    return portalAdminJson(200, { ok: true, po: data });
  }

  if (action === "set_placement_status") {
    const placementId = clean(body.placement_id, 80);
    const status = clean(body.status, 40);
    if (!placementId || !status) {
      return portalAdminJson(400, { ok: false, error: "placement_and_status_required" });
    }

    const { data: placement } = await admin
      .from("portal_commissioning_placements")
      .select("*")
      .eq("id", placementId)
      .maybeSingle();
    if (!placement) return portalAdminJson(404, { ok: false, error: "placement_not_found" });

    if (status === "approved_to_attend" || status === "active") {
      const { data: po } = await admin
        .from("portal_purchase_orders")
        .select("*")
        .eq("placement_id", placementId)
        .in("status", ["received", "active"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasPo = !!po;
      const hasDirectorAuth = body.director_override === true;

      if (!hasPo && !hasDirectorAuth) {
        return portalAdminJson(400, {
          ok: false,
          error: "attendance_requires_po_or_director_override",
          hard_block: flags.commissioning_attendance_hard_block,
          alerts: placementAlerts(placement, null),
        });
      }

      if (!hasPo && hasDirectorAuth) {
        const reason = clean(body.override_reason, 500);
        if (!reason) {
          return portalAdminJson(400, { ok: false, error: "override_reason_required" });
        }
        await admin.from("portal_commissioning_director_overrides").insert({
          org_id: placement.org_id,
          placement_id: placementId,
          action: "authorise_attendance_without_po",
          reason,
          supporting_note: clean(body.supporting_note, 1000) || null,
          created_by: verified.userId,
          created_by_name: verified.email,
        });
      }

      // Soft mode: still allow status change but return alerts when hard_block is off
      const alerts = placementAlerts(placement, po || null);
      if (flags.commissioning_attendance_hard_block && !hasPo && !hasDirectorAuth) {
        return portalAdminJson(403, { ok: false, error: "hard_block", alerts });
      }

      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (!placement.attendance_authorised_from) {
        patch.attendance_authorised_from = new Date().toISOString().slice(0, 10);
      }
      const { data, error } = await admin
        .from("portal_commissioning_placements")
        .update(patch)
        .eq("id", placementId)
        .select("*")
        .maybeSingle();
      if (error) return portalAdminJson(500, { ok: false, error: error.message });
      return portalAdminJson(200, { ok: true, placement: data, alerts });
    }

    const { data, error } = await admin
      .from("portal_commissioning_placements")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", placementId)
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: error.message });
    return portalAdminJson(200, { ok: true, placement: data });
  }

  if (action === "placement_alerts") {
    const placementId = clean(body.placement_id, 80);
    const { data: placement } = await admin
      .from("portal_commissioning_placements")
      .select("*")
      .eq("id", placementId)
      .maybeSingle();
    if (!placement) return portalAdminJson(404, { ok: false, error: "placement_not_found" });
    const { data: po } = await admin
      .from("portal_purchase_orders")
      .select("*")
      .eq("placement_id", placementId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return portalAdminJson(200, {
      ok: true,
      alerts: placementAlerts(placement, po || null),
      flags,
    });
  }

  if (action === "director_override") {
    const reason = clean(body.reason, 500);
    const act = clean(body.override_action, 60);
    if (!reason || !act) {
      return portalAdminJson(400, { ok: false, error: "action_and_reason_required" });
    }
    const { data, error } = await admin
      .from("portal_commissioning_director_overrides")
      .insert({
        org_id: clean(body.org_id, 80) || null,
        placement_id: clean(body.placement_id, 80) || null,
        action: act,
        reason,
        supporting_note: clean(body.supporting_note, 1000) || null,
        created_by: verified.userId,
        created_by_name: verified.email,
      })
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: error.message });
    return portalAdminJson(200, { ok: true, override: data });
  }

  if (action === "document_for_payer_type") {
    const payer = clean(body.payer_type, 40).toLowerCase();
    const isFamily = !payer || payer === "family" || payer === "family_private" || payer === "private";
    const audience = isFamily ? "family" : "commissioning";
    const { data: doc } = await admin
      .from("portal_terms_documents")
      .select("id, audience, version, title, public_path, status")
      .eq("audience", audience)
      .eq("status", "active")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    return portalAdminJson(200, { ok: true, audience, document: doc });
  }

  return portalAdminJson(400, { ok: false, error: "unknown_action" });
});
