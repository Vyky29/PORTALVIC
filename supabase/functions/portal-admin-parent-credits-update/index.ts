// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-credits-update
// mark_refunded | mark_applied | cancel | create (manual ledger row).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 30).toLowerCase();
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const userId = verified.userId || null;

  if (action === "create") {
    const kind = clean(body.kind, 20).toLowerCase();
    if (kind !== "credit" && kind !== "refund") {
      return portalAdminJson(400, { ok: false, error: "kind_required" });
    }
    const parentPersonId = clean(body.parent_person_id, 120);
    const contactId = clean(body.contact_id, 120);
    if (!parentPersonId || !contactId) {
      return portalAdminJson(400, { ok: false, error: "parent_and_contact_required" });
    }
    const amount = parseAmount(body.amount_gbp);
    const { data, error } = await admin
      .from("portal_parent_family_credits")
      .insert({
        parent_person_id: parentPersonId,
        contact_id: contactId,
        participant_display: clean(body.participant_display, 120),
        kind,
        status: "open",
        amount_gbp: amount,
        service_label: clean(body.service_label, 120),
        session_date: clean(body.session_date, 20) || null,
        notes: clean(body.notes, 800) || null,
        source: "admin",
        created_by: userId,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[portal-admin-parent-credits-update] create", error.message);
      return portalAdminJson(500, { ok: false, error: "create_failed" });
    }
    return portalAdminJson(200, { ok: true, entry: data });
  }

  const entryId = clean(body.entry_id, 60);
  if (!entryId) return portalAdminJson(400, { ok: false, error: "entry_id_required" });

  const { data: entry, error: loadErr } = await admin
    .from("portal_parent_family_credits")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (loadErr || !entry) return portalAdminJson(404, { ok: false, error: "not_found" });
  if (entry.status !== "open") {
    return portalAdminJson(409, { ok: false, error: "not_open", status: entry.status });
  }

  let nextStatus = "";
  if (action === "mark_refunded") {
    if (entry.kind !== "refund") {
      return portalAdminJson(400, { ok: false, error: "not_a_refund" });
    }
    nextStatus = "refunded";
  } else if (action === "mark_applied") {
    if (entry.kind !== "credit") {
      return portalAdminJson(400, { ok: false, error: "not_a_credit" });
    }
    nextStatus = "applied";
  } else if (action === "cancel") {
    nextStatus = "cancelled";
  } else {
    return portalAdminJson(400, { ok: false, error: "action_required" });
  }

  const notes = clean(body.notes, 800);
  const patch: Record<string, unknown> = {
    status: nextStatus,
    closed_at: now,
    closed_by: userId,
    close_notes: notes || null,
    updated_at: now,
  };
  const amount = parseAmount(body.amount_gbp);
  if (amount != null && entry.amount_gbp == null) {
    patch.amount_gbp = amount;
  }

  const { data: updated, error } = await admin
    .from("portal_parent_family_credits")
    .update(patch)
    .eq("id", entryId)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    console.error("[portal-admin-parent-credits-update]", error?.message);
    return portalAdminJson(500, { ok: false, error: "update_failed" });
  }

  return portalAdminJson(200, { ok: true, entry: updated });
});
