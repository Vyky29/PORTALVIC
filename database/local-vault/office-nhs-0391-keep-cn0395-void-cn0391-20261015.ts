/**
 * Victor 15 Oct 2026: keep CN-0395 (26 Aug, NHS already has it) for the extra INV-0391 payment
 * and void CN-0391. Stores the CN-0395 Xero PDF in Storage documents/credit-notes/CN-0395.pdf,
 * removes the CN-0391 PDF there, and repoints the open refund row in portal_parent_family_credits.
 *
 *   npx -y deno run -A database/local-vault/office-nhs-0391-keep-cn0395-void-cn0391-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-nhs-0391-keep-cn0395-void-cn0391-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = Deno.env.get("APPLY") === "1";
const KEEP = "CN-0395";
const VOID = "CN-0391";

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
if (!token) {
  console.log("xero auth failed: reconnect Xero, then re-run");
  Deno.exit(1);
}
const h = xeroAuthHeaders(token);
const day = (s: unknown) => {
  const m = /Date\((\d+)/.exec(String(s));
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s ?? "");
};

async function cnByNumber(num: string) {
  const r = await fetch(
    `${XERO_API}/CreditNotes?where=${encodeURIComponent(`CreditNoteNumber=="${num}"`)}`,
    { headers: h },
  );
  const id = (await r.json().catch(() => ({})))?.CreditNotes?.[0]?.CreditNoteID;
  if (!id) return null;
  const full = await fetch(`${XERO_API}/CreditNotes/${id}`, { headers: h });
  return (await full.json().catch(() => ({})))?.CreditNotes?.[0] || null;
}

const keep = await cnByNumber(KEEP);
const drop = await cnByNumber(VOID);
for (const [label, cn] of [["keep", keep], ["void", drop]] as const) {
  console.log(label, cn
    ? {
      number: cn.CreditNoteNumber,
      status: cn.Status,
      date: day(cn.Date),
      contact: cn.Contact?.Name,
      total: cn.Total,
      remaining: cn.RemainingCredit,
      reference: cn.Reference,
      allocations: (cn.Allocations || []).map((a: Record<string, any>) => ({
        invoice: a.Invoice?.InvoiceNumber,
        amount: a.Amount,
      })),
    }
    : "not found");
}
if (!keep) throw new Error(`${KEEP} not found in Xero`);

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1");
  Deno.exit(0);
}

if (drop && drop.Status !== "VOIDED") {
  const res = await fetch(`${XERO_API}/CreditNotes/${drop.CreditNoteID}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ CreditNotes: [{ CreditNoteID: drop.CreditNoteID, Status: "VOIDED" }] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error("void " + res.status + " " + (json?.Elements?.[0]?.ValidationErrors?.[0]?.Message || json?.Message || ""));
  }
  console.log("voided", VOID, json?.CreditNotes?.[0]?.Status);
}

const pdfRes = await fetch(`${XERO_API}/CreditNotes/${keep.CreditNoteID}`, {
  headers: { ...h, Accept: "application/pdf" },
});
if (!pdfRes.ok) throw new Error("pdf " + pdfRes.status);
const pdf = new Uint8Array(await pdfRes.arrayBuffer());
mkdirSync("docs/finance/nhs-credit-notes", { recursive: true });
writeFileSync(`docs/finance/nhs-credit-notes/${KEEP}.pdf`, pdf);
const up = await admin.storage.from("documents").upload(`credit-notes/${KEEP}.pdf`, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (up.error) throw new Error("storage " + up.error.message);
await admin.storage.from("documents").remove([`credit-notes/${VOID}.pdf`]);
console.log("stored", KEEP, pdf.length, "bytes; removed", VOID, "pdf");

const notes =
  `INV-0391 (Emanuel uplift £223.30): NHS refused it in Aug and we issued ${KEEP} (${day(keep.Date)}). ` +
  "They then validated the uplifts and paid it on 7 Sep (remittance 925522) and again on 15 Oct 2026. " +
  `One payment is the valid uplift; the extra £223.30 goes back with ${KEEP}. ${VOID} was voided in Xero. ` +
  `PDF: documents/credit-notes/${KEEP}.pdf`;
const { data, error } = await admin
  .from("portal_parent_family_credits")
  .update({
    xero_credit_note_id: keep.CreditNoteID,
    xero_credit_note_number: keep.CreditNoteNumber,
    notes,
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", "gap-emanuel-dodson")
  .eq("linked_invoice_number", "INV-0391")
  .neq("status", "cancelled")
  .select("id, amount_gbp, status, xero_credit_note_number");
if (error) throw new Error("ledger " + error.message);
console.log("ledger", data);
await xeroPersistRefreshToDb(admin);
console.log("Done.");
