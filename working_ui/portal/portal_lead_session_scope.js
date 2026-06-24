/**
 * Programme-lead session overview scope for John & Berta (client-side filters).
 */
import { portalInferStaffKey } from "./auth-handler.js";
import { resolveStaffKeyFromAuthEmail } from "./auth-map.js";

const LEAD_OVERVIEW_KEYS = new Set(["berta", "john", "michelle"]);

/** Auth email → programme lead key (wins over staff_profiles.username e.g. stf012). */
const LEAD_PROGRAMME_EMAIL_TO_KEY = {
  "johnnyosti37@gmail.com": "john",
  "b.traperocasado@gmail.com": "berta",
  "michelle@youtimecounselling.com": "michelle",
  "stf006@staff.import.pending": "john",
  "stf012@staff.import.pending": "berta",
};

/**
 * Normalise auth email from Supabase session / getUser().
 * @param {string} authEmail
 * @returns {string}
 */
export function portalLeadNormalizeAuthEmail(authEmail) {
  return String(authEmail || "")
    .trim()
    .toLowerCase();
}

/**
 * Programme lead key for John/Berta session overview (not generic portalInferStaffKey).
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 * @returns {"john"|"berta"|""}
 */
export function portalLeadProgrammeKey(profile, authEmail) {
  const em = portalLeadNormalizeAuthEmail(authEmail);
  if (em && LEAD_PROGRAMME_EMAIL_TO_KEY[em]) return LEAD_PROGRAMME_EMAIL_TO_KEY[em];
  const staffKeyFromEmail = resolveStaffKeyFromAuthEmail(em);
  if (LEAD_OVERVIEW_KEYS.has(staffKeyFromEmail)) return staffKeyFromEmail;
  if (em.indexOf("johnnyosti") >= 0 || em.indexOf("john.osti") >= 0) return "john";
  if (em.indexOf("traperocasado") >= 0) return "berta";
  const usernameKey = normKey(profile && profile.username);
  if (LEAD_OVERVIEW_KEYS.has(usernameKey)) return usernameKey;
  const firstNameKey = normKey(
    String((profile && profile.full_name) || "")
      .trim()
      .split(/\s+/)[0]
  );
  if (LEAD_OVERVIEW_KEYS.has(firstNameKey)) return firstNameKey;
  const fullNameKey = normKey(profile && profile.full_name);
  if (fullNameKey.indexOf("traperocasado") >= 0 || fullNameKey.indexOf("berta") >= 0) return "berta";
  if (fullNameKey.indexOf("kyeifram") >= 0 || fullNameKey.indexOf("john") >= 0) return "john";
  if (fullNameKey.indexOf("michelle") >= 0) return "michelle";
  if (em.indexOf("michelle@youtimecounselling") >= 0) return "michelle";
  if (usernameKey === "stf006" || em === "stf006@staff.import.pending") return "john";
  if (usernameKey === "stf012" || em === "stf012@staff.import.pending") return "berta";
  const inferred = portalInferStaffKey(profile, authEmail);
  return LEAD_OVERVIEW_KEYS.has(inferred) ? inferred : "";
}

const JOHN_SCOPES = [
  {
    id: "bespoke-mwf",
    label: "Mon / Fri — Bespoke Programme (SwimFarm)",
    weekdays: ["Monday", "Friday"],
    serviceKeys: ["bespoke"],
    venues: ["swimfarm"],
  },
  {
    id: "wednesday-ma-acton",
    label: "Wednesday — Multi-Activity (Acton)",
    weekdays: ["Wednesday"],
    serviceKeys: ["multi", "aquatic"],
    venues: ["acton"],
    programmeWideRoster: true,
  },
  {
    id: "sunday-ma-swimfarm",
    label: "Sunday — Multi-Activity (SwimFarm)",
    weekdays: ["Sunday"],
    serviceKeys: ["multi"],
    venues: ["swimfarm"],
    programmeWideRoster: true,
  },
];

const MICHELLE_SCOPES = [
  {
    id: "day-centre-all",
    label: "Day Centre — all programme days",
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    serviceKeys: ["daycentre"],
    programmeWideRoster: true,
  },
];

