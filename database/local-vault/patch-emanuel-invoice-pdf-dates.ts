/**
 * Tighten Emanuel INV-P-0128 / 0129 date lines on PDF + regenerate.
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-emanuel-invoice-pdf-dates.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const patches: Record<string, { dates: string; detail: string }> = {
  "INV-P-0128": {
    dates: "8 sessions · 12, 15, 17, 19, 22, 24, 26 & 29 Jun 2026 · 11:00–16:00 SwimFarm",
    detail: "June 2026 (service start 12 Jun 2026) · SwimFarm Hub",
  },
  "INV-P-0129": {
    dates:
      "14 sessions · 1, 3, 6, 8, 10, 13, 15, 17, 20, 22, 24, 27, 29 & 31 Jul 2026 · 11:00–16:00 SwimFarm",
    detail: "July 2026 · SwimFarm Hub",
  },
};

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, line_items, amount_gbp, quantity, unit_price_gbp")
  .in("invoice_number", Object.keys(patches));
if (error) throw error;

for (const share of shares || []) {
  const p = patches[String(share.invoice_number)];
  if (!p) continue;
  const prev = Array.isArray(share.line_items) ? share.line_items[0] as Record<string, unknown> : {};
  const lineItems: PortalInvoiceLineItem[] = [
    {
      service_key: "DAY_CENTRE_300",
      description: String(prev.description || "Day Centre 5h (1:1) · Mon/Wed/Fri 11:00–16:00"),
      detail: p.detail,
      dates: p.dates,
      quantity: Number(share.quantity) || Number(prev.quantity) || 1,
      unit_price_gbp: Number(share.unit_price_gbp) || Number(prev.unit_price_gbp) || 500,
      amount_gbp: Number(share.amount_gbp) || Number(prev.amount_gbp) || 0,
      xero_item_code: null,
    },
  ];
  const description = lineItemsToDescription(lineItems, { fundedProvision: true });
  console.log(share.invoice_number, "→", p.dates);
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      line_items: lineItems,
      line_description: description,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) throw upErr;
  const regen = await regeneratePortalInvoiceSharePdf(admin, share.id);
  console.log("  PDF", regen);
}

if (!APPLY) console.log("\nDry run — re-run with APPLY=1");
else console.log("\nDone.");
