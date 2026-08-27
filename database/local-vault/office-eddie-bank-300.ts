/**
 * Eddie Mckenzie Iglesias · INV-P-0148
 * Bank (Marta Iglesias, 12 Aug) = £300, not the flexi half face £350.
 * Keep term face £700 (14×£50); record £300 received; Oct instalment £400.
 * No voucher/credit on file — treat as underpay vs scheduled half, not a discount.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-eddie-bank-300.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0148";
const CONTACT_ID = "236";
const FACE = 700;
const RECEIVED = 300;
const REMAIN = FACE - RECEIVED; // 400

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
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found`);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", {
  payment_status: row.payment_status,
  amount_gbp: row.amount_gbp,
  amount_paid_gbp: row.amount_paid_gbp,
  schedule: row.payment_schedule,
});

const prev = Array.isArray(row.payment_schedule) ? row.payment_schedule : [];
const first = (prev.find((s: { seq?: number }) => Number(s.seq) === 1) ||
  prev[0] ||
  {}) as { paid_at?: string; paid_via?: string };
const firstPaidAt = first.paid_at || "2026-08-12T12:00:00.000Z";
const firstPaidVia = first.paid_via || "office_bank";

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st payment (bank £300)",
    due_date: "2026-08-15",
    amount_gbp: RECEIVED,
    status: "paid",
    paid_at: firstPaidAt,
    paid_via: firstPaidVia,
  },
  {
    seq: 2,
    label: "Autumn term · balance",
    due_date: "2026-10-26",
    amount_gbp: REMAIN,
    status: "pending",
    paid_at: null,
    paid_via: null,
  },
];

const noteLine =
  "Office 13 Aug 2026: bank Iglesias 12 Aug = £300 (not £350 flexi half). No discount on file — keep face £700; paid £300; balance £400 due 26 Oct.";

const patch = {
  amount_gbp: FACE,
  amount_paid_gbp: RECEIVED,
  payment_status: "partial",
  paid_at: null,
  paid_via: null,
  next_instalment_due: "2026-10-26",
  due_date: "2026-08-15",
  payment_schedule: schedule,
  notes: [String(row.notes || "").trim(), noteLine]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("AFTER plan", {
  amount_gbp: FACE,
  amount_paid_gbp: RECEIVED,
  remain: REMAIN,
  schedule,
});

if (!APPLY) {
  console.log("Re-run with APPLY=1 to write + regen PDF.");
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
