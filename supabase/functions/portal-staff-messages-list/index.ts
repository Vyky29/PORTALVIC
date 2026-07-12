// portal-staff-messages-list
// -------------------------
// Unified leader WhatsApp thread (outbound notify log + inbound).
//
// Auth: Bearer staff JWT.
// - Portal admin: pass staffUsername to load any leader thread, or omit for directory.
// - Leader: only own thread (staff_profiles.id = auth.uid()).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { phoneLast10 } from "../_shared/portal_staff_whatsapp.ts";
import {
  fetchStaffWhatsappLeaders,
  findStaffLeaderByUsername,
  isPortalStaffWhatsappLeaderKey,
  normalizeStaffUsernameKey,
} from "../_shared/portal_staff_whatsapp.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

function str(v: unknown, max = 8000): string {
  return String(v ?? "").trim().slice(0, max);
}

type ThreadMessage = {
  id: string;
  direction: "outbound" | "inbound";
  created_at: string;
  body_text: string;
  whatsapp_status?: string | null;
  message_type?: string | null;
  media_path?: string | null;
  media_mime?: string | null;
  media_url?: string | null;
  wa_message_id?: string | null;
};

const MEDIA_BUCKET = "wa-inbound-media";
const MEDIA_SIGNED_TTL = 3600;

function previewLabel(body: string, messageType?: string | null, mediaPath?: string | null): string {
  const t = String(body || "").trim();
  const mt = String(messageType || "").toLowerCase();
  if (mediaPath || /^\[(sticker|image|video|audio|document)\]$/i.test(t)) {
    if (mt === "image" || t === "[image]" || t === "[sticker]") return "📷 Photo";
    if (mt === "audio" || t === "[audio]") return "🎤 Voice message";
    if (mt === "video" || t === "[video]") return "🎬 Video";
    if (mt === "document" || t === "[document]") return "📎 Document";
    return "📎 Attachment";
  }
  return t.slice(0, 80);
}

