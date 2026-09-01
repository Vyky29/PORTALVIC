/**
 * Patrick — merge unpaid crash INV-P-CRASH into Autumn INV-P-0346 so Orla
 * sees one invoice (two line items) and one Stripe payment link.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-patrick-merge-crash-into-autumn.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-patrick-merge-crash-into-autumn.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  stripeConfigured,
  stripeCreateCheckoutSession,
  stripeGrossUpFromGbp,
} from "../../supabase/functions/_shared/stripe_checkout.ts";
import {
  amountDueNow,
  type InvoicePaymentScheduleRow,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "7559001";
const KEEPER = "INV-P-0346";
const CRASH = "INV-P-CRASH-MRM9QE9H";
const PORTAL_ORIGIN = "https://www.clubsensational.org";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

if (!stripeConfigured()) {
  console.error("Need sk_live_ Stripe key");
  Deno.exit(1);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log(APPLY ? "APPLY" : "DRY RUN");

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, amount_paid_gbp, payment_status, share_status, payment_schedule, line_items, line_description, notes, stripe_checkout_session_id, payment_link_url, payment_method_hint, document_id, due_date, next_instalment_due, billing_term",
  )
  .eq("contact_id", CONTACT_ID)
  .in("invoice_number", [KEEPER, CRASH]);
if (error) throw new Error(error.message);

const keeper = (rows || []).find((r) => r.invoice_number === KEEPER);
const crash = (rows || []).find((r) => r.invoice_number === CRASH);
if (!keeper) throw new Error(`missing ${KEEPER}`);
if (!crash) throw new Error(`missing ${CRASH}`);
if (Number(keeper.amount_paid_gbp) > 0 || Number(crash.amount_paid_gbp) > 0) {
  throw new Error("refusing merge — something already paid");
}
if (String(crash.payment_status).toLowerCase() === "void") {
  console.log("Crash already void — will still refresh keeper if needed");
}

const autumnItems = (Array.isArray(keeper.line_items) ? keeper.line_items : []).map((x) =>
  structuredClone(x),
) as PortalInvoiceLineItem[];
const crashItems = (Array.isArray(crash.line_items) ? crash.line_items : []).map((x) =>
  structuredClone(x),
) as PortalInvoiceLineItem[];

const alreadyHasCrash = autumnItems.some((l) =>
  /crash/i.test(`${l.service_key || ""} ${l.description || ""} ${l.detail || ""}`),
);
const mergedItems = alreadyHasCrash ? autumnItems : [...autumnItems, ...crashItems];

const autumnTotal = round2(
  autumnItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0) || Number(keeper.amount_gbp) || 0,
);
const crashTotal = round2(
  crashItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0) || Number(crash.amount_gbp) || 0,
);
const newTotal = round2(
  mergedItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0) || autumnTotal + crashTotal,
);
const firstHalf = round2(autumnTotal / 2);
const secondHalf = round2(autumnTotal - firstHalf);
const dueNowAmount = round2(firstHalf + crashTotal);

const schedule: InvoicePaymentScheduleRow[] = [
  {
    seq: 1,
    label: "Autumn 1st half + summer crash course",
    due_date: "2026-08-15",
    amount_gbp: dueNowAmount,
    status: "pending",
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: "2026-10-26",
    amount_gbp: secondHalf,
    status: "pending",
  },
];

const lineDescription = lineItemsToDescription(mergedItems, { fundedProvision: false });
const gross = stripeGrossUpFromGbp(dueNowAmount);

console.log("\nKEEPER before", {
  amount: keeper.amount_gbp,
  items: autumnItems.map((i) => `${i.description} £${i.amount_gbp}`),
  schedule: keeper.payment_schedule,
});
console.log("CRASH", {
  amount: crash.amount_gbp,
  status: crash.payment_status,
  items: crashItems.map((i) => `${i.description} £${i.amount_gbp}`),
});
console.log("\nMERGED", {
  amount: newTotal,
  items: mergedItems.map((i) => `${i.description} | ${i.detail} | £${i.amount_gbp}`),
  schedule,
  due_now: dueNowAmount,
  charge_gbp: gross.charge_gbp,
  fee_gbp: gross.fee_gbp,
});

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to merge, void crash INV, regen PDF, mint Stripe link.");
  Deno.exit(0);
}

{
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: newTotal,
      line_items: mergedItems,
      line_description: lineDescription,
      payment_schedule: schedule,
      due_date: "2026-08-15",
      next_instalment_due: "2026-08-15",
      payment_method_hint: "payment_link",
      payment_status: "unpaid",
      updated_at: new Date().toISOString(),
      notes: [
        String(keeper.notes || "").trim(),
        `Office 14 Aug 2026: merged ${CRASH} (£${crashTotal}) into this invoice so Orla has one bill / one pay link. Line items keep Autumn climb + crash separate.`,
      ]
        .filter(Boolean)
        .join(" · "),
    })
    .eq("id", keeper.id);
  if (upErr) throw new Error(`keeper update: ${upErr.message}`);
  console.log("KEEPER updated", KEEPER, `£${newTotal}`);
}

if (String(crash.payment_status).toLowerCase() !== "void") {
  const { error: voidErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      share_status: "hidden",
      payment_link_url: null,
      updated_at: new Date().toISOString(),
      notes: [
        String(crash.notes || "").trim(),
        `Office 14 Aug 2026: voided — merged into ${KEEPER} (same contact).`,
      ]
        .filter(Boolean)
        .join(" · "),
    })
    .eq("id", crash.id);
  if (voidErr) throw new Error(`void crash: ${voidErr.message}`);
  console.log("VOIDED", CRASH);
}

{
  const { data: bookings, error: bErr } = await admin
    .from("portal_crash_summer_bookings")
    .select("id, invoice_share_id, status, notes")
    .eq("contact_id", CONTACT_ID);
  if (bErr) console.warn("crash bookings lookup", bErr.message);
  for (const b of bookings || []) {
    if (String(b.invoice_share_id) === String(keeper.id)) continue;
    const { error: linkErr } = await admin
      .from("portal_crash_summer_bookings")
      .update({
        invoice_share_id: keeper.id,
        updated_at: new Date().toISOString(),
        notes: [
          String(b.notes || "").trim(),
          `Invoice merged into ${KEEPER}`,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 2000),
      })
      .eq("id", b.id);
    if (linkErr) console.warn("link booking", b.id, linkErr.message);
    else console.log("crash booking →", keeper.id, b.id);
  }
}

{
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(keeper.id));
  console.log("PDF", regen);
}

const successUrl =
  `${PORTAL_ORIGIN}/parent?invoice_paid=1&view=invoices` +
  `&contact=${encodeURIComponent(CONTACT_ID)}` +
  `&invoice=${encodeURIComponent(String(keeper.id))}`;
const cancelUrl =
  `${PORTAL_ORIGIN}/parent?invoice_cancel=1&view=invoices` +
  `&contact=${encodeURIComponent(CONTACT_ID)}` +
  `&invoice=${encodeURIComponent(String(keeper.id))}`;

const productName =
  `Invoice ${KEEPER} — Patrick Autumn climb + summer crash` +
  (gross.fee_pence > 0 ? ` (incl. £${gross.fee_gbp.toFixed(2)} card fee)` : "");

const created = await stripeCreateCheckoutSession({
  amountPence: gross.charge_pence,
  currency: "gbp",
  productName,
  successUrl,
  cancelUrl,
  clientReferenceId: String(keeper.id),
  metadata: {
    invoice_share_id: String(keeper.id),
    contact_id: CONTACT_ID,
    invoice_number: KEEPER,
    office_minted: "patrick_merge_crash_autumn_2026_08_14",
    net_gbp: String(dueNowAmount),
    fee_gbp: String(gross.fee_gbp),
    includes_crash: CRASH,
  },
});
if (!created.ok) throw new Error(`stripe: ${created.error} ${created.detail || ""}`);

{
  const { error: linkErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      stripe_checkout_session_id: created.id,
      payment_link_url: created.url,
      payment_method_hint: "payment_link",
      updated_at: new Date().toISOString(),
    })
    .eq("id", keeper.id);
  if (linkErr) throw new Error(`store link: ${linkErr.message}`);
}

const verify = await admin
  .from("portal_parent_invoice_share")
  .select("amount_gbp, payment_schedule, line_items")
  .eq("id", keeper.id)
  .maybeSingle();
const dueCheck = amountDueNow(verify.data || keeper);

const msg =
  `Hi Orla,\n\n` +
  `Sorry for the hassle with the portal — we've put everything on one invoice for Patrick:\n\n` +
  `1) Autumn Climbing · Sunday 3.00–4.00 · Westway · Carlos — £${autumnTotal.toFixed(2)}\n` +
  `2) Summer crash climb · Week 1 (20–23 Jul) · 11:00–12:00 · Westway — £${crashTotal.toFixed(2)}\n\n` +
  `Invoice ${KEEPER} · total £${newTotal.toFixed(2)}\n` +
  `Pay now (1st half + crash): £${dueNowAmount.toFixed(2)}` +
  (gross.fee_gbp > 0
    ? ` (+ £${gross.fee_gbp.toFixed(2)} card fee) = £${gross.charge_gbp.toFixed(2)}`
    : "") +
  `\nSecond Autumn half (£${secondHalf.toFixed(2)}) stays due 26 Oct.\n\n` +
  `Pay here (Card / Apple Pay):\n${created.url}\n\n` +
  `If you'd rather pay by bank transfer, reply and we'll send the details.\n\n` +
  `Thanks,\nclubSENsational`;

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/patrick-merge-crash-autumn.json",
  JSON.stringify(
    {
      keeper: KEEPER,
      voided: CRASH,
      amount_gbp: newTotal,
      due_now_gbp: dueNowAmount,
      due_check: dueCheck,
      charge_gbp: gross.charge_gbp,
      payment_url: created.url,
      message_for_orla: msg,
    },
    null,
    2,
  ),
);

console.log("\n=== PAYMENT LINK ===\n" + created.url);
console.log("\n=== MESSAGE FOR ORLA ===\n" + msg);
console.log("\nReport → database/local-vault/tmp/patrick-merge-crash-autumn.json");
