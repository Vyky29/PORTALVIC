/**
 * Read only. ACCREC invoices created / changed in Xero since a UTC time (default: today 00:00),
 * with payments, so a portal push can be checked (contact, account, tax, status, amount due).
 *
 *   npx -y deno run -A database/local-vault/office-xero-invoices-modified-since-20261015.ts [2026-10-15T15:00:00]
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

const since = Deno.args[0] || new Date().toISOString().slice(0, 10) + "T00:00:00";
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = { ...xeroAuthHeaders(token), "If-Modified-Since": since };
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 16) : "";
};
for (let page = 1; page < 10; page++) {
  const r = await fetch(`${XERO_API}/Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}`, { headers: h });
  const list = r.ok ? (await r.json()).Invoices || [] : [];
  for (const i of list) {
    const lines = (i.LineItems || []).map((l: any) => `${l.AccountCode}/${l.TaxType} £${l.LineAmount}`).join(" + ");
    const pays = (i.Payments || []).map((p: any) => `£${p.Amount}`).join(", ");
    console.log(`${i.InvoiceNumber} | ${i.Status} | ${i.Contact?.Name} | date ${xdate(i.DateString ? `/Date(${Date.parse(i.DateString)})` : i.Date).slice(0, 10)} | total £${i.Total} | due £${i.AmountDue} | ${lines} | pays ${pays || "-"} | ref ${i.Reference || "-"} | updated ${xdate(i.UpdatedDateUTC)}`);
  }
  if (list.length < 100) break;
}
await xeroPersistRefreshToDb(admin);