const BERTA_SCOPES = [
  {
    id: "wednesday-ma-acton",
    label: "Wednesday — Multi-Activity (Acton)",
    weekdays: ["Wednesday"],
    serviceKeys: ["multi"],
    venues: ["acton"],
    programmeWideRoster: true,
  },
  {
    id: "sunday-ma-swimfarm",
    label: "Sunday — Multi-Activity (SwimFarm)",
    weekdays: ["Sunday"],
    serviceKeys: ["multi"],
    venues: ["swimfarm"],
    programmeWideRoster: true,
  },
];

function normKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normService(v) {
  const s = normKey(v);
  if (s.indexOf("daycentre") >= 0 || s.indexOf("daycenter") >= 0) return "daycentre";
  if (s.indexOf("bespoke") >= 0) return "bespoke";
  if (s.indexOf("multi") >= 0) return "multi";
  if (s.indexOf("aquatic") >= 0) return "aquatic";
  if (s.indexOf("climb") >= 0) return "climbing";
  return s;
}

function isDayCentreService(serviceRaw) {
  return normService(serviceRaw) === "daycentre";
}

function serviceExcludedForLeadOverview(serviceRaw) {
  const sk = normService(serviceRaw);
  return sk === "climbing" || sk === "aquatic";
}

function normVenue(v) {
  return normKey(v).replace(/[^a-z]/g, "");
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Summer term — lead overview only shows data from this date (Mon 13 Apr 2026). */
export const PORTAL_LEAD_SUMMER_TERM_START = "2026-04-13";

/** Club closed (no sessions) — show on lead week picker in red. */
const PORTAL_LEAD_CLOSED_RANGES = [{ from: "2026-05-23", to: "2026-05-31" }];
const PORTAL_LEAD_CLOSED_SINGLE_DATES = ["2026-05-04"];

export function portalLeadOnOrAfterSummerTerm(iso) {
  const d = String(iso || "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= PORTAL_LEAD_SUMMER_TERM_START;
}

export function portalLeadSummerTermWeekStart() {
  const s = PORTAL_LEAD_SUMMER_TERM_START;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const p = s.split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  if (isNaN(d.getTime())) return s;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function portalLeadDayIsClubClosed(iso) {
  const d = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  for (let i = 0; i < PORTAL_LEAD_CLOSED_RANGES.length; i++) {
    const r = PORTAL_LEAD_CLOSED_RANGES[i];
    if (d >= r.from && d <= r.to) return true;
  }
  for (let j = 0; j < PORTAL_LEAD_CLOSED_SINGLE_DATES.length; j++) {
    if (d === PORTAL_LEAD_CLOSED_SINGLE_DATES[j]) return true;
  }
  const t =
    typeof globalThis !== "undefined" && globalThis.PORTAL_TERM_FROM_TIMETABLE
      ? globalThis.PORTAL_TERM_FROM_TIMETABLE
      : null;
  const singles = t && Array.isArray(t.termClosedDates) ? t.termClosedDates : [];
  for (let k = 0; k < singles.length; k++) {
    if (String(singles[k] || "").slice(0, 10) === d) return true;
  }
  return false;
}

/** True when this calendar day is a weekday the lead works (any programme scope). */
export function portalLeadDayIsProgrammeWorkDay(iso, scopes) {
  if (!scopes || !scopes.length) return false;
  if (portalLeadDayIsClubClosed(iso)) return false;
  const wd = weekdayFromIso(iso);
  if (!wd) return false;
  for (let i = 0; i < scopes.length; i++) {
    if (scopes[i].weekdays.indexOf(wd) >= 0) return true;
  }
  return false;
}

export function portalCanAccessLeadSessionOverview(profile, authEmail) {
  return !!portalLeadProgrammeKey(profile, authEmail);
}

export function portalLeadSessionScopesForProfile(profile, authEmail) {
  const key = portalLeadProgrammeKey(profile, authEmail);
  if (key === "john") return JOHN_SCOPES.slice();
  if (key === "berta") return BERTA_SCOPES.slice();
  if (key === "michelle") return MICHELLE_SCOPES.slice();
  return [];
}

export function portalLeadSessionScopeLabels(profile, authEmail) {
  return portalLeadSessionScopesForProfile(profile, authEmail).map((s) => s.label);
}

function weekdayFromIso(iso) {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  return DOW[d.getDay()] || "";
}

function serviceMatches(serviceRaw, scope) {
  const sk = normService(serviceRaw);
  if (!scope.serviceKeys || !scope.serviceKeys.length) return true;
  if (scope.serviceKeys.indexOf("daycentre") >= 0 && isDayCentreService(serviceRaw)) return true;
  return scope.serviceKeys.indexOf(sk) >= 0;
}

function venueMatches(venueRaw, scope, opts) {
  if (!scope.venues || !scope.venues.length) return true;
  const v = normVenue(venueRaw);
  if (!v) return !!(opts && opts.allowEmptyVenue);
  return scope.venues.some((want) => v.indexOf(normVenue(want)) >= 0 || normVenue(want).indexOf(v) >= 0);
}

function weekdayMatches(isoOrWeekday, scope) {
  const wd =
    DOW.indexOf(String(isoOrWeekday || "").trim()) >= 0
      ? String(isoOrWeekday).trim()
      : weekdayFromIso(isoOrWeekday);
  if (!wd) return false;
  return scope.weekdays.indexOf(wd) >= 0;
}

function scopesMatchRow(scopes, iso, serviceRaw, venueRaw, opts) {
  if (!scopes.length) return false;
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    if (!weekdayMatches(iso, scope)) continue;
    if (!serviceMatches(serviceRaw, scope)) continue;
    if (!venueMatches(venueRaw, scope, opts)) continue;
    return true;
  }
  return false;
}

/** Portal/DB feedback rows often lack venue; infer from weekday + service + session key tail. */
export function portalLeadInferFeedbackVenue(row) {
  const direct = String((row && (row.venue || row.venue_name)) || "").trim();
  if (direct) return direct;
  const iso = String((row && (row.session_date || row.date)) || "")
    .trim()
    .slice(0, 10);
  const wd = weekdayFromIso(iso);
  const sk = normKey(row && (row.portal_session_key || row.portalSessionKey));
  const svc = normService(row && row.service);
  if (wd === "Wednesday" && svc === "multi") return "Acton";
  if (wd === "Sunday" && svc === "multi") return "SwimFarm";
  if (svc === "bespoke") return "SwimFarm";
  if (/room|hubroom|acton/.test(sk)) return "Acton";
  if (/pool|swimfarm|bigpool|teachingpool|fish|shark|dolphin/.test(sk)) return "SwimFarm";
  return "";
}

function normInstructorKey(name) {
  return normKey(name);
}

function slotInstructorsNorm(slot) {
  const out = [];
  const add = (n) => {
    const k = normInstructorKey(n);
    if (k && out.indexOf(k) < 0) out.push(k);
  };
  if (Array.isArray(slot.instructors)) {
    slot.instructors.forEach(add);
  }
  const raw = String(
    slot.instructor_label || slot.instructors_raw || slot.instructors || ""
  ).trim();
  if (raw && !Array.isArray(slot.instructors)) {
    raw.split(/,|\/|&|\band\b/gi).forEach(add);
  }
  return out;
}

/** Lead only sees slots they lead (name on the roster row), not co-staff on the same programme. */
export function portalLeadSlotHasLeadInstructor(slot, leadProfileKey) {
  const lead = normInstructorKey(leadProfileKey);
  if (!lead) return false;
  return slotInstructorsNorm(slot).indexOf(lead) >= 0;
}

/** Roster slot object from AdminSessionsHub.expandSlotsForDate */
export function portalLeadSlotInScope(slot, scopes) {
  if (!slot || !scopes || !scopes.length) return false;
  if (serviceExcludedForLeadOverview(slot.service)) return false;
  const iso = String(slot.iso || slot.session_date || "").slice(0, 10);
  return scopesMatchRow(scopes, iso, slot.service, slot.venue);
}

export function portalLeadSlotInScopeForLead(slot, scopes, leadProfileKey) {
  const iso = String(slot.iso || slot.session_date || "").slice(0, 10);
  return portalLeadSlotInScopeForDay(slot, scopes, leadProfileKey, iso);
}

export function portalLeadFeedbackInScope(fb, scopes) {
  if (!fb || !scopes || !scopes.length) return false;
  if (serviceExcludedForLeadOverview(fb.service)) return false;
  const iso = String(fb.session_date || fb.date || "").trim().slice(0, 10);
  const venue = portalLeadInferFeedbackVenue(fb);
  return scopesMatchRow(scopes, iso, fb.service, venue, { allowEmptyVenue: true });
}

export function portalLeadReportInScope(report, scopes) {
  if (!report || !scopes || !scopes.length) return false;
  const iso = String(report.session_date || "").trim().slice(0, 10);
  const venue = report.venue || "";
  let service = report.service || "";
  if (report.is_bespoke_programme && normService(service) !== "bespoke") {
    service = "Bespoke Programme";
  }
  return scopesMatchRow(scopes, iso, service, venue);
}

/** Quick absent marks — same weekday/service/venue rules as feedback rows. */
export function portalLeadAbsentMarkInScope(mark, scopes) {
  if (!mark || !scopes || !scopes.length) return false;
  if (serviceExcludedForLeadOverview(mark.service)) return false;
  const iso = String(mark.session_date || "")
    .trim()
    .slice(0, 10);
  if (!iso) return false;
  const row = {
    session_date: iso,
    service: mark.service,
    venue: mark.venue || "",
    portal_session_key: mark.portal_session_key,
  };
  row.venue = portalLeadInferFeedbackVenue(row);
  return scopesMatchRow(scopes, iso, mark.service, row.venue, { allowEmptyVenue: true });
}

export function portalLeadSessionScopeFilterFns(scopes, leadProfileKey) {
  const leadKey = normInstructorKey(leadProfileKey);
  return {
    slotScopeFilter: function (slot) {
      return portalLeadSlotInScopeForLead(slot, scopes, leadKey);
    },
    feedbackRowScopeFilter: function (fb) {
      if (serviceExcludedForLeadOverview(fb.service)) return false;
      return portalLeadFeedbackInScope(fb, scopes);
    },
    absentMarkScopeFilter: function (mark) {
      return portalLeadAbsentMarkInScope(mark, scopes);
    },
    incidentScopeFilter: function (report) {
      return portalLeadReportInScope(report, scopes);
    },
  };
}

function clientSlugFromSlot(slot) {
  const raw = String(slot.client_name || slot.clientDisplay || "").trim();
  const k = normKey(raw);
  if (!k || k === "closed" || k === "available") return "";
  return k;
}

function activeScopesForWeekday(scopes, iso) {
  const wd = weekdayFromIso(iso);
  return scopes.filter((sc) => sc.weekdays.indexOf(wd) >= 0);
}

/** Wed/Sun MA: all roster rows + all staff feedback for that programme day (not lead-instructor only). */
export function portalLeadDayUsesProgrammeWideRoster(scopes, iso) {
  const active = activeScopesForWeekday(scopes, iso);
  return (
    active.length > 0 &&
    active.every((sc) => sc.programmeWideRoster === true)
  );
}

function portalLeadSlotInScopeForDay(slot, scopes, leadProfileKey, iso) {
  if (!portalLeadSlotInScope(slot, scopes)) return false;
  const day = String(iso || slot.iso || slot.session_date || "")
    .trim()
    .slice(0, 10);
  if (portalLeadDayUsesProgrammeWideRoster(scopes, day)) return true;
  return portalLeadSlotHasLeadInstructor(slot, leadProfileKey);
}

function isBespokeLeadDay(scopes, iso) {
  const active = activeScopesForWeekday(scopes, iso);
  return (
    active.length > 0 &&
    active.every((sc) => sc.serviceKeys.indexOf("bespoke") >= 0) &&
    active.every((sc) => sc.serviceKeys.indexOf("multi") < 0)
  );
}

/**
 * Programme-lead feedback totals: bespoke M/W/F = 1 per day; MA = 2 per participant.
 * Uses hub roster + feedback unit completion when mounted.
 */
export function portalLeadDayFeedbackStats(iso, scopes, leadProfileKey, hub) {
  if (!hub || typeof hub.expandSlotsForDate !== "function") return null;
  const day = String(iso || "").trim().slice(0, 10);
  const slots = hub.expandSlotsForDate(day).filter((s) =>
    portalLeadSlotInScopeForDay(s, scopes, leadProfileKey, day)
  );
  if (!slots.length) return { total: 0, done: 0 };

  const units =
    typeof hub.getFeedbackUnitsForDate === "function"
      ? hub
          .getFeedbackUnitsForDate(day)
          .map((u) => ({
            key: u.key,
            slots: u.slots.filter((s) =>
              portalLeadSlotInScopeForDay(s, scopes, leadProfileKey, day)
            ),
          }))
          .filter((u) => u.slots.length > 0)
      : [];

  const unitDone = (u) => {
    if (typeof hub.feedbackUnitResolved === "function") return hub.feedbackUnitResolved(u);
    return (
      (typeof hub.feedbackUnitComplete === "function" && hub.feedbackUnitComplete(u)) ||
      (typeof hub.feedbackUnitAbsent === "function" && hub.feedbackUnitAbsent(u))
    );
  };

  if (isBespokeLeadDay(scopes, day)) {
    const done =
      units.length > 0 && units.every(unitDone) ? 1 : 0;
    return { total: 1, done };
  }

  const clients = new Set();
  slots.forEach((s) => {
    const slug = clientSlugFromSlot(s);
    if (slug) clients.add(slug);
  });
  const total = units.length > 0 ? units.length : clients.size * 2;
  let done = 0;
  units.forEach((u) => {
    if (unitDone(u)) done += 1;
  });
  return { total, done };
}

function statusRowInScope(st, scopes) {
  if (!st || !scopes || !scopes.length) return false;
  const iso = String(st.date || "").trim().slice(0, 10);
  return scopesMatchRow(scopes, iso, st.service, st.venue);
}

function statusRowUnitKey(st) {
  const u = String(st.feedbackUnitKey || "").trim();
  if (u) return u;
  const iso = String(st.date || "").trim().slice(0, 10);
  const client = normKey(st.client || st.clientName || "");
  const slot = normKey(st.timeSlot || st.time_slot || "");
  return iso + "|" + client + "|" + slot;
}

function portalLeadAttendanceIsAbsent(attendance) {
  const att = String(attendance != null ? attendance : "")
    .trim()
    .toLowerCase();
  if (!att) return false;
  if (att === "no" || att === "n" || att === "false" || att === "0") return true;
  if (/^(no[\s\-/]|n\/)/.test(att)) return true;
  if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)/.test(att)) {
    return true;
  }
  return false;
}

