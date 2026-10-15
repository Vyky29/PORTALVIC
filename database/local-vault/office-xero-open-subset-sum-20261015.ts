/**
 * Read only. Open ACCREC invoices whose contact name matches --contact=regex; finds combinations of
 * AmountDue that add up to a target (first positional arg).
 *
 *   npx -y deno run -A database/local-vault/office-xero-open-subset-sum-20261015.ts 15080.14 --contact=NHS|ICB|Integrated
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

const target = Math.round(Number(Deno.args[0]) * 100);
const contactRe = new RegExp(Deno.args.find((a) => a.startsWith("--contact="))?.slice(10) || ".", "i");
const all: any[] = [];
for (let page = 1; page < 20; page++) {
  const r = await fetch(`${XERO_API}/Invoices?Statuses=AUTHORISED&page=${page}&where=${encodeURIComponent('Type=="ACCREC"')}`, { headers: h });
  const list = r.ok ? (await r.json()).Invoices || [] : [];
  all.push(...list);
  if (list.length < 100) break;
}
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};
const cands = all
  .filter((x) => contactRe.test(String(x.Contact?.Name || "")) && Number(x.AmountDue) > 0)
  .map((x) => ({ n: x.InvoiceNumber, c: x.Contact?.Name, d: xdate(x.Date), ref: x.Reference || "", due: Math.round(Number(x.AmountDue) * 100) }));
console.log(`Open candidates (${cands.length}):`);
for (const c of cands) console.log(`  ${c.n} | ${c.c} | ${c.d} | ${(c.due / 100).toFixed(2)} | ${c.ref}`);

const hits: string[][] = [];
const walk = (i: number, sum: number, pick: number[]) => {
  if (hits.length >= 20) return;
  if (sum === target) {
    hits.push(pick.map((k) => `${cands[k].n} ${(cands[k].due / 100).toFixed(2)}`));
    return;
  }
  if (i >= cands.length || sum > target || pick.length >= 10) return;
  walk(i + 1, sum + cands[i].due, [...pick, i]);
  walk(i + 1, sum, pick);
};
walk(0, 0, []);
console.log(`\nCombinations = ${(target / 100).toFixed(2)}: ${hits.length}`);
for (const hcomb of hits) console.log(`  ${hcomb.join(" + ")}`);
await xeroPersistRefreshToDb(admin);
