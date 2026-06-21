/**
 * Programme lead — team on shift (Phase 1: Today strip + Quick menu).
 * Staff dashboard only (Michelle / John / Berta). No worker Term day-off reds.
 */
import {
  portalLeadProgrammeKey,
  portalLeadSessionScopesForProfile,
  portalLeadSlotInScope,
  portalLeadDayUsesProgrammeWideRoster,
} from "./portal_lead_session_scope.js";

const TEAM_SHIFT_CHANGE_TYPES = new Set(["instructor_reassign"]);
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
    if (wd === "Sunday" && sc.programmeWideRoster && isMulti && swimfarm) return "sunday_ma_swimfarm";
    if (wd === "Wednesday" && leadKey === "berta" && sc.programmeWideRoster && isMulti && acton) {
      return "berta_wed_acton_ma";
    }
    if (leadKey === "john" && isBespoke && swimfarm && (wd === "Monday" || wd === "Wednesday" || wd === "Friday")) {
      return "john_bespoke_mwf";
    }
    if (leadKey === "michelle" && sc.programmeWideRoster && sc.serviceKeys && sc.serviceKeys.indexOf("daycentre") >= 0) {
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
  const supportWorkers = pool.filter(function (k) {
    return k !== leadKey && teamMemberChipRole(k) === "support-worker";
  });
  const swimInstructors = pool.filter(function (k) {
    return k !== leadKey && teamMemberChipRole(k) === "swim-instructor";
  });
  return dedupeKeys(supportWorkers.slice(0, 2).concat(swimInstructors.slice(0, 3)));
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

const TEAM_CHIP_ROLE_SORT = {
  "support-lead": 0,
  "support-worker": 1,
  "swim-instructor": 2,
  default: 3,
};

function sortTeamMemberKeys(keys) {
  return keys.slice().sort(function (a, b) {
    const ra = TEAM_CHIP_ROLE_SORT[teamMemberChipRole(a)] ?? TEAM_CHIP_ROLE_SORT.default;
    const rb = TEAM_CHIP_ROLE_SORT[teamMemberChipRole(b)] ?? TEAM_CHIP_ROLE_SORT.default;
    if (ra !== rb) return ra - rb;
    return staffDisplayName(a).localeCompare(staffDisplayName(b), "en", { sensitivity: "base" });
  });
}

function applyTeamDayFilter(keys, dayKind, leadKey) {
  if (dayKind === "sunday_ma_swimfarm") return filterSundayMaTeam(keys, leadKey);
  if (dayKind === "john_bespoke_mwf") return filterJohnBespokeTeam(keys);
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
  scheduleOverrideRows().forEach(function (ov) {
    if (String(ov.session_date || "").slice(0, 10) !== iso) return;
    if (String(ov.status || "active") !== "active") return;
    if (String(ov.override_type || "").trim() !== "instructor_reassign") return;
    if (!overrideAnchorOnInScopeRow(ov, scopes, iso)) return;
    const pl = parseOverridePayload(ov);
    const anchor = canonicalStaffKey(ov.anchor_staff_id);
    const cover = canonicalStaffKey(pl.covering_staff_id);
    if (anchor) {
      const ix = memberKeys.indexOf(anchor);
      if (ix >= 0) memberKeys.splice(ix, 1);
    }
    if (cover && memberKeys.indexOf(cover) < 0) memberKeys.push(cover);
  });
  return memberKeys.filter(function (k) {
    const rows = source && Array.isArray(source.rows) ? source.rows : [];
    return rows.some(function (row) {
      return staffOnInScopeRosterRow(k, row, iso, scopes, source);
    });
  });
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

function activeProgrammeWideScopeLabel(scopes, iso) {
  const wd = weekdayFromIso(iso);
  for (let i = 0; i < scopes.length; i++) {
    const sc = scopes[i];
    if (!sc.programmeWideRoster) continue;
    if (sc.weekdays && sc.weekdays.indexOf(wd) >= 0) return String(sc.label || sc.id || "Your programme");
  }
  return "";
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
  let memberKeys = collectInScopeMemberKeys(iso, ctx.scopes, src);
  memberKeys = applyScheduleOverrideMembers(memberKeys, iso, ctx.scopes, src);
  memberKeys = applyTeamDayFilter(memberKeys, dayKind, ctx.leadKey);
  memberKeys = memberKeys.filter(function (k) {
    return k !== ctx.leadKey && !PROGRAMME_LEAD_KEYS.has(k);
  });

  memberKeys = sortTeamMemberKeys(memberKeys);

  return {
    iso: iso,
    programmeLabel: teamProgrammeLabelForDay(ctx.scopes, iso),
    members: memberKeys.map(function (k) {
      return { key: k, name: staffDisplayName(k), chipRole: teamMemberChipRole(k) };
    }),
  };
}

function overrideAnchorOnInScopeRow(ov, scopes, iso) {
  if (!ov || !scopes.length) return false;
  if (!portalLeadDayUsesProgrammeWideRoster(scopes, iso)) return false;
  const anchor = canonicalStaffKey(ov.anchor_staff_id);
  if (!anchor) return false;
  const src = rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  return rows.some(function (row) {
    return staffOnInScopeRosterRow(anchor, row, iso, scopes, src);
  });
}

function overrideTouchesProgrammeScope(ov, scopes, iso) {
  return overrideAnchorOnInScopeRow(ov, scopes, iso);
}

export function portalLeadTeamShiftChanges(ctx, opts) {
  ctx = ctx || portalLeadTeamShiftContext();
  if (!ctx) return [];
  opts = opts || {};
  const now = Date.now();
  const minCreated = now - (opts.lookbackMs != null ? opts.lookbackMs : CHANGE_LOOKBACK_MS);
  const out = [];

  scheduleOverrideRows().forEach(function (ov) {
    const t = String(ov.override_type || "").trim();
    if (!TEAM_SHIFT_CHANGE_TYPES.has(t)) return;
    if (String(ov.status || "active") !== "active") return;
    const iso = String(ov.session_date || "").slice(0, 10);
    if (!iso) return;
    if (!portalLeadDayUsesProgrammeWideRoster(ctx.scopes, iso)) return;
    if (!overrideTouchesProgrammeScope(ov, ctx.scopes, iso)) return;
    const created = ov.created_at ? new Date(ov.created_at).getTime() : 0;
    if (created && created < minCreated) return;

    const pl = parseOverridePayload(ov);
    const anchorName =
      String(pl.from_staff_name || pl.original_staff_name || "").trim() ||
      staffDisplayName(ov.anchor_staff_id);
    const coverName =
      String(pl.covering_staff_name || pl.to_staff_name || "").trim() ||
      staffDisplayName(pl.covering_staff_id);
    const programmeLabel = activeProgrammeWideScopeLabel(ctx.scopes, iso);
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
      title: anchorName && coverName ? anchorName + " off · " + coverName + " covering" : "Team shift change",
      sub: [programmeLabel, dateLabel].filter(Boolean).join(" · "),
      anchorName: anchorName,
      coverName: coverName,
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
      '<span class="portal-lead-team-today__programme">' +
      escHtml(team.programmeLabel || "") +
      "</span></div>" +
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
  return (
    '<div class="portal-lead-team-today" role="region" aria-label="Team on shift today">' +
    '<div class="portal-lead-team-today__head">' +
    '<span class="portal-lead-team-today__title">Team on shift today</span>' +
    (team.programmeLabel
      ? '<span class="portal-lead-team-today__programme">' + escHtml(team.programmeLabel) + "</span>"
      : "") +
    "</div>" +
    '<div class="portal-lead-team-today__chips">' +
    chips +
    "</div></div>"
  );
}

function renderQuickMenuChanges(changes) {
  if (!changes.length) return "";
  const calIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  const btns = changes
    .slice(0, 8)
    .map(function (ch) {
      const title = escHtml(ch.title || "Team shift change");
      const sub = ch.sub ? '<span class="menu-btn-sub">' + escHtml(ch.sub) + "</span>" : "";
      return (
        '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-lead-team-shift menu-btn--portal-pulse" aria-label="' +
        title +
        '">' +
        '<div class="menu-btn-icon" aria-hidden="true">' +
        calIcon +
        "</div>" +
        '<div class="menu-btn-copy"><strong>' +
        title +
        "</strong>" +
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
    const showToday = !!(team && team.members.length);

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
  } catch (e) {
    try {
      console.warn("[portal] lead team shift sync", e);
    } catch (_) {}
  }
}

if (typeof window !== "undefined") {
  window.portalSyncLeadTeamShiftUi = portalSyncLeadTeamShiftUi;
  window.portalLeadTeamOnShiftForIso = portalLeadTeamOnShiftForIso;
  window.portalLeadTeamShiftChanges = portalLeadTeamShiftChanges;
}
