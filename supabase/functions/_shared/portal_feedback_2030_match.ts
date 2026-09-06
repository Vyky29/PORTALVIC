/** Outstanding session-feedback units for the 20:30 WhatsApp nudge. */

import {
  isDayCentreService,
  rosterClientsMatch,
  slugClient,
} from "./portal_feedback_digest_match.ts";

export type Feedback2030Slot = {
  staff: string;
  client: string;
  time: string;
  service: string;
  area?: string;
};

export type Feedback2030StaffDebt = {
  staffKey: string;
  staffLabel: string;
  pending: number;
  sample: string[];
};

const SKIP_CLIENT = /^(home|manager|closed|available|no[_ ]participant|open|cover[_ ]needed|off|day[_ ]off|casa|na)$/i;

/** Sun 6 Sep 2026 dated books (Overview / LOCAL). Used when DB roster is still thin. */
const SUNDAY_2026_09_06: Feedback2030Slot[] = [
  { staff: "ALEX", client: "Eiji", time: "10 to 11", service: "Climbing Activity" },
  { staff: "ALEX", client: "Yusef", time: "11 to 12", service: "Climbing Activity" },
  { staff: "ALEX", client: "Rodin", time: "1 to 2", service: "Climbing Activity" },
  { staff: "AURORA", client: "Yusuf Ah", time: "9 to 9.30", service: "Aquatic Activity" },
  { staff: "AURORA", client: "Adam Ab", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "AURORA", client: "Jack W", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "AURORA", client: "Arthur Ma", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "AURORA", client: "Cyrus", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "AURORA", client: "Aydaan Ah", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "AURORA", client: "Erik", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "AURORA", client: "Zakariya", time: "2 to 2.30", service: "Aquatic Activity" },
  { staff: "AURORA", client: "Faris", time: "2.30 to 3", service: "Aquatic Activity" },
  { staff: "BERTA", client: "Jack W", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "BERTA", client: "Adam Ab", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "BERTA", client: "Cyrus", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "BERTA", client: "Arthur Ma", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "BERTA", client: "Erik", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "BERTA", client: "Aydaan Ah", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "CARLOS", client: "Hazem", time: "10 to 11", service: "Climbing Activity" },
  { staff: "CARLOS", client: "Zaid", time: "11 to 12", service: "Climbing Activity" },
  { staff: "CARLOS", client: "Serine", time: "12 to 1", service: "Climbing Activity" },
  { staff: "CARLOS", client: "Zakariya", time: "1 to 2", service: "Climbing Activity" },
  { staff: "CARLOS", client: "Patrick", time: "3 to 4", service: "Climbing Activity" },
  { staff: "GODSWAY", client: "Samer", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "GODSWAY", client: "Yusuf Ah", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "GODSWAY", client: "Arthur Mo", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "GODSWAY", client: "Gabriel", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "GODSWAY", client: "Adaam Ah", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "GODSWAY", client: "Amaar Ah", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Zaid (Trial)", time: "9 to 9.30", service: "Aquatic Activity" },
  { staff: "JAVIER", client: "Zaid", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Jack S", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Hazem", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Eiji", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Rayyan F", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Haneef", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "JAVIER", client: "Max", time: "2 to 2.30", service: "Aquatic Activity" },
  { staff: "JAVIER", client: "Shaan", time: "2.30 to 3", service: "Aquatic Activity" },
  { staff: "JOHN", client: "Jack S", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "JOHN", client: "Zaid", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "JOHN", client: "Eiji", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "JOHN", client: "Hazem", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "JOHN", client: "Haneef", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "JOHN", client: "Rayyan F", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Simon", time: "9 to 9.30", service: "Aquatic Activity" },
  { staff: "ROBERTO", client: "Yusuf Ah", time: "9.30 to 10.15", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Samer", time: "10.15 to 11", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Gabriel", time: "11 to 11.45", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Arthur Mo", time: "11.45 to 12.30", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Amaar Ah", time: "12.30 to 1.15", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Adaam Ah", time: "1.15 to 2", service: "Multi-Activity" },
  { staff: "ROBERTO", client: "Rodin", time: "2 to 2.30", service: "Aquatic Activity" },
  { staff: "ROBERTO", client: "Yoan", time: "2.30 to 3", service: "Aquatic Activity" },
];

const SATURDAY_ACTON_REAL: Feedback2030Slot[] = [
  { staff: "YOUSSEF", client: "Emani", time: "10.30 to 11", service: "Aquatic Activity" },
  { staff: "YOUSSEF", client: "Saaib", time: "12 to 12.30", service: "Aquatic Activity" },
];

export const STAFF_USERNAME_ALIASES: Record<string, string> = {
  /* Never collapse swimming Javier Marquez (javier) into CEO Javi Palankas (javi). */
  javier: "javier",
  javiermarquez: "javier",
  javi: "javi",
  javipalankas: "javi",
  palankas: "javi",
  javiarranz: "javi",
  youssef: "youssef",
  yusuf: "youssef",
};

/** True when keys are the distinct Javier Marquez vs Javi Palankas pair. */
export function isJaviJavierCollision(a: string, b: string): boolean {
  const x = normalizeStaffKey(a);
  const y = normalizeStaffKey(b);
  const ax = STAFF_USERNAME_ALIASES[x] || x;
  const ay = STAFF_USERNAME_ALIASES[y] || y;
  return (ax === "javi" && ay === "javier") || (ax === "javier" && ay === "javi");
}

export function normalizeStaffKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function firstNameOf(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0];
}

function slotDedupeKey(s: Feedback2030Slot): string {
  return [
    normalizeStaffKey(s.staff),
    slugClient(s.client),
    String(s.time || "").toLowerCase().replace(/\s+/g, ""),
    slugClient(s.service),
  ].join("|");
}

export function isRealFeedbackClient(name: string): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  return !SKIP_CLIENT.test(slugClient(n).replace(/_/g, " ")) && !SKIP_CLIENT.test(n);
}

function weekdayLongUtcNoon(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function datedFallbackSlots(iso: string): Feedback2030Slot[] {
  if (iso === "2026-09-06") return SUNDAY_2026_09_06.slice();
  const wd = weekdayLongUtcNoon(iso);
  if (wd === "Saturday") return SATURDAY_ACTON_REAL.slice();
  return [];
}

type MadreLike = {
  weeks?: Array<{
    start?: string;
    end?: string;
    staff?: unknown;
  }>;
};

function asStaffCols(staff: unknown): Array<{ staffKey?: string; staffName?: string; days?: unknown[] }> {
  if (!staff) return [];
  if (Array.isArray(staff)) return staff as Array<{ staffKey?: string; staffName?: string; days?: unknown[] }>;
  if (typeof staff === "object") {
    return Object.values(staff as Record<string, { staffKey?: string; staffName?: string; days?: unknown[] }>);
  }
  return [];
}

export function slotsFromMadre(doc: MadreLike | null | undefined, iso: string): Feedback2030Slot[] {
  const out: Feedback2030Slot[] = [];
  const wd = weekdayLongUtcNoon(iso);
  for (const week of doc?.weeks || []) {
    const start = String(week.start || "").slice(0, 10);
    const end = String(week.end || "").slice(0, 10);
    if (start && iso < start) continue;
    if (end && iso > end) continue;
    for (const col of asStaffCols(week.staff)) {
      const staff = String(col.staffName || col.staffKey || "").trim();
      if (!staff) continue;
      const days = Array.isArray(col.days) ? col.days : [];
      for (const day of days) {
        const d = day && typeof day === "object" ? (day as Record<string, unknown>) : {};
        const dIso = String(d.sessionDate || "").slice(0, 10);
        const dWd = String(d.weekday || "").trim();
        if (dIso && dIso !== iso) continue;
        if (!dIso && dWd && dWd.toLowerCase() !== wd.toLowerCase()) continue;
        const slots = Array.isArray(d.slots) ? d.slots : [];
        for (const sl of slots) {
          const s = sl && typeof sl === "object" ? (sl as Record<string, unknown>) : {};
          const client = String(s.client_name || "").trim();
          if (!isRealFeedbackClient(client)) continue;
          out.push({
            staff,
            client,
            time: String(s.time_slot || "").trim(),
            service: String(s.service || "").trim(),
            area: String(s.area || "").trim() || undefined,
          });
        }
      }
    }
  }
  return out;
}

export function slotsFromRosterRows(
  rows: Array<{
    client_name?: string | null;
    instructors?: string | null;
    time_slot?: string | null;
    service?: string | null;
    area?: string | null;
    session_date?: string | null;
    day?: string | null;
  }>,
  iso: string,
): Feedback2030Slot[] {
  const wd = weekdayLongUtcNoon(iso);
  const out: Feedback2030Slot[] = [];
  for (const r of rows || []) {
    const d = String(r.session_date || "").slice(0, 10);
    if (d && d !== iso) continue;
    if (!d && String(r.day || "").trim() && String(r.day).toLowerCase() !== wd.toLowerCase()) {
      continue;
    }
    const client = String(r.client_name || "").trim();
    if (!isRealFeedbackClient(client)) continue;
    const names = String(r.instructors || "")
      .split(/[,/&+]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length) continue;
    for (const staff of names) {
      out.push({
        staff,
        client,
        time: String(r.time_slot || "").trim(),
        service: String(r.service || "").trim(),
        area: String(r.area || "").trim() || undefined,
      });
    }
  }
  return out;
}

export function mergeFeedback2030Slots(lists: Feedback2030Slot[][]): Feedback2030Slot[] {
  const seen = new Set<string>();
  const out: Feedback2030Slot[] = [];
  for (const list of lists) {
    for (const s of list) {
      if (!isRealFeedbackClient(s.client)) continue;
      const k = slotDedupeKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

function clientsClose(a: string, b: string): boolean {
  if (rosterClientsMatch(a, b)) return true;
  const sa = slugClient(a).replace(/_ah$/, "");
  const sb = slugClient(b).replace(/_ah$/, "");
  if (sa && sb && sa === sb) return true;
  if ((sa === "yusef" && sb === "yusuf") || (sa === "yusuf" && sb === "yusef")) return true;
  if ((sa === "zaid" && sb === "zaid_trial") || (sa === "zaid_trial" && sb === "zaid")) {
    return true;
  }
  if (sa === "zaidalfadhl" && (sb === "zaid" || sb === "zaid_trial")) return true;
  if (sb === "zaidalfadhl" && (sa === "zaid" || sa === "zaid_trial")) return true;
  return false;
}
function namesMatchInstructor(completedBy: string, instructor: string): boolean {
  const a = normalizeStaffKey(firstNameOf(completedBy));
  const b = normalizeStaffKey(firstNameOf(instructor));
  if (!a || !b) return false;
  if (isJaviJavierCollision(a, b)) return false;
  if (a === b) return true;
  const aa = STAFF_USERNAME_ALIASES[a] || a;
  const bb = STAFF_USERNAME_ALIASES[b] || b;
  if (aa === bb) return true;
  /* Prefix match is unsafe for javi/javier — already excluded above. */
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

export type Feedback2030Row = {
  client_name?: string | null;
  completed_by_name?: string | null;
  portal_session_key?: string | null;
  service?: string | null;
  attendance?: string | null;
};

export type Feedback2030KeyRow = {
  portal_session_key?: string | null;
  client_name?: string | null;
  staff_user_id?: string | null;
  mark_type?: string | null;
};

function keyTouchesClient(key: string, client: string): boolean {
  const sl = slugClient(client);
  if (!sl) return false;
  const k = String(key || "").toLowerCase();
  return k.includes(sl) || rosterClientsMatch(client, key);
}

export function slotIsResolved(
  slot: Feedback2030Slot,
  iso: string,
  ctx: {
    feedbackRows: Feedback2030Row[];
    cancelRows: Feedback2030KeyRow[];
    absentMarks: Feedback2030KeyRow[];
    feedbackDoneMarks: Feedback2030KeyRow[];
    staffIdByKey?: Record<string, string>;
  },
): boolean {
  const dc = isDayCentreService(slot.service);
  for (const c of ctx.cancelRows) {
    if (keyTouchesClient(String(c.portal_session_key || c.client_name || ""), slot.client)) {
      return true;
    }
  }
  const staffId = ctx.staffIdByKey?.[normalizeStaffKey(slot.staff)] || "";
  for (const m of ctx.absentMarks) {
    if (!keyTouchesClient(String(m.portal_session_key || ""), slot.client)) continue;
    if (staffId && m.staff_user_id && String(m.staff_user_id) !== staffId) continue;
    return true;
  }
  for (const m of ctx.feedbackDoneMarks) {
    if (!keyTouchesClient(String(m.portal_session_key || ""), slot.client)) continue;
    if (staffId && m.staff_user_id && String(m.staff_user_id) !== staffId) continue;
    return true;
  }
  for (const fb of ctx.feedbackRows) {
    if (!clientsClose(slot.client, String(fb.client_name || ""))) {
      if (!keyTouchesClient(String(fb.portal_session_key || ""), slot.client)) continue;
    }
    if (dc) return true;
    const who = String(fb.completed_by_name || "");
    if (who && namesMatchInstructor(who, slot.staff)) return true;
  }
  return false;
}

export function outstandingByStaff(
  slots: Feedback2030Slot[],
  iso: string,
  ctx: Parameters<typeof slotIsResolved>[2],
): Feedback2030StaffDebt[] {
  const map = new Map<string, Feedback2030StaffDebt>();
  for (const slot of slots) {
    if (slotIsResolved(slot, iso, ctx)) continue;
    const key = normalizeStaffKey(slot.staff);
    if (!key) continue;
    let row = map.get(key);
    if (!row) {
      row = {
        staffKey: key,
        staffLabel: firstNameOf(slot.staff) || slot.staff,
        pending: 0,
        sample: [],
      };
      map.set(key, row);
    }
    row.pending += 1;
    if (row.sample.length < 4) {
      row.sample.push(`${slot.client} ${slot.time}`.trim());
    }
  }
  return [...map.values()].sort((a, b) => a.staffLabel.localeCompare(b.staffLabel));
}

export function profileMatchesStaffKey(
  profile: { username?: string | null; full_name?: string | null },
  staffKey: string,
): boolean {
  const want = normalizeStaffKey(staffKey);
  if (!want) return false;
  const alias = STAFF_USERNAME_ALIASES[want] || want;
  const un = normalizeStaffKey(String(profile.username || ""));
  const fn = normalizeStaffKey(firstNameOf(String(profile.full_name || "")));
  const unAlias = STAFF_USERNAME_ALIASES[un] || un;
  const fnAlias = STAFF_USERNAME_ALIASES[fn] || fn;
  if (un && isJaviJavierCollision(un, want)) return false;
  if (fn && isJaviJavierCollision(fn, want)) return false;
  if (un && (un === want || un === alias || unAlias === alias)) return true;
  if (fn && (fn === want || fn === alias || fnAlias === alias)) return true;
  return false;
}
