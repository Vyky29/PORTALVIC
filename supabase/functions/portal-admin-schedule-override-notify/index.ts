// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-schedule-override-notify
// ------------------------------------
// Admin: after Schedule & Covers save, auto-notify parent (instructor / cancel / move).
//
// Deploy:
//   npx supabase functions deploy portal-admin-schedule-override-notify --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  notifyScheduleOverrideParent,
  type ScheduleOverrideNotifyKind,
} from "../_shared/portal_schedule_override_notify.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const kind = clean(body.kind, 40) as ScheduleOverrideNotifyKind;
  if (
    kind !== "instructor_change" &&
    kind !== "instructor_change_update" &&
    kind !== "session_cancelled" &&
    kind !== "time_change"
  ) {
    return portalAdminJson(400, { ok: false, error: "bad_kind" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const contactId = clean(body.contact_id, 120);
  const parentPersonId = clean(body.parent_person_id, 120);
  const participantDisplay = clean(body.participant_display, 160);
  if (!contactId && !parentPersonId && !participantDisplay) {
    return portalAdminJson(400, { ok: false, error: "participant_required" });
  }

  const notify = await notifyScheduleOverrideParent(admin, {
    kind,
    overrideId: clean(body.override_id, 60) || null,
    contactId: contactId || null,
    parentPersonId: parentPersonId || null,
    participantDisplay: participantDisplay || null,
    venue: clean(body.venue, 80) || null,
    sessionDate: clean(body.session_date, 12) || null,
    sessionTime: clean(body.session_time, 40) || null,
    serviceLabel: clean(body.service_label, 160) || null,
    reason: clean(body.reason, 500) || null,
    absentInstructorName: clean(body.absent_instructor_name, 120) || null,
    coveringStaffName: clean(body.covering_staff_name, 120) || null,
    coveringStaffKey: clean(
      body.covering_staff_key || body.covering_staff_id,
      80,
    ) || null,
    priorCoveringStaffName: clean(body.prior_covering_staff_name, 120) || null,
    oldTime: clean(body.old_time, 40) || null,
    newTime: clean(body.new_time, 40) || null,
    instructorPhotoUrl: clean(body.instructor_photo_url, 400) || null,
    actorEmail: verified.email || null,
    source: clean(body.source, 80) || "schedule_covers",
  });

  return portalAdminJson(200, { ok: true, notify });
});
