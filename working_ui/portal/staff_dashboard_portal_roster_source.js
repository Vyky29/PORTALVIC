/**
 * Wires STAFF_DASHBOARD_SOURCE.rows through the canonical roster pipeline
 * (see portal_roster_canonical.js). Admin and staff dashboards share this entry point.
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
    var madreP =
      window.PortalMadreFold && typeof window.PortalMadreFold.loadLiveMadre === "function"
        ? window.PortalMadreFold.loadLiveMadre(client, true)
        : Promise.resolve(null);
    var rowsP =
      window.PortalRosterRowsMerge &&
      typeof window.PortalRosterRowsMerge.loadAndCache === "function"
        ? window.PortalRosterRowsMerge.loadAndCache(client)
        : Promise.resolve([]);
    return Promise.all([madreP, rowsP]).then(function (parts) {
      refreshStaffDashboardSourceFromPortal();
      return parts[1];
    });
  }

  window.portalRefreshPortalRosterRowsFromSupabase = refreshPortalRosterRowsFromSupabase;

  refreshStaffDashboardSourceFromPortal();

  function bootstrapLiveMadreWhenReady() {
    if (typeof window === "undefined") return;
    var tries = 0;
    function tick() {
      tries += 1;
      var client =
        window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client
          ? window.__PORTAL_SUPABASE__.client
          : null;
      if (
        client &&
        window.PortalMadreFold &&
        typeof window.PortalMadreFold.loadLiveMadre === "function"
      ) {
        window.PortalMadreFold.loadLiveMadre(client, false).then(function () {
          refreshStaffDashboardSourceFromPortal();
        });
        return;
      }
      if (tries < 80) setTimeout(tick, 250);
    }
    tick();
  }
  bootstrapLiveMadreWhenReady();
})();
