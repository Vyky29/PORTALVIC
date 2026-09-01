/**
 * One-off: explain potential-clients tracker to Sevitha (EN) via Meta WhatsApp.
 *
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-sevitha-potential-clients-whatsapp.ts
 *
 *   ... --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN = "sevitha_potential_clients_tracker_20260817";
const OUT = "database/local-vault/tmp/sevitha-potential-clients-wa-report.json";
const ADMIN_URL =
  "https://www.clubsensational.org/admin_dashboard.html#portal_open=leads";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = readFileSync("local-secrets/secrets.env", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
      : "";
  } catch {
    return "";
  }
}

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "PORTAL_STAFF_WHATSAPP_TEMPLATE",
  "META_WHATSAPP_TEMPLATE_LANG",
]) {
  if (!Deno.env.get(key)) {
    const value = secret(key);
    if (value) Deno.env.set(key, value);
  }
}

function buildMessage(): string {
  return (
    `Hi Sevitha,\n\n` +
    `Quick update from the office portal — the Potential clients tracker you asked for is live.\n\n` +
    `Where: Admin dashboard → Enquiries & intake\n` +
    `${ADMIN_URL}\n\n` +
    `What you can track for each person:\n` +
    `• Email + phone\n` +
    `• Enquiry / notes\n` +
    `• Activity of interest (e.g. Aquatic Wed)\n` +
    `• Track status: New, Following up, Waiting, Not booking, Booked, Closed\n\n` +
    `Marketing rule: if the track status is anything other than Booked, their email is added to the marketing outreach list automatically (so we can email them from Family broadcast).\n\n` +
    `How to use: fill the form at the top (“Add / update potential client”) and tap Save potential. You can also change Track status on any row in the table.\n\n` +
    `Separate note — Interviews: candidates already live under Admin → Interviews (Supabase). To reopen someone, sign in to Admin with your office login (not WordPress).\n\n` +
    `Any questions, message me here.\n` +
    `Thanks,\nVictor / PORTAL`
  );
}

const send = Deno.args.includes("--send");
const body = buildMessage();
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: profile, error } = await admin
  .from("staff_profiles")
  .select("id, username, full_name, phone_e164")
  .ilike("username", "sevitha")
  .maybeSingle();
if (error) throw error;

const phone = profile?.phone_e164
  ? normalizeParentPhoneE164(profile.phone_e164)
  : null;

console.log(
  JSON.stringify(
    {
      mode: send ? "SEND" : "DRY_RUN",
      campaign: CAMPAIGN,
      name: profile?.full_name || "Sevitha",
      username: profile?.username || null,
      phone: phone ? `${phone.slice(0, 6)}…${phone.slice(-3)}` : null,
      preview: body.slice(0, 220) + "…",
      chars: body.length,
    },
    null,
    2,
  ),
);

if (!send) {
  console.log("\nDry run only. Re-run with --send to deliver.");
  Deno.exit(0);
}

if (!phone) {
  console.error("FAIL: Sevitha has no phone_e164 on staff_profiles");
  Deno.exit(1);
}

const result = await sendParentMessageViaWhatsapp(phone, body, {
  kind: "staff_contact_update",
});

await admin.from("portal_staff_notify_log").insert({
  sent_by_user_id: null,
  sent_by_email: "system@clubsensational.org",
  kind: CAMPAIGN,
  channel: "whatsapp",
  staff_profile_id: profile?.id || null,
  staff_username: "sevitha",
  staff_display_name: profile?.full_name || "Sevitha",
  staff_phone: phone,
  subject: "Potential clients tracker live",
  body_text: body,
  whatsapp_status: result.ok ? "sent" : "failed",
  whatsapp_message_id: result.ok ? result.id : null,
  error_detail: result.ok ? null : result.error,
  meta: { campaign: CAMPAIGN, admin_url: ADMIN_URL },
});

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ campaign: CAMPAIGN, phone_masked: `${phone.slice(0, 6)}…`, result }, null, 2),
);

if (result.ok) {
  console.log(`WA OK Sevitha → ${phone.slice(0, 6)}…${phone.slice(-3)} id=${result.id}`);
} else {
  console.error(`WA FAIL: ${result.error}`);
  Deno.exit(1);
}
console.log(JSON.stringify({ reportPath: OUT }, null, 2));
