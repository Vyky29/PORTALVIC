/**
 * Programme lead — team on shift (Phase 1: Today strip + Quick menu).
 * Staff dashboard only (Michelle / John / Berta). No worker Term day-off reds.
 */
import {
  portalLeadProgrammeKey,
  portalLeadSessionScopesForProfile,
  portalLeadSlotInScope,
  portalLeadDayUsesProgrammeWideRoster,
  portalLeadProgrammeWideTodayForStaff,
  portalLeadProgrammeLeadWorkingOnIso,
  portalLeadSpreadsheetSessionInScopeForLead,
  portalLeadCollectProgrammeWideSessionsModel,
} from "./portal_lead_session_scope.js?v=20260702-ma-lead-team-absent";

const LEAD_SERVICE_CHANGE_TYPES = new Set([
  "instructor_reassign",
  "client_replace_in_slot",
  "client_absence_announced",
  "slot_close",
  "slot_open",
  "slot_clear_client",
  "session_add",
  "slot_update",
]);
/** Team-shift day cards: operational changes the lead must see (not instructor covers — team bar). */
const LEAD_TEAM_SHIFT_ALERT_TYPES = new Set([
  "client_replace_in_slot",
  "client_absence_announced",
  "slot_close",
  "slot_open",
  "slot_clear_client",
  "session_add",
  "slot_update",
]);
const CHANGE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function normKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekdayFromIso(iso) {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return DOW[d.getDay()] || "";
}

function portalAuthContext() {
  try {
    const box = typeof window !== "undefined" ? window.__PORTAL_SUPABASE__ : null;
    const profile = box && box.staff_profile ? box.staff_profile : null;
    const email = String((box && box.session && box.session.user && box.session.user.email) || "").trim();
    return { profile, email };
  } catch {
    return { profile: null, email: "" };
  }
}

function rosterSource() {
  try {
    return typeof window !== "undefined" ? window.STAFF_DASHBOARD_SOURCE : null;
  } catch {
    return null;
  }
}

