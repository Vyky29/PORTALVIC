/**
 * Maiyar (48): GoCardless must be monthly, not flexi.
 * Cancel flexi 2×£350 PMs; rewrite INV-P-0133 to Autumn monthly 4×£176.50
 * (programme £700 + 4×£1.50 GC fee); hide old flexi tracker; create Oct–Dec trackers.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-maiyar-gc-flexi-to-monthly.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-maiyar-gc-flexi-to-monthly.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  gocardlessChargeDate,
  gocardlessCreatePayment,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { nextInstalmentDueDate } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "48";
const PARENT_PERSON_ID = "5600408";
const MANDATE_ID = "MD01KMJKP22N55";
const KEEPER_NO = "INV-P-0133";
const OLD_TRACKER_NO = "INV-P-0361";
const READY_BY = "office_maiyar_gc_flexi_to_monthly_20260815";
const MARKER_PREFIX = "Consolidated payment tracker:";
const PROG = 700;
const FEE = 1.5;
const MONTHLY = 176.5; // 700/4 + 1.50
const TOTAL = 706; // 4 × 176.50

const MONTHS = [
  { label: "Payment · September 2026", due_date: "2026-09-01", amount_gbp: MONTHLY },
  { label: "Payment · October 2026", due_date: "2026-10-01", amount_gbp: MONTHLY },
  { label: "Payment · November 2026", due_date: "2026-11-01", amount_gbp: MONTHLY },
  { label: "Payment · December 2026", due_date: "2026-12-01", amount_gbp: MONTHLY },
];

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

async function cancelPm(paymentId: string) {
  const res = await gocardlessRequest(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/actions/cancel`,
    {},
    `cancel-${paymentId}`,
  );
  if (!res.ok && !/already.?cancelled|cancellation_failed/i.test(String(res.detail || ""))) {
    return { ok: false as const, detail: res.detail || res.error };
  }
  return { ok: true as const };
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("contact_id", CONTACT_ID)
  .in("invoice_number", [KEEPER_NO, OLD_TRACKER_NO]);
if (error) throw error;
const byNo = new Map((shares || []).map((s) => [String(s.invoice_number), s]));
const keeper = byNo.get(KEEPER_NO);
const oldTracker = byNo.get(OLD_TRACKER_NO);
if (!keeper) throw new Error(`Missing ${KEEPER_NO}`);

console.log(APPLY ? "APPLY" : "DRY");
console.log("Keeper before", {
  amount: keeper.amount_gbp,
  schedule: keeper.payment_schedule,
  gc: keeper.gocardless_payment_id,
});
console.log("Old tracker", oldTracker?.invoice_number, oldTracker?.gocardless_payment_id);
console.log("New plan: 4×£176.50 Sep–Dec = £706 (programme £700 + fees)");

if (!APPLY) {
  console.log("Dry OK. APPLY=1 to cancel flexi PMs + switch to monthly.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

for (const row of [keeper, oldTracker].filter(Boolean)) {
  const pid = row!.gocardless_payment_id ? String(row!.gocardless_payment_id) : "";
  if (!pid) continue;
  const c = await cancelPm(pid);
  console.log("Cancel", row!.invoice_number, pid, c.ok ? "ok" : c.detail);
  if (!c.ok) Deno.exit(1);
}

const keeperId = String(keeper.id);
const schedule = MONTHS.map((m, i) => ({
  seq: i + 1,
  label: m.label,
  due_date: m.due_date,
  amount_gbp: m.amount_gbp,
  status: "pending" as const,
  paid_at: null,
  paid_via: null,
}));

const lineItems = Array.isArray(keeper.line_items) ? keeper.line_items : [];
const lineDescription =
  (lineItems.length
    ? lineItemsToDescription(lineItems as any, { fundedProvision: false })
    : String(keeper.line_description || "")) +
  `\n\nDirect Payment (GoCardless) · 4 monthly instalments · £${FEE.toFixed(2)} collection fee per charge.`;

const noteLine =
  `Office 15 Aug 2026 · switched flexi 2×£350 → GC monthly 4×£${MONTHLY} (Sep–Dec). Cancelled flexi PMs.`;

const { error: upKeep } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: TOTAL,
    amount_paid_gbp: 0,
    payment_status: "unpaid",
    payment_method_hint: "gocardless",
    gocardless_mandate_id: MANDATE_ID,
    gocardless_payment_id: null,
    payment_schedule: schedule,
    due_date: MONTHS[0].due_date,
    next_instalment_due: nextInstalmentDueDate(schedule),
    line_description: lineDescription,
    reference_text: "Autumn term 26/27 · GC monthly",
    notes: appendMarker(
      [String(keeper.notes || "").replace(/Consolidated payment tracker:.*/gi, "").trim(), noteLine]
        .filter(Boolean)
        .join("\n"),
      keeperId,
    ),
    share_status: "ready",
    billing_term: "autumn",
    updated_at: new Date().toISOString(),
  })
  .eq("id", keeperId);
