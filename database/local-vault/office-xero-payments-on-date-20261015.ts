/**
 * Read-only: every Xero payment on one or more dates (any account), with invoice, amount, reference
 * and whether it is reconciled. Helps find what a bank statement line was matched to.
 *
 *   npx -y deno run -A database/local-vault/office-xero-payments-on-date-20261015.ts 2026-08-10 [2026-08-07 ...]
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

const dates = Deno.args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dates.length) Deno.exit(1);

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

for (const d of dates) {
  const [y, m, dd] = d.split("-").map(Number);
  const where = encodeURIComponent(`Date==DateTime(${y},${m},${dd})`);
  const r = await fetch(`${XERO_API}/Payments?where=${where}`, { headers: h });
  const list = r.ok ? (await r.json()).Payments || [] : [];
  if (!r.ok) console.log(r.status, (await r.text()).slice(0, 300));
  console.log(`== ${d} (${list.length})`);
  for (const p of list) {
    const doc = p.Invoice?.InvoiceNumber || p.CreditNote?.CreditNoteNumber || "-";
    const who = p.Invoice?.Contact?.Name || p.CreditNote?.Contact?.Name || "-";
    console.log(`${doc} | ${who} | £${p.Amount} | ${p.Status} | reconciled ${p.IsReconciled} | ref ${p.Reference || "-"}`);
  }
}
await xeroPersistRefreshToDb(admin);
