/**
 * For a bank receipt that never reached the Xero feed: replace each unreconciled payment on the given
 * invoices (and date) with the same payment marked IsReconciled, so nothing waits in Reconcile.
 * Xero cannot edit a payment, so it deletes and re-creates (same account, date, amount, reference).
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-xero-repay-reconciled-20261015.ts --date=2026-08-10 INV-0377 INV-0378 INV-0379 [--apply]
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

const DATE = (Deno.args.find((a) => a.startsWith("--date=")) || "").slice(7);
const APPLY = Deno.args.includes("--apply");
const numbers = Deno.args.filter((a) => !a.startsWith("--"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE) || !numbers.length) {
  console.log("usage: --date=YYYY-MM-DD <InvoiceNumber>... [--apply]");
  Deno.exit(1);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = { ...xeroAuthHeaders(token), "Content-Type": "application/json" };
const pause = () => new Promise((r) => setTimeout(r, 1100));
const xdate = (s: unknown) => {
  const m = String(s || "").match(/\/Date\((\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};

let problems = 0;
for (const number of numbers) {
  const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${encodeURIComponent(number)}`, { headers: h });
  await pause();
  const inv = (r.ok ? (await r.json()).Invoices || [] : []).find((i: any) => i.Status !== "VOIDED" && i.Status !== "DELETED");
  if (!inv) {
    console.log(`${number}: not found`);
    problems++;
    continue;
  }
  for (const p0 of inv.Payments || []) {
    const pr = await fetch(`${XERO_API}/Payments/${p0.PaymentID}`, { headers: h });
    await pause();
    const p = pr.ok ? (await pr.json()).Payments?.[0] : null;
    if (!p || xdate(p.Date) !== DATE) continue;
    console.log(`${number} | ${inv.Contact?.Name} | pay ${DATE} £${p.Amount} | ${p.Account?.Name || p.Account?.AccountID} | reconciled ${p.IsReconciled} | ref ${p.Reference || "-"}`);
    if (p.IsReconciled || !APPLY) continue;
    const d = await fetch(`${XERO_API}/Payments/${p.PaymentID}`, { method: "POST", headers: h, body: JSON.stringify({ Status: "DELETED" }) });
    await pause();
    console.log(`  delete: ${d.status}`);
    if (!d.ok) {
      console.log(`  ${(await d.text()).slice(0, 300)}`);
      problems++;
      continue;
    }
    const pay = { Invoice: { InvoiceID: inv.InvoiceID }, Account: { AccountID: p.Account?.AccountID }, Date: DATE, Amount: p.Amount, Reference: p.Reference || "", IsReconciled: true };
    const c = await fetch(`${XERO_API}/Payments`, { method: "PUT", headers: h, body: JSON.stringify({ Payments: [pay] }) });
    await pause();
    const cb = await c.json().catch(() => ({}));
    const np = cb.Payments?.[0];
    console.log(`  re-create reconciled: ${c.status} reconciled ${np?.IsReconciled} ${JSON.stringify(np?.ValidationErrors || (c.ok ? [] : cb)).slice(0, 300)}`);
    if (!c.ok) problems++;
  }
}
console.log(`${APPLY ? "done" : "dry run"}; problems: ${problems}`);
await xeroPersistRefreshToDb(admin);
