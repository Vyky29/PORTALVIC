/**
 * Read only. Xero payments since 15 Jul 2026 grouped by bank account, joined to the portal paid_via
 * of the INV-P, to see where Stripe / GoCardless / bank payments land in Xero.
 *
 *   npx -y deno run -A database/local-vault/office-xero-payments-by-account-20261015.ts
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

const pays: any[] = [];
for (let page = 1; page < 40; page++) {
  const r = await fetch(`${XERO_API}/Payments?where=${encodeURIComponent("Date>=DateTime(2026,07,15)")}&page=${page}`, { headers: h });
  if (!r.ok) break;
  const list = (await r.json()).Payments || [];
  pays.push(...list);
  if (list.length < 100) break;
}
const accR = await fetch(`${XERO_API}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, { headers: h });
const accName = new Map(((await accR.json()).Accounts || []).map((a: any) => [a.AccountID, a.Name]));

const nums = [...new Set(pays.map((p) => p.Invoice?.InvoiceNumber).filter(Boolean))];
const { data: shares } = await admin.from("portal_parent_invoice_share").select("invoice_number, paid_via, payment_schedule").in("invoice_number", nums);
const via = new Map<string, string>();
for (const s of shares || []) {
  const rows = Array.isArray(s.payment_schedule) ? s.payment_schedule : [];
  const v = [...new Set(rows.map((x: any) => x.paid_via).filter(Boolean))].join("/") || s.paid_via || "-";
  via.set(s.invoice_number, v);
}
const groups = new Map<string, Map<string, number>>();
for (const p of pays) {
  if (p.Status === "DELETED") continue;
  const acc = String(accName.get(p.Account?.AccountID) || p.Account?.AccountID || "?");
  const v = via.get(p.Invoice?.InvoiceNumber) || (String(p.Invoice?.InvoiceNumber || "").startsWith("INV-P") ? "portal?" : "non-portal");
  const g = groups.get(acc) || new Map();
  g.set(v, (g.get(v) || 0) + 1);
  groups.set(acc, g);
}
for (const [acc, g] of groups) console.log(`${acc}: ${[...g.entries()].map(([v, n]) => `${v} x${n}`).join(", ")}`);

/* Open sales invoices in Xero vs portal status. */
const open: any[] = [];
for (let page = 1; page < 20; page++) {
  const r = await fetch(`${XERO_API}/Invoices?where=${encodeURIComponent('Type=="ACCREC" AND Status=="AUTHORISED"')}&page=${page}`, { headers: h });
  if (!r.ok) break;
  const list = (await r.json()).Invoices || [];
  open.push(...list);
  if (list.length < 100) break;
}
const { data: openShares } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, paid_via, payment_schedule, payment_method_hint")
  .in("invoice_number", open.map((i) => i.InvoiceNumber));
const byNum = new Map((openShares || []).map((s) => [s.invoice_number, s]));
const buckets = new Map<string, string[]>();
for (const i of open) {
  const s: any = byNum.get(i.InvoiceNumber);
  let k = "not a portal invoice";
  if (s) {
    const rows = Array.isArray(s.payment_schedule) ? s.payment_schedule : [];
    const v = [...new Set(rows.filter((x: any) => x.status === "paid").map((x: any) => x.paid_via).filter(Boolean))].join("/") || s.paid_via || "";
    k = `portal ${s.payment_status} | ${s.payment_method_hint} | paid via ${v || "-"}`;
  }
  buckets.set(k, [...(buckets.get(k) || []), `${i.InvoiceNumber} £${i.AmountDue}`]);
}
console.log(`\nOpen ACCREC in Xero: ${open.length}`);
for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${v.length} | ${v.slice(0, 6).join(", ")}`);
await xeroPersistRefreshToDb(admin);
