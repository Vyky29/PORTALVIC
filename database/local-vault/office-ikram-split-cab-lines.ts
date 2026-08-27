/**
 * Ikram Omar — split NHS day rate on INV-Ps into:
 *   Day Centre 5h (2:1)  £650 × 1.0203 = £663.195
 *   CAB (travel)         £100 × 1.0203 = £102.03
 * Total still £765.225 / day (same as before).
 *
 * Applies to Sep 2026–Jul 2027 monthly INV-Ps and regenerates PDFs.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ikram-split-cab-lines.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const UPLIFT = 1.0203;
const SERVICE_BASE = 650;
const CAB_BASE = 100;
const SERVICE_RATE = Math.round(SERVICE_BASE * UPLIFT * 10000) / 10000; // 663.195
const CAB_RATE = Math.round(CAB_BASE * UPLIFT * 10000) / 10000; // 102.03
const DAY_RATE = Math.round((SERVICE_RATE + CAB_RATE) * 10000) / 10000; // 765.225

const INVOICES = [
  "INV-P-0271",
  "INV-P-0272",
  "INV-P-0273",
  "INV-P-0274",
  "INV-P-0275",
  "INV-P-0276",
  "INV-P-0277",
  "INV-P-0278",
  "INV-P-0279",
  "INV-P-0280",
  "INV-P-0281",
];

const MARKER = "ikram_split_service_650_cab_100_uplift_2.03pct";

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

function splitLineItems(
  existing: PortalInvoiceLineItem[],
  targetTotal: number,
): PortalInvoiceLineItem[] {
  const out: PortalInvoiceLineItem[] = [];
  let alloc = 0;
  existing.forEach((ln, i) => {
    const q = Number(ln.quantity) || 0;
    const dates = String(ln.dates || "");
    const detailBase = String(ln.detail || "SwimFarm · 11:00–16:00 · 2:1");
    const isLast = i === existing.length - 1;

    let serviceAmt: number;
    let cabAmt: number;
    if (isLast) {
      const remaining = round2(targetTotal - alloc);
      cabAmt = round2(q * CAB_RATE);
      serviceAmt = round2(remaining - cabAmt);
    } else {
      serviceAmt = round2(q * SERVICE_RATE);
      cabAmt = round2(q * CAB_RATE);
    }
    alloc = round2(alloc + serviceAmt + cabAmt);

    out.push({
      service_key: "DAY_CENTRE_300",
      description: "Day Centre 5h (2:1)",
      detail: detailBase,
      dates,
      quantity: q,
      unit_price_gbp: SERVICE_RATE,
      amount_gbp: serviceAmt,
      xero_item_code: null,
    });
    out.push({
      service_key: "CAB_TRAVEL",
      description: "CAB (travel) · per day",
      detail: `${detailBase} · CAB`,
      dates,
      quantity: q,
      unit_price_gbp: CAB_RATE,
      amount_gbp: cabAmt,
      xero_item_code: null,
    });
  });

  const sum = round2(out.reduce((s, x) => s + Number(x.amount_gbp || 0), 0));
  const drift = round2(targetTotal - sum);
  if (drift !== 0 && out.length >= 2) {
    // Adjust last Day Centre line
    const lastService = out[out.length - 2];
    lastService.amount_gbp = round2(Number(lastService.amount_gbp) + drift);
  }
  return out;
}

console.log(
  `Ikram split · service £${SERVICE_BASE}→£${SERVICE_RATE} + CAB £${CAB_BASE}→£${CAB_RATE} = £${DAY_RATE}/day`,
);
console.log(APPLY ? "APPLY=1" : "Dry run (set APPLY=1)");

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,amount_gbp,quantity,unit_price_gbp,line_items,line_description,notes,share_status,payment_status",
  )
  .in("invoice_number", INVOICES)
  .eq("contact_id", "gap-ikram-omar");
if (error) throw error;

for (const inv of INVOICES) {
  const row = (rows || []).find((r) => r.invoice_number === inv);
  if (!row) {
    console.warn("missing", inv);
    continue;
  }
  const existing = (Array.isArray(row.line_items) ? row.line_items : []) as PortalInvoiceLineItem[];
  // Prefer day-centre lines only (skip if already split)
  const dayLines = existing.filter(
    (ln) =>
      !String(ln.service_key || "").includes("CAB") &&
      !String(ln.description || "").toLowerCase().includes("cab"),
  );
  const sessions =
    Number(row.quantity) ||
    dayLines.reduce((s, ln) => s + (Number(ln.quantity) || 0), 0);
  const targetTotal = round2(sessions * DAY_RATE);
  const lineItems = splitLineItems(
    dayLines.length ? dayLines : existing,
    targetTotal,
  );
  const desc = lineItemsToDescription(lineItems);
  const noteBit =
    ` · ${MARKER} · Day Centre £${SERVICE_BASE}+CAB £${CAB_BASE} ×${UPLIFT} = £${DAY_RATE}/day`;
  const notes = `${String(row.notes || "").replace(/\s·\s*ikram_split_service_650_cab_100_uplift_2\.03pct[^·]*/g, "").trim()}${noteBit}`;

  console.log(
    `${inv} sessions=${sessions} total £${targetTotal} lines ${existing.length}→${lineItems.length} (${row.share_status})`,
  );
  for (const ln of lineItems) {
    console.log(
      `  ${ln.description} ×${ln.quantity} @ £${ln.unit_price_gbp} = £${ln.amount_gbp} · ${ln.dates}`,
    );
  }

  if (!APPLY) continue;

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      line_items: lineItems,
      line_description: desc,
      amount_gbp: targetTotal,
      unit_price_gbp: DAY_RATE,
      quantity: sessions,
      notes,
      updated_at: now,
    })
    .eq("id", row.id);
  if (upErr) throw upErr;

  try {
    await regeneratePortalInvoiceSharePdf(admin, String(row.id));
    console.log("  PDF regenerated");
  } catch (e) {
    console.warn("  PDF regen failed", e);
  }
}

console.log(APPLY ? "Done." : "Dry OK. APPLY=1 to write + regen PDFs.");
