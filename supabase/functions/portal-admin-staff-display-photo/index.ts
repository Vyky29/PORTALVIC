import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeBase64(raw: string): Uint8Array {
  let data = String(raw || "").trim();
  const m = /^data:image\/png;base64,(.+)$/i.exec(data);
  if (m) data = m[1];
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method" });

  const auth = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!auth.ok) return portalAdminJson(auth.status, { ok: false, error: auth.error });

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!portalUrl || !serviceKey) {
    return portalAdminJson(500, { ok: false, error: "misconfigured" });
  }

  let body: { staff_id?: string; png_base64?: string };
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_json" });
  }

  const staffId = String(body.staff_id || "").trim();
  if (!UUID_RE.test(staffId)) {
    return portalAdminJson(400, { ok: false, error: "invalid_staff" });
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(String(body.png_base64 || ""));
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_png" });
  }
  if (bytes.byteLength < 32 || bytes.byteLength > 2_500_000) {
    return portalAdminJson(413, { ok: false, error: "png_size" });
  }

  const admin = createClient(portalUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileErr } = await admin
    .from("staff_profiles")
    .select("id, avatar_url, avatar_original_url")
    .eq("id", staffId)
    .maybeSingle();
  if (profileErr || !profile) {
    return portalAdminJson(404, { ok: false, error: "staff_not_found" });
  }

  const path = `${staffId}/display.png`;
  const { error: upErr } = await admin.storage.from("staff-avatars").upload(path, bytes, {
    upsert: true,
    contentType: "image/png",
    cacheControl: "3600",
  });
  if (upErr) {
    console.error("[portal-admin-staff-display-photo]", upErr);
    return portalAdminJson(500, { ok: false, error: "upload_failed" });
  }

  const { data: pub } = admin.storage.from("staff-avatars").getPublicUrl(path);
  const displayUrl = `${String(pub?.publicUrl || "").trim()}?t=${Date.now()}`;
  const current = String(profile.avatar_url || "").trim();
  const original = String(profile.avatar_original_url || "").trim();
  const patch: { avatar_url: string; avatar_original_url?: string } = {
    avatar_url: displayUrl,
  };
  if (!original && current && !/\/display\./i.test(current)) {
    patch.avatar_original_url = current;
  }

  const { error: saveErr } = await admin.from("staff_profiles").update(patch).eq("id", staffId);
  if (saveErr) {
    console.error("[portal-admin-staff-display-photo] profile", saveErr);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    display_url: displayUrl,
    original_url: patch.avatar_original_url || original || null,
  });
});
