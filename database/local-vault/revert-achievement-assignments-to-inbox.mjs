#!/usr/bin/env node
/**
 * Repair inbox-assign damage on participant-achievements storage.
 *
 * - Working assigned drafts: copy blob back to _inbox, update DB, remove participant copy.
 * - Broken assigned drafts (metadata only, no blob): delete row + storage metadata.
 *
 * Usage:
 *   node database/local-vault/revert-achievement-assignments-to-inbox.mjs
 *   node database/local-vault/revert-achievement-assignments-to-inbox.mjs --dry-run
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

function inboxPath(storagePath, clientId) {
  const cid = String(clientId || "").trim().toLowerCase();
  if (!cid || cid === "_inbox") return "";
  const needle = "/" + cid + "/";
  const from = String(storagePath || "");
  const idx = from.indexOf(needle);
  if (idx < 0) return "";
  return from.slice(0, idx) + "/_inbox/" + from.slice(idx + needle.length);
}

function contentTypeForPath(p) {
  if (/\.webm$/i.test(p)) return "video/webm";
  if (/\.mp4$/i.test(p)) return "video/mp4";
  if (/\.png$/i.test(p)) return "image/png";
  return "image/jpeg";
}

function contentTypeForBlob(blob, storagePath) {
  const t = String((blob && blob.type) || "").trim();
  if (t && t !== "application/octet-stream") return t.split(";")[0];
  return contentTypeForPath(storagePath);
}

async function moveStorage(admin, fromPath, toPath) {
  if (typeof admin.storage.from(BUCKET).move === "function") {
    const mv = await admin.storage.from(BUCKET).move(fromPath, toPath);
    if (!mv.error) return "move";
  }
  const dl = await admin.storage.from(BUCKET).download(fromPath);
  if (dl.error || !dl.data || !dl.data.size) throw dl.error || new Error("Missing source blob");
  const up = await admin.storage.from(BUCKET).upload(toPath, dl.data, {
    contentType: contentTypeForBlob(dl.data, toPath),
    upsert: false,
  });
  if (up.error) throw up.error;
  await admin.storage.from(BUCKET).remove([fromPath]);
  return "copy";
}

async function blobOk(admin, storagePath) {
  const dl = await admin.storage.from(BUCKET).download(storagePath);
  return !dl.error && dl.data && dl.data.size > 0 ? dl.data : null;
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await admin
    .from("portal_participant_achievement_photos")
    .select("id, client_id, client_name, storage_path, status")
    .neq("client_id", "_inbox")
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const stats = { reverted: 0, deletedBroken: 0, skipped: 0, errors: 0 };

  for (const row of rows || []) {
    const participantPath = String(row.storage_path || "").trim();
    const inbox = inboxPath(participantPath, row.client_id);
    if (!participantPath || !inbox) {
      stats.skipped += 1;
      continue;
    }

    const blob = await blobOk(admin, participantPath);
    if (!blob) {
      console.log("[broken] delete", row.client_id, participantPath);
      if (!DRY) {
        await admin.storage.from(BUCKET).remove([participantPath]);
        const del = await admin.from("portal_participant_achievement_photos").delete().eq("id", row.id);
        if (del.error) {
          console.error("  delete row failed", row.id, del.error.message);
          stats.errors += 1;
          continue;
        }
      }
      stats.deletedBroken += 1;
      continue;
    }

    console.log("[revert]", row.client_id, "→ _inbox", path.basename(inbox));
    if (DRY) {
      stats.reverted += 1;
      continue;
    }

    const existingInbox = await blobOk(admin, inbox);
    if (existingInbox) {
      const rm = await admin.storage.from(BUCKET).remove([participantPath]);
      if (rm.error) console.warn("  remove participant copy", rm.error.message);
    } else {
      try {
        await moveStorage(admin, participantPath, inbox);
      } catch (moveErr) {
        console.error("  move inbox failed", inbox, moveErr.message || moveErr);
        stats.errors += 1;
        continue;
      }
    }

    const upd = await admin
      .from("portal_participant_achievement_photos")
      .update({
        client_id: "_inbox",
        client_name: "Inbox",
        storage_path: inbox,
      })
      .eq("id", row.id);
    if (upd.error) {
      console.error("  update row failed", row.id, upd.error.message);
      stats.errors += 1;
      continue;
    }
    stats.reverted += 1;
  }

  console.log(JSON.stringify({ dryRun: DRY, ...stats }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
