/**
 * NHS W&N ICB paid Emanuel INV-0391 (£223.30 uplift) twice:
 *   remittance 925522 dated 3 Sep 2026 (in Tide 7 Sep) and again on 15 Oct 2026.
 * Creates Xero credit note CN-0391 on the NHS contact (not allocated, the invoice is paid),
 * stores the Xero PDF in Storage documents/credit-notes/CN-0391.pdf and a local copy,
 * and adds an open refund row in portal_parent_family_credits so the office can send it.
 *
 *   npx -y deno run -A database/local-vault/office-nhs-0391-double-paid-credit-note-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-nhs-0391-double-paid-credit-note-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = Deno.env.get("APPLY") === "1";
const INVOICE_NO = "INV-0391";
const CN_NO = "CN-0391";
const AMOUNT = 223.3;
const CN_DATE = "2026-10-15";
const CONTACT_ID = "gap-emanuel-dodson";
const STORAGE_PATH = `credit-notes/${CN_NO}.pdf`;
const LOCAL_PDF = `docs/finance/nhs-credit-notes/${CN_NO}.pdf`;
const REFERENCE = "INV-0391 paid twice: remittance 925522 (3 Sep 2026) and 15 Oct 2026";
const LINE =
  "Credit - duplicate payment of INV-0391 (Backdated 2026/27 Inflationary Uplift 2.03%, Emanuel Dodson).\n\n" +
  "Client ID: NWL474280\nPO: XXPRASHERV1\n\n" +
  "INV-0391 (GBP 223.30) was paid on remittance 925522 dated 3 Sep 2026 and paid again on 15 Oct 2026. " +
  "This credit note covers the second payment, to be refunded or offset.";

function loadEnv(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) throw new Error("xero auth failed");

const invRes = await fetch(
  `${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(INVOICE_NO)}`,
  { headers: xeroAuthHeaders(token) },
);
const inv = (await invRes.json().catch(() => ({})))?.Invoices?.[0];
if (!inv) throw new Error(`${INVOICE_NO} not found in Xero (${invRes.status})`);
const line0 = inv.LineItems?.[0] || {};
console.log({
  invoice: inv.InvoiceNumber,
  status: inv.Status,
  contact: inv.Contact?.Name,
  contact_id: inv.Contact?.ContactID,
  total: inv.Total,
  paid: inv.AmountPaid,
  due: inv.AmountDue,
  payments: (inv.Payments || []).map((p: Record<string, unknown>) => ({ date: p.Date, amount: p.Amount })),
  overpayments: inv.Overpayments || null,
  line: { desc: line0.Description, account: line0.AccountCode, tax: line0.TaxType },
  amount_types: inv.LineAmountTypes,
});

const findRes = await fetch(
  `${XERO_API}/CreditNotes?where=${encodeURIComponent(`CreditNoteNumber=="${CN_NO}"`)}`,
  { headers: xeroAuthHeaders(token) },
);
let cn = (await findRes.json().catch(() => ({})))?.CreditNotes?.[0] || null;
console.log("existing CN", cn ? { id: cn.CreditNoteID, status: cn.Status, total: cn.Total } : null);

const { data: existingLedger } = await admin
  .from("portal_parent_family_credits")
  .select("id, status, xero_credit_note_number")
  .eq("contact_id", CONTACT_ID)
  .eq("linked_invoice_number", INVOICE_NO)
  .neq("status", "cancelled")
  .limit(1);
console.log("existing ledger", existingLedger?.[0] || null);

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1");
  Deno.exit(0);
}

if (!cn) {
  const body = {
    CreditNotes: [{
      Type: "ACCRECCREDIT",
      Contact: { ContactID: inv.Contact.ContactID },
      Date: CN_DATE,
      LineAmountTypes: inv.LineAmountTypes || "Exclusive",
      Status: "AUTHORISED",
      Reference: REFERENCE,
      CreditNoteNumber: CN_NO,
      LineItems: [{
        Description: LINE,
        Quantity: 1,
        UnitAmount: AMOUNT,
        ...(line0.AccountCode ? { AccountCode: line0.AccountCode } : {}),
        ...(line0.TaxType ? { TaxType: line0.TaxType } : {}),
      }],
    }],
  };
  const res = await fetch(`${XERO_API}/CreditNotes`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      "xero create " + res.status + " " +
        (json?.Elements?.[0]?.ValidationErrors?.map((e: { Message?: string }) => e.Message).join("; ") ||
          json?.Message || ""),
    );
  }
  cn = json?.CreditNotes?.[0];
  console.log("created CN", cn?.CreditNoteNumber, cn?.CreditNoteID, cn?.Total);
}

const pdfRes = await fetch(`${XERO_API}/CreditNotes/${cn.CreditNoteID}`, {
  headers: { ...xeroAuthHeaders(token), Accept: "application/pdf" },
});
if (!pdfRes.ok) throw new Error("xero pdf " + pdfRes.status);
const pdf = new Uint8Array(await pdfRes.arrayBuffer());
mkdirSync("docs/finance/nhs-credit-notes", { recursive: true });
writeFileSync(LOCAL_PDF, pdf);
console.log("WROTE", LOCAL_PDF, pdf.length, "bytes");

const up = await admin.storage.from("documents").upload(STORAGE_PATH, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (up.error) throw new Error("storage " + up.error.message);
console.log("STORED documents/" + STORAGE_PATH);

const notes =
  `NHS W&N ICB paid INV-0391 twice (remittance 925522 3 Sep 2026, in Tide 7 Sep, and again 15 Oct 2026). ` +
  `Credit note ${cn.CreditNoteNumber} to send to NHS (refund or offset). PDF: documents/${STORAGE_PATH}`;
if (existingLedger?.[0]?.id) {
  const { error } = await admin
    .from("portal_parent_family_credits")
    .update({
      xero_credit_note_id: cn.CreditNoteID,
      xero_credit_note_number: cn.CreditNoteNumber,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingLedger[0].id);
  if (error) throw new Error("ledger update " + error.message);
  console.log("ledger updated", existingLedger[0].id);
} else {
  const { data, error } = await admin
    .from("portal_parent_family_credits")
    .insert({
      parent_person_id: "funder-nhs-wnl-icb",
      contact_id: CONTACT_ID,
      participant_display: "Emanuel Dodson (NHS W&N ICB)",
      kind: "refund",
      status: "open",
      amount_gbp: AMOUNT,
      service_label: "Day Centre uplift INV-0391 paid twice",
      session_date: CN_DATE,
      notes,
      source: "admin",
      linked_invoice_number: INVOICE_NO,
      xero_credit_note_id: cn.CreditNoteID,
      xero_credit_note_number: cn.CreditNoteNumber,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error("ledger insert " + error.message);
  console.log("ledger inserted", data?.id);
}
await xeroPersistRefreshToDb(admin);
console.log("Done.");
