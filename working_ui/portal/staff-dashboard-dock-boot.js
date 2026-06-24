/**
 * Staff app: guarantee Quick menu dock taps after externalized core.js + module auth.
 * Sync script — runs immediately after staff-dashboard-core.js in the build tail.
 */
(function (global) {
  "use strict";

  function portalOpenQuickMenuFromDock() {
    try {
      if (typeof global.portalToggleQuickMenuFromDock === "function") {
        global.portalToggleQuickMenuFromDock();
        return;
      }
      if (typeof global.openSheet === "function") {
        global.openSheet("menuSheet", {
          skipNavRecord: true,
          bypassAnnouncementLock: true,
        });
      }
    } catch (_open) {}
  }

  function portalEnsureStaffDashboardDockBindings() {
    if (typeof global.portalInitSheetBackNavigation === "function") {
      try {
        global.portalInitSheetBackNavigation();
      } catch (_init) {}
    }

    var qm = global.document && global.document.getElementById("dockQuickMenuTile");
    if (qm && qm.getAttribute("data-portal-dock-qm-bound") !== "1") {
      qm.setAttribute("data-portal-dock-qm-bound", "1");
      qm.addEventListener("click", function () {
        try {
          if (typeof global.handleQuickMenuDockClick === "function") {
            global.handleQuickMenuDockClick();
            return;
          }
        } catch (_handler) {}
        portalOpenQuickMenuFromDock();
      });
    }

    var topbarOut =
      global.document && global.document.getElementById("topbarStaffSignOut");
    if (topbarOut && global.PORTAL_STAFF_APP === true) {
      topbarOut.hidden = false;
    }
  }

  global.portalEnsureStaffDashboardDockBindings = portalEnsureStaffDashboardDockBindings;

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener(
      "DOMContentLoaded",
      portalEnsureStaffDashboardDockBindings,
      { once: true },
    );
  } else {
    portalEnsureStaffDashboardDockBindings();
  }

  global.addEventListener("portal:supabase-ready", portalEnsureStaffDashboardDockBindings);
  global.addEventListener(
    "portal:staff-identity-resolved",
    portalEnsureStaffDashboardDockBindings,
  );
})(typeof window !== "undefined" ? window : globalThis);
