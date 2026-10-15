/**
 * Ealing year INV-Ps 2026/27: payment plan = Ealing's 12 monthly periods (LAC PV Payment
 * Timetable 2026/27, sent by artduty 5 Oct 2026). Ealing buys the package pro rata:
 * price x 38 term weeks / 52.14 = weekly rate (each session rounded to pennies), paid for
 * the weeks that start in each month (Sep 2026 = 4 Mondays = 4 weeks).
 * Money lands mid next month: Sep 2026 on 13 Oct 2026 ... Aug 2027 about mid Sep 2027.
 * September paid on remittance 8 Oct 2026, in Tide 12 Oct, for Tinashe, Amar-Rai,
 * Samer and Steven. The three Ahmed brothers were not in it.
 * Invoice totals stay as billed; the notes record the gap to square with Ealing.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-12-months-schedule-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ealing-12-months-schedule-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = Deno.env.get("APPLY") === "1";
const FACTOR = 0.7288;
const PAID_AT = "2026-10-12T12:00:00.000Z";
const MARKER = "ealing_12_months_pro_rata_x0.7288";

/** Ealing timetable "Provider paid in account". Apr-Aug 2027 not published yet: estimated. */
const MONTHS: { label: string; start: string; paidIn: string; estimated?: boolean }[] = [
  { label: "September 2026", start: "2026-09-01", paidIn: "2026-10-13" },
  { label: "October 2026", start: "2026-10-01", paidIn: "2026-11-17" },
  { label: "November 2026", start: "2026-11-01", paidIn: "2026-12-15" },
  { label: "December 2026", start: "2026-12-01", paidIn: "2027-01-19" },
  { label: "January 2027", start: "2027-01-01", paidIn: "2027-02-16" },
  { label: "February 2027", start: "2027-02-01", paidIn: "2027-03-16" },
  { label: "March 2027", start: "2027-03-01", paidIn: "2027-04-13" },
  { label: "April 2027", start: "2027-04-01", paidIn: "2027-05-18", estimated: true },
  { label: "May 2027", start: "2027-05-01", paidIn: "2027-06-15", estimated: true },
  { label: "June 2027", start: "2027-06-01", paidIn: "2027-07-13", estimated: true },
  { label: "July 2027", start: "2027-07-01", paidIn: "2027-08-11", estimated: true },
  { label: "August 2027", start: "2027-08-01", paidIn: "2027-09-15", estimated: true },
];

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const round2 = (n: number) => Math.round(n * 100 + 1e-6) / 100;
const money = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Plan = {
  invoice: string;
  who: string;
  /** Weekly sessions at the billed price per session. */
  weekly: number[];
  /** September amount on the 8 Oct remittance, or null when not paid. */
  paidSep: number | null;
};

const plans: Plan[] = [
  { invoice: "INV-P-0332", who: "Tinashe Nekati", weekly: [345, 345], paidSep: 2011.52 },
  { invoice: "INV-P-0330", who: "Amar-Rai Singh", weekly: [100, 100], paidSep: 583.04 },
  { invoice: "INV-P-0329", who: "Samer Bakhiet", weekly: [120], paidSep: 349.84 },
  { invoice: "INV-P-0328", who: "Steven Cesare", weekly: [50], paidSep: 145.76 },
  { invoice: "INV-P-0331", who: "Aydaan Ahmed", weekly: [50, 120], paidSep: null },
  { invoice: "INV-P-0333", who: "Amaar Ahmed", weekly: [50, 120], paidSep: null },
  { invoice: "INV-P-0334", who: "Adaam Ah", weekly: [50, 120], paidSep: null },
];

/** Weeks counted in a month = Mondays in that month. */
function mondaysIn(startIso: string): number {
  const d = new Date(startIso + "T12:00:00Z");
  const month = d.getUTCMonth();
  let n = 0;
  while (d.getUTCMonth() === month) {
    if (d.getUTCDay() === 1) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function weeklyRate(weekly: number[]): number {
  return round2(weekly.reduce((s, p) => s + round2(p * FACTOR), 0));
}

const weeksTotal = MONTHS.reduce((s, m) => s + mondaysIn(m.start), 0);
if (weeksTotal !== 52) throw new Error(`weeks ${weeksTotal} != 52`);

console.log(`\nEaling 12 monthly periods (${APPLY ? "APPLY" : "DRY"})\n`);
console.log("weeks per month:", MONTHS.map((m) => `${m.label.slice(0, 3)} ${mondaysIn(m.start)}`).join(", "));

for (const p of plans) {
  const rate = weeklyRate(p.weekly);
  const septAmt = round2(rate * mondaysIn(MONTHS[0].start));
  if (p.paidSep != null && Math.abs(septAmt - p.paidSep) > 0.009) {
    throw new Error(`${p.invoice} September ${septAmt} != remittance ${p.paidSep}`);
  }
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, amount_gbp, notes")
    .eq("invoice_number", p.invoice)
    .neq("payment_status", "void")
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${p.invoice} not found`);

  const schedule = MONTHS.map((m, i) => {
    const weeks = mondaysIn(m.start);
    const paid = i === 0 && p.paidSep != null;
    return {
      seq: i + 1,
      label: `Ealing ${m.label} · ${weeks} weeks x £${money(rate)}` + (m.estimated ? " · pay date estimated" : ""),
      due_date: m.paidIn,
      amount_gbp: round2(rate * weeks),
      status: paid ? "paid" : "pending",
      paid_at: paid ? PAID_AT : null,
      paid_via: paid ? "office_bank" : null,
      collect_via: "bank_transfer",
    };
  });
  const yearEaling = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  const byJuly = round2(schedule.slice(0, 11).reduce((s, r) => s + r.amount_gbp, 0));
  const august = schedule[11].amount_gbp;
  const invoiceTotal = round2(Number(share.amount_gbp));
  const gap = round2(yearEaling - invoiceTotal);
  const paidSum = round2(schedule.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_gbp, 0));
  const nextDue = schedule.find((r) => r.status !== "paid")?.due_date || null;
  const note =
    ` · ${MARKER}: Ealing pays 12 months, weekly £${money(rate)} x 52 = £${money(yearEaling)} vs invoice £${money(invoiceTotal)}` +
    ` (${gap >= 0 ? "+" : "-"}£${money(Math.abs(gap))}). August 2027 £${money(august)} lands mid Sep 2027 unless Ealing agrees otherwise` +
    (p.paidSep != null ? ". September paid remittance 8 Oct 2026, Tide 12 Oct" : ". September not on the 8 Oct remittance");
  const notes = String(share.notes || "")
    .replace(/ · ealing_13_cycles_x0\.7288:[^\n]*/g, "")
    .replace(/ · ealing_12_months_pro_rata_x0\.7288:[^\n]*/g, "") + note;

  console.log(
    `${p.invoice} ${p.who}: weekly £${money(rate)} | Sep £${money(septAmt)} | Sep-Jul £${money(byJuly)} | Aug £${money(august)} | year £${money(yearEaling)} | invoice £${money(invoiceTotal)} | gap £${money(gap)} | paid £${money(paidSum)}`,
  );

  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_schedule: schedule,
      amount_paid_gbp: paidSum,
      payment_status: paidSum > 0 ? "partial" : "unpaid",
      next_instalment_due: nextDue,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) throw upErr;
}

if (!APPLY) console.log("\nDry run. Re-run with APPLY=1");
else console.log("\nDone.");
