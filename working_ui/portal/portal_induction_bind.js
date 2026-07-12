/**
 * Wire Quick menu Induction button on staff / lead dashboards.
 */
(function (global) {
  function authEmail() {
    var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
    return sess && sess.user && sess.user.email ? String(sess.user.email) : "";
  }

  function profile() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || null;
  }

  function onInductionClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-portal-induction]") : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof global.portalInductionOpen === "function") {
      global.portalInductionOpen(profile(), authEmail());
    }
  }

  function bindMenuSheet() {
    var sheet = global.document.getElementById("menuSheet");
    if (!sheet || sheet.dataset.portalInductionBound) return;
    sheet.dataset.portalInductionBound = "1";
    sheet.addEventListener("click", onInductionClick, true);
  }

  var syncInflight = null;
  var lastSyncAt = 0;
  var MIN_SYNC_GAP_MS = 4000;

  async function refreshDashboard(opts) {
    opts = opts || {};
    bindMenuSheet();
    var now = Date.now();
    if (!opts.force && syncInflight) return syncInflight;
    if (!opts.force && now - lastSyncAt < MIN_SYNC_GAP_MS) return syncInflight;
    lastSyncAt = now;
    syncInflight = (async function () {
      try {
        if (typeof global.portalInductionBindDashboard === "function") {
          global.portalInductionBindDashboard({ profile: profile(), authEmail: authEmail() });
        }
        if (typeof global.portalHydrateInductionProgressFromSupabase === "function") {
          await global.portalHydrateInductionProgressFromSupabase();
          if (typeof global.provisionalRefreshPathway === "function") {
            global.provisionalRefreshPathway();
          }
        }
        if (typeof global.portalSyncTrainingProgressToSupabase === "function") {
          void global.portalSyncTrainingProgressToSupabase();
        }
      } finally {
        syncInflight = null;
      }
    })();
    return syncInflight;
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener(
      "DOMContentLoaded",
      function () {
        void refreshDashboard({ force: true });
      },
      { once: true }
    );
  } else {
    void refreshDashboard({ force: true });
  }

  if (global.addEventListener) {
    global.addEventListener("portal:induction-cert-downloaded", function () {
      void refreshDashboard({ force: true });
    });
    global.addEventListener("portal:supabase-ready", function () {
      void refreshDashboard({ force: true });
    });
  }

  global.portalInductionRefreshDashboard = refreshDashboard;
})(typeof window !== "undefined" ? window : globalThis);