/** Same dated sunday overrides as staff_dashboard_spreadsheet_adapter (e.g. BISMARK → JAVI). */
function resolveInstructorsForSessionDate(instructorsRaw, sessionDate, source) {
  const raw = String(instructorsRaw || "").trim();
  const iso = String(sessionDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return raw;
  const overrides = source && source.sundayDateOverrides ? source.sundayDateOverrides : null;
  const day = overrides && overrides[iso] ? overrides[iso] : null;
  const map = day && day.replaceInstructor ? day.replaceInstructor : null;
  if (!map) return raw;
  let out = raw;
  Object.keys(map).forEach(function (fromKey) {
    const to = String(map[fromKey] || "").trim();
    if (!fromKey || !to) return;
    const re = new RegExp(String(fromKey).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, to);
  });
  return out;
}

function staffRoleTrack(staffKey) {
  const k = normKey(staffKey);
  if (!k) return "";
  const src = rosterSource();
  const prof = src && src.staffProfiles ? src.staffProfiles[k] : null;
  return normKey(prof && prof.staffRoleTrack);
}

function teamMemberChipRole(staffKey) {
  const k = normKey(staffKey);
  if (k === "john" || k === "berta" || k === "michelle") return "support-lead";
  const track = staffRoleTrack(k);
  if (track === "swimming") return "swim-instructor";
  if (track === "support" || track === "support_lead") return "support-worker";
  return "default";
}

function teamMemberChipRoleForDay(staffKey, roleOverrides) {
  const k = normKey(staffKey);
  const override = roleOverrides && k ? roleOverrides[k] : "";
  return override || teamMemberChipRole(k);
}

function resolvedInstructorsForRow(row, iso, source) {
  return resolveInstructorsForSessionDate(row && row.instructors, iso, source || rosterSource());
}

function staffOnInScopeRosterRow(staffKey, row, iso, scopes, source) {
  if (!staffKey || !row || !scopes || !scopes.length) return false;
  const slot = rosterRowToSlot(row, iso);
  if (!portalLeadSlotInScope(slot, scopes)) return false;
  const keys = staffKeysFromInstructorLabel(resolvedInstructorsForRow(row, iso, source));
  return keys.indexOf(normKey(staffKey)) >= 0;
}

const PROGRAMME_LEAD_KEYS = new Set(["john", "berta", "michelle"]);

function portalLeadTeamDayKind(ctx, iso) {
  if (!ctx || !iso) return "";
  const wd = weekdayFromIso(iso);
  const leadKey = ctx.leadKey;
  for (let i = 0; i < ctx.scopes.length; i++) {
    const sc = ctx.scopes[i];
    if (!sc.weekdays || sc.weekdays.indexOf(wd) < 0) continue;
    const isMulti = sc.serviceKeys && sc.serviceKeys.indexOf("multi") >= 0;
    const isBespoke = sc.serviceKeys && sc.serviceKeys.indexOf("bespoke") >= 0;
    const venues = sc.venues || [];
    const swimfarm = venues.some(function (v) {
      return normKey(v).indexOf("swimfarm") >= 0;
    });
    const acton = venues.some(function (v) {
      return normKey(v).indexOf("acton") >= 0;
    });
    if (wd === "Sunday" && (sc.leadTeamBanner || sc.programmeWideRoster) && isMulti && swimfarm) return "sunday_ma_swimfarm";
    if (wd === "Wednesday" && leadKey === "berta" && (sc.leadTeamBanner || sc.programmeWideRoster) && isMulti && acton) {
      return "berta_wed_acton_ma";
    }
    if (wd === "Wednesday" && leadKey === "john" && (sc.leadTeamBanner || sc.programmeWideRoster) && acton && (isMulti || sc.serviceKeys.indexOf("aquatic") >= 0)) {
      return "john_wed_acton_ma";
    }
    if (leadKey === "john" && isBespoke && swimfarm && (wd === "Monday" || wd === "Friday")) {
      return "john_bespoke_mwf";
    }
    if (
      leadKey === "michelle" &&
      (sc.leadTeamBanner || sc.programmeWideRoster) &&
      sc.serviceKeys &&
      sc.serviceKeys.indexOf("daycentre") >= 0
    ) {
      return "michelle_day_centre";
    }
  }
  return "";
}

function excludePeerProgrammeLead(keys, leadKey) {
  const peer = leadKey === "john" ? "berta" : leadKey === "berta" ? "john" : "";
  if (!peer) return keys.slice();
  return keys.filter(function (k) {
    return k !== peer;
  });
}

function ensureLeadPresent(keys, leadKey) {
  if (!leadKey) return keys.slice();
  const out = keys.slice();
  if (out.indexOf(leadKey) < 0) out.unshift(leadKey);
  return out;
}

function dedupeKeys(keys) {
  const out = [];
  keys.forEach(function (k) {
    if (k && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}

function filterProgrammeWideTeam(keys, leadKey) {
  let pool = excludePeerProgrammeLead(keys, leadKey);
  return dedupeKeys(
    pool.filter(function (k) {
      return k !== leadKey && !PROGRAMME_LEAD_KEYS.has(k);
    })
  );
}

function filterSundayMaTeam(keys, leadKey) {
  let pool = excludePeerProgrammeLead(keys, leadKey);
  // Show everyone actually on shift in scope — do NOT force a fixed
  // 2-support/3-swim shape. Cover instructors can come from any track (e.g. a
  // support-track worker covering a swim lane), so slicing by role would drop
  // them and leave the team strip short of the full team for the day.
  return dedupeKeys(
    pool.filter(function (k) {
      return k !== leadKey && !PROGRAMME_LEAD_KEYS.has(k);
    })
  );
}

function filterJohnBespokeTeam(keys) {
  const leadKey = "john";
  let pool = excludePeerProgrammeLead(keys, leadKey);
  const supportWorkers = pool.filter(function (k) {
    return k !== leadKey && teamMemberChipRole(k) === "support-worker";
  });
  return dedupeKeys(supportWorkers.slice(0, 2));
}

function filterBertaWedTeam(keys) {
  const leadKey = "berta";
  let pool = excludePeerProgrammeLead(keys, leadKey);
  const others = pool.filter(function (k) {
    return k !== leadKey && !PROGRAMME_LEAD_KEYS.has(k);
  });
  return dedupeKeys(others.slice(0, 3));
}

/** Wed Acton — Luliya, Javier, Youssef (+ roster hits when present). */
function filterJohnWedActonTeam(keys) {
  const leadKey = "john";
  const prefer = ["lulia", "javier", "youssef"];
  let pool = excludePeerProgrammeLead(keys, leadKey);
  const out = [];
  prefer.forEach(function (w) {
    if (pool.indexOf(w) >= 0 && out.indexOf(w) < 0) out.push(w);
  });
  prefer.forEach(function (w) {
    if (out.indexOf(w) < 0 && out.length < 3) out.push(w);
  });
  pool.forEach(function (k) {
    if (out.length >= 3) return;
    if (out.indexOf(k) >= 0 || PROGRAMME_LEAD_KEYS.has(k)) return;
    if (teamMemberChipRole(k) === "swim-instructor") out.push(k);
  });
  return dedupeKeys(out).slice(0, 3);
}

const TEAM_CHIP_ROLE_SORT = {
  "support-lead": 0,
  "support-worker": 1,
  "swim-instructor": 2,
  default: 3,
};

function sortTeamMemberKeys(keys, roleOverrides) {
  return keys.slice().sort(function (a, b) {
    const ra = TEAM_CHIP_ROLE_SORT[teamMemberChipRoleForDay(a, roleOverrides)] ?? TEAM_CHIP_ROLE_SORT.default;
    const rb = TEAM_CHIP_ROLE_SORT[teamMemberChipRoleForDay(b, roleOverrides)] ?? TEAM_CHIP_ROLE_SORT.default;
    if (ra !== rb) return ra - rb;
    return staffDisplayName(a).localeCompare(staffDisplayName(b), "en", { sensitivity: "base" });
  });
}

function applyTeamDayFilter(keys, dayKind, leadKey) {
  if (dayKind === "sunday_ma_swimfarm") return filterSundayMaTeam(keys, leadKey);
  if (dayKind === "john_bespoke_mwf") return filterJohnBespokeTeam(keys);
  if (dayKind === "john_wed_acton_ma") return filterJohnWedActonTeam(keys);
  if (dayKind === "berta_wed_acton_ma") return filterBertaWedTeam(keys);
  if (dayKind === "michelle_day_centre") return filterProgrammeWideTeam(keys, leadKey);
  return keys.slice();
}

function teamProgrammeLabelForDay(scopes, iso) {
  const raw = activeScopeLabelForDay(scopes, iso);
  return String(raw || "")
    .replace(/\s*,\s*with\s+[^,)]+/gi, "")
    .trim();
}

function activeScopeLabelForDay(scopes, iso) {
  const wd = weekdayFromIso(iso);
  for (let i = 0; i < scopes.length; i++) {
    const sc = scopes[i];
    if (sc.weekdays && sc.weekdays.indexOf(wd) >= 0) return String(sc.label || sc.id || "Your programme");
  }
  return "";
}

function collectInScopeMemberKeys(iso, scopes, source) {
  const rows = source && Array.isArray(source.rows) ? source.rows : [];
  const memberKeys = [];
  rows.forEach(function (row) {
    if (!rosterRowMatchesIso(row, iso)) return;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, scopes)) return;
    staffKeysFromInstructorLabel(resolvedInstructorsForRow(row, iso, source)).forEach(function (k) {
      if (k && memberKeys.indexOf(k) < 0) memberKeys.push(k);
    });
  });
  return memberKeys;
}

function applyScheduleOverrideMembers(memberKeys, iso, scopes, source) {
  const coverKeys = [];
  scheduleOverrideRows().forEach(function (ov) {
    if (String(ov.session_date || "").slice(0, 10) !== iso) return;
    if (String(ov.status || "active") !== "active") return;
    if (String(ov.override_type || "").trim() !== "instructor_reassign") return;
    if (!overrideMatchesLeadScopedRoster(ov, iso, scopes, source)) return;
    const pl = parseOverridePayload(ov);
    const anchor = canonicalStaffKey(ov.anchor_staff_id);
    const cover = canonicalStaffKey(pl.covering_staff_id);
    if (anchor) {
      const ix = memberKeys.indexOf(anchor);
      if (ix >= 0) memberKeys.splice(ix, 1);
    }
    if (cover && memberKeys.indexOf(cover) < 0) memberKeys.push(cover);
    if (cover && coverKeys.indexOf(cover) < 0) coverKeys.push(cover);
  });
  return memberKeys.filter(function (k) {
    // A covering instructor added via an override is genuinely on shift even
    // though they are not in any base roster row's instructor label — keep them
    // (otherwise the new cover instructors are dropped from the team strip).
    if (coverKeys.indexOf(k) >= 0) return true;
    const rows = source && Array.isArray(source.rows) ? source.rows : [];
    return rows.some(function (row) {
      return staffOnInScopeRosterRow(k, row, iso, scopes, source);
    });
  });
}

function rosterRowLooksSwimming(row) {
  const haystack = [
    row && row.service,
    row && row.activity,
    row && row.rosterService,
    row && row.service_label,
    row && row.category,
    row && row.venue,
    row && row.rosterArea,
    row && row.area,
  ]
    .map(function (v) {
      return normKey(v);
    })
    .join(" ");
  return /swim|aquatic|pool/.test(haystack);
}

function coverChipRoleOverridesForIso(iso, scopes, source) {
  const out = Object.create(null);
  scheduleOverrideRows().forEach(function (ov) {
    if (String(ov.session_date || "").slice(0, 10) !== iso) return;
    if (String(ov.status || "active") !== "active") return;
    if (String(ov.override_type || "").trim() !== "instructor_reassign") return;
    const pl = parseOverridePayload(ov);
    const cover = canonicalStaffKey(pl.covering_staff_id);
    if (!cover) return;
    const anchor = canonicalStaffKey(ov.anchor_staff_id);
    const matchedRow = matchingLeadScopedRosterRow(ov, iso, scopes, source);
    // A cover should be styled by the slot they are covering, not by their usual
    // staff profile track. Luliya covering Javier/Aurora pool clients on Sunday
    // is therefore a swimming instructor for the team strip.
    if ((anchor && teamMemberChipRole(anchor) === "swim-instructor") || rosterRowLooksSwimming(matchedRow)) {
      out[cover] = "swim-instructor";
    }
  });
  return out;
}

function staffDisplayName(staffKey) {
  const k = normKey(staffKey);
  if (!k) return "";
  const src = rosterSource();
  const prof = src && src.staffProfiles ? src.staffProfiles[k] || src.staffProfiles[staffKey] : null;
  const nm = prof && String(prof.staffName || prof.name || "").trim();
  if (nm) return nm;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function canonicalStaffKey(raw) {
  try {
    if (typeof window !== "undefined" && typeof window.portalCanonicalStaffRosterKey === "function") {
      const c = window.portalCanonicalStaffRosterKey(raw);
      if (c) return normKey(c);
    }
  } catch (_) {}
  return normKey(raw);
}

function instructorTokensFromLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return [];
  const out = [];
  raw.split(/,|\/|&|\band\b/gi).forEach(function (part) {
    const t = String(part || "").trim();
    if (t) out.push(t);
  });
  return out;
}

/** Map roster instructor label token → staff roster key (best effort). */
function staffKeyFromInstructorToken(token) {
  const want = normKey(token);
  if (!want) return "";
  const src = rosterSource();
  const profiles = src && src.staffProfiles ? src.staffProfiles : {};
  const keys = Object.keys(profiles);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = profiles[k];
    if (normKey(k) === want) return normKey(k);
    if (normKey(p && p.staffId) === want) return normKey(k);
    if (normKey(p && p.staffName) === want) return normKey(k);
    const first = normKey(String((p && p.staffName) || "").split(/\s+/)[0]);
    if (first && first === want) return normKey(k);
  }
  return canonicalStaffKey(token);
}

