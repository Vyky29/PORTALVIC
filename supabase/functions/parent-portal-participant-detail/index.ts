// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-participant-detail
// --------------------------------
// Sessions overview + parent-safe feedback + achievement photos for one linked child.
//
// Headers: x-parent-portal-session
// Body: { contact_id: string, sections?: ("general"|"sessions"|"achievements"|"swim")[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import {
  resolveParentPortalSession,
} from "../_shared/parent_portal_session.ts";
import {
  feedbackAuthorFirstName,
  resolveFeedbackAuthorRole,
} from "../_shared/parent_feedback_author_role.ts";
import { enforceParticipantFirstNameInText } from "../_shared/participant_feedback_name.ts";
import { resolveParticipantAvatarUrls } from "../_shared/participant_avatar.ts";
import {
  lookupClientsInfoSheetForParticipant,
  parseGeneralInfoSheet,
} from "../_shared/participant_general_info.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
} from "../_shared/participant_identity.ts";
import {
  buildParentAttendanceSummary,
  PARENT_SESSION_TERM_START_ISO,
} from "../_shared/parent_attendance_summary.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";
import { buildReenrolmentParentSummary } from "../_shared/reenrolment_parent_summary.ts";

const ACH_BUCKET = "participant-achievements";
const DOC_BUCKET = "documents";
/** Max feedback rows returned per parent page load. */
const PARENT_FEEDBACK_LIMIT = 60;
const TERM_LABEL = "Summer Term 2026";

type DetailSection = "general" | "sessions" | "achievements" | "swim";

function parseSections(raw: unknown): Set<DetailSection> {
  const all = new Set<DetailSection>(["general", "sessions", "achievements", "swim"]);
  if (!Array.isArray(raw) || !raw.length) return all;
  const out = new Set<DetailSection>();
  for (const item of raw) {
    const t = clean(item, 40).toLowerCase();
    if (t === "general" || t === "sessions" || t === "achievements" || t === "swim") {
      out.add(t as DetailSection);
    }
  }
  return out.size ? out : all;
}

async function detectHasAquatics(
  supabase: ReturnType<typeof createClient>,
  clientSlugs: string[],
): Promise<boolean> {
  if (!clientSlugs.length) return false;
  const { data } = await supabase
    .from("session_feedback")
    .select("service")
    .in("client_id", clientSlugs)
    .order("session_date", { ascending: false })
    .limit(12);
  return (data || []).some((row) => isAquaticService(row.service));
}

/** Acton / Northolt pool sites — achievement photos are not taken (centre rules). */
function isCentreAquaticVenue(raw: unknown): boolean {
  const v = clean(raw, 80).toLowerCase();
  return v === "acton" || v === "northolt";
}

/**
 * True when every active roster slot for this child is Aquatic Activity at Acton or Northolt.
 * Parents in that programme should see an empty achievement gallery with a centre-rules note.
 */
