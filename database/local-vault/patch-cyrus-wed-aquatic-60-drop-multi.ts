/**
 * Cyrus / Olivia: drop Wed Multi-Activity; Wed Aquatic 30' (4-4.30) → 60' (4-5).
 * Updates portal service lines, client_payments, reenrol slots, INV-P-0018..0027,
 * regenerates PDFs, cancels pending GoCardless payments and reschedules new amounts.
 *
 * Mandate MD003YF573MVXR stays — no new mandate needed.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read \
 *     database/local-vault/patch-cyrus-wed-aquatic-60-drop-multi.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  gocardlessCreatePayment,
  gocardlessChargeDate,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "79";
const MANDATE_ID = "MD003YF573MVXR";
const CLIENT_KEY = "cyrus";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(i >= 0 ? 0 : 0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const money = (n: number) => Math.round(n * 100) / 100;

/** Autumn Wed dates (same as old 30' aquatic / Wed multi). */
const AUTUMN_WED =
  "Dates: 9, 16, 23, 30 Sept; 7, 14, 21 Oct; 4, 11, 18, 25 Nov; 2, 9, 16 Dec";
const AUTUMN_THU =
  "Dates: 10, 17, 24 Sept; 1, 8, 15, 22 Oct; 5, 12, 19, 26 Nov; 3, 10, 17 Dec";
const AUTUMN_SUN =
  "Dates: 6, 13, 20, 27 Sept; 4, 11, 18 Oct; 8, 15, 22, 29 Nov; 6, 13 Dec";
const SPRING_WED =
  "Dates: 6, 13, 20, 27 Jan; 3, 10, 24 Feb; 3, 10, 17, 24 Mar";
const SPRING_THU =
  "Dates: 7, 14, 21, 28 Jan; 4, 11, 25 Feb; 4, 11, 18, 25 Mar";
const SPRING_SUN =
  "Dates: 10, 17, 24, 31 Jan; 7, 28 Feb; 7, 14, 21 Mar";
const SUMMER_WED =
  "Dates: 21, 28 Apr; 5, 12, 19, 26 May; 9, 16, 23, 30 Jun; 7, 14, 21 Jul";
const SUMMER_THU =
  "Dates: 22, 29 Apr; 6, 13, 20, 27 May; 10, 17, 24 Jun; 1, 8, 15, 22 Jul";
const SUMMER_SUN =
  "Dates: 18, 25 Apr; 2, 9, 16, 23 May; 13, 20, 27 Jun; 4, 11 Jul";

const AQ_DETAIL = "Wednesday 4 to 5 pm · Acton";
const BESPOKE_DETAIL = "Thursday 3.30 to 5 pm · SwimFarm";
const SUN_MULTI_DETAIL = "Sunday 11 am to 12.30 pm · SwimFarm";
const BESPOKE_DESC = "90' Bespoke Programme - 3.30 to 5 pm, Thursdays (SwimFarm)";

type SchedRow = {
  seq: number;
  label: string;
  due_date: string;
  amount_gbp: number;
  status: string;
  paid_at: null;
  paid_via: null;
};

function autumnTermLines(): PortalInvoiceLineItem[] {
  return [
    {
      service_key: "AQUATIC_60",
      description: "Aquatic Activity 60'",
      detail: AQ_DETAIL,
      dates: AUTUMN_WED,
      quantity: 14,
      unit_price_gbp: 100,
      amount_gbp: 1400,
      xero_item_code: "SW",
    },
    {
      service_key: "BESPOKE_90",
      description: BESPOKE_DESC,
      detail: BESPOKE_DETAIL,
      dates: AUTUMN_THU,
      quantity: 14,
      unit_price_gbp: 187.5,
      amount_gbp: 2625,
      xero_item_code: null,
    },
    {
      service_key: "MULTI_90",
      description: "Multi-Activity 90'",
      detail: SUN_MULTI_DETAIL,
      dates: AUTUMN_SUN,
      quantity: 13,
      unit_price_gbp: 120,
      amount_gbp: 1560,
      xero_item_code: "SC",
    },
    {
      service_key: "GC_FEE",
      description: "Admin fee",
      detail: null,
      dates: null,
      quantity: 4,
      unit_price_gbp: 1.5,
      amount_gbp: 6,
      xero_item_code: "GC1",
    },
    {
      service_key: "CREDIT",
      description: "Credits",
      detail: null,
      dates: null,
      quantity: 1,
      unit_price_gbp: -90,
      amount_gbp: -90,
      xero_item_code: null,
    },
  ];
}

