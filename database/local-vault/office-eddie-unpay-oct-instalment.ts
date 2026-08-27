/**
 * Eddie Mckenzie Iglesias · INV-P-0148
 *
 * Mother paid 1st flexi half (£350) and tapped I've paid. Admin Confirm paid
 * correctly cleared half 1; a second Mark paid then cleared the Oct half by
 * mistake (UI labelled it Due). Parent portal + PDF still showed full PAID.
 *
 * Restores partial + regenerates PDF (PARTIALLY PAID stamp, Oct half pending).
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-eddie-unpay-oct-instalment.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0148";
const CONTACT_ID = 236;
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
  .select("*")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", String(CONTACT_ID))
  .maybeSingle();

if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found for contact ${CONTACT_ID}`);

console.log("BEFORE:", {
  payment_status: row.payment_status,
  amount_gbp: row.amount_gbp,
  amount_paid_gbp: row.amount_paid_gbp,
  next_instalment_due: row.next_instalment_due,
  paid_at: row.paid_at,
  schedule: row.payment_schedule,
  updated_at: row.updated_at,
});

const prev = Array.isArray(row.payment_schedule) ? row.payment_schedule : [];
const first = prev.find((s: { seq?: number }) => Number(s.seq) === 1) || prev[0] || {};
const firstPaidAt =
  (first as { paid_at?: string }).paid_at || "2026-08-12T21:51:10.156Z";
const firstPaidVia = (first as { paid_via?: string }).paid_via || "admin";

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    due_date: "2026-08-15",
    amount_gbp: RECEIVED,
    status: "paid",
    paid_at: firstPaidAt,
    paid_via: firstPaidVia,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: "2026-10-26",
    amount_gbp: RECEIVED,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const noteLine =
  "Office 13 Aug 2026: mother paid 1st flexi £350 only — undo accidental Mark paid on Oct half; PDF regen partial.";

const patch = {
  amount_gbp: 700,
  amount_paid_gbp: RECEIVED,
  payment_status: "partial",
  paid_at: null,
  paid_via: null,
  next_instalment_due: "2026-10-26",
  due_date: "2026-08-15",
  payment_schedule: schedule,
  parent_reported_paid_at: null,
  parent_reported_ref: null,
  parent_reported_method: null,
  parent_reported_notes: null,
  notes: [String(row.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("PATCH:", JSON.stringify(patch, null, 2));

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write + regen PDF.");
  Deno.exit(0);
}

const { data: updated, error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id)
  .select(
    "id, invoice_number, payment_status, amount_gbp, amount_paid_gbp, next_instalment_due, payment_schedule, paid_at, paid_via",
  )
  .maybeSingle();

if (updErr) throw new Error(updErr.message);
console.log("AFTER row:", JSON.stringify(updated, null, 2));

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);
