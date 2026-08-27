/**
 * Rebuild Sept 2026 NHS Day Centre INV-Ps from XXPRASHERV1 sheet (photo)
 * with +2.03% service uplift from Sep (office-nhs-uplift-2pct-from-sep).
 *
 * Photo (old rates) → uplifted:
 *   Fadi    22 × £647.50 → 22 × £660.6943 = £14,535.27
 *   Ikram   19 × £750.00 → 19 × £765.2250 = £14,539.28
 *   Emanuel 14 × £500.00 → 14 × £510.1500 = £7,142.10
 *   Timi     8 × £350.00 →  8 × £357.1050 = £2,856.84
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-nhs-sep2026-photo-uplift.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const UPLIFT = 1.0203;

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
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function addDays(iso0: string, n: number): string {
  const [y, m, d] = iso0.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function dow(iso0: string): number {
  const [y, m, d] = iso0.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
const DOW_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Day Centre open Sep 2026 (from 1 Sept). */
function septDatesForDows(want: number[]): string[] {
  const out: string[] = [];
  let c = "2026-09-01";
  while (c <= "2026-09-30") {
    if (want.includes(dow(c))) out.push(c);
    c = addDays(c, 1);
  }
  return out;
}
function formatDates(isos: string[]): string {
  const days = isos.map((x) => String(Number(x.slice(8))));
  return `Dates: ${days.join(", ")} Sept`;
}

type DayLine = {
  dow: number;
  detailExtra: string;
  serviceKey: string;
  description: string;
};

type Plan = {
  invoice: string;
  label: string;
  oldRate: number;
  photoDays: number;
  dayLines: DayLine[];
};

const plans: Plan[] = [
  {
    invoice: "INV-P-0235",
    label: "Fadi · 2:1 Bespoke 2h30' MTWTF",
    oldRate: 647.5,
    photoDays: 22,
    dayLines: [1, 2, 3, 4, 5].map((d) => ({
      dow: d,
      detailExtra: "SwimFarm · 2:1 Bespoke 2h30'",
      serviceKey: "DAY_CENTRE_150",
      description: "Day Centre / Bespoke 2h30' (2:1)",
    })),
  },
  {
    invoice: "INV-P-0271",
    label: "Ikram · 2:1 Day Centre 5h MTWF",
    oldRate: 750,
    photoDays: 19,
    dayLines: [1, 2, 3, 5].map((d) => ({
      dow: d,
      detailExtra: "SwimFarm · 11:00–16:00 · 2:1",
      serviceKey: "DAY_CENTRE_300",
      description: "Day Centre 5h (2:1)",
    })),
  },
  {
    invoice: "INV-P-0260",
    label: "Emanuel · 1:1 Day Centre 5h MWF",
    oldRate: 500,
    photoDays: 14,
    dayLines: [1, 3, 5].map((d) => ({
      dow: d,
      detailExtra: "SwimFarm · 11:00–16:00 · 1:1",
      serviceKey: "DAY_CENTRE_300",
      description: "Day Centre 5h (1:1)",
    })),
  },
  {
    invoice: "INV-P-0168",
    label: "Timi · 2:1 Day Centre 2h MF",
    oldRate: 350,
    photoDays: 8,
    dayLines: [1, 5].map((d) => ({
      dow: d,
      detailExtra: "SwimFarm · 11:00–13:00 · 2:1",
      serviceKey: "DAY_CENTRE_120",
      description: "Day Centre 2h (2:1)",
    })),
  },
];

type Built = {
  invoice: string;
  label: string;
  oldRate: number;
  newRate: number;
  photoDays: number;
  calendarDays: number;
  total: number;
  lineItems: PortalInvoiceLineItem[];
};

const built: Built[] = [];

