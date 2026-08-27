/**
 * Maiyar Alolabi (48) · Nizar — switch bank_transfer → GoCardless on existing
 * active mandate MD01KMJKP22N55. Keep Autumn flexi INV-P-0133 (£700 = 2×£350);
 * schedule GC £350 now + hidden Oct tracker £350.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-maiyar-to-gocardless.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-maiyar-to-gocardless.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  gocardlessCreatePayment,
  gocardlessChargeDate,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";
import { upsertMandateRow } from "../../supabase/functions/_shared/gocardless_portal.ts";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "48";
const PARENT_PERSON_ID = "5600408";
const KEEPER_INV = "INV-P-0133";
const MANDATE_ID = "MD01KMJKP22N55";
const CUSTOMER_ID = "CU01KYV6KJV1E7";
const READY_BY = "office_maiyar_to_gocardless_20260815";
const MARKER_PREFIX = "Consolidated payment tracker:";

const HALF1 = {
  seq: 1,
  label: "Autumn term · 1st half",
  due_date: "2026-08-15",
  amount_gbp: 350,
  status: "pending" as const,
};
const HALF2 = {
  seq: 2,
  label: "Autumn term · 2nd half",
  due_date: "2026-10-26",
  amount_gbp: 350,
  status: "pending" as const,
};

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
loadEnv("local-secrets/edge-secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function appendMarker(notes: unknown, targetId: string): string {
  const clean = String(notes || "")
    .replace(
      new RegExp(
        `\\n?${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[0-9a-f-]+`,
        "ig",
      ),
      "",
    )
    .trim();
  return [clean, `${MARKER_PREFIX} ${targetId}`].filter(Boolean).join("\n\n").slice(0, 800);
}

const manRes = await gocardlessRequest<{
  mandates?: { id?: string; status?: string; links?: { customer?: string } };
}>("GET", `/mandates/${encodeURIComponent(MANDATE_ID)}`);
if (!manRes.ok) {
  console.error("mandate lookup failed", manRes.error, manRes.detail);
  Deno.exit(1);
}
const mandateStatus = String(manRes.data.mandates?.status || "");
console.log("GC mandate", MANDATE_ID, "status=", mandateStatus);
if (!/^(active|pending_submission|submitted)$/i.test(mandateStatus)) {
  console.error("Mandate not usable:", mandateStatus);
  Deno.exit(1);
}

const { data: keeper, error: kErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, payment_status, share_status, payment_method_hint, gocardless_payment_id, notes, vat_mode, line_description, reference_text",
  )
  .eq("invoice_number", KEEPER_INV)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (kErr) throw kErr;
if (!keeper) throw new Error(`Missing ${KEEPER_INV}`);
if (String(keeper.payment_status).toLowerCase() === "paid") {
  throw new Error(`${KEEPER_INV} already paid`);
}
if (keeper.gocardless_payment_id) {
  console.log("Already has GC payment", keeper.gocardless_payment_id, "— abort.");
  Deno.exit(0);
}

const { data: sub, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (subErr) throw subErr;

console.log("Plan:");
console.log(`  Keeper ${KEEPER_INV} £700 flexi → gocardless`);
console.log(`  GC half1 £350 charge ${gocardlessChargeDate(HALF1.due_date)}`);
console.log(`  Hidden tracker half2 £350 due ${HALF2.due_date}`);
console.log(`  Reenrol payload payment_method → gocardless`);

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

await upsertMandateRow(admin, {
  contact_id: CONTACT_ID,
  parent_person_id: PARENT_PERSON_ID,
  gocardless_customer_id: CUSTOMER_ID,
  gocardless_mandate_id: MANDATE_ID,
  mandate_status: mandateStatus.toLowerCase() === "active" ? "active" : mandateStatus,
  billing_request_id: null,
  billing_request_flow_id: null,
  authorisation_url: null,
  last_error: null,
});
console.log("Mandate linked to contact", CONTACT_ID);

const keeperId = String(keeper.id);
const schedule = [HALF1, HALF2];
const noteBase =
  `Office 15 Aug 2026 · Maiyar bank → GoCardless (existing mandate ${MANDATE_ID}) · Autumn flexi 2×£350`;

const { error: upKeep } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_method_hint: "gocardless",
    gocardless_mandate_id: MANDATE_ID,
    payment_schedule: schedule,
    due_date: HALF1.due_date,
    next_instalment_due: HALF1.due_date,
    notes: appendMarker(noteBase, keeperId),
    updated_at: new Date().toISOString(),
  })
  .eq("id", keeperId);
if (upKeep) throw upKeep;

const trackerInv = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: HALF2.amount_gbp,
  dueDateIso: HALF2.due_date,
  vatMode: (keeper.vat_mode as "included" | "exempt" | "zero" | null) || "included",
  lineDescription: `Autumn 26/27 · ${HALF2.label} · GC tracker`,
  reference: `Autumn · ${HALF2.label}`,
  notes: appendMarker(`${noteBase} · tracker`, keeperId),
  title: `Tracker — Maiyar Alolabi · ${HALF2.label}`,
  shareStatus: "hidden",
  paymentMethodHint: "gocardless",
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  paymentSchedule: [
    {
      seq: 1,
      label: HALF2.label,
      due_date: HALF2.due_date,
      amount_gbp: HALF2.amount_gbp,
      status: "pending",
    },
  ],
  billingTerm: "autumn",
  lineItems: [],
});
if (!trackerInv.ok) throw new Error(`tracker: ${trackerInv.error}`);
const trackerId = String(trackerInv.invoice?.id || "");
const trackerNo = String(trackerInv.invoiceNumber || "");
console.log("TRACKER", trackerNo, `£${HALF2.amount_gbp}`);

const charges = [
  {
    id: keeperId,
    invoice_number: KEEPER_INV,
    amount_gbp: HALF1.amount_gbp,
    due_date: HALF1.due_date,
    role: "keeper",
  },
  {
    id: trackerId,
    invoice_number: trackerNo,
    amount_gbp: HALF2.amount_gbp,
    due_date: HALF2.due_date,
    role: "tracker",
  },
];

for (const c of charges) {
  const created = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence: Math.round(c.amount_gbp * 100),
    description: `clubSENsational ${c.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(c.due_date),
    invoiceShareId: c.id,
    contactId: CONTACT_ID,
    invoiceNumber: c.invoice_number,
    idempotencyKey: `maiyar-gc-${c.id}`,
  });
  if (!created.ok) {
    console.error("GC FAIL", c.invoice_number, created.error, created.detail);
    Deno.exit(1);
  }
  const { error: pmErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: created.data.id,
      gocardless_mandate_id: MANDATE_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  if (pmErr) throw pmErr;
  console.log(
    "GC",
    c.role,
    c.invoice_number,
    created.data.id,
    "charge",
    created.data.charge_date,
    `£${c.amount_gbp}`,
  );
}

if (sub?.id && sub.payload && typeof sub.payload === "object") {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const funding = (payload.funding && typeof payload.funding === "object"
    ? payload.funding
    : {}) as Record<string, unknown>;
  const choices = (funding.choices_2627 && typeof funding.choices_2627 === "object"
    ? funding.choices_2627
    : {}) as Record<string, unknown>;
  choices.payment_method_code = "gocardless";
  choices.payment_method_label = "Direct Payment (GoCardless)";
  funding.choices_2627 = choices;
  payload.funding = funding;
  const note = String(payload.office_note || "");
  payload.office_note =
    `${note} · 2026-08-15: switched bank_transfer → GoCardless (existing mandate ${MANDATE_ID}); GC scheduled 2×£350.`.trim();
  const { error: pErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", sub.id);
  if (pErr) throw pErr;
  console.log("Reenrol payload updated");
}

console.log(JSON.stringify({ ok: true, keeper: KEEPER_INV, tracker: trackerNo }, null, 2));
