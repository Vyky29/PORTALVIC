/**
 * One-off family WhatsApp contact update.
 *
 * Targets active families with a mobile on file that have never sent an
 * inbound WhatsApp message to the Portal API number. De-duplicates by mobile,
 * skips previous successful rows for this campaign, sends via Meta WhatsApp
 * only (no SMS fallback), and audits every attempt in portal_parent_notify_log.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/notify-families-whatsapp-number-change.ts
 *
 * Send:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/notify-families-whatsapp-number-change.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendParentMessageViaWhatsapp } from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN_KIND = "whatsapp_number_change_20260717";
const MESSAGE =
  "Important contact update: Our usual number ending in 71 is currently unavailable on WhatsApp. " +
  "You can still call us or send a normal text message (SMS) to that number, but WhatsApp messages will not arrive. " +
  "For WhatsApp, please message our dedicated number +44 7886 292726. " +
  "This number is for WhatsApp messages only and does not accept calls. Please save it. Thank you, ClubSENsational.";

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

function phoneKey(raw: unknown): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("7")) digits = `44${digits}`;
  return digits;
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `+${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : phone;
}

const send = Deno.args.includes("--send");
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// The shared sender reads env directly; load local secrets into env if needed.
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

const { data: contacts, error: contactsError } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, parent_display, child_display, email, email_norm, mobile, in_class")
  .eq("in_class", true)
  .limit(5000);
if (contactsError) throw contactsError;

const { data: inbound, error: inboundError } = await admin
  .from("portal_parent_whatsapp_inbound")
  .select("from_phone")
  .limit(10000);
if (inboundError) throw inboundError;
const inboundPhones = new Set((inbound || []).map((r) => phoneKey(r.from_phone)).filter(Boolean));

const { data: prior, error: priorError } = await admin
  .from("portal_parent_notify_log")
  .select("parent_phone, whatsapp_status")
  .eq("kind", CAMPAIGN_KIND)
  .in("whatsapp_status", ["sent", "delivered", "read"])
  .limit(5000);
if (priorError) throw priorError;
const alreadySent = new Set((prior || []).map((r) => phoneKey(r.parent_phone)).filter(Boolean));

type Recipient = {
  phone: string;
  parentName: string;
  children: Set<string>;
  contactIds: Set<string>;
};
const byPhone = new Map<string, Recipient>();
for (const row of contacts || []) {
  const email = String(row.email_norm || row.email || "").trim().toLowerCase();
  const identityBlob =
    `${row.contact_id || ""} ${row.parent_display || ""} ${row.child_display || ""}`.toLowerCase();
  if (
    email === "victor.matilla.demo@clubsensational.org" ||
    /\b(test|demo)\b/.test(identityBlob) ||
    /^elia-matilla-demo$/i.test(String(row.contact_id || ""))
  ) {
    continue;
  }
  const phone = phoneKey(row.mobile);
  if (!phone) continue;
  let recipient = byPhone.get(phone);
  if (!recipient) {
    recipient = {
      phone,
      parentName: String(row.parent_display || "").trim(),
      children: new Set<string>(),
      contactIds: new Set<string>(),
    };
    byPhone.set(phone, recipient);
  }
  if (!recipient.parentName && row.parent_display) {
    recipient.parentName = String(row.parent_display).trim();
  }
  if (row.child_display) recipient.children.add(String(row.child_display).trim());
  if (row.contact_id) recipient.contactIds.add(String(row.contact_id));
}

const recipients = [...byPhone.values()]
  .filter((r) => !inboundPhones.has(r.phone) && !alreadySent.has(r.phone))
  .sort((a, b) => a.parentName.localeCompare(b.parentName));

console.log(JSON.stringify({
  mode: send ? "SEND" : "DRY_RUN",
  campaign: CAMPAIGN_KIND,
  message: MESSAGE,
  active_unique_mobile_families: byPhone.size,
  excluded_with_api_inbound: [...byPhone.keys()].filter((p) => inboundPhones.has(p)).length,
  excluded_already_sent: [...byPhone.keys()].filter((p) => alreadySent.has(p)).length,
  recipients: recipients.length,
}, null, 2));

if (!send) {
  for (const r of recipients) {
    console.log(`DRY ${r.parentName || "Parent / carer"} · ${[...r.children].join(", ")} · ${maskPhone(r.phone)}`);
  }
  Deno.exit(0);
}

let sent = 0;
let failed = 0;
for (let i = 0; i < recipients.length; i++) {
  const r = recipients[i];
  const result = await sendParentMessageViaWhatsapp(`+${r.phone}`, MESSAGE, {
    kind: "contact_update",
  });
  const now = new Date().toISOString();
  const whatsappStatus = result.ok ? "sent" : "failed";
  const messageId = result.ok ? result.id : null;
  const errorDetail = result.ok ? null : result.error;

  const { error: logError } = await admin.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN_KIND,
    channel: "whatsapp",
    client_display: [...r.children].sort().join(", ") || null,
    parent_name: r.parentName || null,
    parent_email: null,
    parent_phone: `+${r.phone}`,
    subject: "WhatsApp contact number update",
    body_text: MESSAGE,
    email_status: "skipped",
    whatsapp_status: whatsappStatus,
    whatsapp_message_id: messageId,
    error_detail: errorDetail,
    meta: {
      campaign: CAMPAIGN_KIND,
      contact_ids: [...r.contactIds],
      target_rule: "active_mobile_without_api_inbound",
      api_whatsapp_number: "+447886292726",
      sent_at: now,
    },
  });
  if (logError) {
    console.error(`LOG_FAILED ${maskPhone(r.phone)} ${logError.message}`);
  }
  if (result.ok) {
    sent += 1;
    console.log(`SENT ${i + 1}/${recipients.length} ${r.parentName || "Parent / carer"} ${maskPhone(r.phone)}`);
  } else {
    failed += 1;
    console.error(`FAILED ${i + 1}/${recipients.length} ${r.parentName || "Parent / carer"} ${maskPhone(r.phone)} ${result.error}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
}

console.log(JSON.stringify({ done: true, sent, failed, total: recipients.length }, null, 2));
