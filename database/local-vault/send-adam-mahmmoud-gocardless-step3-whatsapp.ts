/**
 * Adam Mahmmoud (407) — bank first half confirmed; complete GoCardless Step 3.
 *
 * Dry:  npx -y deno run -A database/local-vault/send-adam-mahmmoud-gocardless-step3-whatsapp.ts
 * Send: npx -y deno run -A database/local-vault/send-adam-mahmmoud-gocardless-step3-whatsapp.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const CONTACT_ID = "407";
const PHONE = "+447491151131";
const CAMPAIGN = "adam_mahmmoud_gocardless_step3_20260903";

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

const { data: contact } = await admin
  .from("portal_parent_contacts")
  .select("child_display, parent_display, email")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: inv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, gocardless_url")
  .eq("contact_id", CONTACT_ID)
  .eq("invoice_number", "INV-P-0464")
  .maybeSingle();

const gcUrl = String(inv?.gocardless_url || "").trim();
const participant = String(contact?.child_display || "Adam Mahmmoud").trim();
const parentName = String(contact?.parent_display || "Adam").trim();

const BODY =
  `Hi ${parentName},

Thank you — we have confirmed your bank transfer for ${participant} (invoice ${inv?.invoice_number || "INV-P-0464"}).

One more step: please set up GoCardless (Direct Debit) so we can collect the remaining monthly payments on the 1st of each month, same as other families.

${gcUrl ? `Complete Step 3 here:\n${gcUrl}\n\n` : ""}Or sign in to the Parent Portal (https://www.clubsensational.org/parent) → Invoices → Set up Direct Payment.

We cannot schedule future collections until GoCardless is completed.

Thanks,
clubSENsational`;

const flat = flattenWhatsappTemplateBody(BODY);
console.log(SEND ? "SEND" : "DRY RUN");
console.log("to", PHONE);
console.log("participant", participant);
console.log("gc_url", gcUrl || "(portal only)");
console.log("flat_len", flat.length);
console.log("flat:\n", flat);

if (!SEND) {
  console.log("\nRe-run with --send to deliver.");
  Deno.exit(0);
}

const result = await sendParentMessageViaWhatsapp(PHONE, BODY, {
  kind: "contact_update",
});
console.log("result", result);

await admin.from("portal_parent_notify_log").insert({
  sent_by_user_id: null,
  sent_by_email: "system@clubsensational.org",
  kind: CAMPAIGN,
  channel: "whatsapp",
  client_display: participant,
  parent_name: parentName,
  parent_email: contact?.email || "mayelokla@gmail.com",
  parent_phone: PHONE,
  subject: `Set up GoCardless · ${participant}`,
  body_text: BODY,
  email_status: "skipped",
  whatsapp_status: result.ok ? "sent" : "failed",
  whatsapp_message_id: result.ok ? result.id : null,
  error_detail: result.ok ? null : result.error,
  meta: {
    campaign: CAMPAIGN,
    contact_id: CONTACT_ID,
    gocardless_url: gcUrl || null,
  },
});

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/send-adam-mahmmoud-gocardless-step3-whatsapp.json",
  JSON.stringify({ SEND, PHONE, result, flat_len: flat.length }, null, 2),
);
