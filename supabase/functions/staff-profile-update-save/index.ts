// @ts-nocheck — Edge Function (Deno).
//
// staff-profile-update-save
// -------------------------
// Applies a partial update to the staff_profile bound to the caller's
// staff_profile_update session token. Writes a per-field row into
// staff_profile_change_log for every value that actually changed.
//
// Headers:
//   x-staff-profile-session: <token>
//
// Body (POST JSON): {
//   updates: {
//     phone_e164?: string,
//     email_personal?: string,
//     address_line1?: string, address_line2?: string,
//     address_city?: string, address_postcode?: string,
//     emergency_contact_name?: string, emergency_contact_relationship?: string,
//     emergency_contact_phone?: string,
//     availability_summary?: string,
//     availability_status?: 'continue'|'reduce'|'increase'|'unsure',
//     availability_changes?: any,
//     other_work_status?: 'only_clubsensational'|'also_other',
//     other_work_organisation?: string, other_work_schedule?: string,
//     other_work_affects_availability?: boolean,
//     wellbeing_notes?: string
//   },
//   confirmed: true   // final confirmation checkbox
// }
//
// Response (200): { ok: true, changed_fields: string[], profile_last_updated_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-staff-profile-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SECTION_BY_FIELD: Record<string, string> = {
  phone_e164: "staff_details",
  email_personal: "staff_details",
  address_line1: "address",
  address_line2: "address",
  address_city: "address",
  address_postcode: "address",
  emergency_contact_name: "emergency_contact",
  emergency_contact_relationship: "emergency_contact",
  emergency_contact_phone: "emergency_contact",
  availability_summary: "availability",
  availability_status: "availability",
  availability_changes: "availability",
  other_work_status: "other_work",
  other_work_organisation: "other_work",
  other_work_schedule: "other_work",
  other_work_affects_availability: "other_work",
  wellbeing_notes: "wellbeing",
};

const ALLOWED_FIELDS = Object.keys(SECTION_BY_FIELD);

const ALLOWED_AVAIL_STATUS = new Set(["continue", "reduce", "increase", "unsure"]);
const ALLOWED_OTHER_WORK_STATUS = new Set(["only_clubsensational", "also_other"]);

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim() || "";
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

function normaliseString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function sanitiseUpdate(field: string, raw: unknown): unknown | undefined {
  switch (field) {
    case "phone_e164":
    case "emergency_contact_phone": {
      const v = normaliseString(raw);
      if (v == null) return null;
      // Keep + and digits + spaces; UI is responsible for E.164 hint.
      const cleaned = v.replace(/[^\d+]/g, "");
      return cleaned.length === 0 ? null : cleaned.slice(0, 20);
    }
    case "email_personal": {
      const v = normaliseString(raw);
      if (v == null) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) return undefined;
      return v.toLowerCase();
    }
    case "address_line1":
    case "address_line2":
    case "address_city":
    case "address_postcode":
    case "emergency_contact_name":
    case "emergency_contact_relationship":
    case "availability_summary":
    case "other_work_organisation":
    case "other_work_schedule":
    case "wellbeing_notes": {
      const v = normaliseString(raw);
      if (v == null) return null;
      return v.length > 2000 ? v.slice(0, 2000) : v;
    }
    case "availability_status": {
      const v = normaliseString(raw);
      if (v == null) return null;
      if (!ALLOWED_AVAIL_STATUS.has(v)) return undefined;
      return v;
    }
    case "other_work_status": {
      const v = normaliseString(raw);
      if (v == null) return null;
      if (!ALLOWED_OTHER_WORK_STATUS.has(v)) return undefined;
      return v;
    }
    case "other_work_affects_availability": {
      if (raw == null) return null;
      if (typeof raw === "boolean") return raw;
      const s = String(raw).trim().toLowerCase();
      if (["true", "yes", "1"].includes(s)) return true;
      if (["false", "no", "0"].includes(s)) return false;
      return undefined;
    }
    case "availability_changes": {
      if (raw == null) return null;
      if (typeof raw === "object") {
        try {
          const json = JSON.stringify(raw);
          if (json.length > 8000) return undefined;
          return raw;
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function valueForLog(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  return String(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const token = String(req.headers.get("x-staff-profile-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return jsonError(401, "invalid_session");

  let body: { updates?: Record<string, unknown>; confirmed?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body");
  }
  if (body.confirmed !== true) return jsonError(400, "confirmation_required");
  const incoming = body.updates && typeof body.updates === "object" ? body.updates : {};

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return jsonError(500, "server_misconfigured");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: sess, error: sessErr } = await supabase
    .from("staff_profile_update_sessions")
    .select("id, staff_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessErr) {
    console.error("[staff-profile-update-save] session lookup error", sessErr);
    return jsonError(401, "invalid_session");
  }
  if (!sess || sess.revoked_at) return jsonError(401, "invalid_session");
  if (new Date(sess.expires_at).getTime() < Date.now()) return jsonError(401, "expired_session");

  // Sanitise + collect only fields the caller actually sent.
  const cleanUpdates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (!(field in incoming)) continue;
    const cleaned = sanitiseUpdate(field, incoming[field]);
    if (cleaned === undefined) {
      return jsonError(400, `invalid_field:${field}`);
    }
    cleanUpdates[field] = cleaned;
  }

  // Load current row so we can diff for the audit log.
  const { data: current, error: currentErr } = await supabase
    .from("staff_profiles")
    .select(
      "id, " + ALLOWED_FIELDS.join(", "),
    )
    .eq("id", sess.staff_id)
    .maybeSingle();
  if (currentErr || !current) {
    console.error("[staff-profile-update-save] current row error", currentErr);
    return jsonError(500, "load_failed");
  }

  const changedFields: string[] = [];
  const logRows: Array<Record<string, unknown>> = [];
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  for (const field of Object.keys(cleanUpdates)) {
    const prevRaw = (current as Record<string, unknown>)[field];
    const nextRaw = cleanUpdates[field];
    const prevStr = valueForLog(prevRaw);
    const nextStr = valueForLog(nextRaw);
    if (prevStr === nextStr) continue;
    changedFields.push(field);
    logRows.push({
      staff_id: sess.staff_id,
      section: SECTION_BY_FIELD[field] || "other",
      field_name: field,
      previous_value: prevStr,
      new_value: nextStr,
      updated_by: sess.staff_id,
      source: "staff_self_update",
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    });
  }

  const nowIso = new Date().toISOString();

  // Stamp confirmation + (only if anything changed) profile_last_updated_at.
  const updatePayload: Record<string, unknown> = {
    ...cleanUpdates,
    profile_last_confirmed_at: nowIso,
  };
  if (changedFields.length > 0) updatePayload.profile_last_updated_at = nowIso;

  const { error: updateErr } = await supabase
    .from("staff_profiles")
    .update(updatePayload)
    .eq("id", sess.staff_id);
  if (updateErr) {
    console.error("[staff-profile-update-save] profile update failed", updateErr);
    return jsonError(500, "update_failed");
  }

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from("staff_profile_change_log").insert(logRows);
    if (logErr) {
      console.error("[staff-profile-update-save] change log insert failed", logErr);
    }
  }

  // Mark session as last-used; do not revoke (caller may want to view a confirmation
  // screen and would otherwise lose the token if they tap Edit again).
  await supabase
    .from("staff_profile_update_sessions")
    .update({ last_used_at: nowIso })
    .eq("id", sess.id);

  return new Response(
    JSON.stringify({
      ok: true,
      changed_fields: changedFields,
      profile_last_updated_at: changedFields.length > 0 ? nowIso : null,
      profile_last_confirmed_at: nowIso,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
