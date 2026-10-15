/**
 * Change the account / tax on paid ACCPAY bills made by office-tide-xero-spend-bills: delete the
 * unreconciled Tide payment, update every line, then re-pay with the same date, amount and reference.
 * Refuses a bill whose payment is already reconciled.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-xero-rebook-paid-bill-20261015.ts --account=325 --tax=INPUT2 TIDE-2026-09-10-AL1 TIDE-2026-09-10-AL2 [--apply]
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

const arg = (k: string) => Deno.args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) || "";
const ACCOUNT = arg("account");
const TAX = arg("tax");
const APPLY = Deno.args.includes("--apply");
const numbers = Deno.args.filter((a) => !a.startsWith("--"));
if (!ACCOUNT || !TAX || !numbers.length) {
  console.log("usage: --account=<code> --tax=<TaxType> <InvoiceNumber>... [--apply]");
  Deno.exit(1);
}

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
const xdate = (s: unknown) => {
  const m = String(s || "").match(/\/Date\((\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
};
const pause = () => new Promise((r) => setTimeout(r, 1100));

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: h, ...init });
    await pause();
    if (r.status !== 429) return r;
    await new Promise((s) => setTimeout(s, 65000));
  }
  return await fetch(url, { headers: h, ...init });
}

let problems = 0;
for (const number of numbers) {
  const r = await call(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(number)}`);
  const bill = (r.ok ? (await r.json()).Invoices || [] : []).find((i: any) => i.Type === "ACCPAY" && i.Status !== "VOIDED" && i.Status !== "DELETED");
  if (!bill) {
    console.log(`${number}: no live bill`);
    problems++;
    continue;
  }
  const full = await call(`${XERO_API}/Invoices/${bill.InvoiceID}`);
  const inv = full.ok ? (await full.json()).Invoices?.[0] : null;
  if (!inv) {
    console.log(`${number}: could not load`);
    problems++;
    continue;
  }
  const pays = [];
  for (const p of inv.Payments || []) {
    const pr = await call(`${XERO_API}/Payments/${p.PaymentID}`);
    pays.push(pr.ok ? (await pr.json()).Payments?.[0] : p);
  }
  const lines = (inv.LineItems || []).map((l: any) => `${l.AccountCode}/${l.TaxType} ${l.LineAmount}`).join(" + ");
  console.log(`${number} | ${inv.Contact?.Name} | £${inv.Total} | ${lines} -> ${ACCOUNT}/${TAX} | payments ${pays.map((p: any) => `£${p.Amount} reconciled ${p.IsReconciled}`).join(", ") || "-"}`);
  if (pays.some((p: any) => p.IsReconciled)) {
    console.log("  a payment is reconciled - Remove & Redo it in Xero first");
    problems++;
    continue;
  }
  if (!APPLY) continue;

  for (const p of pays) {
    const d = await call(`${XERO_API}/Payments/${p.PaymentID}`, { method: "POST", body: JSON.stringify({ Status: "DELETED" }) });
    console.log(`  delete payment £${p.Amount}: ${d.status}`);
    if (!d.ok) {
      console.log(`  ${(await d.text()).slice(0, 300)}`);
      problems++;
    }
  }
  const upd = {
    InvoiceID: inv.InvoiceID,
    LineAmountTypes: "Inclusive",
    LineItems: inv.LineItems.map((l: any) => ({
      LineItemID: l.LineItemID,
      Description: l.Description,
      Quantity: l.Quantity,
      UnitAmount: inv.LineAmountTypes === "Inclusive" ? l.LineAmount / (l.Quantity || 1) : l.UnitAmount,
      AccountCode: ACCOUNT,
      TaxType: TAX,
    })),
  };
  const u = await call(`${XERO_API}/Invoices/${inv.InvoiceID}`, { method: "POST", body: JSON.stringify({ Invoices: [upd] }) });
  const ub = await u.json().catch(() => ({}));
  const ui = ub.Invoices?.[0];
  console.log(`  update: ${u.status} total £${ui?.Total ?? "?"} ${JSON.stringify(ui?.ValidationErrors || (u.ok ? [] : ub)).slice(0, 300)}`);
  if (!u.ok) problems++;
  for (const p of pays) {
    const pay = { Invoice: { InvoiceID: inv.InvoiceID }, Account: { AccountID: p.Account?.AccountID }, Date: xdate(p.Date) || xdate(inv.Date), Amount: p.Amount, Reference: p.Reference || inv.Reference };
    const pr = await call(`${XERO_API}/Payments`, { method: "PUT", body: JSON.stringify({ Payments: [pay] }) });
    const pb = await pr.json().catch(() => ({}));
    console.log(`  re-pay £${p.Amount} ${pay.Date}: ${pr.status} ${JSON.stringify(pb.Payments?.[0]?.ValidationErrors || (pr.ok ? [] : pb)).slice(0, 300)}`);
    if (!pr.ok) problems++;
  }
}
console.log(`${APPLY ? "done" : "dry run"}; problems: ${problems}`);
await xeroPersistRefreshToDb(admin);