if (upKeep) throw upKeep;
console.log("Keeper rewritten", KEEPER_NO, `£${TOTAL}`);

if (oldTracker) {
  const { error: hideErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      share_status: "hidden",
      gocardless_payment_id: null,
      notes: appendMarker(
        `${String(oldTracker.notes || "").trim()}\nVoided — replaced by GC monthly trackers.`,
        keeperId,
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", oldTracker.id);
  if (hideErr) throw hideErr;
  console.log("Voided old flexi tracker", OLD_TRACKER_NO);
}

type ChargeRow = {
  id: string;
  invoice_number: string;
  amount_gbp: number;
  due_date: string;
  role: "keeper" | "tracker";
};

const charges: ChargeRow[] = [
  {
    id: keeperId,
    invoice_number: KEEPER_NO,
    amount_gbp: MONTHLY,
    due_date: MONTHS[0].due_date,
    role: "keeper",
  },
];

for (let i = 1; i < MONTHS.length; i++) {
  const m = MONTHS[i];
  const tracker = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: m.amount_gbp,
    dueDateIso: m.due_date,
    vatMode: "vat_20",
    lineDescription: `Autumn 26/27 · ${m.label} · GC tracker`,
    reference: `Autumn · ${m.label}`,
    notes: appendMarker(
      `Office 15 Aug 2026 · Maiyar GC monthly tracker · ${m.label}`,
      keeperId,
    ),
    title: `Tracker — Maiyar Alolabi · ${m.label}`,
    shareStatus: "hidden",
    paymentMethodHint: "gocardless",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    paymentSchedule: [
      {
        seq: 1,
        label: m.label,
        due_date: m.due_date,
        amount_gbp: m.amount_gbp,
        status: "pending",
      },
    ],
    billingTerm: "autumn",
    lineItems: [],
  });
  if (!tracker.ok) throw new Error(`tracker ${m.label}: ${tracker.error}`);
  const tid = String(tracker.invoice?.id || "");
  const tno = String(tracker.invoiceNumber || "");
  console.log("TRACKER", tno, m.label, `£${m.amount_gbp}`);
  charges.push({
    id: tid,
    invoice_number: tno,
    amount_gbp: m.amount_gbp,
    due_date: m.due_date,
    role: "tracker",
  });
}

for (const c of charges) {
  const created = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence: Math.round(c.amount_gbp * 100),
    description: `clubSENsational ${c.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(c.due_date),
    invoiceShareId: c.id,
    contactId: CONTACT_ID,
    invoiceNumber: c.invoice_number,
    idempotencyKey: `maiyar-monthly-${c.id}`,
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
    created.data.charge_date,
    `£${c.amount_gbp}`,
  );
}

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (sub?.payload && typeof sub.payload === "object") {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const funding = (payload.funding && typeof payload.funding === "object"
    ? payload.funding
    : {}) as Record<string, unknown>;
  const choices = (funding.choices_2627 && typeof funding.choices_2627 === "object"
    ? funding.choices_2627
    : {}) as Record<string, unknown>;
  choices.payment_method_code = "gocardless";
  choices.payment_method_label = "Direct Payment (GoCardless)";
  choices.payment_schedule_code = "monthly_term";
  choices.payment_schedule_label = "Regular monthly — this term (4 instalments Autumn)";
  choices.billing_schedule = "monthly";
  funding.choices_2627 = choices;
  payload.funding = funding;
  const note = String(payload.office_note || "");
  payload.office_note =
    `${note} · 2026-08-15: GC flexi → monthly_term 4×£${MONTHLY} Sep–Dec (INV-P-0133).`.trim();
  const { error: pErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", sub.id);
  if (pErr) throw pErr;
  console.log("Reenrol → monthly_term");
}

const regen = await regeneratePortalInvoiceSharePdf(admin, keeperId);
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);

void PARENT_PERSON_ID;
console.log(JSON.stringify({ ok: true, keeper: KEEPER_NO, total: TOTAL, monthly: MONTHLY }, null, 2));
