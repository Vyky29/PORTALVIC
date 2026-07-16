/**
 * Seed a £5 GoCardless demo invoice for Elia / Victor Matilla parent portal test.
 *
 *   node database/local-vault/seed-elia-gocardless-test-invoice.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contactId = "elia-matilla-demo";
const invoiceNumber = "TEST-ELIA-GC-5";
const amount = 5;

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
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

function miniPdf(label) {
  const safe = String(label).slice(0, 80);
  return Buffer.from(
    `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 220] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 120 >>stream
BT /F1 12 Tf 24 140 Td (${safe}) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000440 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
517
%%EOF
`,
  );
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
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

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, share_status")
  .eq("contact_id", contactId)
  .eq("invoice_number", invoiceNumber)
  .maybeSingle();

if (existing && existing.payment_status !== "paid") {
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: amount,
      payment_status: "unpaid",
      share_status: "ready",
      payment_method_hint: "gocardless",
      gocardless_url: null,
      gocardless_payment_id: null,
      paid_at: null,
      paid_via: null,
      notes:
        "Demo £5 Direct Payment (GoCardless) — set up mandate and first collection test for Victor Matilla.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) {
    console.error("update failed", error.message);
    process.exit(1);
  }
  console.log("[updated]", existing.id, invoiceNumber);
  process.exit(0);
}

if (existing?.payment_status === "paid") {
  console.log("[skip paid]", existing.id);
  process.exit(0);
}

const due = new Date();
due.setDate(due.getDate() + 7);
const dueIso = due.toISOString().slice(0, 10);
const stamp = Date.now();
const storagePath = `${owner.id}/billing/client_invoice_${contactId}_${invoiceNumber}_${stamp}.pdf`;
const pdf = miniPdf(`${invoiceNumber} GBP ${amount}`);

const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: false,
});
if (upErr) {
  console.error("upload failed", upErr.message);
  process.exit(1);
}

const { data: doc, error: docErr } = await admin
  .from("documents")
  .insert({
    user_id: owner.id,
    document_type: "client_invoice",
    category: "billing",
    title: "Demo £5 — Direct Payment (GoCardless)",
    related_date: dueIso,
    related_client: "Elia",
    file_url: storagePath,
    source_page: "seed_elia_gocardless_test",
  })
  .select("id")
  .maybeSingle();

if (docErr || !doc) {
  console.error("document insert failed", docErr?.message);
  process.exit(1);
}

const { data: share, error: shareErr } = await admin
  .from("portal_parent_invoice_share")
  .insert({
    document_id: doc.id,
    contact_id: contactId,
    invoice_number: invoiceNumber,
    amount_gbp: amount,
    due_date: dueIso,
    payment_status: "unpaid",
    share_status: "ready",
    ready_at: new Date().toISOString(),
    ready_by: "seed_elia_gocardless_test",
    notes:
      "Demo £5 Direct Payment (GoCardless) — tap Set up Direct Payment to authorise mandate + first £5 collection.",
    payment_method_hint: "gocardless",
    reference_text: invoiceNumber,
    line_description: "Demo £5 — GoCardless mandate test",
  })
  .select("id, invoice_number, amount_gbp, payment_method_hint, payment_status")
  .maybeSingle();

if (shareErr || !share) {
  console.error("share insert failed", shareErr?.message);
  process.exit(1);
}

console.log("[created]", share);
console.log("\nParent login: Victor / Matilla / 20102012");
console.log("Elia → Invoices → TEST-ELIA-GC-5 → Set up Direct Payment");
