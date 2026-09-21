/**
 * ACAT group placeholder — Autumn 26/27 Tuesday Day Centre 11-12 (Roberto).
 *
 * One group INV-P until office confirms Jack S / Jack W / Kate / Kamy again.
 * Rate: £200 / session (£50 × 4). Session count matches weekday afterschool Autumn = 14
 * (Tue from 8 Sep 2026, skip Oct half-term week).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-acat-tue-dc-group-invoice-autumn-2627.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-acat-tue-dc-group-invoice-autumn-2627.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  collectTermSessionDates,
  formatGroupedSessionDates,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "gap-acat-group";
const READY_BY = "office_acat_tue_dc_group_autumn_2627";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const SESSIONS = 14;
const RATE = 200;
const TOTAL = SESSIONS * RATE;
const DUE = "2026-09-08";
const PAYMENTS_ROW_INDEX = 2110;

function loadEnv(p: string) {
  try {
    for (const line of Deno.readTextFileSync(p).split(/\r?\n/)) {
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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const tueDates = collectTermSessionDates("autumn", "Tuesday", SESSIONS);
const dateLabel = formatGroupedSessionDates(tueDates) || `${SESSIONS} Tuesdays`;
console.log("Tuesday dates", tueDates.length, dateLabel);
if (tueDates.length !== SESSIONS) {
  throw new Error(`expected ${SESSIONS} Tue sessions, got ${tueDates.length}`);
}

const productMap = await loadProductMap(admin);
const dayCentreKey = "DAY_CENTRE_60";
const mapRow = productMap.get(dayCentreKey) || productMap.get("DAYCENTRE_60");
const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: dayCentreKey,
    description: "Day Centre, Tuesdays 11:00-12:00",
    detail: "SwimFarm · Hub · Roberto · ACAT group (£50 × 4 participants)",
    dates: dateLabel,
    quantity: SESSIONS,
    unit_price_gbp: RATE,
    amount_gbp: round2(TOTAL),
    xero_item_code:
      mapRow?.xero_item_code_exempt ||
      mapRow?.xero_item_code_vat ||
      null,
  },
];
const description = lineItemsToDescription(lineItems, { fundedProvision: true });
console.log("Line total £" + TOTAL);
console.log(description.slice(0, 280));

const { data: existingPart } = await admin
  .from("portal_participants")
  .select("contact_id, display_name")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

if (!existingPart?.contact_id) {
  console.log("Will create portal_participants", CONTACT_ID);
  if (APPLY) {
    const { data: jack } = await admin
      .from("portal_participants")
      .select("parent_person_id")
      .eq("contact_id", "170")
      .maybeSingle();
    /* NOT NULL parent FK — invoice title/reference are ACAT group (placeholder until named kids). */
    const parentPersonId = String(jack?.parent_person_id || "").trim();
    if (!parentPersonId) throw new Error("missing parent_person_id fallback from contact 170");
    const { error } = await admin.from("portal_participants").upsert(
      {
        contact_id: CONTACT_ID,
        display_name: "ACAT",
        first_name: "ACAT",
        last_name: "Group",
        parent_person_id: parentPersonId,
        in_class: true,
        on_waiting_list: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" },
    );
    if (error) throw new Error(`participant upsert: ${error.message}`);
    console.log("OK participant", CONTACT_ID, "parent", parentPersonId);
  }
} else {
  console.log("Participant exists:", existingPart.display_name);
}

const { data: existingInv } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, amount_gbp, ready_by")
  .eq("contact_id", CONTACT_ID)
  .eq("ready_by", READY_BY)
  .neq("payment_status", "void")
  .maybeSingle();

