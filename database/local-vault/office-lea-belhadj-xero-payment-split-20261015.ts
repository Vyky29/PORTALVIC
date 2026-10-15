/**
 * Lea Belhadj (Xero contact Lea Igabille) double income fix, part 1 (API).
 * Tide paid Eiji's Autumn first half as 633.75 on 31 Jul + 633.75 on 11 Aug, but Xero has a single
 * unreconciled £1,267.50 payment on INV-P-0083-R2 dated 11 Aug, so it can never match the bank lines.
 * Replaces it with two £633.75 payments (31 Jul, 11 Aug) into Tide. INV-P-0079-R2 (Hazem, 1,267.50
 * on 31 Jul) already matches its bank line and is left alone.
 *
 * Part 2 is in Xero UI: Remove & Redo the three Receive money 200 lines, then Match these payments.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-lea-belhadj-xero-payment-split-20261015.ts [--apply]
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
const INVOICE = "INV-P-0083-R2";

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
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};

const ir = await fetch(`${XERO_API}/Invoices/${INVOICE}`, { headers: h });
const inv = ir.ok ? (await ir.json()).Invoices?.[0] : null;
if (!inv) {
  console.log(`${INVOICE} not found`);
  Deno.exit(1);
}
console.log(`${INVOICE} | ${inv.Contact?.Name} | ${inv.Status} | total ${inv.Total} | due ${inv.AmountDue}`);
let target: any = null;
for (const p of inv.Payments || []) {
  const pr = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { headers: h });
  const pay = pr.ok ? (await pr.json()).Payments?.[0] : null;
  console.log(`  payment ${xdate(p.Date)} £${p.Amount} | ${pay?.Account?.Name} | reconciled ${pay?.IsReconciled}`);
  if (xdate(p.Date) === "2026-08-11" && Math.abs(Number(p.Amount) - 1267.5) < 0.005 && pay && !pay.IsReconciled) target = pay;
}
if (!target) {
  console.log("no unreconciled £1,267.50 payment on 11 Aug - nothing to do");
  Deno.exit(0);
}
if (!APPLY) {
  console.log("dry run: would delete the 11 Aug £1,267.50 payment and add £633.75 on 31 Jul + £633.75 on 11 Aug. Re-run with --apply.");
  Deno.exit(0);
}
const del = await fetch(`${XERO_API}/Payments/${target.PaymentID}`, { method: "POST", headers: h, body: JSON.stringify({ Status: "DELETED" }) });
console.log("delete", del.status, del.ok ? "ok" : (await del.text()).slice(0, 300));
if (!del.ok) Deno.exit(1);
const payments = [
  { Invoice: { InvoiceID: inv.InvoiceID }, Account: { AccountID: TIDE_ACCOUNT_ID }, Date: "2026-07-31", Amount: 633.75, Reference: "Lea Belhadj - Eiji" },
  { Invoice: { InvoiceID: inv.InvoiceID }, Account: { AccountID: TIDE_ACCOUNT_ID }, Date: "2026-08-11", Amount: 633.75, Reference: "Lea Belhadj - Eiji" },
];
const pr = await fetch(`${XERO_API}/Payments?summarizeErrors=false`, { method: "PUT", headers: h, body: JSON.stringify({ Payments: payments }) });
const body = await pr.json().catch(() => ({}));
for (const p of body.Payments || []) console.log(`${p.ValidationErrors?.length ? "FAIL" : "OK  "} £${p.Amount} ${xdate(p.Date)} ${JSON.stringify(p.ValidationErrors || [])}`);
await xeroPersistRefreshToDb(admin);