function springTermLines(): PortalInvoiceLineItem[] {
  return [
    {
      service_key: "AQUATIC_60",
      description: "Aquatic Activity 60'",
      detail: AQ_DETAIL,
      dates: SPRING_WED,
      quantity: 11,
      unit_price_gbp: 100,
      amount_gbp: 1100,
      xero_item_code: "SW",
    },
    {
      service_key: "BESPOKE_90",
      description: BESPOKE_DESC,
      detail: BESPOKE_DETAIL,
      dates: SPRING_THU,
      quantity: 11,
      unit_price_gbp: 187.5,
      amount_gbp: 2062.5,
      xero_item_code: null,
    },
    {
      service_key: "MULTI_90",
      description: "Multi-Activity 90'",
      detail: SUN_MULTI_DETAIL,
      dates: SPRING_SUN,
      quantity: 9,
      unit_price_gbp: 120,
      amount_gbp: 1080,
      xero_item_code: "SC",
    },
    {
      service_key: "GC_FEE",
      description: "Admin fee",
      detail: null,
      dates: null,
      quantity: 3,
      unit_price_gbp: 1.5,
      amount_gbp: 4.5,
      xero_item_code: "GC1",
    },
  ];
}

function summerTermLines(): PortalInvoiceLineItem[] {
  return [
    {
      service_key: "AQUATIC_60",
      description: "Aquatic Activity 60'",
      detail: AQ_DETAIL,
      dates: SUMMER_WED,
      quantity: 13,
      unit_price_gbp: 100,
      amount_gbp: 1300,
      xero_item_code: "SW",
    },
    {
      service_key: "BESPOKE_90",
      description: BESPOKE_DESC,
      detail: BESPOKE_DETAIL,
      dates: SUMMER_THU,
      quantity: 13,
      unit_price_gbp: 187.5,
      amount_gbp: 2437.5,
      xero_item_code: null,
    },
    {
      service_key: "MULTI_90",
      description: "Multi-Activity 90'",
      detail: SUN_MULTI_DETAIL,
      dates: SUMMER_SUN,
      quantity: 11,
      unit_price_gbp: 120,
      amount_gbp: 1320,
      xero_item_code: "SC",
    },
    {
      service_key: "GC_FEE",
      description: "Admin fee",
      detail: null,
      dates: null,
      quantity: 3,
      unit_price_gbp: 1.5,
      amount_gbp: 4.5,
      xero_item_code: "GC1",
    },
  ];
}

function monthlyLines(input: {
  aqQty: number;
  aqUnit: number;
  aqAmt: number;
  bespokeQty: number;
  bespokeUnit: number;
  bespokeAmt: number;
  multiQty: number;
  multiUnit: number;
  multiAmt: number;
}): PortalInvoiceLineItem[] {
  return [
    {
      service_key: "AQUATIC_60",
      description: "Aquatic Activity 60'",
      detail: AQ_DETAIL,
      quantity: input.aqQty,
      unit_price_gbp: input.aqUnit,
      amount_gbp: input.aqAmt,
      xero_item_code: "SW",
    },
    {
      service_key: "BESPOKE_90",
      description: BESPOKE_DESC,
      detail: BESPOKE_DETAIL,
      quantity: input.bespokeQty,
      unit_price_gbp: input.bespokeUnit,
      amount_gbp: input.bespokeAmt,
      xero_item_code: null,
    },
    {
      service_key: "MULTI_90",
      description: "Multi-Activity 90'",
      detail: SUN_MULTI_DETAIL,
      quantity: input.multiQty,
      unit_price_gbp: input.multiUnit,
      amount_gbp: input.multiAmt,
      xero_item_code: "SC",
    },
    {
      service_key: "GC_FEE",
      description: "Direct Payment (GoCardless) fee",
      detail: null,
      quantity: 1,
      unit_price_gbp: 1.5,
      amount_gbp: 1.5,
      xero_item_code: null,
    },
  ];
}

