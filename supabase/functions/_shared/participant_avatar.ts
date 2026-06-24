// Resolve participant profile photo URLs (Storage + static fallbacks).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const AVATAR_BUCKET = "participant-avatars";
const DOC_BUCKET = "participant-documents";

export function participantAvatarPublicUrl(
  supabaseUrl: string,
  storagePath: string | null | undefined,
): string {
  const path = String(storagePath || "").trim();
  if (!path || !supabaseUrl) return "";
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function participantDocumentPublicUrl(
  supabaseUrl: string,
  storagePath: string | null | undefined,
): string {
  const path = String(storagePath || "").trim();
  if (!path || !supabaseUrl) return "";
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${DOC_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function normalizeParticipantLookupName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function lookupLatestParentFormPhotoPath(
  admin: SupabaseClient,
  displayName: string,
  dobIso: string | null,
): Promise<string | null> {
  const norm = normalizeParticipantLookupName(displayName);
  if (!norm) return null;

  const { data: rows } = await admin
    .from("portal_participant_documents")
    .select("photo_storage_path, participant_name, participant_dob, submitted_at")
    .not("photo_storage_path", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(80);

  for (const row of rows || []) {
    if (!row?.photo_storage_path) continue;
    const rowNorm = normalizeParticipantLookupName(String(row.participant_name || ""));
    if (rowNorm !== norm) continue;
    if (dobIso && row.participant_dob) {
      if (String(row.participant_dob).slice(0, 10) !== dobIso.slice(0, 10)) continue;
    }
    return String(row.photo_storage_path);
  }
  return null;
}

export async function resolveParticipantAvatarUrls(
  admin: SupabaseClient,
  supabaseUrl: string,
  participant: {
    contact_id: string;
    display_name: string;
    dob_iso?: string | null;
    avatar_storage_path?: string | null;
  },
): Promise<{ avatar_url: string | null; avatar_source: string | null }> {
  const path = String(participant.avatar_storage_path || "").trim();
  if (path) {
    return {
      avatar_url: participantAvatarPublicUrl(supabaseUrl, path),
      avatar_source: "storage",
    };
  }

  const docPath = await lookupLatestParentFormPhotoPath(
    admin,
    participant.display_name,
    participant.dob_iso ? String(participant.dob_iso).slice(0, 10) : null,
  );
  if (docPath) {
    const bucket = admin.storage.from(DOC_BUCKET);
    if (bucket.createSignedUrl) {
      const { data: signed } = await bucket.createSignedUrl(docPath, 3600);
      if (signed?.signedUrl) {
        return { avatar_url: signed.signedUrl, avatar_source: "parent_form" };
      }
    }
    return {
      avatar_url: participantDocumentPublicUrl(supabaseUrl, docPath),
      avatar_source: "parent_form",
    };
  }

  return { avatar_url: null, avatar_source: null };
}

export async function syncParentFormPhotoToParticipantAvatar(
  admin: SupabaseClient,
  participantName: string,
  participantDob: string | null,
  photoBytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  if (!photoBytes.length) return null;

  const norm = normalizeParticipantLookupName(participantName);
  if (!norm) return null;

  const { data: parts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, dob_iso");

  const matches = (parts || []).filter((p) => {
    if (normalizeParticipantLookupName(p.display_name) !== norm) return false;
    if (participantDob && p.dob_iso) {
      return String(p.dob_iso).slice(0, 10) === participantDob.slice(0, 10);
    }
    return true;
  });

  if (matches.length !== 1) return null;
  const contactId = matches[0].contact_id;
  const ext = contentType.includes("png") ? "png" : "jpg";
  const avatarPath = `${contactId}/avatar.${ext}`;

  const { error: upErr } = await admin.storage.from(AVATAR_BUCKET).upload(avatarPath, photoBytes, {
    contentType: contentType || (ext === "png" ? "image/png" : "image/jpeg"),
    upsert: true,
  });
  if (upErr) {
    console.warn("[participant_avatar] upload", upErr.message);
    return null;
  }

  await admin
    .from("portal_participants")
    .update({
      avatar_storage_path: avatarPath,
      avatar_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("contact_id", contactId);

  return avatarPath;
}
