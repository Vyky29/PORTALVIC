/**
 * Haneef Yusuf (126) — reverse H&F LA move.
 * Mother paid autumn in full; keep INV-P-0103 paid, privately Using Funds from LA (Direct Payments).
 *
 * - Restore DIRECT_PAYMENTS row; archive H&F LA sheet row
 * - Contact + re-enrol choices → Using Funds from LA / bank
 * - INV-P-0103: bank_transfer + ready (family bill-to), clear H&F notes, regen PDF
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-haneef-revert-hf-to-dp.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-haneef-revert-hf-to-dp.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

const CONTACT_ID = "126";
const CLIENT_KEY = "haneef";
const DP_ID = "ba22622f-870c-4164-8f5a-9a552a08b48c";
const LA_ID = "26de2b63-9554-4108-a122-96d0a98067ed";
const INVOICE_ID = "4b0ec1aa-08a8-4560-aea7-31f75425538f";
const SUBMISSION_ID = "dd808e32-a01c-4910-a9a6-34e2f9feb262";
const AUTUMN_AMOUNT = 1560;

function loadEnv() {
  const text = readFileSync("local-secrets/secrets.env", "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!Deno.env.get(m[1])) Deno.env.set(m[1], v);
  }
}

loadEnv();
const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "";
const key =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
  "";
if (!url || !key) throw new Error("missing supabase credentials");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date().toISOString();

const { data: beforeContact } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, funding_label, payment_method_label")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: beforeDp } = await admin
  .from("client_payments")
  .select("*")
  .eq("id", DP_ID)
  .maybeSingle();

const { data: beforeLa } = await admin
  .from("client_payments")
  .select("id, sheet, client_name, parent_name, payment_status, data")
  .eq("id", LA_ID)
  .maybeSingle();

const { data: beforeInv } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, share_status, payment_status, payment_method_hint, vat_mode, amount_gbp, notes",
  )
  .eq("id", INVOICE_ID)
  .maybeSingle();

console.log(APPLY ? "APPLY" : "DRY RUN", "Haneef Yusuf → Using Funds from LA (not H&F)");
console.log("contact", beforeContact);
console.log("dp", {
  id: beforeDp?.id,
  sheet: beforeDp?.sheet,
  status: beforeDp?.payment_status,
  amount: beforeDp?.amount,
});
console.log("la", {
  id: beforeLa?.id,
  sheet: beforeLa?.sheet,
  parent: beforeLa?.parent_name,
  status: beforeLa?.payment_status,
});
console.log("inv", beforeInv);

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write.");
  Deno.exit(0);
}

// 1) Contact labels (same pattern as Aqsa)
const { error: contactErr } = await admin
  .from("portal_parent_contacts")
  .update({
    funding_label: "Using Funds from LA · Direct Payments",
    payment_method_label: "Bank Transfer",
    updated_at: now,
  })
  .eq("contact_id", CONTACT_ID);
if (contactErr) throw new Error(contactErr.message);

// 2) Restore Direct Payments row
const dpDataRaw =
  beforeDp?.data && typeof beforeDp.data === "object"
    ? { ...(beforeDp.data as Record<string, unknown>) }
    : {};
delete dpDataRaw._archived_at;
delete dpDataRaw._archived_reason;
delete dpDataRaw._archived_from_sheet;
Object.assign(dpDataRaw, {
  Funding: "Funded · Direct Payments",
  Payer: "Parent · Direct Payments (LA money)",
  "Funding origin": "Parent Direct Payments",
  Paid: "Using Funds from LA",
  "Invoice type": "Parent (Exempt invoice)",
  VAT: "Exempt",
  "Payment Method": "1 - Bank Transfer",
  Parent: "Aisha",
  "Client Name": "Haneef",
  Total: String(AUTUMN_AMOUNT),
  Sessions: "13",
  "Cost / session": "120",
  Cost: "120",
  Services: "90' Multi-Activity, Sunday - 12.30 to 2",
  _restored_at: now,
  _restored_reason:
    "Office: mother paid autumn in full — remove from H&F LA list; keep privately Using Funds from LA.",
});

const { error: dpErr } = await admin
  .from("client_payments")
  .update({
    sheet: "DIRECT_PAYMENTS",
    client_key: CLIENT_KEY,
    client_name: "Haneef",
    parent_name: "Aisha",
    payment_status: "Paid",
    amount: AUTUMN_AMOUNT,
    data: dpDataRaw,
  })
  .eq("id", DP_ID);
if (dpErr) throw new Error(dpErr.message);

// 3) Archive H&F LA row so he drops off H&F lists
const laDataRaw =
  beforeLa?.data && typeof beforeLa.data === "object"
    ? { ...(beforeLa.data as Record<string, unknown>) }
    : {};
Object.assign(laDataRaw, {
  _archived_at: now,
  _archived_reason:
    "Reverted: Haneef stays privately Using Funds from LA (mother paid autumn). Not H&F BACS.",
  _archived_from_sheet: "LA",
  _archived_from_po: "9005711782",
});

const { error: laErr } = await admin
  .from("client_payments")
  .update({
    sheet: "ARCHIVED_LA",
    payment_status: "Cancelled",
    data: laDataRaw,
  })
  .eq("id", LA_ID);
if (laErr) throw new Error(laErr.message);

// 4) Re-enrol choices → Direct Payments / Using funds from LA
const { data: sub, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("id", SUBMISSION_ID)
  .maybeSingle();
if (subErr || !sub) throw new Error(subErr?.message || "submission not found");

const payload =
  sub.payload && typeof sub.payload === "object"
    ? structuredClone(sub.payload as Record<string, unknown>)
    : {};
const fundingRoot =
  payload.funding && typeof payload.funding === "object"
    ? (payload.funding as Record<string, unknown>)
    : {};
const choices =
  fundingRoot.choices_2627 && typeof fundingRoot.choices_2627 === "object"
    ? { ...(fundingRoot.choices_2627 as Record<string, unknown>) }
    : {};

Object.assign(choices, {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label:
    "Using funds from LA (Direct Payments from your EHCP care package)",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  payment_method_code: "bank_transfer",
  payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
});
fundingRoot.choices_2627 = choices;
if (!fundingRoot.current_2526 || typeof fundingRoot.current_2526 !== "object") {
  fundingRoot.current_2526 = {};
}
(fundingRoot.current_2526 as Record<string, unknown>).funding =
  "Funded · Direct Payments";
(fundingRoot.current_2526 as Record<string, unknown>).invoice_type =
  "Parent (Exempt invoice)";
(fundingRoot.current_2526 as Record<string, unknown>).invoice_type_code = "exempt";
payload.funding = fundingRoot;
payload.office_note =
  "Office 10 Aug 2026 — Haneef: remove H&F LA list; mother paid autumn; privately Using Funds from LA. INV-P-0103 family bill-to.";

const { error: upSubErr } = await admin
  .from("portal_re_enrolment_submissions")
  .update({ payload })
  .eq("id", SUBMISSION_ID);
if (upSubErr) throw new Error(upSubErr.message);

// 5) Invoice: off la_funded / H&F notes → parent DP bank, visible, still paid
const { error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_method_hint: "bank_transfer",
    vat_mode: "exempt",
    share_status: "ready",
    notes:
      "office_haneef_using_funds_from_la\nMother paid autumn in full. Not H&F BACS — privately Using Funds from LA (Direct Payments).",
    updated_at: now,
  })
  .eq("id", INVOICE_ID);
if (invErr) throw new Error(invErr.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, INVOICE_ID);
if (!regen.ok) {
  console.warn("PDF regen failed:", regen.error);
} else {
  console.log("PDF regenerated:", regen.pdfStoragePath);
}

const { data: verifyPays } = await admin
  .from("client_payments")
  .select("id, sheet, client_name, parent_name, payment_status, amount")
  .or(`client_key.eq.${CLIENT_KEY},client_name.ilike.%haneef%`);

const { data: verifyContact } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, funding_label, payment_method_label")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: verifyInv } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, share_status, payment_status, payment_method_hint, vat_mode, amount_gbp, notes",
  )
  .eq("id", INVOICE_ID)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      contact: verifyContact,
      payments: verifyPays,
      invoice: verifyInv,
    },
    null,
    2,
  ),
);
console.log("Done — Haneef off H&F; privately Using Funds from LA; autumn paid.");
