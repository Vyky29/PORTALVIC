/**
 * Ealing year INV-Ps 2026/27: replace the 11 equal monthly rows with Ealing's 13 four-week
 * cycles (7 Sep 2026 to 5 Sep 2027). Ealing pays each weekly session at price x 0.7288
 * (38 weeks spread over 52), rounded to pennies, x 4 weeks.
 * Cycle 1 (7 Sep - 4 Oct) paid on remittance 8 Oct 2026, in Tide 12 Oct, for
 * Tinashe, Amar-Rai, Samer and Steven. The three Ahmed brothers were not in it.
 * Invoice totals stay as billed; the notes record the gap to square in summer 2027.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-13-cycles-schedule-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ealing-13-cycles-schedule-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = Deno.env.get("APPLY") === "1";
const FACTOR = 0.7288;
const FIRST_CYCLE_START = "2026-09-07";
const PAID_AT = "2026-10-12T12:00:00.000Z";
const MARKER = "ealing_13_cycles_x0.7288";

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
  /** Amount on the 12 Oct remittance for cycle 1, or null when not paid. */
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

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function ukShort(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function cycleAmount(weekly: number[]): number {
  const perWeek = weekly.reduce((s, p) => s + round2(p * FACTOR), 0);
  return round2(perWeek * 4);
}

console.log(`\nEaling 13 cycles (${APPLY ? "APPLY" : "DRY"})\n`);

for (const p of plans) {
  const cyc = cycleAmount(p.weekly);
  if (p.paidCycle1 != null && Math.abs(cyc - p.paidCycle1) > 0.009) {
    throw new Error(`${p.invoice} cycle ${cyc} != remittance ${p.paidCycle1}`);
  }
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, amount_gbp, amount_paid_gbp, payment_status, notes, payment_schedule")
    .eq("invoice_number", p.invoice)
    .neq("payment_status", "void")
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${p.invoice} not found`);

  const schedule = [];
  for (let i = 0; i < 13; i++) {
    const start = addDays(FIRST_CYCLE_START, i * 28);
    const end = addDays(start, 27);
    const paid = i === 0 && p.paidCycle1 != null;
    schedule.push({
      seq: i + 1,
      label: `Ealing cycle ${i + 1} of 13 · ${ukShort(start)} - ${ukShort(end)}`,
      due_date: addDays(end, 4),
      amount_gbp: cyc,
      status: paid ? "paid" : "pending",
      paid_at: paid ? PAID_AT : null,
      paid_via: paid ? "office_bank" : null,
      collect_via: "bank_transfer",
    });
  }
  const yearEaling = round2(cyc * 13);
  const invoiceTotal = round2(Number(share.amount_gbp));
  const gap = round2(yearEaling - invoiceTotal);
  const paidSum = round2(schedule.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_gbp, 0));
  const nextDue = schedule.find((r) => r.status !== "paid")?.due_date || null;
  const note =
    ` · ${MARKER}: Ealing pays 13 x £${money(cyc)} = £${money(yearEaling)} vs invoice £${money(invoiceTotal)}` +
    ` (${gap >= 0 ? "+" : "-"}£${money(Math.abs(gap))}, square with Ealing in summer 2027)` +
    (p.paidCycle1 != null ? ". Cycle 1 paid remittance 8 Oct 2026, Tide 12 Oct" : ". Cycle 1 not on the 12 Oct remittance");
  const notes = String(share.notes || "").replace(/ · ealing_13_cycles_x0\.7288:[^\n]*/g, "") + note;

  console.log(
    `${p.invoice} ${p.who}: cycle £${money(cyc)} x 13 = £${money(yearEaling)} | invoice £${money(invoiceTotal)} | gap £${money(gap)} | paid now £${money(paidSum)} | next due ${nextDue}`,
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
