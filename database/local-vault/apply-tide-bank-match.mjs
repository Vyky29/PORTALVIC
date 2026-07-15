/**
 * Apply Tide bank-match migration + deploy admin match functions.
 *
 *   node database/local-vault/apply-tide-bank-match.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260715010000_portal_tide_bank_matches.sql",
);

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("[apply-tide-bank-match] 1/2 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`);

console.log("[apply-tide-bank-match] 2/2 deploy functions…");
[
  "portal-admin-tide-match-upload",
  "portal-admin-tide-match-list",
  "portal-admin-tide-match-confirm",
  "portal-crash-summer-book",
].forEach(function (fn) {
  run(
    `npx supabase functions deploy ${fn} --no-verify-jwt --project-ref ${projectRef}`,
  );
});

console.log("[apply-tide-bank-match] done.");
console.log("See database/META-PARENT-INVOICE-TIDE-SECRETS.md");
