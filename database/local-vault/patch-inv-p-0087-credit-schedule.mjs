/**
 * Fix INV-P-0087: credit reduced amount_gbp but not payment_schedule.
 *
 *   node database/local-vault/patch-inv-p-0087-credit-schedule.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INVOICE_NUMBER = "INV-P-0087";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "database/local-vault/private/parent-portal-secrets.env"),
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function applyCreditToSchedule(rawSchedule, creditGbp) {
  const schedule = Array.isArray(rawSchedule)
    ? rawSchedule.map((r) => ({ ...r }))
    : [];
  let remaining = round2(creditGbp);
  const out = [];
  for (const row of schedule) {
    const amount = Number(row.amount_gbp);
    const status = String(row.status || "pending").toLowerCase();
    if (remaining > 0 && status !== "paid" && Number.isFinite(amount) && amount > 0) {
      const applied = Math.min(remaining, amount);
      row.amount_gbp = round2(amount - applied);
      remaining = round2(remaining - applied);
      if (row.amount_gbp <= 0) continue;
    }
    out.push(row);
  }
  const next = out.find((r) => String(r.status || "pending").toLowerCase() !== "paid");
  return {
    schedule: out,
    next_instalment_due: next?.due_date ? String(next.due_date).slice(0, 10) : null,
  };
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: inv, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, payment_status, payment_schedule, next_instalment_due, contact_id",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .maybeSingle();

if (error || !inv) {
  console.error("Invoice not found", error?.message);
  process.exit(1);
}

const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
const scheduleTotal = round2(
  schedule.reduce((s, r) => s + (Number(r.amount_gbp) || 0), 0),
);
const amount = round2(Number(inv.amount_gbp) || 0);
const credit = round2(scheduleTotal - amount);

console.log({
  id: inv.id,
  invoice_number: inv.invoice_number,
  amount_gbp: amount,
  schedule_total: scheduleTotal,
  credit_gap: credit,
  payment_status: inv.payment_status,
  schedule_before: schedule,
});

if (credit <= 0.01) {
  console.log("No credit gap to fix (schedule already matches amount).");
  process.exit(0);
}

const fixed = applyCreditToSchedule(schedule, credit);
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_schedule: fixed.schedule,
    next_instalment_due: fixed.next_instalment_due,
    updated_at: new Date().toISOString(),
  })
  .eq("id", inv.id);

if (upErr) {
  console.error("Update failed", upErr.message);
  process.exit(1);
}

console.log("Updated schedule:", fixed.schedule);
console.log("next_instalment_due:", fixed.next_instalment_due);
console.log("Done — refresh parent portal to see Due now =", amount);
