/**
 * Patch Adam Pilcher crash invoice INV-P-0001 → 2 days × 90' @ £150 = £300
 * (was 4 days / £600 weekly pack).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-adam-pilcher-crash-2days-300.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "354";
const TARGET = 300;

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

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, payment_status, line_items, notes")
  .eq("contact_id", CONTACT_ID)
  .eq("invoice_number", "INV-P-0001")
  .maybeSingle();
if (error || !share) {
  console.error("invoice not found", error);
  Deno.exit(1);
}

console.log(`Current ${share.invoice_number}: £${share.amount_gbp} (${share.payment_status})`);

const productMap = await loadProductMap(admin);
const mapRow = productMap.get("AQUATIC_90") || productMap.get("AQUATIC_60");
const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_90",
    description: "Aquatic Activity 90' (1to1)",
    detail: "Summer crash course Jul 2026 — 2 days · 90'",
    dates: "17:00–18:30 · SwimFarm",
    quantity: 2,
    unit_price_gbp: 150,
    amount_gbp: TARGET,
    xero_item_code: xeroItemCodeForService(mapRow, "exempt"),
  },
];
const description = lineItemsToDescription(lineItems, { fundedProvision: true });
const notes =
  "Office crash course · Aquatic 90' · 2 days @ £150 = £300 · Summer crash Jul 2026 · Afterschool & Weekends. (Patched from 4-day £600 pack.)";

console.log("→ £300 · 2× Aquatic 90' @ £150");
if (!APPLY) {
  console.log("Dry run — re-run with APPLY=1");
  Deno.exit(0);
}

const now = new Date().toISOString();
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: TARGET,
    unit_price_gbp: TARGET,
    quantity: 1,
    line_description: description,
    line_items: lineItems,
    notes,
    payment_schedule: [
      {
        seq: 1,
        label: "Crash course · one payment",
        due_date: "2026-07-24",
        amount_gbp: TARGET,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    updated_at: now,
  })
  .eq("id", share.id);
if (upErr) {
  console.error(upErr);
  Deno.exit(1);
}

const { data: bookings } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, amount_gbp, notes, status")
  .eq("contact_id", CONTACT_ID)
  .eq("week_id", "w1")
  .in("status", ["awaiting_payment", "confirmed"])
  .order("created_at", { ascending: false })
  .limit(3);
for (const b of bookings || []) {
  await admin
    .from("portal_crash_summer_bookings")
    .update({
      amount_gbp: TARGET,
      notes: `${String(b.notes || "").slice(0, 80)} · patched to 2 days / £300`,
      updated_at: now,
    })
    .eq("id", b.id);
  console.log("booking updated", b.id);
}

const pdf = await regeneratePortalInvoiceSharePdf(admin, share.id);
console.log("PDF regen", pdf);

console.log("Done.");
