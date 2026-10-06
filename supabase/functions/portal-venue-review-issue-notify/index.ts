// @ts-nocheck — Edge Function (Deno).
//
// When a venue review is saved with issues:
// - SwimFarm (the pool) → WhatsApp to the pool owner, message first, then photos and video.
//   Opening and closing of the same day go in one send when both are still unsent.
// - Hub room, and every other venue → admin bell + admin push only. Never the pool owner.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          PORTAL_SWIMFARM_OWNER_WHATSAPP, META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID,
//          PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE, PORTAL_PUSH_WEBHOOK_SECRET, VAPID_*.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../_shared/portal_parent_messaging.ts";
import {
  classifyWhatsappMediaMime,
  sendWhatsappMediaById,
  type WhatsappMediaKind,
} from "../_shared/portal_whatsapp_media.ts";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  insertDedupeOrSkip,
  loadAdminCeoUserIds,
  sendPushPayloadToUserIds,
} from "../_shared/portal_webpush_util.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

const VIDEO_MAX = 15 * 1024 * 1024;
const IMAGE_MAX = 5 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function venueLane(name: unknown): "pool" | "hub" | "other" {
  const s = clean(name, 120).toLowerCase();
  if (s.includes("hub")) return "hub";
  if (s.includes("swimfarm") || s.includes("swim farm") || s.includes("piscina")) return "pool";
  return "other";
}

function issuesYes(row: Record<string, unknown>): boolean {
  const flag = clean(row.has_issues, 8).toLowerCase();
  const notes = clean(row.issues_reported, 4000);
  return flag === "yes" && !!notes;
}

function tidyNote(raw: unknown): string {
  let t = String(raw ?? "");
  t = t.replace(/[\u2014\u2013]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  t = t.replace(/\b(?:\+?44\s?|0)7\d{3}\s?\d{6}\b/g, "");
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "");
  t = t.replace(/!{2,}/g, ".").replace(/\?{2,}/g, "?");
  t = t.replace(/\bcall me\b/gi, "");
  t = t.replace(/\s+\bn\b\s+/g, " and ");
  t = t.replace(/\ba kid\b/gi, "a child");
  t = t.replace(/\bis dead\b/gi, "is not working");
  t = t.replace(/\s+/g, " ").trim();
  if (!t || t === "-") return "";
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) t = t.toLowerCase();
  return t.split(/[.!?]+/).map((part) => {
    const p = part.replace(/\s+/g, " ").trim();
    if (!p) return "";
    return p.charAt(0).toUpperCase() + p.slice(1) + ".";
  }).filter(Boolean).join(" ");
}

function clockLabel(raw: unknown): string {
  const m = clean(raw, 16).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return clean(raw, 16);
  return (m[1].length === 1 ? "0" + m[1] : m[1]) + ":" + m[2];
}

function friendlyDate(iso: unknown): string {
  const day = clean(iso, 12).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day || "this date";
  try {
    return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch (_e) {
    return day;
  }
}

function sideOf(row: Record<string, unknown>): "Opening" | "Closing" {
  return /clos/i.test(clean(row.opening_or_closing, 20)) ? "Closing" : "Opening";
}

function photoPaths(row: Record<string, unknown>): string[] {
  const raw = row.photo_storage_paths;
  if (Array.isArray(raw)) return raw.map((p) => clean(p, 400)).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((p) => clean(p, 400)).filter(Boolean);
    } catch (_e) {}
  }
  return [];
}

type MediaItem = { path: string; kind: "video" | "photo"; label: string };

function mediaFor(rows: Record<string, unknown>[]): MediaItem[] {
  const sorted = rows.slice().sort((a, b) => {
    const ka = sideOf(a) === "Closing" ? 1 : 0;
    const kb = sideOf(b) === "Closing" ? 1 : 0;
    if (ka !== kb) return ka - kb;
    return clean(a.review_time, 16).localeCompare(clean(b.review_time, 16));
  });
  const items: MediaItem[] = [];
  for (const row of sorted) {
    const side = sideOf(row);
    const video = clean(row.video_storage_path, 400);
    if (video) items.push({ path: video, kind: "video", label: side + " video" });
    photoPaths(row).forEach((path, i) => {
      items.push({ path, kind: "photo", label: side + " photo " + (i + 1) });
    });
  }
  return items;
}