function rosterRowToSlot(row, iso) {
  return {
    iso: iso,
    session_date: iso,
    service: row && row.service,
    venue: row && row.venue,
    instructor_label: row && row.instructors,
    instructors: row && row.instructors,
  };
}

function rosterRowMatchesIso(row, iso) {
  if (!row || !iso) return false;
  try {
    if (typeof window !== "undefined" && typeof window.portalSessionSpreadsheetRowMatchesCalendarDate === "function") {
      const wd = weekdayFromIso(iso);
      return window.portalSessionSpreadsheetRowMatchesCalendarDate(row, iso, wd);
    }
  } catch (_) {}
  const rowIso = String(row.session_date || row.sessionDate || "").trim().slice(0, 10);
  if (rowIso) return rowIso === iso;
  return String(row.day || "").trim() === weekdayFromIso(iso);
}

function staffKeysFromInstructorLabel(label) {
  const keys = [];
  instructorTokensFromLabel(label).forEach(function (tok) {
    const k = staffKeyFromInstructorToken(tok);
    if (k && keys.indexOf(k) < 0) keys.push(k);
  });
  return keys;
}

function parseOverridePayload(row) {
  let pl = row && row.payload;
  if (typeof pl === "string") {
    try {
      pl = JSON.parse(pl);
    } catch (_) {
      pl = null;
    }
  }
  return pl && typeof pl === "object" ? pl : {};
}

function scheduleOverrideRows() {
  try {
    return Array.isArray(window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__) ? window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__ : [];
  } catch {
    return [];
  }
}

