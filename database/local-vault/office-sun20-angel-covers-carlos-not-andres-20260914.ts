/**
 * Sun 20 Sep: Carlos Westway Climb cover Andres → Angel (full book).
 * WhatsApp Angel: open Staff Portal to review participants.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-sun20-angel-covers-carlos-not-andres-20260914.ts
 * Apply covers: ... --apply
 * Send WA:      ... --apply --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = Deno.args.includes("--apply");
const SEND = Deno.args.includes("--send");
const ISO = "2026-09-20";
const REV = "office:sun20-angel-covers-carlos-not-andres-20260914";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";
const ANGEL_ID = "3025f245-947e-49e0-8e31-6366051ceb9e";
const PORTAL_URL = "https://clubsensational-staff.vercel.app/staff_dashboard.html";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error } = await admin
  .from("schedule_overrides")
  .select(
    "id,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_time_slot_label,payload,reason",
  )
  .eq("session_date", ISO)
  .eq("status", "active")
  .eq("override_type", "instructor_reassign")
  .eq("anchor_staff_id", "carlos");
if (error) throw error;

const andres = (rows || []).filter(
  (r) => String((r.payload || {}).covering_staff_id || "").toLowerCase() === "andres",
);
const angel = (rows || []).filter(
  (r) => String((r.payload || {}).covering_staff_id || "").toLowerCase() === "angel",
);

console.log("Sun 20 Carlos climb covers", {
  andres: andres.map((r) => `${r.anchor_client_id}@${r.anchor_time_slot_label}`),
  angelAlready: angel.map((r) => `${r.anchor_client_id}@${r.anchor_time_slot_label}`),
  apply: APPLY,
  send: SEND,
});

if (!APPLY) {
  console.log("Dry only. Re-run with --apply (and --send for WhatsApp).");
  Deno.exit(0);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ACTOR_EMAIL = "victor@clubsensational.org";

async function mintActorAccessToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: ACTOR_EMAIL }),
  });
  const j = await res.json();
  const tokenHash = String(j.hashed_token || "");
  if (!tokenHash) throw new Error("no hashed_token: " + JSON.stringify(j));
  const verify = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verify.json();
  if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session));
  return String(session.access_token);
}

const accessToken = await mintActorAccessToken();
const asVictor = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const r of andres) {
  const pl = { ...(r.payload && typeof r.payload === "object" ? r.payload : {}) };
  pl.covering_staff_id = "angel";
  pl.covering_staff_name = "Angel";
  pl.absent_staff_id = pl.absent_staff_id || "carlos";
  pl.absent_staff_name = pl.absent_staff_name || "Carlos";
  const startHm = String(r.anchor_start || "").slice(0, 5);
  const cid = String(r.anchor_client_id || "").toLowerCase();
  pl.portal_session_key = `${ISO}|${startHm}|${cid}|carlos`;
  const { error: upErr } = await asVictor
    .from("schedule_overrides")
    .update({
      payload: pl,
      reason: `Angel covers Carlos — ${cid} Westway Climb ${r.anchor_time_slot_label} ${ISO}`,
      spreadsheet_revision: REV,
    })
    .eq("id", r.id)
    .eq("status", "active");
  if (upErr) throw new Error("update " + r.id + ": " + upErr.message);
}
console.log("retargeted Andres→Angel", andres.length);

const { error: carlosOffErr } = await admin
  .from("staff_unavailability")
  .update({
    reason: "Time off requested — Angel covers Westway Climbing",
  })
  .eq("off_date", ISO)
  .eq("name_key", "carlosherrero");
if (carlosOffErr) console.warn("carlos unavail note:", carlosOffErr.message);
else console.log("carlos unavailability reason → Angel");

const { data: profile, error: pe } = await admin
  .from("staff_profiles")
  .select("id, username, full_name, phone_e164")
  .eq("id", ANGEL_ID)
  .maybeSingle();
if (pe) throw pe;
const phone = normalizeParentPhoneE164(String(profile?.phone_e164 || ""));
const kids = andres
  .map((r) => String(r.anchor_client_id || "").trim())
  .filter((c) => c && c !== "available")
  .map((c) => c.charAt(0).toUpperCase() + c.slice(1));
const body =
  `Hi Angel,\n\n` +
  `Sunday 20 Sep you cover Carlos at Westway Climbing (Hazem, Zaid, Serine, Zakariya, Patrick).\n\n` +
  `Please open your Staff Portal now and check the participants for that day:\n` +
  `${PORTAL_URL}?portalReviewDate=${ISO}&portalReviewDay=Sunday\n\n` +
  `Thank you,\nclubSENsational office`;

console.log("\nWA to Angel phone=", phone || "MISSING");
console.log(body);

if (SEND) {
  if (!phone || !profile?.id) {
    console.log("SKIP WA: missing phone/profile");
  } else {
    const flat = flattenWhatsappTemplateBody(body);
    const result = await sendParentMobileMessage(phone, flat, {
      kind: "staff_contact_update",
    });
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: "cover_brief_wa",
      channel: "whatsapp",
      staff_profile_id: profile.id,
      staff_username: String(profile.username || "").toLowerCase(),
      staff_display_name: "Angel",
      staff_phone: phone,
      subject: `Sun 20 cover Carlos climb — open portal`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: "sun20_angel_carlos_climb_20260914",
        session_date: ISO,
        participants: kids,
      },
    });
    console.log(result.ok ? `WA SENT ${result.id}` : `WA FAILED ${result.error}`);
  }
} else {
  console.log("\nCovers applied. Re-run with --send to deliver WhatsApp.");
}

const { data: verify } = await admin
  .from("schedule_overrides")
  .select("anchor_client_id,anchor_time_slot_label,payload")
  .eq("session_date", ISO)
  .eq("status", "active")
  .eq("override_type", "instructor_reassign")
  .eq("anchor_staff_id", "carlos");
console.log(
  "\nverify covers",
  (verify || []).map((r) => ({
    client: r.anchor_client_id,
    slot: r.anchor_time_slot_label,
    cover: (r.payload as Record<string, unknown>)?.covering_staff_id,
  })),
);
