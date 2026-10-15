/**
 * From payouts_plan.json (office-stripe-gc-payouts-to-xero-plan-20261015.ts --json=...):
 * per payout, one Tide payment per invoice (dated the payout arrival, ref "<Stripe|GoCardless> payout <date>")
 * plus one adjustment so the parts add up to the payout:
 *   Stripe: ACCREC "STRIPE-<date>" to contact Stripe: card surcharge 200 / 20% incl (+), Stripe fees 404 (-)
 *   GoCardless: ACCPAY "GC-FEES-<date>" to contact GoCardless: fees 404 / No VAT
 * In Reconcile: Find & Match, search the ref, tick all (Show Spent Items for the GC fee), Reconcile.
 *
 * Dry run by default; skips an invoice that already has a payment with that ref.
 *   npx -y deno run -A database/local-vault/office-stripe-gc-payouts-xero-apply-20261015.ts [--apply] [--only=2026-09-11,...]
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
const onlyArg = Deno.args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
const plan = JSON.parse(Deno.readTextFileSync("database/local-vault/private/ealing-mail/payouts_plan.json"));
const r2 = (n: number) => Math.round(n * 100) / 100;
const pause = () => new Promise((r) => setTimeout(r, 1100));

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

async function invoiceByNumber(num: string): Promise<any | null> {
  const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(num)}`, { headers: h });
  const list = r.ok ? (await r.json()).Invoices || [] : [];
  return list.find((i: any) => !["VOIDED", "DELETED"].includes(i.Status)) || null;
}
async function pay(invoiceId: string, date: string, amount: number, ref: string) {
  await pause();
  const r = await fetch(`${XERO_API}/Payments`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ Payments: [{ Invoice: { InvoiceID: invoiceId }, Account: { AccountID: TIDE_ACCOUNT_ID }, Date: date, Amount: amount, Reference: ref }] }),
  });
  const b = await r.json().catch(() => ({}));
  const p = b.Payments?.[0];
  return `${r.status} ${p?.Status || ""} ${JSON.stringify(p?.ValidationErrors || (r.ok ? [] : b)).slice(0, 200)}`;
}

let problems = 0;
for (const p of plan) {
  if (only && !only.has(p.arrival)) continue;
  const label = p.kind === "stripe" ? "Stripe" : "GoCardless";
  const ref = `${label} payout ${p.arrival}`;
  const sum = r2(p.items.reduce((s: number, i: any) => s + (i.xero ? i.amount : 0), 0));
  console.log(`\n${ref} | £${p.amount} | invoices £${sum} | adjustment £${p.adjustment}`);
  if (p.items.some((i: any) => !i.xero)) {
    console.log("  has an item without a Xero invoice - skip payout");
    problems++;
    continue;
  }
  for (const it of p.items) {
    await pause();
    const inv = await invoiceByNumber(it.xero);
    const already = (inv?.Payments || []).some((x: any) => String(x.Reference || "") === ref && Math.abs(Number(x.Amount) - it.amount) < 0.005);
    if (!inv || inv.Status !== "AUTHORISED" || (!already && Number(inv.AmountDue) + 0.005 < it.amount)) {
      console.log(`  ${it.xero} £${it.amount}: ${inv ? `${inv.Status} due £${inv.AmountDue}` : "missing"} - PROBLEM`);
      if (!already) problems++;
      continue;
    }
    if (already) {
      console.log(`  ${it.xero} £${it.amount}: already paid with this ref`);
      continue;
    }
    console.log(`  ${APPLY ? "pay" : "plan"} ${it.xero} ${inv.Contact?.Name} £${it.amount}${APPLY ? " -> " + (await pay(inv.InvoiceID, p.arrival, it.amount, ref)) : ""}`);
  }

  const adjNum = p.kind === "stripe" ? `STRIPE-${p.arrival}` : `GC-FEES-${p.arrival}`;
  await pause();
  const existing = await invoiceByNumber(adjNum);
  if (existing) {
    console.log(`  ${adjNum}: exists (${existing.Status})`);
    continue;
  }
  const doc = p.kind === "stripe"
    ? {
      Type: "ACCREC",
      Contact: { Name: "Stripe" },
      InvoiceNumber: adjNum,
      LineItems: [
        { Description: `Card surcharge paid by families in ${ref}`, Quantity: 1, UnitAmount: p.surcharge, AccountCode: "200", TaxType: "OUTPUT2" },
        { Description: `Stripe fees in ${ref}`, Quantity: 1, UnitAmount: -p.fees, AccountCode: "404", TaxType: "NONE" },
      ],
    }
    : {
      Type: "ACCPAY",
      Contact: { Name: "GoCardless" },
      InvoiceNumber: adjNum,
      LineItems: [{ Description: `GoCardless fees in ${ref}`, Quantity: 1, UnitAmount: p.fees, AccountCode: "404", TaxType: "NONE" }],
    };
  const adjAmount = p.kind === "stripe" ? r2(p.surcharge - p.fees) : p.fees;
  if (Math.abs(r2(sum + (p.kind === "stripe" ? adjAmount : -adjAmount)) - p.amount) > 0.005) {
    console.log(`  parts do not add up to the payout - PROBLEM`);
    problems++;
    continue;
  }
  console.log(`  ${APPLY ? "create" : "plan"} ${adjNum} £${adjAmount} (${p.kind === "stripe" ? `surcharge £${p.surcharge} - fees £${p.fees}` : "fees"})`);
  if (!APPLY) continue;
  await pause();
  const r = await fetch(`${XERO_API}/Invoices`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ Invoices: [{ ...doc, Date: p.arrival, DueDate: p.arrival, Reference: ref, LineAmountTypes: "Inclusive", Status: "AUTHORISED" }] }),
  });
  const b = await r.json().catch(() => ({}));
  const inv = b.Invoices?.[0];
  if (!r.ok || !inv?.InvoiceID || inv.ValidationErrors?.length) {
    console.log(`    adjustment failed ${r.status} ${JSON.stringify(inv?.ValidationErrors || b).slice(0, 300)}`);
    problems++;
    continue;
  }
  console.log(`    payment ${await pay(inv.InvoiceID, p.arrival, adjAmount, ref)}`);
}
console.log(`\n${APPLY ? "done" : "dry run"}; problems: ${problems}`);
await xeroPersistRefreshToDb(admin);
