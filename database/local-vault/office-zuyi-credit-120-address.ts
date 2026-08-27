/**
 * Zu Yi Wen / Stephanie INV-P-0098:
 *  - keep Aquatic Wed 4.30–5.30 · 14×£100 = £1400
 *  - apply £120 voucher → due £1280 (flexi 2×£640)
 *  - confirm new address on portal_parent_contacts
 *  - regenerate PDF
 *
 * APPLY=1 to write.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { nextInstalmentDueDate } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INV = "INV-P-0098";
const PARENT_UUID = "1fbcf349-7f37-4d70-8ab6-0e35eabcae79";
const HF_CONTACT = "186";
const GROSS = 1400;
const CREDIT = 120;
const DUE = GROSS - CREDIT; // 1280
const HALF = DUE / 2; // 640

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

const addr = {
  address_line1: "Apartment 12 Kirkham House",
  address_line2: "4 Michael Road, Fulham",
  city: "London",
  postcode: "SW6 2XR",
};

const { data: parentBefore } = await admin
  .from("portal_parent_contacts")
  .select("id, contact_id, parent_display, parent_person_id, address_line1, address_line2, city, postcode")
  .eq("id", PARENT_UUID)
  .maybeSingle();
console.log("parent before", parentBefore);

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, line_items, line_description, payment_schedule, notes, payment_status, amount_paid_gbp, vat_mode, payment_method_hint, quantity, unit_price_gbp",
  )
  .eq("invoice_number", INV)
  .maybeSingle();
if (invErr || !inv) throw new Error(invErr?.message || "invoice missing");
console.log("invoice before", {
  amount: inv.amount_gbp,
  schedule: inv.payment_schedule,
  lines: inv.line_items,
  notes: inv.notes,
});

const { data: existingCredits } = await admin
  .from("portal_parent_family_credits")
  .select("id, contact_id, amount_gbp, status, applied_invoice_share_id, notes, close_notes, kind")
  .eq("contact_id", HF_CONTACT);
console.log("credits for contact 186", existingCredits);

const aquatic = (Array.isArray(inv.line_items) ? inv.line_items : []).find(
  (l: PortalInvoiceLineItem) =>
    /aquatic/i.test(String(l.description || "")) || String(l.service_key || "") === "AQUATIC_60",
) as PortalInvoiceLineItem | undefined;

const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_60",
    description: aquatic?.description || "Aquatic Activity 60'",
    detail: aquatic?.detail || "Wednesday 4.30 to 5.30 pm · Acton",
    dates: aquatic?.dates || null,
    quantity: 14,
    unit_price_gbp: 100,
    amount_gbp: GROSS,
    xero_item_code: aquatic?.xero_item_code ?? null,
  },
  {
    service_key: "CREDIT",
    description: "Credits",
    detail: "Voucher / account credit",
    dates: null,
    quantity: 1,
    unit_price_gbp: -CREDIT,
    amount_gbp: -CREDIT,
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

console.log("→ after", {
  amount: DUE,
  schedule,
  lineDescription: lineDescription.slice(0, 350),
  addr,
});

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const { error: addrErr } = await admin
  .from("portal_parent_contacts")
  .update({ ...addr, updated_at: now })
  .eq("id", PARENT_UUID);
if (addrErr) throw addrErr;

// Also update by HF contact_id in case duplicate rows
if (parentBefore?.contact_id || HF_CONTACT) {
  await admin
    .from("portal_parent_contacts")
    .update({ ...addr, updated_at: now })
    .eq("contact_id", String(parentBefore?.contact_id || HF_CONTACT));
}

const note =
  `Office 11 Aug 2026: Aquatic Wed 4.30–5.30 Acton 14×£100=£1400 − £120 voucher → £1280 flexi (2×£640). Address: Apartment 12 Kirkham House, 4 Michael Road, Fulham, London SW6 2XR.`;

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: DUE,
    quantity: 14,
    unit_price_gbp: 100,
    line_items: lineItems,
    line_description: lineDescription,
    payment_schedule: schedule,
    next_instalment_due: nextInstalmentDueDate(schedule),
    due_date: "2026-08-15",
    billing_term: "autumn",
    payment_method_hint: inv.payment_method_hint || "bank_transfer",
    vat_mode: inv.vat_mode || "exempt",
    notes: note,
    amount_paid_gbp: 0,
    payment_status: "unpaid",
    updated_at: now,
  })
  .eq("id", inv.id);
if (upErr) throw upErr;

const openCredit = (existingCredits || []).find(
  (c) =>
    Number(c.amount_gbp) === CREDIT &&
    (c.status === "open" || c.status === "applied"),
);

if (openCredit) {
  const { error: cErr } = await admin
    .from("portal_parent_family_credits")
    .update({
      status: "applied",
      applied_invoice_share_id: inv.id,
      amount_gbp: CREDIT,
      closed_at: now,
      close_notes: `Applied to ${INV}: £${CREDIT} of £${GROSS}; £${DUE} still due`,
      updated_at: now,
    })
    .eq("id", openCredit.id);
  if (cErr) throw cErr;
  console.log("credit updated", openCredit.id);
} else {
  const parentPersonId =
    String(parentBefore?.parent_person_id || "").trim() ||
    String(parentBefore?.contact_id || HF_CONTACT);
  const { data: inserted, error: insErr } = await admin
    .from("portal_parent_family_credits")
    .insert({
      parent_person_id: parentPersonId,
      contact_id: String(parentBefore?.contact_id || HF_CONTACT),
      participant_display: "Stephanie",
      kind: "credit",
      status: "applied",
      amount_gbp: CREDIT,
      currency: "GBP",
      service_label: "Autumn voucher / credit",
      notes: "Office voucher £120 applied to INV-P-0098 (Aquatic Autumn 2026/27)",
      source: "admin",
      applied_invoice_share_id: inv.id,
      closed_at: now,
      close_notes: `Applied to ${INV}: £${CREDIT} of £${GROSS}; £${DUE} still due`,
    })
    .select("id")
    .maybeSingle();
  if (insErr) throw insErr;
  console.log("credit inserted", inserted?.id);
}

// Reenrol autumn total if present
const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("contact_id", String(parentBefore?.contact_id || HF_CONTACT))
  .limit(5);
for (const row of sub || []) {
  const payload = { ...(row.payload || {}) } as Record<string, unknown>;
  const totals = { ...((payload.term_totals as Record<string, unknown>) || {}) };
  totals.autumn = DUE;
  payload.term_totals = totals;
  await admin.from("portal_re_enrolment_submissions").update({ payload }).eq("id", row.id);
  console.log("reenrol autumn →", DUE, row.id);
}

const regen = await regeneratePortalInvoiceSharePdf(admin, inv.id);
console.log("PDF", regen);

const { data: finalInv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, payment_schedule, line_items, notes")
  .eq("id", inv.id)
  .single();
const { data: finalAddr } = await admin
  .from("portal_parent_contacts")
  .select("parent_display, address_line1, address_line2, city, postcode")
  .eq("id", PARENT_UUID)
  .single();
console.log("FINAL", {
  amount: finalInv?.amount_gbp,
  schedule: finalInv?.payment_schedule,
  lines: finalInv?.line_items,
  addr: finalAddr,
});
console.log("DONE");
