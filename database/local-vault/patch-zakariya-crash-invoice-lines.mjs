/**
 * Fix Zakariya crash INV-P-CRASH-MRMCPDUG line layout + regenerate PDF (Paid stamp).
 *
 *   node database/local-vault/patch-zakariya-crash-invoice-lines.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INVOICE = "INV-P-CRASH-MRMCPDUG";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/private/parent-portal-secrets.env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const lineItems = [
  {
    description: "Climbing Activity 60' (1to1)",
    detail: "Summer crash Jul 2026 - 20th to 23rd",
    dates: "July, 12 to 1 pm - Westway",
    quantity: 4,
    unit_price_gbp: 75,
    amount_gbp: 300,
    service_key: "CLIMBING_60",
    xero_item_code: "CL",
  },
  {
    description: "Aquatic Activity 60' (1to1)",
    detail: "Summer crash Jul 2026 - 20th to 23rd (back-to-back after climb)",
    dates: "July, 1 to 2 pm - SwimFarm",
    quantity: 8,
    unit_price_gbp: 50,
    amount_gbp: 400,
    service_key: "AQUATIC_60",
    xero_item_code: "SW",
  },
];

const lineDescription =
  "Structured activity support delivered for a SEND participant.\n\n" +
  "Climbing Activity 60' (1to1)\nSummer crash Jul 2026 - 20th to 23rd\nJuly, 12 to 1 pm - Westway\n\n" +
  "Aquatic Activity 60' (1to1)\nSummer crash Jul 2026 - 20th to 23rd (back-to-back after climb)\nJuly, 1 to 2 pm - SwimFarm";

const admin = createClient(
  readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error || !share) throw new Error(error?.message || "invoice not found");

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    line_items: lineItems,
    line_description: lineDescription,
    updated_at: new Date().toISOString(),
  })
  .eq("id", share.id);
if (upErr) throw upErr;
console.log("patched line_items", INVOICE);
