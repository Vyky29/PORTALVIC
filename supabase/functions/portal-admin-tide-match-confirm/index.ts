// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-tide-match-confirm
// action: confirm | ignore
// Confirm → mark INV-P paid (paid_via=tide_match) + Xero + crash confirm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { xeroSyncPaidInvoiceShare } from "../_shared/xero_payments.ts";
import { clearPaymentHoldForContact } from "../_shared/portal_payment_holds.ts";
import { confirmCrashSummerBookingsForInvoice } from "../_shared/crash_summer_confirm.ts";

function clean(v: unknown, max = 120): string {
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

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: {
    action?: string;
    match_id?: string;
    invoice_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 20).toLowerCase() || "confirm";
  const matchId = clean(body.match_id, 60);
  if (!matchId) {
    return portalAdminJson(400, { ok: false, error: "match_id_required" });
  }

  const { data: match, error: loadErr } = await admin
    .from("portal_tide_bank_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (loadErr || !match) {
    return portalAdminJson(404, { ok: false, error: "match_not_found" });
  }

  const now = new Date().toISOString();
  const who = clean(verified.email || verified.userId || "admin", 120);

  if (action === "ignore") {
    if (match.status === "confirmed") {
      return portalAdminJson(409, { ok: false, error: "already_confirmed" });
    }
    const { data: updated, error } = await admin
      .from("portal_tide_bank_matches")
      .update({
        status: "ignored",
        confirmed_at: now,
        confirmed_by: who,
        updated_at: now,
      })
      .eq("id", matchId)
      .select("*")
      .maybeSingle();
    if (error) {
      return portalAdminJson(500, { ok: false, error: "ignore_failed" });
    }
    return portalAdminJson(200, { ok: true, match: updated });
  }

  if (action !== "confirm") {
    return portalAdminJson(400, { ok: false, error: "action_required" });
  }

  if (match.status === "confirmed") {
    return portalAdminJson(200, {
      ok: true,
      skipped: "already_confirmed",
      match,
    });
  }

  const invoiceId =
    clean(body.invoice_id, 60) || clean(match.suggested_invoice_share_id, 60);
  if (!invoiceId) {
    return portalAdminJson(400, {
      ok: false,
      error: "invoice_required",
      message: "Pick an invoice before confirming this Tide row.",
    });
  }

  const { data: inv, error: invErr } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !inv) {
    return portalAdminJson(404, { ok: false, error: "invoice_not_found" });
  }

  if (inv.payment_status === "paid") {
    // Stamp match as confirmed anyway (idempotent).
    await admin
      .from("portal_tide_bank_matches")
      .update({
        status: "confirmed",
        suggested_invoice_share_id: invoiceId,
        confirmed_at: now,
        confirmed_by: who,
        updated_at: now,
      })
      .eq("id", matchId);
    return portalAdminJson(200, {
      ok: true,
      skipped: "invoice_already_paid",
      invoice: inv,
    });
  }

  if (inv.tide_matched_tx_id && inv.tide_matched_tx_id !== match.tide_tx_id) {
    return portalAdminJson(409, {
      ok: false,
      error: "invoice_already_matched",
    });
  }

  const { data: updatedInv, error: updErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "paid",
      paid_at: now,
      paid_via: "tide_match",
      tide_matched_tx_id: match.tide_tx_id,
      tide_matched_at: now,
      parent_reported_paid_at: null,
      updated_at: now,
    })
    .eq("id", invoiceId)
    .select("*")
    .maybeSingle();

  if (updErr || !updatedInv) {
    console.error("[portal-admin-tide-match-confirm] pay", updErr?.message);
    return portalAdminJson(500, { ok: false, error: "pay_failed" });
  }

  const { data: updatedMatch, error: matchErr } = await admin
    .from("portal_tide_bank_matches")
    .update({
      status: "confirmed",
      suggested_invoice_share_id: invoiceId,
      score: match.score === "none" ? "medium" : match.score,
      confirmed_at: now,
      confirmed_by: who,
      updated_at: now,
    })
    .eq("id", matchId)
    .select("*")
    .maybeSingle();

  if (matchErr) {
    console.error("[portal-admin-tide-match-confirm] stamp", matchErr.message);
  }

  let xero = null;
  let hold = null;
  try {
    xero = await xeroSyncPaidInvoiceShare(admin, updatedInv);
  } catch (e) {
    console.error(
      "[portal-admin-tide-match-confirm] xero",
      e instanceof Error ? e.message : String(e),
    );
  }
  try {
    const cid = clean(updatedInv.contact_id, 120);
    if (cid) hold = await clearPaymentHoldForContact(admin, cid, "admin", verified.userId || null);
  } catch (e) {
    console.error(
      "[portal-admin-tide-match-confirm] hold",
      e instanceof Error ? e.message : String(e),
    );
  }
  try {
    await confirmCrashSummerBookingsForInvoice(admin, invoiceId);
  } catch (e) {
    console.error(
      "[portal-admin-tide-match-confirm] crash",
      e instanceof Error ? e.message : String(e),
    );
  }

  return portalAdminJson(200, {
    ok: true,
    match: updatedMatch,
    invoice: updatedInv,
    xero,
    hold,
  });
});
