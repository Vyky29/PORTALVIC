/**
 * Apply credit→invoice column and deploy payment/credit edge functions.
 *
 *   node database/local-vault/apply-parent-credits-stripe-fees.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260709210000_portal_parent_credits_apply_invoice.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-parent-credits-stripe-fees] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-parent-credits-stripe-fees] 2/2 deploy functions…");
[
  "parent-portal-invoices-list",
  "parent-portal-invoice-checkout",
  "parent-portal-credit-apply-invoice",
].forEach(function (fn) {
  run(`npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`);
});

console.log("[apply-parent-credits-stripe-fees] done.");
console.log(
  "Optional secrets: STRIPE_FEE_PERCENT (default 1.5), STRIPE_FEE_FIXED_PENCE (default 20).",
);
