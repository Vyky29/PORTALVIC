/**
 * Tue 8 Sep: Javier Marquez OFF — notify parents of cover + photo + Participant's team.
 *   Ayman → Roberto 4-4.30
 *   Linda / Rayan Ta / Anas → Javi Palankas
 *
 * Dry:  npx -y deno run -A database/local-vault/office-send-tue8-javier-cover-parents-20260908.ts
 * Send: npx -y deno run -A database/local-vault/office-send-tue8-javier-cover-parents-20260908.ts --send
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
const CAMPAIGN = "tue8_javier_off_cover_parents_20260908";
const DATE = "2026-09-08";
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
  absentName: string;
};

const TARGETS: Target[] = [
  {
    contactId: "174",
    childDisplay: "Ayman",
    timeLabel: "4 to 4.30",
    coverName: "Roberto",
    coverPhotoStem: "roberto",
    absentName: "Javier",
  },
  {
    contactId: "338",
    childDisplay: "Linda",
    timeLabel: "5 to 5.30",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    absentName: "Javier",
  },
  {
    contactId: "261",
    childDisplay: "Rayan",
    timeLabel: "5.30 to 6",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    absentName: "Javier",
  },
  {
    contactId: "7560101",
    childDisplay: "Anas",
    timeLabel: "6 to 6.30",
    coverName: "Javi Palankas",
    coverPhotoStem: "javi",
    absentName: "Javier",
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
  absentName: string;
}): string {
  return asciiBody(
    `Hi ${opts.parentFirst},\n\n` +
      `This is ClubSENsational.\n\n` +
      `We are writing about ${opts.child}'s Aquatic session on Tuesday 8 Sep, ${opts.timeLabel} at Acton.\n\n` +
      `There has been a change of instructor. The session will now be with ${opts.coverName} (instead of ${opts.absentName}).\n\n` +
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
    absentName: t.absentName,
  });
  const flat = flattenWhatsappTemplateBody(body);

  console.log(
    JSON.stringify(
      {
        mode: SEND ? "SEND" : "DRY",
        child,
        cover: t.coverName,
        parent: parentFirst,
        phone_tail: phone.slice(-4),
        flat_len: flat.length,
        photoUrl,
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
      venue: "Acton",
      subject: `Instructor update · ${child}`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: CAMPAIGN,
        contact_id: t.contactId,
        covering_staff_name: t.coverName,
        covering_photo: photoUrl,
        absent_staff_name: t.absentName,
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
  return { child, ok: result.ok, id: result.id, error: result.error };
}

const results = [];
for (const t of TARGETS) {
  results.push(await sendOne(t));
}
console.log(JSON.stringify({ mode: SEND ? "SEND" : "DRY", results }, null, 2));
if (SEND && results.some((r) => r && "ok" in r && r.ok === false)) Deno.exit(1);
