/**
 * Fadi / Ikram / Timi — NHS monthly INV-Ps Sep 2026–Jul 2027
 * Align to Day Centre calendar (open 1 Sept, closed Christmas + Easter only).
 * No afterschools half-term gaps. Rate = old × 1.0203 uplift.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-dc-calendar-uplift-fadi-ikram-timi.ts
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
function closed(iso0: string): boolean {
  if (iso0 < "2026-09-01" || iso0 > "2027-07-30") return true;
  if (iso0 >= "2026-12-19" && iso0 <= "2027-01-03") return true;
  if (iso0 >= "2027-03-26" && iso0 <= "2027-04-11") return true;
  return false;
}

const DOW_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

const MONTH_META: Array<{
  ym: string;
  label: string;
  due: string;
  from: string;
  to: string;
}> = [
  { ym: "2026-09", label: "September 2026", due: "2026-09-01", from: "2026-09-01", to: "2026-09-30" },
  { ym: "2026-10", label: "October 2026", due: "2026-10-01", from: "2026-10-01", to: "2026-10-31" },
  { ym: "2026-11", label: "November 2026", due: "2026-11-01", from: "2026-11-01", to: "2026-11-30" },
  { ym: "2026-12", label: "December 2026", due: "2026-12-01", from: "2026-12-01", to: "2026-12-18" },
  { ym: "2027-01", label: "January 2027", due: "2027-01-01", from: "2027-01-04", to: "2027-01-31" },
  { ym: "2027-02", label: "February 2027", due: "2027-02-01", from: "2027-02-01", to: "2027-02-28" },
  { ym: "2027-03", label: "March 2027", due: "2027-03-01", from: "2027-03-01", to: "2027-03-25" },
  { ym: "2027-04", label: "April 2027", due: "2027-04-01", from: "2027-04-12", to: "2027-04-30" },
  { ym: "2027-05", label: "May 2027", due: "2027-05-01", from: "2027-05-01", to: "2027-05-31" },
  { ym: "2027-06", label: "June 2027", due: "2027-06-01", from: "2027-06-01", to: "2027-06-30" },
  { ym: "2027-07", label: "July 2027", due: "2027-07-01", from: "2027-07-01", to: "2027-07-30" },
];

type Kid = {
  name: string;
  oldRate: number;
  wantDows: number[];
  serviceKey: string;
  description: string;
  detailExtra: string;
  invoices: string[]; // Sep→Jul
};

const KIDS: Kid[] = [
  {
    name: "Fadi",
    oldRate: 647.5,
    wantDows: [1, 2, 3, 4, 5],
    serviceKey: "DAY_CENTRE_150",
    description: "Day Centre / Bespoke 2h30' (2:1)",
    detailExtra: "SwimFarm · 2:1 Bespoke 2h30'",
    invoices: [
      "INV-P-0235", "INV-P-0236", "INV-P-0237", "INV-P-0238", "INV-P-0239", "INV-P-0240",
      "INV-P-0241", "INV-P-0242", "INV-P-0243", "INV-P-0244", "INV-P-0245",
    ],
  },
  {
    name: "Ikram",
    oldRate: 750,
    wantDows: [1, 2, 3, 5],
    serviceKey: "DAY_CENTRE_300",
    description: "Day Centre 5h (2:1)",
    detailExtra: "SwimFarm · 11:00–16:00 · 2:1",
    invoices: [
      "INV-P-0271", "INV-P-0272", "INV-P-0273", "INV-P-0274", "INV-P-0275", "INV-P-0276",
      "INV-P-0277", "INV-P-0278", "INV-P-0279", "INV-P-0280", "INV-P-0281",
    ],
  },
  {
    name: "Timi",
    oldRate: 350,
    wantDows: [1, 5],
    serviceKey: "DAY_CENTRE_120",
    description: "Day Centre 2h (2:1)",
    detailExtra: "SwimFarm · 11:00–13:00 · 2:1",
    invoices: [
      "INV-P-0168", "INV-P-0169", "INV-P-0170", "INV-P-0171", "INV-P-0172", "INV-P-0173",
      "INV-P-0174", "INV-P-0175", "INV-P-0176", "INV-P-0177", "INV-P-0178",
    ],
  },
];

function datesInRange(from: string, to: string, wantDow: number): string[] {
  const out: string[] = [];
  let c = from;
  while (c <= to) {
    if (!closed(c) && dow(c) === wantDow) out.push(c);
    c = addDays(c, 1);
  }
  return out;
}

function formatDates(isos: string[]): string {
  if (!isos.length) return "";
  const m = Number(isos[0].slice(5, 7));
  const days = isos.map((x) => String(Number(x.slice(8))));
  return `Dates: ${days.join(", ")} ${MONTH_SHORT[m]}`;
}

type Built = {
  kid: string;
  invoice: string;
  label: string;
  ym: string;
  due: string;
  oldRate: number;
  rate: number;
  sessions: number;
  total: number;
  lineItems: PortalInvoiceLineItem[];
};

const built: Built[] = [];

for (const kid of KIDS) {
  const rate = round4(kid.oldRate * UPLIFT);
  for (let i = 0; i < MONTH_META.length; i++) {
    const m = MONTH_META[i];
    const invoice = kid.invoices[i];
    const buckets = kid.wantDows
      .map((w) => ({ dow: w, dates: datesInRange(m.from, m.to, w) }))
      .filter((b) => b.dates.length > 0);

    const sessions = buckets.reduce((s, b) => s + b.dates.length, 0);
    const total = round2(sessions * rate);
    const lineItems: PortalInvoiceLineItem[] = [];
    let alloc = 0;
    buckets.forEach((b, bi) => {
      const q = b.dates.length;
      const isLast = bi === buckets.length - 1;
      const amount = isLast ? round2(total - alloc) : round2(q * rate);
      alloc = round2(alloc + amount);
      lineItems.push({
        service_key: kid.serviceKey,
        description: kid.description,
        detail: `${DOW_NAME[b.dow]} · ${kid.detailExtra}`,
        dates: formatDates(b.dates),
        quantity: q,
        unit_price_gbp: rate,
        amount_gbp: amount,
        xero_item_code: null,
      });
    });

    built.push({
      kid: kid.name,
      invoice,
      label: m.label,
      ym: m.ym,
      due: m.due,
      oldRate: kid.oldRate,
      rate,
      sessions,
      total,
      lineItems,
    });
  }
}

let prev = "";
for (const b of built) {
  if (b.kid !== prev) {
    const year = built.filter((x) => x.kid === b.kid);
    const ys = year.reduce((s, x) => s + x.sessions, 0);
    const yt = round2(year.reduce((s, x) => s + x.total, 0));
    console.log(`\n======== ${b.kid} · £${b.oldRate} × ${UPLIFT} = £${b.rate}/session · YEAR ${ys} · £${yt} ========`);
    prev = b.kid;
  }
  console.log(`${b.invoice} ${b.label}: ${b.sessions} sess · £${b.total}`);
}

if (!APPLY) {
  console.log("\nDry run — re-run with APPLY=1");
  Deno.exit(0);
}

for (const b of built) {
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, notes")
    .eq("invoice_number", b.invoice)
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) {
    console.warn("SKIP missing", b.invoice);
    continue;
  }

  const description = lineItemsToDescription(b.lineItems, { fundedProvision: true });
  const schedule = [
    {
      seq: 1,
      label: `${b.label} · NHS invoice`,
      due_date: b.due,
      amount_gbp: b.total,
      status: "pending",
      paid_at: null,
      paid_via: null,
    },
  ];
  const noteTag =
    ` · Day Centre calendar ${b.sessions}×£${b.rate} (£${b.oldRate}×${UPLIFT}) = £${b.total}`;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: b.total,
      amount_paid_gbp: 0,
      payment_status: "unpaid",
      quantity: b.sessions,
      unit_price_gbp: b.rate,
      line_items: b.lineItems,
      line_description: description,
      payment_schedule: schedule,
      notes:
        String(share.notes || "")
          .replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "")
          .replace(/\s· Day Centre calendar [\s\S]*$/, "") + noteTag,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) throw upErr;

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(`UPDATED ${b.kid} ${b.invoice} £${b.total}`, pdf?.ok ? "PDF ok" : pdf);
}

console.log("\nDone.");
