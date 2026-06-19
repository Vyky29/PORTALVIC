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
  if (!portalLeadDayUsesProgrammeWideRoster(ctx.scopes, iso)) return null;

  const src = rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  const memberKeys = [];

  rows.forEach(function (row) {
    if (!rosterRowMatchesIso(row, iso)) return;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, ctx.scopes)) return;
    staffKeysFromInstructorLabel(row.instructors).forEach(function (k) {
      if (k && memberKeys.indexOf(k) < 0) memberKeys.push(k);
    });
  });

  scheduleOverrideRows().forEach(function (ov) {
    if (String(ov.session_date || "").slice(0, 10) !== iso) return;
    if (String(ov.status || "active") !== "active") return;
    if (String(ov.override_type || "").trim() !== "instructor_reassign") return;
    if (!overrideTouchesProgrammeScope(ov, ctx.scopes, iso)) return;
    const pl = parseOverridePayload(ov);
    const anchor = canonicalStaffKey(ov.anchor_staff_id);
    const cover = canonicalStaffKey(pl.covering_staff_id);
    if (anchor) {
      const ix = memberKeys.indexOf(anchor);
      if (ix >= 0) memberKeys.splice(ix, 1);
    }
    if (cover && memberKeys.indexOf(cover) < 0) memberKeys.push(cover);
  });

  memberKeys.sort(function (a, b) {
    return staffDisplayName(a).localeCompare(staffDisplayName(b));
  });

  return {
    iso: iso,
    programmeLabel: activeProgrammeWideScopeLabel(ctx.scopes, iso),
    members: memberKeys.map(function (k) {
      return { key: k, name: staffDisplayName(k) };
    }),
  };
}

function overrideTouchesProgrammeScope(ov, scopes, iso) {
  if (!ov || !scopes.length) return false;
  if (!portalLeadDayUsesProgrammeWideRoster(scopes, iso)) return false;
  const anchor = canonicalStaffKey(ov.anchor_staff_id);
  const src = rosterSource();
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!rosterRowMatchesIso(row, iso)) continue;
    const slot = rosterRowToSlot(row, iso);
    if (!portalLeadSlotInScope(slot, scopes)) continue;
    const keys = staffKeysFromInstructorLabel(row.instructors);
    if (!anchor || keys.indexOf(anchor) >= 0) return true;
  }
  return rows.some(function (row) {
    if (!rosterRowMatchesIso(row, iso)) return false;
    return portalLeadSlotInScope(rosterRowToSlot(row, iso), scopes);
  });
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
      return (
        '<span class="portal-lead-team-today__chip">' + escHtml(m.name || m.key) + "</span>"
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
    const showToday = !!(team && portalLeadDayUsesProgrammeWideRoster(ctx.scopes, iso));

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
