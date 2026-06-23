/**
 * Admin — Schedule & Covers module shell (`scheduling` view).
 *
 * Ops-only: day-scoped overrides, instructor covers, change log.
 * CFK weekly services live in `cfk-app.js` (parent portal target).
 */
(function (global) {
  "use strict";

  var VIEW_ID = "scheduling";

  var deps = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    isoDateLocal: function (d) {
      return String(d || "").slice(0, 10);
    },
    schedEnsureState: function () {},
    schedClampIsoToTerm: function (iso) {
      return iso;
    },
    schedMondayOfWeekIso: function (iso) {
      return iso;
    },
    schedWeekNavHtml: function () {
      return "";
    },
    schedWeekDayStripHtml: function () {
      return "";
    },
    schedAddSessionFormHtml: function () {
      return "";
    },
    termStart: "",
    termEnd: "",
    getWeekAnchorIso: function () {
      return "";
    },
  };

  function configure(options) {
    if (!options) return;
    Object.keys(options).forEach(function (k) {
      if (options[k] != null) deps[k] = options[k];
    });
  }

  function moduleInnerHtml() {
    deps.schedEnsureState();
    var today = deps.schedClampIsoToTerm(deps.isoDateLocal(new Date()));
    var anchor = deps.getWeekAnchorIso() || deps.schedMondayOfWeekIso(today);
    return (
      deps.schedWeekNavHtml(anchor) +
      '<div id="schedWeekDayStrip">' +
      deps.schedWeekDayStripHtml(anchor, today) +
      "</div>" +
      '<div class="filter-row" style="align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<label class="muted" for="schedDate">Date</label> ' +
      '<input type="date" id="schedDate" class="inp" style="max-width:180px" min="' +
      deps.esc(deps.termStart) +
      '" max="' +
      deps.esc(deps.termEnd) +
      '" value="' +
      deps.esc(today) +
      '" />' +
      '<select class="sel" id="schedVenueFilter" style="max-width:200px" aria-label="Venue filter"><option value="">All venues</option></select>' +
      '<select class="sel" id="schedStaffFilter" style="max-width:220px" aria-label="Instructor filter"><option value="">All instructors</option></select>' +
      '<select class="sel" id="schedParticipantFilter" style="max-width:220px" aria-label="Participant filter"><option value="">All participants</option></select>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);min-width:0"><input type="checkbox" id="schedOnlyOverride" /> Overrides only</label>' +
      '<button type="button" class="btn btn--sec btn--sm" id="schedRefreshBtn">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="term_roster_edit">Edit term slot</button></div>' +
      '<p id="schedConnMsg" class="muted" style="margin:0 0 12px;min-height:1.25em;max-width:900px;overflow-wrap:break-word"></p>' +
      deps.schedAddSessionFormHtml() +
      '<div class="section"><div class="section-h"><h2>Base schedule</h2><p>Click a row for full context and to add or review an override. Instructor and participant names open profiles when linked in admin data.</p></div>' +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl sched-tbl" id="schedBaseTable"><thead><tr><th>Participant</th><th>Service</th><th>Time</th><th>Notes</th><th>Venue</th><th>Instructor</th><th>Roster</th><th>Override</th><th>Action</th></tr></thead><tbody></tbody></table></div></div></div>' +
      '<div class="section" style="margin-top:22px"><div class="section-h"><h2>Change log</h2><p>Day overrides and term roster edits for the selected date (Supabase).</p></div>' +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl sched-tbl" id="schedLogTable"><thead><tr><th>Time</th><th>Type</th><th>Participant</th><th>Instructor</th><th>Reason</th><th>Created by</th><th>Created</th></tr></thead><tbody></tbody></table></div></div></div>'
    );
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Sessions · Schedule &amp; Covers</h1>' +
      '<p class="page-intro">See who is scheduled, record overrides, and review the change log for one date. ' +
      '<a href="admin_roster_guide.html" target="_blank" rel="noopener" style="font-weight:700">Roster flow guide (English, with diagrams)</a> — which tool to use for term vs one-day changes.</p>' +
      moduleInnerHtml()
    );
  }

  global.PortalAdminSchedulingModule = {
    viewId: VIEW_ID,
    configure: configure,
    viewHtml: viewHtml,
    moduleInnerHtml: moduleInnerHtml,
  };
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : this
);
