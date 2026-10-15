/**
 * Read only. RECEIVE bank transactions whose contact name contains the arg, with line items
 * (description / account / tax / tracking) to see how the office booked them.
 *
 *   npx -y deno run -A database/local-vault/office-xero-receive-money-by-contact-20261015.ts EALING
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
const name = Deno.args[0] || "EALING";
const where = encodeURIComponent(`Type=="RECEIVE"&&Contact.Name.Contains("${name}")`);
for (let page = 1; page < 10; page++) {
  const r = await fetch(`${XERO_API}/BankTransactions?where=${where}&page=${page}`, { headers: h });
  const list = r.ok ? (await r.json()).BankTransactions || [] : [];
  for (const t of list.sort((a: any, b: any) => xdate(a.Date).localeCompare(xdate(b.Date)))) {
    if (t.Status === "DELETED") continue;
    console.log(`${xdate(t.Date)} | ${t.Contact?.Name} | £${t.Total} | ${t.BankAccount?.Name} | reconciled ${t.IsReconciled} | ref ${t.Reference || "-"}`);
    for (const l of t.LineItems || []) {
      const tr = (l.Tracking || []).map((x: any) => `${x.Name}=${x.Option}`).join(", ");
      console.log(`    ${l.AccountCode} | ${l.TaxType} | £${l.LineAmount} | ${String(l.Description || "").replace(/\s+/g, " ").slice(0, 70)}${tr ? " | " + tr : ""}`);
    }
  }
  if (list.length < 100) break;
}
await xeroPersistRefreshToDb(admin);
