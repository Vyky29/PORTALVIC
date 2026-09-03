/**
 * Repair INV-P-0149 (Yoan Bekele): future GC months were painted Paid because
 * webhook marked the whole invoice paid. Keep only Sep paid if that matches
 * one instalment; set Oct–Dec back to pending; invoice → partial.
 *
 *   node database/local-vault/fix-yoan-inv-p-0149-gc-overpaid-schedule.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const INV = "INV-P-0149";
const { data: inv, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INV)
  .maybeSingle();
if (error) throw error;
if (!inv) throw new Error("invoice not found");

const schedule = Array.isArray(inv.payment_schedule)
  ? inv.payment_schedule.map((r) => ({ ...r }))
  : [];
if (!schedule.length) throw new Error("no schedule");

const first = schedule[0];
const firstAmt = Number(first.amount_gbp) || 0;
const now = new Date().toISOString();

for (let i = 0; i < schedule.length; i++) {
  if (i === 0) {
    schedule[i].status = "paid";
    schedule[i].paid_at = schedule[i].paid_at || inv.paid_at || now;
    schedule[i].paid_via = schedule[i].paid_via || inv.paid_via || "gocardless";
  } else {
    schedule[i].status = "pending";
    schedule[i].paid_at = null;
    schedule[i].paid_via = null;
  }
}

const nextDue = schedule.find((r) => String(r.status) !== "paid")?.due_date || null;
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_status: "partial",
    amount_paid_gbp: firstAmt,
    payment_schedule: schedule,
    next_instalment_due: nextDue,
    paid_at: null,
    paid_via: null,
    notes: [String(inv.notes || "").trim(), "repaired_gc_overmark_2026-09-02"]
      .filter(Boolean)
      .join("|")
      .slice(0, 500),
    updated_at: now,
  })
  .eq("id", inv.id);
if (upErr) throw upErr;
console.log("Repaired", INV, {
  payment_status: "partial",
  amount_paid_gbp: firstAmt,
  next_instalment_due: nextDue,
  schedule: schedule.map((r) => ({
    label: r.label,
    status: r.status,
    amount: r.amount_gbp,
  })),
});
