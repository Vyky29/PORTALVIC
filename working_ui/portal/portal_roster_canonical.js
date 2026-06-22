/**
 * Single roster resolution pipeline for admin + staff dashboards.
 *
 * Runtime truth:
 *   1. Base rows: `staff_dashboard_spreadsheet_bundle.js` → STAFF_DASHBOARD_SOURCE.rows
 *   2. Overlay: Supabase `portal_roster_rows` (templates + dated exceptions)
 *
 * Day-of operational changes (cover, cancel, add) stay in `schedule_overrides` and are
 * applied when building today's session cards — not duplicated here.
 *
 * Deprecated for roster (do not use to build rows):
 *   - SESSION_FEEDBACK_STATUS_PORTAL_SOURCE projection
 *   - ROSTER_TERM_MASTER_DASHBOARD_ROWS at runtime (build/export seed only)
 *   - Multiple copies of the bundle outside working_ui/portal/
 */
(function (global) {
  "use strict";

  var SOURCE_ID = "spreadsheet_bundle+portal_roster_rows";
  var SOURCE_VERSION = 1;

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  /** Base machine rows from the shipped spreadsheet bundle only. */
  function getBundleBaseRows() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    if (!src || !Array.isArray(src.rows) || !src.rows.length) return [];
    return src.rows.slice();
  }

  function applyPortalRosterDbRows(rows) {
    var cache = global.PORTAL_ROSTER_ROWS_CACHE;
    var list = Array.isArray(cache) ? cache : [];
    if (!list.length) return rows;
    var mergeFn =
      global.PortalRosterRowsMerge &&
      typeof global.PortalRosterRowsMerge.mergePortalRosterRows === "function"
        ? global.PortalRosterRowsMerge.mergePortalRosterRows
        : null;
    if (!mergeFn) return rows;
    return mergeFn(rows, list);
  }

  /**
   * Canonical roster rows for STAFF_DASHBOARD_SOURCE.rows.
   * @param {{ skipDb?: boolean }} [opts]
   */
  function resolveCanonicalRosterRows(opts) {
    opts = opts || {};
    var base = getBundleBaseRows();
    var merged = opts.skipDb ? base.slice() : applyPortalRosterDbRows(base);
    return merged;
  }

  function resolveCanonicalStaffDashboardSource() {
    var base = global.STAFF_DASHBOARD_SOURCE || {};
    var rows = resolveCanonicalRosterRows();
    return Object.assign({}, base, {
      rows: rows,
      rosterSourceId: SOURCE_ID,
      rosterSourceVersion: SOURCE_VERSION,
      rosterSourceNote:
        "Canonical: portal/staff_dashboard_spreadsheet_bundle.js + Supabase portal_roster_rows",
    });
  }

  function getCanonicalRosterMeta() {
    var bundleCount = getBundleBaseRows().length;
    var dbCount = Array.isArray(global.PORTAL_ROSTER_ROWS_CACHE)
      ? global.PORTAL_ROSTER_ROWS_CACHE.length
      : 0;
    var resolved = resolveCanonicalRosterRows();
    return {
      sourceId: SOURCE_ID,
      version: SOURCE_VERSION,
      bundleRowCount: bundleCount,
      portalRosterRowsCached: dbCount,
      resolvedRowCount: resolved.length,
    };
  }

  global.PortalRosterCanonical = {
    SOURCE_ID: SOURCE_ID,
    SOURCE_VERSION: SOURCE_VERSION,
    getBundleBaseRows: getBundleBaseRows,
    applyPortalRosterDbRows: applyPortalRosterDbRows,
    resolveCanonicalRosterRows: resolveCanonicalRosterRows,
    resolveCanonicalStaffDashboardSource: resolveCanonicalStaffDashboardSource,
    getCanonicalRosterMeta: getCanonicalRosterMeta,
    normIso: normIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
