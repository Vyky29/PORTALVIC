/**
 * Read only. Xero status / amount due for a list of invoice numbers (args), plus open ACCREC for given contacts.
 *
 *   npx -y deno run -A database/local-vault/office-xero-invoice-status-lookup-20261015.ts INV-0342 INV-P-0095 ...
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

const nums = Deno.args.filter((a) => /^INV|^CN/.test(a));
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};
for (let i = 0; i < nums.length; i += 40) {
  const chunk = nums.slice(i, i + 40);
  const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${chunk.join(",")}`, { headers: h });
  const list = r.ok ? (await r.json()).Invoices || [] : [];
  for (const n of chunk) {
    const found = list.filter((x: any) => x.InvoiceNumber === n);
    if (!found.length) console.log(`${n} | not in Xero`);
    for (const x of found) {
      console.log(`${n} | ${x.Status} | ${x.Contact?.Name} | ${xdate(x.Date)} | total ${x.Total} | due ${x.AmountDue} | paid ${x.AmountPaid} | ref ${x.Reference || "-"}`);
    }
  }
}
await xeroPersistRefreshToDb(admin);
