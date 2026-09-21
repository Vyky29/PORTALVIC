/**
 * One-shot: WhatsApp Agata (Erik 176) — re-enrol deep link + hold until 23:59.
 *
 * Dry:  npx -y deno run -A database/local-vault/send-agata-erik-reenroll-hold-whatsapp.ts
 * Send: npx -y deno run -A database/local-vault/send-agata-erik-reenroll-hold-whatsapp.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const PHONE = "+447493175142";
const CONTACT_ID = "176";
const REENROL_URL =
  "https://www.clubsensational.org/parent/re-enrolment?from=portal&contact_id=176";
const CAMPAIGN = "agata_erik_reenroll_hold_20260831";

const BODY =
  `good to hear you are back — no worry about the delay.

Erik’s Sunday place is still held: 90' Multi-Activity, SwimFarm, 12.30–2 pm. It has not been given away.

Complete re-enrolment here (choose funding + payment yourself; we will not choose for you):
${REENROL_URL}

Held until 23:59 tonight (31 Aug UK). From midnight 1 Sep 00:00, if re-enrolment is not completed, the place is released for someone else.

If asked to sign in, use your Parent Portal PIN, then reopen the same link. After you submit we can sort the invoice.`;

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

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "META_WHATSAPP_TEMPLATE_LANG",
]) {
  /* already loaded via loadEnv into Deno.env when present */
  void key;
}

const flat = flattenWhatsappTemplateBody(BODY);
console.log(SEND ? "SEND" : "DRY RUN");
console.log("to", PHONE);
console.log("flat_len", flat.length);
console.log("flat:\n", flat);

if (!SEND) {
  console.log("\nRe-run with --send to deliver.");
  Deno.exit(0);
}

const result = await sendParentMessageViaWhatsapp(PHONE, BODY, {
  kind: "payment_due",
});
console.log("result", result);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

await admin.from("portal_parent_notify_log").insert({
  sent_by_user_id: null,
  sent_by_email: "system@clubsensational.org",
  kind: CAMPAIGN,
  channel: "whatsapp",
  client_display: "Erik Ndregjoni",
  parent_name: "Agata Ndregjoni",
  parent_email: "agatku@icloud.com",
  parent_phone: PHONE,
  subject: "Erik place held — complete re-enrolment by 23:59",
  body_text: BODY,
  email_status: "skipped",
  whatsapp_status: result.ok ? "sent" : "failed",
  whatsapp_message_id: result.ok ? result.id : null,
  error_detail: result.ok ? null : result.error,
  meta: {
    campaign: CAMPAIGN,
    contact_id: CONTACT_ID,
    reenrol_url: REENROL_URL,
  },
});

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/send-agata-erik-reenroll-hold-whatsapp.json",
  JSON.stringify({ ok: result.ok, result, flat_len: flat.length }, null, 2),
);

if (!result.ok) {
  console.error("FAILED", result.error);
  Deno.exit(1);
}
console.log("SENT", result.id);
