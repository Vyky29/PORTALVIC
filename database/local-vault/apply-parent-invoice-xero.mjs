/**
 * Apply Xero link columns and deploy payment write-back functions.
 *
 *   node database/local-vault/apply-parent-invoice-xero.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260709220000_portal_parent_invoice_xero_link.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-parent-invoice-xero] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-parent-invoice-xero] 2/2 deploy functions…");
[
  "parent-portal-stripe-webhook",
  "portal-admin-parent-invoices-upsert",
  "portal-admin-parent-invoices-list",
  "parent-portal-credit-apply-invoice",
].forEach(function (fn) {
  run(`npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`);
});

console.log("[apply-parent-invoice-xero] done.");
console.log("See database/META-PARENT-INVOICE-XERO.md and META-PARENT-INVOICE-APPLE-PAY.md");
