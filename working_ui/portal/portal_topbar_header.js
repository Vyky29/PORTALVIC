/**
 * Topbar worker photo + right-hand shortcut grid (staff 2×2, lead 3×2).
 */
(function (global) {
  "use strict";

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

  global.portalInitTopbarToolsGrid = function portalInitTopbarToolsGrid(opts) {
    opts = opts || {};
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
