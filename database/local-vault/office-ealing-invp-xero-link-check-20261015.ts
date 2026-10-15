/**
 * Read only. Are the Ealing year INV-Ps (2026/27) linked to a Xero invoice, and what does Xero say?
 *
 *   npx -y deno run -A database/local-vault/office-ealing-invp-xero-link-check-20261015.ts
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

const NUMS = ["INV-P-0328", "INV-P-0329", "INV-P-0330", "INV-P-0331", "INV-P-0332", "INV-P-0333", "INV-P-0334"];
const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, payment_status, xero_invoice_id, contact_id")
  .in("invoice_number", NUMS);
if (error) throw error;

await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
const h = token ? xeroAuthHeaders(token) : null;

if (h) {
  const r = await fetch(`${XERO_API}/Organisation`, { headers: h });
  const o = r.ok ? (await r.json())?.Organisations?.[0] : null;
  console.log(
    o
      ? `Xero lock dates: period ${o.PeriodLockDate || "-"} | end of year ${o.EndOfYearLockDate || "-"} | FY end ${o.FinancialYearEndDay}/${o.FinancialYearEndMonth}`
      : `Organisation not readable (${r.status})`,
  );
}

for (const n of NUMS) {
  const row = (data || []).find((r) => r.invoice_number === n);
  let xero = "not checked";
  if (h) {
    const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(n)}`, { headers: h });
    const j = r.ok ? await r.json() : null;
    const x = j?.Invoices?.[0];
    xero = x ? `${x.Status} total ${x.Total} paid ${x.AmountPaid} due ${x.AmountDue} contact ${x.Contact?.Name}` : `none (${r.status})`;
  }
  console.log(`${n} | portal ${row ? `${row.amount_gbp} ${row.payment_status} xero_id ${row.xero_invoice_id || "-"}` : "missing"} | Xero: ${xero}`);
}
await xeroPersistRefreshToDb(admin);
