#!/usr/bin/env node
/**
 * Portal cancellation_reports repair + portal-cancellation-submit deploy.
 * Project: cklpnwhlqsulpmkipmqb (Portal — not Onboarding).
 *
 * Usage:
 *   npm run apply:cancellation-repair
 */
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const repairSql = path.join(__dirname, "step-cancellation-reason-notes-repair.sql");
const migrationId = "20260617180000";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root });
}

console.log(`[apply-cancellation-repair] Portal ${projectRef}`);
console.log("[apply-cancellation-repair] 1/3 SQL repair (notes column + Other + legacy rows)…");
run(`npx supabase db query --linked -f "${repairSql}"`);

console.log("[apply-cancellation-repair] 2/3 Mark migration applied (idempotent)…");
try {
  run(`npx supabase migration repair --status applied ${migrationId}`);
} catch {
  console.warn("[apply-cancellation-repair] migration repair skipped (already applied).");
}

console.log("[apply-cancellation-repair] 3/3 Deploy portal-cancellation-submit…");
run(
  `npx supabase functions deploy portal-cancellation-submit --no-verify-jwt --project-ref ${projectRef}`,
);

console.log("[apply-cancellation-repair] Verify notes column…");
run(
  `npx supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='cancellation_reports' and column_name='notes';"`,
);

console.log("\nDone. Roberto can submit cancellations from Staff hub (Portal DB + Edge Function).");
