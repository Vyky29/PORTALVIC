/**
 * Deletes an UNRECONCILED Xero payment on an invoice when another payment with the same date and amount
 * on that invoice is already reconciled (duplicate created by Find & Match on the invoice).
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-xero-delete-dup-unreconciled-payment-20261015.ts INV-P-0470 2026-09-09 350 [--apply]
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

const [num, date, amountArg] = Deno.args.filter((a) => !a.startsWith("--"));
const amount = Number(amountArg);
const APPLY = Deno.args.includes("--apply");

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

const ir = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(num)}`, { headers: h });
const inv = ir.ok ? (await ir.json()).Invoices?.[0] : null;
if (!inv) Deno.exit(1);
const same: any[] = [];
for (const p of inv.Payments || []) {
  if (xdate(p.Date) !== date || Math.abs(Number(p.Amount) - amount) > 0.005) continue;
  const pr = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { headers: h });
  const pay = pr.ok ? (await pr.json()).Payments?.[0] : null;
  if (pay) same.push(pay);
}
const rec = same.filter((p) => p.IsReconciled);
const unrec = same.filter((p) => !p.IsReconciled);
console.log(`${num} | ${inv.Status} | due ${inv.AmountDue} | same-date payments: ${same.length} (reconciled ${rec.length}, unreconciled ${unrec.length})`);
if (rec.length < 1 || unrec.length !== 1) {
  console.log("not a clean duplicate - nothing done");
  Deno.exit(0);
}
if (!APPLY) {
  console.log(`dry run: would delete unreconciled payment ${unrec[0].PaymentID}. Re-run with --apply.`);
  Deno.exit(0);
}
const del = await fetch(`${XERO_API}/Payments/${unrec[0].PaymentID}`, { method: "POST", headers: h, body: JSON.stringify({ Status: "DELETED" }) });
console.log("delete", del.status, del.ok ? "ok" : (await del.text()).slice(0, 300));
await xeroPersistRefreshToDb(admin);
