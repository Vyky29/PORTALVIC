// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-achievement-download
// ----------------------------------
// Parent downloads an achievement photo; marks row as downloaded for admin visibility.
//
// Headers: x-parent-portal-session
// Body: { contact_id, photo_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
} from "../_shared/participant_identity.ts";

const ACH_BUCKET = "participant-achievements";
/** Same rows parents see in the gallery (matches admin participant folder). */
const PARENT_DOWNLOAD_STATUSES = ["draft", "attached", "archived_unused", "downloaded"] as const;

function clean(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function downloadFilename(sessionDate: unknown, photoId: string, storagePath: string): string {
  const day = clean(sessionDate, 10).replace(/[^\d-]/g, "") || "session";
  const extMatch = /\.([a-z0-9]+)$/i.exec(clean(storagePath, 500));
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const shortId = photoId.replace(/-/g, "").slice(0, 8);
  return `achievement-${day}-${shortId}.${ext}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string; photo_id?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  const photoId = clean(body.photo_id, 80);
  if (!contactId || !photoId) return parentPortalJsonInvalid(400);

  const { data: participant, error: partErr } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (partErr || !participant) return parentPortalJsonInvalid(403);

  const displayName = clean(participant.display_name) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ");
  const identityInput = {
    contactId,
    displayName,
    firstName: clean(participant.first_name, 80),
    lastName: clean(participant.last_name, 80),
  };

  const { data: photo, error: photoErr } = await supabase
    .from("portal_participant_achievement_photos")
    .select("id, status, storage_path, session_date, client_name, client_id, parent_downloaded_at")
    .eq("id", photoId)
    .maybeSingle();

  if (photoErr || !photo) return parentPortalJsonInvalid(404);

  if (!PARENT_DOWNLOAD_STATUSES.includes(photo.status as typeof PARENT_DOWNLOAD_STATUSES[number])) {
    return parentPortalJsonInvalid(403);
  }

  if (
    !participantIdentityMatches(
      identityInput,
      String(photo.client_name || ""),
      String(photo.client_id || ""),
    )
  ) {
    return parentPortalJsonInvalid(403);
  }

  const now = new Date().toISOString();
  let downloadedAt = photo.parent_downloaded_at ? String(photo.parent_downloaded_at) : now;

  if (photo.status === "attached") {
    const { error: updErr } = await supabase
      .from("portal_participant_achievement_photos")
      .update({
        status: "downloaded",
        parent_downloaded_at: now,
        parent_downloaded_by_contact_id: contactId,
      })
      .eq("id", photoId)
      .eq("status", "attached");

    if (updErr) {
      console.error("[parent-portal-achievement-download] update", updErr);
      return parentPortalJsonInvalid(500);
    }
    downloadedAt = now;
  } else if (photo.status !== "downloaded") {
    const { error: updErr } = await supabase
      .from("portal_participant_achievement_photos")
      .update({
        status: "downloaded",
        parent_downloaded_at: now,
        parent_downloaded_by_contact_id: contactId,
      })
      .eq("id", photoId)
      .in("status", ["draft", "archived_unused"]);

    if (updErr) {
      console.error("[parent-portal-achievement-download] update draft", updErr);
      return parentPortalJsonInvalid(500);
    }
    downloadedAt = now;
  }

  const storagePath = clean(photo.storage_path, 500);
  if (!storagePath) return parentPortalJsonInvalid(404);

  const filename = downloadFilename(photo.session_date, photoId, storagePath);
  const { data: signed, error: signErr } = await supabase.storage
    .from(ACH_BUCKET)
    .createSignedUrl(storagePath, 3600, { download: filename });

  if (signErr || !signed?.signedUrl) {
    console.error("[parent-portal-achievement-download] sign", signErr);
    return parentPortalJsonInvalid(500);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      download_url: signed.signedUrl,
      filename,
      status: "downloaded",
      downloaded_at: downloadedAt,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
