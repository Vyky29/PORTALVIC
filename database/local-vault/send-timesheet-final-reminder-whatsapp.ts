/**
 * Final timesheet reminder (25 Jun → 24 Jul cycle) via Meta WhatsApp API.
 *
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-timesheet-final-reminder-whatsapp.ts
 *
 *   ... --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN = "timesheet_final_reminder_20260724_es";
const TIMESHEET_URL = "https://www.clubsensational.org/timesheet.html";
const OUT = "database/local-vault/tmp/timesheet-final-reminder-send-report.json";

const TARGETS = [
  { username: "Bismark", first: "Bismark" },
  { username: "Angel", first: "Angel" },
];

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

function buildMessage(first: string): string {
  return (
    `Hola ${first},\n\n` +
    `ÚLTIMO AVISO — timesheet del 25 de junio al 24 de julio.\n\n` +
    `Abre el Staff Portal y pulsa Submit esta noche (viernes 24 de julio) antes de medianoche:\n` +
    `${TIMESHEET_URL}\n\n` +
    `Si no lo envías a tiempo, hay una penalización de £5 y las horas pasan a la nómina del mes siguiente.\n\n` +
    `Gracias,\nOficina clubSENsational`
  );
}

const send = Deno.args.includes("--send");
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: profiles, error } = await admin
  .from("staff_profiles")
  .select("id, username, full_name, phone_e164")
  .in(
    "username",
    TARGETS.map((t) => t.username),
  );
if (error) throw error;

const byUser = new Map(
  (profiles || []).map((p) => [String(p.username || "").toLowerCase(), p]),
);

type Row = {
  username: string;
  name: string;
  profileId: string | null;
  phone: string | null;
  body: string;
  alreadySent: boolean;
};

const rows: Row[] = [];
for (const t of TARGETS) {
  const p = byUser.get(t.username.toLowerCase());
  const phone = p?.phone_e164 ? normalizeParentPhoneE164(p.phone_e164) : null;
  const body = buildMessage(t.first);
  let alreadySent = false;
  if (phone) {
    const { data: prior } = await admin
      .from("portal_staff_notify_log")
      .select("id, created_at, whatsapp_status")
      .eq("kind", CAMPAIGN)
      .eq("staff_phone", phone)
      .in("whatsapp_status", ["sent", "delivered", "read"])
      .limit(1);
    alreadySent = !!(prior && prior.length);
  }
  rows.push({
    username: t.username,
    name: p?.full_name || t.username,
    profileId: p?.id || null,
    phone,
    body,
    alreadySent,
  });
}

console.log(JSON.stringify({
  mode: send ? "SEND" : "DRY_RUN",
  campaign: CAMPAIGN,
  targets: rows.map((r) => ({
    username: r.username,
    name: r.name,
    phone: r.phone ? `${r.phone.slice(0, 6)}…${r.phone.slice(-3)}` : null,
    alreadySent: r.alreadySent,
    preview: r.body.slice(0, 120) + "…",
  })),
}, null, 2));

if (!send) {
  console.log("\nDry run only. Re-run with --send to deliver.");
  Deno.exit(0);
}

const report: Array<Record<string, unknown>> = [];
for (const r of rows) {
  if (!r.phone) {
    report.push({ username: r.username, ok: false, error: "no_phone" });
    console.error(`FAIL ${r.username}: no phone`);
    continue;
  }
  if (r.alreadySent) {
    report.push({ username: r.username, ok: true, skipped: "already_sent" });
    console.log(`SKIP ${r.username}: already sent this campaign`);
    continue;
  }
  const result = await sendParentMessageViaWhatsapp(r.phone, r.body, {
    kind: "staff_contact_update",
  });
  await admin.from("portal_staff_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN,
    channel: "whatsapp",
    staff_profile_id: r.profileId,
    staff_username: r.username.toLowerCase(),
    staff_display_name: r.name,
    staff_phone: r.phone,
    subject: "Final reminder — timesheet by midnight 24 Jul",
    body_text: r.body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: { campaign: CAMPAIGN, username: r.username, timesheet_url: TIMESHEET_URL },
  });
  if (result.ok) {
    console.log(`WA OK ${r.username} → ${r.phone.slice(0, 6)}…${r.phone.slice(-3)}`);
    report.push({ username: r.username, ok: true, id: result.id });
  } else {
    console.error(`WA FAIL ${r.username}: ${result.error}`);
    report.push({ username: r.username, ok: false, error: result.error });
  }
  await new Promise((res) => setTimeout(res, 400));
}

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(OUT, JSON.stringify({ campaign: CAMPAIGN, report }, null, 2));
console.log(JSON.stringify({ reportPath: OUT, report }, null, 2));
