/**
 * Yassir — last session Thu 10 Sep 2026 (Acton Aquatic 4.30–5 Roberto).
 *
 * Invoice INV-P-0207 (Sep H&F monthly, ready) → 1 × £50 (10 Sept only); regen PDF.
 * Void: future monthly INV-Ps (Oct 2026+) + unpaid year drafts for contact 119.
 *
 * Roster/MADRE/booking: keep Yassir named today via dated canonical; standing seat
 * → NO PARTICIPANT from next Thursday (office sync + canonical).
 *
 *   npx -y deno run -A database/local-vault/office-yassir-cancel-keep-today-20260910.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-yassir-cancel-keep-today-20260910.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = Deno.env.get("APPLY") === "1";
const CONTACT_ID = "119";
const SEP_INVOICE = "INV-P-0207";
const UNIT = 50;
const OFFICE_NOTE =
  "Office 10 Sep 2026 — Last session today (Thu 10 Sep Acton Aquatic 4.30–5 Roberto). Invoice updated to 1 session only; future funder months voided; seat released from Thu 17 Sep.";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function isFutureMonthly(row: {
  invoice_number?: string | null;
  notes?: string | null;
  ready_by?: string | null;
}) {
  const blob = `${row.notes || ""} ${row.ready_by || ""}`;
  if (/hf_year_draft/i.test(blob)) return false;
  if (/hf_month_2026-09|_month_2026-09_/i.test(blob)) return false;
  if (/hf_month_2026-(1[0-2])|hf_month_2027-/i.test(blob)) return true;
  const n = String(row.invoice_number || "");
  const FUTURE = [
    "INV-P-0208",
    "INV-P-0209",
    "INV-P-0210",
    "INV-P-0211",
    "INV-P-0212",
    "INV-P-0213",
    "INV-P-0214",
    "INV-P-0215",
    "INV-P-0216",
  ];
  return FUTURE.includes(n);
}

function isYearDraft(row: {
  notes?: string | null;
  ready_by?: string | null;
  amount_gbp?: number | null;
}) {
  const blob = `${row.notes || ""} ${row.ready_by || ""}`;
  return (
    /hf_year_draft_yassir|office_funder_2627_hf_year_draft_yassir/i.test(blob) ||
    (Number(row.amount_gbp) >= 1500 &&
      /yassir/i.test(blob) &&
      /year DRAFT|hf_year_draft/i.test(blob))
  );
}

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, share_status, amount_gbp, amount_paid_gbp, notes, ready_by, due_date, billing_term, line_items, line_description, quantity, unit_price_gbp, document_id",
  )
  .eq("contact_id", CONTACT_ID)
  .neq("payment_status", "void");
if (error) throw error;

const sep = (rows || []).find((r) => r.invoice_number === SEP_INVOICE);
const futureMonthly = (rows || []).filter(isFutureMonthly);
const yearDrafts = (rows || []).filter(isYearDraft);

console.log("Sep invoice", sep && {
  n: sep.invoice_number,
  amount: sep.amount_gbp,
  status: sep.payment_status,
  share: sep.share_status,
  qty: sep.quantity,
});
console.log(
  "Void future monthly",
  futureMonthly.map((r) => `${r.invoice_number} £${r.amount_gbp}`),
);
console.log(
  "Void year drafts",
  yearDrafts.map((r) => `${r.invoice_number} £${r.amount_gbp}`),
);

const newLine = {
  dates: "Dates: 10 Sept",
  detail: "Thursday 4.30 to 5 pm",
  quantity: 1,
  amount_gbp: UNIT,
  description: "Aquatic Activity 30'",
  service_key: "AQUATIC_30",
  unit_price_gbp: UNIT,
  xero_item_code: "SW2",
};
const newDesc =
  "Structured activity support delivered within an aquatic environment for a SEND participant as part of funded provision.\n\n" +
  lineItemsToDescription([newLine]);

console.log("\nNew Sep line", newLine);
console.log(APPLY ? "APPLY=1 — writing" : "Dry-run — set APPLY=1 to write");

if (!APPLY) {
  console.log("Done (dry-run).");
  Deno.exit(0);
}

if (!sep?.id) throw new Error(`Missing ${SEP_INVOICE}`);
if (Number(sep.amount_paid_gbp || 0) > 0) {
  throw new Error(`Refusing paid invoice ${SEP_INVOICE}`);
}

const now = new Date().toISOString();
const { error: upSepErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: UNIT,
    quantity: 1,
    unit_price_gbp: UNIT,
    line_items: [newLine],
    line_description: newDesc,
    notes: `${String(sep.notes || "").trim()}\n\n${OFFICE_NOTE}`,
    updated_at: now,
  })
  .eq("id", sep.id);
if (upSepErr) throw upSepErr;
console.log("Updated", SEP_INVOICE, "→ £50 / 10 Sept only");

try {
  await regeneratePortalInvoiceSharePdf(admin, sep.id);
  console.log("PDF regenerated", SEP_INVOICE);
} catch (e) {
  console.warn("PDF regen failed (invoice row still updated):", e);
}

for (const r of [...futureMonthly, ...yearDrafts]) {
  if (r.invoice_number === SEP_INVOICE) continue;
  if (Number(r.amount_paid_gbp || 0) > 0) {
    console.warn("skip paid", r.invoice_number);
    continue;
  }
  const { error: voidErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      share_status: "hidden",
      notes: `${String(r.notes || "").trim()}\n\n${OFFICE_NOTE}`,
      updated_at: now,
    })
    .eq("id", r.id);
  if (voidErr) console.warn("void failed", r.invoice_number, voidErr.message);
  else console.log("Voided", r.invoice_number);
}

console.log("Done.");
