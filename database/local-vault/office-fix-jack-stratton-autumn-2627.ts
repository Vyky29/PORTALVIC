/**
 * Jack Stratton Autumn 26/27: Multi £1560 paid (INV-P-0115) but ACAT Mon aquatic
 * £700 still due — must not show as fully paid like Jack Walker (£2260).
 *
 * Also restores Summer 25/26 ACAT £650 Paid (both Jack S and Jack W paid summer).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-fix-jack-stratton-autumn-2627.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import type { ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "170";
const JACK_S_SUMMER_ACAT_ID = "5f72aace-981f-4cc5-9cf3-090c814e83e1";
const INV_MULTI = "INV-P-0115";
const AUTUMN_DUE = "2026-08-29";
const AQUATIC_MARKER = "office_jack_stratton_autumn_acat_2627";

const AQUATIC_SLOT: ParsedSlot = {
  id: "pub-0",
  raw: "60' AQUATIC ACTIVITY (Monday)",
  serviceType: "AQUATIC ACTIVITY",
  durationMin: 60,
  day: "Monday",
  isWeekend: false,
  isDayCentre: false,
  pricePerSession: 50,
  sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
  termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
  timeSlot: "11 to 12",
  venue: "SwimFarm",
};

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
loadEnv("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- 1) Restore Summer 25/26 ACAT Paid (revert mistaken earlier fix) ---
const { data: summerRow } = await admin
  .from("client_payments")
  .select("id, data, payment_status")
  .eq("id", JACK_S_SUMMER_ACAT_ID)
  .maybeSingle();
if (summerRow?.id) {
  const data = { ...((summerRow.data as Record<string, unknown>) || {}) };
  data["Year received (25/26)"] = "£650";
  data["Year outstanding"] = "£0";
  data["Next"] = "Yr 25/26 ACAT Monday Aquatic: £650 billed · £650 paid · £0 due";
  data["Summer basis"] = "ACAT Mon 11–12 Aquatic · 13 × £50 = £650 · Paid";
  delete data["Office note"];
  console.log("Summer ACAT (planned): Paid £650");
  if (APPLY) {
    await admin.from("client_payments").update({
      payment_status: "Paid",
      amount: 650,
      data,
    }).eq("id", JACK_S_SUMMER_ACAT_ID);
    console.log("OK summer ACAT restored Paid");
  }
}

// --- 2) INV-P-0115 notes: Multi only (already paid) ---
const { data: multiInv } = await admin
  .from("portal_parent_invoice_share")
  .select("id, notes, payment_status, amount_gbp, amount_paid_gbp")
  .eq("invoice_number", INV_MULTI)
  .maybeSingle();
if (multiInv?.id) {
  const note =
    "Office 2026-08-26: Multi-Activity Autumn £1560 paid only. ACAT Mon aquatic £700 on separate INV-P (outstanding). Not the same as Jack Walker full £2260.";
  const notes = `${String(multiInv.notes || "").trim()}\n${note}`.slice(0, 800);
  console.log("INV-P-0115:", multiInv.payment_status, "£" + multiInv.amount_gbp, "paid £" + multiInv.amount_paid_gbp);
  if (APPLY) {
    await admin.from("portal_parent_invoice_share").update({ notes, updated_at: new Date().toISOString() })
      .eq("id", multiInv.id);
  }
}

// --- 3) Unpaid ACAT aquatic Autumn invoice £700 ---
const { data: existingAq } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, amount_gbp, ready_by")
  .eq("contact_id", CONTACT_ID)
  .eq("ready_by", AQUATIC_MARKER)
  .neq("payment_status", "void")
  .maybeSingle();

const productMap = await loadProductMap(admin);
const weeklyChoices = { "pub-0": { choice: "keep" } };
const lineItems = buildReenrolTermLineItems({
  slots: [AQUATIC_SLOT],
  weeklyChoices,
  term: "autumn",
  vatMode: "exempt",
  productMap,
});
const aquaticTotal = round2(lineItems.reduce((s, li) => s + Number(li.amount_gbp || 0), 0));
const description = lineItemsToDescription(lineItems, { fundedProvision: true });
console.log("\nAquatic Autumn lines:", aquaticTotal, description.slice(0, 120));

if (existingAq?.id) {
  console.log("Aquatic invoice already exists:", existingAq.invoice_number, existingAq.payment_status);
} else if (!APPLY) {
  console.log("\nDry run. Would create unpaid ACAT aquatic Autumn INV-P £" + aquaticTotal);
} else {
  const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
  if (!ownerId) throw new Error("no invoice owner");
  const created = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: aquaticTotal,
    dueDateIso: AUTUMN_DUE,
    invoiceDateIso: new Date().toISOString().slice(0, 10),
    vatMode: "exempt",
    lineDescription: description,
    reference: "Autumn term 26/27 · ACAT Monday aquatic",
    notes:
      "Office: Jack Stratton ACAT Mon aquatic only — £700 outstanding. Multi £1560 paid on INV-P-0115. Jack Walker paid full £2260 on INV-P-0342.",
    title: "Invoice — Jack Stratton · ACAT Autumn aquatic 26/27",
    shareStatus: "ready",
    paymentMethodHint: "bank_transfer",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: AQUATIC_MARKER,
    billingTerm: "autumn",
    paymentSchedule: [{
      seq: 1,
      label: "ACAT Monday aquatic · Autumn 26/27",
      due_date: AUTUMN_DUE,
      amount_gbp: aquaticTotal,
      status: "pending",
      paid_at: null,
      paid_via: null,
    }],
    lineItems,
  });
  if (!created.ok) throw new Error(String(created.error));
  const shareId = String((created.invoice as Record<string, unknown>).id || "");
  console.log("CREATED", created.invoiceNumber, "£" + aquaticTotal, "unpaid");
  if (shareId) {
    await regeneratePortalInvoiceSharePdf(admin, shareId);
  }
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
} else {
  console.log("\nDone. Jack Stratton: Multi paid · ACAT aquatic Autumn outstanding. Summer ACAT restored Paid.");
}
