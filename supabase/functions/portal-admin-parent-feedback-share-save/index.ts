// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-feedback-share-save
// Admin edits the family-portal session summary for one feedback row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
} from "../_shared/participant_identity.ts";

function clean(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function resolveContactIdForFeedback(
  supabase: ReturnType<typeof createClient>,
  clientName: string,
  clientId: string,
): Promise<string> {
  const { data: participants } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name");

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

  const slugs = resolveParticipantClientSlugs({ contactId: clientId, displayName: clientName });
  return slugs[0] || clientId || clientName || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: { session_feedback_id?: string; parent_message?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const feedbackId = clean(body.session_feedback_id, 80);
  if (!feedbackId) return portalAdminJson(400, { ok: false, error: "missing_feedback_id" });

  const message = String(body.parent_message ?? "").trim().slice(0, 4000);
  const shareStatus = message ? "approved" : "hidden";

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: fb, error: fbErr } = await admin
    .from("session_feedback")
    .select("id, client_name, client_id")
    .eq("id", feedbackId)
    .maybeSingle();

  if (fbErr || !fb) return portalAdminJson(404, { ok: false, error: "feedback_not_found" });

  const contactId = await resolveContactIdForFeedback(
    admin,
    clean(fb.client_name, 200),
    clean(fb.client_id, 200),
  );

  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("portal_parent_feedback_share")
    .select("source_fingerprint")
    .eq("session_feedback_id", feedbackId)
    .maybeSingle();

  const { error: upsertErr } = await admin.from("portal_parent_feedback_share").upsert(
    {
      session_feedback_id: feedbackId,
      contact_id: contactId,
      source_fingerprint: existing?.source_fingerprint || `admin-edit:${now}`,
      parent_message: message || null,
      share_status: shareStatus,
      review_model: "admin-edit",
      reviewed_at: now,
      updated_at: now,
      admin_edited_at: now,
      admin_edited_by_user_id: verified.userId,
    },
    { onConflict: "session_feedback_id" },
  );

  if (upsertErr) {
    console.error("[portal-admin-parent-feedback-share-save]", upsertErr.message);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    share: {
      session_feedback_id: feedbackId,
      parent_message: message || null,
      share_status: shareStatus,
      admin_edited_at: now,
    },
  });
});
