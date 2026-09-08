/**
 * Anas makeup Thu 10: 2:1 Aurora + Simon (follow-up to Aurora-only WA).
 *   npx -y deno run -A database/local-vault/office-send-anas-thu10-aurora-simon-20260908.ts --send
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
const CONTACT_ID = "7560101";
const PHOTO_SIMON = "https://portalvic.vercel.app/portal/staff_photos/simon.png";
const PHOTO_AURORA = "https://portalvic.vercel.app/portal/staff_photos/aurora.png";
const CAMPAIGN = "anas_thu10_aurora_simon_2to1_20260908";

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
  .select("parent_display, parent_first_name, email, mobile, parent_person_id")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (cErr) throw cErr;
if (!contact) throw new Error("contact_missing");

const parentFirst =
  String(contact.parent_first_name || "Heba").trim().split(/\s+/)[0] || "Heba";
const phone = normalizeParentPhoneE164(String(contact.mobile || ""));
if (!phone) throw new Error("bad_phone");

const body =
  `Hi ${parentFirst},\n\n` +
  `This is ClubSENsational.\n\n` +
  `Quick update on Anas's make-up on Thursday 10 Sep, 6 to 6.30 at Acton:\n\n` +
  `He will be with Aurora and Simon together (2:1).\n\n` +
  `Photo of Simon: ${PHOTO_SIMON}\n` +
  `Photo of Aurora: ${PHOTO_AURORA}\n\n` +
  `Please show Anas both photos so he knows who to expect.\n\n` +
  `If you have any questions, just reply to this message.\n\n` +
  `Thank you,\nClubSENsational`;

const flat = flattenWhatsappTemplateBody(body);
console.log({ mode: SEND ? "SEND" : "DRY", flat_len: flat.length, phone_tail: phone.slice(-4) });
console.log(body);
if (flat.length > 700) throw new Error("too long " + flat.length);
if (!SEND) Deno.exit(0);

const result = await sendParentMessageViaWhatsapp(phone, flat, {
  kind: "makeup_scheduled",
  instructorPhotoUrl: PHOTO_SIMON,
  instructorPhotoName: "Simon",
});

const { data: inserted, error: insErr } = await admin
  .from("portal_parent_notify_log")
  .insert({
    sent_by_email: "victor@clubsensational.org",
    kind: "makeup_scheduled",
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: contact.email || null,
    parent_name: contact.parent_display || parentFirst,
    client_display: "Anas",
    session_date: "2026-09-10",
    venue: "Acton",
    subject: "Anas makeup Thu 10 Aurora + Simon 2:1",
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN,
      absent_date: "2026-09-08",
      makeup_date: "2026-09-10",
      covering_staff_name: "Aurora + Simon",
    },
  })
  .select("id")
  .maybeSingle();
if (insErr) throw insErr;
if (result.ok && inserted?.id) {
  await notifyFamilyWebPushForParentNotify({
    notifyLogId: String(inserted.id),
    kind: "makeup_scheduled",
  });
}
console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
if (!result.ok) Deno.exit(1);
