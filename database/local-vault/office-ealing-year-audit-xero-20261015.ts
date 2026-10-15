/**
 * Read only. Ealing 2025/26 audit: Xero ACCREC invoices + credit notes to Ealing (or naming
 * the Ealing children) from June 2025, with lines, paid and due amounts.
 * Writes database/local-vault/private/ealing-mail/xero_ealing_audit.json.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-year-audit-xero-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeFileSync } from "node:fs";
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
if (!token) {
  console.log("xero auth failed: reconnect Xero, then re-run");
  Deno.exit(1);
}
const h = xeroAuthHeaders(token);
const day = (s: unknown) => {
  const m = /Date\((\d+)/.exec(String(s));
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};

const KIDS =
  /ealing|business support team|tinashe|nekati|amar-?rai|singh|samer|bakhiet|steven|cesare|aadam|adaam|amaar|aydaan|ahmed|yousef|alsamar|721303|780469|782835|972515|719915|626186|724579|790419/i;

async function pageAll(path: string, key: string) {
  const out: any[] = [];
  for (let page = 1; page < 60; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${XERO_API}/${path}${sep}page=${page}`, { headers: h });
    if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
    const j = await r.json();
    const rows = j[key] || [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

const where = encodeURIComponent('Type=="ACCREC" AND Date>=DateTime(2025,06,01)');
const invoices = await pageAll(`Invoices?where=${where}`, "Invoices");
const cwhere = encodeURIComponent('Type=="ACCRECCREDIT" AND Date>=DateTime(2025,06,01)');
const credits = await pageAll(`CreditNotes?where=${cwhere}`, "CreditNotes");

const pick = (x: any) => {
  const lines = (x.LineItems || []).map((l: any) => `${l.Description || ""} | ${l.Quantity} x ${l.UnitAmount} = ${l.LineAmount}`);
  return {
    number: x.InvoiceNumber || x.CreditNoteNumber,
    date: day(x.Date || x.DateString),
    contact: x.Contact?.Name,
    reference: x.Reference || "",
    status: x.Status,
    total: x.Total,
    paid: x.AmountPaid ?? null,
    credited: x.AmountCredited ?? null,
    due: x.AmountDue ?? x.RemainingCredit ?? null,
    payments: (x.Payments || []).map((p: any) => ({ date: day(p.Date), amount: p.Amount, ref: p.Reference || "" })),
    lines,
  };
};

const inv = invoices
  .filter((x) => KIDS.test(`${x.Contact?.Name} ${x.Reference} ${(x.LineItems || []).map((l: any) => l.Description).join(" ")}`))
  .map(pick);
const cn = credits
  .filter((x) => KIDS.test(`${x.Contact?.Name} ${x.Reference} ${(x.LineItems || []).map((l: any) => l.Description).join(" ")}`))
  .map(pick);

writeFileSync("database/local-vault/private/ealing-mail/xero_ealing_audit.json", JSON.stringify({ invoices: inv, credits: cn }, null, 2));
console.log(`invoices ${inv.length} / credit notes ${cn.length} (of ${invoices.length} / ${credits.length})`);
for (const x of [...inv, ...cn]) {
  console.log(`${x.number} | ${x.date} | ${x.contact} | ${x.status} | total ${x.total} paid ${x.paid} cred ${x.credited} due ${x.due} | ${x.reference}`);
}
await xeroPersistRefreshToDb(admin);
