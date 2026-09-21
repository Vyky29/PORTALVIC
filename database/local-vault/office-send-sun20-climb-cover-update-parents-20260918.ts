/**
 * Sun 20 Sep Climb: Angel cover already messaged (15 Sep).
 * Admin reassigned hazem/zaid/serine/zakariya → Javi Palankas; patrick → Alex.
 * Send instructor_change_update WhatsApps (parents already knew Angel).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-send-sun20-climb-cover-update-parents-20260918.ts
 * Send: npx -y deno run -A database/local-vault/office-send-sun20-climb-cover-update-parents-20260918.ts --send
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
const KIND = "instructor_change_update";
const CAMPAIGN = "sun20_climb_angel_to_javi_alex_20260918";
const DATE = "2026-09-20";
const PHOTO_BASE = "https://portalvic.vercel.app/portal/staff_photos";

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

function asciiBody(body: string): string {
  return String(body || "")
    .replace(/\u2022/g, "-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/'/g, "'")
    .replace(/'/g, "'");
}

type Target = {
  contactId: string;
  childDisplay: string;
  timeLabel: string;
  coverName: string;
  coverPhotoStem: string;
  prevCover: string;
};

const TARGETS: Target[] = [
  {
    contactId: "40",
    childDisplay: "Hazem",
    timeLabel: "10 to 11",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    prevCover: "Angel",
  },
  {
    contactId: "68",
    childDisplay: "Zaid",
    timeLabel: "11 to 12",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    prevCover: "Angel",
  },
  {
    contactId: "58",
    childDisplay: "Serine",
    timeLabel: "12 to 1",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    prevCover: "Angel",
  },
  {
    contactId: "42",
    childDisplay: "Zakariya",
    timeLabel: "1 to 2",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    prevCover: "Angel",
  },
  {
    contactId: "7559001",
    childDisplay: "Patrick",
    timeLabel: "3 to 4",
    coverName: "Alex",
    coverPhotoStem: "alex",
    prevCover: "Angel",
  },
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function buildBody(opts: {
  parentFirst: string;
  child: string;
  timeLabel: string;
  coverName: string;
  photoUrl: string;
  prevCover: string;
}): string {
  return asciiBody(
    `Hi ${opts.parentFirst},\n\n` +
      `This is ClubSENsational.\n\n` +
      `We are writing about ${opts.child}'s Climbing session on Sunday 20 September, ${opts.timeLabel} at Westway.\n\n` +
      `A quick update: we previously told you the session would be with ${opts.prevCover}. ` +
      `There has been a further change of instructor. The session will now be with ${opts.coverName}.\n\n` +
      `Photo of ${opts.coverName} (your instructor): ${opts.photoUrl}\n` +
      `Please show ${opts.child} the photo above so they know who to expect.\n\n` +
      `You can also see ${opts.coverName} under ${opts.child}'s Team in the Family Portal (Participant's team).\n\n` +
      `If you have any questions, just reply to this message.\n\n` +
      `Thank you,\nClubSENsational`,
  );
}

async function sendOne(t: Target) {
  const { data: contact, error: cErr } = await admin
    .from("portal_parent_contacts")
    .select(
      "contact_id, parent_display, parent_first_name, child_first_name, email, mobile, parent_person_id",
    )
    .eq("contact_id", t.contactId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!contact) throw new Error(`contact_missing ${t.contactId}`);

  const parentFirst =
    String(contact.parent_first_name || contact.parent_display || "there")
      .trim()
      .split(/\s+/)[0] || "there";
  const child = t.childDisplay;
  const phone = normalizeParentPhoneE164(String(contact.mobile || ""));
  if (!phone) throw new Error(`bad_phone ${t.contactId}`);

  const photoUrl = `${PHOTO_BASE}/${t.coverPhotoStem}.png`;
  const body = buildBody({
    parentFirst,
    child,
    timeLabel: t.timeLabel,
    coverName: t.coverName,
    photoUrl,
    prevCover: t.prevCover,
  });
  const flat = flattenWhatsappTemplateBody(body);

  console.log(
    JSON.stringify(
      {
        mode: SEND ? "SEND" : "DRY",
        child,
        cover: t.coverName,
        prev: t.prevCover,
        parent: parentFirst,
        phone_tail: phone.slice(-4),
        flat_len: flat.length,
      },
      null,
      2,
    ),
  );
  console.log(body);
  console.log("---");

  if (flat.length > 700) {
    throw new Error(`Body too long for cold template: ${flat.length} (${child})`);
  }

  if (!SEND) return { child, ok: true as const, dry: true };

  const { data: prior } = await admin
    .from("portal_parent_notify_log")
    .select("id")
    .eq("kind", KIND)
    .eq("parent_phone", phone)
    .eq("client_display", child)
    .contains("meta", { campaign: CAMPAIGN })
    .in("whatsapp_status", ["sent", "delivered", "read"])
    .limit(1);
  if (prior?.length) {
    console.log("SKIP already_sent", child);
    return { child, ok: true as const, skipped: true };
  }

  const result = await sendParentMessageViaWhatsapp(phone, flat, {
    kind: KIND,
    instructorPhotoUrl: photoUrl,
    instructorPhotoName: t.coverName,
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
      client_display: child,
      session_date: DATE,
      venue: "Westway",
      subject: `Instructor update · ${child} (${t.coverName} covers Sun 20 Climb ${t.timeLabel})`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: CAMPAIGN,
        contact_id: t.contactId,
        covering_staff_name: t.coverName,
        covering_photo: photoUrl,
        prior_covering_staff_name: t.prevCover,
        time_slot: t.timeLabel,
        parent_person_id: contact.parent_person_id || null,
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

  console.log(result.ok ? `SENT ${child} ${result.id}` : `FAIL ${child} ${result.error}`);
  return { child, ok: result.ok, id: result.ok ? result.id : null, error: result.ok ? null : result.error };
}

for (const t of TARGETS) {
  await sendOne(t);
}
console.log(SEND ? "Done (send)." : "Dry only. Re-run with --send.");
