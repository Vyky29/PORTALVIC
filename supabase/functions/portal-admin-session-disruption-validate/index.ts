// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-session-disruption-validate
// Admin validates (or undoes) a Session Disruption report (POL-048).
//
// On validate:
//   1) stamps validated_at/by
//   2) upserts staff_unavailability → staff dashboard "Day off (Time Off Requested)"
//   3) for each booked slot on that day (client-supplied anchors): writes
//      schedule_overrides instructor_cover_needed → Services/MADRE show COVER NEEDED (red)
//      and remove the absent instructor for that calendar day only
//   4) admin Web Push: COVER NEEDED / open Schedule & Covers
// Parents are NOT notified (cover assigned later via Schedule & Covers).
//
// On undo: clears stamp, removes day off, cancels cover_needed overrides for this report.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { notifyAdminsInstructorCoverNeeded } from "../_shared/portal_cover_needed_admin_push.ts";
import {
  applyFoldToMadre,
  type MadreDoc,
} from "../_shared/portal_madre_fold_logic.ts";

const MADRE_TERM_KEY = "summer-2026";

async function foldCoverMovesOntoMadre(
  admin: ReturnType<typeof createClient>,
  moves: Array<{
    sessionDate: string;
    clientId: string;
    timeLabel: string;
    venue: string;
    fromStaff: string;
    toStaff: string;
    service?: string;
    area?: string;
  }>,
  actorId?: string | null,
): Promise<number> {
  if (!moves.length) return 0;
  const { data: row, error: loadErr } = await admin
    .from("portal_madre_document")
    .select("document, revision")
    .eq("term_key", MADRE_TERM_KEY)
    .maybeSingle();
  if (loadErr || !row?.document) {
    console.warn("[portal-admin-session-disruption-validate] madre load", loadErr?.message);
    return 0;
  }
  const madre = row.document as MadreDoc;
  madre.meta = madre.meta ?? {};
  let okCount = 0;
  for (const opts of moves) {
    const iso = String(opts.sessionDate || "").slice(0, 10);
    if (!iso || !opts.clientId || !opts.toStaff) continue;
    const result = applyFoldToMadre(madre, {
      fold_type: "instructor_cover_needed",
      session_date: iso,
      payload: {
        client_name: opts.clientId,
        time_slot: opts.timeLabel,
        venue: opts.venue,
        service: opts.service || "",
        area: opts.area || "",
        from_instructors: opts.fromStaff,
        to_instructors: opts.toStaff,
      },
    });
    if (result.ok) okCount += 1;
    else console.warn("[portal-admin-session-disruption-validate] madre fold", result.note);
  }
  if (!okCount) return 0;
  madre.meta.lastLiveFoldAt = new Date().toISOString();
  madre.meta.lastLiveFoldNote = `cover needed moves · ${okCount}`;
  const nextRevision = (Number(row.revision) || 0) + 1;
  const { error: saveErr } = await admin
    .from("portal_madre_document")
    .update({
      document: madre,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
      updated_by: actorId || null,
    })
    .eq("term_key", MADRE_TERM_KEY);
  if (saveErr) {
    console.warn("[portal-admin-session-disruption-validate] madre save", saveErr.message);
    return 0;
  }
  return okCount;
}

type CoverSlotIn = {
  anchor_start?: string;
  anchor_end?: string;
  anchor_venue?: string;
  anchor_client_id?: string;
  anchor_client_name?: string;
  anchor_time_slot_label?: string;
  programme?: string;
  area?: string;
};

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
  if (k === "lulia" || k === "aida" || k === "lulya") return "luliya";
  return k;
}