function todayIsoYmd() {
  try {
    if (typeof window !== "undefined" && typeof window.portalSelectedViewCalendarIsoYmd === "function") {
      const sel = window.portalSelectedViewCalendarIsoYmd();
      if (sel) return sel;
    }
    if (typeof window !== "undefined" && typeof window.portalIsoYmdFromDate === "function") {
      return window.portalIsoYmdFromDate(new Date());
    }
  } catch (_) {}
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

export function portalLeadTeamShiftContext() {
  const { profile, email } = portalAuthContext();
  const leadKey = portalLeadProgrammeKey(profile, email);
  if (!leadKey) return null;
  const scopes = portalLeadSessionScopesForProfile(profile, email);
  if (!scopes.length) return null;
  return { profile, email, leadKey, scopes };
}

export function portalLeadTeamOnShiftForIso(iso, ctx) {
  ctx = ctx || portalLeadTeamShiftContext();
  if (!ctx || !iso) return null;

  const dayKind = portalLeadTeamDayKind(ctx, iso);
  if (!dayKind) return null;

  const src = rosterSource();
  if (!portalLeadProgrammeLeadWorkingOnIso(ctx.leadKey, iso, ctx.scopes)) return null;

  let memberKeys = collectInScopeMemberKeys(iso, ctx.scopes, src);
  memberKeys = applyScheduleOverrideMembers(memberKeys, iso, ctx.scopes, src);
  const roleOverrides = coverChipRoleOverridesForIso(iso, ctx.scopes, src);
  memberKeys = applyTeamDayFilter(memberKeys, dayKind, ctx.leadKey);
  memberKeys = memberKeys.filter(function (k) {
    return k !== ctx.leadKey && !PROGRAMME_LEAD_KEYS.has(k);
  });

  memberKeys = sortTeamMemberKeys(memberKeys, roleOverrides);

  return {
    iso: iso,
    programmeLabel: teamProgrammeLabelForDay(ctx.scopes, iso),
    members: memberKeys.map(function (k) {
      return { key: k, name: staffDisplayName(k), chipRole: teamMemberChipRoleForDay(k, roleOverrides) };
    }),
    absents: collectLeadScopeAbsentsForIso(iso, ctx),
  };
}

function leadAbsenceClientName(ov, pl) {
  pl = pl || parseOverridePayload(ov);
  const named =
    String(pl.client_name || pl.client_display_name || pl.participant_name || pl.to_client_name || "").trim();
  if (named) return named;
  const slug = String(ov.anchor_client_id || "").trim();
  if (!slug) return "";
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    })
    .join(" ");
}

/** Participants marked absent that day within the lead's programme scope (red chips). */
function collectLeadScopeAbsentsForIso(iso, ctx) {
  const out = [];
  const seen = Object.create(null);
  scheduleOverrideRows().forEach(function (ov) {
    if (String(ov.override_type || "").trim() !== "client_absence_announced") return;
    if (String(ov.status || "active") !== "active") return;
    if (String(ov.session_date || "").slice(0, 10) !== iso) return;
    if (!String(ov.anchor_client_id || "").trim()) return;
    if (!portalLeadOverrideRowAppliesToLeadScope(ov, ctx)) return;
    const name = leadAbsenceClientName(ov);
    if (!name) return;
    const key = normKey(name);
    if (seen[key]) return;
    seen[key] = true;
    out.push({ name: name });
  });
  out.sort(function (a, b) {
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
  return out;
}

function normVenue(v) {
  return normKey(v).replace(/[^a-z]/g, "");
}

function openSlotClientSlug(slug) {
  const s = normKey(slug);
  return !s || s === "available" || s === "closed" || s === "noclient" || s === "no_client";
}

function rosterClientIdsMatch(a, b) {
  try {
    if (typeof window !== "undefined" && typeof window.portalRosterClientIdsMatch === "function") {
      return window.portalRosterClientIdsMatch(a, b);
    }
  } catch (_) {}
  return normKey(a) === normKey(b);
}

/** True when the programme lead is on the roster that day within their service scope. */
function leadIsOnRosterForDay(leadKey, iso, scopes, source) {
  const lk = normKey(leadKey);
  if (!lk) return false;
  const src = source || rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  return rows.some(function (row) {
    if (!rosterRowMatchesIso(row, iso)) return false;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, scopes)) return false;
    const keys = staffKeysFromInstructorLabel(resolvedInstructorsForRow(row, iso, src));
    return keys.indexOf(lk) >= 0;
  });
}

/** Override anchor must match a roster row in the lead's programme (service/venue/day), not another service. */
function matchingLeadScopedRosterRow(ov, iso, scopes, source) {
  const anchor = canonicalStaffKey(ov.anchor_staff_id);
  if (!anchor || !scopes.length) return null;
  const wantVenue = normVenue(ov.anchor_venue);
  const wantClient = String(ov.anchor_client_id || "").trim();
  const openClient = openSlotClientSlug(wantClient);
  const src = source || rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!rosterRowMatchesIso(row, iso)) continue;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, scopes)) continue;
    // Match the override anchor against BOTH the resolved instructor (after any
    // Sunday replaceInstructor, e.g. Javier→Luliya) AND the original roster
    // instructor. An absence/make-up is recorded against the originally rostered
    // instructor (Javier); without the raw label the cover (Luliya) would hide
    // it from the programme lead.
    const resolvedKeys = staffKeysFromInstructorLabel(resolvedInstructorsForRow(row, iso, src));
    const rawKeys = staffKeysFromInstructorLabel(row && row.instructors);
    if (resolvedKeys.indexOf(anchor) < 0 && rawKeys.indexOf(anchor) < 0) continue;
    if (wantVenue && normVenue(row.venue) !== wantVenue) continue;
    if (!openClient && wantClient && !rosterClientIdsMatch(row.client_name || row.clientId, wantClient)) {
      continue;
    }
    return row;
  }
  return null;
}

function overrideMatchesLeadScopedRoster(ov, iso, scopes, source) {
  return !!matchingLeadScopedRosterRow(ov, iso, scopes, source);
}

function overrideAnchorOnInScopeRow(ov, scopes, iso) {
  if (!ov || !scopes.length) return false;
  const src = rosterSource();
  return overrideMatchesLeadScopedRoster(ov, iso, scopes, src);
}

