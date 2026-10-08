// Mark the instructor card(s) absent and let the schedule-override webhook
// push the app. No parent WhatsApp.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type AnnounceClientAbsenceInput = {
  sessionDate: string;
  clientDisplay: string;
  contactId?: string | null;
  serviceLabel?: string | null;
  sessionTime?: string | null;
  venue?: string | null;
  source: "parent_portal" | "staff_quick_absent";
  absenceReportId?: string | null;
  /** Roster key of the instructor who tapped Absent. They already see the card. */
  skipPushStaffKey?: string | null;
  reason?: string | null;
};

export type AnnounceClientAbsenceResult = {
  ok: boolean;
  instructors: string[];
  inserted: number;
  override_id?: string | null;
};

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(v: unknown): string {
  return clean(v, 160)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function weekdayLong(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
  }).format(new Date(iso + "T12:00:00Z"));
}

function tokenMinutes(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(".", ":");
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || "0");
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function parseWindow(raw: string): { start: number; end: number } | null {
  const s = clean(raw, 80);
  if (!s) return null;
  const bits = s.split(/\s*(?:to|-|–|—)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (!bits.length) return null;
  const start = tokenMinutes(bits[0]);
  if (start == null) return null;
  let end = bits[1] ? tokenMinutes(bits[1]) : null;
  if (end == null || end <= start) end = start + 30;
  return { start, end };
}

function asAfternoon(start: number, end: number): { start: number; end: number } | null {
  if (start >= 8 * 60 || start < 60) return null;
  return { start: start + 12 * 60, end: end + 12 * 60 };
}

function windowsOverlap(
  a: { start: number; end: number } | null,
  b: { start: number; end: number } | null,
): boolean {
  if (!a || !b) return true;
  const left = [a, asAfternoon(a.start, a.end)].filter(Boolean) as Array<{ start: number; end: number }>;
  const right = [b, asAfternoon(b.start, b.end)].filter(Boolean) as Array<{ start: number; end: number }>;
  for (const x of left) {
    for (const y of right) {
      if (x.start < y.end && y.start < x.end) return true;
    }
  }
  return false;
}

function clockLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function clientMatches(rowName: string, display: string): boolean {
  const row = slug(rowName);
  const full = slug(display);
  const first = slug(clean(display, 160).split(/\s+/)[0] || "");
  if (!row || !first) return false;
  if (full && (row === full || full.startsWith(row) || row.startsWith(full))) return true;
  return row === first || row.startsWith(first);
}

function staffKeysFromInstructors(raw: string): string[] {
  return clean(raw, 200)
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((name) => slug(name.split(/\s+/)[0] || name))
    .filter((k) => k && k !== "coverneeded" && k !== "office" && k !== "training");
}

function serviceLoose(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (!x || !y) return true;
  if (x.indexOf("aquatic") >= 0 || x.indexOf("swim") >= 0) {
    return y.indexOf("aquatic") >= 0 || y.indexOf("swim") >= 0;
  }
  if (x.indexOf("climb") >= 0) return y.indexOf("climb") >= 0;
  if (x.indexOf("multi") >= 0) return y.indexOf("multi") >= 0;
  if (x.indexOf("fitness") >= 0 || x.indexOf("physical") >= 0) {
    return y.indexOf("fitness") >= 0 || y.indexOf("physical") >= 0;
  }
  if (x.indexOf("day centre") >= 0 || x.indexOf("daycentre") >= 0) {
    return y.indexOf("day centre") >= 0 || y.indexOf("daycentre") >= 0;
  }
  return true;
}

type Seat = {
  staff: string;
  start: string;
  end: string;
  label: string;
  venue: string;
};

export async function announceClientAbsenceOnInstructorCards(
  admin: SupabaseClient,
  input: AnnounceClientAbsenceInput,
): Promise<AnnounceClientAbsenceResult> {
  const iso = clean(input.sessionDate, 12);
  const display = clean(input.clientDisplay, 160);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !display) {
    return { ok: false, instructors: [], inserted: 0 };
  }

  const day = weekdayLong(iso);
  const first = clean(display, 160).split(/\s+/)[0] || display;
  const wantWindow = parseWindow(clean(input.sessionTime, 80));
  const wantService = clean(input.serviceLabel, 160);
  const clientSlug = slug(first) || slug(display);

  const { data: rows, error } = await admin
    .from("portal_roster_rows")
    .select("client_name, day, time_slot, instructors, service, venue, session_date, status")
    .eq("status", "active")
    .ilike("client_name", first + "%")
    .limit(80);
  if (error) {
    console.error("[announce-absence] roster", error.message);
    return { ok: false, instructors: [], inserted: 0 };
  }

  const seats: Seat[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    if (!clientMatches(String(row.client_name || ""), display)) continue;
    const dated = String(row.session_date || "").slice(0, 10);
    const rowDay = clean(row.day, 20);
    if (dated && dated !== iso) continue;
    if (!dated && rowDay.toLowerCase() !== day.toLowerCase()) continue;
    if (!serviceLoose(wantService, String(row.service || ""))) continue;
    const rowWindow = parseWindow(String(row.time_slot || ""));
    if (wantWindow && rowWindow && !windowsOverlap(wantWindow, rowWindow)) continue;
    const startMins = rowWindow ? rowWindow.start : wantWindow ? wantWindow.start : null;
    const endMins = rowWindow ? rowWindow.end : wantWindow ? wantWindow.end : null;
    const afternoon = startMins != null && endMins != null ? asAfternoon(startMins, endMins) : null;
    const useStart = afternoon && startMins != null && startMins < 8 * 60 ? afternoon.start : startMins;
    const useEnd = afternoon && endMins != null && endMins <= 12 * 60 ? afternoon.end : endMins;
    const start = useStart != null ? clockLabel(useStart) : "00:00";
    const end = useEnd != null ? clockLabel(useEnd) : "00:30";
    const venue = clean(row.venue, 80) || clean(input.venue, 80) || "Club";
    const label = clean(row.time_slot, 80) || clean(input.sessionTime, 80);
    for (const staff of staffKeysFromInstructors(String(row.instructors || ""))) {
      const key = staff + "|" + start + "|" + end;
      if (seen.has(key)) continue;
      seen.add(key);
      seats.push({ staff, start, end, label, venue });
    }
  }

  if (!seats.length) {
    console.warn("[announce-absence] no instructor seat", display, iso, wantService);
    return { ok: true, instructors: [], inserted: 0 };
  }

  const { data: existing } = await admin
    .from("schedule_overrides")
    .select("id, anchor_staff_id, anchor_start, anchor_end, anchor_client_id, status")
    .eq("session_date", iso)
    .eq("override_type", "client_absence_announced")
    .eq("status", "active")
    .limit(40);

  const skipPush = slug(input.skipPushStaffKey || "");
  let inserted = 0;
  let firstId: string | null = null;
  const names: string[] = [];

  for (const seat of seats) {
    const already = (existing || []).find((ov) => {
      const staff = slug(ov.anchor_staff_id);
      const client = slug(ov.anchor_client_id);
      if (staff !== seat.staff) return false;
      if (client && clientSlug && client !== clientSlug && !client.startsWith(clientSlug) && !clientSlug.startsWith(client)) {
        return false;
      }
      return String(ov.anchor_start || "").slice(0, 5) === seat.start;
    });
    if (already) {
      if (!firstId) firstId = String(already.id || "") || null;
      if (!names.includes(seat.staff)) names.push(seat.staff);
      continue;
    }
    const payload: Record<string, unknown> = {
      feedback_resolution: "absent",
      source: input.source,
      absence_report_id: clean(input.absenceReportId, 60) || null,
      client_name: display,
    };
    if (skipPush && skipPush === seat.staff) payload.skip_push_staff_key = seat.staff;
    const { data: ins, error: insErr } = await admin
      .from("schedule_overrides")
      .insert({
        session_date: iso,
        anchor_staff_id: seat.staff,
        anchor_start: seat.start,
        anchor_end: seat.end,
        anchor_venue: seat.venue,
        anchor_client_id: clientSlug,
        anchor_time_slot_label: seat.label,
        override_type: "client_absence_announced",
        payload,
        reason: clean(input.reason, 300) || "Absent",
        status: "active",
      })
      .select("id")
      .maybeSingle();
    if (insErr) {
      console.error("[announce-absence] insert", seat.staff, insErr.message);
      continue;
    }
    inserted += 1;
    if (!firstId && ins?.id) firstId = String(ins.id);
    if (!names.includes(seat.staff)) names.push(seat.staff);
  }

  return { ok: true, instructors: names, inserted, override_id: firstId };
}
