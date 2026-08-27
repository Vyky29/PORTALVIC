/**
 * Agata / Erik Ndregjoni (contact 176):
 * Clear re-enrolment so she can complete again with current fixed payment options.
 * Void unpaid auto INV-Ps so a fresh submit can create the correct invoice.
 *
 * Dry:  npx -y deno run --allow-env --allow-read --allow-net database/local-vault/office-agata-reset-reenrol.ts
 * Apply: APPLY=1 npx -y deno run --allow-env --allow-read --allow-net database/local-vault/office-agata-reset-reenrol.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT = "176";
const SUBMISSION_ID = "262156d8-bd31-4fb5-a628-0686eebd5ed3";
const VOID_INVOICES = ["INV-P-0014", "INV-P-0015"];

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

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, participant_name, participant_contact_id, submitted_at, parent_first_name, parent_last_name")
  .eq("id", SUBMISSION_ID)
  .maybeSingle();
console.log("submission", sub);

const { data: invs } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, payment_status, payment_method_hint, payment_schedule")
  .eq("contact_id", CONTACT)
  .in("invoice_number", VOID_INVOICES);
console.log("invoices to void", invs);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const voidNote =
  `Voided ${now.slice(0, 10)} — office reset: Agata to re-complete re-enrolment with current payment options (bank flexi / GoCardless monthly / own way).`;

for (const inv of invs || []) {
  if (String(inv.payment_status).toLowerCase() === "void") {
    console.log("already void", inv.invoice_number);
    continue;
  }
  if (String(inv.payment_status).toLowerCase() === "paid") {
    throw new Error(`Refusing to void paid invoice ${inv.invoice_number}`);
  }
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      notes: `${String(inv.notes || "").trim()} · ${voidNote}`.trim(),
      updated_at: now,
    })
    .eq("id", inv.id);
  if (error) throw error;
  console.log("voided", inv.invoice_number);
}

const { error: delErr } = await admin
  .from("portal_re_enrolment_submissions")
  .delete()
  .eq("id", SUBMISSION_ID)
  .eq("participant_contact_id", CONTACT);
if (delErr) throw delErr;
console.log("deleted submission", SUBMISSION_ID);

const { data: checkSub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id")
  .eq("participant_contact_id", CONTACT)
  .eq("academic_year", "2026-27");
const { data: checkInv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, amount_gbp")
  .eq("contact_id", CONTACT)
  .in("invoice_number", VOID_INVOICES);

console.log("remaining 2026-27 submissions", checkSub);
console.log("invoice status", checkInv);
console.log("DONE");