function leadOverrideChangeTitle(ov, pl) {
  const t = String(ov.override_type || "").trim();
  pl = pl || parseOverridePayload(ov);
  const client =
    String(pl.client_name || pl.client_display_name || pl.participant_name || "").trim() ||
    String(ov.anchor_client_id || "").trim();
  if (t === "instructor_reassign") {
    const anchorName =
      String(pl.from_staff_name || pl.original_staff_name || "").trim() ||
      staffDisplayName(ov.anchor_staff_id);
    const coverName =
      String(pl.covering_staff_name || pl.to_staff_name || "").trim() ||
      staffDisplayName(pl.covering_staff_id);
    if (anchorName && coverName) return anchorName + " off · " + coverName + " covering";
    return "Team shift change";
  }
  if (t === "client_absence_announced") {
    return client ? client + " absent" : "Participant absent";
  }
  if (t === "client_replace_in_slot") {
    return client ? client + " session change" : "Make-up / session change";
  }
  if (t === "slot_close") return client ? client + " session cancelled" : "Session cancelled";
  if (t === "slot_open") return "Slot reopened";
  if (t === "slot_clear_client") return client ? client + " cleared from slot" : "Client cleared from slot";
  if (t === "session_add") {
    const kind = String(pl.kind || "").trim().toLowerCase();
    if (kind === "shadowing") return "Shadowing added";
    if (kind === "training") return "Training added";
    if (kind === "meeting") return "Meeting added";
    return "New session added";
  }
  if (t === "slot_update") return "Schedule update";
  return "Programme schedule change";
}

/** Programme lead: override in a service/day they lead (not only their own anchor row). */
export function portalLeadOverrideRowAppliesToLeadScope(row, ctx) {
  ctx = ctx || portalLeadTeamShiftContext();
  if (!ctx || !row) return false;
  const t = String(row.override_type || "").trim();
  if (!t || t === "override_void") return false;
  if (!LEAD_SERVICE_CHANGE_TYPES.has(t)) return false;
  if (String(row.status || "active") !== "active") return false;
  const iso = String(row.session_date || "").slice(0, 10);
  if (!iso) return false;
  const wd = weekdayFromIso(iso);
  const hasScopeDay = ctx.scopes.some(function (sc) {
    return sc.weekdays && sc.weekdays.indexOf(wd) >= 0;
  });
  if (!hasScopeDay) return false;
  const me = ctx.leadKey;
  const anchor = canonicalStaffKey(row.anchor_staff_id);
  if (t === "instructor_reassign") {
    const pl = parseOverridePayload(row);
    const cover = canonicalStaffKey(pl.covering_staff_id);
    if (anchor === me || cover === me) return false;
  } else if (anchor === me) {
    return false;
  }
  return overrideMatchesLeadScopedRoster(row, iso, ctx.scopes, rosterSource());
}

export function portalLeadTeamShiftDayDismissKey(iso) {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return "lead-team-shift-day:" + s;
}

function leadTeamShiftDismissedKeys() {
  try {
    if (typeof window !== "undefined" && typeof window.portalQuickMenuLoadDismissedOverrideKeys === "function") {
      return window.portalQuickMenuLoadDismissedOverrideKeys();
    }
  } catch (_) {}
  return [];
}

function isLeadTeamShiftDayDismissed(iso) {
  const key = portalLeadTeamShiftDayDismissKey(iso);
  if (!key) return false;
  return leadTeamShiftDismissedKeys().indexOf(key) >= 0;
}

