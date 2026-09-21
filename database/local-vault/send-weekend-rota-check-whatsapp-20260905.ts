/**
 * Weekend rota check — WhatsApp to instructors on Sat 5 + Sun 6 Sep 2026.
 *
 * LOCAL ONLY by default: writes a review pack under database/local-vault/tmp/
 * and does NOT send. Tomorrow morning, re-run with --send.
 *
 * Preview (no Meta send):
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-weekend-rota-check-whatsapp-20260905.ts
 *
 * Send:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-weekend-rota-check-whatsapp-20260905.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN = "weekend_rota_check_20260905_06";
const PORTAL_URL = "https://www.clubsensational.org/staff_dashboard.html";
const OUT_DIR = "database/local-vault/tmp";
const OUT_JSON = `${OUT_DIR}/weekend-rota-check-20260905-preview.json`;
const OUT_MD = `${OUT_DIR}/weekend-rota-check-20260905-PREVIEW.md`;

/**
 * First Autumn weekend (LOCAL truth):
 * - Sat 5: Youssef Acton
 * - Sun 6: Roberto, Aurora, Berta, Godsway, John (Emanuel Hub cover), Javier, Alex, Carlos
 *   Emanuel OFF · Youssef OFF
 */
const TARGETS: Array<{
  username: string;
  first: string;
  daysLabel: string;
}> = [
  { username: "Youssef", first: "Youssef", daysLabel: "Saturday 5 Sep (Acton)" },
  { username: "Roberto", first: "Roberto", daysLabel: "Sunday 6 Sep (SwimFarm Multi / Aquatic)" },
  { username: "Aurora", first: "Aurora", daysLabel: "Sunday 6 Sep (SwimFarm)" },
  { username: "Berta", first: "Berta", daysLabel: "Sunday 6 Sep (Lead + Hub Multi)" },
  { username: "Godsway", first: "Godsway", daysLabel: "Sunday 6 Sep (Hub Multi)" },
  { username: "John", first: "John", daysLabel: "Sunday 6 Sep (Hub Multi — covering Emanuel book)" },
  { username: "Javier", first: "Javier", daysLabel: "Sunday 6 Sep (SwimFarm)" },
  { username: "Alex", first: "Alex", daysLabel: "Sunday 6 Sep (Westway Climbing)" },
  { username: "Carlos", first: "Carlos", daysLabel: "Sunday 6 Sep (Westway Climbing)" },
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

function buildMessage(first: string, daysLabel: string): string {
  return (
    `Hi ${first},\n\n` +
    `This is the first Autumn weekend on the rota (Sat 5 / Sun 6 Sep).\n\n` +
    `Please open the Staff Portal before your shift and check your book — ` +
    `participants and times are live for your session(s):\n` +
    `${PORTAL_URL}\n\n` +
    `You are on: ${daysLabel}.\n\n` +
    `Thanks,\n` +
    `Office · clubSENsational`
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
  first: string;
  daysLabel: string;
  profileId: string | null;
  phone: string | null;
  phoneMasked: string | null;
  body: string;
  alreadySent: boolean;
};

const rows: Row[] = [];
for (const t of TARGETS) {
  const p = byUser.get(t.username.toLowerCase());
  const phone = p?.phone_e164 ? normalizeParentPhoneE164(p.phone_e164) : null;
  const body = buildMessage(t.first, t.daysLabel);
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
    first: t.first,
    daysLabel: t.daysLabel,
    profileId: p?.id || null,
    phone,
    phoneMasked: phone ? `${phone.slice(0, 6)}…${phone.slice(-3)}` : null,
    body,
    alreadySent,
  });
}

mkdirSync(OUT_DIR, { recursive: true });

const previewPayload = {
  mode: send ? "SEND" : "LOCAL_PREVIEW_ONLY",
  campaign: CAMPAIGN,
  weekend: { saturday: "2026-09-05", sunday: "2026-09-06" },
  note:
    "First Autumn weekend. Sun 6: John covers Emanuel Hub book; Emanuel + Youssef off Sunday.",
  portalUrl: PORTAL_URL,
  howToSendTomorrow:
    "npx -y deno run --allow-env --allow-read --allow-net --allow-write database/local-vault/send-weekend-rota-check-whatsapp-20260905.ts --send",
  targets: rows.map((r) => ({
    username: r.username,
    name: r.name,
    daysLabel: r.daysLabel,
    phoneMasked: r.phoneMasked,
    hasPhone: !!r.phone,
    alreadySent: r.alreadySent,
    body: r.body,
  })),
};

writeFileSync(OUT_JSON, JSON.stringify(previewPayload, null, 2));

const mdLines: string[] = [
  "# Weekend rota check WhatsApp — LOCAL PREVIEW",
  "",
  "**Do not send yet.** Review tonight; send tomorrow morning with `--send`.",
  "",
  `- Campaign: \`${CAMPAIGN}\``,
  `- Weekend: **Sat 5 Sep** + **Sun 6 Sep 2026** (first Autumn weekend)`,
  `- Portal: ${PORTAL_URL}`,
  "",
  "## Recipients",
  "",
  "| Staff | Day | Phone | Ready |",
  "| --- | --- | --- | --- |",
];
for (const r of rows) {
  mdLines.push(
    `| ${r.name} (${r.username}) | ${r.daysLabel} | ${r.phoneMasked || "MISSING"} | ${
      r.phone ? (r.alreadySent ? "already sent" : "OK") : "NO PHONE"
    } |`,
  );
}
mdLines.push("", "## Full message per person", "");
for (const r of rows) {
  mdLines.push(`### ${r.name}`, "", "```", r.body, "```", "");
}
mdLines.push(
  "## Send tomorrow",
  "",
  "```bash",
  previewPayload.howToSendTomorrow,
  "```",
  "",
);
writeFileSync(OUT_MD, mdLines.join("\n"));

console.log(JSON.stringify({
  mode: previewPayload.mode,
  campaign: CAMPAIGN,
  previewMd: OUT_MD,
  previewJson: OUT_JSON,
  targets: rows.map((r) => ({
    username: r.username,
    phone: r.phoneMasked,
    days: r.daysLabel,
    alreadySent: r.alreadySent,
    hasPhone: !!r.phone,
  })),
}, null, 2));

if (!send) {
  console.log(`\nLOCAL ONLY — open ${OUT_MD}`);
  console.log("No WhatsApp sent. Re-run with --send tomorrow morning.");
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
    subject: "Weekend rota check — Sat 5 / Sun 6 Sep",
    body_text: r.body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN,
      username: r.username,
      daysLabel: r.daysLabel,
      portal_url: PORTAL_URL,
    },
  });
  if (result.ok) {
    console.log(`WA OK ${r.username} → ${r.phoneMasked}`);
    report.push({ username: r.username, ok: true, id: result.id });
  } else {
    console.error(`WA FAIL ${r.username}: ${result.error}`);
    report.push({ username: r.username, ok: false, error: result.error });
  }
  await new Promise((res) => setTimeout(res, 400));
}

const reportPath = `${OUT_DIR}/weekend-rota-check-20260905-send-report.json`;
writeFileSync(reportPath, JSON.stringify({ campaign: CAMPAIGN, report }, null, 2));
console.log(JSON.stringify({ reportPath, report }, null, 2));