function ownerMessage(rows: Record<string, unknown>[]): string {
  const sorted = rows.slice().sort((a, b) => (sideOf(a) === "Closing" ? 1 : 0) - (sideOf(b) === "Closing" ? 1 : 0));
  const venue = clean(sorted[0]?.venue, 80) || "SwimFarm";
  const when = friendlyDate(sorted[0]?.review_date);
  const lines = sorted.map((row) => {
    const kind = sideOf(row);
    const time = clockLabel(row.review_time);
    const note = tidyNote(row.issues_reported);
    const head = kind + " check" + (time ? " at " + time : "") + ".";
    return note ? head + " The team reported: " + note : head + " The team reported an issue.";
  });
  const items = mediaFor(sorted);
  const both = items.some((it) => it.label.startsWith("Opening")) &&
    items.some((it) => it.label.startsWith("Closing"));
  const mediaLine = !items.length
    ? ""
    : both
    ? "The opening and closing photos and videos follow this message."
    : "The photos and video follow this message.";
  return [
    "Hi Pilar,",
    "",
    "This is ClubSENsational.",
    "",
    "We are writing about " + venue + " on " + when + ".",
    "",
    lines.join("\n\n"),
    mediaLine,
    "",
    "This is an automatic message from the system. Please do not reply here.",
    "",
    "To reply, call or message 07592 558671.",
    "",
    "Thank you,",
    "ClubSENsational",
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

function webhookOk(req: Request): boolean {
  const expected = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "").trim();
  const got = (req.headers.get("x-portal-webhook-secret") ?? "").trim();
  return !!expected && got === expected;
}

async function callerUserId(admin: ReturnType<typeof createClient>, req: Request): Promise<string> {
  const header = req.headers.get("Authorization") || "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return "";
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user?.id) return "";
  return String(data.user.id);
}

async function callerMayNotify(
  admin: ReturnType<typeof createClient>,
  userId: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (!userId) return false;
  if (userId === clean(row.submitted_by_user_id, 80)) return true;
  const { data } = await admin.from("staff_profiles").select("app_role").eq("id", userId).maybeSingle();
  const role = clean((data as { app_role?: string } | null)?.app_role, 20).toLowerCase();
  return role === "admin" || role === "ceo";
}

async function pushAdmins(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
): Promise<string> {
  const id = clean(row.id, 80);
  if (!id) return "missing_id";
  const dedupe = await insertDedupeOrSkip(admin, "portal_webpush_admin_alert_sent", "venue_reviews", id);
  if (dedupe !== "ok") return dedupe;
  try {
    initVapidFromEnv();
  } catch (_e) {
    return "vapid_missing";
  }
  const ids = await loadAdminCeoUserIds(admin);
  if (!ids.length) return "no_admins";
  const lane = venueLane(row.venue);
  const title = lane === "hub" ? "Hub room issues" : lane === "pool" ? "SwimFarm issues" : "Venue issues";
  const body = clampPushBody(
    [
      sideOf(row),
      clockLabel(row.review_time),
      clean(row.venue, 40),
      tidyNote(row.issues_reported) || "Issue reported",
    ].filter(Boolean).join(" · "),
  );
  const openBase = adminPushOpenBase() || "";
  const payload = JSON.stringify({
    title,
    body,
    url: openBase,
    tag: "venue-issue-" + id,
    requireInteraction: true,
  });
  await sendPushPayloadToUserIds(admin, ids, payload);
  return "sent";
}

async function claimRows(
  admin: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
): Promise<{ claimed: Record<string, unknown>[]; error: string }> {
  const claimed: Record<string, unknown>[] = [];
  for (const row of rows) {
    const id = clean(row.id, 80);
    if (!id) continue;
    const { error } = await admin.from("venue_review_pilar_send").insert({
      venue_review_id: id,
      status: "pending",
    });
    if (!error) {
      claimed.push(row);
      continue;
    }
    const code = String((error as { code?: string }).code || "");
    const msg = String(error.message || "");
    if (code === "23505" || /duplicate/i.test(msg)) continue;
    console.error("[venue-issue] claim", error);
    return { claimed, error: msg || "claim_failed" };
  }
  return { claimed, error: "" };
}

async function markRows(
  admin: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
  status: string,
  errorText: string,
) {
  const ids = rows.map((row) => clean(row.id, 80)).filter(Boolean);
  if (!ids.length) return;
  await admin.from("venue_review_pilar_send").update({
    status,
    error: errorText ? errorText.slice(0, 500) : null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  }).in("venue_review_id", ids);
}

