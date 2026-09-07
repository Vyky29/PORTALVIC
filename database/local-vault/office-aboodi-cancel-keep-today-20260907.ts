/**
 * Aboodi Patel (Abodi Pa) — parent cancel after today's Mon 7 Sep 2026 session.
 *
 * Invoice: INV-P-0193 (Sep H&F monthly, ready) → 1 × £100 (7 Sept only); regen PDF.
 * Void: future monthly INV-Ps (Oct 2026+) + unpaid year drafts for contact 155.
 * Roster: keep Abodi today; standing Monday Acton → open from next week (LOCAL + MADRE).
 *
 *   npx -y deno run -A database/local-vault/office-aboodi-cancel-keep-today-20260907.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-aboodi-cancel-keep-today-20260907.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = Deno.env.get("APPLY") === "1";
const CONTACT_ID = "155";
const SEP_INVOICE = "INV-P-0193";
const KEEP_DATE = "2026-09-07";
const UNIT = 100;
const OFFICE_NOTE =
  "Office 7 Sep 2026 — Parent cancelled after today's session (Mon 7 Sep Acton Aquatic 5.30–6.30). Invoice updated to 1 session only; future funder months voided; seat released from Mon 14 Sep.";

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

function isAbodi(name: unknown) {
  return /abodi|aboodi/i.test(String(name || ""));
}

function isFutureMonthly(row: {
  invoice_number?: string | null;
  notes?: string | null;
  ready_by?: string | null;
  due_date?: string | null;
  billing_term?: string | null;
}) {
  const blob = `${row.notes || ""} ${row.ready_by || ""}`;
  if (/hf_year_draft|year DRAFT/i.test(blob)) return false;
  const due = String(row.due_date || "").slice(0, 10);
  // Monthly Oct 2026+ (due dates are typically 1st of following month for Sep bill due Oct 1)
  // Safer: void by invoice list / notes month markers after Sep.
  if (/hf_month_2026-09|_month_2026-09_/i.test(blob)) return false;
  if (/hf_month_2026-(1[0-2])|hf_month_2027-/i.test(blob)) return true;
  if (/Dates:.*(Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)/i.test(blob) &&
    !/Dates:.*Sept/i.test(blob) &&
    /office_funder_2627/i.test(blob)) {
    // past summer arrears months — do not void by this alone
  }
  // Explicit future month INV-Ps for this contact
  const n = String(row.invoice_number || "");
  const FUTURE = [
    "INV-P-0194",
    "INV-P-0195",
    "INV-P-0196",
    "INV-P-0197",
    "INV-P-0198",
    "INV-P-0199",
  ];
  if (FUTURE.includes(n)) return true;
  return false;
}

function isYearDraft(row: { notes?: string | null; ready_by?: string | null; amount_gbp?: number | null }) {
  const blob = `${row.notes || ""} ${row.ready_by || ""}`;
  return /hf_year_draft_abodi|office_funder_2627_hf_year_draft_abodi/i.test(blob) ||
    (Number(row.amount_gbp) >= 3000 && /abodi-patel|Aboodi Patel/i.test(blob) && /year DRAFT/i.test(blob));
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
  dates: "Dates: 7 Sept",
  detail: "Monday 5.30 to 6.30 pm",
  quantity: 1,
  amount_gbp: UNIT,
  description: "Aquatic Activity 60'",
  service_key: "AQUATIC_60",
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
console.log("Updated", SEP_INVOICE, "→ £100 / 7 Sept only");

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
  if (voidErr) throw voidErr;
  console.log("Voided", r.invoice_number);
}

// MADRE: Abodi Monday seats already cleared to No participant (rev 462+).
// Today kept via canonical dated row (Sep 7) + clientRosterGoneFromDates from 8 Sep.
console.log("MADRE: skip clear (standing open + dated last session in canonical)");

console.log("Done.");
