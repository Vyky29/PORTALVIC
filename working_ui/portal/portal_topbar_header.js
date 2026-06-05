/**
 * Topbar worker photo + shortcut grid (staff 2×N, lead 2×3).
 */
(function (global) {
  "use strict";

  var CEO_STAFF_EXTRA_CELL_IDS = [
    "topbarToolCellLeadReport",
    "topbarToolCellSessionsOverview",
  ];
  var CEO_STAFF_EXTRA_BTN_IDS = [
    "topbarToolLeadReport",
    "topbarToolSessionsOverview",
  ];

  /** Admin-provided staff photo only (spreadsheet boot / profile.avatarFile) — not user-uploaded auth metadata. */
  function staffPhotoUrl() {
    try {
      var dd = global.dashboardData;
      if (dd && dd.avatarFile) {
        var u = String(dd.avatarFile).trim();
        if (u) return u;
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  function staffFirstName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts[0] || "";
  }

  function photoInitials(name) {
    var n = staffFirstName(name);
    if (!n) return "?";
    return n.slice(0, 2).toUpperCase();
  }

  function setElementVisible(id, visible) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function portalStaffIsCeoTopbarFullAccess() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = (box.session && box.session.user && box.session.user.email) || "";
      if (typeof global.portalCanAccessCeoDashboard === "function") {
        return !!global.portalCanAccessCeoDashboard(profile, email);
      }
      if (typeof global.__portalCanAccessCeoDashboard === "function") {
        return !!global.__portalCanAccessCeoDashboard(profile, email);
      }
      var key = "";
      if (typeof global.portalInferStaffKey === "function") {
        key = String(global.portalInferStaffKey(profile, email) || "")
          .trim()
          .toLowerCase();
      }
      return key === "victor" || key === "javi" || key === "raul";
    } catch (_) {
      return false;
    }
  }

  global.portalSyncTopbarStaffPhoto = function portalSyncTopbarStaffPhoto() {
    var img = document.getElementById("topbarStaffPhotoImg");
    var ini = document.getElementById("topbarStaffPhotoInitials");
    if (!img && !ini) return;
    var pending =
      global.dashboardData && global.dashboardData.portalIdentityResolved === false;
    var name = pending ? "" : staffFirstName((global.dashboardData && global.dashboardData.staffName) || "");
    var url = pending ? "" : staffPhotoUrl();
    if (img) {
      if (url) {
        img.src = url;
        img.alt = name ? name + " profile photo" : "Profile photo";
        img.hidden = false;
        img.style.display = "";
        if (ini) {
          ini.textContent = "";
          ini.hidden = true;
        }
      } else {
        img.removeAttribute("src");
        img.alt = "";
        img.hidden = true;
        img.style.display = "none";
        if (ini) {
          ini.textContent = pending ? "\u2026" : photoInitials(name);
          ini.hidden = false;
        }
      }
    }
  };

  var TOPBAR_QUICK_MENU_REFS = {
    topbarToolAchievements: "quickMenuParticipantAchievements",
    topbarToolTermReview: "quickMenuStaffTermReview",
    topbarToolVenue: "quickMenuWorkVenue",
    topbarToolPickup: "quickMenuDropoffPickup",
    topbarToolLeadReport: "quickMenuLeadFeedbackReport",
  };

  function quickMenuIdForTopbarTool(toolId) {
    if (toolId === "topbarToolSessionsOverview") {
      return global.__PORTAL_TOPBAR_IS_LEAD__
        ? "quickMenuLeadSessionOverview"
        : "quickMenuStaffSessionsOverview";
    }
    return TOPBAR_QUICK_MENU_REFS[toolId] || "";
  }

  function openExternalUrl(url) {
    var u = String(url || "").trim();
    if (!u) return false;
    try {
      global.location.href = u;
      return true;
    } catch (_) {
      return false;
    }
  }

  function triggerQuickMenuButton(quickMenuId) {
    var btn = document.getElementById(quickMenuId);
    if (!btn) return false;
    btn.click();
    return true;
  }

  /** Lead shell: 6 tools in 2×3. CEO on staff: show lead + overview cells too. */
  global.portalSyncTopbarRoleTools = function portalSyncTopbarRoleTools(opts) {
    opts = opts || {};
    var isLead = !!opts.isLead;
    global.__PORTAL_TOPBAR_IS_LEAD__ = isLead;

    var grid = document.getElementById("topbarToolsGrid");
    if (grid) {
      grid.classList.toggle("topbar-tools-grid--lead", isLead);
    }

    var isCeo = portalStaffIsCeoTopbarFullAccess();
    if (grid) {
      grid.classList.toggle("topbar-tools-grid--ceo-full", isCeo && !isLead);
    }

    CEO_STAFF_EXTRA_CELL_IDS.forEach(function (id) {
      setElementVisible(id, isCeo && !isLead);
    });
    CEO_STAFF_EXTRA_BTN_IDS.forEach(function (id) {
      setElementVisible(id, isCeo && !isLead);
    });

    if (isCeo && typeof global.portalSyncCeoFullTopbarTools === "function") {
      global.portalSyncCeoFullTopbarTools();
    }
  };

  global.portalInitTopbarToolsGrid = function portalInitTopbarToolsGrid(opts) {
    opts = opts || {};
    global.__PORTAL_TOPBAR_IS_LEAD__ = !!opts.isLead;
    if (document.body.getAttribute("data-portal-topbar-tools-bound") === "1") return;
    document.body.setAttribute("data-portal-topbar-tools-bound", "1");

    document.addEventListener(
      "click",
      function (e) {
        var participantsBtn = e.target.closest ? e.target.closest("#topbarToolParticipants") : null;
        if (participantsBtn) {
          e.preventDefault();
          if (typeof global.openSheet === "function") {
            global.openSheet("clientsSheet");
          }
          if (typeof global.setClientsSheetTab === "function") {
            global.setClientsSheetTab(opts.isLead ? "all" : "my");
          }
          return;
        }

        var toolBtn = e.target.closest ? e.target.closest("[id^='topbarTool']") : null;
        if (!toolBtn || !toolBtn.id || toolBtn.id === "topbarToolParticipants") return;
        e.preventDefault();
        e.stopPropagation();

        var quickId = quickMenuIdForTopbarTool(toolBtn.id);
        if (quickId && triggerQuickMenuButton(quickId)) return;

        var ext = toolBtn.getAttribute("data-portal-external-url");
        if (ext) openExternalUrl(ext);
      },
      true
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      global.portalSyncTopbarStaffPhoto();
    });
  } else {
    global.portalSyncTopbarStaffPhoto();
  }
})(typeof window !== "undefined" ? window : globalThis);
