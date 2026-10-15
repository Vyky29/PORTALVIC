/**
 * Ealing remittance 73859 (Tide 24 Sep 2026, part of £10,748.00): pays the three Ahmed
 * annual invoices INV-0344 / INV-0345 / INV-0346 (£2,470 each) into the Tide account.
 * The bank line is then matched in Xero Reconcile with these 3 payments + £3,338.00 to 200.
 *
 * Dry run by default. Approved by Victor 15 Oct 2026.
 *   npx -y deno run -A database/local-vault/office-ealing-xero-pay-inv0344-0346-20261015.ts [--apply]
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
const PAY_DATE = "2026-09-24";
const AMOUNT = 2470;
const NUMBERS = ["INV-0344", "INV-0345", "INV-0346"];

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

const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${NUMBERS.join(",")}`, { headers: h });
if (!r.ok) {
  console.log("Invoices", r.status, (await r.text()).slice(0, 200));
  Deno.exit(1);
}
const invoices = (await r.json()).Invoices || [];
const payments: any[] = [];
for (const n of NUMBERS) {
  const inv = invoices.find((i: any) => i.InvoiceNumber === n);
  if (!inv) {
    console.log(`${n}: not found - abort`);
    Deno.exit(1);
  }
  console.log(`${n} | ${inv.Contact?.Name} | ${inv.Status} | total ${inv.Total} | due ${inv.AmountDue} | ref ${inv.Reference || "-"}`);
  if (inv.Status !== "AUTHORISED" || Number(inv.AmountDue) !== AMOUNT) {
    console.log(`${n}: expected AUTHORISED with £${AMOUNT} due - abort`);
    Deno.exit(1);
  }
  payments.push({
    Invoice: { InvoiceID: inv.InvoiceID },
    Account: { AccountID: TIDE_ACCOUNT_ID },
    Date: PAY_DATE,
    Amount: AMOUNT,
    Reference: "LB Ealing remittance 73859",
  });
}

if (!APPLY) {
  console.log(`dry run: would create ${payments.length} payments of £${AMOUNT} on ${PAY_DATE} to Tide. Re-run with --apply.`);
  Deno.exit(0);
}
const pr = await fetch(`${XERO_API}/Payments`, { method: "PUT", headers: h, body: JSON.stringify({ Payments: payments }) });
const body = await pr.json().catch(() => ({}));
if (!pr.ok) {
  console.log("Payments PUT", pr.status, JSON.stringify(body).slice(0, 600));
  Deno.exit(1);
}
for (const p of body.Payments || []) {
  console.log(`paid ${p.Invoice?.InvoiceNumber} £${p.Amount} | ${p.Status} | payment ${p.PaymentID} | errors ${JSON.stringify(p.ValidationErrors || [])}`);
}
await xeroPersistRefreshToDb(admin);
