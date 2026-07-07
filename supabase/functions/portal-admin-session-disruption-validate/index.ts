// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-session-disruption-validate
// Admin validates (or undoes) a Session Disruption report (POL-048).
// On validate: stamps validated_at/by and upserts staff_unavailability for the
// reporter's day, so the staff dashboard replaces that day's shift with
// "Day off (Time Off Requested)". On undo: clears the stamp and removes the day.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function nameKeyFromText(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeOpsAdminNameKey(key: string): string {
  const k = clean(key).toLowerCase();
  if (k === "info") return "sevitha";
  return k;
}

async function resolveNameKey(
  admin: ReturnType<typeof createClient>,
  userId: string,
  fullName: string,
): Promise<string> {
  const { data: hrRow } = await admin
    .from("hr_records")
    .select("name_key")
    .eq("staff_id", userId)
    .not("name_key", "is", null)
    .limit(1)
    .maybeSingle();
  if (hrRow?.name_key) return String(hrRow.name_key);

  const { data: prof } = await admin
    .from("staff_profiles")
    .select("full_name, username")
    .eq("id", userId)
    .maybeSingle();
  const name = clean(prof?.full_name || fullName || prof?.username || "", 120);
  const key = normalizeOpsAdminNameKey(nameKeyFromText(name));
  if (key) return key;
  return normalizeOpsAdminNameKey(nameKeyFromText(clean(prof?.username || "", 80)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: { report_id?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const reportId = clean(body.report_id, 60);
  const action = clean(body.action, 20).toLowerCase() || "validate";
  if (!reportId) return portalAdminJson(400, { ok: false, error: "report_id_required" });
  if (action !== "validate" && action !== "undo") {
    return portalAdminJson(400, { ok: false, error: "invalid_action" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error: loadErr } = await admin
    .from("session_disruption_reports")
    .select("id, submitted_by_user_id, submitted_by_name, session_date, disruption_type, reason_category")
    .eq("id", reportId)
    .maybeSingle();
  if (loadErr) {
    console.error("[portal-admin-session-disruption-validate] load", loadErr.message);
    return portalAdminJson(500, { ok: false, error: "load_failed" });
  }
  if (!report) return portalAdminJson(404, { ok: false, error: "report_not_found" });

  const staffUserId = String(report.submitted_by_user_id || "");
  const submittedByName = clean(report.submitted_by_name, 200);
  const sessionDate = String(report.session_date || "").slice(0, 10);
  const nameKey = staffUserId ? await resolveNameKey(admin, staffUserId, submittedByName) : "";

  if (action === "undo") {
    const { error: updErr } = await admin
      .from("session_disruption_reports")
      .update({ validated_at: null, validated_by: null, validated_by_name: null, day_off_recorded: false })
      .eq("id", reportId);
    if (updErr) {
      console.error("[portal-admin-session-disruption-validate] undo update", updErr.message);
      return portalAdminJson(500, { ok: false, error: "update_failed" });
    }
    if (nameKey && sessionDate) {
      await admin
        .from("staff_unavailability")
        .delete()
        .eq("name_key", nameKey)
        .eq("off_date", sessionDate);
    }
    return portalAdminJson(200, { ok: true, report_id: reportId, validated: false });
  }

  // Validator display name (best effort) for the audit stamp.
  let validatorName = verified.email;
  try {
    const { data: vprof } = await admin
      .from("staff_profiles")
      .select("full_name, username")
      .eq("id", verified.userId)
      .maybeSingle();
    validatorName = clean(vprof?.full_name || vprof?.username || verified.email, 200);
  } catch (_) { /* keep email */ }

  let dayOffRecorded = false;
  if (nameKey && sessionDate) {
    const offReason = ["Time off requested", clean(report.disruption_type, 80), clean(report.reason_category, 80)]
      .filter(Boolean)
      .join(" — ");
    const { error: offErr } = await admin.from("staff_unavailability").upsert(
      {
        name_key: nameKey,
        staff_name: submittedByName,
        staff_id: staffUserId || null,
        off_date: sessionDate,
        reason: offReason.slice(0, 500),
      },
      { onConflict: "name_key,off_date" },
    );
    if (offErr) {
      console.error("[portal-admin-session-disruption-validate] day_off", offErr.message);
    } else {
      dayOffRecorded = true;
    }
  }

  const { error: updErr } = await admin
    .from("session_disruption_reports")
    .update({
      validated_at: new Date().toISOString(),
      validated_by: verified.userId || null,
      validated_by_name: validatorName,
      day_off_recorded: dayOffRecorded,
    })
    .eq("id", reportId);
  if (updErr) {
    console.error("[portal-admin-session-disruption-validate] update", updErr.message);
    return portalAdminJson(500, { ok: false, error: "update_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    report_id: reportId,
    validated: true,
    day_off_recorded: dayOffRecorded,
  });
});
