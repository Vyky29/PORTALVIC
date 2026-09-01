/**
 * Anas Ismail INV-P-0340 — Heba paid the FULL £1,050, not £700.
 *
 * Stripe charge py_3U2z1AAxqKFB1mZR0T09O8xB, 10 Aug 2026 19:37 UTC, £1,088.30 gross.
 * Gross-up is ceil((net + 20p) / (1 - 3.5%)), so £1,088.30 == £1,050.00 net.
 * Office reverted it to unpaid on 11 Aug (green-button confirm) and on 13 Aug only
 * re-credited the £700 first instalment, leaving a phantom £350 due 26 Oct.
 *
 *   npx -y deno run -A database/local-vault/office-anas-0340-paid-full-1050.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-anas-0340-paid-full-1050.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0340";
const CONTACT_ID = "7560101";
const FACE = 1050;
const PAID_AT = "2026-08-10T19:37:55.000Z";
const PAID_VIA = "stripe";
const CHARGE_ID = "py_3U2z1AAxqKFB1mZR0T09O8xB";

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
  next_instalment_due: row.next_instalment_due,
  schedule: row.payment_schedule,
});

if (Number(row.amount_gbp) !== FACE) {
  throw new Error(`face changed: expected ${FACE}, found ${row.amount_gbp}`);
}

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half + outstanding",
    due_date: "2026-08-15",
    amount_gbp: 700,
    status: "paid",
    paid_at: PAID_AT,
    paid_via: PAID_VIA,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    due_date: "2026-10-26",
    amount_gbp: 350,
    status: "paid",
    paid_at: PAID_AT,
    paid_via: PAID_VIA,
  },
];

const noteLine =
  `Office 14 Aug 2026: Heba paid the full GBP 1,050 in one Stripe charge (${CHARGE_ID}, 10 Aug 19:37, GBP 1,088.30 gross incl. card fee). Only GBP 700 had been re-credited on 13 Aug; both instalments now settled, nothing due 26 Oct.`;

const patch = {
  amount_gbp: FACE,
  amount_paid_gbp: FACE,
  payment_status: "paid",
  paid_at: PAID_AT,
  paid_via: PAID_VIA,
  next_instalment_due: null,
  payment_schedule: schedule,
  notes: [String(row.notes || "").trim(), noteLine]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("AFTER plan", {
  amount_gbp: FACE,
  amount_paid_gbp: FACE,
  payment_status: "paid",
  next_instalment_due: null,
  schedule,
});

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to write + regen PDF.");
  Deno.exit(0);
}

const { data: updated, error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id)
  .select(
    "invoice_number, payment_status, amount_gbp, amount_paid_gbp, paid_at, paid_via, next_instalment_due, payment_schedule",
  )
  .maybeSingle();
if (updErr) throw new Error(updErr.message);
console.log("UPDATED", JSON.stringify(updated, null, 2));

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);
