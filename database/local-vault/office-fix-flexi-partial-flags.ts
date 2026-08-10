/**
 * Office: correct Flexi / partial flags
 * - Cyrus INV-P-0018: wrongly partial (GoCardless, £0 paid) → unpaid
 * - Eiji INV-P-0083: bank £633.75 seen but NOT validated → unpaid until mother completes + confirms
 * - Hazem INV-P-0079 + Shaan INV-P-0126: leave as validated flexi partial
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fix-flexi-partial-flags.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  normalizePaymentSchedule,
  nextInstalmentDueDate,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function loadInv(num: string) {
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("invoice_number", num)
    .maybeSingle();
  if (error || !data) throw new Error(`${num}: ${error?.message || "missing"}`);
  return data;
}

const cyrus = await loadInv("INV-P-0018");
const eiji = await loadInv("INV-P-0083");
const hazem = await loadInv("INV-P-0079");
const shaan = await loadInv("INV-P-0126");

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("Cyrus", cyrus.payment_status, "paid", cyrus.amount_paid_gbp, "→ unpaid (GC)");
console.log("Eiji", eiji.payment_status, "paid", eiji.amount_paid_gbp, "→ unpaid (not validated)");
console.log("Hazem KEEP", hazem.payment_status, hazem.amount_paid_gbp);
console.log("Shaan KEEP", shaan.payment_status, shaan.amount_paid_gbp);

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();

/* ---- Cyrus: unpaid GoCardless autumn pack ---- */
{
  const sched = normalizePaymentSchedule(cyrus.payment_schedule).map((row) => ({
    ...row,
    status: "pending" as const,
    paid_at: null,
    paid_via: null,
  }));
  const note =
    `${String(cyrus.notes || "").trim()} · office: cleared false partial — GoCardless monthly, nothing collected yet`.trim();
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "unpaid",
      amount_paid_gbp: 0,
      payment_schedule: sched,
      next_instalment_due: nextInstalmentDueDate(sched),
      paid_at: null,
      paid_via: null,
      notes: note.slice(0, 2000),
      updated_at: now,
    })
    .eq("id", cyrus.id);
  if (error) throw new Error(`Cyrus: ${error.message}`);
  await regeneratePortalInvoiceSharePdf(admin, String(cyrus.id));
  console.log("OK Cyrus INV-P-0018 unpaid");
}

/* ---- Eiji: unpaid until mother completes first half + I've paid ---- */
{
  const half = 1267.5;
  const sched = normalizePaymentSchedule(eiji.payment_schedule).map((row) => {
    if (row.seq === 1) {
      return {
        ...row,
        label: "Autumn term · 1st half",
        amount_gbp: half,
        status: "pending" as const,
        paid_at: null,
        paid_via: null,
      };
    }
    if (row.seq === 2) {
      return {
        ...row,
        label: "Autumn term · 2nd half",
        amount_gbp: half,
        status: "pending" as const,
        paid_at: null,
        paid_via: null,
      };
    }
    return row;
  });
  const note =
    `${String(eiji.notes || "").trim()} · office 10 Aug: Tide £633.75 seen but NOT validated — Eiji stays unpaid until Léa pays the full 1st half (£1,267.50) and confirms I've paid`.trim();
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "unpaid",
      amount_paid_gbp: 0,
      payment_schedule: sched,
      next_instalment_due: nextInstalmentDueDate(sched),
      parent_reported_paid_at: null,
      parent_reported_ref: null,
      parent_reported_method: null,
      parent_reported_notes: null,
      paid_at: null,
      paid_via: null,
      notes: note.slice(0, 2000),
      updated_at: now,
    })
    .eq("id", eiji.id);
  if (error) throw new Error(`Eiji: ${error.message}`);
  await regeneratePortalInvoiceSharePdf(admin, String(eiji.id));
  console.log("OK Eiji INV-P-0083 unpaid (not validated)");
}

console.log("Done — Flexi validated remain Hazem + Shaan only.");
