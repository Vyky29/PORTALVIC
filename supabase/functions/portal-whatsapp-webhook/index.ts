// portal-whatsapp-webhook
// -----------------------
// Meta WhatsApp Cloud API webhook — stores inbound family replies.
//
// GET  — Meta subscription verification (hub.verify_token / hub.challenge)
// POST — Incoming messages (X-Hub-Signature-256 verified when app secret set)
//
// Deploy: supabase functions deploy portal-whatsapp-webhook --no-verify-jwt
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   META_WHATSAPP_WEBHOOK_VERIFY_TOKEN — must match Meta webhook config
//   META_WHATSAPP_APP_SECRET — optional but recommended (signature verify)
//   META_WHATSAPP_PHONE_NUMBER_ID — optional filter (only this API number)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";
import { findStaffLeaderByPhone } from "../_shared/portal_staff_whatsapp.ts";

type MetaWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: MetaChangeValue;
    }>;
  }>;
};

type MetaChangeValue = {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: MetaInboundMessage[];
  statuses?: MetaStatusUpdate[];
};

type MetaStatusUpdate = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type MetaMedia = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  animated?: boolean;
};

type MetaInboundMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string } };
  context?: { from?: string; id?: string };
  reaction?: { message_id?: string; emoji?: string };
  image?: MetaMedia;
  sticker?: MetaMedia;
  video?: MetaMedia;
  audio?: MetaMedia;
  document?: MetaMedia;
};

const MEDIA_BUCKET = "wa-inbound-media";

function str(v: unknown, max = 8000): string {
  return String(v ?? "").trim().slice(0, max);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string,
): Promise<boolean> {
  const header = str(signatureHeader, 128);
  if (!header.startsWith("sha256=") || !appSecret) return false;
  const expectedHex = header.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, expectedHex);
}

function extractMessageBody(msg: MetaInboundMessage): string {
  const type = str(msg.type, 32).toLowerCase();
  if (type === "text") return str(msg.text?.body, 12000);
  if (type === "reaction") {
    // Store the actual emoji so the panel shows the reaction icon.
    return str(msg.reaction?.emoji, 32) || "[reaction removed]";
  }
  if (type === "button") {
    return str(msg.button?.text || msg.button?.payload, 12000);
  }
  if (type === "interactive") {
    const ir = msg.interactive;
    if (ir?.button_reply?.title) return str(ir.button_reply.title, 12000);
    if (ir?.list_reply?.title) return str(ir.list_reply.title, 12000);
  }
  if (type === "image") return str(msg.image?.caption, 12000) || "[image]";
  if (type === "video") return str(msg.video?.caption, 12000) || "[video]";
  if (type === "document") {
    return str(msg.document?.caption || msg.document?.filename, 12000) || "[document]";
  }
  if (type === "sticker") return "[sticker]";
  if (type === "audio") return "[audio]";
  return `[${type || "message"}]`;
}

function mediaRefForMessage(msg: MetaInboundMessage): { id: string; mime: string } | null {
  const type = str(msg.type, 32).toLowerCase();
  let m: MetaMedia | undefined;
  if (type === "image") m = msg.image;
  else if (type === "sticker") m = msg.sticker;
  else if (type === "video") m = msg.video;
  else if (type === "audio") m = msg.audio;
  else if (type === "document") m = msg.document;
  if (m && m.id) return { id: str(m.id, 200), mime: str(m.mime_type, 120) };
  return null;
}

function extFromMime(mime: string): string {
  const m = String(mime || "").toLowerCase();
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("3gpp") || m.includes("3gp")) return "3gp";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("amr")) return "amr";
  if (m.includes("pdf")) return "pdf";
  return "bin";
}

