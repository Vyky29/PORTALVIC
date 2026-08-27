/**
 * Fix: Léa Belhadj pays Eiji + Hazem — do NOT put all Tide £2,535 on Eiji.
 *
 * Bank Léa:
 *   31 Jul £1,267.50 → Hazem INV-P-0079 1st half (already correct)
 *   31 Jul £633.75 + 11 Aug £633.75 → Eiji INV-P-0083 1st half only (£1,267.50)
 *
 * Revert mistaken full-paid on INV-P-0083 → partial 1st half; Oct half pending.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-eiji-revert-lea-split.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE = "INV-P-0083";
const FACE = 2535;
const HALF = 1267.5;

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

const { data: row, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error || !row) throw new Error(error?.message || "missing");

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", {
  st: row.payment_status,
  paid: row.amount_paid_gbp,
  sched: row.payment_schedule,
});

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    due_date: "2026-08-15",
    amount_gbp: HALF,
    status: "paid",
    paid_at: "2026-08-11T12:00:00.000Z",
    paid_via: "office_bank",
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: "2026-10-26",
    amount_gbp: HALF,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const noteLine =
  "Office 13 Aug 2026 FIX: Léa pays Eiji+Hazem. Tide £1,267.50 (31 Jul)=Hazem 1st half; £633.75 (31 Jul)+£633.75 (11 Aug)=Eiji 1st half only. Revert mistaken full-paid on Eiji — Oct half still due.";

const patch = {
  amount_gbp: FACE,
  amount_paid_gbp: HALF,
  payment_status: "partial",
  paid_at: null,
  paid_via: null,
  next_instalment_due: "2026-10-26",
  payment_schedule: schedule,
  notes: [String(row.notes || "").trim(), noteLine]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("AFTER plan Eiji partial £1267.50; Hazem untouched");

if (!APPLY) {
  console.log("Re-run APPLY=1");
  Deno.exit(0);
}

const { data: updated, error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id)
  .select(
    "invoice_number, payment_status, amount_gbp, amount_paid_gbp, next_instalment_due, payment_schedule",
  )
  .maybeSingle();
if (updErr) throw new Error(updErr.message);
console.log("UPDATED", updated);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);

const { data: hazem } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, amount_paid_gbp, payment_schedule")
  .eq("invoice_number", "INV-P-0079")
  .maybeSingle();
console.log("Hazem unchanged", hazem);
