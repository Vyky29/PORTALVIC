// @ts-nocheck — Edge Function (Deno).
//
// comms-photo-normalize
// ---------------------
// Comms photos sent as HEIC / HEIF (Samsung + iPhone camera default) do not paint
// in Chrome / Android. Supabase Storage image transforms decode HEIC, so this
// re-saves the photo as JPEG and repoints the message row.
//
// POST { storage_path }
// Headers: apikey <anon>, Authorization: Bearer <user access_token>
// Only the staff member who sent the message (performed_by_user_id) may call it.
//
// 200 { ok: true, storage_path, mime_type, file_name, file_size }
// 200 { ok: true, skipped: "not_heic" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "communication-files";
const MAX_EDGE = 2000;
const QUALITY = 82;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

function isHeicLike(mime: unknown, name: unknown): boolean {
  const m = String(mime || "").toLowerCase();
  if (m.includes("heic") || m.includes("heif")) return true;
  return /\.(heic|heif)$/i.test(String(name || ""));
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function jpegName(name: string): string {
  const base = String(name || "photo").replace(/\.(heic|heif)$/i, "");
  return (base || "photo") + ".jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const jwt = bearerUserJwt(req);
  if (!jwt) return json(401, { ok: false, error: "unauthorized" });

  let payload: { storage_path?: string } = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: "bad_json" });
  }
  const storagePath = String(payload.storage_path || "").trim();
  if (!storagePath) return json(400, { ok: false, error: "storage_path_required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json(401, { ok: false, error: "unauthorized" });

  const { data: msg, error: msgErr } = await supabase
    .from("communication_messages")
    .select("id, body, message_type, storage_path, mime_type, file_name, performed_by_user_id, deleted_at")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (msgErr) {
    console.error("[comms-photo-normalize] load", msgErr.message);
    return json(500, { ok: false, error: "load_failed" });
  }
  if (!msg || msg.deleted_at) return json(404, { ok: false, error: "not_found" });
  if (msg.performed_by_user_id !== userId) return json(403, { ok: false, error: "forbidden" });
  if (msg.message_type !== "image" || !isHeicLike(msg.mime_type, msg.file_name || storagePath)) {
    return json(200, { ok: true, skipped: "not_heic" });
  }

  const renderUrl =
    `${url}/storage/v1/render/image/authenticated/${BUCKET}/${encodeStoragePath(storagePath)}` +
    `?width=${MAX_EDGE}&height=${MAX_EDGE}&resize=contain&quality=${QUALITY}`;
  const res = await fetch(renderUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "image/jpeg",
    },
  });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok || !contentType.startsWith("image/jpeg")) {
    console.error("[comms-photo-normalize] render", res.status, contentType);
    return json(502, { ok: false, error: "convert_failed" });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  const newPath = storagePath.replace(/\.(heic|heif)$/i, "") + ".jpg";
  const up = await supabase.storage.from(BUCKET).upload(newPath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) {
    console.error("[comms-photo-normalize] upload", up.error.message);
    return json(500, { ok: false, error: "upload_failed" });
  }

  const newName = jpegName(msg.file_name || "photo");
  const patch: Record<string, unknown> = {
    storage_path: newPath,
    mime_type: "image/jpeg",
    file_name: newName,
    file_size: bytes.byteLength,
  };
  if (!msg.body || msg.body === msg.file_name) patch.body = newName;

  const { error: updErr } = await supabase.from("communication_messages").update(patch).eq("id", msg.id);
  if (updErr) {
    console.error("[comms-photo-normalize] update", updErr.message);
    return json(500, { ok: false, error: "update_failed" });
  }

  const rm = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (rm.error) console.warn("[comms-photo-normalize] remove original", rm.error.message);

  return json(200, {
    ok: true,
    storage_path: newPath,
    mime_type: "image/jpeg",
    file_name: newName,
    file_size: bytes.byteLength,
  });
});