for (const p of plans) {
  const newRate = round4(p.oldRate * UPLIFT);
  const total = round2(p.photoDays * newRate);

  // Calendar dates per weekday
  const buckets = p.dayLines.map((dl) => {
    const dates = septDatesForDows([dl.dow]);
    return { ...dl, dates };
  });
  const calendarDays = buckets.reduce((s, b) => s + b.dates.length, 0);

  // Allocate photoDays across weekdays in calendar proportion; residual on largest bucket
  const lineItems: PortalInvoiceLineItem[] = [];
  let qtyLeft = p.photoDays;
  const sortedIdx = buckets
    .map((b, i) => ({ i, n: b.dates.length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.i);

  const qtys = buckets.map(() => 0);
  // First pass: give each weekday its calendar count (capped)
  for (let i = 0; i < buckets.length; i++) {
    const give = Math.min(buckets[i].dates.length, qtyLeft);
    qtys[i] = give;
    qtyLeft -= give;
  }
  // Remainder (photo > calendar): pile onto Monday (or first)
  if (qtyLeft > 0) {
    qtys[sortedIdx[0] ?? 0] += qtyLeft;
    qtyLeft = 0;
  }
  // If photo < calendar (shouldn't), shrink from end
  let over = qtys.reduce((s, q) => s + q, 0) - p.photoDays;
  for (let k = buckets.length - 1; k >= 0 && over > 0; k--) {
    const cut = Math.min(qtys[k], over);
    qtys[k] -= cut;
    over -= cut;
  }

  let allocated = 0;
  for (let i = 0; i < buckets.length; i++) {
    const q = qtys[i];
    if (q <= 0) continue;
    const b = buckets[i];
    const datesIso = b.dates.slice(0, Math.min(q, b.dates.length));
    // If qty > calendar dates for this dow, still show calendar dates available
    const datesLabel = formatDates(b.dates.length ? b.dates : datesIso);
    const isLast = i === buckets.length - 1 || qtys.slice(i + 1).every((x) => x <= 0);
    const amount = isLast ? round2(total - allocated) : round2(q * newRate);
    allocated = round2(allocated + amount);
    lineItems.push({
      service_key: b.serviceKey,
      description: b.description,
      detail: `${DOW_NAME[b.dow]} · ${b.detailExtra}`,
      dates: datesLabel,
      quantity: q,
      unit_price_gbp: newRate,
      amount_gbp: amount,
      xero_item_code: null,
    });
  }

  built.push({
    invoice: p.invoice,
    label: p.label,
    oldRate: p.oldRate,
    newRate,
    photoDays: p.photoDays,
    calendarDays,
    total,
    lineItems,
  });
}

console.log(`\nSept 2026 NHS · sheet days × rate × ${UPLIFT} (+2.03% uplift)\n`);
for (const b of built) {
  console.log(
    `${b.invoice} ${b.label}\n  ${b.photoDays} × £${b.oldRate} → £${b.newRate} = £${b.total}` +
      ` (calendar M/… days ${b.calendarDays})`,
  );
  for (const l of b.lineItems) {
    console.log(`    ${l.detail}: ${l.quantity} · ${l.dates} · £${l.amount_gbp}`);
  }
}

if (!APPLY) {
  console.log("\nDry run — re-run with APPLY=1");
  Deno.exit(0);
}

for (const b of built) {
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, notes, payment_schedule")
    .eq("invoice_number", b.invoice)
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${b.invoice} not found`);

  const description = lineItemsToDescription(b.lineItems, { fundedProvision: true });
  const schedule = [
    {
      seq: 1,
      label: `September 2026 · NHS invoice`,
      due_date: "2026-09-01",
      amount_gbp: b.total,
      status: "pending",
      paid_at: null,
      paid_via: null,
    },
  ];
  const noteExtra =
    ` · rebuilt sheet days×uplift ${b.photoDays}×£${b.oldRate}×${UPLIFT}=£${b.total} (nhs_service_uplift_2.03pct_from_sep2026)`;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: b.total,
      amount_paid_gbp: 0,
      quantity: b.photoDays,
      unit_price_gbp: b.newRate,
      line_items: b.lineItems,
      line_description: description,
      payment_schedule: schedule,
      notes: String(share.notes || "").replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "") + noteExtra,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) throw upErr;

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(`UPDATED ${b.invoice} £${b.total}`, pdf);
}

console.log("\nDone.");
