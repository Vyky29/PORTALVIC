#!/usr/bin/env node
/**
 * Re-seed portal_participant_service_lines from the roster-review dataset.
 *
 * 1) Regenerates the migration SQL from working_ui/client_services_review.html
 *    (via gen-service-lines-migration.mjs).
 * 2) Re-applies it on the linked Portal Supabase (upsert by client_key).
 *
 * Use this after the roster changes and the review tool has been regenerated,
 * OR just to push the current embedded dataset. For pushing manual edits made
 * inside the review tool, prefer the "Publish to portal" button in that page.
 *
 *   node database/local-vault/apply-service-lines-reseed.mjs
 */
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const migration = "database/migrations/20260705231500_portal_participant_service_lines.sql";

console.log("→ Regenerating migration from client_services_review.html…");
execSync(`node "${path.join(__dirname, "gen-service-lines-migration.mjs")}"`, {
  stdio: "inherit",
  cwd: root,
});

console.log("→ Applying to linked Portal Supabase…");
execSync(`npx supabase db query --linked -f "${migration}"`, {
  stdio: "inherit",
  cwd: root,
});

console.log("✓ portal_participant_service_lines re-seeded.");
