// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-feedback-generate
// -------------------------------------
// Admin-triggered: generate (sanitize + cache) family summaries for the given
// session_feedback rows that have no up-to-date share yet, then return shares.
// Lets the admin Sessions hub fill the family-summary column on demand.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  sanitizeAndCacheParentFeedbackShare,
  type ParticipantLite,
  type SessionFeedbackRow,
} from "../_shared/parent_feedback_sanitize_job.ts";

const MAX_IDS = 120;
const CONCURRENCY = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: { feedback_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const ids = Array.isArray(body.feedback_ids)
    ? [...new Set(body.feedback_ids.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, MAX_IDS)
    : [];
  if (!ids.length) return portalAdminJson(400, { ok: false, error: "feedback_ids_required" });

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Generate for rows without a usable share. Skip admin-edited rows and rows
  // already settled by a real review — but DO refresh rows left empty/hidden.
  const { data: existingShares } = await admin
    .from("portal_parent_feedback_share")
    .select("session_feedback_id, share_status, admin_edited_at, review_model, parent_message")
    .in("session_feedback_id", ids);
  const settled = new Set<string>();
  for (const s of existingShares || []) {
    const status = String(s.share_status || "");
    const model = String(s.review_model || "");
    const msg = String(s.parent_message || "").trim();
    if (s.admin_edited_at) {
      settled.add(String(s.session_feedback_id));
    } else if (status && status !== "pending" && model !== "fallback-no-openai" && !(status === "hidden" && !msg)) {
      settled.add(String(s.session_feedback_id));
    }
  }
  const toGenerate = ids.filter((id) => !settled.has(id));

  if (toGenerate.length) {
    const { data: rows } = await admin
      .from("session_feedback")
      .select(
        "id, client_name, client_id, service, session_date, attendance, positive_feedback, relevant_information, engagement_rating, engagement_patterns, client_emotions",
      )
      .in("id", toGenerate);

    const { data: participants } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name");
    const preloaded = (participants || []) as ParticipantLite[];

    const queue = (rows || []) as SessionFeedbackRow[];
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      const chunk = queue.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map((row) => sanitizeAndCacheParentFeedbackShare(admin, row, preloaded)),
      );
    }
  }

  const { data: shares, error } = await admin
    .from("portal_parent_feedback_share")
    .select(
      "session_feedback_id, parent_message, share_status, review_model, reviewed_at, admin_edited_at, admin_edited_by_user_id",
    )
    .in("session_feedback_id", ids);

  if (error) {
    console.error("[portal-admin-parent-feedback-generate]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    shares: shares || [],
    generated: toGenerate.length,
    count: (shares || []).length,
  });
});
