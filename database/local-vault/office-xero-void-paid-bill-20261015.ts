/**
 * Undo a paid ACCPAY bill made by office-tide-xero-spend-bills: delete its unreconciled payments,
 * then void the bill. Refuses if any payment is already reconciled.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-xero-void-paid-bill-20261015.ts TIDE-2026-10-02-SEVWEB [--apply]
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

const number = Deno.args.find((a) => !a.startsWith("--")) || "";
const APPLY = Deno.args.includes("--apply");
if (!number) Deno.exit(1);

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

const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(number)}`, { headers: h });
const bill = (r.ok ? (await r.json()).Invoices || [] : []).find((i: any) => i.Type === "ACCPAY" && i.Status !== "VOIDED" && i.Status !== "DELETED");
if (!bill) {
  console.log(`${number}: no live bill`);
  Deno.exit(0);
}
const pays = [];
for (const p of bill.Payments || []) {
  const pr = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { headers: h });
  pays.push(pr.ok ? (await pr.json()).Payments?.[0] : p);
}
console.log(`${number} | ${bill.Contact?.Name} | ${bill.Status} | £${bill.Total} | payments ${pays.map((p: any) => `£${p.Amount} reconciled ${p.IsReconciled}`).join(", ") || "-"}`);
if (pays.some((p: any) => p.IsReconciled)) {
  console.log("a payment is reconciled - Remove & Redo it in Xero first");
  Deno.exit(1);
}
if (!APPLY) {
  console.log("dry run: re-run with --apply to delete payment(s) and void the bill");
  Deno.exit(0);
}
for (const p of pays) {
  const d = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { method: "POST", headers: h, body: JSON.stringify({ Status: "DELETED" }) });
  console.log(`  delete payment £${p.Amount}: ${d.status} ${d.ok ? "" : (await d.text()).slice(0, 300)}`);
}
const v = await fetch(`${XERO_API}/Invoices/${bill.InvoiceID}`, { method: "POST", headers: h, body: JSON.stringify({ Invoices: [{ InvoiceID: bill.InvoiceID, Status: "VOIDED" }] }) });
console.log(`  void bill: ${v.status} ${v.ok ? "" : (await v.text()).slice(0, 300)}`);
await xeroPersistRefreshToDb(admin);
