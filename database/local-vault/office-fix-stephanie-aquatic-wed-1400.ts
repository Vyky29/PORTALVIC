/**
 * Fix Stephanie Ng INV-P-0098:
 * Was wrong Multi-Activity Wed 4.30–6 (14×£120 − £120 credit = £1560).
 * Correct: Aquatic Activity 60' Wed 4.30–5.30 · Acton · 14 × £100 = £1400 · flexi DP exempt.
 * Also regenerate Agata/Erik INV-P-0014 PDF (flexi 2×£780 — stale monthly PDF).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-fix-stephanie-aquatic-wed-1400.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-fix-stephanie-aquatic-wed-1400.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  formatGroupedSessionDates,
  lineItemsToDescription,
  remainingTermSessionDates,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { nextInstalmentDueDate } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const STEPHANIE_CONTACT = "186";
const STEPHANIE_INV = "INV-P-0098";
const AGATA_INV = "INV-P-0014";
const UNIT = 100;
const SESSIONS = 14;
const TOTAL = UNIT * SESSIONS; // 1400
const HALF = TOTAL / 2; // 700

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
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const wedDates = remainingTermSessionDates("autumn", "Wednesday", "2026-08-01");
if (wedDates.length !== SESSIONS) {
  console.warn("WARN catalog Wed count", wedDates.length, "expected", SESSIONS);
}
const datesLabel = formatGroupedSessionDates(wedDates) || "";

const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_60",
    description: "Aquatic Activity 60'",
    detail: "Wednesday 4.30 to 5.30 pm · Acton",
    dates: datesLabel,
    quantity: SESSIONS,
    unit_price_gbp: UNIT,
    amount_gbp: TOTAL,
    xero_item_code: null,
  },
];

const lineDescription = lineItemsToDescription(lineItems, { fundedProvision: true });
const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    due_date: "2026-08-15",
    amount_gbp: HALF,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: "2026-10-26",
    amount_gbp: HALF,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const { data: steph, error: sErr } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", STEPHANIE_INV)
  .maybeSingle();
if (sErr || !steph) throw new Error(sErr?.message || "Stephanie invoice missing");

console.log(APPLY ? "APPLY" : "DRY", "Stephanie before", {
  amount: steph.amount_gbp,
  status: steph.payment_status,
  vat: steph.vat_mode,
  hint: steph.payment_method_hint,
  desc: String(steph.line_description || "").slice(0, 200),
  schedule: steph.payment_schedule,
});
console.log("→ after", {
  amount: TOTAL,
  unit: UNIT,
  sessions: SESSIONS,
  schedule,
  lineDescription: lineDescription.slice(0, 400),
});

// Cyrus check (informational)
const { data: cyrus } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number,amount_gbp,line_description")
  .eq("invoice_number", "INV-P-0018")
  .maybeSingle();
const cDesc = String(cyrus?.line_description || "");
const cyrusWedMulti = /Multi-Activity[\s\S]*Wednesday/i.test(cDesc);
const cyrusWedAq = /Aquatic Activity 60'[\s\S]*Wednesday 4 to 5/i.test(cDesc);
console.log("Cyrus INV-P-0018 check", {
  amount: cyrus?.amount_gbp,
  wed_aquatic_ok: cyrusWedAq,
  wed_multi_present: cyrusWedMulti,
  note: cyrusWedAq && !cyrusWedMulti
    ? "OK — Wed is Aquatic 60' (£1400), no Wed Multi"
    : "REVIEW needed",
});

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const note =
  `${String(steph.notes || "").trim()} · office 11 Aug 2026: corrected MA Wed 90' → Aquatic 60' Wed 4.30–5.30 Acton · 14×£100=£1400 flexi (removed stale £120 MA credit)`.trim();

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: TOTAL,
    quantity: SESSIONS,
    unit_price_gbp: UNIT,
    line_description: lineDescription,
    line_items: lineItems,
    payment_schedule: schedule,
    next_instalment_due: nextInstalmentDueDate(schedule),
    due_date: "2026-08-15",
    billing_term: "autumn",
    payment_method_hint: "bank_transfer",
    vat_mode: "exempt",
    notes: note,
    amount_paid_gbp: 0,
    payment_status: "unpaid",
    updated_at: new Date().toISOString(),
  })
  .eq("id", steph.id);
if (upErr) throw upErr;

const regenS = await regeneratePortalInvoiceSharePdf(admin, steph.id);
console.log("Stephanie PDF", regenS);

// Reenrol payload autumn total
const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id,payload")
  .eq("participant_contact_id", STEPHANIE_CONTACT)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (sub?.payload) {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const totals = (payload.term_totals || {}) as Record<string, unknown>;
  totals.autumn = TOTAL;
  payload.term_totals = totals;
  const funding = (payload.funding || {}) as Record<string, unknown>;
  const choices = (funding.choices_2627 || {}) as Record<string, unknown>;
  if (choices) {
    // keep flexi bank / DP labels; just note package change in auto note if present
  }
  const { error: subErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", sub.id);
  if (subErr) console.warn("reenrol update", subErr.message);
  else console.log("reenrol autumn total →", TOTAL);
}

// Agata PDF regen (schedule already flexi in DB)
const { data: agata } = await admin
  .from("portal_parent_invoice_share")
  .select("id,invoice_number,payment_schedule,amount_gbp")
  .eq("invoice_number", AGATA_INV)
  .maybeSingle();
if (agata?.id) {
  const regenA = await regeneratePortalInvoiceSharePdf(admin, agata.id);
  console.log("Agata PDF", agata.invoice_number, agata.amount_gbp, agata.payment_schedule, regenA);
}

console.log("DONE");