function statusRowDone(st) {
  if (!st) return false;
  const os = String(st.overviewStatus || "").trim().toLowerCase();
  if (os === "absent" || os === "cancelled") return true;
  if (st.feedbackComplete === true) return true;
  if (os === "feedback_submitted") return true;
  return false;
}

function feedbackRowsForLeadDay(iso, scopes, mapRow) {
  const src =
    typeof window !== "undefined" ? window.SESSION_FEEDBACK_PORTAL_SOURCE : null;
  if (!src || !Array.isArray(src.rows) || typeof mapRow !== "function") return [];
  const day = String(iso || "").trim().slice(0, 10);
  const out = [];
  src.rows.forEach(function (r) {
    const row = mapRow(r, scopes);
    if (!row) return;
    const d = String(row.session_date || row.date || "").trim().slice(0, 10);
    if (d === day && portalLeadOnOrAfterSummerTerm(d)) out.push(row);
  });
  return out;
}

/** Programme-lead overview: status bundle units in scope, else submitted feedback rows that day. */
export function portalLeadProgrammeDayStats(iso, scopes, mapPortalRow) {
  const day = String(iso || "").trim().slice(0, 10);
  const src =
    typeof window !== "undefined" ? window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE : null;
  if (src && Array.isArray(src.rows)) {
    const units = {};
    src.rows.forEach(function (st) {
      if (String(st.date || "").trim().slice(0, 10) !== day) return;
      if (!portalLeadOnOrAfterSummerTerm(day)) return;
      if (!statusRowInScope(st, scopes)) return;
      const key = statusRowUnitKey(st);
      if (!key) return;
      if (!units[key]) units[key] = false;
      if (statusRowDone(st)) units[key] = true;
    });
    const keys = Object.keys(units);
    if (keys.length) {
      const done = keys.filter(function (k) {
        return units[k];
      }).length;
      return { total: keys.length, done: done };
    }
  }
  if (typeof mapPortalRow === "function") {
    const fb = feedbackRowsForLeadDay(iso, scopes, mapPortalRow);
    if (fb.length) {
      const seen = new Set();
      fb.forEach(function (row) {
        const key =
          String(row.portal_session_key || "").trim() ||
          String(row.session_date || "") +
            "|" +
            String(row.client_name || "").trim() +
            "|" +
            String(row.session_time || "").trim();
        seen.add(key);
      });
      const n = seen.size;
      return { total: n, done: n };
    }
  }
  return null;
}

