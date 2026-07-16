/**
 * Seed two £20 demo invoices for Elia parent portal payment tests:
 *   - TEST-ELIA-BANK-20  → bank transfer / Tide + "I've paid"
 *   - TEST-ELIA-CARD-20  → Card / Apple Pay (Stripe)
 *
 *   node database/local-vault/seed-elia-payment-test-invoices.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contactId = "elia-matilla-demo";
const amount = 20;

const INVOICES = [
  {
    invoiceNumber: "TEST-ELIA-BANK-20",
    title: "Demo £20 — bank transfer test",
    notes: "Demo invoice for Tide / bank transfer testing. Use the payee details and tap I've paid by bank transfer.",
    payment_method_hint: "bank_transfer",
  },
  {
    invoiceNumber: "TEST-ELIA-CARD-20",
    title: "Demo £20 — Card / Apple Pay test",
    notes: "Demo invoice for Stripe Card / Apple Pay testing. Tap Pay by card — ignore bank transfer on this one.",
    payment_method_hint: "bank_transfer",
  },
];

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  const candidates = [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ];
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith(key + "="));
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

const { data: authUser } = await admin
  .from("staff_profiles")
  .select("id")
  .eq("email", "victor@clubsensational.org")
  .maybeSingle();

let ownerId = authUser?.id || null;
if (!ownerId) {
  const { data: anyAdmin } = await admin.from("staff_profiles").select("id").limit(1).maybeSingle();
  ownerId = anyAdmin?.id || null;
}
if (!ownerId) {
  console.error("No staff_profiles row to own the document");
  process.exit(1);
}

const due = new Date();
due.setDate(due.getDate() + 14);
const dueIso = due.toISOString().slice(0, 10);
const created = [];

for (const spec of INVOICES) {
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, payment_status, share_status, amount_gbp")
    .eq("contact_id", contactId)
    .eq("invoice_number", spec.invoiceNumber)
    .maybeSingle();

  if (existing) {
    if (existing.payment_status === "paid") {
      console.log("[skip paid]", spec.invoiceNumber, existing.id);
      created.push(existing);
      continue;
    }
    const { error: voidErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        share_status: "void",
        updated_at: new Date().toISOString(),
        notes: `Superseded ${new Date().toISOString()} for fresh payment test.`,
      })
      .eq("id", existing.id);
    if (voidErr) {
      console.error("void failed", spec.invoiceNumber, voidErr.message);
      process.exit(1);
    }
    console.log("[voided old unpaid]", spec.invoiceNumber, existing.id);
  }

  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${spec.invoiceNumber}_${stamp}.pdf`;
  const pdf = miniPdf(`${spec.invoiceNumber} GBP ${amount}`);

  const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) {
    console.error("upload failed", spec.invoiceNumber, upErr.message);
    process.exit(1);
  }

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: ownerId,
      document_type: "client_invoice",
      category: "billing",
      title: spec.title.replace(/^Demo £\d+ — /, ""),
      related_date: dueIso,
      related_client: "Elia",
      file_url: storagePath,
      source_page: "seed_elia_payment_test",
    })
    .select("id")
    .maybeSingle();

  if (docErr || !doc) {
    console.error("document insert failed", spec.invoiceNumber, docErr?.message);
    await admin.storage.from("documents").remove([storagePath]);
    process.exit(1);
  }

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .insert({
      document_id: doc.id,
      contact_id: contactId,
      invoice_number: spec.invoiceNumber,
      amount_gbp: amount,
      due_date: dueIso,
      payment_status: "unpaid",
      share_status: "ready",
      ready_at: new Date().toISOString(),
      ready_by: "seed_elia_payment_test",
      notes: null,
      payment_method_hint: spec.payment_method_hint,
      reference_text: spec.invoiceNumber,
      line_description: spec.title,
    })
    .select("id, invoice_number, amount_gbp, payment_status, share_status, payment_method_hint")
    .maybeSingle();

  if (shareErr || !share) {
    console.error("share insert failed", spec.invoiceNumber, shareErr?.message);
    process.exit(1);
  }

  console.log("[created]", share);
  created.push(share);
}

console.log("\nElia login: Victor / Matilla / 20102012");
console.log("Open Family portal → Elia → Invoices");
for (const row of created) {
  console.log(`  • ${row.invoice_number} — £${row.amount_gbp} — ${row.id}`);
}
