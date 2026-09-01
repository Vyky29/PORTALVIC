/**
 * Office: Huma Qureshi · Rayyan Fida (97)
 *
 * Context:
 * - 22 Jul parent re-enrol withdrew BOTH slots → seats released, £0 invoices.
 * - 6 Aug booking-portal registration submitted for Multi SwimFarm Sun 12.30–2
 *   (reservation still pending; MADRE left as NO PARTICIPANT).
 *
 * This script confirms that Multi afternoon place for Autumn 26/27:
 * - MADRE standing: Javier 12.30–1.15 + Giuseppe 1.15–2 → Rayyan Fi
 * - Update re-enrol submission (keep Multi, withdraw Aquatic)
 * - Autumn term invoice EXEMPT DP · bank transfer · £1,560 (13 × £120)
 * - Mark booking reservation confirmed
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-huma-rayyan-multi.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-huma-rayyan-multi.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import { buildReenrolmentInstalments } from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import {
  REENROL_ACADEMIC_YEAR,
  SESSION_COUNTS,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import { writeFileSync, mkdirSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "97";
const PARENT_PERSON_ID = "5656331";
const SUBMISSION_ID = "865550b3-7fbb-440a-9529-0319f47f5d56";
const RESERVATION_ID = "d4e5e56e-e22e-4ad1-a4af-ae9bcd6e59b2";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const READY_BY = "office_reenrol_huma_rayyan_multi_20260810";
const CRASH_FROM = "2026-07-20";
const MADRE_NAME = "Rayyan Fi";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
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
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function staffKeyOf(st: Record<string, unknown>): string {
  return norm(st.staffKey || st.name || st.staff_name || "").toLowerCase();
}

function isTargetHalf(staffKey: string, time: string): boolean {
  const t = time.toLowerCase().replace(/:/g, ".");
  if (staffKey === "javier" && /12\.30\s*to\s*1\.15/.test(t)) return true;
  if (staffKey === "giuseppe" && /1\.15\s*to\s*2/.test(t)) return true;
  return false;
}

const sessions = { ...SESSION_COUNTS.weekend };
const PRICE = 120;
const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "90' MULTI-ACTIVITY (Sunday)",
    serviceType: "MULTI-ACTIVITY",
    durationMin: 90,
    day: "Sunday",
    isWeekend: true,
    isDayCentre: false,
    pricePerSession: PRICE,
    sessions,
    termTotals: {
      autumn: round2(sessions.autumn * PRICE),
      spring: round2(sessions.spring * PRICE),
      summer: round2(sessions.summer * PRICE),
      annual: round2(sessions.annual * PRICE),
    },
    timeSlot: "12.30 to 2",
    venue: "SwimFarm",
    instructor: "JAVIER / GIUSEPPE",
    displayLabel: "90' Multi-Activity - 12.30 to 2 pm, Sundays (SwimFarm)",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};

const termTotals = {
  autumn: WEEKLY_SLOTS[0].termTotals.autumn,
  spring: WEEKLY_SLOTS[0].termTotals.spring,
  summer: WEEKLY_SLOTS[0].termTotals.summer,
  annual: WEEKLY_SLOTS[0].termTotals.annual,
};

const fundingChoices = {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
  auto_continue: false,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "term",
  admin_fee_applies: false,
  enrolment_cadence: "term_by_term",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  advance_buffer_gbp: null,
  auto_continue_note:
    "We will ask you to confirm before each term. Invoices are created for the current term only.",
  payment_method_code: "bank_transfer",
  payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
  payment_schedule_code: "term_3",
  payment_schedule_label: "Pay each term — one payment",
  estimated_annual_total: termTotals.annual,
  enrolment_cadence_label: "Term by term — confirm before each term",
  estimated_total_with_admin_fee: null,
  advance_buffer_note: null,
  advance_buffer_lines: null,
  advance_buffer_sessions_per_service: null,
};

const payload = {
  source: "office",
  office_note:
    "Office 10 Aug 2026 — Huma finished booking-portal registration (6 Aug) for Multi Sun 12.30–2 SwimFarm. Confirm seat in MADRE + Autumn invoice. Aquatic Tue stays withdrawn (NO PARTICIPANT).",
  prior_parent_submission_id: SUBMISSION_ID,
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Funded · Direct Payments",
      invoice_type: "Parent (Exempt invoice)",
      payment_method: "Own Way (behind)",
      invoice_type_code: "exempt",
    },
  },
  choices: {
    weekly: weeklyChoices,
    day_centre: null,
    enrolment_cadence: "term_by_term",
    enrolment_cadence_label: fundingChoices.enrolment_cadence_label,
  },
  weekly_slots_snapshot: WEEKLY_SLOTS,
  term_totals: termTotals,
  declarations: {
    accurate: true,
    terms: true,
    office_proxy: true,
  },
};

const plan = buildReenrolmentInstalments({
  funding: payload.funding,
  termTotals,
  participantName: "Rayyan Fida",
  academicYear: REENROL_ACADEMIC_YEAR,
});

console.log("Huma Qureshi · Rayyan Fida (97)");
console.log(
  `Keep: Sun 12.30–2 Multi SwimFarm · £${PRICE} × ${sessions.autumn} autumn = £${termTotals.autumn}`,
);
console.log("Withdraw remains: Aquatic Tue Acton");
console.log("Cadence: term_by_term · bank · EXEMPT DP");
console.log("Plan skip:", plan.skipReason);
console.log("Hint:", plan.paymentMethodHint, "· vat:", plan.vatMode);
for (const inv of plan.termInvoices) {
  console.log(
    `Invoice ${inv.label}: £${inv.amountGbp} due ${inv.dueDateIso}`,
    (inv.paymentSchedule || [])
      .map((r) => `${r.label} £${r.amount_gbp} (${r.due_date})`)
      .join(" · "),
  );
}

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write MADRE + submission + invoice.");
  Deno.exit(0);
}

if (plan.skipReason || !plan.termInvoices.length) {
  throw new Error(`instalment plan failed: ${plan.skipReason || "empty"}`);
}

const autumnOnly = plan.termInvoices.filter((t) => t.term === "autumn");
if (!autumnOnly.length) throw new Error("expected autumn invoice");

const { data: existingInv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, ready_by")
  .eq("contact_id", CONTACT_ID)
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void");
if (existingInv?.length) {
  throw new Error(
    `Already has reenrol invoices: ${existingInv.map((r) => r.invoice_number).join(", ")}`,
  );
}

// --- MADRE: fill afternoon Multi halves ---
const { data: madreRow, error: madreErr } = await admin
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (madreErr || !madreRow) throw new Error(`madre: ${madreErr?.message || "missing"}`);
const prevRev = Number(madreRow.revision) || 0;
const doc = structuredClone(madreRow.document) as {
  weeks?: Array<Record<string, unknown>>;
  meta?: { notes?: string[] };
};
const madreLog: string[] = [];
for (const week of doc.weeks || []) {
  const list = Array.isArray(week.staff)
    ? week.staff
    : Object.values((week.staff as Record<string, unknown>) || {});
  for (const stRaw of list) {
    const st = stRaw as Record<string, unknown>;
    if (!st) continue;
    const sk = staffKeyOf(st);
    for (const day of (st.days as Array<Record<string, unknown>>) || []) {
      if (!day) continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (iso && iso >= CRASH_FROM) continue;
      const wd = norm(day.weekday).toLowerCase();
      if (wd && wd !== "sunday" && !wd.startsWith("sun")) continue;
      for (const slot of (day.slots as Array<Record<string, unknown>>) || []) {
        if (!slot) continue;
        const svc = norm(slot.service);
        const ven = norm(slot.venue);
        if (!/multi/i.test(svc)) continue;
        if (!/swimfarm|swim.?farm/i.test(ven)) continue;
        const time = norm(slot.time_slot);
        if (!isTargetHalf(sk, time)) continue;
        const before = norm(slot.client_name);
        if (/rayyan/i.test(before)) {
          madreLog.push(`${iso} ${sk} ${time}: already ${before}`);
          continue;
        }
        if (before && before.toUpperCase() !== "NO PARTICIPANT") {
          madreLog.push(`${iso} ${sk} ${time}: SKIP occupied by ${before}`);
          continue;
        }
        slot.client_name = MADRE_NAME;
        slot.participant_info = "";
        madreLog.push(`${iso} ${sk} ${time}: ${before || "(empty)"} → ${MADRE_NAME}`);
      }
    }
  }
}
const filled = madreLog.filter((l) => l.includes("→")).length;
const already = madreLog.filter((l) => l.includes("already")).length;
if (!filled && !already) {
  throw new Error(`MADRE: no open halves filled\n${madreLog.join("\n")}`);
}

let madreRev = prevRev;
if (filled) {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Rayyan Fi confirmed Multi Sun afternoon (Javier 12.30–1.15 + Giuseppe 1.15–2) — Huma booking registration 6 Aug + office invoice ${READY_BY}`,
  );
  const nextRev = prevRev + 1;
  const { data: madreOut, error: madrePutErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: nextRev,
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    })
    .eq("term_key", "summer-2026")
    .eq("revision", prevRev)
    .select("revision")
    .maybeSingle();
  if (madrePutErr || !madreOut) {
    throw new Error(`madre patch: ${madrePutErr?.message || "revision conflict"}`);
  }
  madreRev = Number(madreOut.revision) || nextRev;
  console.log("MADRE", prevRev, "→", madreRev, "filled", filled);
} else {
  console.log("MADRE already has Rayyan Fi on target halves (rev", prevRev, "; already", already, ")");
}

// --- Update parent withdraw submission → keep Multi ---
const { error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .update({
    source: "link",
    payload,
    outstanding_amount: termTotals.autumn,
    payment_status_at_submit: "Pending · Autumn invoice",
  })
  .eq("id", SUBMISSION_ID);
if (subErr) throw new Error(`submission update: ${subErr.message}`);
console.log("Submission updated", SUBMISSION_ID);

await admin
  .from("client_payments")
  .update({
    payment_status: "Re-enrolled · Autumn Multi (office)",
    updated_at: new Date().toISOString(),
  })
  .eq("client_key", "rayyanf");

const nowIso = new Date().toISOString();
const { error: resErr } = await admin
  .from("portal_booking_slot_reservations")
  .update({
    status: "validated",
    validated_at: nowIso,
    updated_at: nowIso,
    notes: "office_confirmed_madre_invoice_" + READY_BY,
  })
  .eq("id", RESERVATION_ID);
if (resErr) console.warn("reservation update:", resErr.message);
else console.log("Reservation confirmed", RESERVATION_ID);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const productMap = await loadProductMap(admin);
const inv = autumnOnly[0];
const lineItems = buildReenrolTermLineItems({
  slots: WEEKLY_SLOTS,
  weeklyChoices,
  term: "autumn",
  vatMode: plan.vatMode,
  productMap,
});
const lineDescription = lineItems.length
  ? lineItemsToDescription(lineItems, { fundedProvision: true })
  : inv.lineDescription || inv.label;

const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: inv.amountGbp,
  dueDateIso: inv.dueDateIso,
  vatMode: plan.vatMode,
  lineDescription,
  reference: inv.reference || inv.label,
  notes:
    "Office re-enrolment · Autumn term · Multi SwimFarm Sun 12.30–2 · EXEMPT DP · bank / Card / Apple Pay. Booking registration 6 Aug confirmed.",
  title: `Invoice — Rayyan Fida · ${inv.label}`,
  shareStatus: "ready",
  paymentMethodHint: plan.paymentMethodHint,
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  paymentSchedule: inv.paymentSchedule,
  billingTerm: inv.term,
  lineItems,
});
if (!created.ok) throw new Error(`invoice: ${created.error}`);
const shareId = String(created.invoice?.id || "");
console.log("Invoice", created.invoiceNumber, `£${inv.amountGbp}`, shareId);

await xeroHydrateRefreshFromDb(admin);
const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
console.log("Xero", created.invoiceNumber, pushed.ok ? "ok" : pushed.error);
await xeroPersistRefreshToDb(admin);

mkdirSync("database/local-vault/tmp", { recursive: true });
const report = {
  at: nowIso,
  contact_id: CONTACT_ID,
  madre: { prevRev, nextRev: madreRev, filled, already, sample: madreLog.slice(0, 16) },
  submission_id: SUBMISSION_ID,
  reservation_id: RESERVATION_ID,
  invoice: {
    id: shareId,
    number: created.invoiceNumber,
    amount: inv.amountGbp,
    due: inv.dueDateIso,
    xero: pushed.ok ? "ok" : pushed.error,
  },
};
writeFileSync(
  "database/local-vault/tmp/office-reenroll-huma-rayyan-report.json",
  JSON.stringify(report, null, 2),
);
console.log("Report → database/local-vault/tmp/office-reenroll-huma-rayyan-report.json");