async function uploadMedia(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = (Deno.env.get("META_WHATSAPP_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) return { ok: false, error: "whatsapp_not_configured" };
  const kind = classifyWhatsappMediaMime(mime);
  const cap = kind === "video" ? VIDEO_MAX : IMAGE_MAX;
  if (bytes.length > cap) return { ok: false, error: "media_too_large" };
  const safeMime = String(mime || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", safeMime);
  form.append("file", new Blob([bytes], { type: safeMime }), filename.slice(0, 120) || "file");
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `whatsapp_media_upload_${res.status}` };
  let parsed: { id?: string } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const id = clean(parsed.id, 80);
  return id ? { ok: true, id } : { ok: false, error: "whatsapp_media_missing_id" };
}

function sendKind(path: string, kind: "video" | "photo", mime: string): WhatsappMediaKind {
  if (kind === "photo") return "image";
  if (/webm|ogg|mkv/i.test(mime) || /\.(webm|ogg|mkv)$/i.test(path)) return "document";
  return "video";
}

async function sendPoolWhatsapp(
  admin: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string; media_failed?: number }> {
  let rawPhone = Deno.env.get("PORTAL_SWIMFARM_OWNER_WHATSAPP") ?? "";
  if (!rawPhone.trim()) {
    const { data } = await admin
      .from("portal_private_config")
      .select("value")
      .eq("key", "swimfarm_owner_whatsapp")
      .maybeSingle();
    rawPhone = String((data as { value?: string } | null)?.value || "");
  }
  const phone = normalizeParentPhoneE164(rawPhone);
  if (!phone) return { ok: false, error: "owner_phone_not_configured" };
  const body = ownerMessage(rows);
  let sent = await sendParentMessageViaWhatsapp(phone, body, { kind: "staff_message" });
  if (!sent.ok) {
    sent = await sendParentMessageViaWhatsapp(phone, flattenWhatsappTemplateBody(body), {
      kind: "venue_owner_issue",
    });
  }
  if (!sent.ok) return { ok: false, error: sent.error || "whatsapp_failed" };

  const items = mediaFor(rows);
  let mediaFailed = 0;
  for (const item of items) {
    try {
      const file = await admin.storage.from("venue-review-videos").download(item.path);
      if (file.error || !file.data) {
        mediaFailed += 1;
        continue;
      }
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      const mime = clean(file.data.type, 80) || (item.kind === "photo" ? "image/jpeg" : "video/mp4");
      const filename = item.path.split("/").pop() || (item.kind === "photo" ? "photo.jpg" : "video.mp4");
      const uploaded = await uploadMedia(bytes, mime, filename);
      if (!uploaded.ok) {
        mediaFailed += 1;
        continue;
      }
      const kind = sendKind(item.path, item.kind, mime);
      const mediaSent = await sendWhatsappMediaById(phone, kind, uploaded.id, {
        caption: item.label,
        filename,
      });
      if (!mediaSent.ok) mediaFailed += 1;
    } catch (err) {
      console.error("[venue-issue] media", err);
      mediaFailed += 1;
    }
  }
  return { ok: true, media_failed: mediaFailed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "misconfigured" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: { review_id?: string; record?: Record<string, unknown> } = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const fromWebhook = webhookOk(req);
  const reviewId = clean(payload.review_id || payload.record?.id, 80);
  if (!reviewId) return json({ ok: false, error: "missing_review" }, 400);

  const { data: row, error: rowErr } = await admin.from("venue_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (rowErr || !row) return json({ ok: false, error: "review_not_found" }, 404);
  const review = row as Record<string, unknown>;

  if (!fromWebhook) {
    const userId = await callerUserId(admin, req);
    if (!await callerMayNotify(admin, userId, review)) return json({ ok: false, error: "forbidden" }, 403);
  }

  if (!issuesYes(review)) return json({ ok: true, skipped: "no_issues" });

  const lane = venueLane(review.venue);
  let push = "skipped";
  try {
    push = await pushAdmins(admin, review);
  } catch (err) {
    console.error("[venue-issue] push", err);
    push = "push_failed";
  }

  if (lane !== "pool") {
    return json({ ok: true, lane, pilar: "skipped", push });
  }

  const { data: sameDay } = await admin
    .from("venue_reviews")
    .select("*")
    .eq("review_date", review.review_date)
    .eq("venue", review.venue)
    .eq("has_issues", "Yes");
  const candidates = ((sameDay || []) as Record<string, unknown>[]).filter(issuesYes);
  const ordered = candidates.sort((a, b) => {
    if (clean(a.id, 80) === reviewId) return -1;
    if (clean(b.id, 80) === reviewId) return 1;
    return (sideOf(a) === "Closing" ? 1 : 0) - (sideOf(b) === "Closing" ? 1 : 0);
  });
  const claim = await claimRows(admin, ordered);
  if (claim.error) return json({ ok: false, lane, pilar: "failed", push, error: claim.error }, 500);
  const claimed = claim.claimed;
  if (!claimed.length) return json({ ok: true, lane, pilar: "already_sent", push });

  const sent = await sendPoolWhatsapp(admin, claimed);
  await markRows(
    admin,
    claimed,
    sent.ok ? "sent" : "failed",
    sent.ok ? (sent.media_failed ? "media_failed:" + sent.media_failed : "") : (sent.error || "failed"),
  );
  return json({
    ok: sent.ok,
    lane,
    pilar: sent.ok ? "sent" : "failed",
    push,
    reviews: claimed.length,
    media_failed: sent.media_failed || 0,
    error: sent.ok ? undefined : sent.error,
  }, sent.ok ? 200 : 502);
});