async function detectAquaticOnlyNoPhotos(
  supabase: ReturnType<typeof createClient>,
  identityInput: {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  },
  lookupNames: string[],
): Promise<boolean> {
  const names = [
    ...new Set(
      [...lookupNames.slice(0, 5), identityInput.displayName || ""]
        .map((n) => clean(n, 80))
        .filter(Boolean),
    ),
  ];
  if (!names.length) return false;

  const queries = names.map((nm) =>
    supabase
      .from("portal_roster_rows")
      .select("client_name, service, venue, status")
      .eq("status", "active")
      .ilike("client_name", nm)
      .limit(40),
  );

  const rows: Array<{ service?: unknown; venue?: unknown; client_name?: unknown }> = [];
  const seen = new Set<string>();
  const results = await Promise.all(queries);
  for (const { data } of results) {
    for (const row of data || []) {
      if (!row) continue;
      if (!participantIdentityMatches(identityInput, String(row.client_name || ""), "")) continue;
      const key = [
        clean(row.client_name, 80),
        clean(row.service, 80),
        clean(row.venue, 80),
      ]
        .join("|")
        .toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  if (!rows.length) return false;
  return rows.every((r) => isAquaticService(r.service) && isCentreAquaticVenue(r.venue));
}

function isAquaticService(raw: unknown): boolean {
  const p = clean(raw, 200).toLowerCase();
  return /aquatic|swim|pool|splash/.test(p);
}

function canonicalProgrammeName(raw: unknown): string {
  const t = clean(raw, 200);
  if (!t) return "";
  const p = t.toLowerCase().replace(/\s+/g, " ");
  if (/multi[\s_-]*activity|splash[\s&+]+connect/.test(p)) return "Multi-Activity";
  if (/\bfitness\b|physical\s+act/.test(p)) return "Physical Activity";
  if (/\bclimb(ing)?\b/.test(p)) return "Climbing Activity";
  if (/\baquatic|swim|pool/.test(p)) return "Aquatic Activity";
  return t.length > 48 ? t.slice(0, 45) + "…" : t;
}

function formatDobDisplay(iso: unknown): string {
  const s = isoFromAny(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  try {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (_) {
    return s;
  }
}

function clean(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isoFromAny(raw: unknown): string {
  const s = clean(raw, 32);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return "";
}

function independenceLabel(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((x) => clean(x, 120)).filter(Boolean).join(", ");
  return clean(raw, 400);
}

function parentCommentFromRow(
  positiveText: string,
  cache: Record<string, unknown> | undefined,
): { comment: string | null; pending: boolean } {
  if (!positiveText) return { comment: null, pending: false };
  const status = cache ? String(cache.share_status || "") : "";
  if (status === "hidden") return { comment: null, pending: false };
  if (status === "pending") return { comment: null, pending: true };
  return { comment: positiveText, pending: false };
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

  let body: { contact_id?: string; sections?: string[] } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

  const sections = parseSections(body.sections);
  const wantGeneral = sections.has("general");
  const wantSessions = sections.has("sessions");
  const wantAchievements = sections.has("achievements");
  const wantSwim = sections.has("swim");

  const { data: participant, error: partErr } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, dob_iso, in_class, on_waiting_list, avatar_storage_path")
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
  const clientSlugs = resolveParticipantClientSlugs(identityInput);
  const lookupNames = resolveParticipantLookupNames(identityInput);

  const { data: contactRow } = await supabase
    .from("portal_parent_contacts")
    .select("city, postcode, in_class, on_waiting_list, child_display")
    .eq("contact_id", contactId)
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  const avatar = await resolveParticipantAvatarUrls(supabase, url, {
    contact_id: contactId,
    display_name: displayName,
    dob_iso: participant.dob_iso,
    avatar_storage_path: participant.avatar_storage_path,
  });

  let generalInfoSheet = "";
  let generalUpdatedAt: string | null = null;

  if (wantGeneral) {
    const { data: genRow } = await supabase
      .from("portal_participant_general_info")
      .select("general_info_sheet, updated_at")
      .eq("contact_id", contactId)
      .maybeSingle();

    generalInfoSheet = clean(genRow?.general_info_sheet, 12000);
    generalUpdatedAt = genRow?.updated_at ? String(genRow.updated_at) : null;

    if (!generalInfoSheet) {
      const nameFilters = lookupNames.slice(0, 4);
      for (const nm of nameFilters) {
        const { data: docRows } = await supabase
          .from("portal_participant_documents")
          .select("payload_json, participant_name")
          .ilike("participant_name", nm)
          .order("submitted_at", { ascending: false })
          .limit(3);
        for (const doc of docRows || []) {
          const payload = doc?.payload_json as Record<string, unknown> | null;
          const blob = clean(payload?.general_info || payload?.client_info || payload?.info_sheet, 12000);
          if (blob) {
            generalInfoSheet = blob;
            break;
          }
        }
        if (generalInfoSheet) break;
      }
    }

    if (!generalInfoSheet) {
      generalInfoSheet = lookupClientsInfoSheetForParticipant(identityInput);
    }
  }

  const generalFields = wantGeneral ? parseGeneralInfoSheet(generalInfoSheet) : [];

  let rawFeedback: Record<string, unknown>[] = [];
  let sessionsOut: Record<string, unknown>[] = [];

  if (wantSessions) {
    const fbSel =
      "id, session_date, client_name, client_id, service, session_time, attendance, engagement_rating, engagement_patterns, client_emotions, positive_feedback, relevant_information, completed_by_name, created_at";

    const fbQueries = [];
    if (clientSlugs.length) {
      fbQueries.push(supabase.from("session_feedback").select(fbSel).in("client_id", clientSlugs));
    }
    for (const nm of lookupNames.slice(0, 4)) {
      fbQueries.push(supabase.from("session_feedback").select(fbSel).ilike("client_name", nm));
    }

    const seenIds = new Set<string>();
    const fbResults = await Promise.all(
      fbQueries.map((q) => q.order("session_date", { ascending: false }).limit(PARENT_FEEDBACK_LIMIT)),
    );
    for (const { data, error } of fbResults) {
      if (error) {
        console.error("[parent-portal-participant-detail] feedback error", error);
        continue;
      }
      for (const row of data || []) {
        if (!row || !participantIdentityMatches(identityInput, String(row.client_name || ""), String(row.client_id || ""))) continue;
        const id = String(row.id || "");
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        rawFeedback.push(row);
      }
    }

    rawFeedback.sort((a, b) => {
      const da = isoFromAny(a.session_date);
      const db = isoFromAny(b.session_date);
      if (da !== db) return db.localeCompare(da);
      return clean(b.session_time).localeCompare(clean(a.session_time));
    });

    const feedbackIds = rawFeedback.map((r) => String(r.id)).filter(Boolean);
    const cacheById = new Map<string, Record<string, unknown>>();

    if (feedbackIds.length) {
      const { data: cached } = await supabase
        .from("portal_parent_feedback_share")
        .select("session_feedback_id, source_fingerprint, parent_message, share_status, review_model, reviewed_at, admin_edited_at")
        .in("session_feedback_id", feedbackIds);
      for (const row of cached || []) {
        cacheById.set(String(row.session_feedback_id), row);
      }
    }

    for (const row of rawFeedback) {
      const id = String(row.id);
      const patterns = row.engagement_patterns;
      const positiveText = enforceParticipantFirstNameInText(
        clean(row.positive_feedback, 2500),
        clean(row.client_name, 200),
      );
      const service = clean(row.service, 200);
      const staffName = clean(row.completed_by_name, 120);
      const cache = cacheById.get(id);
      const commentPack = parentCommentFromRow(positiveText, cache);

      sessionsOut.push({
        id,
        session_date: isoFromAny(row.session_date),
        service,
        session_time: clean(row.session_time, 80),
        attendance: clean(row.attendance, 40),
        engagement_rating: row.engagement_rating,
        client_emotions: clean(row.client_emotions, 200),
        independence: independenceLabel(patterns),
        feedback_by_name: feedbackAuthorFirstName(staffName),
        feedback_by_role: staffName ? resolveFeedbackAuthorRole(staffName, service) : "",
        comment: commentPack.comment,
        parent_message: commentPack.comment,
        message_pending: commentPack.pending,
      });
    }

    sessionsOut.sort((a, b) => {
      const da = String(a.session_date || "");
      const db = String(b.session_date || "");
      if (da !== db) return db.localeCompare(da);
      return clean(b.session_time).localeCompare(clean(a.session_time));
    });
  }

  let attendanceSummary = { attended: 0, absent: 0, total: 0, makeup_absent: 0 };
  if (wantSessions && clientSlugs.length) {
    const { data: overrideRows, error: ovErr } = await supabase
      .from("schedule_overrides")
      .select("session_date, anchor_start, anchor_client_id, override_type, status, payload")
      .eq("status", "active")
      .in("override_type", ["client_replace_in_slot", "client_absence_announced"])
      .gte("session_date", PARENT_SESSION_TERM_START_ISO)
      .in("anchor_client_id", clientSlugs);
    if (ovErr) {
      console.error("[parent-portal-participant-detail] schedule_overrides error", ovErr);
    }
    attendanceSummary = buildParentAttendanceSummary(
      rawFeedback,
      overrideRows || [],
      clientSlugs,
      PARENT_SESSION_TERM_START_ISO,
    );
  } else if (wantSessions && rawFeedback.length) {
    attendanceSummary = buildParentAttendanceSummary(
      rawFeedback,
      [],
      clientSlugs,
      PARENT_SESSION_TERM_START_ISO,
    );
  }

  let achievements: Record<string, unknown>[] = [];

  if (wantAchievements) {
    const PARENT_ACH_STATUSES = ["attached", "downloaded"] as const;
    const achQueries = [];
    if (clientSlugs.length) {
      achQueries.push(
        supabase
          .from("portal_participant_achievement_photos")
          .select("id, session_date, storage_path, client_name, client_id, attached_at, session_feedback_id, status, parent_downloaded_at, width, height, media_type")
          .in("status", [...PARENT_ACH_STATUSES])
          .in("client_id", clientSlugs)
          .order("session_date", { ascending: false })
          .limit(60),
      );
    }
    for (const nm of lookupNames.slice(0, 4)) {
      achQueries.push(
        supabase
          .from("portal_participant_achievement_photos")
          .select("id, session_date, storage_path, client_name, client_id, attached_at, session_feedback_id, status, parent_downloaded_at, width, height, media_type")
          .in("status", [...PARENT_ACH_STATUSES])
          .ilike("client_name", nm)
          .order("session_date", { ascending: false })
          .limit(60),
      );
    }

    const achRows: Record<string, unknown>[] = [];
    const seenAch = new Set<string>();
    const achResults = await Promise.all(achQueries);
    for (const { data } of achResults) {
      for (const row of data || []) {
        if (!row || !participantIdentityMatches(identityInput, String(row.client_name || ""), String(row.client_id || ""))) continue;
        const aid = String(row.id || "");
        if (!aid || seenAch.has(aid)) continue;
        seenAch.add(aid);
        achRows.push(row);
      }
    }

    achRows.sort((a, b) => String(b.session_date || "").localeCompare(String(a.session_date || "")));

    const signedRows = await Promise.all(
      achRows.slice(0, 40).map(async (row) => {
        const path = clean(row.storage_path, 500);
        if (!path) return null;
        const { data: signed, error: signErr } = await supabase.storage
          .from(ACH_BUCKET)
          .createSignedUrl(path, 3600);
        if (signErr || !signed?.signedUrl) return null;
        return {
          id: row.id,
          session_date: row.session_date,
          session_feedback_id: row.session_feedback_id,
          status: clean(row.status, 40),
          downloaded_at: row.parent_downloaded_at ? String(row.parent_downloaded_at) : null,
          width: Number(row.width) > 0 ? Number(row.width) : null,
          height: Number(row.height) > 0 ? Number(row.height) : null,
          media_type: clean(row.media_type, 20) || "photo",
          url: signed.signedUrl,
        };
      }),
    );
    achievements = signedRows.filter(Boolean) as Record<string, unknown>[];
  }

  const serviceSet = new Set<string>();
  rawFeedback.forEach((row) => {
    const label = canonicalProgrammeName(row.service);
    if (label) serviceSet.add(label);
  });
  const services = Array.from(serviceSet).sort();
  let hasAquatics = services.some((s) => isAquaticService(s)) ||
    rawFeedback.some((r) => isAquaticService(r.service));
  if (!hasAquatics && (wantGeneral || wantSwim) && !wantSessions) {
    hasAquatics = await detectHasAquatics(supabase, clientSlugs);
  }

  const aquaticOnlyNoPhotos = await detectAquaticOnlyNoPhotos(supabase, identityInput, lookupNames);

  let reenrolmentSummary = buildReenrolmentParentSummary(null, null);
  if (wantGeneral) {
    const { data: reenrolRow } = await supabase
      .from("portal_re_enrolment_submissions")
      .select("submitted_at, payload")
      .eq("academic_year", REENROL_ACADEMIC_YEAR)
      .eq("participant_contact_id", contactId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const submittedAt = reenrolRow?.submitted_at ? String(reenrolRow.submitted_at) : null;
    const payload = reenrolRow?.payload && typeof reenrolRow.payload === "object"
      ? (reenrolRow.payload as Record<string, unknown>)
      : null;
    reenrolmentSummary = buildReenrolmentParentSummary(payload, submittedAt);
  }

  let swimTermReviewAvailable = false;
  if (wantGeneral) {
    const { count: swimShareCount } = await supabase
      .from("portal_parent_swim_term_share")
      .select("document_id", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .eq("share_status", "ready");
    swimTermReviewAvailable = (swimShareCount || 0) > 0;
  }

  const swimTermReviews: Record<string, unknown>[] = [];
  if (wantSwim && (hasAquatics || swimTermReviewAvailable)) {
    const { data: shares } = await supabase
      .from("portal_parent_swim_term_share")
      .select("document_id, ready_at")
      .eq("contact_id", contactId)
      .eq("share_status", "ready");

    const shareIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
    if (shareIds.length) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title, related_date, file_url, created_at, related_client, document_type")
        .in("id", shareIds)
        .eq("document_type", "swim_term_review");

      const swimSigned = await Promise.all(
        (docs || []).map(async (doc) => {
          if (!doc?.file_url) return null;
          if (!participantIdentityMatches(identityInput, String(doc.related_client || ""), "")) return null;
          const { data: signed, error: signErr } = await supabase.storage
            .from(DOC_BUCKET)
            .createSignedUrl(String(doc.file_url), 3600);
          if (signErr || !signed?.signedUrl) return null;
          const shareMeta = (shares || []).find((s) => String(s.document_id) === String(doc.id));
          return {
            id: doc.id,
            title: clean(doc.title, 200),
            related_date: doc.related_date,
            ready_at: shareMeta?.ready_at || doc.created_at,
            download_url: signed.signedUrl,
          };
        }),
      );
      swimTermReviews.push(...(swimSigned.filter(Boolean) as Record<string, unknown>[]));
      swimTermReviews.sort((a, b) =>
        String(b.related_date || b.ready_at || "").localeCompare(String(a.related_date || a.ready_at || ""))
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      term_label: TERM_LABEL,
      sections_loaded: Array.from(sections),
      participant: {
        contact_id: participant.contact_id,
        display_name: displayName,
        first_name: participant.first_name,
        last_name: participant.last_name,
        dob_iso: participant.dob_iso,
        dob_display: formatDobDisplay(participant.dob_iso),
        in_class: participant.in_class ?? contactRow?.in_class ?? null,
        on_waiting_list: participant.on_waiting_list ?? contactRow?.on_waiting_list ?? null,
        city: contactRow?.city && contactRow.city !== "—" ? contactRow.city : null,
        postcode: contactRow?.postcode && contactRow.postcode !== "—" ? contactRow.postcode : null,
        avatar_url: avatar.avatar_url,
      },
      general: {
        services,
        has_aquatics: hasAquatics,
        aquatic_only_no_photos: aquaticOnlyNoPhotos,
        term_label: TERM_LABEL,
        general_info_sheet: generalInfoSheet,
        fields: generalFields,
        updated_at: generalUpdatedAt,
        editable: true,
      },
      sessions: sessionsOut,
      attendance_summary: attendanceSummary,
      achievements,
      swim_term_reviews: swimTermReviews,
      swim_term_review_available: swimTermReviewAvailable,
      reenrolment: reenrolmentSummary,
      pending_review_count: sessionsOut.filter((s) => s.message_pending).length,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
