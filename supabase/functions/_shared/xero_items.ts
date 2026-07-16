/** Fetch and cache Xero inventory Items. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  XERO_API,
  cleanXero,
  xeroAccessToken,
  xeroAuthHeaders,
  xeroConfigured,
} from "./xero_auth.ts";

export type XeroItemRow = {
  item_code: string;
  item_id: string | null;
  name: string;
  description: string | null;
  sales_unit_price: number | null;
  sales_tax_type: string | null;
  is_sold: boolean;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function xeroListItems(): Promise<
  { ok: true; items: XeroItemRow[] } | { ok: false; error: string; detail?: string }
> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const token = await xeroAccessToken();
  if (!token) return { ok: false, error: "xero_auth_failed" };

  const items: XeroItemRow[] = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const url = `${XERO_API}/Items?where=IsSold==true&page=${page}`;
    const res = await fetch(url, { headers: xeroAuthHeaders(token) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = String(
        json?.Message ||
          json?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
          res.status,
      );
      console.error("[xeroListItems]", detail);
      return { ok: false, error: "xero_items_failed", detail };
    }
    const batch = Array.isArray(json?.Items) ? json.Items : [];
    for (const raw of batch) {
      const code = cleanXero(raw?.Code, 80);
      if (!code) continue;
      const sales = raw?.SalesDetails || {};
      const price = Number(sales?.UnitPrice);
      items.push({
        item_code: code,
        item_id: cleanXero(raw?.ItemID, 80) || null,
        name: cleanXero(raw?.Name, 200) || code,
        description: cleanXero(raw?.Description, 500) || null,
        sales_unit_price: Number.isFinite(price) ? round4(price) : null,
        sales_tax_type: cleanXero(sales?.TaxType, 40) || null,
        is_sold: raw?.IsSold !== false,
      });
    }
    if (batch.length < 100) break;
    page += 1;
  }

  return { ok: true, items };
}

export async function syncXeroItemsToDb(
  admin: SupabaseClient,
): Promise<
  | { ok: true; synced: number; items: XeroItemRow[] }
  | { ok: false; error: string; detail?: string }
> {
  const listed = await xeroListItems();
  if (!listed.ok) return listed;

  const now = new Date().toISOString();
  const rows = listed.items.map((it) => ({
    item_code: it.item_code,
    item_id: it.item_id,
    name: it.name,
    description: it.description,
    sales_unit_price: it.sales_unit_price,
    sales_tax_type: it.sales_tax_type,
    is_sold: it.is_sold,
    synced_at: now,
  }));

  if (rows.length) {
    const { error } = await admin.from("portal_xero_items").upsert(rows, {
      onConflict: "item_code",
    });
    if (error) {
      console.error("[syncXeroItemsToDb]", error.message);
      return { ok: false, error: "db_upsert_failed", detail: error.message };
    }
  }

  return { ok: true, synced: rows.length, items: listed.items };
}
