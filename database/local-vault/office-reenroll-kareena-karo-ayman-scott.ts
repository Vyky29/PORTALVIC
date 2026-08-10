/**
 * Office 22 Jul 2026:
 *  - Kareena Al hassani (290) · Chopi — renew unpaid Private yearly_1off
 *  - Karo (gap-karo-alhassani) · Chopi — renew unpaid Private yearly_1off
 *  - Ayman El Bakry (174) · Zeyna — renew unpaid Private yearly_1off (2× Aquatic)
 *  - Scott de Wolff (142) · Alvar — NOT renewing 2026/27 (office record)
 *  - Summer · S. Messing — crash-only; exclude from reenrol pending (note on payments row)
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-kareena-karo-ayman-scott.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-kareena-karo-ayman-scott.ts
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
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  REENROL_ACADEMIC_YEAR,
  SESSION_COUNTS,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DUE = "2026-08-15";
const READY_BY = "office_reenrol_kareena_karo_ayman_20260722";

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

function weekdaySlot(opts: {
  id: string;
  serviceType: string;
  durationMin: number;
  day: string;
  timeSlot: string;
  pricePerSession: number;
  venue?: string;
  instructor?: string;
}): ParsedSlot {
  const sessions = { ...SESSION_COUNTS.weekday };
  const p = opts.pricePerSession;
  return {
    id: opts.id,
    raw: `${opts.durationMin}' ${opts.serviceType} (${opts.day})`,
    serviceType: opts.serviceType,
    durationMin: opts.durationMin,
    day: opts.day,
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: p,
    sessions,
    termTotals: {
      autumn: sessions.autumn * p,
      spring: sessions.spring * p,
      summer: sessions.summer * p,
      annual: sessions.annual * p,
    },
    timeSlot: opts.timeSlot,
    venue: opts.venue || "Acton",
    instructor: opts.instructor || "",
    displayLabel: `${opts.durationMin}' ${opts.serviceType.replace(/_/g, " ")} - ${opts.timeSlot}, ${opts.day}s (${opts.venue || "Acton"})`,
  };
}

type RenewTarget = {
  contactId: string;
  parentPersonId: string;
  childName: string;
  parentFirst: string;
  parentLast: string;
  slots: ParsedSlot[];
  officeNote: string;
};

const RENEW: RenewTarget[] = [
  {
    contactId: "290",
    parentPersonId: "6436375",
    childName: "Kareena Al hassani",
    parentFirst: "Chopi",
    parentLast: "Al hassani",
    officeNote:
      "Created by office 22 Jul 2026 — Chopi: renew 2026/27 unpaid, Private 20% VAT, yearly one-off.",
    slots: [
      weekdaySlot({
        id: "pub-0",
        serviceType: "AQUATIC ACTIVITY",
        durationMin: 30,
        day: "Tuesday",
        timeSlot: "6 to 6.30",
        pricePerSession: 50,
      }),
    ],
  },
  {
    contactId: "gap-karo-alhassani",
    parentPersonId: "6436375",
    childName: "Karo",
    parentFirst: "Chopi",
    parentLast: "Al hassani",
    officeNote:
      "Created by office 22 Jul 2026 — Chopi: renew 2026/27 unpaid, Private 20% VAT, yearly one-off.",
    slots: [
      weekdaySlot({
        id: "pub-0",
        serviceType: "AQUATIC ACTIVITY",
        durationMin: 30,
        day: "Thursday",
        timeSlot: "5.30 to 6",
        pricePerSession: 50,
      }),
    ],
  },
  {
    contactId: "174",
    parentPersonId: "5781763",
    childName: "Ayman El Bakry",
    parentFirst: "Zeyna",
    parentLast: "Bakry",
    officeNote:
      "Created by office 22 Jul 2026 — Zeyna: renew 2026/27 unpaid, Private 20% VAT, yearly one-off (Tue + Thu Aquatic). Summer 25/26 Tue 4.30 add-on not carried forward.",
    slots: [
      weekdaySlot({
        id: "pub-0",
        serviceType: "AQUATIC ACTIVITY",
        durationMin: 60,
        day: "Tuesday",
        timeSlot: "4 to 5",
        pricePerSession: 50,
      }),
      weekdaySlot({
        id: "pub-1",
        serviceType: "AQUATIC ACTIVITY",
        durationMin: 60,
        day: "Thursday",
        timeSlot: "4 to 5",
        pricePerSession: 50,
      }),
    ],
  },
];

function fundingChoices(annualTotal: number) {
  return {
    billing_mode: "private",
    funding_code: "private",
    funding_label: "Using Private Funds",
    auto_continue: true,
    admin_fee_total: 0,
    admin_fee_reason: null,
    billing_schedule: "yearly_1off",
    admin_fee_applies: false,
    enrolment_cadence: "whole_year",
    invoice_type_code: "vat_20",
    invoice_type_label: "Parent (20% included invoice)",
    advance_buffer_gbp: null,
    auto_continue_note:
      "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise.",
    payment_method_code: "bank_transfer",
    payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
    payment_schedule_code: "yearly_1off",
    payment_schedule_label: "All year — one payment",
    estimated_annual_total: annualTotal,
    enrolment_cadence_label: "Whole year — confirm once; continue each term automatically",
    estimated_total_with_admin_fee: null,
    advance_buffer_note: null,
    advance_buffer_lines: null,
    advance_buffer_sessions_per_service: null,
  };
}

function yearLineItems(
  slots: ParsedSlot[],
  weeklyChoices: Record<string, { choice: string; alternative: null }>,
  productMap: Awaited<ReturnType<typeof loadProductMap>>,
): PortalInvoiceLineItem[] {
  const yearLines: PortalInvoiceLineItem[] = [];
  for (const term of ["autumn", "spring", "summer"] as const) {
    const termLines = buildReenrolTermLineItems({
      slots,
      weeklyChoices,
      term,
      vatMode: "vat_20",
      productMap,
    });
    for (const line of termLines) {
      const key = `${line.service_key}\u0000${line.detail || ""}`;
      const prev = yearLines.find((l) => `${l.service_key}\u0000${l.detail || ""}` === key);
      if (prev) {
        prev.quantity = round2(Number(prev.quantity) + Number(line.quantity));
        prev.amount_gbp = round2(Number(prev.amount_gbp) + Number(line.amount_gbp));
        prev.unit_price_gbp = prev.quantity
          ? Math.round((prev.amount_gbp / prev.quantity) * 10000) / 10000
          : prev.unit_price_gbp;
        const dates = [prev.dates, line.dates].filter(Boolean).join(" · ");
        prev.dates = dates || prev.dates;
      } else {
        yearLines.push({ ...line });
      }
    }
  }
  return yearLines;
}

async function renewOne(
  target: RenewTarget,
  productMap: Awaited<ReturnType<typeof loadProductMap>>,
  ownerId: string,
) {
  const weeklyChoices: Record<string, { choice: string; alternative: null }> = {};
  for (const s of target.slots) weeklyChoices[s.id] = { choice: "keep", alternative: null };
  const annualTotal = round2(
    target.slots.reduce((s, slot) => s + Number(slot.termTotals?.annual || 0), 0),
  );
  const termTotals = {
    autumn: round2(target.slots.reduce((s, slot) => s + Number(slot.termTotals?.autumn || 0), 0)),
    spring: round2(target.slots.reduce((s, slot) => s + Number(slot.termTotals?.spring || 0), 0)),
    summer: round2(target.slots.reduce((s, slot) => s + Number(slot.termTotals?.summer || 0), 0)),
    annual: annualTotal,
  };
  const fc = fundingChoices(annualTotal);
  const payload = {
    source: "office",
    office_note: target.officeNote,
    funding: {
      choices_2627: fc,
      current_2526: {
        funding: "Private",
        invoice_type: "Parent (20% included invoice)",
        payment_method: "Bank Transfer",
        invoice_type_code: "vat_20",
      },
    },
    choices: {
      weekly: weeklyChoices,
      day_centre: null,
      enrolment_cadence: "whole_year",
      enrolment_cadence_label: fc.enrolment_cadence_label,
    },
    weekly_slots_snapshot: target.slots,
    term_totals: termTotals,
    declarations: { accurate: true, terms: true, office_proxy: true },
  };
  const yearLines = yearLineItems(target.slots, weeklyChoices, productMap);
  const lineSum = round2(yearLines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
  const description = lineItemsToDescription(yearLines, { fundedProvision: false });

  console.log(`\n=== RENEW ${target.childName} (${target.contactId}) · ${target.parentFirst} ===`);
  for (const s of target.slots) {
    console.log(
      `  keep ${s.day} ${s.timeSlot} ${s.durationMin}' ${s.serviceType} @ £${s.pricePerSession} → £${s.termTotals.annual}/yr`,
    );
  }
  console.log(`  Annual £${annualTotal} (lines £${lineSum}) · due ${DUE} · unpaid ready`);

  if (!APPLY) return { contactId: target.contactId, dry: true };

  const { data: existingSubs } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, submitted_at")
    .eq("participant_contact_id", target.contactId)
    .eq("academic_year", REENROL_ACADEMIC_YEAR);
  if (existingSubs?.length) {
    throw new Error(`${target.childName}: already has submission(s) ${JSON.stringify(existingSubs)}`);
  }
  const { data: existingInv } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number")
    .eq("contact_id", target.contactId)
    .eq("created_via", "reenrolment")
    .neq("payment_status", "void");
  if (existingInv?.length) {
    throw new Error(
      `${target.childName}: already has reenrol invoices ${existingInv.map((r) => r.invoice_number).join(", ")}`,
    );
  }

  const { data: inserted, error: insErr } = await admin
    .from("portal_re_enrolment_submissions")
    .insert({
      academic_year: REENROL_ACADEMIC_YEAR,
      participant_contact_id: target.contactId,
      participant_name: target.childName,
      parent_first_name: target.parentFirst,
      parent_last_name: target.parentLast,
      parent_person_id: target.parentPersonId,
      source: "link",
      payload,
    })
    .select("id, submitted_at")
    .single();
  if (insErr || !inserted) throw new Error(`${target.childName} submission: ${insErr?.message}`);
  console.log("  Submission", inserted.id);

  await admin
    .from("portal_parent_contacts")
    .update({
      funding_label: "Using Private Funds",
      payment_method_label: "Bank Transfer",
      updated_at: new Date().toISOString(),
    })
    .eq("contact_id", target.contactId);

  const created = await createPortalFamilyInvoice(admin, {
    contactId: target.contactId,
    amountGbp: annualTotal,
    dueDateIso: DUE,
    vatMode: "vat_20",
    lineDescription: description,
    reference: "Full academic year 26/27",
    notes: "Office re-enrolment · auto-continue · one-off bank / Apple Pay (Private 20% VAT) · unpaid.",
    title: `Invoice — ${target.childName} · Full academic year 26/27`,
    shareStatus: "ready",
    paymentMethodHint: "bank_transfer",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    billingTerm: null,
    paymentSchedule: [
      {
        seq: 1,
        label: "Full academic year · one payment",
        due_date: DUE,
        amount_gbp: annualTotal,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems: yearLines,
  });
  if (!created.ok) throw new Error(`${target.childName} invoice: ${created.error}`);
  const shareId = String(created.invoice?.id || "");
  console.log("  Invoice", created.invoiceNumber, `£${annualTotal}`, shareId);

  try {
    await xeroHydrateRefreshFromDb(admin);
    const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
    console.log("  Xero", pushed);
    await xeroPersistRefreshToDb(admin);
  } catch (e) {
    console.log("  Xero skip:", e instanceof Error ? e.message : e);
  }

  return {
    contactId: target.contactId,
    child: target.childName,
    invoice: created.invoiceNumber,
    amount: annualTotal,
    submission: inserted.id,
  };
}

async function markScottNotRenewing() {
  const contactId = "142";
  const scottSlots: ParsedSlot[] = [
    {
      id: "pub-0",
      raw: "60' CLIMBING ACTIVITY (Sunday)",
      serviceType: "CLIMBING ACTIVITY",
      durationMin: 60,
      day: "Sunday",
      isWeekend: true,
      isDayCentre: false,
      pricePerSession: 120,
      sessions: { ...SESSION_COUNTS.weekend },
      termTotals: {
        autumn: SESSION_COUNTS.weekend.autumn * 120,
        spring: SESSION_COUNTS.weekend.spring * 120,
        summer: SESSION_COUNTS.weekend.summer * 120,
        annual: SESSION_COUNTS.weekend.annual * 120,
      },
      timeSlot: "12 to 1",
    },
    {
      id: "pub-1",
      raw: "90' MULTI-ACTIVITY (Wednesday)",
      serviceType: "MULTI-ACTIVITY",
      durationMin: 90,
      day: "Wednesday",
      isWeekend: false,
      isDayCentre: false,
      pricePerSession: 70,
      sessions: { ...SESSION_COUNTS.weekday },
      termTotals: {
        autumn: SESSION_COUNTS.weekday.autumn * 70,
        spring: SESSION_COUNTS.weekday.spring * 70,
        summer: SESSION_COUNTS.weekday.summer * 70,
        annual: SESSION_COUNTS.weekday.annual * 70,
      },
      timeSlot: "4.30 to 6",
    },
  ];
  const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
    "pub-0": { choice: "withdraw", alternative: null },
    "pub-1": { choice: "withdraw", alternative: null },
  };
  const payload = {
    source: "office",
    not_continuing: true,
    office_note:
      "Office 22 Jul 2026 — Alvar de Wolff: Scott will not renew for 2026/27. All places withdrawn.",
    choices: {
      weekly: weeklyChoices,
      day_centre: null,
      enrolment_cadence: "not_continuing",
      enrolment_cadence_label: "Not continuing 2026/27",
    },
    weekly_slots_snapshot: scottSlots,
    term_totals: { autumn: 0, spring: 0, summer: 0, annual: 0 },
    declarations: { accurate: true, terms: true, office_proxy: true },
  };

  console.log("\n=== NOT RENEWING Scott de Wolff (142) · Alvar ===");
  if (!APPLY) {
    console.log("  Dry run — would insert not_continuing submission (withdraw both slots).");
    return;
  }

  const { data: existingSubs } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, submitted_at")
    .eq("participant_contact_id", contactId)
    .eq("academic_year", REENROL_ACADEMIC_YEAR);
  if (existingSubs?.length) {
    console.log("  Already has submission — patching payload.not_continuing");
    await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", existingSubs[0].id);
    console.log("  Updated", existingSubs[0].id);
  } else {
    const { data: inserted, error } = await admin
      .from("portal_re_enrolment_submissions")
      .insert({
        academic_year: REENROL_ACADEMIC_YEAR,
        participant_contact_id: contactId,
        participant_name: "Scott de Wolff",
        parent_first_name: "Alvar",
        parent_last_name: "de Wolff",
        parent_person_id: "5680959",
        source: "link",
        payload,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Scott submission: ${error?.message}`);
    console.log("  Submission", inserted.id);
  }

  const { data: pay } = await admin
    .from("client_payments")
    .select("id, data")
    .eq("client_key", "scott")
    .maybeSingle();
  if (pay?.id) {
    const data = { ...(pay.data as Record<string, unknown> || {}) };
    data["Re-enrol 26/27"] = "Not renewing (office 22 Jul 2026 · Alvar)";
    data.Notes = [String(data.Notes || data.Note || "").trim(), "NOT RENEWING 2026/27 — office 22 Jul"]
      .filter(Boolean)
      .join(" · ");
    await admin.from("client_payments").update({ data }).eq("id", pay.id);
    console.log("  client_payments scott row noted");
  }
}

async function markSummerCrashOnly() {
  console.log("\n=== EXCLUDE Summer · S. Messing (crash-only) ===");
  if (!APPLY) {
    console.log("  Dry run — would note crash-only on payments row.");
    return;
  }
  const { data: pay } = await admin
    .from("client_payments")
    .select("id, data")
    .eq("client_key", "summer")
    .maybeSingle();
  if (!pay?.id) {
    console.log("  No summer payments row found");
    return;
  }
  const data = { ...(pay.data as Record<string, unknown> || {}) };
  data["Re-enrol 26/27"] = "N/A — crash courses only (exclude from reenrol pending)";
  data.Notes = [
    String(data.Notes || data.Note || "").trim(),
    "CRASH ONLY — not a term-place reenrol candidate (office 22 Jul 2026)",
  ]
    .filter(Boolean)
    .join(" · ");
  await admin.from("client_payments").update({ data }).eq("id", pay.id);
  console.log("  client_payments summer row noted");
}

const productMap = await loadProductMap(admin);
console.log(`Office batch · APPLY=${APPLY ? "1" : "0 (dry)"} · year ${REENROL_ACADEMIC_YEAR}`);

if (!APPLY) {
  for (const t of RENEW) await renewOne(t, productMap, "dry");
  await markScottNotRenewing();
  await markSummerCrashOnly();
  console.log("\nDry run only — re-run with APPLY=1 to write.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const results = [];
for (const t of RENEW) {
  results.push(await renewOne(t, productMap, ownerId));
}
await markScottNotRenewing();
await markSummerCrashOnly();

console.log("\nDone.");
console.log(JSON.stringify(results, null, 2));
