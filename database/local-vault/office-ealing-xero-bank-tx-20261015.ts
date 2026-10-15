/**
 * Read only on Xero. Lists RECEIVE bank transactions for LB Ealing (Mar-Oct 2026):
 * reconciled or not, and which account they hit. Seeds the refresh token from the
 * vault (fresh consent) and persists the rotated token to portal_xero_oauth.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-xero-bank-tx-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XERO_API, xeroAccessToken, xeroAuthHeaders, xeroSeedRefreshToken } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  return out;
}
const vault = readEnv("database/local-vault/private/parent-portal-secrets.env");
for (const p of ["local-secrets/secrets.env", "local-secrets/edge-secrets.env"]) {
  for (const [k, v] of Object.entries(readEnv(p))) if (k && !Deno.env.get(k)) Deno.env.set(k, v);
}
for (const [k, v] of Object.entries(vault)) if (k && !Deno.env.get(k)) Deno.env.set(k, v);
if (vault.XERO_REFRESH_TOKEN) Deno.env.set("XERO_REFRESH_TOKEN", vault.XERO_REFRESH_TOKEN);
if (vault.XERO_TENANT_ID) Deno.env.set("XERO_TENANT_ID", vault.XERO_TENANT_ID);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
xeroSeedRefreshToken(vault.XERO_REFRESH_TOKEN);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) {
  console.log("xero auth failed");
  Deno.exit(1);
}
console.log("token ok, rotated refresh saved to portal_xero_oauth");
const h = xeroAuthHeaders(token);

const AMTS = new Set(["3862.70", "2317.62", "5057.92", "3527.44", "10748.00", "3090.16", "2929.84", "2383.11"]);
const where = encodeURIComponent('Type=="RECEIVE" AND Date>=DateTime(2026,03,01)');
const rows: any[] = [];
for (let page = 1; page < 30; page++) {
  const r = await fetch(`${XERO_API}/BankTransactions?where=${where}&page=${page}`, { headers: h });
  if (!r.ok) {
    console.log("BankTransactions", r.status, (await r.text()).slice(0, 200));
    break;
  }
  const list = (await r.json()).BankTransactions || [];
  rows.push(...list);
  if (list.length < 100) break;
}
console.log(`RECEIVE bank transactions since 1 Mar 2026: ${rows.length}`);

const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};
const hits = rows.filter((t) => {
  const blob = `${t.Contact?.Name || ""} ${t.Reference || ""} ${(t.LineItems || []).map((l: any) => l.Description).join(" ")}`;
  return /ealing|business support|domcare|cwd/i.test(blob) || AMTS.has(Number(t.Total).toFixed(2));
});
for (const t of hits.sort((a, b) => xdate(a.Date).localeCompare(xdate(b.Date)))) {
  const lines = (t.LineItems || []).map((l: any) => `${l.AccountCode || "?"} ${l.Description || ""} ${l.LineAmount}`).join(" ; ");
  console.log(
    `${xdate(t.Date)} | £${Number(t.Total).toFixed(2)} | ${t.Contact?.Name || "-"} | ref ${t.Reference || "-"} | ` +
      `bank ${t.BankAccount?.Name || "-"} | reconciled ${t.IsReconciled} | ${t.Status} | ${lines}`,
  );
}

const pr = await fetch(`${XERO_API}/Payments?where=${encodeURIComponent("Date>=DateTime(2026,03,01)")}`, { headers: h });
if (pr.ok) {
  const pays = ((await pr.json()).Payments || []).filter((p: any) => AMTS.has(Number(p.Amount).toFixed(2)));
  for (const p of pays) {
    console.log(
      `payment ${xdate(p.Date)} £${p.Amount} | ${p.Invoice?.Contact?.Name || "-"} | ${p.Invoice?.InvoiceNumber || "-"} | reconciled ${p.IsReconciled} | ${p.Status}`,
    );
  }
}
await xeroPersistRefreshToDb(admin);
