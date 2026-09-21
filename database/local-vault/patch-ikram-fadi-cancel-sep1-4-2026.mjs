/**
 * Ikram + Fadi cancels for early Sep 2026 — CURRENTLY NONE.
 * Tue 1 / Wed 2 / Thu 3 (Fadi) all attend. Ikram never Thursdays.
 *
 * Kept as a stub so old APPLY runs do not re-introduce Wed/Thu cancels.
 *
 *   APPLY=1 node database/local-vault/patch-ikram-fadi-cancel-sep1-4-2026.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1";

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(ROOT, "local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL || process.env.PORTAL_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL / service role key");

async function sb(method, pathQs, body) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const r = await fetch(`${url}/rest/v1/${pathQs}`, {
    method,
    headers: method === "GET" ? { apikey: key, Authorization: `Bearer ${key}` } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${method} ${pathQs} → ${r.status}: ${text}`);
  return data;
}

console.log("No Ikram/Fadi cancels for Sep 1–4 (Wed clients attend; Thu Fadi attends).");
console.log("This script only clears stray active cancels in that window.");

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to clear.");
  process.exit(0);
}

const prior = await sb(
  "GET",
  "schedule_overrides?select=id,session_date,anchor_staff_id,anchor_client_id,anchor_time_slot_label&status=eq.active&session_date=gte.2026-09-01&session_date=lte.2026-09-04&or=(anchor_client_id.eq.ikram,anchor_client_id.eq.fadi)&override_type=eq.slot_clear_client"
);
console.log(`Clearing ${(prior || []).length} stray cancels…`);
for (const row of prior || []) {
  await sb("DELETE", `schedule_overrides?id=eq.${row.id}`);
  console.log("  deleted", row.session_date, row.anchor_staff_id, row.anchor_client_id);
}
void ADMIN_UID;
console.log("Done.");
