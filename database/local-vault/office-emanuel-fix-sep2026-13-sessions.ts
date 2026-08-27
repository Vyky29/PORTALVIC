/**
 * Emanuel Dodson INV-P-0260 (Sept 2026 NHS month):
 * Fix session dates to Day Centre calendar (open from 1 Sept) — M/W/F = 13 sessions.
 * Was using afterschools weekday dates (from Mon 7 Sept) → only 11.
 *
 * Monthly total stays £6,029.05 (equal NHS monthly share); redistribute by day qty.
 * Also correct bogus "30' Day Centre" label → Day Centre 5h (1:1).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-emanuel-fix-sep2026-13-sessions.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE = "INV-P-0260";
const TOTAL = 6029.05;

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sept 2026 Day Centre open M/W/F (1 Sept Tue → first sessions Wed 2 & Fri 4). */
const days = [
  {
    detail: "Monday · SwimFarm · 11:00–16:00",
    dates: "Dates: 7, 14, 21, 28 Sept",
    quantity: 4,
  },
  {
    detail: "Wednesday · SwimFarm · 11:00–16:00",
    dates: "Dates: 2, 9, 16, 23, 30 Sept",
    quantity: 5,
  },
  {
    detail: "Friday · SwimFarm · 11:00–16:00",
    dates: "Dates: 4, 11, 18, 25 Sept",
    quantity: 4,
  },
] as const;

const sessTotal = days.reduce((s, d) => s + d.quantity, 0);
if (sessTotal !== 13) throw new Error(`expected 13 sessions, got ${sessTotal}`);

const lineItems: PortalInvoiceLineItem[] = [];
let allocated = 0;
days.forEach((d, i) => {
  const amount =
    i === days.length - 1
      ? round2(TOTAL - allocated)
      : round2((TOTAL * d.quantity) / sessTotal);
  allocated = round2(allocated + amount);
  lineItems.push({
    service_key: "DAY_CENTRE_300",
    description: "Day Centre 5h (1:1) · Mon/Wed/Fri 11:00–16:00",
    detail: d.detail,
    dates: d.dates,
    quantity: d.quantity,
    unit_price_gbp: round2(amount / d.quantity),
    amount_gbp: amount,
    xero_item_code: null,
  });
});

const description = lineItemsToDescription(lineItems, { fundedProvision: true });

console.log(`\n${INVOICE} → ${sessTotal} sessions (Day Centre from 1 Sept)`);
for (const l of lineItems) {
  console.log(`  ${l.detail}: ${l.quantity} · ${l.dates} · £${l.amount_gbp}`);
}
console.log(`  TOTAL £${round2(lineItems.reduce((s, l) => s + Number(l.amount_gbp), 0))}`);

if (!APPLY) {
  console.log("\nDry run — re-run with APPLY=1");
  Deno.exit(0);
}

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, notes")
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error) throw error;
if (!share?.id) throw new Error(`${INVOICE} not found`);

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    quantity: sessTotal,
    line_items: lineItems,
    line_description: description,
    notes:
      String(share.notes || "") +
      " · fixed Sept Day Centre dates 13× M/W/F from 1 Sept (was afterschools 11)",
    updated_at: new Date().toISOString(),
  })
  .eq("id", share.id);
if (upErr) throw upErr;

const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
console.log("PDF", pdf);
console.log("\nDone.");
