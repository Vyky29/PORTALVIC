/**
 * Read-only: ACCREC invoices for contacts whose name matches a pattern, with line descriptions and
 * every payment (date, amount, reconciled, reference).
 *
 *   npx -y deno run -A database/local-vault/office-xero-contact-invoices-20261015.ts "LBHF" [--since=2026-05-01]
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

const pattern = Deno.args.find((a) => !a.startsWith("--")) || "";
const since = (Deno.args.find((a) => a.startsWith("--since=")) || "--since=2026-05-01").slice(8);
if (!pattern) Deno.exit(1);
const re = new RegExp(pattern, "i");

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
const xdate = (s: unknown) => {
  const m = String(s || "").match(/\/Date\((\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};

const [y, m, d] = since.split("-").map(Number);
const where = encodeURIComponent(`Type=="ACCREC"&&Date>=DateTime(${y},${m},${d})`);
const all: any[] = [];
for (let page = 1; page < 30; page++) {
  const r = await fetch(`${XERO_API}/Invoices?where=${where}&page=${page}`, { headers: h });
  if (!r.ok) {
    console.log(r.status, (await r.text()).slice(0, 300));
    break;
  }
  const list = (await r.json()).Invoices || [];
  all.push(...list);
  if (list.length < 100) break;
}
const hits = all.filter((i) => re.test(i.Contact?.Name || "") && i.Status !== "DELETED");
for (const i of hits.sort((a, b) => xdate(a.Date).localeCompare(xdate(b.Date)))) {
  const lines = (i.LineItems || []).map((l: any) => `${l.Description} £${l.LineAmount}`).join(" ; ").slice(0, 200);
  console.log(`${i.InvoiceNumber} | ${xdate(i.Date)} | ${i.Contact?.Name} | ${i.Status} | £${i.Total} due £${i.AmountDue} | ref ${i.Reference || "-"}`);
  console.log(`    ${lines}`);
  for (const p of i.Payments || []) {
    const pr = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { headers: h });
    const full = pr.ok ? (await pr.json()).Payments?.[0] : p;
    console.log(`    pay ${xdate(full.Date)} £${full.Amount} reconciled ${full.IsReconciled} ref ${full.Reference || "-"}`);
    await new Promise((s) => setTimeout(s, 1100));
  }
}
await xeroPersistRefreshToDb(admin);
