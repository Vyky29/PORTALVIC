/**
 * Fix funder INV-P sets for Xero / payment tracking (2026/27).
 *
 * Canonical Portal INV-Ps (unpaid, not in Xero until Mark paid):
 *   H&F   → 11 monthly INV-Ps (Sep–Jul) — void term set
 *   Ealing → 1 whole-year INV-P with 12 BACS instalments (Sep–Aug)
 *   NHS   → 1 whole-year INV-P with 11 monthly instalments (Sep–Jul) on schedule
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-schedule-invps-fix.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-schedule-invps-fix.ts
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
import {
  namesMatch,
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import type { InvoicePaymentScheduleRow } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const READY_ROOT = "office_funder_2627";
const YEAR_LABEL = `Academic year ${REENROL_ACADEMIC_YEAR.replace("-", "/")}`;

/** NHS instalments on the year invoice (Sep–Jul). */
const NHS_MONTHS_11: Array<{ label: string; dueIso: string }> = [
  { label: "September 2026", dueIso: "2026-09-01" },
  { label: "October 2026", dueIso: "2026-10-01" },
  { label: "November 2026", dueIso: "2026-11-01" },
  { label: "December 2026", dueIso: "2026-12-01" },
  { label: "January 2027", dueIso: "2027-01-01" },
  { label: "February 2027", dueIso: "2027-02-01" },
  { label: "March 2027", dueIso: "2027-03-01" },
  { label: "April 2027", dueIso: "2027-04-01" },
  { label: "May 2027", dueIso: "2027-05-01" },
  { label: "June 2027", dueIso: "2027-06-01" },
  { label: "July 2027", dueIso: "2027-07-01" },
];

