/**
 * Seed a shared unpaid invoice PDF for Elia demo parent portal testing.
 *
 *   node database/local-vault/seed-elia-demo-invoice.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from linked vault / env).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contactId = "elia-matilla-demo";
const invoiceNumber = "TEST-ELIA-001";
const amount = 80;

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

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pdf = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 14 Tf 40 120 Td (Elia demo invoice ${invoiceNumber} GBP ${amount}) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000394 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
471
%%EOF
`,
);

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, payment_status, share_status")
  .eq("contact_id", contactId)
  .eq("invoice_number", invoiceNumber)
  .in("payment_status", ["unpaid", "partial"])
  .eq("share_status", "ready")
  .maybeSingle();

if (existing) {
  console.log("[seed-elia-demo-invoice] already exists", existing);
  process.exit(0);
}

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

const stamp = Date.now();
const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${stamp}.pdf`;

const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: false,
});
if (upErr) {
  console.error("upload failed", upErr.message);
  process.exit(1);
}

const due = new Date();
due.setDate(due.getDate() + 14);
const dueIso = due.toISOString().slice(0, 10);

const { data: doc, error: docErr } = await admin
  .from("documents")
  .insert({
    user_id: ownerId,
    document_type: "client_invoice",
    category: "billing",
    title: `Invoice ${invoiceNumber} — Elia (demo)`,
    related_date: dueIso,
    related_client: "Elia",
    file_url: storagePath,
    source_page: "seed_elia_demo",
  })
  .select("id")
  .maybeSingle();

if (docErr || !doc) {
  console.error("document insert failed", docErr?.message);
  await admin.storage.from("documents").remove([storagePath]);
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
    ready_by: "seed_elia_demo",
    notes: `Demo invoice seeded for parent portal payment tests (£${amount}).`,
    payment_method_hint: "bank_transfer",
  })
  .select("id, invoice_number, amount_gbp, payment_status, share_status")
  .maybeSingle();

if (shareErr || !share) {
  console.error("share insert failed", shareErr?.message);
  process.exit(1);
}

console.log("[seed-elia-demo-invoice] ok", share);
