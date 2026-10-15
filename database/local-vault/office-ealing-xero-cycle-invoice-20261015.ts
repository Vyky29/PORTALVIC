/**
 * Ealing pays by 4-week Domcare pay cycle (weekly rate = annual / 52.14), not by month or session.
 * One Xero-only ACCREC invoice per cycle, built from the Ealing remittance PDF, so the bank receipt
 * matches 1:1 in Reconcile. Portal annual INV-Ps (INV-P-0328/0329/0330/0332) are NOT pushed to Xero.
 *
 * Invoice number EAL-<pay cycle id>, contact "Business Support Team (Children)", 202 / Exempt Income.
 * Not emailed to Ealing.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-ealing-xero-cycle-invoice-20261015.ts 73979 [--apply]
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

type CycleLine = { client: string; ref: string; weeks: number; weekly: number; amount: number };
type Cycle = { from: string; to: string; paid: string; total: number; lines: CycleLine[] };

const CYCLES: Record<string, Cycle> = {
  "73979": {
    from: "2026-09-07",
    to: "2026-10-04",
    paid: "2026-10-12",
    total: 3090.16,
    lines: [
      { client: "Nekati, Tinashe", ref: "724579", weeks: 4, weekly: 502.88, amount: 2011.52 },
      { client: "Singh, Amar-Rai", ref: "626186", weeks: 4, weekly: 145.76, amount: 583.04 },
      { client: "Bakhiet, Samer", ref: "972515", weeks: 4, weekly: 87.46, amount: 349.84 },
      { client: "Cesare, Steven", ref: "719915", weeks: 4, weekly: 36.44, amount: 145.76 },
    ],
  },
};

const cycleId = Deno.args.find((a) => /^\d+$/.test(a)) || "";
const APPLY = Deno.args.includes("--apply");
const cycle = CYCLES[cycleId];
if (!cycle) {
  console.log(`unknown cycle ${cycleId}; known: ${Object.keys(CYCLES).join(", ")}`);
  Deno.exit(1);
}
const sum = Math.round(cycle.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
if (Math.abs(sum - cycle.total) > 0.005) {
  console.log(`lines add up to ${sum}, remittance says ${cycle.total} - abort`);
  Deno.exit(1);
}
for (const l of cycle.lines) {
  if (Math.abs(l.weeks * l.weekly - l.amount) > 0.005) {
    console.log(`${l.client}: ${l.weeks} x ${l.weekly} != ${l.amount} - abort`);
    Deno.exit(1);
  }
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

const number = `EAL-${cycleId}`;
const ex = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${number}`, { headers: h });
const existing = ex.ok ? ((await ex.json()).Invoices || []).filter((i: any) => i.Status !== "DELETED" && i.Status !== "VOIDED") : [];
if (existing.length) {
  console.log(`${number} already exists (${existing[0].Status}, total ${existing[0].Total}) - nothing to do`);
  Deno.exit(0);
}
const cr = await fetch(`${XERO_API}/Contacts?where=${encodeURIComponent('Name=="Business Support Team (Children)"')}`, { headers: h });
const contact = cr.ok ? (await cr.json()).Contacts?.[0] : null;
if (!contact) {
  console.log("contact 'Business Support Team (Children)' not found - abort");
  Deno.exit(1);
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const period = `${dmy(cycle.from)} - ${dmy(cycle.to)}`;
const invoice = {
  Type: "ACCREC",
  Contact: { ContactID: contact.ContactID },
  InvoiceNumber: number,
  Reference: `Ealing remittance ${cycleId} (${period})`,
  Date: cycle.to,
  DueDate: cycle.paid,
  LineAmountTypes: "Exclusive",
  Status: "AUTHORISED",
  LineItems: cycle.lines.map((l) => ({
    Description: `${l.client} (client ${l.ref}) - Domcare pay cycle ${cycleId}, ${period}: ${l.weeks} weeks @ £${l.weekly.toFixed(2)}`,
    Quantity: l.weeks,
    UnitAmount: l.weekly,
    AccountCode: "202",
    TaxType: "EXEMPTOUTPUT",
  })),
};
console.log(`${number} | ${contact.Name} | date ${cycle.to} | due ${cycle.paid} | total ${cycle.total}`);
for (const l of invoice.LineItems) console.log(`  ${l.Quantity} x ${l.UnitAmount} | ${l.Description}`);
if (!APPLY) {
  console.log("dry run: re-run with --apply to create it (not emailed).");
  Deno.exit(0);
}
const pr = await fetch(`${XERO_API}/Invoices`, { method: "PUT", headers: h, body: JSON.stringify({ Invoices: [invoice] }) });
const body = await pr.json().catch(() => ({}));
const inv = body.Invoices?.[0];
console.log(pr.status, inv ? `${inv.InvoiceNumber} ${inv.Status} total ${inv.Total} tax ${inv.TotalTax} ${JSON.stringify(inv.ValidationErrors || [])}` : JSON.stringify(body).slice(0, 600));
await xeroPersistRefreshToDb(admin);
