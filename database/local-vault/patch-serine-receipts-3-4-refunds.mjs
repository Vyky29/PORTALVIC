/**
 * Relabel Serine (contact 58) docs 3–4 as refunds (were uploaded as payment receipts).
 *
 *   APPLY=1 node database/local-vault/patch-serine-receipts-3-4-refunds.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT_ID = "58";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/private/parent-portal-secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const url = readEnv("SUPABASE_URL") || readEnv("PORTAL_SUPABASE_URL");
const serviceKey =
  readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("PORTAL_SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error("Missing Supabase URL / service role key");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RENAMES = [
  { matchTitle: /^Payment receipt 3$/i, title: "Refund 1", sourceSuffix: "refund:1" },
  { matchTitle: /^Payment receipt 4$/i, title: "Refund 2", sourceSuffix: "refund:2" },
  // Idempotent if already renamed
  { matchTitle: /^Refund 1$/i, title: "Refund 1", sourceSuffix: "refund:1" },
  { matchTitle: /^Refund 2$/i, title: "Refund 2", sourceSuffix: "refund:2" },
];

const { data: rows, error } = await admin
  .from("documents")
  .select("id, title, file_url, source_page")
  .eq("document_type", "payment_receipt")
  .ilike("file_url", `%/billing/receipts/${CONTACT_ID}/%`)
  .order("created_at", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log("found", (rows || []).length, "docs");
for (const row of rows || []) {
  console.log("-", row.title, row.id);
}

const updates = [];
for (const row of rows || []) {
  const rule = RENAMES.find((r) => r.matchTitle.test(String(row.title || "")));
  if (!rule) continue;
  if (String(row.title) === rule.title && String(row.source_page || "").includes("refund")) {
    console.log("already ok", row.title);
    continue;
  }
  updates.push({
    id: row.id,
    title: rule.title,
    source_page: `parent_receipts:${CONTACT_ID}:${rule.sourceSuffix}`,
  });
}

if (!updates.length) {
  console.log("Nothing to change (need Payment receipt 3/4 or already Refund 1/2).");
  process.exit(0);
}

for (const u of updates) {
  console.log(APPLY ? "update" : "would update", u.id, "→", u.title);
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("documents")
    .update({ title: u.title, source_page: u.source_page })
    .eq("id", u.id);
  if (upErr) {
    console.error(upErr.message);
    process.exit(1);
  }
}

console.log(APPLY ? "Done." : "Dry run. Re-run APPLY=1 to write.");
