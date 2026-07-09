// @ts-nocheck — Edge Function (Deno).
//
// portal-handover-submit
// ----------------------
// PIN / portal-bridge path for portal-pickup.html when staff hub session has no
// linked Supabase Auth JWT (or direct upsert failed).
//
// POST JSON: { full_name, portal_bridge_secret, handover: { id, participantName, ... } }
// 200 { ok: true, handover_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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
    handover?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid", 400);
  }

  const fullName = clean(body.full_name, 200);
  const submittedSecret = clean(body.portal_bridge_secret, 500);
  const payload = body.handover && typeof body.handover === "object" ? body.handover : null;

  if (!fullName || fullName.length < 2 || !payload) return jsonError("invalid", 400);

  const configuredSecret = clean(Deno.env.get("STAFF_PROFILE_PORTAL_BRIDGE_SECRET") || "", 500);
  if (!configuredSecret || configuredSecret.length < 16) {
    console.error("[portal-handover-submit] STAFF_PROFILE_PORTAL_BRIDGE_SECRET missing");
    return jsonError("bridge_not_configured", 503);
  }
  if (!submittedSecret || !constantTimeEquals(submittedSecret, configuredSecret)) {
    return jsonError("invalid_bridge_secret");
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[portal-handover-submit] Missing SUPABASE env vars");
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
    console.error("[portal-handover-submit] profile list", profErr);
    return jsonError("invalid", 500);
  }

  const resolved = resolveStaffProfile(profiles || [], fullName);
  if ("error" in resolved) return jsonError(resolved.error);
  const profile = resolved.profile;

  const role = clean(profile.app_role, 40).toLowerCase();
  if (role !== "staff" && role !== "lead" && role !== "ceo" && role !== "admin") {
    return jsonError("role_not_allowed", 403);
  }

  const id = clean(payload.id, 120);
  const participantName = clean(payload.participantName || payload.participant_name, 200);
  const sessionDate = clean(payload.sessionDate || payload.session_date, 16);
  const updatedAt = clean(payload.updatedAt || payload.updated_at, 40) ||
    new Date().toISOString();
  const locked = payload.locked === true || payload.locked === "true" || payload.locked === 1;
  let values = payload.values;
  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      values = {};
    }
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) values = {};

  if (!id) return jsonError("invalid_field:id", 400);
  if (!participantName) return jsonError("invalid_field:participant_name", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return jsonError("invalid_field:session_date", 400);

  const row = {
    id,
    participant_name: participantName,
    session_date: sessionDate,
    updated_at: updatedAt,
    locked,
    values,
  };

  const insertResp = await supabase.from("daily_handover_logs").upsert(row, { onConflict: "id" }).select("id").single();
  if (insertResp.error) {
    console.error("[portal-handover-submit] upsert", insertResp.error);
    return jsonError("insert_failed", 500);
  }

  return json({
    ok: true,
    handover_id: insertResp.data?.id ?? id,
  });
});