// Download inbound media from the Meta Graph API and store it in the PRIVATE
// Storage bucket. Returns the object path + mime, or null on any failure.
// The admin panel mints short-lived signed URLs from the path at view time.
async function fetchAndStoreMedia(
  // deno-lint-ignore no-explicit-any
  admin: any,
  mediaId: string,
  fallbackMime: string,
  waMessageId: string,
  token: string,
): Promise<{ media_path: string; media_mime: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.warn("[portal-whatsapp-webhook] media meta lookup failed", mediaId, metaRes.status);
      return null;
    }
    const metaJson = await metaRes.json();
    const url = str(metaJson?.url, 2000);
    const mime = str(metaJson?.mime_type, 120) || fallbackMime || "application/octet-stream";
    if (!url) return null;

    const binRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) {
      console.warn("[portal-whatsapp-webhook] media download failed", mediaId, binRes.status);
      return null;
    }
    const bytes = new Uint8Array(await binRes.arrayBuffer());
    const safeId = waMessageId.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120);
    const path = `${safeId}.${extFromMime(mime)}`;

    const up = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (up.error) {
      console.warn("[portal-whatsapp-webhook] media upload failed", mediaId, up.error.message);
      return null;
    }
    return {
      media_path: path,
      media_mime: mime,
    };
  } catch (e) {
    console.warn("[portal-whatsapp-webhook] media store error", mediaId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

function contactNameForMessage(
  contacts: MetaChangeValue["contacts"],
  fromWaId: string,
): string | null {
  const from = str(fromWaId, 24);
  if (!from || !contacts?.length) return null;
  for (const c of contacts) {
    if (str(c.wa_id, 24) === from) {
      const name = str(c.profile?.name, 200);
      return name || null;
    }
  }
  return null;
}

function messageCreatedAt(msg: MetaInboundMessage): string {
  const ts = parseInt(str(msg.timestamp, 16), 10);
  if (Number.isFinite(ts) && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function storeInboundMessages(
  value: MetaChangeValue,
  phoneNumberIdFilter: string,
): Promise<number> {
  const messages = value.messages;
  if (!messages?.length) return 0;

  const metaPhoneId = str(value.metadata?.phone_number_id, 64);
  if (phoneNumberIdFilter && metaPhoneId && metaPhoneId !== phoneNumberIdFilter) {
    console.warn(
      "[portal-whatsapp-webhook] skipped inbound — phone_number_id mismatch",
      { expected: phoneNumberIdFilter, got: metaPhoneId },
    );
    return 0;
  }

  const baseUrl = str(Deno.env.get("SUPABASE_URL"), 300);
  const serviceRole = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 500);
  if (!baseUrl || !serviceRole) {
    console.error("[portal-whatsapp-webhook] missing supabase env");
    return 0;
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const graphToken = str(Deno.env.get("META_WHATSAPP_TOKEN"), 500);

  let inserted = 0;
  for (const msg of messages) {
    const waMessageId = str(msg.id, 200);
    const fromRaw = str(msg.from, 24);
    if (!waMessageId || !fromRaw) continue;

    const phone = normalizeParentPhoneE164(fromRaw) || `+${fromRaw.replace(/\D/g, "")}`;
    const bodyText = extractMessageBody(msg);
    const contactName = contactNameForMessage(value.contacts, fromRaw);

    // Stickers, images, video, audio and documents: pull the file from Meta and
    // store it (private bucket) so the admin panel can render it via a signed
    // URL, not just show "[sticker]".
    let mediaPath: string | null = null;
    let mediaMime: string | null = null;
    const mediaRef = mediaRefForMessage(msg);
    if (mediaRef && graphToken) {
      const stored = await fetchAndStoreMedia(
        admin, mediaRef.id, mediaRef.mime, waMessageId, graphToken,
      );
      if (stored) {
        mediaPath = stored.media_path;
        mediaMime = stored.media_mime;
      }
    }

    const staffLeader = await findStaffLeaderByPhone(admin, phone);
    if (staffLeader) {
      const staffRow = {
        wa_message_id: waMessageId,
        from_phone: phone,
        staff_profile_id: staffLeader.id,
        staff_username: String(staffLeader.username || "").trim().toLowerCase() || null,
        contact_name: contactName,
        message_type: str(msg.type, 32).toLowerCase() || "text",
        body_text: bodyText || null,
        context_wa_id: str(msg.context?.id, 200) || null,
        media_path: mediaPath,
        media_mime: mediaMime,
        created_at: messageCreatedAt(msg),
        meta: {
          phone_number_id: metaPhoneId || null,
          display_phone_number: str(value.metadata?.display_phone_number, 40) || null,
          routed: "staff",
        },
        raw_payload: msg as Record<string, unknown>,
      };
      const { error: staffErr } = await admin
        .from("portal_staff_whatsapp_inbound")
        .upsert(staffRow, { onConflict: "wa_message_id", ignoreDuplicates: true });
      if (staffErr) {
        console.warn("[portal-whatsapp-webhook] staff insert failed", waMessageId, staffErr.message);
        continue;
      }
      inserted += 1;
      continue;
    }

    const row = {
      wa_message_id: waMessageId,
      from_phone: phone,
      contact_name: contactName,
      message_type: str(msg.type, 32).toLowerCase() || "text",
      body_text: bodyText || null,
      context_wa_id: str(msg.context?.id, 200) || null,
      media_path: mediaPath,
      media_mime: mediaMime,
      created_at: messageCreatedAt(msg),
      meta: {
        phone_number_id: metaPhoneId || null,
        display_phone_number: str(value.metadata?.display_phone_number, 40) || null,
      },
      raw_payload: msg as Record<string, unknown>,
    };

    const { error } = await admin
      .from("portal_parent_whatsapp_inbound")
      .upsert(row, { onConflict: "wa_message_id", ignoreDuplicates: true });

    if (error) {
      console.warn("[portal-whatsapp-webhook] insert failed", waMessageId, error.message);
      continue;
    }
    inserted += 1;
  }
  return inserted;
}

function statusTimestamp(ts: string | undefined): string {
  const n = parseInt(str(ts, 16), 10);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  return new Date().toISOString();
}

/** Apply Meta delivery-status callbacks (sent -> delivered -> read / failed) to the outbound log. */
async function storeStatusUpdates(value: MetaChangeValue): Promise<number> {
  const statuses = value.statuses;
  if (!statuses?.length) return 0;

  const baseUrl = str(Deno.env.get("SUPABASE_URL"), 300);
  const serviceRole = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 500);
  if (!baseUrl || !serviceRole) return 0;

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updated = 0;
  for (const st of statuses) {
    const msgId = str(st.id, 200);
    const status = str(st.status, 32).toLowerCase();
    if (!msgId || !status) continue;
    const at = statusTimestamp(st.timestamp);

    if (status === "read") {
      // Read implies delivered — never downgrade once read.
      const { error } = await admin
        .from("portal_parent_notify_log")
        .update({ whatsapp_status: "read", whatsapp_read_at: at })
        .eq("whatsapp_message_id", msgId);
      if (!error) {
        await admin
          .from("portal_parent_notify_log")
          .update({ whatsapp_delivered_at: at })
          .eq("whatsapp_message_id", msgId)
          .is("whatsapp_delivered_at", null);
        updated += 1;
      } else {
        console.warn("[portal-whatsapp-webhook] read update failed", msgId, error.message);
      }
      await admin
        .from("portal_staff_notify_log")
        .update({ whatsapp_status: "read", whatsapp_read_at: at })
        .eq("whatsapp_message_id", msgId);
      await admin
        .from("portal_staff_notify_log")
        .update({ whatsapp_delivered_at: at })
        .eq("whatsapp_message_id", msgId)
        .is("whatsapp_delivered_at", null);
    } else if (status === "delivered") {
      const { error } = await admin
        .from("portal_parent_notify_log")
        .update({ whatsapp_status: "delivered", whatsapp_delivered_at: at })
        .eq("whatsapp_message_id", msgId)
        .neq("whatsapp_status", "read");
      if (!error) updated += 1;
      else console.warn("[portal-whatsapp-webhook] delivered update failed", msgId, error.message);
      await admin
        .from("portal_staff_notify_log")
        .update({ whatsapp_status: "delivered", whatsapp_delivered_at: at })
        .eq("whatsapp_message_id", msgId)
        .neq("whatsapp_status", "read");
    } else if (status === "failed") {
      const errText = (st.errors || [])
        .map((e) => `${e.code ?? ""} ${e.title ?? ""} ${e.message ?? ""}`.trim())
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500) || "whatsapp_failed";
      const { error } = await admin
        .from("portal_parent_notify_log")
        .update({ whatsapp_status: "failed", error_detail: errText })
        .eq("whatsapp_message_id", msgId)
        .in("whatsapp_status", ["sent", "pending", "delivered"]);
      if (!error) updated += 1;
      else console.warn("[portal-whatsapp-webhook] failed update failed", msgId, error.message);
      await admin
        .from("portal_staff_notify_log")
        .update({ whatsapp_status: "failed", error_detail: errText })
        .eq("whatsapp_message_id", msgId)
        .in("whatsapp_status", ["sent", "pending", "delivered"]);
    }
    // status === "sent" is already recorded at send time; ignore.
  }
  return updated;
}

Deno.serve(async (req) => {
  const verifyToken = str(Deno.env.get("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN"), 200);
  const appSecret = str(Deno.env.get("META_WHATSAPP_APP_SECRET"), 200);
  const phoneNumberIdFilter = str(Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID"), 64);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = str(url.searchParams.get("hub.mode"), 32);
    const token = str(url.searchParams.get("hub.verify_token"), 200);
    const challenge = str(url.searchParams.get("hub.challenge"), 200);
    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const rawBody = await req.text();

  if (appSecret) {
    const sig = req.headers.get("X-Hub-Signature-256") || "";
    if (!sig) {
      console.warn("[portal-whatsapp-webhook] missing X-Hub-Signature-256 header");
      return new Response("missing_signature", { status: 401 });
    }
    const ok = await verifyMetaSignature(rawBody, sig, appSecret);
    if (!ok) {
      console.warn("[portal-whatsapp-webhook] invalid signature — check META_WHATSAPP_APP_SECRET");
      return new Response("invalid_signature", { status: 401 });
    }
  }

  let payload: MetaWebhookBody;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    return new Response("bad_json", { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return new Response("ignored", { status: 200 });
  }

  let total = 0;
  let statusUpdates = 0;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;
      if (value.messages?.length) {
        total += await storeInboundMessages(value, phoneNumberIdFilter);
      }
      if (value.statuses?.length) {
        statusUpdates += await storeStatusUpdates(value);
      }
    }
  }

  if (total > 0) {
    console.log("[portal-whatsapp-webhook] stored inbound messages:", total);
  }
  if (statusUpdates > 0) {
    console.log("[portal-whatsapp-webhook] applied delivery statuses:", statusUpdates);
  }

  return new Response("ok", { status: 200 });
});
