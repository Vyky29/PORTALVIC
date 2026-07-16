// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-xero-product-map
// Sync Xero Items + manage Portal service → product mapping (VAT vs exempt).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { xeroConfigured } from "../_shared/xero_auth.ts";
import { syncXeroItemsToDb } from "../_shared/xero_items.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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

  const action = clean(body.action, 40).toLowerCase() || "list";
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "sync") {
    if (!xeroConfigured()) {
      return portalAdminJson(400, {
        ok: false,
        error: "xero_not_configured",
        message: "Xero secrets missing or token expired.",
      });
    }
    const synced = await syncXeroItemsToDb(admin);
    if (!synced.ok) {
      return portalAdminJson(502, {
        ok: false,
        error: synced.error,
        detail: synced.detail || null,
      });
    }
    return portalAdminJson(200, {
      ok: true,
      synced: synced.synced,
      message: `Synced ${synced.synced} items from Xero.`,
    });
  }

  if (action === "upsert") {
    const serviceKey = clean(body.service_key, 80);
    if (!serviceKey) {
      return portalAdminJson(400, { ok: false, error: "service_key_required" });
    }
    const label = clean(body.label, 160);
    const vatCode = clean(body.xero_item_code_vat, 80) || null;
    const exemptCode = clean(body.xero_item_code_exempt, 80) || null;
    const notes = clean(body.notes, 400) || null;
    const now = new Date().toISOString();

    const { data: existing } = await admin
      .from("portal_xero_product_map")
      .select("service_key, label, sort_order")
      .eq("service_key", serviceKey)
      .maybeSingle();

    const { data: row, error } = await admin
      .from("portal_xero_product_map")
      .upsert(
        {
          service_key: serviceKey,
          label: label || existing?.label || serviceKey,
          xero_item_code_vat: vatCode,
          xero_item_code_exempt: exemptCode,
          notes,
          sort_order: existing?.sort_order ?? 100,
          updated_at: now,
        },
        { onConflict: "service_key" },
      )
      .select("*")
      .maybeSingle();

    if (error || !row) {
      console.error("[portal-admin-xero-product-map] upsert", error?.message);
      return portalAdminJson(500, { ok: false, error: "upsert_failed" });
    }
    return portalAdminJson(200, { ok: true, map_row: row });
  }

  if (action === "add_key") {
    const serviceKey = clean(body.service_key, 80).toUpperCase().replace(/\s+/g, "_");
    const label = clean(body.label, 160);
    if (!serviceKey || !label) {
      return portalAdminJson(400, { ok: false, error: "service_key_and_label_required" });
    }
    const { data: row, error } = await admin
      .from("portal_xero_product_map")
      .upsert(
        {
          service_key: serviceKey,
          label,
          sort_order: Number(body.sort_order) || 100,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "service_key" },
      )
      .select("*")
      .maybeSingle();
    if (error) return portalAdminJson(500, { ok: false, error: "insert_failed" });
    return portalAdminJson(200, { ok: true, map_row: row });
  }

  // list (default)
  const [{ data: items }, { data: map }] = await Promise.all([
    admin
      .from("portal_xero_items")
      .select(
        "item_code, name, sales_unit_price, sales_tax_type, synced_at",
      )
      .order("name", { ascending: true }),
    admin
      .from("portal_xero_product_map")
      .select(
        "service_key, label, xero_item_code_vat, xero_item_code_exempt, sort_order, notes, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("service_key", { ascending: true }),
  ]);

  const mappedVat = (map || []).filter((r) => r.xero_item_code_vat).length;
  const mappedExempt = (map || []).filter((r) => r.xero_item_code_exempt).length;

  return portalAdminJson(200, {
    ok: true,
    xero_configured: xeroConfigured(),
    items: items || [],
    map: map || [],
    stats: {
      items_cached: (items || []).length,
      map_rows: (map || []).length,
      mapped_vat: mappedVat,
      mapped_exempt: mappedExempt,
    },
  });
});
