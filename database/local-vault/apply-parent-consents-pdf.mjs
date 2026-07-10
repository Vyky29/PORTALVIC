/**
 * Apply annual consents PDF migration + deploy related edge functions.
 *
 *   node database/local-vault/apply-parent-consents-pdf.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260710013000_portal_participant_documents_annual_consents.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-parent-consents-pdf] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-parent-consents-pdf] 2/2 deploy functions…");
for (const fn of ["parent-portal-consents-save", "parent-portal-documents-list"]) {
  run(`npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`);
}

console.log("[apply-parent-consents-pdf] done.");
