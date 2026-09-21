// @ts-nocheck — Edge Function (Deno).
//
// portal-cancellation-submit
// --------------------------
// Staff/Lead cancellation form → cancellation_reports + Absents Open(decide).
//
// Auth (either):
//   A) PIN bridge: { full_name, portal_bridge_secret, cancellation }
//   B) Staff JWT: Authorization Bearer <user access token> + { cancellation }
//
// Deploy:
//   npx supabase functions deploy portal-cancellation-submit --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enqueueDecideFromStaffCancellation } from "../_shared/portal_enqueue_decide_from_cancellation.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_REASONS = new Set([
  "Illness: Fever",
  "Illness: Diarrhoea",
  "Illness: Vomiting",
  "Illness: Seizure",
  "Illness: Cold/Flu",
  "Unforeseen circumstances: Venue incident",
  "Unforeseen circumstances: Fire alarm / Fire drill",
  "Unforeseen circumstances: Power cuts / Flooding",
  "Other",
]);

const ALLOWED_TIMING = new Set([
  "Before the session started",
  "During the session",
]);

const ALLOWED_ORIGINS = new Set(["dashboard", "this_week", "term"]);

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

function clean(v: unknown): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
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
  const o = clean(value);
  return ALLOWED_ORIGINS.has(o) ? o : "dashboard";
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

function roleAllowed(appRole: string): boolean {
  const role = clean(appRole).toLowerCase();
  return role === "staff" || role === "lead" || role === "admin" || role === "ceo";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: {
    full_name?: unknown;
    portal_bridge_secret?: unknown;
    cancellation?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid", 400);
  }

  const payload = body.cancellation && typeof body.cancellation === "object" ? body.cancellation : null;
  if (!payload) return jsonError("invalid", 400);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[portal-cancellation-submit] Missing SUPABASE env vars");
    return jsonError("invalid", 500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = /^Bearer\s+(\S+)/i.exec(authHeader);
  const token = bearer ? bearer[1] : "";
  const looksLikeUserJwt = !!(token && token !== anon && token.split(".").length >= 3);

  let profile: {
    id: string;
    full_name: string | null;
    username: string | null;
    app_role: string | null;
  } | null = null;

  if (looksLikeUserJwt) {
    const userRes = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!userRes.ok) return jsonError("invalid_or_expired_session", 401);
    let userBody: { id?: string } = {};
    try {
      userBody = await userRes.json();
    } catch {
      return jsonError("bad_auth_response", 502);
    }
    const userId = clean(userBody.id);
    if (!userId) return jsonError("no_user_id_on_account", 403);
    const { data: byId, error: byIdErr } = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, app_role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (byIdErr) {
      console.error("[portal-cancellation-submit] profile by id", byIdErr);
      return jsonError("invalid", 500);
    }
    if (!byId || byId.is_active === false) return jsonError("unknown_staff");
    if (!roleAllowed(String(byId.app_role || ""))) return jsonError("role_not_allowed", 403);
    profile = byId;
  } else {
    const fullName = clean(body.full_name);
    const submittedSecret = clean(body.portal_bridge_secret);
    if (!fullName || fullName.length < 2) return jsonError("invalid", 400);

    const configuredSecret = clean(Deno.env.get("STAFF_PROFILE_PORTAL_BRIDGE_SECRET") || "");
    if (!configuredSecret || configuredSecret.length < 16) {
      console.error("[portal-cancellation-submit] STAFF_PROFILE_PORTAL_BRIDGE_SECRET missing");
      return jsonError("bridge_not_configured", 503);
    }
    if (!submittedSecret || !constantTimeEquals(submittedSecret, configuredSecret)) {
      return jsonError("invalid_bridge_secret");
    }

    const { data: profiles, error: profErr } = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, app_role, is_active")
      .eq("is_active", true);
    if (profErr) {
      console.error("[portal-cancellation-submit] profile list", profErr);
      return jsonError("invalid", 500);
    }

    const resolved = resolveStaffProfile(profiles || [], fullName);
    if ("error" in resolved) return jsonError(resolved.error);
    if (!roleAllowed(String(resolved.profile.app_role || ""))) {
      return jsonError("role_not_allowed", 403);
    }
    profile = resolved.profile;
  }

  if (!profile) return jsonError("unknown_staff");

  const clientName = clean(payload.client_name);
  const sessionDate = clean(payload.session_date);
  const cancellationTiming = clean(payload.cancellation_timing);
  let reasonCategory = clean(payload.reason_category);
  const notes = clean(payload.notes) || null;

  if (!clientName) return jsonError("invalid_field:client_name", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return jsonError("invalid_field:session_date", 400);
  if (!ALLOWED_TIMING.has(cancellationTiming)) return jsonError("invalid_field:cancellation_timing", 400);

  if (reasonCategory.includes(" — Notes:")) {
    reasonCategory = reasonCategory.split(" — Notes:")[0].trim();
  }
  if (!ALLOWED_REASONS.has(reasonCategory)) {
    return jsonError("invalid_field:reason_category", 400);
  }

  let service = clean(payload.service);
  if (!service) service = "Not specified";

  const submittedByName = clean(profile.full_name || profile.username || "");
  if (!submittedByName) return jsonError("invalid", 400);

  const row: Record<string, unknown> = {
    submitted_by_user_id: profile.id,
    submitted_by_name: submittedByName,
    client_id: clean(payload.client_id) || null,
    client_name: clientName,
    session_date: sessionDate,
    session_time: clean(payload.session_time) || null,
    cancellation_timing: cancellationTiming,
    service,
    reason_category: reasonCategory,
    notes,
    portal_session_key: clean(payload.portal_session_key) || null,
    origin: normalizeOrigin(payload.origin),
  };

  let insertResp = await supabase.from("cancellation_reports").insert([row]).select("id").single();
  if (insertResp.error) {
    const msg = String(insertResp.error.message || "");
    if (/notes|schema cache|column/i.test(msg)) {
      const rowLite = { ...row };
      delete rowLite.notes;
      insertResp = await supabase.from("cancellation_reports").insert([rowLite]).select("id").single();
    }
  }
  if (insertResp.error) {
    console.error("[portal-cancellation-submit] insert", insertResp.error);
    if (/reason_category|check constraint/i.test(String(insertResp.error.message || ""))) {
      return jsonError("invalid_field:reason_category", 400);
    }
    return jsonError("insert_failed", 500);
  }

  const cancellationId = insertResp.data?.id ?? null;
  let decide: Record<string, unknown> = { ok: false };
  try {
    decide = await enqueueDecideFromStaffCancellation(supabase, {
      cancellation_id: cancellationId,
      client_id: clean(payload.client_id) || null,
      client_name: clientName,
      session_date: sessionDate,
      session_time: clean(payload.session_time) || null,
      service,
      reason_category: reasonCategory,
      notes,
      submitted_by_name: submittedByName,
    });
  } catch (enqErr) {
    console.error("[portal-cancellation-submit] decide enqueue", enqErr);
    decide = { ok: false, error: "enqueue_failed" };
  }

  return json({
    ok: true,
    cancellation_id: cancellationId,
    submitted_by_user_id: profile.id,
    submitted_by_name: submittedByName,
    decide_queued: !!(decide && decide.ok),
    decide,
  });
});