export function portalLeadTeamShiftChanges(ctx, opts) {
  ctx = ctx || portalLeadTeamShiftContext();
  if (!ctx) return [];
  opts = opts || {};
  const now = Date.now();
  const minCreated = now - (opts.lookbackMs != null ? opts.lookbackMs : CHANGE_LOOKBACK_MS);
  const out = [];

  const seenOverrideIds = new Set();

  scheduleOverrideRows().forEach(function (ov) {
    const t = String(ov.override_type || "").trim();
    if (!LEAD_TEAM_SHIFT_ALERT_TYPES.has(t)) return;
    if (String(ov.status || "active") !== "active") return;
    const iso = String(ov.session_date || "").slice(0, 10);
    if (!iso) return;
    if (isLeadTeamShiftDayDismissed(iso)) return;
    const ovId = String(ov.id || "").trim();
    if (ovId && seenOverrideIds.has(ovId)) return;
    if (!portalLeadOverrideRowAppliesToLeadScope(ov, ctx)) return;
    if (ovId) seenOverrideIds.add(ovId);
    const created = ov.created_at ? new Date(ov.created_at).getTime() : 0;
    if (created && created < minCreated) return;
    const pl = parseOverridePayload(ov);
    const wd = weekdayFromIso(iso);
    let dateLabel = wd || iso;
    try {
      const d = new Date(iso + "T12:00:00");
      if (!isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      }
    } catch (_) {}

    out.push({
      id: String(ov.id || iso + "|" + t + "|" + ov.anchor_staff_id),
      iso: iso,
      type: t,
      title: leadOverrideChangeTitle(ov, pl),
      sub: dateLabel,
      createdAt: ov.created_at || "",
    });
  });

  out.sort(function (a, b) {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return out;
}

function renderTodayStrip(team) {
  if (!team || !team.members.length) {
    return (
      '<div class="portal-lead-team-today portal-lead-team-today--empty" role="status">' +
      '<div class="portal-lead-team-today__head">' +
      '<span class="portal-lead-team-today__title">Team on shift today</span>' +
      "</div>" +
      '<p class="portal-lead-team-today__empty">No roster rows in scope for today.</p></div>'
    );
  }
  const chips = team.members
    .map(function (m) {
      const role = m.chipRole && m.chipRole !== "default" ? m.chipRole : "";
      const roleClass = role ? " portal-lead-team-today__chip--" + role : "";
      return (
        '<span class="portal-lead-team-today__chip' +
        roleClass +
        '">' +
        escHtml(m.name || m.key) +
        "</span>"
      );
    })
    .join("");
  const absents = Array.isArray(team.absents) ? team.absents : [];
  let absentBlock = "";
  if (absents.length) {
    const absentChips = absents
      .map(function (a) {
        return (
          '<span class="portal-lead-team-today__chip portal-lead-team-today__chip--absent">' +
          escHtml(a.name) +
          "</span>"
        );
      })
      .join("");
    absentBlock =
      '<div class="portal-lead-team-today__absents" aria-label="Participants absent today">' +
      '<span class="portal-lead-team-today__absents-label">Absent</span>' +
      '<div class="portal-lead-team-today__absent-chips">' +
      absentChips +
      "</div></div>";
  }
  return (
    '<button type="button" class="portal-lead-team-today" data-action="open-lead-team-roster-table" data-lead-team-iso="' +
    escHtml(team.iso || "") +
    '" aria-label="Team on shift today — tap to see who each instructor is with">' +
    '<div class="portal-lead-team-today__head">' +
    '<span class="portal-lead-team-today__title">Team on shift today</span>' +
    '<span class="portal-lead-team-today__hint">Tap to view</span>' +
    "</div>" +
    '<div class="portal-lead-team-today__chips">' +
    chips +
    "</div>" +
    absentBlock +
    "</button>"
  );
}

function parseSlotStartMinutes(timeSlot) {
  const m = String(timeSlot || "")
    .toLowerCase()
    .match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return 9999;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 7) h += 12;
  return h * 60 + mi;
}

function parseSlotEndMinutes(timeSlot) {
  const parts = String(timeSlot || "")
    .toLowerCase()
    .split(/\s+to\s+/);
  if (parts.length < 2) return parseSlotStartMinutes(timeSlot);
  return parseSlotStartMinutes(parts[1]);
}

function slotDurationMinutes(timeSlot) {
  const a = parseSlotStartMinutes(timeSlot);
  const b = parseSlotEndMinutes(timeSlot);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return b - a;
}

function isDutyClientName(name) {
  const n = normKey(name);
  return (
    !n ||
    n === "home" ||
    n === "manager" ||
    n === "closed" ||
    n === "available" ||
    n === "noclient" ||
    n === "shadowing" ||
    n === "noparticipant"
  );
}

/** Display labels for lead team board (Hub Room → Day Centre, etc.). */
function leadTeamAreaLabel(area, service, client) {
  const a = String(area || "").trim();
  const low = a.toLowerCase();
  const svc = String(service || "").toLowerCase();
  const c = normKey(client);
  if (/big\s*pool/.test(low)) return "Big Pool";
  if (/small\s*pool/.test(low)) return "Small Pool";
  if (/teaching\s*pool|lane/.test(low)) return "Pools";
  if (c === "acat" && (/hub/.test(low) || /day\s*centre/.test(svc))) return "Pools";
  if (/hub|day\s*centre|manager/.test(low) || /day\s*centre/.test(svc)) return "Day Centre";
  if (/pool/.test(low)) return "Pools";
  return a || (/day\s*centre/.test(svc) ? "Day Centre" : "");
}

const LEAD_TEAM_COMBINED_SEGMENTS = {
  "fadi|12.30to3": [
    { time_slot: "12.30 to 1", area: "Big Pool" },
    { time_slot: "1 to 3", area: "Day Centre" },
  ],
  "ikram|11to4": [
    { time_slot: "11 to 12", area: "Day Centre" },
    { time_slot: "12 to 1", area: "Big Pool" },
    { time_slot: "1 to 4", area: "Day Centre" },
  ],
  "ikram|11to3": [
    { time_slot: "11 to 12", area: "Day Centre" },
    { time_slot: "12 to 1", area: "Big Pool" },
    { time_slot: "1 to 3", area: "Day Centre" },
  ],
  "emanuel|11to4": [
    { time_slot: "11 to 12", area: "Day Centre" },
    { time_slot: "12 to 1", area: "Big Pool" },
    { time_slot: "1 to 4", area: "Day Centre" },
  ],
  "emanuel|11to1": [
    { time_slot: "11 to 12", area: "Day Centre" },
    { time_slot: "12 to 1", area: "Big Pool" },
  ],
  "timi|11to1": [
    { time_slot: "11 to 12", area: "Day Centre" },
    { time_slot: "12 to 12.30", area: "Small Pool" },
    { time_slot: "12.30 to 1", area: "Day Centre" },
  ],
};

function leadTeamSynthesizeSegments(client, service, timeSlot, dayWord, rawSegments) {
  if (Array.isArray(rawSegments) && rawSegments.length) {
    return rawSegments.map(function (s) {
      return {
        time: String(s.time_slot || s.time || "").trim(),
        area: leadTeamAreaLabel(s.area || s.pool_note, service, client),
      };
    }).filter(function (s) {
      return s.time;
    });
  }
  const svc = String(service || "").trim().toLowerCase();
  if (svc !== "day centre") return null;
  const slot = String(timeSlot || "").replace(/\s+/g, "").toLowerCase();
  const name = String(client || "").trim().toLowerCase();
  const key = name + "|" + slot;
  if (key === "ikram|11to4" && String(dayWord || "").toLowerCase() === "tuesday") return null;
  if (key === "fadi|12.30to3") {
    const d = String(dayWord || "").toLowerCase();
    if (d === "tuesday" || d === "thursday") return null;
  }
  const hit = LEAD_TEAM_COMBINED_SEGMENTS[key];
  if (!hit) return null;
  return hit.map(function (s) {
    return {
      time: s.time_slot,
      area: leadTeamAreaLabel(s.area, service, client),
    };
  });
}

function formatLeadTeamTimeCompact(timeSlot) {
  return String(timeSlot || "")
    .replace(/\s+to\s+/gi, "-")
    .replace(/\s+/g, "");
}

/**
 * One column per instructor on shift: each client stacked with time/area lines.
 * Prefers each worker's own roster column over co-listed duplicates.
 */
export function portalLeadTeamRosterTableModel(iso, ctx) {
  ctx = ctx || portalLeadTeamShiftContext();
  const team = portalLeadTeamOnShiftForIso(iso, ctx);
  if (!team) return null;
  const leadKey = ctx && ctx.leadKey ? normKey(ctx.leadKey) : "";
  if (!team.members.length && !leadKey) return null;
  const src = rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  const dayWord = weekdayFromIso(iso);
  const byStaff = Object.create(null);

  team.members.forEach(function (m) {
    byStaff[normKey(m.key)] = [];
  });
  // Viewing programme lead (e.g. Michelle) — always a column, even with no clients.
  if (leadKey && !byStaff[leadKey]) byStaff[leadKey] = [];

  rows.forEach(function (row) {
    if (!rosterRowMatchesIso(row, iso)) return;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, ctx.scopes)) return;
    const client = String(row.client_name || "").trim();
    if (isDutyClientName(client)) return;
    const time = String(row.time_slot || "").trim();
    if (!time) return;
    const instructorKeys = staffKeysFromInstructorLabel(
      resolvedInstructorsForRow(row, iso, src)
    );
    if (!instructorKeys.length) return;
    const ownOnly = instructorKeys.length === 1;
    instructorKeys.forEach(function (ik) {
      const k = normKey(ik);
      if (!byStaff[k]) return;
      const entry = {
        client: client,
        time: time,
        area: String(row.area || row.pool_note || "").trim(),
        service: String(row.service || "").trim(),
        startMin: parseSlotStartMinutes(time),
        duration: slotDurationMinutes(time),
        ownOnly: ownOnly,
        segments: leadTeamSynthesizeSegments(
          client,
          row.service,
          time,
          dayWord,
          row.segments
        ),
      };
      const existingIdx = byStaff[k].findIndex(function (x) {
        return normKey(x.client) === normKey(client);
      });
      if (existingIdx < 0) {
        byStaff[k].push(entry);
        return;
      }
      const prev = byStaff[k][existingIdx];
      // Prefer the worker's own column slot over a co-listed peer row; then widest window.
      const take =
        (entry.ownOnly && !prev.ownOnly) ||
        (entry.ownOnly === prev.ownOnly && entry.duration > prev.duration) ||
        (entry.ownOnly === prev.ownOnly &&
          entry.duration === prev.duration &&
          entry.startMin < prev.startMin);
      if (take) byStaff[k][existingIdx] = entry;
    });
  });

  let members = team.members.filter(function (m) {
    const k = normKey(m.key);
    if (leadKey && k === leadKey) return false;
    return (byStaff[k] || []).length > 0;
  });

  if (leadKey) {
    members.unshift({
      key: leadKey,
      name: staffDisplayName(leadKey),
      chipRole: "lead",
      isViewerLead: true,
    });
  }

  members.forEach(function (m) {
    const k = normKey(m.key);
    (byStaff[k] || []).sort(function (a, b) {
      return a.startMin - b.startMin || a.client.localeCompare(b.client);
    });
  });

  return {
    iso: team.iso,
    programmeLabel: team.programmeLabel || "",
    members: members,
    byStaff: byStaff,
    viewerLeadKey: leadKey,
  };
}

