/**
 * The Xero app has banktransactions.read only, so it cannot Create spend money on Tide lines.
 * Instead: one paid ACCPAY bill per Tide spend line (or an ACCREC credit note + refund for family
 * refunds), with the payment dated the Tide date on the Tide account. Reconcile then offers a 1:1
 * Match and the office only clicks OK.
 *
 * Bill / credit note number TIDE-<date>-<key> keeps re-runs idempotent.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-tide-xero-spend-bills-20261015.ts [--apply] [--only=key1,key2]
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

type Line = { account: string; tax: string; amount: number; desc: string };
type Item = { key: string; date: string; amount: number; contact: string; kind: "bill" | "refund"; ref: string; lines: Line[] };

const atm = (n: number, amount: number): Item => ({
  key: `ATM${n}`,
  date: "2026-09-10",
  amount,
  contact: "Tesco Acton (cash)",
  kind: "bill",
  ref: "Cash withdrawal - staff clothing",
  lines: [
    { account: "486", tax: "NONE", amount: amount - 1, desc: "Cash withdrawal RBS Tesco Acton - staff clothing (no VAT)" },
    { account: "404", tax: "NONE", amount: 1, desc: "ATM fee" },
  ],
});
const one = (key: string, date: string, amount: number, contact: string, account: string, tax: string, desc: string): Item => ({
  key,
  date,
  amount,
  contact,
  kind: "bill",
  ref: desc,
  lines: [{ account, tax, amount, desc }],
});
const refund = (key: string, date: string, amount: number, contact: string, desc: string): Item => ({
  key,
  date,
  amount,
  contact,
  kind: "refund",
  ref: desc,
  lines: [{ account: "200", tax: "OUTPUT2", amount, desc }],
});

const PLAN: Item[] = [
  atm(1, 250), atm(2, 250), atm(3, 250), atm(4, 100), atm(5, 250), atm(6, 250),
  one("AL1", "2026-09-10", 57.10, "Addison Lee", "493", "INPUT2", "Addison Lee card ride"),
  one("AL2", "2026-09-10", 38.94, "Addison Lee", "493", "INPUT2", "Addison Lee card ride"),
  one("AL3", "2026-09-11", 54.35, "Addison Lee", "493", "INPUT2", "Addison Lee card ride"),
  one("AL4", "2026-09-11", 7.30, "Addison Lee", "493", "INPUT2", "Addison Lee extra"),
  one("AL5", "2026-09-17", 38.94, "Addison Lee", "493", "INPUT2", "Addison Lee card ride"),
  one("AL6", "2026-09-17", 38.94, "Addison Lee", "493", "INPUT2", "Addison Lee card ride"),
  one("AL7", "2026-09-18", 72.66, "Addison Lee", "493", "INPUT2", "Addison Lee extra"),
  one("AL8", "2026-09-18", 26.26, "Addison Lee", "493", "INPUT2", "Addison Lee extra"),
  one("SUSP300", "2026-09-11", 300, "clubSENsational LTD", "850", "NONE", "Transfer out 11 Sep - returned same amount"),
  one("HELLOPRINT", "2026-09-12", 43.48, "HelloPrint", "461", "INPUT2", "Printing"),
  one("1STFORM", "2026-09-18", 46.80, "1st Formations", "429", "INPUT2", "Company services"),
  one("VERCEL", "2026-09-28", 287.45, "Vercel", "463", "REVERSECHARGES", "Vercel hosting (USD 379.46)"),
  one("RUNWAY", "2026-10-02", 14.17, "Runway", "463", "REVERSECHARGES", "Runway standard plan"),
  one("EMMSEP", "2026-10-02", 273.60, "Emmanuel Amoakohene", "320", "NONE", "September"),
  // SEVSEP / SEVWEB: Sevitha September pay and website (paid on to the designer) wait for the accountant.
  one("ELEVEN", "2026-10-07", 137.34, "Elevenlabs", "463", "REVERSECHARGES", "ElevenLabs"),
  one("WIX", "2026-10-09", 61.86, "Wix com", "463", "NONE", "Wix"),
];
// Family refunds: office-sep-refund-credit-notes-fix-20261015.ts (CN per portal refund row).
void refund;

for (const it of PLAN) {
  const s = Math.round(it.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  if (Math.abs(s - it.amount) > 0.005) {
    console.log(`${it.key}: lines ${s} != ${it.amount} - abort`);
    Deno.exit(1);
  }
}

const APPLY = Deno.args.includes("--apply");
const onlyArg = Deno.args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

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

async function exists(it: Item, number: string): Promise<string | null> {
  if (it.kind === "bill") {
    const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(number)}`, { headers: h });
    const list = r.ok ? (await r.json()).Invoices || [] : [];
    const hit = list.find((i: any) => i.Type === "ACCPAY" && i.Status !== "DELETED" && i.Status !== "VOIDED");
    return hit ? hit.Status : null;
  }
  const r = await fetch(`${XERO_API}/CreditNotes?where=${encodeURIComponent(`CreditNoteNumber=="${number}"`)}`, { headers: h });
  const list = r.ok ? (await r.json()).CreditNotes || [] : [];
  const hit = list.find((c: any) => c.Status !== "DELETED" && c.Status !== "VOIDED");
  return hit ? hit.Status : null;
}

let made = 0;
for (const it of PLAN) {
  if (only && !only.has(it.key)) continue;
  const number = `TIDE-${it.date}-${it.key}`;
  const have = await exists(it, number);
  const lineTxt = it.lines.map((l) => `${l.account}/${l.tax} ${l.amount}`).join(" + ");
  if (have) {
    console.log(`skip ${number} (already ${have})`);
    continue;
  }
  console.log(`${APPLY ? "create" : "plan"} ${number} | ${it.kind} | ${it.contact} | £${it.amount} | ${lineTxt}`);
  if (!APPLY) continue;

  const doc = {
    Contact: { Name: it.contact },
    Date: it.date,
    DueDate: it.date,
    Reference: it.ref,
    LineAmountTypes: "Inclusive",
    Status: "AUTHORISED",
    LineItems: it.lines.map((l) => ({ Description: l.desc, Quantity: 1, UnitAmount: l.amount, AccountCode: l.account, TaxType: l.tax })),
  };
  let docId = "";
  if (it.kind === "bill") {
    const r = await fetch(`${XERO_API}/Invoices`, { method: "PUT", headers: h, body: JSON.stringify({ Invoices: [{ ...doc, Type: "ACCPAY", InvoiceNumber: number }] }) });
    const b = await r.json().catch(() => ({}));
    const inv = b.Invoices?.[0];
    if (!r.ok || !inv?.InvoiceID || inv.ValidationErrors?.length) {
      console.log(`  bill failed ${r.status} ${JSON.stringify(inv?.ValidationErrors || b).slice(0, 400)}`);
      continue;
    }
    docId = inv.InvoiceID;
  } else {
    const r = await fetch(`${XERO_API}/CreditNotes`, { method: "PUT", headers: h, body: JSON.stringify({ CreditNotes: [{ ...doc, Type: "ACCRECCREDIT", CreditNoteNumber: number }] }) });
    const b = await r.json().catch(() => ({}));
    const cn = b.CreditNotes?.[0];
    if (!r.ok || !cn?.CreditNoteID || cn.ValidationErrors?.length) {
      console.log(`  credit note failed ${r.status} ${JSON.stringify(cn?.ValidationErrors || b).slice(0, 400)}`);
      continue;
    }
    docId = cn.CreditNoteID;
  }
  const pay = {
    ...(it.kind === "bill" ? { Invoice: { InvoiceID: docId } } : { CreditNote: { CreditNoteID: docId } }),
    Account: { AccountID: TIDE_ACCOUNT_ID },
    Date: it.date,
    Amount: it.amount,
    Reference: it.ref,
  };
  const pr = await fetch(`${XERO_API}/Payments`, { method: "PUT", headers: h, body: JSON.stringify({ Payments: [pay] }) });
  const pb = await pr.json().catch(() => ({}));
  const p = pb.Payments?.[0];
  console.log(`  payment ${pr.status} ${p?.Status || ""} ${JSON.stringify(p?.ValidationErrors || (pr.ok ? [] : pb)).slice(0, 300)}`);
  if (pr.ok) made++;
}
console.log(APPLY ? `done: ${made} paid` : "dry run: re-run with --apply to create bills / credit notes + Tide payments.");
await xeroPersistRefreshToDb(admin);