if (existingInv?.id) {
  console.log(
    "Invoice already exists:",
    existingInv.invoice_number,
    existingInv.payment_status,
    "£" + existingInv.amount_gbp,
  );
} else if (!APPLY) {
  console.log(`\nDry run. Would create unpaid INV-P £${TOTAL} (${SESSIONS} × £${RATE}).`);
} else {
  const ownerId = (await resolvePortalInvoiceOwnerUserId(admin)) || OFFICE_USER;
  if (!ownerId) throw new Error("no invoice owner");
  const created = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: TOTAL,
    dueDateIso: DUE,
    invoiceDateIso: new Date().toISOString().slice(0, 10),
    vatMode: "exempt",
    lineDescription: description,
    lineItems,
    reference: "Autumn term 26/27 · ACAT Tuesday Day Centre group",
    service: "Day Centre",
    bookingService: "Day Centre",
    bookingSlot: "Tuesday 11 to 12",
    bookingVenue: "SwimFarm",
    notes:
      "Office 2026-09-03: temporary ACAT GROUP book Tue Day Centre 11-12 Roberto until individual Jack S / Jack W / Kate / Kamy invoices confirmed. £200/session (£50×4). 14 sessions = weekday afterschool Autumn count (skip half-term). LOCAL board already has ACAT on Roberto.",
    title: "Invoice — ACAT group · Tuesday Day Centre Autumn 26/27",
    shareStatus: "ready",
    paymentMethodHint: "bank_transfer",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    billingTerm: "autumn",
    paymentSchedule: [
      {
        seq: 1,
        label: "ACAT Tue Day Centre group · Autumn 26/27",
        due_date: DUE,
        amount_gbp: TOTAL,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
  });
  if (!created.ok) throw new Error(String(created.error));
  const shareId = String((created.invoice as Record<string, unknown>).id || "");
  console.log("CREATED", created.invoiceNumber, "£" + TOTAL, shareId);
  if (shareId) {
    await regeneratePortalInvoiceSharePdf(admin, shareId);
    console.log("PDF regenerated");
    try {
      await xeroHydrateRefreshFromDb(admin);
      const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
      await xeroPersistRefreshToDb(admin);
      console.log("Xero", created.invoiceNumber, pushed.ok ? "ok" : pushed.error);
    } catch (e) {
      console.log("Xero push skipped/failed:", String(e).slice(0, 200));
    }
  }
}

const paymentData = {
  Term: "AUTUMN TERM 26/27",
  Stream: "Day Centre",
  Cohort: "ACAT",
  Services: "60' Day Centre, Tuesday - 11 to 12",
  Paid: "Using Funds from LA",
  "Invoice type": "Parent (Exempt invoice)",
  Cost: "£200 / session (£50 × 4 participants)",
  Sessions: `Tue 11-12 · ${SESSIONS} Autumn (same as weekday afterschool; skip half-term)`,
  "Autumn basis":
    `ACAT Tue Day Centre Hub · Roberto · ${SESSIONS} × £${RATE} = £${TOTAL} · Outstanding · group placeholder until named kids confirmed`,
  "Year billed (26/27)": `£${TOTAL}`,
  "Year received (26/27)": "£0",
  "Year outstanding": `£${TOTAL}`,
  Next: `Autumn 26/27 ACAT Tuesday Day Centre group: £${TOTAL} billed · not yet paid`,
  Instructor: "ROBERTO",
  Venue: "SwimFarm",
  Area: "Hub Room",
  "Office note":
    "Temporary group book for Roberto Tue 11-12. Split to Jack S / Jack W / Kate / Kamy individual INV-Ps when confirmed.",
};

const { data: existingPay } = await admin
  .from("client_payments")
  .select("id, client_key, amount, payment_status")
  .eq("client_key", "acat")
  .filter("data->>Cohort", "eq", "ACAT")
  .filter("data->>Stream", "eq", "Day Centre")
  .ilike("data->>Services", "%Tuesday%")
  .ilike("data->>Term", "%AUTUMN%26%")
  .maybeSingle();

if (existingPay?.id) {
  console.log(
    "client_payments already:",
    existingPay.id,
    existingPay.payment_status,
    "£" + existingPay.amount,
  );
} else if (!APPLY) {
  console.log("Dry run. Would insert client_payments ACAT Tue DC £" + TOTAL);
} else {
  const { data: inserted, error } = await admin
    .from("client_payments")
    .insert({
      sheet: "DIRECT_PAYMENTS",
      row_index: PAYMENTS_ROW_INDEX,
      client_key: "acat",
      client_name: "ACAT",
      parent_name: "ACAT / Direct Payments",
      payment_status: "Outstanding",
      amount: TOTAL,
      data: paymentData,
      source_file: READY_BY,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`client_payments: ${error.message}`);
  console.log("OK client_payments", inserted?.id);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
} else {
  console.log("\nDone — ACAT Tue group invoice + payments row ready for Roberto book.");
}
