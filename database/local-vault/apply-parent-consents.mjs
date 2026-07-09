/**
 * Apply parent consents migration + deploy edge functions.
 * Uses linked Supabase CLI project (cklpnwhlqsulpmkipmqb).
 *
 *   node database/local-vault/apply-parent-consents.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260709194500_portal_participant_parent_consents.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-parent-consents] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-parent-consents] 2/2 deploy functions…");
run(
  `npx supabase functions deploy parent-portal-consents-load --no-verify-jwt --project-ref ${projectRef}`,
);
run(
  `npx supabase functions deploy parent-portal-consents-save --no-verify-jwt --project-ref ${projectRef}`,
);

console.log("[apply-parent-consents] done.");
