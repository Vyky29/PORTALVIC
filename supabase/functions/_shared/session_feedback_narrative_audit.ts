import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type NarrativeAuditSource =
  | "voice_transcribe"
  | "narrative_filter"
  | "feedback_submit";

export type NarrativeAuditRow = {
  source: NarrativeAuditSource;
  staffUserId: string;
  staffDisplayName?: string;
  participantName?: string;
  participantGender?: string;
  sessionDate?: string;
  service?: string;
  portalSessionKey?: string;
  narrativeEn: string;
  filterPositive?: string;
  filterRelevant?: string;
  filterStatus?: string;
  voiceLanguage?: string;
  sessionFeedbackId?: string;
  meta?: Record<string, unknown>;
};

function str(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

function serviceClient(): SupabaseClient | null {
  const url = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function logSessionFeedbackNarrativeAudit(
  row: NarrativeAuditRow,
): Promise<void> {
  const narrative = str(row.narrativeEn, 12000);
  if (narrative.length < 8) return;

  const supabase = serviceClient();
  if (!supabase) {
    console.warn("[session_feedback_narrative_audit] service client unavailable");
    return;
  }

  const sessionDate = str(row.sessionDate, 10);
  const payload = {
    source: row.source,
    staff_user_id: row.staffUserId,
    staff_display_name: str(row.staffDisplayName, 200) || null,
    participant_name: str(row.participantName, 200) || null,
    participant_gender: str(row.participantGender, 8) || null,
    session_date: /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : null,
    service: str(row.service, 200) || null,
    portal_session_key: str(row.portalSessionKey, 500) || null,
    narrative_en: narrative,
    filter_positive: str(row.filterPositive, 4000) || null,
    filter_relevant: str(row.filterRelevant, 4000) || null,
    filter_status: str(row.filterStatus, 64) || null,
    voice_language: str(row.voiceLanguage, 16) || null,
    session_feedback_id: str(row.sessionFeedbackId, 64) || null,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
  };

  const { error } = await supabase
    .from("session_feedback_narrative_audit")
    .insert(payload);

  if (error) {
    console.warn(
      "[session_feedback_narrative_audit] insert failed",
      error.message,
    );
  }
}