const AUTUMN_TERM = 5501; // 1400+2625+1560+6-90
const AUTUMN_MONTH = 1397.75; // (5501+90)/4
const AUTUMN_P1 = money(AUTUMN_MONTH - 90); // 1307.75
const SPRING_TERM = 4247; // 1100+2062.5+1080+4.5
const SPRING_P = [1415.66, 1415.67, 1415.67] as const;
const SUMMER_TERM = 5062; // 1300+2437.5+1320+4.5
const SUMMER_P = [1687.34, 1687.33, 1687.33] as const;

const autumnSched: SchedRow[] = [
  {
    seq: 1,
    label: "Payment 1 · September 2026 (Autumn)",
    due_date: "2026-09-01",
    amount_gbp: AUTUMN_P1,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 2,
    label: "Payment 2 · October 2026 (Autumn)",
    due_date: "2026-10-01",
    amount_gbp: AUTUMN_MONTH,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 3,
    label: "Payment 3 · November 2026 (Autumn)",
    due_date: "2026-11-01",
    amount_gbp: AUTUMN_MONTH,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 4,
    label: "Payment 4 · December 2026 (Autumn)",
    due_date: "2026-12-01",
    amount_gbp: AUTUMN_MONTH,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const springSched: SchedRow[] = [
  {
    seq: 1,
    label: "Payment 5 · January 2027 (Spring)",
    due_date: "2027-01-01",
    amount_gbp: SPRING_P[0],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 2,
    label: "Payment 6 · February 2027 (Spring)",
    due_date: "2027-02-01",
    amount_gbp: SPRING_P[1],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 3,
    label: "Payment 7 · March 2027 (Spring)",
    due_date: "2027-03-01",
    amount_gbp: SPRING_P[2],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const summerSched: SchedRow[] = [
  {
    seq: 1,
    label: "Payment 8 · April 2027 (Summer)",
    due_date: "2027-04-01",
    amount_gbp: SUMMER_P[0],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 2,
    label: "Payment 9 · May 2027 (Summer)",
    due_date: "2027-05-01",
    amount_gbp: SUMMER_P[1],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 3,
    label: "Payment 10 · June 2027 (Summer)",
    due_date: "2027-06-01",
    amount_gbp: SUMMER_P[2],
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

type InvPatch = {
  invoice_number: string;
  amount_gbp: number;
  line_items: PortalInvoiceLineItem[];
  payment_schedule: SchedRow[] | [];
  /** Amount to schedule on GoCardless (first instalment for term packs). */
  gc_charge_gbp: number;
  due_date: string;
};

const patches: InvPatch[] = [
  {
    invoice_number: "INV-P-0018",
    amount_gbp: AUTUMN_TERM,
    line_items: autumnTermLines(),
    payment_schedule: autumnSched,
    gc_charge_gbp: AUTUMN_P1,
    due_date: "2026-09-01",
  },
  {
    invoice_number: "INV-P-0019",
    amount_gbp: AUTUMN_MONTH,
    line_items: monthlyLines({
      aqQty: 3.5,
      aqUnit: 100,
      aqAmt: 350,
      bespokeQty: 3.5,
      bespokeUnit: 187.5,
      bespokeAmt: 656.25,
      multiQty: 3.25,
      multiUnit: 120,
      multiAmt: 390,
    }),
    payment_schedule: [],
    gc_charge_gbp: AUTUMN_MONTH,
    due_date: "2026-10-01",
  },
  {
    invoice_number: "INV-P-0020",
    amount_gbp: AUTUMN_MONTH,
    line_items: monthlyLines({
      aqQty: 3.5,
      aqUnit: 100,
      aqAmt: 350,
      bespokeQty: 3.5,
      bespokeUnit: 187.5,
      bespokeAmt: 656.25,
      multiQty: 3.25,
      multiUnit: 120,
      multiAmt: 390,
    }),
    payment_schedule: [],
    gc_charge_gbp: AUTUMN_MONTH,
    due_date: "2026-11-01",
  },
  {
    invoice_number: "INV-P-0021",
    amount_gbp: AUTUMN_MONTH,
    line_items: monthlyLines({
      aqQty: 3.5,
      aqUnit: 100,
      aqAmt: 350,
      bespokeQty: 3.5,
      bespokeUnit: 187.5,
      bespokeAmt: 656.25,
      multiQty: 3.25,
      multiUnit: 120,
      multiAmt: 390,
    }),
    payment_schedule: [],
    gc_charge_gbp: AUTUMN_MONTH,
    due_date: "2026-12-01",
  },
  {
    invoice_number: "INV-P-0022",
    amount_gbp: SPRING_TERM,
    line_items: springTermLines(),
    payment_schedule: springSched,
    gc_charge_gbp: SPRING_P[0],
    due_date: "2027-01-01",
  },
  {
    invoice_number: "INV-P-0023",
    amount_gbp: SPRING_P[1],
    line_items: monthlyLines({
      aqQty: 3.67,
      aqUnit: money(366.67 / 3.67),
      aqAmt: 366.67,
      bespokeQty: 3.67,
      bespokeUnit: money(687.5 / 3.67),
      bespokeAmt: 687.5,
      multiQty: 3,
      multiUnit: 120,
      multiAmt: 360,
    }),
    payment_schedule: [],
    gc_charge_gbp: SPRING_P[1],
    due_date: "2027-02-01",
  },
  {
    invoice_number: "INV-P-0024",
    amount_gbp: SPRING_P[2],
    line_items: monthlyLines({
      aqQty: 3.67,
      aqUnit: money(366.67 / 3.67),
      aqAmt: 366.67,
      bespokeQty: 3.67,
      bespokeUnit: money(687.5 / 3.67),
      bespokeAmt: 687.5,
      multiQty: 3,
      multiUnit: 120,
      multiAmt: 360,
    }),
    payment_schedule: [],
    gc_charge_gbp: SPRING_P[2],
    due_date: "2027-03-01",
  },
  {
    invoice_number: "INV-P-0025",
    amount_gbp: SUMMER_TERM,
    line_items: summerTermLines(),
    payment_schedule: summerSched,
    gc_charge_gbp: SUMMER_P[0],
    due_date: "2027-04-01",
  },
  {
    invoice_number: "INV-P-0026",
    amount_gbp: SUMMER_P[1],
    line_items: monthlyLines({
      aqQty: 4.33,
      aqUnit: money(433.33 / 4.33),
      aqAmt: 433.33,
      bespokeQty: 4.33,
      bespokeUnit: money(812.5 / 4.33),
      bespokeAmt: 812.5,
      multiQty: money(11 / 3),
      multiUnit: 120,
      multiAmt: 440,
    }),
    payment_schedule: [],
    gc_charge_gbp: SUMMER_P[1],
    due_date: "2027-05-01",
  },
  {
    invoice_number: "INV-P-0027",
    amount_gbp: SUMMER_P[2],
    line_items: monthlyLines({
      aqQty: 4.33,
      aqUnit: money(433.33 / 4.33),
      aqAmt: 433.33,
      bespokeQty: 4.33,
      bespokeUnit: money(812.5 / 4.33),
      bespokeAmt: 812.5,
      multiQty: money(11 / 3),
      multiUnit: 120,
      multiAmt: 440,
    }),
    payment_schedule: [],
    gc_charge_gbp: SUMMER_P[2],
    due_date: "2027-06-01",
  },
];

/* Fix spring P5 monthly sibling lines to sum to 1415.66 (term first instalment). */
patches[4] = {
  ...patches[4],
};
/* INV-P-0022 is term — ok. Adjust 0023/0024 already at 1415.67.
   Summer monthly: 433.33+812.5+440+1.5 = 1687.33 ✓ */

function sumLines(lines: PortalInvoiceLineItem[]): number {
  return money(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
}

for (const p of patches) {
  const s = sumLines(p.line_items);
  if (s !== p.amount_gbp) {
    console.error(`SUM MISMATCH ${p.invoice_number}: lines=${s} amount=${p.amount_gbp}`);
    Deno.exit(1);
  }
}

console.log("Plan amounts:");
for (const p of patches) {
  console.log(
    `  ${p.invoice_number}: £${p.amount_gbp} · GC charge £${p.gc_charge_gbp} · due ${p.due_date}`,
  );
}

async function cancelGcPayment(paymentId: string): Promise<{ ok: boolean; detail?: string }> {
  const res = await gocardlessRequest(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/actions/cancel`,
    {},
  );
  if (!res.ok) {
    /* already cancelled is fine */
    if (/already.?cancelled|cancellation_failed/i.test(String(res.detail || ""))) {
      return { ok: true, detail: res.detail };
    }
    return { ok: false, detail: res.detail || res.error };
  }
  return { ok: true };
}

const newSessions = [
  {
    day: "Wednesday",
    durationMin: 60,
    service: "Aquatic Activity",
    timeSlot: "4 to 5",
  },
  {
    day: "Thursday",
    durationMin: 90,
    service: "Bespoke Programme",
    timeSlot: "3.30 to 5",
  },
  {
    day: "Sunday",
    durationMin: 90,
    service: "Multi-Activity",
    timeSlot: "Activity - Activity, Sunday - 11 to 12.30",
  },
];

const newServicesText =
  "90' Multi-Activity · 90' Bespoke Programme, Thursday - 3.30 pm to 5 pm · 60' Aquatic Activity, Wednesday - 4 pm to 5 pm";

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1 to write DB + cancel/reschedule GC + regen PDFs.");
  Deno.exit(0);
}

/* ---- portal_participant_service_lines ---- */
{
  const { data: sl, error } = await admin
    .from("portal_participant_service_lines")
    .select("id, sessions, services_count")
    .eq("client_key", CLIENT_KEY)
    .maybeSingle();
  if (error) {
    console.error("service_lines read", error.message);
    Deno.exit(1);
  }
  if (sl?.id) {
    const { error: up } = await admin
      .from("portal_participant_service_lines")
      .update({
        sessions: newSessions,
        services_count: newSessions.length,
        updated_at: new Date().toISOString(),
        source: "office_cyrus_wed_aq60",
      })
      .eq("id", sl.id);
    if (up) {
      console.error("service_lines update", up.message);
      Deno.exit(1);
    }
    console.log("service_lines updated", sl.id);
  } else {
    console.warn("no service_lines row for cyrus");
  }
}

/* ---- client_payments ---- */
{
  const { data: rows, error } = await admin
    .from("client_payments")
    .select("id, data, amount")
    .eq("client_key", CLIENT_KEY);
  if (error) {
    console.error("client_payments", error.message);
    Deno.exit(1);
  }
  for (const row of rows || []) {
    const data = { ...(row.data as Record<string, unknown> || {}) };
    data.Services = newServicesText;
    data["Cost / session"] = "120 · 100 · 90";
    data.Notes = String(data.Notes || "").replace(
      /attends 3 other services with club\.?/i,
      "Wed Aquatic 60' 4-5 (no Wed Multi); Sun Multi + Thu Bespoke.",
    );
    if (!/Wed Aquatic 60/i.test(String(data.Notes || ""))) {
      data.Notes = `${String(data.Notes || "").trim()} Wed Aquatic 60' 4-5 (no Wed Multi).`.trim();
    }
    const { error: up } = await admin
      .from("client_payments")
      .update({ data })
      .eq("id", row.id);
    if (up) {
      console.error("client_payments update", up.message);
      Deno.exit(1);
    }
    console.log("client_payments updated", row.id);
  }
}

/* ---- reenrolment submission slots ---- */
{
  const { data: sub, error } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, payload")
    .eq("participant_contact_id", CONTACT_ID)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("submission read", error.message);
  else if (sub?.payload) {
    const payload = structuredClone(sub.payload) as Record<string, unknown>;
    const slots = Array.isArray(payload.weekly_slots_snapshot)
      ? payload.weekly_slots_snapshot as Array<Record<string, unknown>>
      : [];
    const next: Array<Record<string, unknown>> = [];
    for (const slot of slots) {
      const svc = String(slot.serviceType || slot.service || "");
      const day = String(slot.day || "");
      if (/MULTI/i.test(svc) && /Wednesday/i.test(day)) continue;
      if (/AQUATIC/i.test(svc) && /Wednesday/i.test(day)) {
        next.push({
          ...slot,
          durationMin: 60,
          timeSlot: "4 to 5",
          displayLabel: "60' Aquatic Activity - 4 to 5 pm, Wednesdays (Acton)",
          pricePerSession: 100,
          raw: "60' AQUATIC ACTIVITY (Wednesday)",
          serviceType: "AQUATIC ACTIVITY",
          termTotals: {
            autumn: 1400,
            spring: 1100,
            summer: 1300,
            annual: 3800,
          },
        });
        continue;
      }
      next.push(slot);
    }
    payload.weekly_slots_snapshot = next;
    const { error: up } = await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", sub.id);
    if (up) console.error("submission update", up.message);
    else console.log("reenrol slots updated", sub.id, "→", next.length, "slots");
  }
}

/* ---- invoices + GC + PDF ---- */
for (const p of patches) {
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, gocardless_payment_id, payment_status, vat_mode, due_date",
    )
    .eq("invoice_number", p.invoice_number)
    .eq("contact_id", CONTACT_ID)
    .maybeSingle();
  if (error || !share) {
    console.error("missing invoice", p.invoice_number, error?.message);
    Deno.exit(1);
  }

  const oldPm = share.gocardless_payment_id ? String(share.gocardless_payment_id) : "";
  if (oldPm) {
    const cancelled = await cancelGcPayment(oldPm);
    console.log("GC cancel", p.invoice_number, oldPm, cancelled);
    if (!cancelled.ok) {
      console.error("GC cancel failed — abort", p.invoice_number, cancelled.detail);
      Deno.exit(1);
    }
  }

  const funded = String(share.vat_mode || "") === "exempt";
  const line_description = lineItemsToDescription(p.line_items, { fundedProvision: funded });
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: p.amount_gbp,
      quantity: 1,
      unit_price_gbp: p.amount_gbp,
      line_items: p.line_items,
      line_description,
      payment_schedule: p.payment_schedule,
      gocardless_payment_id: null,
      gocardless_mandate_id: MANDATE_ID,
      payment_method_hint: "gocardless",
      updated_at: now,
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("invoice update", p.invoice_number, upErr.message);
    Deno.exit(1);
  }

  const created = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence: Math.round(p.gc_charge_gbp * 100),
    description: `clubSENsational ${p.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(p.due_date),
    invoiceShareId: String(share.id),
    contactId: CONTACT_ID,
    invoiceNumber: p.invoice_number,
    idempotencyKey: `inv-${share.id}-aq60-v1`,
  });
  if (!created.ok) {
    console.error("GC create failed", p.invoice_number, created.error, created.detail);
    Deno.exit(1);
  }
  const { error: pmErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: created.data.id,
      gocardless_mandate_id: MANDATE_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (pmErr) {
    console.error("GC id write", p.invoice_number, pmErr.message);
    Deno.exit(1);
  }
  console.log(
    "invoice+GC",
    p.invoice_number,
    `£${p.amount_gbp}`,
    "charge",
    `£${p.gc_charge_gbp}`,
    "→",
    created.data.id,
    created.data.charge_date,
  );

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log("pdf", p.invoice_number, pdf);
  if (!pdf?.ok) {
    console.error("pdf failed", p.invoice_number);
    Deno.exit(1);
  }
}

console.log("OK Cyrus package → Wed Aquatic 60' 4-5, no Wed Multi. Mandate unchanged.");
