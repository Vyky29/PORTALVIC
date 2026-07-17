/** Meta WhatsApp Cloud API — upload + send image / audio / video / document. */

import type { SendWhatsappResult } from "./portal_parent_messaging.ts";

export type WhatsappMediaKind = "image" | "audio" | "video" | "document";

const MAX_BYTES = 4 * 1024 * 1024;

export function classifyWhatsappMediaMime(mimeRaw: string): WhatsappMediaKind {
  const mime = String(mimeRaw || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  // Browser MediaRecorder often yields webm — Meta audio types are limited; send as document.
  if (mime === "audio/webm" || mime === "audio/webm;codecs=opus") return "document";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function mediaPlaceholderBody(kind: WhatsappMediaKind): string {
  if (kind === "image") return "[image]";
  if (kind === "audio") return "[audio]";
  if (kind === "video") return "[video]";
  return "[document]";
}

export function decodeBase64Payload(raw: string): Uint8Array | null {
  let s = String(raw || "").trim();
  if (!s) return null;
  const comma = s.indexOf(",");
  if (s.startsWith("data:") && comma >= 0) s = s.slice(comma + 1);
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function extForMime(mimeRaw: string, kind: WhatsappMediaKind): string {
  const mime = String(mimeRaw || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4")) return kind === "audio" ? "m4a" : "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("amr")) return "amr";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("docx")) return "docx";
  if (mime.includes("sheet") || mime.includes("xlsx")) return "xlsx";
  if (kind === "image") return "jpg";
  if (kind === "audio") return "ogg";
  if (kind === "video") return "mp4";
  return "bin";
}

export async function uploadWhatsappMediaBinary(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = (Deno.env.get("META_WHATSAPP_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) {
    return { ok: false, error: "whatsapp_not_configured" };
  }
  if (!bytes.length) return { ok: false, error: "empty_media" };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "media_too_large" };

  const safeMime = String(mime || "application/octet-stream").split(";")[0].trim() ||
    "application/octet-stream";
  const uploadBuffer = Uint8Array.from(bytes).buffer;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", safeMime);
  form.append(
    "file",
    new Blob([uploadBuffer], { type: safeMime }),
    String(filename || "file").slice(0, 120) || "file",
  );

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `whatsapp_media_upload_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { id?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const id = String(parsed.id || "").trim();
    if (!id) return { ok: false, error: "whatsapp_media_missing_id" };
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function sendWhatsappMediaById(
  phoneE164: string,
  kind: WhatsappMediaKind,
  mediaId: string,
  opts?: { caption?: string; filename?: string; contextWaId?: string },
): Promise<SendWhatsappResult> {
  const token = (Deno.env.get("META_WHATSAPP_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) {
    return { ok: false, error: "whatsapp_not_configured" };
  }
  const to = String(phoneE164 || "").replace(/^\+/, "");
  const id = String(mediaId || "").trim();
  if (!to || !id) return { ok: false, error: "whatsapp_media_missing_target" };

  const caption = String(opts?.caption || "").trim().slice(0, 1024);
  const filename = String(opts?.filename || "").trim().slice(0, 240);
  const contextId = String(opts?.contextWaId || "").trim();

  const mediaObj: Record<string, string> = { id };
  if (caption && (kind === "image" || kind === "video" || kind === "document")) {
    mediaObj.caption = caption;
  }
  if (kind === "document" && filename) {
    mediaObj.filename = filename;
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: kind,
    [kind]: mediaObj,
  };
  if (contextId) payload.context = { message_id: contextId };

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `whatsapp_${kind}_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { messages?: Array<{ id?: string }> } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const mid = String(parsed.messages?.[0]?.id || "");
    return mid
      ? { ok: true, id: mid, channel: "whatsapp" }
      : { ok: false, error: `whatsapp_${kind}_missing_message_id` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export const WHATSAPP_MEDIA_MAX_BYTES = MAX_BYTES;
