/**
 * Single MADRE resolution for participant sessions (admin + staff).
 * Base = bundle synced from roster_term_master.json; overlays = Supabase + sundayDateOverrides.
 */
(function (global) {
  "use strict";

  var SOURCE_ID = "madre+bundle+portal_overrides";
  var SOURCE_VERSION = 1;

  function resolveParticipantRows(opts) {
    opts = opts || {};
    var canon = global.PortalRosterCanonical;
    if (canon && typeof canon.resolveCanonicalRosterRows === "function") {
      return canon.resolveCanonicalRosterRows(opts);
    }
    var src = global.STAFF_DASHBOARD_SOURCE || {};
    return Array.isArray(src.rows) ? src.rows.slice() : [];
  }

  function resolveStaffDashboardSource(opts) {
    var canon = global.PortalRosterCanonical;
    if (canon && typeof canon.resolveCanonicalStaffDashboardSource === "function") {
      return canon.resolveCanonicalStaffDashboardSource();
    }
    var base = global.STAFF_DASHBOARD_SOURCE || {};
    return Object.assign({}, base, {
      rows: resolveParticipantRows(opts),
      rosterSourceId: SOURCE_ID,
      rosterSourceNote: "MADRE (roster_term_master.json) via bundle + live Supabase overlays",
    });
  }

  function getMeta() {
    var bundleMeta =
      global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.rosterMadreSource
        ? global.STAFF_DASHBOARD_SOURCE.rosterMadreSource
        : null;
    var roster = global.PortalRosterCanonical;
    var rosterMeta =
      roster && typeof roster.getCanonicalRosterMeta === "function"
        ? roster.getCanonicalRosterMeta()
        : {};
    return Object.assign(
      {
        sourceId: SOURCE_ID,
        version: SOURCE_VERSION,
        madreFile: "portal/roster_term_master.json",
        madreEditor: "roster_term_master_review.html",
        foldQueue: "portal_madre_fold_queue",
        foldScript: "database/roster_review/fold_overrides_into_madre.py",
        syncScript: "database/roster_review/sync_roster_madre_to_portal.py",
        bundleMadreSource: bundleMeta,
      },
      rosterMeta
    );
  }

  global.PortalMadreCanonical = {
    SOURCE_ID: SOURCE_ID,
    SOURCE_VERSION: SOURCE_VERSION,
    resolveParticipantRows: resolveParticipantRows,
    resolveStaffDashboardSource: resolveStaffDashboardSource,
    getMeta: getMeta,
  };
})(typeof window !== "undefined" ? window : globalThis);
