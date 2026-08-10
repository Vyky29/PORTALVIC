/**
 * Upload Serine (contact 58) payment receipts into documents storage and
 * register them for parent-portal Invoices → Receipts downloads.
 *
 *   APPLY=1 node database/local-vault/office-serine-payment-receipts.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT_ID = "58";
const CLIENT_NAME = "Serine Hodroje";
const BUCKET = "documents";

const FILES = [
  {
    src: "/Users/victor/Downloads/attachment.pdf",
    title: "Payment receipt 1",
    filename: "Serine_payment_receipt_1.pdf",
    sort: 1,
  },
  {
    src: "/Users/victor/Downloads/attachment 2.pdf",
    title: "Payment receipt 2",
    filename: "Serine_payment_receipt_2.pdf",
    sort: 2,
  },
  {
    src: "/Users/victor/Downloads/attachment 3.pdf",
    title: "Refund 1",
    filename: "Serine_refund_1.pdf",
    sort: 3,
  },
  {
    src: "/Users/victor/Downloads/attachment 4.pdf",
    title: "Refund 2",
    filename: "Serine_refund_2.pdf",
    sort: 4,
  },
];

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

const { data: owner } = await admin.from("staff_profiles").select("id").limit(1).maybeSingle();
if (!owner?.id) {
  console.error("No staff_profiles row");
  process.exit(1);
}

const prefix = `${owner.id}/billing/receipts/${CONTACT_ID}/`;

const { data: existing } = await admin
  .from("documents")
  .select("id, title, file_url, related_client, document_type")
  .eq("document_type", "payment_receipt")
  .ilike("file_url", `%/billing/receipts/${CONTACT_ID}/%`);

console.log("existing receipts for contact", CONTACT_ID, (existing || []).length);

if (!APPLY) {
  for (const f of FILES) {
    console.log("would upload", f.title, "←", f.src, existsSync(f.src) ? "ok" : "MISSING");
  }
  console.log("Dry run. Re-run APPLY=1 to write.");
  process.exit(0);
}

// Replace prior Serine payment receipts for a clean set of 4.
for (const row of existing || []) {
  if (row.file_url) {
    await admin.storage.from(BUCKET).remove([String(row.file_url)]).catch(() => {});
  }
  await admin.from("documents").delete().eq("id", row.id);
  console.log("removed old", row.title, row.id);
}

const today = new Date().toISOString().slice(0, 10);
const created = [];

for (const f of FILES) {
  if (!existsSync(f.src)) {
    console.error("missing file", f.src);
    process.exit(1);
  }
  const bytes = readFileSync(f.src);
  const storagePath = `${prefix}${f.filename}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.error("upload failed", f.filename, upErr.message);
    process.exit(1);
  }

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: owner.id,
      document_type: "payment_receipt",
      category: "billing",
      title: f.title,
      related_date: today,
      related_client: CLIENT_NAME,
      file_url: storagePath,
      source_page: `parent_receipts:${CONTACT_ID}:${f.sort}`,
    })
    .select("id, title, file_url")
    .maybeSingle();

  if (docErr || !doc) {
    console.error("document insert failed", f.filename, docErr?.message);
    process.exit(1);
  }
  created.push(doc);
  console.log("ok", doc.title, doc.id);
}

console.log("Done:", created.length, "receipts for Serine (contact", CONTACT_ID + ")");
