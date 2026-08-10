/**
 * Office: Rayan Thapa (261) — change re-enrol funding Private/bank → Direct Payments (EXEMPT).
 * Keeps term_3 bank schedule + INV-P-0117 amount; regenerates PDF as exempt.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-rayan-thapa-direct-payments.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-rayan-thapa-direct-payments.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "261";
const SUBMISSION_ID = "f3ab4ef3-66a5-48c2-b438-809472bb25fb";
const INVOICE_ID = "d88684c4-d40a-4cce-b83c-b7ce6461b945";

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

const { data: sub, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, participant_name, payload")
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

const before = {
  billing_mode: choices.billing_mode,
  funding_code: choices.funding_code,
  payment_method_code: choices.payment_method_code,
  payment_schedule_code: choices.payment_schedule_code,
  invoice_type_code: choices.invoice_type_code,
};

Object.assign(choices, {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  // Keep parent's bank / term schedule; only funding route changes.
  payment_method_code: choices.payment_method_code || "bank_transfer",
  payment_method_label:
    choices.payment_method_label ||
    "Bank Transfer / Card / Apple Pay (fixed due dates)",
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
  "Office 10 Aug 2026 — Rakesh: change Private bank transfer → Direct Payments (EXEMPT). INV-P-0117 regenerated.";

console.log("Rayan Thapa (261) / Rakesh");
console.log("before", before);
console.log("after", {
  billing_mode: choices.billing_mode,
  funding_code: choices.funding_code,
  payment_method_code: choices.payment_method_code,
  payment_schedule_code: choices.payment_schedule_code,
  invoice_type_code: choices.invoice_type_code,
});

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write.");
  Deno.exit(0);
}

const { error: upSubErr } = await admin
  .from("portal_re_enrolment_submissions")
  .update({ payload })
  .eq("id", SUBMISSION_ID);
if (upSubErr) throw new Error(upSubErr.message);

const { error: upContactErr } = await admin
  .from("portal_parent_contacts")
  .update({
    funding_label: "Direct Payments (LA)",
    payment_method_label: "Parent invoice (EXEMPT)",
  })
  .eq("contact_id", CONTACT_ID);
if (upContactErr) throw new Error(upContactErr.message);

const { error: upInvErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    vat_mode: "exempt",
    updated_at: new Date().toISOString(),
  })
  .eq("id", INVOICE_ID);
if (upInvErr) throw new Error(upInvErr.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, INVOICE_ID);
if (!regen.ok) {
  console.warn("PDF regen failed:", regen.error);
} else {
  console.log("PDF regenerated:", regen.pdfStoragePath);
}

// Align payment sheet so admin list treats them as DP (not Private PARENTS).
const { data: cpRows } = await admin
  .from("client_payments")
  .select("id, client_key, sheet")
  .eq("client_key", "rayant")
  .eq("sheet", "PARENTS");
if (cpRows?.length) {
  const { error: cpErr } = await admin
    .from("client_payments")
    .update({ sheet: "DIRECT_PAYMENTS" })
    .eq("client_key", "rayant")
    .eq("sheet", "PARENTS");
  if (cpErr) console.warn("client_payments sheet update:", cpErr.message);
  else console.log("client_payments rayant: PARENTS → DIRECT_PAYMENTS");
}

console.log("Done — Rayan Thapa now Direct Payments (EXEMPT).");
