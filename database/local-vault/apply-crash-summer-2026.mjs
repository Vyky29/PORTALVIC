/**
 * Apply Summer Jul 2026 crash course migration + deploy booking functions.
 *
 *   node database/local-vault/apply-crash-summer-2026.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260713220000_portal_crash_summer_2026.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-crash-summer-2026] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-crash-summer-2026] 2/2 deploy functions…");
const fns = [
  "portal-crash-summer-availability",
  "portal-crash-summer-book",
  "parent-portal-stripe-webhook",
  "parent-portal-gocardless-webhook",
  "parent-portal-credit-apply-invoice",
  "portal-admin-parent-invoices-upsert",
];
for (const fn of fns) {
  run(
    `npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`,
  );
}

console.log("[apply-crash-summer-2026] done.");
