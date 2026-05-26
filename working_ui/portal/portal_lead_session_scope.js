/**
 * Programme-lead session overview scope for John & Berta (client-side filters).
 */
import { portalInferStaffKey } from "./auth-handler.js";

const LEAD_OVERVIEW_KEYS = new Set(["berta", "john"]);

/** Auth email → programme lead key (wins over staff_profiles.username e.g. stf012). */
const LEAD_PROGRAMME_EMAIL_TO_KEY = {
  "johnnyosti37@gmail.com": "john",
  "b.traperocasado@gmail.com": "berta",
  "stf006@staff.import.pending": "john",
  "stf012@staff.import.pending": "berta",
};

/**
 * Programme lead key for John/Berta session overview (not generic portalInferStaffKey).
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 * @returns {"john"|"berta"|""}
 */
export function portalLeadProgrammeKey(profile, authEmail) {
  const em = String(authEmail || "")
    .trim()
    .toLowerCase();
  if (em && LEAD_PROGRAMME_EMAIL_TO_KEY[em]) return LEAD_PROGRAMME_EMAIL_TO_KEY[em];
  const inferred = portalInferStaffKey(profile, authEmail);
  return LEAD_OVERVIEW_KEYS.has(inferred) ? inferred : "";
}

const JOHN_SCOPES = [
  {
    id: "bespoke-mwf",
    label: "Mon / Wed / Fri — Bespoke Programme (SwimFarm)",
    weekdays: ["Monday", "Wednesday", "Friday"],
    serviceKeys: ["bespoke"],
    venues: ["swimfarm"],
  },
  {
    id: "sunday-ma-swimfarm",
    label: "Sunday — Multi-Activity (SwimFarm, with Berta)",
    weekdays: ["Sunday"],
    serviceKeys: ["multi"],
    venues: ["swimfarm"],
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
    label: "Sunday — Multi-Activity (SwimFarm, with John)",
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
  if (s.indexOf("bespoke") >= 0) return "bespoke";
  if (s.indexOf("multi") >= 0) return "multi";
  if (s.indexOf("aquatic") >= 0) return "aquatic";
  if (s.indexOf("climb") >= 0) return "climbing";
  return s;
}

function serviceExcludedForLeadOverview(serviceRaw) {
  const sk = normService(serviceRaw);
  return sk === "climbing" || sk === "aquatic";
}

function normVenue(v) {
  return normKey(v).replace(/[^a-z]/g, "");
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Club closed (no sessions) — show on lead week picker in red. */
const PORTAL_LEAD_CLOSED_RANGES = [{ from: "2026-05-23", to: "2026-05-31" }];

export function portalLeadDayIsClubClosed(iso) {
  const d = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  for (let i = 0; i < PORTAL_LEAD_CLOSED_RANGES.length; i++) {
    const r = PORTAL_LEAD_CLOSED_RANGES[i];
    if (d >= r.from && d <= r.to) return true;
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

  const unitDone = (u) =>
    (typeof hub.feedbackUnitComplete === "function" && hub.feedbackUnitComplete(u)) ||
    (typeof hub.feedbackUnitAbsent === "function" && hub.feedbackUnitAbsent(u));

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
  const total = clients.size * 2;
  let done = 0;
  units.forEach((u) => {
    if (unitDone(u)) done += 1;
  });
  if (total > 0) done = Math.min(done, total);
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

function statusRowDone(st) {
  if (!st) return false;
  if (String(st.overviewStatus || "").trim().toLowerCase() === "absent") return true;
  if (st.feedbackComplete === true) return true;
  if (String(st.overviewStatus || "").trim().toLowerCase() === "feedback_submitted") {
    return true;
  }
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
    if (d === day) out.push(row);
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
