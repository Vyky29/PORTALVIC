/**
 * Serine INV-P-0087 → new INV-P with £100 credit line kept.
 * Void 0087 in Portal, clear Xero link notes; create paid replacement
 * ready for Push to Xero as awaiting payment (no Payment write-back).
 *
 *   node database/local-vault/recreate-serine-inv-p-credit-xero.mjs
 *   node database/local-vault/recreate-serine-inv-p-credit-xero.mjs --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const OLD_NUMBER = "INV-P-0087";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/private/parent-portal-secrets.env"),
  ]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      if (line.startsWith(key + "=")) {
        return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return "";
}

const url = readEnv("SUPABASE_URL") || readEnv("PORTAL_SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("PORTAL_SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function nextInvP() {
  const { data } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number")
    .like("invoice_number", "INV-P-%");
  let max = 0;
  for (const r of data || []) {
    const m = String(r.invoice_number || "").match(/^INV-P-(\d{4})$/);
    if (!m) continue;
    const n = Number(m[1]);
    // Skip demo / test blocks 099x and 99xx
    if (n >= 900 && n < 10000) continue;
    if (n > max) max = n;
  }
  return `INV-P-${String(max + 1).padStart(4, "0")}`;
}

const { data: old, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", OLD_NUMBER)
  .maybeSingle();
if (error || !old) {
  console.error("Old invoice not found", error?.message);
  process.exit(1);
}

const lines = Array.isArray(old.line_items) ? old.line_items : [];
const credit = lines.find((l) => Number(l.amount_gbp) < 0 || /credit/i.test(String(l.description || "")));
const sum = lines.reduce((a, l) => a + Number(l.amount_gbp || 0), 0);
const newNumber = await nextInvP();

console.log({
  mode: APPLY ? "APPLY" : "DRY_RUN",
  old: OLD_NUMBER,
  newNumber,
  amount_gbp: old.amount_gbp,
  line_sum: Math.round(sum * 100) / 100,
  credit_line: credit || null,
  old_xero_invoice_id: old.xero_invoice_id,
  old_xero_payment_id: old.xero_payment_id,
});

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to void 0087 and insert the replacement.");
  console.log("Then in Xero: delete Payment on INV-P-0087 → Void the invoice.");
  console.log("Then Push to Xero for the new number (awaiting payment).");
  process.exit(0);
}

const now = new Date().toISOString();
const { error: voidErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_status: "void",
    share_status: "hidden",
    notes: [
      String(old.notes || "").trim(),
      `Superseded by ${newNumber} (Xero recreate with £100 credit line; old Xero ${old.xero_invoice_id || "n/a"} / pay ${old.xero_payment_id || "n/a"}).`,
    ]
      .filter(Boolean)
      .join("\n"),
    xero_push_status: null,
    xero_push_error: `superseded_by_${newNumber}`,
    updated_at: now,
  })
  .eq("id", old.id);
if (voidErr) {
  console.error("void failed", voidErr.message);
  process.exit(1);
}

const { data: oldDoc, error: oldDocErr } = await admin
  .from("documents")
  .select("*")
  .eq("id", old.document_id)
  .maybeSingle();
if (oldDocErr || !oldDoc) {
  console.error("old document missing", oldDocErr?.message);
  process.exit(1);
}
const { data: newDoc, error: docErr } = await admin
  .from("documents")
  .insert({
    user_id: oldDoc.user_id,
    document_type: oldDoc.document_type,
    category: oldDoc.category,
    title: String(oldDoc.title || OLD_NUMBER).replace(OLD_NUMBER, newNumber),
    related_date: oldDoc.related_date,
    related_client: oldDoc.related_client,
    related_session_key: oldDoc.related_session_key,
    file_url: oldDoc.file_url,
    source_page: oldDoc.source_page || "finance_xero_recreate",
    created_at: now,
  })
  .select("id")
  .single();
if (docErr || !newDoc) {
  console.error("document clone failed", docErr?.message);
  process.exit(1);
}

const omit = new Set([
  "id",
  "invoice_number",
  "xero_invoice_id",
  "xero_payment_id",
  "xero_synced_at",
  "xero_push_status",
  "xero_push_error",
  "created_at",
  "updated_at",
  "document_id",
  "notes",
]);
const insert = {};
for (const [k, v] of Object.entries(old)) {
  if (omit.has(k)) continue;
  insert[k] = v;
}
insert.invoice_number = newNumber;
insert.payment_status = "paid";
insert.share_status = "ready";
insert.amount_gbp = 3325;
insert.amount_paid_gbp = 3325;
insert.xero_invoice_id = null;
insert.xero_payment_id = null;
insert.xero_synced_at = null;
insert.xero_push_status = null;
insert.xero_push_error = null;
insert.document_id = newDoc.id;
insert.notes = `Replacement for voided ${OLD_NUMBER}. Includes Credits −£100 (total £3,325). Portal paid; push to Xero as awaiting payment.`;
insert.created_at = now;
insert.updated_at = now;
insert.payment_schedule = [
  {
    seq: 1,
    label: "Autumn term · full payment",
    status: "paid",
    paid_at: old.paid_at || now,
    due_date: old.due_date || "2026-08-15",
    paid_via: old.paid_via || "admin",
    amount_gbp: 3325,
  },
];

const { data: created, error: insErr } = await admin
  .from("portal_parent_invoice_share")
  .insert(insert)
  .select("id, invoice_number, amount_gbp, payment_status, xero_invoice_id")
  .single();
if (insErr) {
  console.error("insert failed", insErr.message);
  process.exit(1);
}

console.log("created", created);
console.log("\nNext:");
console.log("1) Xero UI: remove Payment on INV-P-0087, then Void that invoice.");
console.log(`2) Finance → Push to Xero for ${newNumber} (awaiting payment, with credit line).`);
console.log("3) Match bank £3,325 to the new invoice and mark Paid in Xero.");
