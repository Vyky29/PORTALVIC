#!/usr/bin/env node
/**
 * Empty portal-dm-audio + portal-dm-media via Storage API (service role).
 * Run AFTER step-chat-wipe-all-test-conversations.sql
 *
 *   node database/local-vault/wipe-chat-storage.mjs
 *
 * Requires database/local-vault/secrets.template.env with SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const ENV_CANDIDATES = [
  path.join(root, "local-secrets/secrets.env"),
  path.join(__dirname, "secrets.template.env"),
];
const BUCKETS = ["portal-dm-audio", "portal-dm-media"];

function readEnv(key) {
  for (const envPath of ENV_CANDIDATES) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (!line) continue;
    const val = line.slice(key.length + 1).trim();
    if (val) return val;
  }
  const fromProcess = String(process.env[key] || "").trim();
  if (fromProcess) return fromProcess;
  throw new Error(
    key + " missing — set in local-secrets/secrets.env or export in shell",
  );
}

async function listAllPaths(admin, bucket, prefix = "") {
  const out = [];
  const limit = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
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
      if (row.id == null) {
        const nested = await listAllPaths(admin, bucket, full);
        out.push(...nested);
      } else {
        out.push(full);
      }
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

async function emptyBucket(admin, bucket) {
  const paths = await listAllPaths(admin, bucket);
  if (!paths.length) {
    console.log(bucket + ": already empty");
    return 0;
  }
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw error;
    removed += chunk.length;
  }
  console.log(bucket + ": removed " + removed + " object(s)");
  return removed;
}

async function main() {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let total = 0;
  for (const bucket of BUCKETS) {
    total += await emptyBucket(admin, bucket);
  }
  console.log("Done. Total removed: " + total);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
