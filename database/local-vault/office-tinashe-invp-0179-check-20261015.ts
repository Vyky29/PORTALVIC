/**
 * Read only. Tinashe INV-P-0179 (£562.50, Fridays Sep 2026, billed to BST) vs her Ealing year INV-P-0332:
 * portal rows + Xero state of INV-P-0179.
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-invp-0179-check-20261015.ts
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > 1500 ? s.slice(0, 1500) + " ..." : s;
};
const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .in("invoice_number", ["INV-P-0179", "INV-P-0332"]);
if (error) throw error;
for (const row of data || []) {
  console.log(`\n===== ${row.invoice_number}`);
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === "" || /pdf_base64|html/i.test(k)) continue;
    console.log(`  ${k}: ${short(v)}`);
  }
}

const { data: nhsRows } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, payment_status, share_status, reference_text, xero_push_status, ready_by")
  .ilike("ready_by", "%tinashe-nhs%")
  .order("invoice_number");
console.log("\nTinashe NHS / Virtual Wallet rows:");
for (const r of nhsRows || []) console.log(`  ${r.invoice_number} | ${r.reference_text} | £${r.amount_gbp} | ${r.payment_status} | ${r.share_status} | xero ${r.xero_push_status || "-"} | ${r.ready_by}`);

await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(0);
const h = xeroAuthHeaders(token);
const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=INV-P-0179`, { headers: h });
const inv = r.ok ? (await r.json()).Invoices?.[0] : null;
if (!inv) {
  console.log("\nXero: INV-P-0179 not found", r.status);
} else {
  console.log(
    `\nXero INV-P-0179 | ${inv.Contact?.Name} | ${inv.Status} | total ${inv.Total} | due ${inv.AmountDue} | paid ${inv.AmountPaid} | ref ${inv.Reference}`,
  );
  for (const l of inv.LineItems || []) console.log(`   line: ${l.AccountCode} ${l.Quantity} x ${l.UnitAmount} | ${String(l.Description).replace(/\s+/g, " ").slice(0, 200)}`);
  const hr = await fetch(`${XERO_API}/Invoices/${inv.InvoiceID}/History`, { headers: h });
  for (const e of hr.ok ? (await hr.json()).HistoryRecords || [] : []) console.log(`   history: ${e.DateUTC} | ${e.Changes} | ${e.Details} | ${e.User}`);
}

const bt = await fetch(`${XERO_API}/BankTransactions?where=${encodeURIComponent('Type=="RECEIVE" AND Total==562.50')}`, { headers: h });
for (const t of bt.ok ? (await bt.json()).BankTransactions || [] : []) {
  console.log(`receive money £${t.Total} | ${t.Date} | ${t.Contact?.Name} | reconciled ${t.IsReconciled} | ${t.Status}`);
}
console.log(`BankTransactions 562.50 query status ${bt.status}`);
await xeroPersistRefreshToDb(admin);
