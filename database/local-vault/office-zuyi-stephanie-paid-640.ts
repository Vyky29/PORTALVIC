/**
 * Stephanie Ng / Zu Yi Wen (186) · INV-P-0098 — bank £640 = Autumn 1st flexi half.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-zuyi-stephanie-paid-640.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  recordInvoiceInstalmentPayment,
  regeneratePortalInvoiceSharePdf,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { clearPaymentHoldForContact } from "../../supabase/functions/_shared/portal_payment_holds.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "186";
const INVOICE_NUMBER = "INV-P-0098";
const RECEIVED = 640;

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
  .select(
    "id, invoice_number, payment_status, amount_gbp, amount_paid_gbp, payment_schedule, notes, xero_invoice_id",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found`);

console.log(APPLY ? "APPLY" : "DRY");
console.log("BEFORE", {
  payment_status: row.payment_status,
  amount_gbp: row.amount_gbp,
  amount_paid_gbp: row.amount_paid_gbp,
  schedule: row.payment_schedule,
  xero: row.xero_invoice_id,
});

if (Number(row.amount_paid_gbp || 0) >= RECEIVED) {
  console.log("Already has £640+ paid — nothing to do.");
  Deno.exit(0);
}

if (!APPLY) {
  console.log(`Would mark 1st half £${RECEIVED} paid (office_bank) + clear hold + regen PDF + Xero.`);
  Deno.exit(0);
}

const applied = await recordInvoiceInstalmentPayment(admin, String(row.id), {
  amountGbp: RECEIVED,
  paidVia: "office_bank",
});
if (!applied.ok) throw new Error(applied.error);
console.log("instalment", applied);

const noteLine =
  "Office 17 Aug 2026: bank £640 from Zu Yi Wen = Autumn 1st flexi half (Stephanie Ng INV-P-0098). Office validated — Mark paid. Oct half still pending.";

const { error: noteErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    notes: [String(row.notes || "").trim(), noteLine]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000),
    updated_at: new Date().toISOString(),
  })
  .eq("id", row.id);
if (noteErr) throw new Error(noteErr.message);

const hold = await clearPaymentHoldForContact(admin, CONTACT_ID, {
  reason: "bank_640_first_half_zuyi_stephanie",
});
console.log("hold clear", hold);

const pdf = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log("pdf", pdf);

if (!row.xero_invoice_id) {
  const xero = await pushPortalInvoiceShareToXero(admin, String(row.id));
  console.log("xero", xero);
}

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, payment_status, amount_paid_gbp, payment_schedule, xero_invoice_id, xero_push_status",
  )
  .eq("id", row.id)
  .maybeSingle();
console.log("AFTER", after);
console.log("done");