function leadTeamStaffAvatarHtml(staffKey, displayName) {
  try {
    if (typeof window !== "undefined" && typeof window.portalStaffAvatarInnerHtml === "function") {
      return window.portalStaffAvatarInnerHtml(staffKey, {
        displayName: displayName || staffKey,
        className:
          "portal-roster-avatar portal-roster-avatar--staff portal-lead-team-roster__avatar",
        esc: escHtml,
      });
    }
  } catch (_) {}
  const initials = String(displayName || staffKey || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(function (p) {
      return p.charAt(0).toUpperCase();
    })
    .join("");
  return (
    '<span class="portal-roster-avatar portal-roster-avatar--staff portal-lead-team-roster__avatar" aria-hidden="true">' +
    escHtml(initials || "?") +
    "</span>"
  );
}

function renderLeadTeamRosterTableHtml(model) {
  if (!model || !model.members.length) {
    return '<p class="portal-lead-team-roster__empty">No team roster to show for today.</p>';
  }
  const cols = model.members
    .map(function (m) {
      const k = normKey(m.key);
      const name = m.name || m.key;
      const isViewer = !!m.isViewerLead;
      const clients = (model.byStaff[k] || [])
        .map(function (h) {
          const segs =
            Array.isArray(h.segments) && h.segments.length
              ? h.segments
              : [
                  {
                    time: h.time,
                    area: leadTeamAreaLabel(h.area, h.service, h.client),
                  },
                ];
          const lines = segs
            .map(function (s) {
              const t = formatLeadTeamTimeCompact(s.time);
              const area = s.area ? " " + escHtml(String(s.area).toUpperCase()) : "";
              return (
                '<div class="portal-lead-team-roster__line">' +
                escHtml(t) +
                area +
                "</div>"
              );
            })
            .join("");
          return (
            '<div class="portal-lead-team-roster__client">' +
            '<div class="portal-lead-team-roster__client-name">' +
            escHtml(h.client) +
            "</div>" +
            lines +
            "</div>"
          );
        })
        .join("");
      const blankLabel = isViewer ? "Lead" : "—";
      return (
        '<section class="portal-lead-team-roster__col' +
        (isViewer ? " portal-lead-team-roster__col--viewer" : "") +
        '" aria-label="' +
        escHtml(name) +
        '">' +
        '<h4 class="portal-lead-team-roster__col-head">' +
        leadTeamStaffAvatarHtml(k, name) +
        '<span class="portal-lead-team-roster__col-name">' +
        escHtml(name) +
        "</span>" +
        "</h4>" +
        '<div class="portal-lead-team-roster__col-body">' +
        (clients ||
          '<p class="portal-lead-team-roster__blank">' + escHtml(blankLabel) + "</p>") +
        "</div></section>"
      );
    })
    .join("");

  return (
    '<div class="portal-lead-team-roster__board" role="list">' + cols + "</div>"
  );
}

export function portalOpenLeadTeamRosterTable(iso) {
  try {
    if (typeof window === "undefined") return;
    const ctx = portalLeadTeamShiftContext();
    const day = String(iso || todayIsoYmd() || "").slice(0, 10);
    const model = portalLeadTeamRosterTableModel(day, ctx);
    const sheet = document.getElementById("portalLeadTeamRosterSheet");
    const body = document.getElementById("portalLeadTeamRosterBody");
    const title = document.getElementById("portalLeadTeamRosterTitle");
    const sub = document.getElementById("portalLeadTeamRosterSub");
    if (!sheet || !body) return;
    if (title) title.textContent = "Team on shift";
    if (sub) {
      let label = dayCardDateLabel(day);
      if (model && model.programmeLabel) label += " · " + model.programmeLabel;
      sub.textContent = label;
    }
    body.innerHTML = renderLeadTeamRosterTableHtml(model);
    if (typeof window.openSheet === "function") {
      window.openSheet("portalLeadTeamRosterSheet");
    } else {
      sheet.classList.add("open");
      sheet.setAttribute("aria-hidden", "false");
    }
  } catch (e) {
    try {
      console.warn("[portal] open lead team roster table", e);
    } catch (_) {}
  }
}

function dayCardDateLabel(iso) {
  try {
    const d = new Date(iso + "T12:00:00");
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    }
  } catch (_) {}
  return weekdayFromIso(iso) || iso;
}

