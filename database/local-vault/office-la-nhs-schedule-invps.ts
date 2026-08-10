/**
 * Office funder INV-Ps for re-enrolments 2026/27 — downloadable like Crash (PDF / Hide / Mark paid).
 *
 * Schedules by funder (client_payments.sheet = LA · data.Funder):
 *   - NHS / NHS·SBS / NHS (ILA)  → 11 monthly (Sep 2026 – Jul 2027)
 *   - Ealing                     → 1 whole-year invoice
 *   - H&F                        → 3 term + 11 monthly (office picks which to send)
 *
 * Parent hub never lists la_funded. share_status = ready so admin matches private cards.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-schedule-invps.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-schedule-invps.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolMonthlyLineItems,
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  namesMatch,
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const READY_ROOT = "office_funder_2627";

const MONTHS_11: Array<{
  term: "autumn" | "spring" | "summer";
  label: string;
  ym: string;
  dueIso: string;
}> = [
  { term: "autumn", label: "September 2026", ym: "2026-09", dueIso: "2026-09-01" },
  { term: "autumn", label: "October 2026", ym: "2026-10", dueIso: "2026-10-01" },
  { term: "autumn", label: "November 2026", ym: "2026-11", dueIso: "2026-11-01" },
  { term: "autumn", label: "December 2026", ym: "2026-12", dueIso: "2026-12-01" },
  { term: "spring", label: "January 2027", ym: "2027-01", dueIso: "2027-01-01" },
  { term: "spring", label: "February 2027", ym: "2027-02", dueIso: "2027-02-01" },
  { term: "spring", label: "March 2027", ym: "2027-03", dueIso: "2027-03-01" },
  { term: "summer", label: "April 2027", ym: "2027-04", dueIso: "2027-04-01" },
  { term: "summer", label: "May 2027", ym: "2027-05", dueIso: "2027-05-01" },
  { term: "summer", label: "June 2027", ym: "2027-06", dueIso: "2027-06-01" },
  { term: "summer", label: "July 2027", ym: "2027-07", dueIso: "2027-07-01" },
];

const TERMS: Array<{
  term: "autumn" | "spring" | "summer";
  label: string;
  dueIso: string;
}> = [
  { term: "autumn", label: "Autumn term", dueIso: "2026-09-01" },
  { term: "spring", label: "Spring term", dueIso: "2026-12-01" },
  { term: "summer", label: "Summer term", dueIso: "2027-03-01" },
];

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
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clean(v: unknown, max = 120): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function pickClientId(data: Record<string, unknown>): string {
  return clean(
    data["Client Id"] || data["Client ID"] || data.client_id || data.clientId,
    80,
  );
}
function pickPo(data: Record<string, unknown>): string {
  return clean(data.PO || data.po || data["PO Number"] || data.po_number, 80);
}

type FunderBucket = "nhs" | "ealing" | "hf" | "other";

function funderBucket(funder: string): FunderBucket {
  const f = funder.toLowerCase();
  if (/nhs/.test(f)) return "nhs";
  if (/ealing/.test(f)) return "ealing";
  if (/h&f|hammersmith|fulham/.test(f)) return "hf";
  return "other";
}

function termTotalsFromSlots(weekly: ParsedSlot[], dc: ParsedSlot[]) {
  let autumn = 0;
  let spring = 0;
  let summer = 0;
  let annual = 0;
  for (const slot of [...weekly, ...dc]) {
    autumn += num(slot.termTotals?.autumn);
    spring += num(slot.termTotals?.spring);
    summer += num(slot.termTotals?.summer);
    annual += num(slot.termTotals?.annual);
  }
  return {
    autumn: round2(autumn),
    spring: round2(spring),
    summer: round2(summer),
    annual: round2(annual || autumn + spring + summer),
  };
}

function splitEqualAcrossMonths(totalGbp: number, n: number): number[] {
  const count = Math.max(1, Math.round(n) || 1);
  const total = round2(totalGbp);
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const per = round2(total / count);
  const out = Array.from({ length: count }, () => per);
  const head = round2(per * (count - 1));
  out[count - 1] = round2(total - head);
  return out;
}

function dayCentreTermLines(
  slots: ParsedSlot[],
  term: "autumn" | "spring" | "summer",
): PortalInvoiceLineItem[] {
  const out: PortalInvoiceLineItem[] = [];
  for (const slot of slots || []) {
    if (!slot?.isDayCentre) continue;
    const amount = round2(num(slot.termTotals?.[term]));
    if (amount <= 0) continue;
    const sessions = Math.max(1, num(slot.sessions?.[term]));
    out.push({
      service_key: "DAY_CENTRE",
      description: clean(slot.displayLabel || slot.serviceType || "Day Centre", 160) ||
        "Day Centre",
      detail: `${term} term ${REENROL_ACADEMIC_YEAR.replace("-", "/")} · funded provision`,
      dates: "",
      quantity: sessions,
      unit_price_gbp: round2(amount / sessions),
      amount_gbp: amount,
      xero_item_code: null,
    });
  }
  return out;
}

function fallbackLine(
  label: string,
  amount: number,
  detail: string,
): PortalInvoiceLineItem[] {
  return [
    {
      service_key: "FUNDED_PROVISION",
      description: label,
      detail,
      dates: "",
      quantity: 1,
      unit_price_gbp: amount,
      amount_gbp: amount,
      xero_item_code: null,
    },
  ];
}

type Pack = {
  clientKey: string;
  clientName: string;
  contactId: string;
  funder: string;
  bucket: FunderBucket;
  weekly: ParsedSlot[];
  dayCentre: ParsedSlot[];
  totals: { autumn: number; spring: number; summer: number; annual: number };
  clientId: string;
  po: string;
};

const { data: laRows, error: laErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, parent_name, data, sheet")
  .eq("sheet", "LA");
if (laErr) throw new Error(laErr.message);

const { data: contacts, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, child_last_name, funding_label, in_class",
  )
  .eq("in_class", true)
  .limit(500);
if (cErr) throw new Error(cErr.message);

const contactList = (contacts || [])
  .map((c) => {
    const child =
      clean(c.child_display, 120) ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" ").trim();
    return { contact_id: clean(c.contact_id, 120), child };
  })
  .filter((c) => c.contact_id && c.child);

const sorted = [...(laRows || [])].sort((a, b) => {
  const ta = String((a.data as Record<string, unknown> | null)?.Term || "").toLowerCase();
  const tb = String((b.data as Record<string, unknown> | null)?.Term || "").toLowerCase();
  const score = (t: string) =>
    /autumn/.test(t) && /26/.test(t) ? 0 : /autumn/.test(t) ? 1 : /summer/.test(t) ? 3 : 2;
  return score(ta) - score(tb);
});

const packs: Pack[] = [];
const seenKeys = new Set<string>();
for (const row of sorted) {
  const clientKey = clean(row.client_key, 80);
  if (!clientKey || /inflation|uplift/i.test(clientKey) || seenKeys.has(clientKey)) continue;
  const data = (row.data || {}) as Record<string, unknown>;
  const funder = clean(data.Funder || data.Funding || data.Paid, 80);
  const bucket = funderBucket(funder);
  if (bucket === "other") continue;

  const ctx = paymentRowToContext(row as Record<string, unknown>);
  const weekly = (ctx.weeklySlots || []) as ParsedSlot[];
  const dayCentre = (ctx.dayCentreSlots || []) as ParsedSlot[];
  const totals = termTotalsFromSlots(weekly, dayCentre);
  if (totals.annual <= 0) continue;

  const clientName = clean(ctx.clientName || row.client_name, 120);
  let matched: (typeof contactList)[0] | null = null;
  for (const c of contactList) {
    if (namesMatch(clientName, c.child) || namesMatch(c.child, clientName)) {
      matched = c;
      break;
    }
  }
  if (!matched) {
    console.log(`SKIP no_contact · ${bucket} · ${clientKey} · ${clientName}`);
    continue;
  }
  seenKeys.add(clientKey);
  packs.push({
    clientKey,
    clientName,
    contactId: matched.contact_id,
    funder,
    bucket,
    weekly,
    dayCentre,
    totals,
    clientId: pickClientId(data),
    po: pickPo(data),
  });
}

console.log(`\nPacks to schedule: ${packs.length}`);
for (const p of packs) {
  console.log(
    `${p.bucket.padEnd(6)} ${p.clientKey.padEnd(14)} ${p.clientName.padEnd(22)} ${p.contactId.padEnd(20)} Y£${p.totals.annual} · ${p.funder}`,
  );
}

type Job = {
  pack: Pack;
  kind: "year" | "term" | "month";
  term: "autumn" | "spring" | "summer" | null;
  label: string;
  amount: number;
  dueIso: string;
  monthYm: string | null;
  marker: string;
};

const jobs: Job[] = [];
for (const p of packs) {
  if (p.bucket === "nhs") {
    const amounts = splitEqualAcrossMonths(p.totals.annual, MONTHS_11.length);
    for (let i = 0; i < MONTHS_11.length; i++) {
      const m = MONTHS_11[i];
      const amount = amounts[i] || 0;
      if (amount <= 0) continue;
      jobs.push({
        pack: p,
        kind: "month",
        term: m.term,
        label: m.label,
        amount,
        dueIso: m.dueIso,
        monthYm: m.ym,
        marker: `${READY_ROOT}_nhs_month_${m.ym}_${p.clientKey}`,
      });
    }
  } else if (p.bucket === "ealing") {
    jobs.push({
      pack: p,
      kind: "year",
      term: null,
      label: `Academic year ${REENROL_ACADEMIC_YEAR.replace("-", "/")}`,
      amount: p.totals.annual,
      dueIso: "2026-09-01",
      monthYm: null,
      marker: `${READY_ROOT}_ealing_year_${p.clientKey}`,
    });
  } else if (p.bucket === "hf") {
    for (const t of TERMS) {
      const amount = p.totals[t.term];
      if (amount <= 0) continue;
      jobs.push({
        pack: p,
        kind: "term",
        term: t.term,
        label: t.label,
        amount,
        dueIso: t.dueIso,
        monthYm: null,
        marker: `${READY_ROOT}_hf_term_${t.term}_${p.clientKey}`,
      });
    }
    const amounts = splitEqualAcrossMonths(p.totals.annual, MONTHS_11.length);
    for (let i = 0; i < MONTHS_11.length; i++) {
      const m = MONTHS_11[i];
      const amount = amounts[i] || 0;
      if (amount <= 0) continue;
      jobs.push({
        pack: p,
        kind: "month",
        term: m.term,
        label: m.label,
        amount,
        dueIso: m.dueIso,
        monthYm: m.ym,
        marker: `${READY_ROOT}_hf_month_${m.ym}_${p.clientKey}`,
      });
    }
  }
}

console.log(`\nJobs: ${jobs.length}`);
const byBucket = { nhs: 0, ealing: 0, hf: 0 } as Record<string, number>;
for (const j of jobs) byBucket[j.pack.bucket] = (byBucket[j.pack.bucket] || 0) + 1;
console.log(byBucket);

if (!APPLY) {
  console.log("\nDry run — re-run with APPLY=1 to void superseded Autumn stubs and create INV-Ps.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");
const productMap = await loadProductMap(admin);

/** Void prior office Autumn-only stubs that this schedule replaces. */
const voidMarkers: string[] = [];
for (const p of packs) {
  voidMarkers.push(`office_la_nhs_autumn_2627_${p.clientKey}`);
  if (p.bucket === "ealing" || p.bucket === "nhs") {
    // Replace single Autumn with year / monthly set.
  }
}
const { data: toVoid } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, ready_by, contact_id, amount_gbp")
  .in("ready_by", voidMarkers)
  .neq("payment_status", "void");

