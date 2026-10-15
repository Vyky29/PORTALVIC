/**
 * Read only. Xero invoices + credit notes whose contact name contains each arg (non-deleted),
 * plus open ACCREC with AmountDue equal to any --amount=N, plus portal schedule rows paid 12-15 Oct.
 *
 *   npx -y deno run -A database/local-vault/office-xero-contact-open-docs-20261015.ts Belhadj Mohamud --amount=150
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

const names = Deno.args.filter((a) => !a.startsWith("--"));
const amounts = Deno.args.filter((a) => a.startsWith("--amount=")).map((a) => Number(a.slice(9)));

for (const n of names) {
  console.log(`\n== ${n}`);
  const where = encodeURIComponent(`Contact.Name.Contains("${n}")`);
  for (const [ep, key] of [["Invoices", "Invoices"], ["CreditNotes", "CreditNotes"]] as const) {
    const r = await fetch(`${XERO_API}/${ep}?where=${where}`, { headers: h });
    const list = r.ok ? (await r.json())[key] || [] : [];
    for (const x of list) {
      if (x.Status === "DELETED") continue;
      console.log(`  ${ep === "Invoices" ? x.InvoiceNumber : x.CreditNoteNumber} | ${x.Type} | ${x.Status} | ${x.Contact?.Name} | ${xdate(x.Date)} | total ${x.Total} | due ${x.AmountDue ?? x.RemainingCredit} | ref ${x.Reference || "-"}`);
    }
  }
}

if (amounts.length) {
  const r = await fetch(`${XERO_API}/Invoices?Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCREC"')}`, { headers: h });
  const list = r.ok ? (await r.json()).Invoices || [] : [];
  console.log(`\n== open ACCREC with due in ${amounts.join(", ")}`);
  for (const x of list) {
    if (amounts.some((a) => Math.abs(Number(x.AmountDue) - a) < 0.005)) {
      console.log(`  ${x.InvoiceNumber} | ${x.Contact?.Name} | ${xdate(x.Date)} | total ${x.Total} | due ${x.AmountDue} | ref ${x.Reference || "-"}`);
    }
  }
}

const { data } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, reference_text, amount_gbp, payment_status, xero_invoice_id, payment_schedule")
  .gte("updated_at", "2026-10-11");
console.log("\n== portal schedule rows paid 12-15 Oct");
for (const s of data || []) {
  for (const x of Array.isArray(s.payment_schedule) ? s.payment_schedule : []) {
    const d = String(x.paid_at || "").slice(0, 10);
    if (x.status === "paid" && d >= "2026-10-12" && d <= "2026-10-15") {
      console.log(`  ${s.invoice_number} | ${s.reference_text} | £${x.amount_gbp} paid ${d} via ${x.paid_via || "-"} | ${s.payment_status} | xero ${s.xero_invoice_id ? "yes" : "-"}`);
    }
  }
}
await xeroPersistRefreshToDb(admin);
