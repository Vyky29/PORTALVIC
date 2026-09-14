/**
 * Wires STAFF_DASHBOARD_SOURCE.rows through the roster pipeline.
 * Sessions Overview uses capacity chain (Places + Services DC + Timetable).
 * Staff Today / other surfaces keep canonical until cut over.
 */
(function () {
  function dispatchStaffDashboardSourceUpdated() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent("portal:staff-dashboard-source-updated"));
    } catch (_) {}
  }

  function markStaffRosterLiveReady() {
    if (typeof window === "undefined") return;
    try {
      window.__PORTAL_STAFF_ROSTER_LIVE_READY__ = true;
      window.dispatchEvent(new CustomEvent("portal:staff-roster-live-ready"));
    } catch (_) {}
  }

  window.portalStaffRosterLiveReady = function () {
    return !!(typeof window !== "undefined" && window.__PORTAL_STAFF_ROSTER_LIVE_READY__);
  };

  window.portalStaffRosterRefreshInFlight = function () {
    return !!REFRESH_INFLIGHT;
  };

  /** Admin Sessions Overview (hash / open hub) — same pin path as LOCAL. */
  function sessionsOverviewSurfaceActive() {
    if (typeof window === "undefined") return false;
    try {
      if (window.__PORTAL_SESSIONS_OVERVIEW_ACTIVE__) return true;
      if (window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__) return true;
      var hash = String(window.location && window.location.hash ? window.location.hash : "")
        .toLowerCase();
      if (hash.indexOf("c4k_sessions") >= 0) return true;
      if (
        typeof document !== "undefined" &&
        document.querySelector &&
        document.querySelector(".admin-sessions-hub-root")
      ) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function pinOverviewCapacitySource(src) {
    if (!src || !src.capacityChainNoCanonicalRemap) return;
    if (!Array.isArray(src.rows) || !src.rows.length) return;
    try {
      window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__ = src;
    } catch (_) {}
  }

  function resolveCapacityChainForOverview(opts) {
    try {
      var Chain = window.PortalOverviewCapacityChain;
      if (Chain && typeof Chain.resolve === "function") {
        var chainSrc = Chain.resolve(opts || {});
        if (chainSrc && Array.isArray(chainSrc.rows) && chainSrc.rows.length) {
          pinOverviewCapacitySource(chainSrc);
          return chainSrc;
        }
      }
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[portal] Sessions Overview capacity chain unavailable (need Timetable hours + occupants). Not falling back to canonical."
        );
      }
    } catch (_chain) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[portal] Sessions Overview capacity chain failed", _chain);
      }
    }
    var pinned =
      typeof window !== "undefined" ? window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__ : null;
    if (pinned && Array.isArray(pinned.rows) && pinned.rows.length) return pinned;
    var prev = typeof window !== "undefined" ? window.STAFF_DASHBOARD_SOURCE : null;
    if (prev && prev.capacityChainNoCanonicalRemap && Array.isArray(prev.rows) && prev.rows.length) {
      return prev;
    }
    /* Never remap Overview through canonical Jul stamps. */
    return {
      rows: prev && Array.isArray(prev.rows) ? prev.rows.slice() : [],
      capacityChainNoCanonicalRemap: true,
      localNoCanonicalResolve: true,
      rosterSourceNote:
        "Sessions Overview waiting for capacity chain (Places + Services + Timetable)",
    };
  }

  function resolveStaffDashboardSource(opts) {
    opts = opts || {};
    var forOverview = !!(opts.forSessionsOverview || sessionsOverviewSurfaceActive());
    if (forOverview) {
      return resolveCapacityChainForOverview(opts);
    }
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

  function refreshStaffDashboardSourceFromPortal(opts) {
    if (typeof window === "undefined") return;
    opts = opts || {};
    var keepOverview =
      !!(opts.forSessionsOverview) ||
      sessionsOverviewSurfaceActive() ||
      !!(window.STAFF_DASHBOARD_SOURCE && window.STAFF_DASHBOARD_SOURCE.capacityChainNoCanonicalRemap) ||
      !!window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__;
    window.STAFF_DASHBOARD_SOURCE = resolveStaffDashboardSource(
      keepOverview ? { forSessionsOverview: true } : opts
    );
    if (keepOverview) pinOverviewCapacitySource(window.STAFF_DASHBOARD_SOURCE);
    dispatchStaffDashboardSourceUpdated();
  }

  window.portalRefreshStaffDashboardSourceFromPortal = refreshStaffDashboardSourceFromPortal;

  var REFRESH_INFLIGHT = null;

  function refreshPortalRosterRowsFromSupabase(client) {
    if (REFRESH_INFLIGHT) {
      return REFRESH_INFLIGHT;
    }
    var madreP =
      window.PortalMadreFold && typeof window.PortalMadreFold.loadLiveMadre === "function"
        ? window.PortalMadreFold.loadLiveMadre(client, true)
        : Promise.resolve(null);
    REFRESH_INFLIGHT = madreP
      .then(function () {
        return new Promise(function (r) {
          setTimeout(r, 250);
        });
      })
      .then(function () {
        return window.PortalRosterRowsMerge &&
          typeof window.PortalRosterRowsMerge.loadAndCache === "function"
          ? window.PortalRosterRowsMerge.loadAndCache(client)
          : Promise.resolve([]);
      })
      .then(function (rows) {
        /* MADRE / portal_roster_rows refresh must not wipe Overview capacity chain. */
        refreshStaffDashboardSourceFromPortal(
          sessionsOverviewSurfaceActive() || window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__
            ? { forSessionsOverview: true }
            : {}
        );
        markStaffRosterLiveReady();
        return rows;
      })
      .finally(function () {
        REFRESH_INFLIGHT = null;
      });
    return REFRESH_INFLIGHT;
  }

  window.portalRefreshPortalRosterRowsFromSupabase = refreshPortalRosterRowsFromSupabase;

  refreshStaffDashboardSourceFromPortal(
    sessionsOverviewSurfaceActive() ? { forSessionsOverview: true } : {}
  );

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
          refreshStaffDashboardSourceFromPortal(
            sessionsOverviewSurfaceActive() || window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__
              ? { forSessionsOverview: true }
              : {}
          );
        });
        return;
      }
      if (tries < 80) setTimeout(tick, 250);
    }
    tick();
  }
  bootstrapLiveMadreWhenReady();

  // Keep already-open staff dashboards in sync with the live MADRE without a
  // manual reload or logout. The refresh forces loadLiveMadre(), so tabs that
  // stayed open pick up newer portal_madre_document revisions on tab focus and
  // on a slow periodic backstop. A 60s min-gap avoids network spam.
  function setupLiveMadreAutoRefresh() {
    if (typeof document === "undefined" || !document.addEventListener) return;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    var MIN_GAP_MS = 60 * 1000;
    var PERIODIC_MS = 8 * 60 * 1000;
    var lastAt = 0;
    function supaClient() {
      return (
        (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client) || null
      );
    }
    function maybeRefresh(force) {
      try {
        if (document.visibilityState !== "visible") return;
        var client = supaClient();
        if (!client) return;
        var now = Date.now();
        if (!force && now - lastAt < MIN_GAP_MS) return;
        lastAt = now;
        Promise.resolve(refreshPortalRosterRowsFromSupabase(client)).catch(
          function () {}
        );
      } catch (_) {}
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") maybeRefresh(false);
    });
    window.addEventListener("focus", function () {
      maybeRefresh(false);
    });
    window.addEventListener("pageshow", function (ev) {
      if (ev && ev.persisted) maybeRefresh(true);
    });
    setInterval(function () {
      maybeRefresh(false);
    }, PERIODIC_MS);
  }
  setupLiveMadreAutoRefresh();
})();
