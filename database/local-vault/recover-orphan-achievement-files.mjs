#!/usr/bin/env node
/**
 * Recover orphan files in participant-achievements bucket into inbox draft rows.
 * Also report inbox draft rows whose blob fails download.
 *
 * Usage:
 *   node database/local-vault/recover-orphan-achievement-files.mjs --dry-run
 *   node database/local-vault/recover-orphan-achievement-files.mjs
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

function parsePath(name) {
  const parts = String(name || "").split("/");
  if (parts.length < 4) return null;
  const [staffId, sessionDate, clientFolder, fileName] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return null;
  const ext = path.extname(fileName).toLowerCase();
  const mediaType = [".webm", ".mp4", ".mov", ".m4v"].includes(ext) ? "video" : "photo";
  const clientId = clientFolder === "_inbox" ? "_inbox" : clientFolder.toLowerCase();
  const clientName = clientId === "_inbox" ? "Inbox" : clientFolder;
  const inboxPath =
    clientId === "_inbox"
      ? name
      : name.replace("/" + clientFolder + "/", "/_inbox/");
  return { staffId, sessionDate, clientId, clientName, fileName, mediaType, inboxPath, sourcePath: name };
}

async function blobOk(admin, storagePath) {
  const dl = await admin.storage.from(BUCKET).download(storagePath);
  return !dl.error && dl.data && dl.data.size > 0 ? dl.data : null;
}

async function staffName(admin, staffId) {
  const res = await admin.from("staff_profiles").select("full_name, username").eq("id", staffId).maybeSingle();
  if (res.error || !res.data) return "Staff";
  return String(res.data.full_name || res.data.username || "Staff").trim() || "Staff";
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stats = { recovered: 0, movedToInbox: 0, brokenDraftRows: 0, skipped: 0, errors: 0 };
  const nameCache = Object.create(null);

  // List orphans via SQL through supabase-js is awkward; use preloaded list from env file written by caller or scan known prefixes.
  // Fetch all draft paths for dedupe.
  const { data: existing } = await admin.from("portal_participant_achievement_photos").select("storage_path");
  const known = new Set((existing || []).map((r) => r.storage_path));

  // Use storage list recursively from staff roots we know are active.
  const staffIds = [
    "4ae392bb-edd1-4aea-88bb-19eedc2a03c1",
    "98e2738b-07a0-4cd2-8b7a-a9487d64a292",
    "fec4f699-739e-48ee-ba0c-604f9887e874",
    "7b664437-9da9-468b-8be1-3e8bc54ed7aa",
    "a0d439df-3a8f-439d-b427-b3459552eae1",
    "c93d7eb1-3ab0-4cdb-9a7f-562632ee8e77",
    "b85cdca7-4c7d-48c3-9bb8-a48c95841a4e",
  ];

  async function listAll(prefix) {
    const out = [];
    const limit = 1000;
    let offset = 0;
    for (;;) {
      const { data, error: listErr } = await admin.storage.from(BUCKET).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (listErr) throw listErr;
      const rows = data || [];
      if (!rows.length) break;
      for (const row of rows) {
        const name = String(row.name || "");
        if (!name) continue;
        const full = prefix ? prefix + "/" + name : name;
        if (row.id == null) {
          out.push(...(await listAll(full)));
        } else {
          out.push(full);
        }
      }
      if (rows.length < limit) break;
      offset += limit;
    }
    return out;
  }

  const orphanPaths = [];
  for (const staffId of staffIds) {
    const paths = await listAll(staffId);
    for (const p of paths) {
      if (!known.has(p)) orphanPaths.push(p);
    }
  }

  console.log("orphan paths found:", orphanPaths.length);

  for (const sourcePath of orphanPaths) {
    const parsed = parsePath(sourcePath);
    if (!parsed) {
      stats.skipped += 1;
      continue;
    }
    const blob = await blobOk(admin, sourcePath);
    if (!blob) {
      console.log("[orphan-no-blob]", sourcePath);
      stats.skipped += 1;
      continue;
    }

    let targetPath = parsed.inboxPath;
    if (sourcePath !== targetPath) {
      const inboxBlob = await blobOk(admin, targetPath);
      if (!inboxBlob) {
        console.log("[move→inbox]", sourcePath, "→", targetPath);
        if (!DRY) {
          const ctype = blob.type && blob.type !== "application/octet-stream" ? blob.type : undefined;
          const up = await admin.storage.from(BUCKET).upload(targetPath, blob, {
            contentType: ctype || (parsed.mediaType === "video" ? "video/webm" : "image/jpeg"),
            upsert: false,
          });
          if (up.error) {
            console.error("  upload failed", up.error.message);
            stats.errors += 1;
            continue;
          }
          await admin.storage.from(BUCKET).remove([sourcePath]);
        }
        stats.movedToInbox += 1;
      } else if (!DRY) {
        await admin.storage.from(BUCKET).remove([sourcePath]);
      }
    }

    if (known.has(targetPath)) continue;

    if (!nameCache[parsed.staffId]) nameCache[parsed.staffId] = await staffName(admin, parsed.staffId);
    console.log("[recover row]", targetPath);
    if (!DRY) {
      const ins = await admin.from("portal_participant_achievement_photos").insert([
        {
          staff_user_id: parsed.staffId,
          staff_display_name: nameCache[parsed.staffId],
          client_id: "_inbox",
          client_name: "Inbox",
          session_date: parsed.sessionDate,
          storage_path: targetPath,
          status: "draft",
          media_type: parsed.mediaType,
        },
      ]);
      if (ins.error) {
        console.error("  insert failed", ins.error.message);
        stats.errors += 1;
        continue;
      }
    }
    known.add(targetPath);
    stats.recovered += 1;
  }

  const { data: drafts } = await admin
    .from("portal_participant_achievement_photos")
    .select("id, storage_path, media_type")
    .eq("status", "draft")
    .eq("client_id", "_inbox");
  for (const row of drafts || []) {
    const blob = await blobOk(admin, row.storage_path);
    if (!blob) {
      stats.brokenDraftRows += 1;
      console.log("[broken-draft]", row.media_type, row.storage_path);
    }
  }

  console.log(JSON.stringify({ dryRun: DRY, ...stats }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
