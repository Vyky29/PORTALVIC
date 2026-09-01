/**
 * Insert Yousef Alsamarai £143 Ealing outstanding (former client).
 *
 *   node database/local-vault/apply-ealing-yousef-alsamarai.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = path.join(
  root,
  "database/migrations/20260728200000_ealing_yousef_alsamarai_outstanding.sql",
);

console.log("[apply-ealing-yousef] applying…", sqlPath);
execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
console.log("[apply-ealing-yousef] done. Refresh Portal → Payments → Funded by LA.");
