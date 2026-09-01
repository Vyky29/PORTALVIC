/**
 * Ealing paid another Summer 25/26 tranche — deduct from Office owed.
 * Tinashe overpay (£408.52) kept as positive Ealing credit balance.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ealing-summer-second-pay.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  if (typeof v === "string") v = v.replace(/[£,\s]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const PAYMENTS: { match: RegExp; pay: number; label: string }[] = [
  { match: /^adaam\b/i, pay: 145.76, label: "Ahmed, Aadam (Adaam)" },
  { match: /^amaar\b/i, pay: 145.76, label: "Ahmed, Amaar" },
  { match: /^aydaan\b/i, pay: 145.76, label: "Ahmed, Aydaan" },
  { match: /^samer\b/i, pay: 349.84, label: "Bakhiet, Samer" },
  { match: /^steven\b/i, pay: 145.76, label: "Cesare, Steven" },
  { match: /^tinashe nekati$/i, pay: 2011.52, label: "Nekati, Tinashe" },
  { match: /^amar-rai$/i, pay: 583.04, label: "Sandhir, Amar-Rai" },
];

const { data, error } = await admin
  .from("client_payments")
  .select("id, client_name, amount, payment_status, data")
  .eq("sheet", "LA");
if (error) throw error;

const rows = data || [];
const report: {
  label: string;
  client: string;
  before: number;
  pay: number;
  after: number;
  creditBalance: number;
  prevCredit: number;
  newCreditPaid: number;
  status: string;
}[] = [];

for (const spec of PAYMENTS) {
  const row = rows.find((r) => spec.match.test(String(r.client_name || "").trim()));
  if (!row) {
    console.warn("MISSING", spec.label);
    continue;
  }
  const d = { ...((row.data || {}) as Record<string, unknown>) };
  const before = num(row.amount);
  const prevCredit = num(d["Ealing summer credit (25/26)"]);
  const rawAfter = round2(before - spec.pay);
  const after = Math.max(0, rawAfter);
  const overpay = rawAfter < 0 ? round2(-rawAfter) : 0;
  const newCreditPaid = round2(prevCredit + spec.pay);
  const status = after <= 0.009 ? "Paid" : "Outstanding";

  d["Amount before Aug Ealing pay"] = before;
  d["Office owed (LA)"] = after;
  d["Ealing summer credit (25/26)"] = newCreditPaid;
  d["Credit note"] =
    `Ealing credits applied against Summer term 25/26 outstanding (July £${prevCredit.toFixed(2)} + Aug £${spec.pay.toFixed(2)} = £${newCreditPaid.toFixed(2)})`;
  const prevNote = String(d["Office owed note"] || "").trim();
  d["Office owed note"] =
    `${prevNote} · Aug Ealing pay −£${spec.pay.toFixed(2)}`.replace(/^ · /, "").trim();

  if (overpay > 0) {
    d["Ealing credit balance (25/26)"] = overpay;
    d["Ealing credit balance note"] =
      `Ealing overpay on Summer 25/26 — keep +£${overpay.toFixed(2)} on file (Aug pay £${spec.pay.toFixed(2)} vs owed £${before.toFixed(2)})`;
    d["Office owed note"] =
      `${d["Office owed note"]} · Ealing credit balance +£${overpay.toFixed(2)}`.trim();
  }

  report.push({
    label: spec.label,
    client: String(row.client_name),
    before,
    pay: spec.pay,
    after,
    creditBalance: overpay,
    prevCredit,
    newCreditPaid,
    status,
  });

  if (APPLY) {
    const { error: upErr } = await admin
      .from("client_payments")
      .update({
        amount: after,
        payment_status: status,
        data: d,
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`${row.client_name}: ${upErr.message}`);
  }
}

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("label\tbefore\tpay\tafter\tcreditBal\tstatus");
let sumPay = 0;
let sumAfter = 0;
for (const r of report) {
  sumPay += r.pay;
  sumAfter += r.after;
  console.log(
    `${r.label}\t£${r.before.toFixed(2)}\t£${r.pay.toFixed(2)}\t£${r.after.toFixed(2)}\t£${r.creditBalance.toFixed(2)}\t${r.status}`,
  );
}
console.log(`TOTAL pay £${sumPay.toFixed(2)} · TOTAL still owed Summer £${sumAfter.toFixed(2)}`);
if (!APPLY) console.log("\nRe-run with APPLY=1 to write.");
