import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DISRUPTION_TYPES = new Set(["Same-Day Absence", "Planned Absence"]);
const REASONS = new Set([
  "Illness",
  "Family Emergency",
  "Medical Appointment",
  "Bereavement",
  "Vehicle Breakdown",
  "Transport Disruption",
  "Annual Leave",
  "Other",
]);
const EXPECTED_RETURNS = new Set([
  "Next scheduled session",
  "Return on a specific date",
  "Unknown at this stage",
]);
const COULD_PREVENT = new Set(["No", "Yes", "Unsure"]);
const ORIGINS = new Set(["dashboard", "quick_menu", "policy", "direct"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

function clean(v: unknown, max = 2000): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function isoDate(v: unknown): string {
  const s = String(v || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function nameKeyFromText(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
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
  const key = nameKeyFromText(name);
  if (key) return key;
  return nameKeyFromText(clean(prof?.username || "", 80));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const jwt = bearerUserJwt(req);
  if (!jwt) return json(401, { ok: false, error: "unauthorized" });

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!portalUrl || !portalService) {
    return json(500, { ok: false, error: "misconfigured" });
  }

  const admin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const userId = String(userData.user.id);

  const { data: profile, error: profileErr } = await admin
    .from("staff_profiles")
    .select("id, full_name, username, staff_role, app_role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profile) {
    return json(403, { ok: false, error: "profile_missing" });
  }
  const role = clean(profile.app_role).toLowerCase();
  if (role !== "staff" && role !== "lead") {
    return json(403, { ok: false, error: "role_not_allowed" });
  }

  let body: { report?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const r = body.report && typeof body.report === "object" ? body.report : {};
  const disruptionType = clean(r.disruption_type, 80);
  const sessionDate = isoDate(r.session_date);
  const venue = clean(r.venue, 120);
  const reasonCategory = clean(r.reason_category, 80);
  const expectedReturn = clean(r.expected_return, 80);
  const couldPrevent = clean(r.could_prevent, 20);
  const declarationAccepted = r.declaration_accepted === true;

  if (!DISRUPTION_TYPES.has(disruptionType)) {
    return json(400, { ok: false, error: "invalid_disruption_type" });
  }
  if (!sessionDate) return json(400, { ok: false, error: "invalid_session_date" });
  if (!venue) return json(400, { ok: false, error: "missing_venue" });
  if (!REASONS.has(reasonCategory)) {
    return json(400, { ok: false, error: "invalid_reason" });
  }
  if (!EXPECTED_RETURNS.has(expectedReturn)) {
    return json(400, { ok: false, error: "invalid_expected_return" });
  }
  if (!COULD_PREVENT.has(couldPrevent)) {
    return json(400, { ok: false, error: "invalid_could_prevent" });
  }
  if (!declarationAccepted) {
    return json(400, { ok: false, error: "declaration_required" });
  }

  let returnDate: string | null = null;
  if (expectedReturn === "Return on a specific date") {
    returnDate = isoDate(r.return_date);
    if (!returnDate) return json(400, { ok: false, error: "missing_return_date" });
  }

  const preventionDetails = clean(r.prevention_details, 1500);
  if ((couldPrevent === "Yes" || couldPrevent === "Unsure") && !preventionDetails) {
    return json(400, { ok: false, error: "prevention_details_required" });
  }

  const originRaw = clean(r.origin, 40);
  const origin = ORIGINS.has(originRaw) ? originRaw : "direct";
  const submittedByName = clean(profile.full_name || profile.username, 200);
  const roleLabel = clean(r.role_label || profile.staff_role, 200);

  const row = {
    submitted_by_user_id: userId,
    submitted_by_name: submittedByName,
    role_label: roleLabel || null,
    disruption_type: disruptionType,
    session_date: sessionDate,
    venue,
    reason_category: reasonCategory,
    reason_description: clean(r.reason_description, 1500) || null,
    expected_return: expectedReturn,
    return_date: returnDate,
    could_prevent: couldPrevent,
    prevention_details: preventionDetails || null,
    additional_comments: clean(r.additional_comments, 2000) || null,
    declaration_accepted: true,
    origin,
    day_off_recorded: false,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("session_disruption_reports")
    .insert(row)
    .select("id")
    .single();
  if (insertErr || !inserted?.id) {
    console.error("[portal-session-disruption-submit] insert", insertErr);
    return json(500, { ok: false, error: "save_failed" });
  }

  let dayOffRecorded = false;
  const nameKey = await resolveNameKey(admin, userId, submittedByName);
  if (nameKey) {
    const offReason = [
      "Time off requested",
      disruptionType,
      reasonCategory,
    ].join(" — ");
    const { error: offErr } = await admin.from("staff_unavailability").upsert(
      {
        name_key: nameKey,
        staff_name: submittedByName,
        staff_id: userId,
        off_date: sessionDate,
        reason: offReason.slice(0, 500),
      },
      { onConflict: "name_key,off_date" },
    );
    if (!offErr) {
      dayOffRecorded = true;
      await admin
        .from("session_disruption_reports")
        .update({ day_off_recorded: true })
        .eq("id", inserted.id);
    } else {
      console.error("[portal-session-disruption-submit] day_off", offErr);
    }
  }

  return json(200, {
    ok: true,
    report_id: inserted.id,
    day_off_recorded: dayOffRecorded,
  });
});