function isPickupRosterClientName(nm) {
  const n = normKey(String(nm || "").replace(/\s+/g, " "));
  return n && n !== "closed" && n !== "available" && n !== "noclient";
}

function rosterRowSessionDateIso(r) {
  return String((r && r.session_date) || "")
    .trim()
    .slice(0, 10);
}

function rosterRowAppliesOnIso(rows, r, iso, wd) {
  if (String(r.day || "").trim() !== wd) return false;
  const sd = rosterRowSessionDateIso(r);
  if (sd) return sd === iso;
  const cid = normKey(r.client_name);
  if (!cid) return true;
  for (let i = 0; i < rows.length; i++) {
    const o = rows[i];
    if (rosterRowSessionDateIso(o) !== iso) continue;
    if (String(o.day || "").trim() !== wd) continue;
    if (normKey(o.client_name) === cid) return false;
  }
  return true;
}

/**
 * Programme-lead pickup roster: all clients on MA / Day Centre days (not instructor-filtered).
 * @param {string} iso YYYY-MM-DD
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 * @returns {string[]}
 */
export function portalLeadPickupRosterNamesForDate(iso, profile, authEmail) {
  const day = String(iso || "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const scopes = portalLeadSessionScopesForProfile(profile, authEmail);
  if (!scopes.length || !portalLeadDayUsesProgrammeWideRoster(scopes, day)) return [];
  const leadKey = portalLeadProgrammeKey(profile, authEmail);
  if (!leadKey) return [];
  const wd = weekdayFromIso(day);
  if (!wd) return [];
  const src =
    typeof globalThis !== "undefined" && globalThis.STAFF_DASHBOARD_SOURCE
      ? globalThis.STAFF_DASHBOARD_SOURCE
      : null;
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  const names = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isPickupRosterClientName(r.client_name)) continue;
    if (!rosterRowAppliesOnIso(rows, r, day, wd)) continue;
    const slot = {
      iso: day,
      session_date: day,
      day: wd,
      client_name: r.client_name,
      service: r.service,
      venue: r.venue,
      instructors: r.instructors,
      instructor_label: r.instructors,
    };
    if (!portalLeadSlotInScopeForDay(slot, scopes, leadKey, day)) continue;
    const nm = String(r.client_name || "").trim();
    names.set(normKey(nm), nm);
  }
  return Array.from(names.values()).sort(function (a, b) {
    return a.localeCompare(b, "en", { sensitivity: "base" });
  });
}

