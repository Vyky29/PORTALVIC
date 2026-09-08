/**
 * Catch-up post-trial offer (rule not live yet when these trials ran).
 * Zaid Sun 6 Sep SwimFarm Aquatic 9-9.30 · Muhammad Mon 7 Sep Northolt Aquatic 4.30-5.
 * Deadline: end of Tuesday 8 Sep (London) — trial days already passed.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-send-post-trial-offer-catchup-20260908.ts
 * Send: npx -y deno run -A database/local-vault/office-send-post-trial-offer-catchup-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const CAMPAIGN = "post_trial_offer_catchup_20260908";
const BOOKING_URL = "https://www.clubsensational.org/bookingportal";
const DEADLINE = "tonight (Tuesday 8 Sep, end of day)";
const OUT = "database/local-vault/tmp/post-trial-offer-catchup-20260908-report.json";

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

type Target = {
  reservationId: string;
  first: string;
  parent: string;
  phone: string;
  email: string;
  child: string;
  trialLabel: string;
};

const TARGETS: Target[] = [
  {
    reservationId: "df7b1f78-f643-419b-8225-2ddea28535f2",
    first: "Zaynab",
    parent: "Zaynab Alfadhl",
    phone: "+447852758314",
    email: "zaynab1980@hotmail.com",
    child: "Zaid",
    trialLabel: "SwimFarm · Aquatic · Sunday 9.00-9.30 (6 Sep)",
  },
  {
    reservationId: "7f161007-6ecf-4725-9c4b-e02ee105aee3",
    first: "Asli",
    parent: "Asli",
    phone: "07956309898",
    email: "bintu_gargaar@hotmail.com",
    child: "Muhammad",
    trialLabel: "Northolt · Aquatic · Monday 4.30-5.00 (7 Sep)",
  },
];

function buildBody(t: Target): string {
  return (
    `Hi ${t.first},\n\n` +
    `${t.child}'s trial (${t.trialLabel}) has finished.\n\n` +
    `You can now book a term place — the same slot or a different one — and complete payment here:\n` +
    `${BOOKING_URL}\n\n` +
    `Please finish booking by ${DEADLINE}. ` +
    `If we do not hear from you by then, the place will be released for other families.\n\n` +
    `If you do not want a continuing place, reply FREE and we will release it now.\n\n` +
    `Thanks,\n` +
    `Office | clubSENsational`
  );
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

mkdirSync("database/local-vault/tmp", { recursive: true });

const report: Array<Record<string, unknown>> = [];

console.log(JSON.stringify({ mode: SEND ? "SEND" : "DRY", campaign: CAMPAIGN, n: TARGETS.length }, null, 2));

for (const t of TARGETS) {
  const body = buildBody(t);
  const phone = normalizeParentPhoneE164(t.phone);
  console.log("\n---", t.child, phone || "NO_PHONE");
  console.log(body);
  if (!SEND) {
    report.push({ child: t.child, phone, dry: true });
    continue;
  }
  if (!phone) {
    report.push({ child: t.child, skipped: "bad_phone" });
    continue;
  }
  const { data: prior } = await admin
    .from("portal_parent_notify_log")
    .select("id")
    .eq("kind", CAMPAIGN)
    .eq("parent_phone", phone)
    .in("whatsapp_status", ["sent", "delivered", "read"])
    .limit(1);
  if (prior?.length) {
    report.push({ child: t.child, phone, skipped: "already_sent" });
    console.log("SKIP already_sent");
    continue;
  }
  const flat = flattenWhatsappTemplateBody(body);
  const result = await sendParentMessageViaWhatsapp(phone, flat, {
    kind: "contact_update",
  });
  await admin.from("portal_parent_notify_log").insert({
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN,
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: t.email || null,
    parent_name: t.parent,
    subject: `Post-trial offer — ${t.child} (catch-up)`,
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN,
      reservation_id: t.reservationId,
      child: t.child,
      trial_label: t.trialLabel,
      deadline: "2026-09-08T23:59:59+01:00",
      booking_url: BOOKING_URL,
      wave: "catchup_immediate",
    },
  });
  const { data: resRow } = await admin
    .from("portal_booking_slot_reservations")
    .select("notes")
    .eq("id", t.reservationId)
    .maybeSingle();
  const prevNotes = String(resRow?.notes || "").replace(
    /\|?post_trial_offer_sent_20260908\|?post_trial_deadline_20260908/gi,
    "",
  );
  await admin
    .from("portal_booking_slot_reservations")
    .update({
      notes: `${prevNotes}|post_trial_offer_sent_20260908|post_trial_deadline_20260908`
        .replace(/\|\|+/g, "|")
        .replace(/^\|/, ""),
    })
    .eq("id", t.reservationId);

  report.push({
    child: t.child,
    phone,
    ok: result.ok,
    id: result.ok ? result.id : null,
    error: result.ok ? null : result.error,
  });
  console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(OUT, JSON.stringify({ campaign: CAMPAIGN, report }, null, 2));
console.log("\nReport", OUT);
if (!SEND) console.log("\nDry-run only. Re-run with --send to deliver.");
