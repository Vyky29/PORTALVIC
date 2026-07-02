/** Build parent-facing staff shift summary from live MADRE document (roster). */

import type { MadreDoc } from "./portal_madre_fold_logic.ts";

export type StaffRosterAvailabilityHint = {
  term_label: string;
  summary: string;
  shifts_by_day: Array<{ day: string; lines: string[] }>;
};

const ACAD_FROM = "2025-09-01";
const ACAD_TO = "2026-07-31";
const TERM_LABEL = "Sep 2025 – Jul 2026";

const DAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normKey(s: unknown): string {
  return norm(s).toLowerCase();
}

function weekdayFromIso(iso: unknown): string {
  const d = norm(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  try {
    const dt = new Date(`${d}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(dt);
  } catch {
    return "";
  }
}

function shortDay(day: string): string {
  const d = norm(day);
  return d.length >= 3 ? d.slice(0, 3) : d;
}

function staffNameMatches(fullName: string, username: string, candidate: string): boolean {
  const c = normKey(candidate);
  if (!c) return false;
  const fn = normKey(fullName);
  const un = normKey(username).replace(/_/g, " ");
  if (fn && (c === fn || fn.includes(c) || c.includes(fn))) return true;
  if (un && (c === un || c.replace(/_/g, " ") === un || un.includes(c))) return true;
  const parts = fn.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (c === first) return true;
    if (c.includes(first) && c.includes(last)) return true;
    if (`${first} ${last}` === c) return true;
  }
  return false;
}

function addLine(byDay: Map<string, Set<string>>, day: string, line: string) {
  const d = norm(day);
  const l = norm(line);
  if (!d || !l) return;
  if (!byDay.has(d)) byDay.set(d, new Set());
  byDay.get(d)!.add(l);
}

function fromStaffShifts(doc: MadreDoc, fullName: string, username: string): Map<string, Set<string>> {
  const byDay = new Map<string, Set<string>>();
  const rows = doc.staffShifts?.rows || [];
  for (const row of rows) {
    const iso = norm(row.session_date).slice(0, 10);
    if (!iso || iso < ACAD_FROM || iso > ACAD_TO) continue;
    if (!staffNameMatches(fullName, username, String(row.staff_name || row.staff_key || ""))) continue;
    const day = norm(row.day) || weekdayFromIso(iso);
    const parts = [row.time_range, row.venue].map(norm).filter(Boolean);
    addLine(byDay, day, parts.join(" · "));
  }
  return byDay;
}

function fromWeekTemplates(doc: MadreDoc, fullName: string, username: string): Map<string, Set<string>> {
  const byDay = new Map<string, Set<string>>();
  for (const week of doc.weeks || []) {
    for (const col of week.staff || []) {
      if (!staffNameMatches(fullName, username, String(col.staffName || col.staffKey || ""))) continue;
      for (const dayRow of col.days || []) {
        const day = norm(dayRow.weekday) || weekdayFromIso(dayRow.sessionDate);
        for (const slot of dayRow.slots || []) {
          const parts = [slot.time_slot, slot.service, slot.venue].map(norm).filter(Boolean);
          addLine(byDay, day, parts.join(" · "));
        }
      }
    }
  }
  return byDay;
}

function mergeDayMaps(a: Map<string, Set<string>>, b: Map<string, Set<string>>): Map<string, Set<string>> {
  const out = new Map(a);
  for (const [day, lines] of b) {
    if (!out.has(day)) out.set(day, new Set());
    for (const line of lines) out.get(day)!.add(line);
  }
  return out;
}

function formatHint(byDay: Map<string, Set<string>>): StaffRosterAvailabilityHint | null {
  if (!byDay.size) return null;
  const days = Array.from(byDay.keys()).sort(
    (a, b) => (DAY_ORDER[normKey(a)] || 9) - (DAY_ORDER[normKey(b)] || 9),
  );
  const shifts_by_day = days.map((day) => ({
    day,
    lines: Array.from(byDay.get(day) || []).sort(),
  }));
  const summaryParts = shifts_by_day.map((row) => {
    const lines = row.lines.join("; ");
    return `${row.day}: ${lines}`;
  });
  return {
    term_label: TERM_LABEL,
    summary: summaryParts.join(" · "),
    shifts_by_day,
  };
}

export function buildStaffRosterAvailabilityHint(
  doc: MadreDoc | null | undefined,
  fullName: string,
  username: string,
): StaffRosterAvailabilityHint | null {
  if (!doc || typeof doc !== "object") return null;
  const merged = mergeDayMaps(
    fromStaffShifts(doc, fullName, username),
    fromWeekTemplates(doc, fullName, username),
  );
  return formatHint(merged);
}

export { shortDay, TERM_LABEL as STAFF_ROSTER_AVAIL_TERM_LABEL };
