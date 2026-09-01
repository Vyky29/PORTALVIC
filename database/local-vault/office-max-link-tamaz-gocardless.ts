/**
 * Max Kacharava / Nana: link existing Tamaz Rashoyan GoCardless mandate
 * and schedule 4× £164 autumn collections (INV-P-0068 + hidden trackers).
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-max-link-tamaz-gocardless.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import {
  gocardlessCreatePayment,
  gocardlessChargeDate,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";
import { upsertMandateRow } from "../../supabase/functions/_shared/gocardless_portal.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

const CONTACT_ID = "284";
const PARENT_PERSON_ID = "6436006";
const MANDATE_ID = "MD003YCN15NQKS";
const CUSTOMER_ID = "CU005D21YP66Q6";

/** Sep on keeper; Oct–Dec on consolidated trackers. */
const CHARGES: Array<{
  invoice_number: string;
  amount_gbp: number;
  due_date: string;
}> = [
  { invoice_number: "INV-P-0068", amount_gbp: 164, due_date: "2026-09-01" },
  { invoice_number: "INV-P-0069", amount_gbp: 164, due_date: "2026-10-01" },
  { invoice_number: "INV-P-0070", amount_gbp: 164, due_date: "2026-11-01" },
  { invoice_number: "INV-P-0071", amount_gbp: 164, due_date: "2026-12-01" },
];

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
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const manRes = await gocardlessRequest<{
  mandates?: { id?: string; status?: string; links?: { customer?: string } };
}>("GET", `/mandates/${encodeURIComponent(MANDATE_ID)}`);
if (!manRes.ok) {
  console.error("mandate lookup failed", manRes.error, manRes.detail);
  Deno.exit(1);
}
const mandateStatus = String(manRes.data.mandates?.status || "");
const mandateCustomer = String(manRes.data.mandates?.links?.customer || "");
console.log("GC mandate", MANDATE_ID, "status=", mandateStatus, "customer=", mandateCustomer);
if (!/^(active|pending_submission|submitted)$/i.test(mandateStatus)) {
  console.error("Mandate not usable:", mandateStatus);
  Deno.exit(1);
}

const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, payment_status, share_status, gocardless_payment_id, payment_method_hint",
  )
  .eq("contact_id", CONTACT_ID)
  .in(
    "invoice_number",
    CHARGES.map((c) => c.invoice_number),
  );
if (shErr) throw shErr;
const byInv = new Map((shares || []).map((s) => [String(s.invoice_number), s]));

console.log("Plan:");
for (const c of CHARGES) {
  const row = byInv.get(c.invoice_number);
  console.log(
    `  ${c.invoice_number} £${c.amount_gbp} due ${c.due_date} → share=${row?.id || "MISSING"} gc_pay=${row?.gocardless_payment_id || "(none)"} status=${row?.payment_status}/${row?.share_status}`,
  );
}
for (const c of CHARGES) {
  if (!byInv.get(c.invoice_number)) {
    console.error("Missing share", c.invoice_number);
    Deno.exit(1);
  }
}

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1 to link mandate + create GC payments.");
  Deno.exit(0);
}

await upsertMandateRow(admin, {
  contact_id: CONTACT_ID,
  parent_person_id: PARENT_PERSON_ID,
  gocardless_customer_id: CUSTOMER_ID || mandateCustomer || null,
  gocardless_mandate_id: MANDATE_ID,
  mandate_status: mandateStatus.toLowerCase() === "active" ? "active" : mandateStatus,
  billing_request_id: null,
  billing_request_flow_id: null,
  authorisation_url: null,
  last_error: null,
});
console.log("Linked mandate to contact", CONTACT_ID);

const report: Array<Record<string, unknown>> = [];
for (const c of CHARGES) {
  const row = byInv.get(c.invoice_number)!;
  if (row.gocardless_payment_id) {
    report.push({
      inv: c.invoice_number,
      skipped: true,
      reason: "already_has_gc_payment",
      payment_id: row.gocardless_payment_id,
    });
    console.log("SKIP", c.invoice_number, "already", row.gocardless_payment_id);
    continue;
  }
  const amountPence = Math.round(c.amount_gbp * 100);
  const created = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence,
    description: `clubSENsational ${c.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(c.due_date),
    invoiceShareId: String(row.id),
    contactId: CONTACT_ID,
    invoiceNumber: c.invoice_number,
    idempotencyKey: `max-tamaz-${c.invoice_number}`,
  });
  if (!created.ok) {
    report.push({
      inv: c.invoice_number,
      ok: false,
      error: created.error,
      detail: created.detail,
    });
    console.error("FAIL", c.invoice_number, created.error, created.detail);
    continue;
  }
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: created.data.id,
      gocardless_mandate_id: MANDATE_ID,
      payment_method_hint: "gocardless",
      updated_at: now,
    })
    .eq("id", row.id)
    .is("gocardless_payment_id", null);
  if (upErr) {
    report.push({
      inv: c.invoice_number,
      ok: false,
      payment_id: created.data.id,
      error: "db_update",
      detail: upErr.message,
    });
    console.error("DB FAIL", c.invoice_number, upErr.message);
    continue;
  }
  report.push({
    inv: c.invoice_number,
    ok: true,
    payment_id: created.data.id,
    charge_date: created.data.charge_date,
    amount_gbp: c.amount_gbp,
  });
  console.log(
    "OK",
    c.invoice_number,
    created.data.id,
    "charge",
    created.data.charge_date,
    `£${c.amount_gbp}`,
  );
}

const { data: manRow } = await admin
  .from("portal_parent_gocardless_mandates")
  .select("*")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

console.log(JSON.stringify({ mandate: manRow, payments: report }, null, 2));