/** Ealing BACS: 38 weeks ÷ 52 → pay across 12 calendar months Sep–Aug. */
const EALING_BACS_12: Array<{ label: string; dueIso: string }> = [
  { label: "BACS September 2026", dueIso: "2026-09-01" },
  { label: "BACS October 2026", dueIso: "2026-10-01" },
  { label: "BACS November 2026", dueIso: "2026-11-01" },
  { label: "BACS December 2026", dueIso: "2026-12-01" },
  { label: "BACS January 2027", dueIso: "2027-01-01" },
  { label: "BACS February 2027", dueIso: "2027-02-01" },
  { label: "BACS March 2027", dueIso: "2027-03-01" },
  { label: "BACS April 2027", dueIso: "2027-04-01" },
  { label: "BACS May 2027", dueIso: "2027-05-01" },
  { label: "BACS June 2027", dueIso: "2027-06-01" },
  { label: "BACS July 2027", dueIso: "2027-07-01" },
  { label: "BACS August 2027", dueIso: "2027-08-01" },
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

type FunderBucket = "nhs" | "ealing" | "hf";

function funderBucket(funder: string): FunderBucket | null {
  const f = funder.toLowerCase();
  if (/nhs/.test(f)) return "nhs";
  if (/ealing/.test(f)) return "ealing";
  if (/h&f|hammersmith|fulham/.test(f)) return "hf";
  return null;
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

function splitEqual(totalGbp: number, n: number): number[] {
  const count = Math.max(1, Math.round(n) || 1);
  const total = round2(totalGbp);
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const per = round2(total / count);
  const out = Array.from({ length: count }, () => per);
  out[count - 1] = round2(total - round2(per * (count - 1)));
  return out;
}

function scheduleRows(
  months: Array<{ label: string; dueIso: string }>,
  totalGbp: number,
): InvoicePaymentScheduleRow[] {
  const amounts = splitEqual(totalGbp, months.length);
  return months.map((m, i) => ({
    seq: i + 1,
    label: m.label,
    due_date: m.dueIso,
    amount_gbp: amounts[i] || 0,
    status: "pending" as const,
    paid_at: null,
    paid_via: null,
  })).filter((r) => r.amount_gbp > 0);
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

function fallbackLine(label: string, amount: number, detail: string): PortalInvoiceLineItem[] {
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
  .select("id, client_key, client_name, data, sheet")
  .eq("sheet", "LA");
if (laErr) throw new Error(laErr.message);

const { data: contacts } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, child_last_name, in_class",
  )
  .eq("in_class", true)
  .limit(500);

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
  if (!bucket) continue;

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

const hf = packs.filter((p) => p.bucket === "hf");
const ealing = packs.filter((p) => p.bucket === "ealing");
const nhs = packs.filter((p) => p.bucket === "nhs");

console.log(`\nPacks HF=${hf.length} Ealing=${ealing.length} NHS=${nhs.length}`);
console.log("Plan:");
console.log("  VOID  ready_by like office_funder_2627_hf_term_%");
console.log("  VOID  ready_by like office_funder_2627_nhs_month_%");
console.log("  VOID  ready_by like office_funder_2627_ealing_year_% (recreate with 12 BACS)");
console.log("  KEEP  H&F monthly office_funder_2627_hf_month_%");
console.log("  CREATE NHS year + Ealing year (12 BACS) if missing");

if (!APPLY) {
  for (const p of [...ealing, ...nhs]) {
    console.log(
      `  WOULD CREATE year · ${p.bucket} · ${p.clientKey} · ${p.clientName} · £${p.totals.annual}`,
    );
  }
  console.log("\nDry run — re-run with APPLY=1");
  Deno.exit(0);
}

async function voidByReadyByPrefix(prefix: string, reason: string) {
  const { data: rows } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, ready_by, amount_gbp")
    .like("ready_by", `${prefix}%`)
    .neq("payment_status", "void");
  let n = 0;
  for (const row of rows || []) {
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        updated_at: new Date().toISOString(),
        notes: clean(`${row.ready_by || ""} · voided — ${reason}`, 800),
      })
      .eq("id", row.id);
    if (error) console.error("void fail", row.invoice_number, error.message);
    else {
      n += 1;
      console.log("VOID", row.invoice_number, row.ready_by, `£${row.amount_gbp}`);
    }
  }
  return n;
}

const voidedTerm = await voidByReadyByPrefix(
  `${READY_ROOT}_hf_term_`,
  "H&F Xero set = monthly only",
);
const voidedNhsMonth = await voidByReadyByPrefix(
  `${READY_ROOT}_nhs_month_`,
  "NHS Xero set = one year invoice + monthly schedule",
);
const voidedEalingYear = await voidByReadyByPrefix(
  `${READY_ROOT}_ealing_year_`,
  "recreate with 12 BACS instalments",
);
// Also void any prior NHS year from a partial run
const voidedNhsYear = await voidByReadyByPrefix(
  `${READY_ROOT}_nhs_year_`,
  "recreate NHS year invoice",
);
console.log(
  `Voided: hf_term=${voidedTerm} nhs_month=${voidedNhsMonth} ealing_year=${voidedEalingYear} nhs_year=${voidedNhsYear}`,
);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");
const productMap = await loadProductMap(admin);

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("ready_by")
  .like("ready_by", `${READY_ROOT}%`)
  .neq("payment_status", "void");
const existingMarkers = new Set(
  (existing || []).map((r) => clean(r.ready_by, 160)).filter(Boolean),
);

async function createYearInvoice(opts: {
  pack: Pack;
  marker: string;
  schedule: InvoicePaymentScheduleRow[];
  scheduleTag: string;
  notesExtra: string;
}) {
  const { pack: p, marker, schedule, scheduleTag, notesExtra } = opts;
  if (existingMarkers.has(marker)) {
    console.log("SKIP exists", marker);
    return;
  }

  const weeklyChoices: Record<string, { choice: string }> = {};
  for (const slot of [...p.weekly, ...p.dayCentre]) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }

  let lineItems: PortalInvoiceLineItem[] = [];
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
  const sum = round2(lineItems.reduce((s, li) => s + num(li.amount_gbp), 0));
  if (!lineItems.length || Math.abs(sum - p.totals.annual) > 0.05) {
    lineItems = fallbackLine(
      "Funded provision · full academic year",
      p.totals.annual,
      `${YEAR_LABEL} · ${p.funder}`,
    );
  }
  const amountGbp = round2(
    lineItems.reduce((s, li) => s + num(li.amount_gbp), 0),
  ) || p.totals.annual;
  const description = lineItemsToDescription(lineItems, { fundedProvision: true });

  const created = await createPortalFamilyInvoice(admin, {
    contactId: p.contactId,
    amountGbp,
    dueDateIso: schedule[0]?.due_date || "2026-09-01",
    invoiceDateIso: "2026-07-29",
    vatMode: "exempt",
    lineDescription: description,
    reference: YEAR_LABEL,
    service: p.dayCentre.length && !p.weekly.length
      ? "Day Centre · funded"
      : "Afterschools / weekends · funded",
    notes:
      `${marker} · ${scheduleTag} · ${p.funder} · ${p.clientKey} · ${p.clientName} · ` +
      `${notesExtra} · la_funded hidden from parents · not in Xero until paid`,
    title: `Invoice — ${p.clientName} · ${YEAR_LABEL}`,
    shareStatus: "ready",
    paymentMethodHint: "la_funded",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: marker,
    billingTerm: null,
    clientIdLabel: p.clientId || null,
    poLabel: p.po || null,
    quantity: lineItems.reduce((s, li) => s + (num(li.quantity) || 1), 0) || 1,
    paymentSchedule: schedule,
    lineItems,
  });
  if (!created.ok) {
    console.error("FAIL", marker, created.error);
    return;
  }
  existingMarkers.add(marker);
  console.log(
    `CREATED ${created.invoiceNumber} · ${p.bucket} year · ${p.clientName} · £${amountGbp.toFixed(2)} · ${schedule.length} instalments`,
  );
}

let created = 0;
for (const p of ealing) {
  const marker = `${READY_ROOT}_ealing_year_${p.clientKey}`;
  const before = existingMarkers.size;
  await createYearInvoice({
    pack: p,
    marker,
    schedule: scheduleRows(EALING_BACS_12, p.totals.annual),
    scheduleTag: "schedule:year_1_bacs_12",
    notesExtra:
      "Ealing whole-year · 12 BACS (38 weeks spread over 52; office allocates each BACS)",
  });
  if (existingMarkers.size > before) created += 1;
}

for (const p of nhs) {
  const marker = `${READY_ROOT}_nhs_year_${p.clientKey}`;
  const before = existingMarkers.size;
  await createYearInvoice({
    pack: p,
    marker,
    schedule: scheduleRows(NHS_MONTHS_11, p.totals.annual),
    scheduleTag: "schedule:year_1_monthly_11",
    notesExtra:
      "NHS whole-year · 11 monthly instalments Sep–Jul on schedule (one INV-P for Xero)",
  });
  if (existingMarkers.size > before) created += 1;
}

// Confirm H&F monthly still present
const { count: hfMonthCount } = await admin
  .from("portal_parent_invoice_share")
  .select("id", { count: "exact", head: true })
  .like("ready_by", `${READY_ROOT}_hf_month_%`)
  .neq("payment_status", "void");

console.log(`\nDone. year_created=${created} · H&F monthly still live=${hfMonthCount}`);
console.log(
  "Xero: still none until Mark paid. Partial BACS/monthly → apply against year schedule.",
);
