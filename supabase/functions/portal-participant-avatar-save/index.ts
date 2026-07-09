// portal-participant-avatar-save — parent/carer updates participant photo (live + admin archive).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
} from "../_shared/parent_portal_auth.ts";
import {
  participantAvatarPublicUrl,
  removeLiveParticipantAvatar,
  saveParticipantAvatarWithArchive,
} from "../_shared/participant_avatar.ts";
import { verifyParticipantParentAccess } from "../_shared/reenrolment_participant_access.ts";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "bad_form" });
  }

  const contactId = String(form.get("contact_id") || "").trim();
  const remove = String(form.get("remove") || "").trim() === "1";
  const source = String(form.get("source") || "re_enrolment").trim().slice(0, 40) || "re_enrolment";

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const access = await verifyParticipantParentAccess(supabase, req, {
    contact_id: contactId,
    parent_first_name: String(form.get("parent_first_name") || ""),
    parent_last_name: String(form.get("parent_last_name") || ""),
    participant_name: String(form.get("participant_name") || ""),
    participant_age: String(form.get("participant_age") || ""),
    participant_dob: String(form.get("participant_dob") || ""),
  });

  if (!access) return json(403, { ok: false, error: "forbidden" });

  if (remove) {
    const ok = await removeLiveParticipantAvatar(supabase, access.contact_id, source);
    if (!ok) return json(500, { ok: false, error: "remove_failed" });
    return json(200, { ok: true, removed: true, avatar_url: null });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) {
    return json(400, { ok: false, error: "missing_photo" });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return json(413, { ok: false, error: "photo_too_large" });
  }

  const contentType = String(photo.type || "image/jpeg").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return json(400, { ok: false, error: "invalid_photo_type" });
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const saved = await saveParticipantAvatarWithArchive(
    supabase,
    access.contact_id,
    bytes,
    contentType,
    source,
  );

  if (!saved) return json(500, { ok: false, error: "save_failed" });

  return json(200, {
    ok: true,
    avatar_path: saved.avatar_path,
    archive_path: saved.archive_path || null,
    avatar_url: participantAvatarPublicUrl(url, saved.avatar_path),
  });
});
