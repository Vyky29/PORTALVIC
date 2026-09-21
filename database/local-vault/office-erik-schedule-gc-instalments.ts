/**
 * Erik / Agata (contact 176) · INV-P-0461
 * Mandate already active (MD003Y4WEJ3RNT from Jul). Schedule Oct–Dec GC
 * instalments (Sep bank remainder already paid).
 *
 *   npx -y deno run -A database/local-vault/office-erik-schedule-gc-instalments.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-erik-schedule-gc-instalments.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { gocardlessRequest } from "../../supabase/functions/_shared/gocardless.ts";
import { scheduleGocardlessPaymentsForContact } from "../../supabase/functions/_shared/gocardless_portal.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "176";
const INVOICE_NUMBER = "INV-P-0461";
const MANDATE_ID = "MD003Y4WEJ3RNT";

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
console.log(
  "GC mandate",
  MANDATE_ID,
  "status=",
  manRes.data.mandates?.status,
  "customer=",
  manRes.data.mandates?.links?.customer,
);

const { data: inv, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, payment_status, share_status, amount_gbp, amount_paid_gbp, gocardless_mandate_id, gocardless_payment_id, payment_schedule",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .maybeSingle();
if (error) throw error;
if (!inv) {
  console.error("Invoice missing", INVOICE_NUMBER);
  Deno.exit(1);
}

console.log("Invoice", {
  id: inv.id,
  status: inv.payment_status,
  share: inv.share_status,
  amount: inv.amount_gbp,
  paid: inv.amount_paid_gbp,
  mandate_on_inv: inv.gocardless_mandate_id,
  schedule: (inv.payment_schedule || []).map((r: Record<string, unknown>) => ({
    seq: r.seq,
    due: r.due_date,
    amount: r.amount_gbp,
    status: r.status,
    gc: r.gocardless_payment_id || null,
    label: r.label,
  })),
});

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1 to create Oct–Dec GC payments.");
  Deno.exit(0);
}

const sched = await scheduleGocardlessPaymentsForContact(admin, {
  contactId: CONTACT_ID,
  mandateId: MANDATE_ID,
  invoiceId: String(inv.id),
});
console.log("schedule result", sched);

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select("gocardless_mandate_id, gocardless_payment_id, payment_schedule, next_instalment_due")
  .eq("id", inv.id)
  .maybeSingle();
console.log("after", {
  mandate: after?.gocardless_mandate_id,
  first_pay: after?.gocardless_payment_id,
  next_due: after?.next_instalment_due,
  schedule: (after?.payment_schedule || []).map((r: Record<string, unknown>) => ({
    seq: r.seq,
    due: r.due_date,
    status: r.status,
    gc: r.gocardless_payment_id || null,
  })),
});
