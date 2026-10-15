/**
 * Tide receipts 10 Aug - 15 Oct 2026 that pay Xero invoices (full or partial): creates one Xero
 * payment per invoice on the bank date into the Tide account, so Victor only clicks OK / Find & Match
 * in Reconcile (Find & Match does not let him part-pay).
 *
 * Skips an invoice when it is not AUTHORISED, has less due than the amount, or already has a payment
 * with the same date and amount.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-tide-xero-invoice-payments-20261015.ts [--apply]
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

const APPLY = Deno.args.includes("--apply");
const TIDE_ACCOUNT_ID = "ffe69fb0-8363-4a15-a29f-18dd13109c24";

const PLAN: { n: string; date: string; amount: number; ref: string }[] = [
  { n: "INV-0377", date: "2026-08-10", amount: 150, ref: "LBHF MAIN AP 9700428471" },
  { n: "INV-0378", date: "2026-08-10", amount: 200, ref: "LBHF MAIN AP 9700428471" },
  { n: "INV-0379", date: "2026-08-10", amount: 150, ref: "LBHF MAIN AP 9700428471" },
  { n: "INV-P-0461", date: "2026-09-02", amount: 390, ref: "Agata Nowak - Erik" },
  { n: "INV-P-0470", date: "2026-09-09", amount: 350, ref: "Akhavan Kamy" },
  { n: "INV-0389", date: "2026-09-15", amount: 985.81, ref: "NHS 939110" },
  { n: "INV-0342", date: "2026-09-23", amount: 4610, ref: "NHS 974292" },
  { n: "INV-0343", date: "2026-09-23", amount: 10900, ref: "NHS 974292" },
  { n: "INV-0354", date: "2026-09-23", amount: 8250, ref: "NHS 974292" },
  { n: "INV-0356", date: "2026-09-23", amount: 15000, ref: "NHS 974292" },
  { n: "INV-0357", date: "2026-09-23", amount: 1368.6, ref: "NHS 974292" },
  { n: "INV-0386", date: "2026-09-23", amount: 3150, ref: "NHS 974292" },
  { n: "INV-0387", date: "2026-09-23", amount: 750, ref: "NHS 974292" },
  { n: "INV-0390", date: "2026-09-23", amount: 936.85, ref: "NHS 974292" },
  { n: "INV-0392", date: "2026-10-05", amount: 148.21, ref: "NHS 1005579" },
  { n: "INV-P-0475", date: "2026-10-07", amount: 164, ref: "ABDI A - Muhammad Abdi" },
  { n: "INV-0360", date: "2026-10-08", amount: 12950, ref: "NHS 1012695" },
  { n: "INV-0361", date: "2026-10-08", amount: 9712.5, ref: "NHS 1012695" },
  { n: "INV-P-0179", date: "2026-10-09", amount: 562.5, ref: "People Places Lives INVP0179" },
  { n: "INV-P-0095", date: "2026-10-12", amount: 997.5, ref: "Zaynab Alfadhl - Zaid" },
  { n: "INV-P-0126", date: "2026-10-12", amount: 325, ref: "Boora M - Shaan" },
  { n: "INV-P-0079-R2", date: "2026-10-13", amount: 487.5, ref: "Lea Belhadj - Hazem" },
  { n: "INV-P-0083-R2", date: "2026-10-13", amount: 487.5, ref: "Lea Belhadj - Eiji" },
  { n: "INV-P-0549", date: "2026-10-13", amount: 262.5, ref: "A Mohamud - Mohamed swimming" },
  { n: "INV-P-0224", date: "2026-10-13", amount: 150, ref: "LBHF MAIN AP 9700437723" },
  { n: "INV-P-0315", date: "2026-10-15", amount: 200, ref: "LBHF MAIN AP" },
  { n: "INV-0355", date: "2026-10-15", amount: 12000, ref: "NHS remittance 1033593" },
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) {
  console.log("xero auth failed");
  Deno.exit(1);
}
const h = { ...xeroAuthHeaders(token), "Content-Type": "application/json" };
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};

const invoices: any[] = [];
const nums = PLAN.map((p) => p.n);
for (let i = 0; i < nums.length; i += 40) {
  const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${nums.slice(i, i + 40).join(",")}`, { headers: h });
  if (!r.ok) {
    console.log("Invoices", r.status, (await r.text()).slice(0, 200));
    Deno.exit(1);
  }
  invoices.push(...((await r.json()).Invoices || []));
}

const payments: any[] = [];
for (const p of PLAN) {
  const inv = invoices.find((i: any) => i.InvoiceNumber === p.n && i.Status !== "DELETED" && i.Status !== "VOIDED");
  if (!inv) {
    console.log(`SKIP ${p.n}: not found`);
    continue;
  }
  const dup = (inv.Payments || []).some((x: any) => xdate(x.Date) === p.date && Math.abs(Number(x.Amount) - p.amount) < 0.005);
  const due = Number(inv.AmountDue);
  if (dup) {
    console.log(`SKIP ${p.n}: already has £${p.amount} on ${p.date}`);
    continue;
  }
  if (inv.Status !== "AUTHORISED" || due + 0.005 < p.amount) {
    console.log(`SKIP ${p.n}: ${inv.Status}, due ${due} < ${p.amount}`);
    continue;
  }
  console.log(`PAY  ${p.date} | ${p.n} | ${inv.Contact?.Name} | £${p.amount.toFixed(2)} of due ${due.toFixed(2)}${due - p.amount > 0.005 ? " (partial)" : ""}`);
  payments.push({ Invoice: { InvoiceID: inv.InvoiceID }, Account: { AccountID: TIDE_ACCOUNT_ID }, Date: p.date, Amount: p.amount, Reference: p.ref });
}

if (!APPLY) {
  console.log(`\ndry run: would create ${payments.length} payments into Tide. Re-run with --apply.`);
  Deno.exit(0);
}
if (!payments.length) Deno.exit(0);
const pr = await fetch(`${XERO_API}/Payments?summarizeErrors=false`, { method: "PUT", headers: h, body: JSON.stringify({ Payments: payments }) });
const body = await pr.json().catch(() => ({}));
for (const p of body.Payments || []) {
  console.log(`${p.ValidationErrors?.length ? "FAIL" : "OK  "} ${p.Invoice?.InvoiceNumber} £${p.Amount} ${p.Date ? xdate(p.Date) : ""} ${JSON.stringify(p.ValidationErrors || [])}`);
}
if (!pr.ok && !(body.Payments || []).length) console.log("Payments PUT", pr.status, JSON.stringify(body).slice(0, 600));
await xeroPersistRefreshToDb(admin);
