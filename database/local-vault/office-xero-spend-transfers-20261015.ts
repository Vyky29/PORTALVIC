/**
 * Read only. SPEND-TRANSFER / RECEIVE-TRANSFER bank transactions on Tide since 15 Jul, with the paired
 * transfer (other account) so we can tell where unmatched ones came from.
 *
 *   npx -y deno run -A database/local-vault/office-xero-spend-transfers-20261015.ts [--accounts]
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
if (Deno.args.includes("--accounts")) {
  const a = await fetch(`${XERO_API}/Accounts`, { headers: h });
  for (const x of (a.ok ? (await a.json()).Accounts : []) || []) {
    if (/interest|suspense|director|sales|nhs/i.test(x.Name)) console.log(`${x.Code} | ${x.Name} | ${x.Type}`);
  }
  Deno.exit(0);
}
const where = encodeURIComponent('(Type=="SPEND-TRANSFER"||Type=="RECEIVE-TRANSFER")&&Date>=DateTime(2026,07,01)');
const r = await fetch(`${XERO_API}/BankTransactions?where=${where}`, { headers: h });
const list = r.ok ? (await r.json()).BankTransactions || [] : [];
if (!r.ok) console.log(r.status, (await r.text()).slice(0, 300));
for (const t of list) {
  console.log(`${xdate(t.Date)} | ${t.Type} | ${t.BankAccount?.Name} | £${t.Total} | reconciled ${t.IsReconciled} | ref ${t.Reference || "-"} | ${t.BankTransactionID}`);
}
await xeroPersistRefreshToDb(admin);
