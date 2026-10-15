/**
 * September / October family refunds vs Xero credit notes.
 *
 * 1. New CNs for cash refunds paid before the 8 Oct auto-CN change (Amber x2, Mia Mesi), each with a
 *    refund payment from Tide on the Tide date; portal family-credit row updated with the CN.
 * 2. CN-P-0496-R8d15 (Abate) and CN-P-0544 (Aaminah): portal applied them to the invoice although the
 *    family paid by Stripe and got cash back from Tide. Remove the allocation, add the Tide refund.
 * 3. Void duplicates: CN-P-0346-R58df (refund already on CN-0409, 24 Sep) and CN-0410 (refund already
 *    on CN-P-0499-Rffe5, 8 Oct). Patrick's portal row is repointed to CN-0409.
 *
 * Mansura Akter (Zayana) 24 Sep is already a reconciled Spend money on 200 / 20% - not touched.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-sep-refund-credit-notes-fix-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

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

const TIDE_ACCOUNT_ID = "ffe69fb0-8363-4a15-a29f-18dd13109c24";
const APPLY = Deno.args.includes("--apply");

const NEW_CNS = [
  { entryId: "b045c6cb-d82d-4900-b9be-9041fe8aa35d", contact: "Nicole Stephens", inv: "INV-P-0102-R1", date: "2026-09-18", amount: 50, desc: "Refund - Amber Stephens, Aquatic 5.30-6, Wed 16 Sep 2026 (club cancellation)", ref: "Refund 16/09 - INV-P-0102-R1" },
  { entryId: "988c8f56-76e5-438b-95a9-0ea4c3904bb5", contact: "Nicole Stephens", inv: "INV-P-0102-R1", date: "2026-09-23", amount: 50, desc: "Refund - Amber Stephens, Aquatic Northolt 5.30-6, Wed 23 Sep 2026 (club cancellation)", ref: "Refund 23/09 - INV-P-0102-R1" },
  { entryId: "0cc578ba-b670-4599-9c08-3c8f55099a5c", contact: "Kelidon Mesi", inv: "INV-P-0365", date: "2026-09-24", amount: 50, desc: "Refund - Mia Mesi, Aquatic 6-6.30, Wed 16 Sep 2026 (club cancellation)", ref: "Refund - INV-P-0365" },
];
const UNALLOCATE = [
  { cn: "CN-P-0496-R8d15", date: "2026-10-08", amount: 50, ref: "EA missed session" },
  { cn: "CN-P-0544", date: "2026-10-13", amount: 50, ref: "INV-P-0544 Thursday trial cancelled" },
];
const VOID = [
  { cn: "CN-P-0346-R58df", why: "duplicate of CN-0409 refund 24 Sep", portalEntryCn: "CN-0409" },
  { cn: "CN-0410", why: "duplicate of CN-P-0499-Rffe5 refund 8 Oct", portalEntryCn: "" },
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = { ...xeroAuthHeaders(token), "Content-Type": "application/json" };

async function cnByNumber(num: string): Promise<any | null> {
  const r = await fetch(`${XERO_API}/CreditNotes?where=${encodeURIComponent(`CreditNoteNumber=="${num}"`)}`, { headers: h });
  const list = r.ok ? (await r.json()).CreditNotes || [] : [];
  const hit = list.find((c: any) => c.Status !== "DELETED" && c.Status !== "VOIDED");
  if (!hit) return null;
  const full = await fetch(`${XERO_API}/CreditNotes/${hit.CreditNoteID}`, { headers: h });
  return full.ok ? (await full.json()).CreditNotes?.[0] : hit;
}
async function refundFromTide(cnId: string, date: string, amount: number, ref: string) {
  const r = await fetch(`${XERO_API}/Payments`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ Payments: [{ CreditNote: { CreditNoteID: cnId }, Account: { AccountID: TIDE_ACCOUNT_ID }, Date: date, Amount: amount, Reference: ref }] }),
  });
  const b = await r.json().catch(() => ({}));
  const p = b.Payments?.[0];
  console.log(`    refund payment ${r.status} ${p?.Status || ""} ${JSON.stringify(p?.ValidationErrors || (r.ok ? [] : b)).slice(0, 300)}`);
}

console.log("1. New credit notes for September cash refunds");
for (const n of NEW_CNS) {
  const { data: entry } = await admin.from("portal_parent_family_credits").select("id, xero_credit_note_number").eq("id", n.entryId).maybeSingle();
  const number = `CN-P-${n.inv.slice(6, 10)}-R${n.entryId.slice(0, 4)}`;
  if (entry?.xero_credit_note_number || (await cnByNumber(number))) {
    console.log(`  skip ${number} (exists)`);
    continue;
  }
  console.log(`  ${APPLY ? "create" : "plan"} ${number} | ${n.contact} | ${n.date} | £${n.amount} 200/20% incl | refund from Tide ${n.date} | ${n.desc}`);
  if (!APPLY) continue;
  const r = await fetch(`${XERO_API}/CreditNotes`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({
      CreditNotes: [{
        Type: "ACCRECCREDIT",
        Contact: { Name: n.contact },
        Date: n.date,
        CreditNoteNumber: number,
        Reference: n.ref,
        LineAmountTypes: "Inclusive",
        Status: "AUTHORISED",
        LineItems: [{ Description: n.desc, Quantity: 1, UnitAmount: n.amount, AccountCode: "200", TaxType: "OUTPUT2" }],
      }],
    }),
  });
  const b = await r.json().catch(() => ({}));
  const cn = b.CreditNotes?.[0];
  if (!r.ok || !cn?.CreditNoteID || cn.ValidationErrors?.length) {
    console.log(`    CN failed ${r.status} ${JSON.stringify(cn?.ValidationErrors || b).slice(0, 300)}`);
    continue;
  }
  await refundFromTide(cn.CreditNoteID, n.date, n.amount, n.ref);
  const up = await admin.from("portal_parent_family_credits").update({
    linked_invoice_number: n.inv.replace(/-R\d+$/, ""),
    xero_credit_note_id: cn.CreditNoteID,
    xero_credit_note_number: number,
    updated_at: new Date().toISOString(),
  }).eq("id", n.entryId);
  console.log(`    portal row ${up.error ? "error " + up.error.message : "updated"}`);
}

console.log("2. Undo invoice allocation, refund from Tide instead");
for (const u of UNALLOCATE) {
  const cn = await cnByNumber(u.cn);
  if (!cn) {
    console.log(`  ${u.cn} not found`);
    continue;
  }
  const allocs = cn.Allocations || [];
  const refunded = (cn.Payments || []).some((p: any) => Math.abs(Number(p.Amount) - u.amount) < 0.005);
  console.log(`  ${u.cn} | ${cn.Contact?.Name} | ${cn.Status} | allocations ${allocs.map((a: any) => `${a.Invoice?.InvoiceNumber} £${a.Amount}`).join(", ") || "-"} | refunded ${refunded}`);
  if (refunded) continue;
  console.log(`    ${APPLY ? "do" : "plan"}: remove allocation(s), refund £${u.amount} from Tide ${u.date}`);
  if (!APPLY) continue;
  for (const a of allocs) {
    const d = await fetch(`${XERO_API}/CreditNotes/${cn.CreditNoteID}/Allocations/${a.AllocationID}`, { method: "DELETE", headers: h });
    console.log(`    delete allocation ${a.Invoice?.InvoiceNumber}: ${d.status} ${d.ok ? "" : (await d.text()).slice(0, 300)}`);
    if (!d.ok) break;
  }
  const again = await cnByNumber(u.cn);
  if (Number(again?.RemainingCredit) + 0.005 < u.amount) {
    console.log(`    remaining credit ${again?.RemainingCredit} - skip refund`);
    continue;
  }
  await refundFromTide(cn.CreditNoteID, u.date, u.amount, u.ref);
}

console.log("3. Void duplicate credit notes");
for (const v of VOID) {
  const cn = await cnByNumber(v.cn);
  if (!cn) {
    console.log(`  ${v.cn} already gone`);
    continue;
  }
  const busy = (cn.Allocations || []).length || (cn.Payments || []).length;
  console.log(`  ${APPLY && !busy ? "void" : "plan void"} ${v.cn} | ${cn.Contact?.Name} | £${cn.Total} | ${cn.Status} | ${v.why}${busy ? " | HAS PAYMENT/ALLOCATION - left alone" : ""}`);
  if (!APPLY || busy) continue;
  const r = await fetch(`${XERO_API}/CreditNotes/${cn.CreditNoteID}`, { method: "POST", headers: h, body: JSON.stringify({ CreditNotes: [{ CreditNoteID: cn.CreditNoteID, Status: "VOIDED" }] }) });
  console.log(`    ${r.status} ${r.ok ? "" : (await r.text()).slice(0, 300)}`);
  if (r.ok && v.portalEntryCn) {
    const keep = await cnByNumber(v.portalEntryCn);
    const up = await admin.from("portal_parent_family_credits")
      .update({ xero_credit_note_id: keep?.CreditNoteID || null, xero_credit_note_number: v.portalEntryCn, updated_at: new Date().toISOString() })
      .eq("xero_credit_note_number", v.cn);
    console.log(`    portal row -> ${v.portalEntryCn} ${up.error ? "error " + up.error.message : "ok"}`);
  }
}
console.log(APPLY ? "done" : "dry run: re-run with --apply");
await xeroPersistRefreshToDb(admin);
