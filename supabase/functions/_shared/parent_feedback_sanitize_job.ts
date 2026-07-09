/**
 * Sanitize one session_feedback row for the family portal and upsert portal_parent_feedback_share.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  canonicalParticipantClientId,
  participantIdentityMatches,
  slugifyParticipantKey,
} from "./participant_identity.ts";
import {
  feedbackSourceFingerprint,
  parentSummaryModelNeedsRefresh,
  sanitizeFeedbackForParents,
  type SanitizeInput,
} from "./parent_feedback_sanitize.ts";

export type SessionFeedbackRow = {
  id: string;
  client_name?: string | null;
  client_id?: string | null;
  service?: string | null;
  session_date?: string | null;
  attendance?: string | null;
  positive_feedback?: string | null;
  relevant_information?: string | null;
  engagement_rating?: number | string | null;
  engagement_patterns?: unknown;
  client_emotions?: string | null;
};

function clean(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isoFromAny(raw: unknown): string {
  const s = clean(raw, 32);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function independenceLabel(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((x) => clean(x, 120)).filter(Boolean).join(", ");
  return clean(raw, 400);
}

function feedbackAttendanceIsAbsent(attendance: unknown): boolean {
  const att = clean(attendance, 80).toLowerCase();
  if (!att) return false;
  if (att === "no" || att === "n" || att === "0" || att === "false") return true;
  if (/^(no[\s\-/]|n\/)/.test(att)) return true;
  if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)/.test(att)) return true;
  return false;
}

function hasReviewableNotes(row: SessionFeedbackRow): boolean {
  return clean(row.positive_feedback, 2500).length > 0;
}

export type ParticipantLite = {
  contact_id?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

async function resolveContactIdForFeedback(
  supabase: SupabaseClient,
  clientName: string,
  clientId: string,
  preloadedParticipants?: ParticipantLite[],
): Promise<string> {
  let participants = preloadedParticipants;
  if (!participants) {
    const { data } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name");
    participants = data || [];
  }

  for (const p of participants || []) {
    if (
      participantIdentityMatches(
        {
          contactId: String(p.contact_id || ""),
          displayName: String(p.display_name || ""),
          firstName: String(p.first_name || ""),
          lastName: String(p.last_name || ""),
        },
        clientName,
        clientId,
      )
    ) {
      return String(p.contact_id);
    }
  }

  const slug = canonicalParticipantClientId(clientName || clientId);
  if (slug) return slug;
  const raw = slugifyParticipantKey(clientId || clientName);
  return raw || "unknown";
}

function buildSanitizeInput(row: SessionFeedbackRow, clientDisplayName: string): SanitizeInput {
  return {
    clientName: clientDisplayName,
    sessionDate: isoFromAny(row.session_date),
    service: clean(row.service, 200),
    positiveFeedback: clean(row.positive_feedback, 2500),
    relevantInformation: clean(row.relevant_information, 2500),
    engagementRating:
      row.engagement_rating != null && row.engagement_rating !== ""
        ? Number(row.engagement_rating)
        : null,
    clientEmotions: clean(row.client_emotions, 200),
    independenceLabel: independenceLabel(row.engagement_patterns),
  };
}

export async function sanitizeAndCacheParentFeedbackShare(
  supabase: SupabaseClient,
  row: SessionFeedbackRow,
  preloadedParticipants?: ParticipantLite[],
): Promise<{ ok: boolean; skipped?: string; share_status?: string }> {
  const id = String(row.id || "").trim();
  if (!id) return { ok: false, skipped: "no_id" };

  if (feedbackAttendanceIsAbsent(row.attendance)) {
    await supabase.from("portal_parent_feedback_share").upsert(
      {
        session_feedback_id: id,
        contact_id: await resolveContactIdForFeedback(
          supabase,
          clean(row.client_name, 200),
          clean(row.client_id, 200),
          preloadedParticipants,
        ),
        source_fingerprint: "absent",
        parent_message: null,
        share_status: "hidden",
        review_model: "skip-absent",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_feedback_id" },
    );
    return { ok: true, skipped: "absent", share_status: "hidden" };
  }

  if (!hasReviewableNotes(row)) {
    return { ok: true, skipped: "no_notes" };
  }

  const clientName = clean(row.client_name, 200);
  const clientId = clean(row.client_id, 200);
  const contactId = await resolveContactIdForFeedback(
    supabase,
    clientName,
    clientId,
    preloadedParticipants,
  );
  const displayName = clientName || clientId || "Participant";
  const input = buildSanitizeInput(row, displayName);
  const fingerprint = await feedbackSourceFingerprint(input);

  const { data: existing } = await supabase
    .from("portal_parent_feedback_share")
    .select("source_fingerprint, share_status, admin_edited_at, review_model")
    .eq("session_feedback_id", id)
    .maybeSingle();

  if (existing?.admin_edited_at) {
    return { ok: true, skipped: "admin_edited", share_status: String(existing.share_status || "hidden") };
  }

  // Refresh rows left empty/hidden by earlier fallbacks or outdated AI drafts.
  const wasStaleFallback = parentSummaryModelNeedsRefresh(existing?.review_model);
  const wasHiddenEmpty =
    String(existing?.share_status || "") === "hidden" &&
    !String(existing?.parent_message || "").trim();
  if (
    existing &&
    existing.source_fingerprint === fingerprint &&
    existing.share_status !== "pending" &&
    !wasStaleFallback &&
    !wasHiddenEmpty
  ) {
    return { ok: true, skipped: "unchanged", share_status: String(existing.share_status) };
  }

  const reviewed = await sanitizeFeedbackForParents(input);
  const { error: upsertErr } = await supabase.from("portal_parent_feedback_share").upsert(
    {
      session_feedback_id: id,
      contact_id: contactId,
      source_fingerprint: fingerprint,
      parent_message: reviewed.parent_message || null,
      share_status: reviewed.share_status,
      review_model: reviewed.review_model,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_feedback_id" },
  );

  if (upsertErr) {
    console.error("[parent-feedback-sanitize-job] upsert", upsertErr);
    return { ok: false, skipped: "upsert_failed" };
  }

  return { ok: true, share_status: reviewed.share_status };
}
