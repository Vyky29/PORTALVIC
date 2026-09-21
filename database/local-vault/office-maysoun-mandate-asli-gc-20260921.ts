/**
 * Adam Mahmmoud (407) shares Maysoun / Adam Memy's household (same phone + email).
 * Reuse active mandate MD01KBZSD04RT7 instead of a new Direct Debit for Angel.
 * WhatsApp the fresh portal setup only to Asli / Muhammad (404).
 *
 *   npx -y deno run -A database/local-vault/office-maysoun-mandate-asli-gc-20260921.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-maysoun-mandate-asli-gc-20260921.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-maysoun-mandate-asli-gc-20260921.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { gocardlessRequest } from "../../supabase/functions/_shared/gocardless.ts";
import {
  scheduleGocardlessPaymentsForContact,
  upsertMandateRow,
} from "../../supabase/functions/_shared/gocardless_portal.ts";
import {
  flattenWhatsappTemplateBody,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = Deno.env.get("APPLY") === "1" || Deno.args.includes("--apply");
const SEND = Deno.args.includes("--send");

const SOURCE_CONTACT = "304";
const TARGET_CONTACT = "407";
const TARGET_INVOICE = "INV-P-0464";
const MANDATE_ID = "MD01KBZSD04RT7";
const ASLI_PHONE = "+447956309898";
const ASLI_CONTACT = "404";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env");
loadEnv("/Users/victor/cursor/PORTALVIC/local-secrets/edge-secrets.env");

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
const customerId = String(manRes.data.mandates?.links?.customer || "CU01KGQV622F1D");
console.log("GC mandate", MANDATE_ID, "status=", mandateStatus, "customer=", customerId);
if (!/^(active|pending_submission|submitted)$/i.test(mandateStatus)) {
  console.error("Mandate is not usable");
  Deno.exit(1);
}

const { data: srcMan } = await admin
  .from("portal_parent_gocardless_mandates")
  .select("contact_id, gocardless_mandate_id, gocardless_customer_id, mandate_status")
  .eq("contact_id", SOURCE_CONTACT)
  .maybeSingle();
console.log("source 304", srcMan);

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, amount_gbp, amount_paid_gbp, gocardless_mandate_id, payment_schedule")
  .eq("contact_id", TARGET_CONTACT)
  .eq("invoice_number", TARGET_INVOICE)
  .maybeSingle();
if (invErr) throw invErr;
if (!inv) {
  console.error("missing", TARGET_INVOICE);
  Deno.exit(1);
}
console.log("INV-P-0464", {
  id: inv.id,
  status: inv.payment_status,
  amount: inv.amount_gbp,
  paid: inv.amount_paid_gbp,
  mandate: inv.gocardless_mandate_id,
});

const ASLI_BODY =
  `Hi Asli,\n\n` +
  `The Direct Debit page you opened has expired. Please do not use the old WhatsApp link.\n\n` +
  `Sign in again at https://www.clubsensational.org/parent then go to Invoices and tap the red Set up Direct Payment button. Finish the authorisation with your bank.\n\n` +
  `October, November and December still collect on the 1st — this step only sets up Direct Debit.\n\n` +
  `Thanks,\nclubSENsational`;
const asliFlat = flattenWhatsappTemplateBody(ASLI_BODY);
console.log("Asli WhatsApp chars", asliFlat.length);

if (!APPLY) {
  console.log("\nDry run. APPLY=1 to copy Maysoun mandate onto 407 + schedule Oct-Dec.");
  console.log("Add --send to WhatsApp Asli.");
  Deno.exit(0);
}

await upsertMandateRow(admin, {
  contact_id: TARGET_CONTACT,
  parent_person_id: "portal-407-parent",
  gocardless_customer_id: customerId,
  gocardless_mandate_id: MANDATE_ID,
  mandate_status: mandateStatus.toLowerCase() || "active",
  authorisation_url: null,
  billing_request_id: null,
  billing_request_flow_id: null,
});
console.log("upserted 407 mandate", MANDATE_ID);

const sched = await scheduleGocardlessPaymentsForContact(admin, {
  contactId: TARGET_CONTACT,
  mandateId: MANDATE_ID,
  invoiceId: String(inv.id),
});
console.log("schedule result", sched);

await admin
  .from("portal_parent_invoice_share")
  .update({
    gocardless_url: null,
    gocardless_mandate_id: MANDATE_ID,
    updated_at: new Date().toISOString(),
  })
  .eq("id", inv.id);

if (!SEND) {
  console.log("Mandate linked. Re-run with --send to WhatsApp Asli.");
  Deno.exit(0);
}

const wa = await sendParentMessageViaWhatsapp(ASLI_PHONE, ASLI_BODY, { kind: "contact_update" });
console.log("Asli WhatsApp", wa);

await admin.from("portal_parent_notify_log").insert({
  sent_by_user_id: null,
  sent_by_email: "system@clubsensational.org",
  kind: "asli_muhammad_gocardless_setup_20260921",
  channel: "whatsapp",
  client_display: "Muhammad",
  parent_name: "Asli",
  parent_email: "bintu_gargaar@hotmail.com",
  parent_phone: ASLI_PHONE,
  subject: "Set up Direct Payment · Muhammad",
  body_text: ASLI_BODY,
  email_status: "skipped",
  whatsapp_status: wa.ok ? "sent" : "failed",
  whatsapp_message_id: wa.ok ? wa.id : null,
  error_detail: wa.ok ? null : wa.error,
  meta: { contact_id: ASLI_CONTACT, campaign: "asli_muhammad_gocardless_setup_20260921" },
});
