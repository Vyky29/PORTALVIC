/**
 * Topbar worker photo + right-hand shortcut grid (staff 2×2, lead 3×2).
 */
(function (global) {
  "use strict";

  function staffPhotoUrl() {
    try {
      var dd = global.dashboardData;
      if (dd && dd.avatarFile) {
        var u = String(dd.avatarFile).trim();
        if (u) return u;
      }
      var box = global.__PORTAL_SUPABASE__;
      var meta =
        box &&
        box.session &&
        box.session.user &&
        box.session.user.user_metadata &&
        box.session.user.user_metadata.avatar_url;
      return meta ? String(meta).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function photoInitials(name) {
    var n = String(name || "").trim();
    if (!n) return "?";
    if (typeof global.clientInitials === "function") return global.clientInitials(n);
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }

  global.portalSyncTopbarStaffPhoto = function portalSyncTopbarStaffPhoto() {
    var img = document.getElementById("topbarStaffPhotoImg");
    var ini = document.getElementById("topbarStaffPhotoInitials");
    if (!img && !ini) return;
    var pending =
      global.dashboardData && global.dashboardData.portalIdentityResolved === false;
    var name = pending ? "" : String((global.dashboardData && global.dashboardData.staffName) || "").trim();
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
