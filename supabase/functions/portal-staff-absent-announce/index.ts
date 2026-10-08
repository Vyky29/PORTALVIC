// @ts-nocheck — Edge Function (Deno).
//
// Staff taps Absent on their card.
// Parent term chip stays orange (not a cancellation WhatsApp).
// The row enters Absents for the office, unless the parent already logged it as none.
// Co-instructors on that seat get the app push. The instructor who tapped does not.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { announceClientAbsenceOnInstructorCards } from "../_shared/portal_announce_client_absence.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(v: unknown): string {
  return clean(v, 80)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = /^Bearer\s+(\S+)/i.exec(authHeader);
  const token = bearer ? bearer[1] : "";
  if (!token || token === anon || token.split(".").length < 3) {
    return json({ ok: false, error: "invalid_session" }, 401);
  }

  const userRes = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!userRes.ok) return json({ ok: false, error: "invalid_session" }, 401);
  let userBody: { id?: string } = {};
  try {
    userBody = await userRes.json();
  } catch {
    return json({ ok: false, error: "bad_auth" }, 401);
  }
  const userId = clean(userBody.id, 60);
  if (!userId) return json({ ok: false, error: "no_user" }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const sessionDate = clean(body.session_date, 12);
  const clientName = clean(body.client_name, 160);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || !clientName) {
    return json({ ok: false, error: "session_required" }, 400);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("staff_profiles")
    .select("id, full_name, username, app_role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_active === false) return json({ ok: false, error: "unknown_staff" }, 403);
  const role = clean(profile.app_role, 20).toLowerCase();
  if (role !== "staff" && role !== "lead" && role !== "admin" && role !== "ceo") {
    return json({ ok: false, error: "role_not_allowed" }, 403);
  }

  const staffKey = slug(profile.username || String(profile.full_name || "").split(/\s+/)[0] || "");
  const staffName = clean(profile.full_name || profile.username, 80);
  const serviceLabel = clean(body.service_label, 160) || "Session";
  const sessionTime = clean(body.session_time, 80);
  const venue = clean(body.venue, 80);

  const first = clientName.split(/\s+/)[0] || clientName;
  let pax: { contact_id?: string; display_name?: string; parent_person_id?: string } | null = null;
  const { data: exact } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, parent_person_id")
    .ilike("display_name", clientName)
    .limit(1)
    .maybeSingle();
  if (exact?.contact_id && exact.parent_person_id) pax = exact;
  if (!pax && first.length >= 3) {
    const { data: rows } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, parent_person_id")
      .ilike("display_name", first + "%")
      .limit(5);
    const hits = (rows || []).filter((r) => r.contact_id && r.parent_person_id);
    if (hits.length === 1) pax = hits[0];
  }

  let reportId: string | null = null;
  let queued = false;
  if (pax?.contact_id && pax.parent_person_id) {
    const { data: existingRows } = await admin
      .from("portal_parent_absence_reports")
      .select("id, status, case_kind, payload")
      .eq("contact_id", pax.contact_id)
      .eq("session_date", sessionDate)
      .order("created_at", { ascending: false })
      .limit(8);
    const open = (existingRows || []).find((r) => {
      const st = String(r.status || "");
      if (st === "rejected" && r.payload && r.payload.withdrawn_by_parent) return false;
      return st === "noted" || st === "pending_review" || st === "missed" || st === "excused";
    });
    if (open) {
      reportId = String(open.id);
    } else {
      const now = new Date().toISOString();
      const { data: created, error: insErr } = await admin
        .from("portal_parent_absence_reports")
        .insert({
          parent_person_id: pax.parent_person_id,
          contact_id: pax.contact_id,
          participant_display: pax.display_name || clientName,
          session_date: sessionDate,
          service_label: serviceLabel,
          session_time: sessionTime || null,
          status: "pending_review",
          case_kind: "absence",
          reason_code: "office_other",
          reason_text: staffName ? `Staff marked absent (${staffName})` : "Staff marked absent",
          outcome: null,
          proof_deadline: addDaysIso(sessionDate, 14),
          payload: {
            source: "staff_quick_absent",
            case_kind: "absence",
            created_by_staff_name: staffName || null,
            staff_user_id: userId,
          },
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        console.error("[staff-absent-announce] report", insErr.message);
      } else {
        reportId = created?.id ? String(created.id) : null;
        queued = true;
      }
    }
  }

  const announced = await announceClientAbsenceOnInstructorCards(admin, {
    sessionDate,
    clientDisplay: pax?.display_name || clientName,
    contactId: pax?.contact_id || null,
    serviceLabel,
    sessionTime,
    venue,
    source: "staff_quick_absent",
    absenceReportId: reportId,
    skipPushStaffKey: staffKey,
    reason: staffName ? `Staff marked absent (${staffName})` : "Staff marked absent",
  });

  if (queued && reportId && announced.override_id) {
    await admin
      .from("portal_parent_absence_reports")
      .update({ schedule_override_id: announced.override_id })
      .eq("id", reportId)
      .is("schedule_override_id", null);
  }

  return json({
    ok: true,
    report_id: reportId,
    queued,
    instructors: announced.instructors,
    inserted: announced.inserted,
  });
});