for (const row of toVoid || []) {
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      updated_at: new Date().toISOString(),
      notes: clean(
        `${row.ready_by || ""} · voided — superseded by ${READY_ROOT} schedule`,
        800,
      ),
    })
    .eq("id", row.id);
  if (error) console.error("void fail", row.invoice_number, error.message);
  else console.log("VOID", row.invoice_number, row.ready_by, `£${row.amount_gbp}`);
}

const { data: existingShares } = await admin
  .from("portal_parent_invoice_share")
  .select("id, ready_by, invoice_number, payment_status")
  .like("ready_by", `${READY_ROOT}%`)
  .neq("payment_status", "void");
const existingByMarker = new Set(
  (existingShares || []).map((s) => clean(s.ready_by, 160)).filter(Boolean),
);

// Also treat old autumn HF term as covering hf_term_autumn (already voided above for all packs).
// For HF we voided autumn stub — recreate autumn via hf_term_autumn marker.

let created = 0;
let skipped = 0;
let failed = 0;

for (const job of jobs) {
  if (existingByMarker.has(job.marker)) {
    skipped += 1;
    continue;
  }

  const p = job.pack;
  const weeklyChoices: Record<string, { choice: string }> = {};
  for (const slot of p.weekly) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }
  for (const slot of p.dayCentre) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }

  let lineItems: PortalInvoiceLineItem[] = [];
  if (job.kind === "month" && job.monthYm) {
    const allSlots = [...p.weekly, ...p.dayCentre];
    lineItems = buildReenrolMonthlyLineItems({
      slots: allSlots,
      weeklyChoices,
      monthYm: job.monthYm,
      monthAmountGbp: job.amount,
      vatMode: "exempt",
      productMap,
    });
    if (!lineItems.length) {
      lineItems = fallbackLine(
        "Funded provision",
        job.amount,
        `${job.label} · ${REENROL_ACADEMIC_YEAR}`,
      );
    }
  } else if (job.kind === "term" && job.term) {
    lineItems = buildReenrolTermLineItems({
      slots: p.weekly,
      weeklyChoices,
      term: job.term,
      vatMode: "exempt",
      productMap,
    });
    lineItems = lineItems.concat(dayCentreTermLines(p.dayCentre, job.term));
    if (!lineItems.length) {
      lineItems = fallbackLine(
        "Funded provision",
        job.amount,
        `${job.label} · ${REENROL_ACADEMIC_YEAR}`,
      );
    }
  } else if (job.kind === "year") {
    for (const t of ["autumn", "spring", "summer"] as const) {
      lineItems = lineItems.concat(
        buildReenrolTermLineItems({
          slots: p.weekly,
          weeklyChoices,
          term: t,
          vatMode: "exempt",
          productMap,
        }),
      );
      lineItems = lineItems.concat(dayCentreTermLines(p.dayCentre, t));
    }
    // Scale / replace with single annual amount if line sum drifts.
    const sum = round2(lineItems.reduce((s, li) => s + num(li.amount_gbp), 0));
    if (!lineItems.length || Math.abs(sum - job.amount) > 0.05) {
      lineItems = fallbackLine(
        "Funded provision · full academic year",
        job.amount,
        `Year ${REENROL_ACADEMIC_YEAR.replace("-", "/")} · ${p.funder}`,
      );
    }
  }

  const amountFromLines = round2(
    lineItems.reduce((s, li) => s + num(li.amount_gbp), 0),
  );
  const amountGbp = amountFromLines > 0 ? amountFromLines : job.amount;
  const description = lineItemsToDescription(lineItems, { fundedProvision: true });
  const scheduleTag =
    job.kind === "month"
      ? "schedule:monthly_11"
      : job.kind === "term"
      ? "schedule:term_3"
      : "schedule:year_1";

  const createdInv = await createPortalFamilyInvoice(admin, {
    contactId: p.contactId,
    amountGbp,
    dueDateIso: job.dueIso,
    invoiceDateIso: "2026-07-29",
    vatMode: "exempt",
    lineDescription: description,
    reference: job.label,
    service: p.dayCentre.length && !p.weekly.length
      ? "Day Centre · funded"
      : "Afterschools / weekends · funded",
    notes:
      `${job.marker} · ${scheduleTag} · ${p.funder} · ${p.clientKey} · ` +
      `${p.clientName} · office funder INV-P for email/download · not shown to parents`,
    title: `Invoice — ${p.clientName} · ${job.label}`,
    shareStatus: "ready",
    paymentMethodHint: "la_funded",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: job.marker,
    billingTerm: job.term,
    clientIdLabel: p.clientId || null,
    poLabel: p.po || null,
    quantity: lineItems.reduce((s, li) => s + (num(li.quantity) || 1), 0) || 1,
    paymentSchedule: [
      {
        seq: 1,
        label: `${job.label} · funder invoice`,
        due_date: job.dueIso,
        amount_gbp: amountGbp,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems,
  });

  if (!createdInv.ok) {
    failed += 1;
    console.error("FAIL", job.marker, createdInv.error);
    continue;
  }
  created += 1;
  existingByMarker.add(job.marker);
  console.log(
    `CREATED ${createdInv.invoiceNumber} · ${p.bucket} · ${job.kind} · ${job.label} · ${p.clientName} · £${amountGbp.toFixed(2)}`,
  );
}

console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