function rosterRowToLeadSlot(r, iso, wd) {
  return {
    iso: iso,
    session_date: iso,
    day: String(r.day || wd || "").trim(),
    client_name: r.client_name,
    service: r.service,
    venue: r.venue,
    instructors: r.instructors,
    instructor_label: r.instructors,
  };
}

function instructorKeysFromRosterRaw(raw) {
  const out = [];
  const seen = Object.create(null);
  String(raw || "")
    .split(/,|\/|&|\band\b/gi)
    .forEach(function (part) {
      const k = normKey(part);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
  return out;
}

/** Programme-lead MA / Day Centre days: all in-scope roster rows, not lead-instructor only. */
export function portalLeadProgrammeWideTodayForStaff(staffId, iso, profile, authEmail) {
  const day = String(iso || "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { active: false, scopes: [], leadKey: "" };
  const leadKey = portalLeadProgrammeKey(profile || {}, authEmail || "");
  if (!leadKey || normKey(leadKey) !== normKey(staffId)) {
    return { active: false, scopes: [], leadKey: "" };
  }
  const scopes = portalLeadSessionScopesForProfile(profile || {}, authEmail || "");
  if (!scopes.length || !portalLeadDayUsesProgrammeWideRoster(scopes, day)) {
    return { active: false, scopes: [], leadKey: "" };
  }
  return { active: true, scopes: scopes, leadKey: leadKey };
}

export function portalLeadSpreadsheetSessionInScopeForLead(s, iso, leadKey, scopes) {
  if (!s || !iso || !scopes || !scopes.length) return false;
  const cid = normKey(s.clientId);
  if (!cid || cid === "closed" || cid === "available" || cid === "home" || cid === "manager") {
    return false;
  }
  const slot = {
    iso: iso,
    session_date: iso,
    day: String(s.day || "").trim(),
    service: String(s.rosterService || s.activity || "").trim(),
    venue: String(s.venue || "").trim(),
    instructors: String(s.staffId || "").trim(),
    instructor_label: String(s.staffId || "").trim(),
  };
  return portalLeadSlotInScopeForLead(slot, scopes, leadKey);
}

/**
 * Today cards for programme-wide lead days — merge in-scope instructors' session rows.
 * @returns {{ active: boolean, leadKey: string, scopes: object[], sessionsModel: object[], clientNotesById: object }}
 */
export function portalLeadCollectProgrammeWideSessionsModel(iso, profile, authEmail, staffId) {
  const wide = portalLeadProgrammeWideTodayForStaff(staffId, iso, profile, authEmail);
  const empty = {
    active: false,
    leadKey: "",
    scopes: [],
    sessionsModel: [],
    clientNotesById: {},
  };
  if (!wide.active) return empty;
  const day = String(iso || "")
    .trim()
    .slice(0, 10);
  const wd = weekdayFromIso(day);
  if (!wd) return empty;
  const src =
    typeof globalThis !== "undefined" && globalThis.portalResolveStaffDashboardSource
      ? globalThis.portalResolveStaffDashboardSource()
      : typeof globalThis !== "undefined"
        ? globalThis.STAFF_DASHBOARD_SOURCE
        : null;
  const Adapter =
    typeof globalThis !== "undefined" ? globalThis.StaffDashboardSpreadsheetAdapter : null;
  if (!src || !Adapter || typeof Adapter.bootstrap !== "function") return empty;
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  const instructorKeys = Object.create(null);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isPickupRosterClientName(r.client_name)) continue;
    if (!rosterRowAppliesOnIso(rows, r, day, wd)) continue;
    const slot = rosterRowToLeadSlot(r, day, wd);
    if (!portalLeadSlotInScopeForDay(slot, wide.scopes, wide.leadKey, day)) continue;
    instructorKeysFromRosterRaw(r.instructors).forEach(function (k) {
      instructorKeys[k] = true;
    });
  }
  const merged = [];
  const seen = Object.create(null);
  const notes = {};
  Object.keys(instructorKeys).forEach(function (instKey) {
    let boot = null;
    try {
      boot = Adapter.bootstrap({ source: src, staffId: instKey });
    } catch (_) {
      boot = null;
    }
    if (!boot || !Array.isArray(boot.sessionsModel)) return;
    if (boot.clientNotesById && typeof boot.clientNotesById === "object") {
      Object.assign(notes, boot.clientNotesById);
    }
    boot.sessionsModel.forEach(function (s) {
      if (!s) return;
      const rowIso = String(s.session_date || s.sessionDate || "")
        .trim()
        .slice(0, 10);
      if (rowIso !== day) return;
      if (!portalLeadSpreadsheetSessionInScopeForLead(s, day, wide.leadKey, wide.scopes)) return;
      const dk = [
        rowIso,
        String(s.day || "").trim(),
        String(s.start || "").trim(),
        String(s.end || "").trim(),
        String(s.venue || "").trim().toLowerCase(),
        String(s.clientId || "").trim().toLowerCase(),
        String(s.staffId || "").trim().toLowerCase(),
      ].join("\0");
      if (seen[dk]) return;
      seen[dk] = true;
      merged.push(s);
    });
  });
  merged.sort(function (a, b) {
    return String(a.start || "").localeCompare(String(b.start || ""));
  });
  return {
    active: merged.length > 0,
    leadKey: wide.leadKey,
    scopes: wide.scopes,
    sessionsModel: merged,
    clientNotesById: notes,
  };
}
