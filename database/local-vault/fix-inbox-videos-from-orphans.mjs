#!/usr/bin/env node
/**
 * If a participant-folder orphan shares a filename with an inbox draft video,
 * prefer the orphan bytes (often the untouched original) via storage move.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const BUCKET = "participant-achievements";
const DRY = process.argv.includes("--dry-run");

function readEnv(key) {
  for (const envPath of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(__dirname, "secrets.template.env"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (!line) continue;
    const val = line.slice(key.length + 1).trim();
    if (val) return val;
  }
  throw new Error(key + " missing");
}

async function sizeOf(admin, p) {
  const dl = await admin.storage.from(BUCKET).download(p);
  if (dl.error || !dl.data) return -1;
  return dl.data.size || -1;
}

async function listAll(admin, prefix) {
  const out = [];
  const limit = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;
    for (const row of rows) {
      const name = String(row.name || "");
      if (!name) continue;
      const full = prefix ? prefix + "/" + name : name;
      if (row.id == null) out.push(...(await listAll(admin, full)));
      else out.push(full);
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: drafts } = await admin
    .from("portal_participant_achievement_photos")
    .select("id, storage_path, media_type")
    .eq("status", "draft")
    .eq("client_id", "_inbox")
    .eq("media_type", "video");
  if (!drafts?.length) {
    console.log("No inbox video drafts.");
    return;
  }

  const staffRoots = [...new Set(drafts.map((d) => String(d.storage_path).split("/")[0]))];
  const byBase = Object.create(null);
  for (const staffId of staffRoots) {
    for (const p of await listAll(admin, staffId)) {
      const base = path.basename(p);
      if (!byBase[base]) byBase[base] = [];
      byBase[base].push(p);
    }
  }

  let replaced = 0;
  for (const row of drafts) {
    const inboxPath = row.storage_path;
    const base = path.basename(inboxPath);
    const candidates = (byBase[base] || []).filter(
      (p) => p !== inboxPath && !p.includes("/_inbox/") && /\.(webm|mp4|mov|m4v)$/i.test(p)
    );
    if (!candidates.length) continue;

    const inboxSize = await sizeOf(admin, inboxPath);
    let best = null;
    let bestSize = inboxSize;
    for (const cand of candidates) {
      const sz = await sizeOf(admin, cand);
      if (sz > bestSize) {
        best = cand;
        bestSize = sz;
      }
    }
    if (!best) continue;

    console.log("[replace video]", inboxPath, "←", best, `(inbox ${inboxSize} → ${bestSize})`);
    if (DRY) {
      replaced += 1;
      continue;
    }
    const tmp = inboxPath + ".repair.tmp";
    const mv1 = await admin.storage.from(BUCKET).move(inboxPath, tmp);
    if (mv1.error) {
      console.error("  temp move failed", mv1.error.message);
      continue;
    }
    const mv2 = await admin.storage.from(BUCKET).move(best, inboxPath);
    if (mv2.error) {
      await admin.storage.from(BUCKET).move(tmp, inboxPath);
      console.error("  swap failed", mv2.error.message);
      continue;
    }
    await admin.storage.from(BUCKET).remove([tmp]);
    replaced += 1;
  }

  console.log(JSON.stringify({ dryRun: DRY, replaced }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