async function attachSignedMediaUrls(
  admin: ReturnType<typeof createClient>,
  messages: ThreadMessage[],
): Promise<void> {
  const need: string[] = [];
  const seen = new Set<string>();
  messages.forEach((m) => {
    const path = m.media_path ? String(m.media_path) : "";
    if (!path || seen.has(path)) return;
    seen.add(path);
    need.push(path);
  });
  if (!need.length) return;
  try {
    const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(need, MEDIA_SIGNED_TTL);
    const map: Record<string, string> = {};
    (data || []).forEach((item) => {
      if (item && item.path && item.signedUrl && !item.error) {
        map[String(item.path)] = String(item.signedUrl);
      }
    });
    messages.forEach((m) => {
      const path = m.media_path ? String(m.media_path) : "";
      if (path && map[path]) m.media_url = map[path];
    });
  } catch (e) {
    console.warn("[portal-staff-messages-list] signed urls failed", String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "")
    .trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const authHeader = str(req.headers.get("Authorization"), 2000);
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return portalAdminJson(401, { ok: false, error: "missing_bearer" });
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return portalAdminJson(401, { ok: false, error: "missing_bearer" });

  const userClient = createClient(baseUrl, anon || serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return portalAdminJson(401, { ok: false, error: "invalid_session" });
  }
  const userId = String(userData.user.id);

  const adminCheck = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  const isAdmin = !!adminCheck.ok;

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const wantUser = normalizeStaffUsernameKey(str(payload.staffUsername || payload.staffKey, 64));
  const directoryOnly = payload.directory === true || payload.directory === "true";
  const markRead = payload.mark_read === true || payload.mark_read === "true";
  const unreadOnly = payload.unread_only === true || payload.unread_only === "true";

  // Directory listing only when admin explicitly asks (admin UI sidebar).
  // Admin leaders (Victor/Raúl/Javi) opening their own staff thread send {} —
  // fall through to the own-thread branch instead of returning an empty directory.
  if (isAdmin && directoryOnly) {
    const leaders = await fetchStaffWhatsappLeaders(admin);
    const ids = leaders.map((l) => l.id).filter(Boolean);
    const lastInboundByStaff: Record<
      string,
      { at: string; preview: string }
    > = {};
    if (ids.length) {
      const { data: inboundRows } = await admin
        .from("portal_staff_whatsapp_inbound")
        .select("staff_profile_id, created_at, body_text, message_type, media_path")
        .in("staff_profile_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      (inboundRows || []).forEach((r) => {
        const sid = String(r.staff_profile_id || "");
        if (!sid || lastInboundByStaff[sid]) return;
        lastInboundByStaff[sid] = {
          at: String(r.created_at || ""),
          preview: previewLabel(
            String(r.body_text || ""),
            r.message_type != null ? String(r.message_type) : null,
            r.media_path != null ? String(r.media_path) : null,
          ),
        };
      });
    }
    const directory = leaders.map((l) => {
      const inbound = lastInboundByStaff[l.id] || null;
      return {
        id: l.id,
        username: normalizeStaffUsernameKey(l.username),
        displayName: l.full_name || l.username,
        hasPhone: !!normalizeParentPhoneE164(String(l.phone_e164 || "")),
        phoneMasked: l.phone_e164
          ? String(l.phone_e164).replace(/\d(?=\d{4})/g, "•")
          : null,
        lastInboundAt: inbound ? inbound.at : null,
        lastInboundPreview: inbound ? inbound.preview : null,
      };
    });
    return portalAdminJson(200, { ok: true, directory });
  }

  let leader = null as Awaited<ReturnType<typeof findStaffLeaderByUsername>>;
  if (isAdmin && wantUser) {
    if (!isPortalStaffWhatsappLeaderKey(wantUser)) {
      return portalAdminJson(400, { ok: false, error: "not_a_leader" });
    }
    leader = await findStaffLeaderByUsername(admin, wantUser);
  } else {
    const { data: me } = await admin
      .from("staff_profiles")
      .select("id, username, full_name, phone_e164, phone_lookup")
      .eq("id", userId)
      .maybeSingle();
    if (!me || !isPortalStaffWhatsappLeaderKey(String(me.username || ""))) {
      return portalAdminJson(403, { ok: false, error: "not_leader_or_admin" });
    }
    leader = {
      id: String(me.id),
      username: String(me.username || ""),
      full_name: me.full_name != null ? String(me.full_name) : null,
      phone_e164: me.phone_e164 != null ? String(me.phone_e164) : null,
      phone_lookup: me.phone_lookup != null ? String(me.phone_lookup) : null,
    };
  }

  if (!leader) {
    return portalAdminJson(404, { ok: false, error: "staff_not_found" });
  }

  const phone10 = phoneLast10(leader.phone_e164 || "");
  const limit = Math.min(200, Math.max(20, Number(payload.limit) || 100));

  const { data: outboundRows } = await admin
    .from("portal_staff_notify_log")
    .select(
      "id, created_at, body_text, whatsapp_status, whatsapp_message_id, staff_profile_id, staff_phone, message_type, media_path, media_mime",
    )
    .eq("staff_profile_id", leader.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  let inboundQuery = admin
    .from("portal_staff_whatsapp_inbound")
    .select(
      "id, created_at, body_text, message_type, media_path, media_mime, wa_message_id, from_phone, staff_profile_id",
    )
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data: inboundByStaff } = await inboundQuery.eq("staff_profile_id", leader.id);
  let inboundRows = Array.isArray(inboundByStaff) ? inboundByStaff : [];

  if (phone10 && inboundRows.length < limit) {
    const { data: inboundByPhone } = await admin
      .from("portal_staff_whatsapp_inbound")
      .select(
        "id, created_at, body_text, message_type, media_path, media_mime, wa_message_id, from_phone, staff_profile_id",
      )
      .ilike("from_phone", `%${phone10}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    const seen = new Set(inboundRows.map((r) => String(r.id)));
    (inboundByPhone || []).forEach((r) => {
      const id = String(r.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      inboundRows.push(r);
    });
  }

  const messages: ThreadMessage[] = [];
  (outboundRows || []).forEach((r) => {
    messages.push({
      id: `out:${r.id}`,
      direction: "outbound",
      created_at: String(r.created_at || ""),
      body_text: String(r.body_text || ""),
      whatsapp_status: r.whatsapp_status != null ? String(r.whatsapp_status) : null,
      message_type: r.message_type != null ? String(r.message_type) : "text",
      media_path: r.media_path != null ? String(r.media_path) : null,
      media_mime: r.media_mime != null ? String(r.media_mime) : null,
      wa_message_id: r.whatsapp_message_id != null ? String(r.whatsapp_message_id) : null,
    });
  });
  inboundRows.forEach((r) => {
    messages.push({
      id: `in:${r.id}`,
      direction: "inbound",
      created_at: String(r.created_at || ""),
      body_text: String(r.body_text || ""),
      message_type: r.message_type != null ? String(r.message_type) : "text",
      media_path: r.media_path != null ? String(r.media_path) : null,
      media_mime: r.media_mime != null ? String(r.media_mime) : null,
      wa_message_id: r.wa_message_id != null ? String(r.wa_message_id) : null,
    });
  });
  messages.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  await attachSignedMediaUrls(admin, messages);

  const READ_EPOCH = "1970-01-01T00:00:00.000Z";
  let readAt = READ_EPOCH;
  const { data: readRow } = await admin
    .from("portal_staff_whatsapp_read")
    .select("read_at")
    .eq("staff_profile_id", leader.id)
    .maybeSingle();
  if (readRow?.read_at) readAt = String(readRow.read_at);

  // Only the leader themselves advance their unread cursor (admin peeking another
  // thread must not clear that leader's unread count).
  const canMarkOwn = String(leader.id) === userId;
  if (markRead && canMarkOwn) {
    const { data: marked } = await admin.rpc("portal_staff_whatsapp_mark_read", {
      p_staff_profile_id: leader.id,
      p_read_at: new Date().toISOString(),
    });
    if (marked) readAt = String(marked);
    else readAt = new Date().toISOString();
  }

  const readMs = new Date(readAt).getTime();
  let unread_messages_count = 0;
  (outboundRows || []).forEach((r) => {
    const createdMs = new Date(String(r.created_at || 0)).getTime();
    if (createdMs > readMs) unread_messages_count += 1;
  });
  if (markRead) unread_messages_count = 0;

  const messagesWithFlags = messages.map((m) => ({
    ...m,
    is_unread:
      m.direction === "outbound" &&
      new Date(String(m.created_at || 0)).getTime() > readMs,
  }));

  if (unreadOnly) {
    return portalAdminJson(200, {
      ok: true,
      staff: {
        id: leader.id,
        username: normalizeStaffUsernameKey(leader.username),
        displayName: leader.full_name || leader.username,
        hasPhone: !!normalizeParentPhoneE164(String(leader.phone_e164 || "")),
      },
      unread_messages_count,
      messages_read_at: readAt,
      isAdmin,
    });
  }

  return portalAdminJson(200, {
    ok: true,
    staff: {
      id: leader.id,
      username: normalizeStaffUsernameKey(leader.username),
      displayName: leader.full_name || leader.username,
      hasPhone: !!normalizeParentPhoneE164(String(leader.phone_e164 || "")),
    },
    messages: messagesWithFlags,
    unread_messages_count,
    messages_read_at: readAt,
    isAdmin,
  });
});
