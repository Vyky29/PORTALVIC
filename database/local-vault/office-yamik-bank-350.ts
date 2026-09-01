/**
 * Yamik Limbu · INV-P-0097
 * Bank Limbu £350 (12 Aug) = 1st flexi half. Parent did not tap green "I've paid".
 * Office validates from Tide; leave Oct half pending.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-yamik-bank-350.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { recordInvoiceInstalmentPayment } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0097";
const CONTACT_ID = "gap-yamik-limbu";
const RECEIVED = 350;

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
    "id, invoice_number, payment_status, amount_gbp, amount_paid_gbp, payment_schedule, parent_reported_paid_at, notes",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found`);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", {
  payment_status: row.payment_status,
  amount_gbp: row.amount_gbp,
  amount_paid_gbp: row.amount_paid_gbp,
  parent_reported_paid_at: row.parent_reported_paid_at,
  schedule: row.payment_schedule,
});

if (!APPLY) {
  console.log(`Would mark 1st half £${RECEIVED} paid (office bank / no green button) + regen PDF.`);
  Deno.exit(0);
}

const applied = await recordInvoiceInstalmentPayment(admin, String(row.id), {
  amountGbp: RECEIVED,
  paidVia: "office_bank",
});
if (!applied.ok) throw new Error(applied.error);
console.log("instalment", applied);

const noteLine =
  "Office 13 Aug 2026: bank Limbu £350 (12 Aug) = Autumn 1st flexi half. Parent did not press green I've paid — office validated from Tide.";

const { error: noteErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    notes: [String(row.notes || "").trim(), noteLine]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000),
    updated_at: new Date().toISOString(),
  })
  .eq("id", row.id);
if (noteErr) throw new Error(noteErr.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, payment_status, amount_gbp, amount_paid_gbp, next_instalment_due, payment_schedule, parent_reported_paid_at",
  )
  .eq("id", row.id)
  .maybeSingle();
console.log("AFTER", JSON.stringify(after, null, 2));
