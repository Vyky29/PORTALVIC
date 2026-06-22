/**
 * @deprecated Load /portal/staff_dashboard_portal_roster_source.js instead.
 * Thin shim kept for legacy script paths — delegates to portal_roster_canonical.js.
 */
(function () {
  function dispatchStaffDashboardSourceUpdated() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent("portal:staff-dashboard-source-updated"));
    } catch (_) {}
  }

  function resolveStaffDashboardSource() {
    var canon = typeof window !== "undefined" ? window.PortalRosterCanonical : null;
    if (canon && typeof canon.resolveCanonicalStaffDashboardSource === "function") {
      return canon.resolveCanonicalStaffDashboardSource();
    }
    var base = (typeof window !== "undefined" && window.STAFF_DASHBOARD_SOURCE) || {};
    return Object.assign({}, base, {
      rows: Array.isArray(base.rows) ? base.rows.slice() : [],
      rosterSourceNote: "fallback: bundle only (portal_roster_canonical.js not loaded)",
    });
  }

  window.portalResolveStaffDashboardSource = resolveStaffDashboardSource;

  function refreshStaffDashboardSourceFromPortal() {
    if (typeof window === "undefined" || !window.STAFF_DASHBOARD_SOURCE) return;
    window.STAFF_DASHBOARD_SOURCE = resolveStaffDashboardSource();
    dispatchStaffDashboardSourceUpdated();
  }

  window.portalRefreshStaffDashboardSourceFromPortal = refreshStaffDashboardSourceFromPortal;

  function refreshPortalRosterRowsFromSupabase(client) {
    if (
      typeof window === "undefined" ||
      !window.PortalRosterRowsMerge ||
      typeof window.PortalRosterRowsMerge.loadAndCache !== "function"
    ) {
      return Promise.resolve([]);
    }
    return window.PortalRosterRowsMerge.loadAndCache(client).then(function (rows) {
      refreshStaffDashboardSourceFromPortal();
      return rows;
    });
  }

  window.portalRefreshPortalRosterRowsFromSupabase = refreshPortalRosterRowsFromSupabase;

  refreshStaffDashboardSourceFromPortal();
})();