function toPgTime(raw: string): string | null {
  const s = clean(raw, 20);
  if (!s) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m}:00`;
  }
  return null;
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
  const usernameKey = normalizeOpsAdminNameKey(
    nameKeyFromText(clean(prof?.username || "", 80)),
  );
  if (usernameKey) return usernameKey;
  const name = clean(prof?.full_name || fullName || "", 120);
  const key = normalizeOpsAdminNameKey(nameKeyFromText(name));
  if (key) return key;
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: { report_id?: string; action?: string; slots?: CoverSlotIn[] } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const reportId = clean(body.report_id, 60);
  const action = clean(body.action, 20).toLowerCase() || "validate";
  const slotsIn = Array.isArray(body.slots) ? body.slots : [];
  if (!reportId) return portalAdminJson(400, { ok: false, error: "report_id_required" });
  if (action !== "validate" && action !== "undo") {
    return portalAdminJson(400, { ok: false, error: "invalid_action" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error: loadErr } = await admin
    .from("session_disruption_reports")
    .select(
      "id, submitted_by_user_id, submitted_by_name, session_date, disruption_type, reason_category, venue",
    )
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
      .update({
        validated_at: null,
        validated_by: null,
        validated_by_name: null,
        day_off_recorded: false,
      })
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
    // Cancel COVER NEEDED overrides created for this report (do not touch other covers).
    const { data: coverRows } = await admin
      .from("schedule_overrides")
      .select("id, payload, anchor_client_id, anchor_venue, anchor_time_slot_label, anchor_staff_id")
      .eq("session_date", sessionDate)
      .eq("override_type", "instructor_cover_needed")
      .eq("status", "active");
    const toCancel = (coverRows || []).filter((row) => {
      const p = row.payload && typeof row.payload === "object" ? row.payload : {};
      return String(p.disruption_report_id || "") === reportId;
    });
    const undoMoves: Array<{
      sessionDate: string;
      clientId: string;
      timeLabel: string;
      venue: string;
      fromStaff: string;
      toStaff: string;
      service?: string;
      area?: string;
    }> = [];
    for (const row of toCancel) {
      const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
      await admin
        .from("schedule_overrides")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      undoMoves.push({
        sessionDate,
        clientId: String(row.anchor_client_id || ""),
        timeLabel: String(row.anchor_time_slot_label || ""),
        venue: String(row.anchor_venue || ""),
        fromStaff: "COVER NEEDED",
        toStaff: String(pl.absent_staff_id || row.anchor_staff_id || nameKey || ""),
        service: String(pl.service || ""),
        area: String(pl.area || ""),
      });
    }
    try {
      await foldCoverMovesOntoMadre(admin, undoMoves, verified.userId);
    } catch (e) {
      console.warn("[portal-admin-session-disruption-validate] undo madre", e);
    }
    return portalAdminJson(200, {
      ok: true,
      report_id: reportId,
      validated: false,
      covers_cancelled: toCancel.length,
    });
  }

  let validatorName = verified.email;
  try {
    const { data: vprof } = await admin
      .from("staff_profiles")
      .select("full_name, username")
      .eq("id", verified.userId)
      .maybeSingle();
    validatorName = clean(vprof?.full_name || vprof?.username || verified.email, 200);
  } catch (_) {
    /* keep email */
  }

  let dayOffRecorded = false;
  if (nameKey && sessionDate) {
    const offReason = [
      "Time off requested",
      clean(report.disruption_type, 80),
      clean(report.reason_category, 80),
    ]
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

  let coversWritten = 0;
  const venues: string[] = [];
  const madreMoves: Array<{
    sessionDate: string;
    clientId: string;
    timeLabel: string;
    venue: string;
    fromStaff: string;
    toStaff: string;
    service?: string;
    area?: string;
  }> = [];
  if (nameKey && sessionDate && slotsIn.length) {
    for (const raw of slotsIn) {
      const clientId = clean(raw.anchor_client_id, 80).toLowerCase();
      if (!clientId || clientId === "available" || clientId === "closed" || clientId === "noparticipant") {
        continue;
      }
      if (clientId === "manager" || clientId === "home") continue;
      const start = toPgTime(String(raw.anchor_start || ""));
      const end = toPgTime(String(raw.anchor_end || "")) || start;
      if (!start) continue;
      const venue = clean(raw.anchor_venue, 80) || null;
      if (venue && venues.indexOf(venue) < 0) venues.push(venue);

      // Supersede any prior active cover_needed for same anchor+report.
      const { data: prior } = await admin
        .from("schedule_overrides")
        .select("id, payload")
        .eq("session_date", sessionDate)
        .eq("anchor_staff_id", nameKey)
        .eq("anchor_start", start)
        .eq("override_type", "instructor_cover_needed")
        .eq("status", "active");
      for (const p of prior || []) {
        const pl = p.payload && typeof p.payload === "object" ? p.payload : {};
        if (String(pl.disruption_report_id || "") === reportId || !pl.disruption_report_id) {
          await admin.from("schedule_overrides").update({ status: "cancelled" }).eq("id", p.id);
        }
      }

      const payload = {
        cover_needed: true,
        covering_staff_id: "cover_needed",
        covering_staff_name: "COVER NEEDED",
        absent_staff_id: nameKey,
        absent_staff_name: submittedByName,
        disruption_report_id: reportId,
        notify_parents: false,
        service: clean(raw.programme, 80) || null,
        area: clean(raw.area, 80) || null,
      };

      const { error: insErr } = await admin.from("schedule_overrides").insert({
        session_date: sessionDate,
        anchor_staff_id: nameKey,
        anchor_start: start,
        anchor_end: end,
        anchor_venue: venue,
        anchor_client_id: clientId,
        anchor_time_slot_label: clean(raw.anchor_time_slot_label, 80) || null,
        override_type: "instructor_cover_needed",
        payload,
        reason: `Session disruption validated — ${submittedByName} off · COVER NEEDED`,
        status: "active",
        superseded_by: null,
        spreadsheet_revision: "session-disruption-validate",
        created_by: verified.userId || null,
      });
      if (insErr) {
        console.error("[portal-admin-session-disruption-validate] cover insert", insErr.message);
      } else {
        coversWritten += 1;
        const clientName = clean(raw.anchor_client_name, 120) || clientId;
        madreMoves.push({
          sessionDate,
          clientId: clientName,
          timeLabel: clean(raw.anchor_time_slot_label, 80),
          venue: venue || "",
          fromStaff: nameKey,
          toStaff: "COVER NEEDED",
          service: clean(raw.programme, 80),
          area: clean(raw.area, 80),
        });
      }
    }
  }

  try {
    await foldCoverMovesOntoMadre(admin, madreMoves, verified.userId);
  } catch (e) {
    console.warn("[portal-admin-session-disruption-validate] madre fold batch", e);
  }

  // Admin alert only — never parent notify for cover_needed.
  try {
    await notifyAdminsInstructorCoverNeeded({
      reportId,
      staffName: submittedByName || nameKey || "Staff",
      sessionDate,
      venue: venues[0] || clean(report.venue, 80),
      slotCount: coversWritten,
    });
  } catch (e) {
    console.warn("[portal-admin-session-disruption-validate] admin push", e);
  }

  return portalAdminJson(200, {
    ok: true,
    report_id: reportId,
    validated: true,
    day_off_recorded: dayOffRecorded,
    covers_written: coversWritten,
    notify_parents: false,
  });
});