/**
 * One card per DAY (not per change): says which day has team changes and, when
 * tapped, navigates to that day's detail card via the shared override handler.
 */
function renderQuickMenuChanges(changes) {
  if (!changes.length) return "";
  const calIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

  const byIso = {};
  const order = [];
  changes.forEach(function (ch) {
    const iso = String(ch.iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (isLeadTeamShiftDayDismissed(iso)) return;
    if (!byIso[iso]) {
      byIso[iso] = { iso: iso, count: 0 };
      order.push(iso);
    }
    byIso[iso].count += 1;
  });
  order.sort();

  const btns = order
    .slice(0, 14)
    .map(function (iso) {
      const day = byIso[iso];
      const title = escHtml(dayCardDateLabel(iso));
      const countLabel = day.count > 1 ? day.count + " changes" : "1 change";
      const subText = countLabel + " · tap to view";
      const dismissKey = portalLeadTeamShiftDayDismissKey(iso);
      const sub = '<span class="menu-btn-sub">' + escHtml(subText) + "</span>";
      return (
        '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-lead-team-shift menu-btn--portal-pulse"' +
        ' data-action="open-roster-override-attention" data-portal-override-id="' +
        escHtml(dismissKey) +
        '" data-portal-override-nav-iso="' +
        escHtml(iso) +
        '" aria-label="Team changes on ' +
        title +
        '">' +
        '<div class="menu-btn-icon" aria-hidden="true">' +
        calIcon +
        "</div>" +
        '<div class="menu-btn-copy"><strong>' +
        title +
        " — schedule changes</strong>" +
        sub +
        "</div>" +
        '<span class="menu-btn-chev" aria-hidden="true">›</span></button>'
      );
    })
    .join("");
  return '<div class="portal-lead-team-qm-stack" role="group" aria-label="Team shift changes">' + btns + "</div>";
}

export function portalSyncLeadTeamShiftUi() {
  try {
    if (typeof window === "undefined") return;
    const path = String((window.location && window.location.pathname) || "").toLowerCase();
    if (path.indexOf("staff_dashboard") < 0) return;

    const todayHost = document.getElementById("portalLeadTeamTodayHost");
    const qmHost = document.getElementById("portalLeadTeamShiftQuickHost");
    const qmHeading = document.getElementById("portalLeadTeamShiftHeading");
    const ctx = portalLeadTeamShiftContext();
    if (!ctx) {
      if (todayHost) {
        todayHost.hidden = true;
        todayHost.innerHTML = "";
      }
      if (qmHost) {
        qmHost.hidden = true;
        qmHost.innerHTML = "";
      }
      if (qmHeading) qmHeading.hidden = true;
      return;
    }

    const iso = todayIsoYmd();
    const team = portalLeadTeamOnShiftForIso(iso, ctx);
    const showToday = !!team;

    if (todayHost) {
      if (showToday) {
        todayHost.innerHTML = renderTodayStrip(team);
        todayHost.hidden = false;
      } else {
        todayHost.innerHTML = "";
        todayHost.hidden = true;
      }
    }

    const changes = portalLeadTeamShiftChanges(ctx);
    const qmHtml = renderQuickMenuChanges(changes);
    if (qmHost) {
      qmHost.innerHTML = qmHtml;
      qmHost.hidden = !qmHtml;
    }
    if (qmHeading) qmHeading.hidden = !qmHtml;
    if (typeof window.portalRefreshPendingOverrideDaysCache === "function") {
      window.portalRefreshPendingOverrideDaysCache();
    }
    if (typeof window.portalRefreshScheduleOverrideDayChrome === "function") {
      window.portalRefreshScheduleOverrideDayChrome({ force: true });
    }
  } catch (e) {
    try {
      console.warn("[portal] lead team shift sync", e);
    } catch (_) {}
  }
}

if (typeof window !== "undefined") {
  window.portalSyncLeadTeamShiftUi = portalSyncLeadTeamShiftUi;
  window.portalLeadTeamShiftContext = portalLeadTeamShiftContext;
  window.portalLeadTeamOnShiftForIso = portalLeadTeamOnShiftForIso;
  window.portalLeadTeamShiftChanges = portalLeadTeamShiftChanges;
  window.portalLeadTeamShiftDayDismissKey = portalLeadTeamShiftDayDismissKey;
  window.portalLeadTeamShiftDayDismissed = isLeadTeamShiftDayDismissed;
  window.portalLeadOverrideRowAppliesToLeadScope = portalLeadOverrideRowAppliesToLeadScope;
  window.portalLeadProgrammeWideTodayForStaff = portalLeadProgrammeWideTodayForStaff;
  window.portalLeadSpreadsheetSessionInScopeForLead = portalLeadSpreadsheetSessionInScopeForLead;
  window.portalLeadCollectProgrammeWideSessionsModel = portalLeadCollectProgrammeWideSessionsModel;
  window.portalLeadTeamRosterTableModel = portalLeadTeamRosterTableModel;
  window.portalOpenLeadTeamRosterTable = portalOpenLeadTeamRosterTable;
  try{ window.dispatchEvent(new CustomEvent('portal:lead-programme-wide-ready')); }catch(_){}
}
