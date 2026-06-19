#!/usr/bin/env node
/** Remove inbox draft rows whose storage blob is missing. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = fs.readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8");
const url = env.match(/SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const admin = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "participant-achievements";

const { data: drafts } = await admin
  .from("portal_participant_achievement_photos")
  .select("id, storage_path")
  .eq("status", "draft")
  .eq("client_id", "_inbox");

let removed = 0;
for (const row of drafts || []) {
  const dl = await admin.storage.from(BUCKET).download(row.storage_path);
  if (!dl.error && dl.data?.size) continue;
  console.log("delete broken", row.storage_path);
  await admin.storage.from(BUCKET).remove([row.storage_path]);
  await admin.from("portal_participant_achievement_photos").delete().eq("id", row.id);
  removed += 1;
}
console.log("removed", removed);
