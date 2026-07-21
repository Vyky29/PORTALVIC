/**
 * Fix Elia demo invoices: VAT exempt (not 20%), regenerate PDFs.
 *
 *   node database/local-vault/patch-elia-invoices-exempt.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contactId = "elia-matilla-demo";
const invoiceNumbers = ["INV-P-0991", "INV-P-0992", "INV-P-0993"];

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: payRow } = await admin
  .from("client_payments")
  .select("client_key, data")
  .eq("client_key", "elia-matilla-2526")
  .maybeSingle();

if (payRow?.data && typeof payRow.data === "object") {
  const data = { ...payRow.data, VAT: "Exempt", Fund: "LA Direct Payment (EHCP)" };
  const { error } = await admin
    .from("client_payments")
    .update({ data })
    .eq("client_key", payRow.client_key);
  if (error) {
    console.error("client_payments update failed", error.message);
    process.exit(1);
  }
  console.log("[ok] client_payments VAT → Exempt");
}

await admin
  .from("portal_parent_contacts")
  .update({
    funding_label: "LA Direct Payment (EHCP)",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", contactId);

const { data: shares } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .eq("contact_id", contactId)
  .in("invoice_number", invoiceNumbers);

for (const share of shares || []) {
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({ vat_mode: "exempt", updated_at: new Date().toISOString() })
    .eq("id", share.id);
  if (error) {
    console.error("share update failed", share.invoice_number, error.message);
    process.exit(1);
  }
  console.log("[ok] vat_mode exempt →", share.invoice_number);
}

console.log("\nRegenerating PDFs (deno)…");
const deno = await import("node:child_process").then(({ spawnSync }) =>
  spawnSync(
    "npx",
    [
      "--yes",
      "deno@2.2.0",
      "run",
      "--no-lock",
      "--allow-net",
      "--allow-env",
      "--allow-read",
      path.join(root, "database/local-vault/patch-elia-invoices-exempt-regen.ts"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
      env: {
        ...process.env,
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      },
    },
  ),
);
if (deno.status !== 0) {
  console.error("PDF regeneration failed — deploy portal-admin-parent-invoices-upsert first");
  process.exit(deno.status || 1);
}

console.log("\nDone. Elia invoices are VAT Exempt with updated PDFs.");
