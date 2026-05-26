/**
 * Programme-lead session overview scope for John & Berta (client-side filters).
 */
import { portalInferStaffKey } from "./auth-handler.js";

const LEAD_OVERVIEW_KEYS = new Set(["berta", "john"]);

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
    serviceKeys: ["multi", "aquatic"],
    venues: ["swimfarm"],
  },
];

const BERTA_SCOPES = [
  {
    id: "wednesday-ma-acton",
    label: "Wednesday — Multi-Activity (Acton)",
    weekdays: ["Wednesday"],
    serviceKeys: ["multi"],
    venues: ["acton"],
  },
  {
    id: "sunday-ma-swimfarm",
    label: "Sunday — Multi-Activity (SwimFarm, with John)",
    weekdays: ["Sunday"],
    serviceKeys: ["multi", "aquatic"],
    venues: ["swimfarm"],
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
  return s;
}

function normVenue(v) {
  return normKey(v).replace(/[^a-z]/g, "");
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function portalCanAccessLeadSessionOverview(profile, authEmail) {
  return LEAD_OVERVIEW_KEYS.has(portalInferStaffKey(profile, authEmail));
}

export function portalLeadSessionScopesForProfile(profile, authEmail) {
  const key = portalInferStaffKey(profile, authEmail);
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

function venueMatches(venueRaw, scope) {
  if (!scope.venues || !scope.venues.length) return true;
  const v = normVenue(venueRaw);
  if (!v) return true;
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

function scopesMatchRow(scopes, iso, serviceRaw, venueRaw) {
  if (!scopes.length) return false;
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    if (!weekdayMatches(iso, scope)) continue;
    if (!serviceMatches(serviceRaw, scope)) continue;
    if (!venueMatches(venueRaw, scope)) continue;
    return true;
  }
  return false;
}

/** Roster slot object from AdminSessionsHub.expandSlotsForDate */
export function portalLeadSlotInScope(slot, scopes) {
  if (!slot || !scopes || !scopes.length) return false;
  const iso = String(slot.iso || slot.session_date || "").slice(0, 10);
  return scopesMatchRow(scopes, iso, slot.service, slot.venue);
}

export function portalLeadFeedbackInScope(fb, scopes) {
  if (!fb || !scopes || !scopes.length) return false;
  const iso = String(fb.session_date || fb.date || "").trim().slice(0, 10);
  const venue = fb.venue || fb.venue_name || "";
  return scopesMatchRow(scopes, iso, fb.service, venue);
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

export function portalLeadSessionScopeFilterFns(scopes) {
  return {
    slotScopeFilter: function (slot) {
      return portalLeadSlotInScope(slot, scopes);
    },
    feedbackRowScopeFilter: function (fb) {
      return portalLeadFeedbackInScope(fb, scopes);
    },
  };
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
