#!/usr/bin/env node
/**
 * Apply achievement shared gallery migrations on Portal Supabase via CLI.
 * Project: cklpnwhlqsulpmkipmqb
 *
 * Normal path (history in sync): `npx supabase db push --yes`
 *
 * Usage:
 *   node database/local-vault/apply-achievement-shared-pool.mjs
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const migDir = path.join(root, "supabase/migrations");
const archiveDir = path.join(migDir, ".duplicate-archive");
const projectRef = "cklpnwhlqsulpmkipmqb";
const TARGETS = ["20260701120000", "20260701120100"];

function run(cmd, { allowFail = false } = {}) {
  try {
    const out = execSync(cmd, { stdio: "pipe", cwd: root, encoding: "utf8" });
    return { ok: true, out };
  } catch (err) {
    const out = `${err.stdout || ""}${err.stderr || ""}`;
    if (allowFail) return { ok: false, out };
    throw Object.assign(new Error(out.trim() || String(err)), { out });
  }
}

function migrationListText() {
  return run("npx supabase migration list --linked").out;
}

function targetsApplied(text) {
  return TARGETS.every((id) => new RegExp(`^\\s*${id}\\s*\\|\\s*${id}\\s*\\|`, "m").test(text));
}

function insertBeforeFiles(output) {
  const files = [];
  let inList = false;
  for (const line of output.split("\n")) {
    if (/inserted before the last migration/i.test(line)) inList = true;
    else if (inList && /supabase\/migrations\/\d{14}_.+\.sql/.test(line)) {
      const m = line.match(/supabase\/migrations\/(\d{14}_.+\.sql)/);
      if (m) files.push(m[1]);
    } else if (inList && line.trim() === "" && files.length) break;
  }
  return files;
}

function archive(name) {
  fs.mkdirSync(archiveDir, { recursive: true });
  const from = path.join(migDir, name);
  if (!fs.existsSync(from)) return;
  fs.renameSync(from, path.join(archiveDir, name));
  console.warn(`  archived ${name}`);
}

function restoreArchive() {
  if (!fs.existsSync(archiveDir)) return;
  for (const name of fs.readdirSync(archiveDir).filter((f) => f.endsWith(".sql"))) {
    fs.renameSync(path.join(archiveDir, name), path.join(migDir, name));
  }
  fs.rmdirSync(archiveDir);
}

console.log(`[apply-achievement-shared-pool] Portal ${projectRef}`);

try {
  for (let round = 1; round <= 40; round += 1) {
    if (targetsApplied(migrationListText())) break;

    const push = run("npx supabase db push --yes", { allowFail: true });
    if (push.ok) break;

    const blockers = insertBeforeFiles(push.out);
    if (blockers.length) {
      console.log(`[apply-achievement-shared-pool] round ${round}: archive ${blockers.length} out-of-order files…`);
      for (const name of blockers) {
        const sql = path.join(migDir, name);
        if (fs.existsSync(sql)) run(`npx supabase db query --linked -f "${sql}"`, { allowFail: true });
        archive(name);
      }
      continue;
    }

    console.error(push.out);
    throw new Error("[apply-achievement-shared-pool] db push failed.");
  }

  if (!targetsApplied(migrationListText())) {
    throw new Error("[apply-achievement-shared-pool] target migrations still missing.");
  }

  console.log("[apply-achievement-shared-pool] verify storage policy…");
  const policy = run(
    `npx supabase db query --linked --output json "select pg_get_expr(polqual, polrelid) as qual from pg_policy where polname = 'portal_achievement_storage_select_staff_shared';"`,
  );
  if (!/archived_unused/.test(policy.out)) {
    throw new Error("[apply-achievement-shared-pool] storage policy missing archived_unused.");
  }

  console.log("[apply-achievement-shared-pool] verify finalize RPC…");
  const rpc = run(
    `npx supabase db query --linked --output json "select prosrc from pg_proc where proname = 'portal_finalize_achievement_photos' limit 1;"`,
  );
  if (!/too_many_attachments/.test(rpc.out)) {
    throw new Error("[apply-achievement-shared-pool] finalize RPC missing too_many_attachments.");
  }

  console.log("\nDone. Shared daily gallery + feedback pool (max 10) live on Portal.");
} finally {
  restoreArchive();
}
