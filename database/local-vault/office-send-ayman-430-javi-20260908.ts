/**
 * Follow-up: Ayman 4.30-5 today is with Javi Palankas (after Roberto 4-4.30).
 *
 *   npx -y deno run -A database/local-vault/office-send-ayman-430-javi-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import { notifyFamilyWebPushForParentNotify } from "../../supabase/functions/_shared/portal_family_webpush_notify.ts";

const SEND = Deno.args.includes("--send");
const KIND = "instructor_change";
const CAMPAIGN = "tue8_ayman_430_javi_20260908";
const CONTACT_ID = "174";
const PHOTO = "https://portalvic.vercel.app/portal/staff_photos/javi.png";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: contact, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, parent_display, parent_first_name, child_first_name, email, mobile, parent_person_id",
  )
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (cErr) throw cErr;
if (!contact) throw new Error("contact_missing");

const parentFirst =
  String(contact.parent_first_name || "Zeyna").trim().split(/\s+/)[0] || "Zeyna";
const phone = normalizeParentPhoneE164(String(contact.mobile || ""));
if (!phone) throw new Error("bad_phone");

const body =
  `Hi ${parentFirst},\n\n` +
  `This is ClubSENsational.\n\n` +
  `Quick update for Ayman's Aquatic today at Acton: 4 to 4.30 is with Roberto (as we messaged), and 4.30 to 5 will be with Javi Palankas.\n\n` +
  `Photo of Javi Palankas (your instructor): ${PHOTO}\n` +
  `Please show Ayman the photo above so they know who to expect.\n\n` +
  `You can also see Javi Palankas under Ayman's Team in the Family Portal (Participant's team).\n\n` +
  `If you have any questions, just reply to this message.\n\n` +
  `Thank you,\nClubSENsational`;

const flat = flattenWhatsappTemplateBody(body);
console.log({ mode: SEND ? "SEND" : "DRY", flat_len: flat.length, phone_tail: phone.slice(-4) });
console.log(body);
if (flat.length > 700) throw new Error("too long " + flat.length);
if (!SEND) Deno.exit(0);

const result = await sendParentMessageViaWhatsapp(phone, flat, {
  kind: KIND,
  instructorPhotoUrl: PHOTO,
  instructorPhotoName: "Javi Palankas",
});

const { data: inserted, error: insErr } = await admin
  .from("portal_parent_notify_log")
  .insert({
    sent_by_email: "victor@clubsensational.org",
    kind: KIND,
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: contact.email || null,
    parent_name: contact.parent_display || parentFirst,
    client_display: "Ayman",
    session_date: "2026-09-08",
    venue: "Acton",
    subject: "Instructor update · Ayman 4.30-5",
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN,
      covering_staff_name: "Javi Palankas",
      time_slot: "4.30 to 5",
      note: "second half after Roberto 4-4.30",
    },
  })
  .select("id")
  .maybeSingle();
if (insErr) throw insErr;
if (result.ok && inserted?.id) {
  await notifyFamilyWebPushForParentNotify({
    notifyLogId: String(inserted.id),
    kind: KIND,
  });
}
console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
if (!result.ok) Deno.exit(1);
