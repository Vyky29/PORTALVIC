/**
 * Apply off-site/transport + annual renewal columns and deploy consent edge functions.
 *
 *   node database/local-vault/apply-parent-consents-offsite-annual.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260709200000_portal_participant_parent_consents_offsite_annual.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-parent-consents-offsite-annual] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-parent-consents-offsite-annual] 2/2 deploy functions…");
[
  "parent-portal-consents-load",
  "parent-portal-consents-save",
  "portal-admin-parent-consents-list",
].forEach(function (fn) {
  run(`npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`);
});

console.log("[apply-parent-consents-offsite-annual] done.");
