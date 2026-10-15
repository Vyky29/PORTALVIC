/**
 * Read only. Payments / credit allocations on given invoice numbers (args), with bank account and reconciled flag.
 *
 *   npx -y deno run -A database/local-vault/office-xero-invoice-payments-20261015.ts INV-0391
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
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = xeroAuthHeaders(token);
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};
for (const n of Deno.args) {
  const r = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(n)}`, { headers: h });
  const inv = r.ok ? (await r.json()).Invoices?.[0] : null;
  if (!inv) {
    console.log(`${n} | not found`);
    continue;
  }
  console.log(`${n} | ${inv.Status} | total ${inv.Total} | due ${inv.AmountDue}`);
  for (const p of inv.Payments || []) {
    const pr = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { headers: h });
    const pay = pr.ok ? (await pr.json()).Payments?.[0] : null;
    console.log(`  payment ${xdate(p.Date)} £${p.Amount} | ${pay?.Account?.Name || "?"} | reconciled ${pay?.IsReconciled} | ref ${p.Reference || "-"}`);
  }
  for (const c of inv.CreditNotes || []) console.log(`  credit ${c.CreditNoteNumber} £${c.AppliedAmount}`);
}
await xeroPersistRefreshToDb(admin);
