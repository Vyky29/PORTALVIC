/**
 * Staff dashboard dock — early Quick menu binding + sign-out chrome.
 * Loads right after portal_sheet_back.js (before staff-dashboard-topbar.js on staff app).
 */
(function (global) {
  "use strict";

  function portalOpenQuickMenuFromDock() {
    try {
      if (typeof global.portalHandleDockQuickMenuTap === "function") {
        global.portalHandleDockQuickMenuTap();
        return;
      }
    } catch (_tap) {}
    try {
      if (typeof global.portalToggleQuickMenuFromDock === "function") {
        global.portalToggleQuickMenuFromDock();
        return;
      }
    } catch (_toggle) {}
    try {
      if (typeof global.openSheet === "function") {
        global.openSheet("menuSheet", {
          skipNavRecord: true,
          bypassAnnouncementLock: true,
        });
        return;
      }
    } catch (_open) {}
    try {
      if (typeof global.portalQuickMenuMinimalToggle === "function") {
        global.portalQuickMenuMinimalToggle();
        if (typeof global.portalSyncQuickMenuDockChrome === "function") {
          global.portalSyncQuickMenuDockChrome();
        }
      }
    } catch (_min) {}
  }

  function portalEnsureStaffDashboardDockBindings() {
    if (typeof global.portalBindDockQuickMenuEarly === "function") {
      try {
        global.portalBindDockQuickMenuEarly();
      } catch (_early) {}
    }
    if (typeof global.portalInitSheetBackNavigation === "function") {
      try {
        global.portalInitSheetBackNavigation();
      } catch (_init) {}
    }

    var qm = global.document && global.document.getElementById("dockQuickMenuTile");
    if (qm && qm.getAttribute("data-portal-dock-qm-bound") !== "1") {
      qm.setAttribute("data-portal-dock-qm-bound", "1");
      qm.addEventListener("click", function (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (_ev) {}
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
