/**
 * Anas Ismail INV-P-0340 — due date was wrongly set to 2026-09-05.
 * Must be Autumn flexi first due 15 Aug (office chase + Flexi: 2 per term).
 *
 * £700 autumn + £350 outstanding = £1,050:
 *   1st · 15 Aug · £700 (1st half £350 + outstanding £350)
 *   2nd · 26 Oct · £350
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-anas-inv-p-0340-due-aug15.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0340";
const CONTACT_ID = "7560101";
const DUE1 = "2026-08-15";
const DUE2 = "2026-10-26";

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

const { data: row, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found`);

console.log("BEFORE", {
  due_date: row.due_date,
  next_instalment_due: row.next_instalment_due,
  amount_gbp: row.amount_gbp,
  payment_status: row.payment_status,
  schedule: row.payment_schedule,
});

// Already applied 13 Aug 2026, and Heba has since been credited the full GBP 1,050.
// Re-running would reset payment_status/amount_paid_gbp and wipe a real Stripe payment.
if (Number(row.amount_paid_gbp) > 0 || String(row.payment_status) === "paid") {
  throw new Error(
    `${INVOICE_NUMBER} already has GBP ${row.amount_paid_gbp} paid (status ${row.payment_status}). ` +
      `This script would zero it. Use office-anas-0340-paid-full-1050.ts instead.`,
  );
}

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half + outstanding",
    due_date: DUE1,
    amount_gbp: 700,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: DUE2,
    amount_gbp: 350,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const noteLine =
  "Office 13 Aug 2026: due date 5 Sept → 15 Aug (flexi 1st + outstanding £700; 2nd half £350 due 26 Oct).";

const patch = {
  due_date: DUE1,
  next_instalment_due: DUE1,
  payment_schedule: schedule,
  payment_status: "unpaid",
  amount_paid_gbp: 0,
  paid_at: null,
  paid_via: null,
  notes: [String(row.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("PATCH", JSON.stringify(patch, null, 2));
if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1.");
  Deno.exit(0);
}

const { error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id);
if (updErr) throw new Error(updErr.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "OK",
  INVOICE_NUMBER,
  "due",
  DUE1,
  regen.ok ? regen.pdfStoragePath : "PDF fail " + (regen as { error: string }).error,
);
