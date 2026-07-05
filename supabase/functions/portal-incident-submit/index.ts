// @ts-nocheck — Edge Function (Deno).
//
// portal-incident-submit
// ----------------------
// PIN / portal-bridge path for portal-incident.html when staff hub session has no
// linked Supabase Auth JWT (or direct insert failed).
//
// POST JSON: { full_name, portal_bridge_secret, incident: { ...row } }
// 200 { ok: true, incident_id, submitted_by_user_id, submitted_by_name }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ORIGINS = new Set(["dashboard", "this_week", "term"]);

const PARTICIPANT_CATEGORIES = new Set([
  "Safeguarding Concern",
  "Personal Injury",
  "Client Injury",
  "Property Damage",
  "Dangerous occurrence",
  "Fire incident",
  "Fire drill",
  "Security incident",
  "Environmental incident",
  "Near miss",
]);

const STAFF_CATEGORIES = new Set([
  "Staff assault / physical contact",
  "Staff injury at work",
  "Near miss (staff)",
  "Staff incident — no injury (tracking)",
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(error: string, status = 401) {
  return json({ ok: false, error }, status);
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean(v: unknown, max = 4000): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeFullName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function profileMatchesPortalName(
  profile: { full_name?: string | null; username?: string | null },
  submittedName: string,
): boolean {
  const sub = normalizeFullName(submittedName);
  if (!sub || !profile) return false;
  const n = normalizeFullName(String(profile.full_name || ""));
  const u = normalizeFullName(String(profile.username || ""));
  if (sub === n || sub === u) return true;
  const subTokens = sub.split(" ").filter(Boolean).length;
  const first = sub.split(" ")[0] || "";
  if (subTokens === 1 && first.length >= 2 && (first === u || first === n)) return true;
  if (n && (sub.startsWith(n + " ") || n.startsWith(sub + " "))) return true;
  return false;
}

function normalizeOrigin(value: unknown): string {
  const o = clean(value, 40);
  return ALLOWED_ORIGINS.has(o) ? o : "dashboard";
}

function normalizeIncidentTime(raw: unknown): string {
  const t = clean(raw, 8);
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  if (h > 23) h = 23;
  if (min > 59) min = 59;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function resolveStaffProfile(
  profiles: Array<{
    id: string;
    full_name: string | null;
    username: string | null;
    app_role: string | null;
    is_active: boolean | null;
  }>,
  submittedName: string,
) {
  const active = (profiles || []).filter(
    (p) => p && p.is_active !== false && !String(p.username || "").toLowerCase().endsWith("_legacy"),
  );
  const hits = active.filter((p) => profileMatchesPortalName(p, submittedName));
  if (hits.length === 0) return { error: "unknown_staff" as const };
  if (hits.length > 1) {
    const fp = normalizeFullName(submittedName);
    const exact = hits.filter((p) => normalizeFullName(String(p.full_name || "")) === fp);
    if (exact.length === 1) return { profile: exact[0] };
    return { error: "ambiguous_staff" as const };
  }
  return { profile: hits[0] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: {
    full_name?: unknown;
    portal_bridge_secret?: unknown;
    incident?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid", 400);
  }

  const fullName = clean(body.full_name, 200);
  const submittedSecret = clean(body.portal_bridge_secret, 500);
  const payload = body.incident && typeof body.incident === "object" ? body.incident : null;

  if (!fullName || fullName.length < 2 || !payload) return jsonError("invalid", 400);

  const configuredSecret = clean(Deno.env.get("STAFF_PROFILE_PORTAL_BRIDGE_SECRET") || "", 500);
  if (!configuredSecret || configuredSecret.length < 16) {
    console.error("[portal-incident-submit] STAFF_PROFILE_PORTAL_BRIDGE_SECRET missing");
    return jsonError("bridge_not_configured", 503);
  }
  if (!submittedSecret || !constantTimeEquals(submittedSecret, configuredSecret)) {
    return jsonError("invalid_bridge_secret");
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[portal-incident-submit] Missing SUPABASE env vars");
    return jsonError("invalid", 500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profErr } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, app_role, is_active")
    .eq("is_active", true);
  if (profErr) {
    console.error("[portal-incident-submit] profile list", profErr);
    return jsonError("invalid", 500);
  }

  const resolved = resolveStaffProfile(profiles || [], fullName);
  if ("error" in resolved) return jsonError(resolved.error);
  const profile = resolved.profile;

  const role = clean(profile.app_role, 40).toLowerCase();
  if (role !== "staff" && role !== "lead") {
    return jsonError("role_not_allowed", 403);
  }

  const subjectType = clean(payload.subject_type, 40).toLowerCase() === "staff" ? "staff" : "participant";
  const isStaff = subjectType === "staff";
  const sessionDate = clean(payload.session_date, 16);
  const incidentTime = normalizeIncidentTime(payload.incident_time);
  let incidentCategory = clean(payload.incident_category, 200);
  let service = clean(payload.service, 200);
  let clientName = clean(payload.client_name, 200);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return jsonError("invalid_field:session_date", 400);
  if (!incidentTime) return jsonError("invalid_field:incident_time", 400);
  if (!service) service = isStaff ? "Staff incident" : "Not specified";

  if (isStaff) {
    if (!STAFF_CATEGORIES.has(incidentCategory)) {
      return jsonError("invalid_field:incident_category", 400);
    }
    if (!clientName) clientName = clean(profile.full_name || profile.username || fullName, 200) || "Staff incident";
  } else {
    if (!clientName) return jsonError("invalid_field:client_name", 400);
    if (!PARTICIPANT_CATEGORIES.has(incidentCategory)) {
      return jsonError("invalid_field:incident_category", 400);
    }
  }

  const submittedByName = clean(profile.full_name || profile.username || fullName, 200);
  if (!submittedByName) return jsonError("invalid", 400);

  const row: Record<string, unknown> = {
    submitted_by_user_id: profile.id,
    submitted_by_name: submittedByName,
    subject_type: subjectType,
    affected_staff_user_id: isStaff ? profile.id : (clean(payload.affected_staff_user_id) || null),
    affected_staff_name: isStaff ? submittedByName : (clean(payload.affected_staff_name) || null),
    incident_outcome: clean(payload.incident_outcome, 80) || null,
    client_id: clean(payload.client_id, 120) || null,
    client_name: clientName,
    session_date: sessionDate,
    session_time: clean(payload.session_time, 80) || null,
    incident_time: incidentTime,
    service,
    location: clean(payload.location, 200) || null,
    portal_session_key: clean(payload.portal_session_key, 300) || null,
    incident_category: incidentCategory,
    staff_involved: clean(payload.staff_involved, 300) || null,
    witness: clean(payload.witness, 300) || null,
    statement_before: clean(payload.statement_before, 4000) || null,
    statement_during: clean(payload.statement_during, 4000) || null,
    statement_after: clean(payload.statement_after, 4000) || null,
    injuries_client: clean(payload.injuries_client, 4000) || null,
    injuries_staff: clean(payload.injuries_staff, 4000) || null,
    origin: normalizeOrigin(payload.origin),
    incident_notification_requested: false,
    incident_notification_notes: null,
  };

  if (isStaff && !clean(row.statement_during)) {
    return jsonError("invalid_field:statement_during", 400);
  }

  let insertResp = await supabase.from("incident_reports").insert([row]).select("id").single();
  if (insertResp.error) {
    const msg = String(insertResp.error.message || "");
    if (/incident_notification|schema cache|column/i.test(msg)) {
      const rowLite = { ...row };
      delete rowLite.incident_notification_requested;
      delete rowLite.incident_notification_notes;
      insertResp = await supabase.from("incident_reports").insert([rowLite]).select("id").single();
    }
  }
  if (insertResp.error) {
    console.error("[portal-incident-submit] insert", insertResp.error);
    if (/incident_category|check constraint/i.test(String(insertResp.error.message || ""))) {
      return jsonError("invalid_field:incident_category", 400);
    }
    return jsonError("insert_failed", 500);
  }

  return json({
    ok: true,
    incident_id: insertResp.data?.id ?? null,
    submitted_by_user_id: profile.id,
    submitted_by_name: submittedByName,
  });
});
