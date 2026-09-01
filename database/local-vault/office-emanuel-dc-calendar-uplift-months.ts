/**
 * Emanuel Dodson — NHS monthly INV-Ps Sep 2026–Jul 2027
 * Day Centre calendar (open 1 Sept, closed Christmas + Easter only).
 * M/W/F × £500 × 1.0203 uplift = £510.15 / session.
 * September = 13 sessions (not sheet-14).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-emanuel-dc-calendar-uplift-months.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const UPLIFT = 1.0203;
const OLD_RATE = 500;
const RATE = Math.round(OLD_RATE * UPLIFT * 10000) / 10000; // 510.15

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

const MONTHS: Array<{
  ym: string;
  invoice: string;
  label: string;
  due: string;
  from: string;
  to: string;
}> = [
  { ym: "2026-09", invoice: "INV-P-0260", label: "September 2026", due: "2026-09-01", from: "2026-09-01", to: "2026-09-30" },
  { ym: "2026-10", invoice: "INV-P-0261", label: "October 2026", due: "2026-10-01", from: "2026-10-01", to: "2026-10-31" },
  { ym: "2026-11", invoice: "INV-P-0262", label: "November 2026", due: "2026-11-01", from: "2026-11-01", to: "2026-11-30" },
  { ym: "2026-12", invoice: "INV-P-0263", label: "December 2026", due: "2026-12-01", from: "2026-12-01", to: "2026-12-18" },
  { ym: "2027-01", invoice: "INV-P-0264", label: "January 2027", due: "2027-01-01", from: "2027-01-04", to: "2027-01-31" },
  { ym: "2027-02", invoice: "INV-P-0265", label: "February 2027", due: "2027-02-01", from: "2027-02-01", to: "2027-02-28" },
  { ym: "2027-03", invoice: "INV-P-0266", label: "March 2027", due: "2027-03-01", from: "2027-03-01", to: "2027-03-25" },
  { ym: "2027-04", invoice: "INV-P-0267", label: "April 2027", due: "2027-04-01", from: "2027-04-12", to: "2027-04-30" },
  { ym: "2027-05", invoice: "INV-P-0268", label: "May 2027", due: "2027-05-01", from: "2027-05-01", to: "2027-05-31" },
  { ym: "2027-06", invoice: "INV-P-0269", label: "June 2027", due: "2027-06-01", from: "2027-06-01", to: "2027-06-30" },
  { ym: "2027-07", invoice: "INV-P-0270", label: "July 2027", due: "2027-07-01", from: "2027-07-01", to: "2027-07-30" },
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
  invoice: string;
  label: string;
  ym: string;
  due: string;
  sessions: number;
  total: number;
  lineItems: PortalInvoiceLineItem[];
};

const built: Built[] = [];

for (const m of MONTHS) {
  const buckets = [
    { dow: 1 as const, dates: datesInRange(m.from, m.to, 1) },
    { dow: 3 as const, dates: datesInRange(m.from, m.to, 3) },
    { dow: 5 as const, dates: datesInRange(m.from, m.to, 5) },
  ].filter((b) => b.dates.length > 0);

  const sessions = buckets.reduce((s, b) => s + b.dates.length, 0);
  const total = round2(sessions * RATE);
  const lineItems: PortalInvoiceLineItem[] = [];
  let alloc = 0;
  buckets.forEach((b, i) => {
    const q = b.dates.length;
    const isLast = i === buckets.length - 1;
    const amount = isLast ? round2(total - alloc) : round2(q * RATE);
    alloc = round2(alloc + amount);
    lineItems.push({
      service_key: "DAY_CENTRE_300",
      description: "Day Centre 5h (1:1) · Mon/Wed/Fri 11:00–16:00",
      detail: `${DOW_NAME[b.dow]} · SwimFarm · 11:00–16:00 · 1:1`,
      dates: formatDates(b.dates),
      quantity: q,
      unit_price_gbp: RATE,
      amount_gbp: amount,
      xero_item_code: null,
    });
  });

  built.push({
    invoice: m.invoice,
    label: m.label,
    ym: m.ym,
    due: m.due,
    sessions,
    total,
    lineItems,
  });
}

console.log(`\nEmanuel Day Centre M/W/F · £${OLD_RATE} × ${UPLIFT} = £${RATE}/session\n`);
let yearTot = 0;
let yearSess = 0;
for (const b of built) {
  yearTot = round2(yearTot + b.total);
  yearSess += b.sessions;
  console.log(
    `${b.invoice} ${b.label}: ${b.sessions} sess · £${b.total}` +
      (b.ym === "2026-09" ? "  ← Sept = 13 (Day Centre from 1 Sept)" : ""),
  );
}
console.log(`YEAR ${yearSess} sessions · £${yearTot}`);

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
    ` · Day Centre calendar ${b.sessions}×£${RATE} (£${OLD_RATE}×${UPLIFT}) = £${b.total}`;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: b.total,
      amount_paid_gbp: 0,
      payment_status: "unpaid",
      quantity: b.sessions,
      unit_price_gbp: RATE,
      line_items: b.lineItems,
      line_description: description,
      payment_schedule: schedule,
      notes:
        String(share.notes || "")
          .replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "")
          .replace(/\s· fixed Sept Day Centre[\s\S]*$/, "")
          .replace(/\s· Day Centre calendar [\s\S]*$/, "") + noteTag,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) throw upErr;

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(`UPDATED ${b.invoice} £${b.total}`, pdf?.ok ? "PDF ok" : pdf);
}

console.log("\nDone.");
