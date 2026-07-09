// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-absence-list
// Parent lists Absent reports for a participant (marks expired when past deadline).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function todayIsoLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const today = todayIsoLondon();

  // Auto-expire open reports past the 14-day proof window (no upload left).
  await supabase
    .from("portal_parent_absence_reports")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .in("status", ["missed", "pending_review"])
    .lt("proof_deadline", today);

  const { data: rows, error } = await supabase
    .from("portal_parent_absence_reports")
    .select(
      "id, contact_id, participant_display, session_date, service_label, session_time, status, reason_code, reason_text, proof_file_name, proof_uploaded_at, proof_deadline, reviewed_at, review_notes, outcome, outcome_notes, created_at",
    )
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .order("session_date", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[parent-portal-absence-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const reports = (rows || []).map((r) => {
    const deadline = String(r.proof_deadline || "");
    const isUnwellTrack = r.status === "missed" || r.status === "pending_review" || r.status === "rejected";
    const canUpload =
      isUnwellTrack &&
      (r.status === "missed" || r.status === "pending_review" || r.status === "rejected") &&
      deadline >= today;
    return {
      ...r,
      can_upload_proof: canUpload,
      proof_window_closed:
        !canUpload &&
        (r.status === "missed" || r.status === "expired" || r.status === "rejected"),
    };
  });

  return json(200, { ok: true, reports, today });
});
