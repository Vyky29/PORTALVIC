// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-participant-detail
// --------------------------------
// Sessions overview + parent-safe feedback + achievement photos for one linked child.
//
// Headers: x-parent-portal-session
// Body: { contact_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import {
  resolveParentPortalSession,
} from "../_shared/parent_portal_session.ts";
import {
  feedbackSourceFingerprint,
  sanitizeFeedbackForParents,
} from "../_shared/parent_feedback_sanitize.ts";
import { resolveParticipantAvatarUrls } from "../_shared/participant_avatar.ts";
import {
  instructorFirstName,
  parseGeneralInfoSheet,
} from "../_shared/participant_general_info.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
} from "../_shared/participant_identity.ts";

const ACH_BUCKET = "participant-achievements";
const DOC_BUCKET = "documents";
const SANITIZE_BATCH = 12;
const TERM_LABEL = "Summer Term 2026";

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

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

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

  const { data: genRow } = await supabase
    .from("portal_participant_general_info")
    .select("general_info_sheet, updated_at")
    .eq("contact_id", contactId)
    .maybeSingle();

  let generalInfoSheet = clean(genRow?.general_info_sheet, 12000);
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

  const generalFields = parseGeneralInfoSheet(generalInfoSheet);

  const fbSel =
    "id, session_date, client_name, client_id, service, session_time, attendance, engagement_rating, engagement_patterns, client_emotions, positive_feedback, relevant_information, completed_by_name, created_at";

  const fbQueries = [];
  if (clientSlugs.length) {
    fbQueries.push(supabase.from("session_feedback").select(fbSel).in("client_id", clientSlugs));
  }
  for (const nm of lookupNames.slice(0, 4)) {
    fbQueries.push(supabase.from("session_feedback").select(fbSel).ilike("client_name", nm));
  }

  const rawFeedback: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();
  for (const q of fbQueries) {
    const { data, error } = await q.order("session_date", { ascending: false }).limit(120);
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
      .select("session_feedback_id, source_fingerprint, parent_message, share_status, review_model, reviewed_at")
      .in("session_feedback_id", feedbackIds);
    for (const row of cached || []) {
      cacheById.set(String(row.session_feedback_id), row);
    }
  }

  let sanitizeBudget = SANITIZE_BATCH;
  const sessionsOut: Record<string, unknown>[] = [];

  for (const row of rawFeedback) {
    const id = String(row.id);
    const patterns = row.engagement_patterns;
    const sanitizeInput = {
      clientName: displayName,
      sessionDate: isoFromAny(row.session_date),
      service: clean(row.service, 200),
      positiveFeedback: clean(row.positive_feedback, 2500),
      relevantInformation: clean(row.relevant_information, 2500),
      engagementRating:
        row.engagement_rating != null && row.engagement_rating !== ""
          ? Number(row.engagement_rating)
          : null,
      clientEmotions: clean(row.client_emotions, 200),
      independenceLabel: independenceLabel(patterns),
    };

    const fingerprint = await feedbackSourceFingerprint(sanitizeInput);
    let cache = cacheById.get(id);
    let parentMessage: string | null = null;
    let shareStatus = "hidden";
    let messagePending = false;

    if (cache && cache.source_fingerprint === fingerprint && cache.share_status !== "pending") {
      shareStatus = String(cache.share_status || "hidden");
      parentMessage = cache.parent_message ? String(cache.parent_message) : null;
    } else if (sanitizeBudget > 0) {
      sanitizeBudget--;
      const reviewed = await sanitizeFeedbackForParents(sanitizeInput);
      shareStatus = reviewed.share_status;
      parentMessage = reviewed.parent_message || null;

      const upsertRow = {
        session_feedback_id: id,
        contact_id: contactId,
        source_fingerprint: fingerprint,
        parent_message: parentMessage,
        share_status: shareStatus,
        review_model: reviewed.review_model,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from("portal_parent_feedback_share")
        .upsert(upsertRow, { onConflict: "session_feedback_id" });
      if (upsertErr) console.warn("[parent-portal-participant-detail] cache upsert", upsertErr);
    } else if (cache) {
      shareStatus = String(cache.share_status || "hidden");
      parentMessage = cache.parent_message ? String(cache.parent_message) : null;
    } else {
      messagePending = true;
      shareStatus = "pending";
    }

    sessionsOut.push({
      id,
      session_date: isoFromAny(row.session_date),
      service: clean(row.service, 200),
      session_time: clean(row.session_time, 80),
      instructor: instructorFirstName(row.completed_by_name),
      attendance: clean(row.attendance, 40),
      engagement_rating: row.engagement_rating,
      client_emotions: clean(row.client_emotions, 200),
      independence: independenceLabel(patterns),
      parent_message: shareStatus === "approved" ? parentMessage : null,
      message_pending: messagePending,
    });
  }

  const PARENT_ACH_STATUSES = ["attached", "draft"] as const;

  const achQueries = [];
  if (clientSlugs.length) {
    achQueries.push(
      supabase
        .from("portal_participant_achievement_photos")
        .select("id, session_date, storage_path, client_name, client_id, attached_at, session_feedback_id, status")
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
        .select("id, session_date, storage_path, client_name, client_id, attached_at, session_feedback_id, status")
        .in("status", [...PARENT_ACH_STATUSES])
        .ilike("client_name", nm)
        .order("session_date", { ascending: false })
        .limit(60),
    );
  }

  const achRows: Record<string, unknown>[] = [];
  const seenAch = new Set<string>();
  for (const q of achQueries) {
    const { data } = await q;
    for (const row of data || []) {
      if (!row || !participantIdentityMatches(identityInput, String(row.client_name || ""), String(row.client_id || ""))) continue;
      const aid = String(row.id || "");
      if (!aid || seenAch.has(aid)) continue;
      seenAch.add(aid);
      achRows.push(row);
    }
  }

  achRows.sort((a, b) => String(b.session_date || "").localeCompare(String(a.session_date || "")));

  const achievements: Record<string, unknown>[] = [];
  for (const row of achRows.slice(0, 40)) {
    const path = clean(row.storage_path, 500);
    if (!path) continue;
    const { data: signed, error: signErr } = await supabase.storage
      .from(ACH_BUCKET)
      .createSignedUrl(path, 3600);
    if (signErr || !signed?.signedUrl) continue;
    achievements.push({
      id: row.id,
      session_date: row.session_date,
      session_feedback_id: row.session_feedback_id,
      status: clean(row.status, 40),
      url: signed.signedUrl,
    });
  }

  const serviceSet = new Set<string>();
  rawFeedback.forEach((row) => {
    const label = canonicalProgrammeName(row.service);
    if (label) serviceSet.add(label);
  });
  const services = Array.from(serviceSet).sort();
  const hasAquatics = services.some((s) => isAquaticService(s)) ||
    rawFeedback.some((r) => isAquaticService(r.service));

  const swimTermReviews: Record<string, unknown>[] = [];
  if (hasAquatics) {
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

      for (const doc of docs || []) {
        if (!doc?.file_url) continue;
        if (!participantIdentityMatches(identityInput, String(doc.related_client || ""), "")) continue;
        const { data: signed, error: signErr } = await supabase.storage
          .from(DOC_BUCKET)
          .createSignedUrl(String(doc.file_url), 3600);
        if (signErr || !signed?.signedUrl) continue;
        const shareMeta = (shares || []).find((s) => String(s.document_id) === String(doc.id));
        swimTermReviews.push({
          id: doc.id,
          title: clean(doc.title, 200),
          related_date: doc.related_date,
          ready_at: shareMeta?.ready_at || doc.created_at,
          download_url: signed.signedUrl,
        });
      }
      swimTermReviews.sort((a, b) =>
        String(b.related_date || b.ready_at || "").localeCompare(String(a.related_date || a.ready_at || ""))
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      term_label: TERM_LABEL,
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
        term_label: TERM_LABEL,
        general_info_sheet: generalInfoSheet,
        fields: generalFields,
        updated_at: genRow?.updated_at || null,
        editable: true,
      },
      sessions: sessionsOut,
      achievements,
      swim_term_reviews: swimTermReviews,
      pending_review_count: sessionsOut.filter((s) => s.message_pending).length,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
