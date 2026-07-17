/**
 * Retry the contact-number update for the two failed recipients, using both
 * full phone numbers in the message. Sends via Meta WhatsApp only and audits
 * each attempt.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendParentMessageViaWhatsapp } from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN_KIND = "whatsapp_number_change_retry_20260717";
const MESSAGE =
  "Important contact update: Our number +44 7592 558671 is currently unavailable on WhatsApp. " +
  "You can still call us or send a normal text message (SMS) to +44 7592 558671, but WhatsApp messages will not arrive. " +
  "For WhatsApp, please message +44 7886 292726. " +
  "This number is for WhatsApp messages only and does not accept calls. Please save both numbers. Thank you, ClubSENsational.";

const RECIPIENTS = [
  {
    parentName: "Marta Iglesias",
    clientDisplay: "Eddie Mckenzie Iglesias",
    phone: "+447762947442",
  },
  {
    parentName: "Veronica Grace",
    clientDisplay: "Jack Stratton",
    phone: "+447803093911",
  },
];

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
      : "";
  } catch {
    return "";
  }
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "META_WHATSAPP_TEMPLATE_LANG",
]) {
  if (!Deno.env.get(key)) {
    const value = secret(key);
    if (value) Deno.env.set(key, value);
  }
}

let sent = 0;
let failed = 0;
for (const recipient of RECIPIENTS) {
  const result = await sendParentMessageViaWhatsapp(recipient.phone, MESSAGE, {
    kind: "contact_update",
  });
  const status = result.ok ? "sent" : "failed";
  const { error: logError } = await admin.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN_KIND,
    channel: "whatsapp",
    client_display: recipient.clientDisplay,
    parent_name: recipient.parentName,
    parent_phone: recipient.phone,
    subject: "WhatsApp contact number update — retry",
    body_text: MESSAGE,
    email_status: "skipped",
    whatsapp_status: status,
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN_KIND,
      old_call_sms_number: "+447592558671",
      api_whatsapp_number: "+447886292726",
    },
  });
  if (logError) console.error("audit_failed", recipient.parentName, logError.message);
  if (result.ok) {
    sent += 1;
    console.log("SENT", recipient.parentName);
  } else {
    failed += 1;
    console.error("FAILED", recipient.parentName, result.error);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log(JSON.stringify({ sent, failed, total: RECIPIENTS.length }, null, 2));
