// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-tide-match-list
// Open Tide match suggestions for Family invoices UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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

  let body: { status?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const status = clean(body.status, 20).toLowerCase() || "suggested";
  const limit = Math.min(Math.max(Number(body.limit) || 80, 1), 200);

  let q = admin
    .from("portal_tide_bank_matches")
    .select(
      "id, tide_tx_id, booking_date, amount_gbp, reference_raw, suggested_invoice_share_id, score, status, confirmed_at, confirmed_by, upload_batch_id, created_at, updated_at",
    )
    .order("booking_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    q = q.eq("status", status);
  }

  const { data: matches, error } = await q;
  if (error) {
    console.error("[portal-admin-tide-match-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const invIds = Array.from(
    new Set(
      (matches || [])
        .map((m) => m.suggested_invoice_share_id)
        .filter(Boolean)
        .map(String),
    ),
  );

  const invoiceById: Record<string, Record<string, unknown>> = {};
  if (invIds.length) {
    const { data: invs } = await admin
      .from("portal_parent_invoice_share")
      .select(
        "id, invoice_number, amount_gbp, contact_id, payment_status, share_status, due_date",
      )
      .in("id", invIds);
    for (const inv of invs || []) {
      invoiceById[String(inv.id)] = inv;
    }
  }

  const contactIds = Array.from(
    new Set(
      Object.values(invoiceById)
        .map((i) => clean(i.contact_id, 120))
        .filter(Boolean),
    ),
  );
  const nameByContact: Record<string, string> = {};
  if (contactIds.length) {
    const { data: parts } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of parts || []) {
      const cid = clean(p.contact_id, 120);
      nameByContact[cid] =
        clean(p.display_name, 120) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        cid;
    }
  }

  const rows = (matches || []).map((m) => {
    const inv = m.suggested_invoice_share_id
      ? invoiceById[String(m.suggested_invoice_share_id)]
      : null;
    const cid = inv ? clean(inv.contact_id, 120) : "";
    return {
      ...m,
      invoice: inv
        ? {
            id: inv.id,
            invoice_number: inv.invoice_number,
            amount_gbp: inv.amount_gbp,
            contact_id: inv.contact_id,
            payment_status: inv.payment_status,
            participant_name: nameByContact[cid] || cid || "—",
          }
        : null,
    };
  });

  const suggested = rows.filter((r) => r.status === "suggested");
  return portalAdminJson(200, {
    ok: true,
    matches: rows,
    meta: {
      suggested: suggested.length,
      strong: suggested.filter((r) => r.score === "strong").length,
      medium: suggested.filter((r) => r.score === "medium").length,
    },
  });
});
