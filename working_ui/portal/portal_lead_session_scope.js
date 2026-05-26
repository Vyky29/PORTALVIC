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
    serviceKeys: ["multi"],
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
    serviceKeys: ["multi"],
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
