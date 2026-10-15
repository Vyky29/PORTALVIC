/**
 * Ealing year INV-Ps 2026/27: payment plan = Ealing's 13 pay cycles (BST "Domcare pay cycle").
 * Ealing buys the package pro rata: price x 38 term weeks / 52.14 = weekly rate (each session
 * rounded to pennies) and pays whole weeks per 4-week cycle, 52 weeks a year. The cycle across
 * 31 March is cut at the financial year end: 5 weeks before, 3 weeks after (as in 2025/26:
 * 23/02-29/03 paid 5 weeks, 01/04-19/04 paid 3 weeks).
 * Cycle 1 (07/09-04/10/2026) paid on remittance 8 Oct 2026 (cycle id 73979), Tide 12 Oct, for
 * Tinashe, Amar-Rai, Samer and Steven. The three Ahmed brothers were not in it.
 * Due date = when the money should land: the next monthly run of the LAC PV Payment Timetable
 * 2026/27 after the cycle ends. Runs after March 2027 are estimated. In 2025/26 the last two
 * cycles (13/07-09/08 and 10/08-06/09) were both paid on 24 Sep.
 * Invoice totals stay as billed; the notes record the gap to square with Ealing.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-13-cycles-schedule-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ealing-13-cycles-schedule-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = Deno.env.get("APPLY") === "1";
const FACTOR = 0.7288;
const PAID_AT = "2026-10-12T12:00:00.000Z";
const MARKER = "ealing_13_cycles_x0.7288";

const CYCLES: { from: string; to: string; weeks: number; paidIn: string; estimated?: boolean }[] = [
  { from: "07/09/2026", to: "04/10/2026", weeks: 4, paidIn: "2026-10-12" },
  { from: "05/10/2026", to: "01/11/2026", weeks: 4, paidIn: "2026-11-17" },
  { from: "02/11/2026", to: "29/11/2026", weeks: 4, paidIn: "2026-12-15" },
  { from: "30/11/2026", to: "27/12/2026", weeks: 4, paidIn: "2027-01-19" },
  { from: "28/12/2026", to: "24/01/2027", weeks: 4, paidIn: "2027-02-16" },
  { from: "25/01/2027", to: "21/02/2027", weeks: 4, paidIn: "2027-03-16" },
  { from: "22/02/2027", to: "31/03/2027", weeks: 5, paidIn: "2027-04-13" },
  { from: "01/04/2027", to: "18/04/2027", weeks: 3, paidIn: "2027-05-18", estimated: true },
  { from: "19/04/2027", to: "16/05/2027", weeks: 4, paidIn: "2027-06-15", estimated: true },
  { from: "17/05/2027", to: "13/06/2027", weeks: 4, paidIn: "2027-07-13", estimated: true },
  { from: "14/06/2027", to: "11/07/2027", weeks: 4, paidIn: "2027-08-11", estimated: true },
  { from: "12/07/2027", to: "08/08/2027", weeks: 4, paidIn: "2027-09-15", estimated: true },
  { from: "09/08/2027", to: "05/09/2027", weeks: 4, paidIn: "2027-09-15", estimated: true },
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
  /** Cycle 1 amount on the 8 Oct remittance, or null when not paid. */
  paidCycle1: number | null;
};

const plans: Plan[] = [
  { invoice: "INV-P-0332", who: "Tinashe Nekati", weekly: [345, 345], paidCycle1: 2011.52 },
  { invoice: "INV-P-0330", who: "Amar-Rai Singh", weekly: [100, 100], paidCycle1: 583.04 },
  { invoice: "INV-P-0329", who: "Samer Bakhiet", weekly: [120], paidCycle1: 349.84 },
  { invoice: "INV-P-0328", who: "Steven Cesare", weekly: [50], paidCycle1: 145.76 },
  { invoice: "INV-P-0331", who: "Aydaan Ahmed", weekly: [50, 120], paidCycle1: null },
  { invoice: "INV-P-0333", who: "Amaar Ahmed", weekly: [50, 120], paidCycle1: null },
  { invoice: "INV-P-0334", who: "Adaam Ah", weekly: [50, 120], paidCycle1: null },
];

function weeklyRate(weekly: number[]): number {
  return round2(weekly.reduce((s, p) => s + round2(p * FACTOR), 0));
}

const weeksTotal = CYCLES.reduce((s, c) => s + c.weeks, 0);
if (weeksTotal !== 52) throw new Error(`weeks ${weeksTotal} != 52`);

console.log(`\nEaling 13 pay cycles (${APPLY ? "APPLY" : "DRY"})\n`);

for (const p of plans) {
  const rate = weeklyRate(p.weekly);
  const c1 = round2(rate * CYCLES[0].weeks);
  if (p.paidCycle1 != null && Math.abs(c1 - p.paidCycle1) > 0.009) {
    throw new Error(`${p.invoice} cycle 1 ${c1} != remittance ${p.paidCycle1}`);
  }
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, amount_gbp, notes")
    .eq("invoice_number", p.invoice)
    .neq("payment_status", "void")
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${p.invoice} not found`);

  const schedule = CYCLES.map((c, i) => {
    const paid = i === 0 && p.paidCycle1 != null;
    return {
      seq: i + 1,
      label: `Ealing cycle ${i + 1} of 13 · ${c.from} - ${c.to} · ${c.weeks} weeks x £${money(rate)}` +
        (c.estimated ? " · pay date estimated" : ""),
      due_date: c.paidIn,
      amount_gbp: round2(rate * c.weeks),
      status: paid ? "paid" : "pending",
      paid_at: paid ? PAID_AT : null,
      paid_via: paid ? "office_bank" : null,
      collect_via: "bank_transfer",
    };
  });
  const yearEaling = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  const afterAug = round2(schedule.filter((r) => r.due_date >= "2027-09-01").reduce((s, r) => s + r.amount_gbp, 0));
  const invoiceTotal = round2(Number(share.amount_gbp));
  const gap = round2(yearEaling - invoiceTotal);
  const paidSum = round2(schedule.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_gbp, 0));
  const nextDue = schedule.find((r) => r.status !== "paid")?.due_date || null;
  const note =
    ` · ${MARKER}: Ealing pays 13 cycles, weekly £${money(rate)} x 52 = £${money(yearEaling)} vs invoice £${money(invoiceTotal)}` +
    ` (${gap >= 0 ? "+" : "-"}£${money(Math.abs(gap))}). Cycles 12 and 13 (12/07-05/09/2027) £${money(afterAug)} land mid Sep 2027 unless Ealing agrees otherwise` +
    (p.paidCycle1 != null ? ". Cycle 1 paid remittance 8 Oct 2026, Tide 12 Oct" : ". Cycle 1 not on the 8 Oct remittance");
  const notes = String(share.notes || "")
    .replace(/ · ealing_13_cycles_x0\.7288:[^\n]*/g, "")
    .replace(/ · ealing_12_months_pro_rata_x0\.7288:[^\n]*/g, "") + note;

  console.log(
    `${p.invoice} ${p.who}: weekly £${money(rate)} | cycle1 £${money(c1)} | Sep 2027 £${money(afterAug)} | year £${money(yearEaling)} | invoice £${money(invoiceTotal)} | gap £${money(gap)} | paid £${money(paidSum)}`,
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
