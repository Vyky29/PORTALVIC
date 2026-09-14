/**
 * Wires STAFF_DASHBOARD_SOURCE.rows through the roster pipeline.
 * Sessions Overview + Staff Today use the same capacity chain
 * (Places + Services DC + Timetable). Day patches stay schedule_overrides.
 * Canonical is only a last-resort fallback when chain scripts are missing.
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

  function normalizeStaffKey(raw) {
    try {
      if (typeof window.portalCanonicalStaffMatchKey === "function") {
        return String(window.portalCanonicalStaffMatchKey(raw) || "").trim().toLowerCase();
      }
      if (
        window.PortalStaffMatchKey &&
        typeof window.PortalStaffMatchKey.canonicalStaffMatchKey === "function"
      ) {
        return String(window.PortalStaffMatchKey.canonicalStaffMatchKey(raw) || "")
          .trim()
          .toLowerCase();
      }
    } catch (_) {}
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function instructorTokenKeys(instructorsRaw) {
    var out = [];
    var seen = Object.create(null);
    String(instructorsRaw || "")
      .split(/,|\/|&|\band\b/gi)
      .forEach(function (part) {
        var k = normalizeStaffKey(part);
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(k);
      });
    return out;
  }

  /**
   * Slim capacity-chain rows to one worker so Staff Today does not keep the
   * whole club term board in memory (admin Overview keeps the full set).
   */
  function filterCapacityChainRowsForStaff(rows, staffId) {
    var want = normalizeStaffKey(staffId);
    if (!want || !Array.isArray(rows) || !rows.length) return rows || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var keys = instructorTokenKeys(row.instructors);
      if (keys.indexOf(want) >= 0) out.push(row);
    }
    return out;
  }

  window.portalFilterCapacityChainRowsForStaff = filterCapacityChainRowsForStaff;

  function resolveLoggedInStaffId(opts) {
    opts = opts || {};
    if (opts.staffId) return normalizeStaffKey(opts.staffId);
    try {
      if (typeof window.portalAuthStaffRosterId === "function") {
        var authId = window.portalAuthStaffRosterId();
        if (authId) return normalizeStaffKey(authId);
      }
    } catch (_) {}
    try {
      if (typeof window.STAFF_DASHBOARD_ID !== "undefined" && window.STAFF_DASHBOARD_ID) {
        return normalizeStaffKey(window.STAFF_DASHBOARD_ID);
      }
    } catch (_) {}
    return "";
  }

  function captureBundleMetaOnce() {
    if (typeof window === "undefined") return;
    if (window.__PORTAL_STAFF_BUNDLE_META__) return;
    var b = window.STAFF_DASHBOARD_SOURCE;
    if (
      b &&
      b.staffProfiles &&
      Object.keys(b.staffProfiles).length &&
      !b.capacityChainNoCanonicalRemap
    ) {
      try {
        window.__PORTAL_STAFF_BUNDLE_META__ = {
          staffProfiles: b.staffProfiles,
          staffPhotosBaseUrl: b.staffPhotosBaseUrl || "portal/staff_photos/",
          staffPhotoExtension: b.staffPhotoExtension || "png",
          sundayDateOverrides: b.sundayDateOverrides || {},
          clientRosterStartDates: b.clientRosterStartDates || {},
          clientRosterGoneFromDates: b.clientRosterGoneFromDates || {},
          clientWeekdaysOnly: b.clientWeekdaysOnly || {},
        };
      } catch (_) {}
    }
  }

  function attachBundleMeta(chainSrc) {
    if (!chainSrc || typeof chainSrc !== "object") return chainSrc;
    captureBundleMetaOnce();
    var pinned =
      typeof window !== "undefined" ? window.__PORTAL_STAFF_BUNDLE_META__ : null;
    var bundle =
      typeof window !== "undefined" && window.STAFF_DASHBOARD_SOURCE
        ? window.STAFF_DASHBOARD_SOURCE
        : null;
    var profiles =
      (chainSrc.staffProfiles && Object.keys(chainSrc.staffProfiles).length
        ? chainSrc.staffProfiles
        : null) ||
      (pinned && pinned.staffProfiles) ||
      (bundle && bundle.staffProfiles && !bundle.capacityChainNoCanonicalRemap
        ? bundle.staffProfiles
        : null) ||
      {};
    var photosBase =
      chainSrc.staffPhotosBaseUrl ||
      (pinned && pinned.staffPhotosBaseUrl) ||
      (bundle && bundle.staffPhotosBaseUrl) ||
      "portal/staff_photos/";
    var photoExt =
      chainSrc.staffPhotoExtension ||
      (pinned && pinned.staffPhotoExtension) ||
      (bundle && bundle.staffPhotoExtension) ||
      "png";
    var sundayOv =
      chainSrc.sundayDateOverrides ||
      (pinned && pinned.sundayDateOverrides) ||
      (bundle && bundle.sundayDateOverrides) ||
      {};
    var starts = Object.assign(
      {},
      (pinned && pinned.clientRosterStartDates) || {},
      (bundle && bundle.clientRosterStartDates) || {},
      chainSrc.clientRosterStartDates || {}
    );
    var gone = Object.assign(
      {},
      (pinned && pinned.clientRosterGoneFromDates) || {},
      (bundle && bundle.clientRosterGoneFromDates) || {},
      chainSrc.clientRosterGoneFromDates || {}
    );
    var weekdays = Object.assign(
      {},
      (pinned && pinned.clientWeekdaysOnly) || {},
      (bundle && bundle.clientWeekdaysOnly) || {},
      chainSrc.clientWeekdaysOnly || {}
    );
    return Object.assign({}, chainSrc, {
      staffProfiles: profiles,
      staffPhotosBaseUrl: photosBase,
      staffPhotoExtension: photoExt,
      sundayDateOverrides: sundayOv,
      clientRosterStartDates: starts,
      clientRosterGoneFromDates: gone,
      clientWeekdaysOnly: weekdays,
    });
  }

  function resolveCapacityChainSource(opts) {
    opts = opts || {};
    var forOverview = !!(opts.forSessionsOverview || sessionsOverviewSurfaceActive());
    try {
      var Chain = window.PortalOverviewCapacityChain;
      if (Chain && typeof Chain.resolve === "function") {
        var staffId = forOverview ? "" : resolveLoggedInStaffId(opts);
        /*
         * Staff Today must never expand the full-club capacity chain while
         * identity is unknown — that blocks the main thread (~1s+) and sticks
         * on "Loading term...". Wait for staffId (auth / bootstrap).
         */
        if (!forOverview && !staffId) {
          var pendingPrev =
            typeof window !== "undefined" ? window.STAFF_DASHBOARD_SOURCE : null;
          if (
            pendingPrev &&
            pendingPrev.capacityChainStaffScoped &&
            Array.isArray(pendingPrev.rows) &&
            pendingPrev.rows.length
          ) {
            return pendingPrev;
          }
          return {
            rows: [],
            capacityChainNoCanonicalRemap: true,
            localNoCanonicalResolve: true,
            rosterSourceNote: "Capacity chain · staff (pending identity)",
          };
        }
        var chainSrc = Chain.resolve({
          forSessionsOverview: forOverview,
          staffId: staffId || undefined,
          bypassCache: !!opts.bypassCache,
        });
        if (chainSrc && Array.isArray(chainSrc.rows)) {
          /* Staff-scoped may legitimately be empty (day off / no seats); still attach meta. */
          if (chainSrc.rows.length || (staffId && chainSrc.capacityChainStaffScoped)) {
            chainSrc = attachBundleMeta(chainSrc);
            if (forOverview) {
              pinOverviewCapacitySource(chainSrc);
              return chainSrc;
            }
            return chainSrc;
          }
        }
      }
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[portal] Capacity chain unavailable (need Timetable hours + occupants)." +
            (forOverview ? " Not falling back to canonical for Overview." : "")
        );
      }
    } catch (_chain) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[portal] Capacity chain resolve failed", _chain);
      }
    }
    if (forOverview) {
      var pinned =
        typeof window !== "undefined" ? window.__PORTAL_SESSIONS_OVERVIEW_CAPACITY_PIN__ : null;
      if (pinned && Array.isArray(pinned.rows) && pinned.rows.length) return pinned;
      var prev = typeof window !== "undefined" ? window.STAFF_DASHBOARD_SOURCE : null;
      if (prev && prev.capacityChainNoCanonicalRemap && Array.isArray(prev.rows) && prev.rows.length) {
        return prev;
      }
      return {
        rows: prev && Array.isArray(prev.rows) ? prev.rows.slice() : [],
        capacityChainNoCanonicalRemap: true,
        localNoCanonicalResolve: true,
        rosterSourceNote:
          "Sessions Overview waiting for capacity chain (Places + Services + Timetable)",
      };
    }
    return null;
  }

  function resolveStaffDashboardSource(opts) {
    opts = opts || {};
    var chain = resolveCapacityChainSource(opts);
    if (chain) return chain;
    /* Capacity chain scripts present but resolve failed — do not silently paint Jul
       canonical stamps onto Autumn Staff Today (empty / sparse boards). */
    var chainScripts =
      typeof window !== "undefined" &&
      window.PortalOverviewCapacityChain &&
      window.PORTAL_CAPACITY_CHAIN_OCCUPANTS &&
      window.PORTAL_AUTUMN_STAFF_HOURS;
    if (chainScripts && !opts.allowCanonicalFallback) {
      return {
        rows: [],
        capacityChainNoCanonicalRemap: true,
        localNoCanonicalResolve: true,
        rosterSourceNote:
          "Capacity chain failed to resolve — refusing canonical Jul fallback",
      };
    }
    var canon = typeof window !== "undefined" ? window.PortalRosterCanonical : null;
    if (canon && typeof canon.resolveCanonicalStaffDashboardSource === "function") {
      return canon.resolveCanonicalStaffDashboardSource();
    }
    var base = (typeof window !== "undefined" && window.STAFF_DASHBOARD_SOURCE) || {};
    return Object.assign({}, base, {
      rows: Array.isArray(base.rows) ? base.rows.slice() : [],
      rosterSourceNote: "fallback: bundle only (capacity chain + portal_roster_canonical missing)",
    });
  }

  window.portalResolveStaffDashboardSource = resolveStaffDashboardSource;

  function refreshStaffDashboardSourceFromPortal(opts) {
    if (typeof window === "undefined") return;
    opts = opts || {};
    captureBundleMetaOnce();
    /* Overview pin only on admin Sessions Overview — never treat staff chain as Overview. */
    var forOverview =
      !!(opts.forSessionsOverview) || sessionsOverviewSurfaceActive();
    window.STAFF_DASHBOARD_SOURCE = resolveStaffDashboardSource(
      forOverview ? Object.assign({}, opts, { forSessionsOverview: true }) : opts
    );
    if (
      forOverview &&
      window.STAFF_DASHBOARD_SOURCE &&
      window.STAFF_DASHBOARD_SOURCE.capacityChainNoCanonicalRemap
    ) {
      pinOverviewCapacitySource(window.STAFF_DASHBOARD_SOURCE);
    }
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
        /* MADRE refresh must not wipe capacity chain (Overview or Staff Today). */
        if (sessionsOverviewSurfaceActive()) {
          refreshStaffDashboardSourceFromPortal({ forSessionsOverview: true });
        } else {
          var sid = resolveLoggedInStaffId({});
          if (sid) refreshStaffDashboardSourceFromPortal({ staffId: sid });
        }
        markStaffRosterLiveReady();
        return rows;
      })
      .finally(function () {
        REFRESH_INFLIGHT = null;
      });
    return REFRESH_INFLIGHT;
  }

  window.portalRefreshPortalRosterRowsFromSupabase = refreshPortalRosterRowsFromSupabase;

  /* Overview needs the full pin ASAP; Staff defers so script parse stays snappy. */
  if (sessionsOverviewSurfaceActive()) {
    refreshStaffDashboardSourceFromPortal({ forSessionsOverview: true });
  } else {
    setTimeout(function () {
      var sid = resolveLoggedInStaffId({});
      if (sid) refreshStaffDashboardSourceFromPortal({ staffId: sid });
      else captureBundleMetaOnce();
    }, 0);
  }

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
          if (sessionsOverviewSurfaceActive()) {
            refreshStaffDashboardSourceFromPortal({ forSessionsOverview: true });
          } else {
            var sid = resolveLoggedInStaffId({});
            if (sid) refreshStaffDashboardSourceFromPortal({ staffId: sid });
          }
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
