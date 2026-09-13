/**
 * Fix stale post-trial offer for Muhammad climb (still said 3-4 after noon move)
 * + correction WhatsApp to Asli.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-fix-asli-muhammad-post-trial-time-20260913.ts
 * Send: npx -y deno run -A database/local-vault/office-fix-asli-muhammad-post-trial-time-20260913.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const OFFER_ID = "96b81b4e-a634-4243-a579-f2e02c5c41ab";
const RES_ID = "7174048f-bc50-4bd0-9a13-961d90b2d907";
const KIND = "post_trial_offer_time_correction_20260913";
const BOOKING_URL = "https://www.clubsensational.org/bookingportal";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: res, error: resErr } = await admin
  .from("portal_booking_slot_reservations")
  .select("id,time_label,venue,service_name,slot_id,date_iso,parent_phone,parent_name,parent_email,participant_name")
  .eq("id", RES_ID)
  .maybeSingle();
if (resErr) throw resErr;
if (!res) throw new Error("missing_reservation");

const { data: offer, error: offErr } = await admin
  .from("portal_post_trial_offers")
  .select("*")
  .eq("id", OFFER_ID)
  .maybeSingle();
if (offErr) throw offErr;
if (!offer) throw new Error("missing_offer");

console.log("reservation time", res.time_label, res.slot_id);
console.log("offer before", offer.trial_time_label, offer.slot_id);

const patch = {
  trial_time_label: String(res.time_label || "").trim() || "12.00 – 13.00",
  trial_venue: String(res.venue || offer.trial_venue || "Westway").trim(),
  trial_service: String(res.service_name || offer.trial_service || "Climbing Activity").trim(),
  slot_id: String(res.slot_id || "").trim() || offer.slot_id,
  trial_session_date: String(res.date_iso || offer.trial_session_date || "").slice(0, 10),
  updated_at: new Date().toISOString(),
  meta: {
    ...(offer.meta && typeof offer.meta === "object" ? offer.meta : {}),
    time_corrected_from: offer.trial_time_label,
    time_corrected_at: new Date().toISOString(),
    time_corrected_note: KIND,
  },
};

console.log("offer patch", patch);

const body =
  `Hi Asli,\n\n` +
  `Sorry - a quick correction. Muhammad's climbing trial today at Westway was ` +
  `12.00-13.00 (not 3.00-4.00 as the earlier automated message said).\n\n` +
  `You can still book a term place - the same slot or a different one - here:\n` +
  `${BOOKING_URL}\n\n` +
  `Please finish booking by tonight (2026-09-13, end of day). ` +
  `If you do not want a continuing place, reply FREE and we will release it now.\n\n` +
  `Thanks,\n` +
  `Office | clubSENsational`;

const phone = normalizeParentPhoneE164(
  String(res.parent_phone || offer.parent_phone || ""),
);
console.log("phone", phone);
console.log("body\n", body);
console.log("SEND", SEND);

if (!SEND) {
  console.log("Dry-run. Pass --send to update offer + WhatsApp Asli.");
  Deno.exit(0);
}

const { error: upErr } = await admin
  .from("portal_post_trial_offers")
  .update(patch)
  .eq("id", OFFER_ID);
if (upErr) throw upErr;
console.log("offer updated");

if (!phone) throw new Error("bad_phone");

const flat = flattenWhatsappTemplateBody(body);
const result = await sendParentMessageViaWhatsapp(phone, flat, {
  kind: "contact_update",
});

await admin.from("portal_parent_notify_log").insert({
  sent_by_email: "system@clubsensational.org",
  kind: KIND,
  channel: "whatsapp",
  parent_phone: phone,
  parent_email: String(res.parent_email || offer.parent_email || "") || null,
  parent_name: String(res.parent_name || offer.parent_name || "Asli"),
  subject: "Post-trial offer time correction · Muhammad",
  body_text: body,
  whatsapp_status: result.ok ? "sent" : "failed",
  whatsapp_message_id: result.ok ? result.id : null,
  error_detail: result.ok ? null : result.error,
  meta: {
    campaign: KIND,
    offer_id: OFFER_ID,
    reservation_id: RES_ID,
    corrected_from: "3.00 – 4.00",
    corrected_to: patch.trial_time_label,
    booking_url: BOOKING_URL,
  },
});

if (!result.ok) {
  console.error("whatsapp failed", result.error);
  Deno.exit(1);
}
console.log("whatsapp ok", result.id);
