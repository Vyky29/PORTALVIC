/**
 * Standalone CS Cliq app (cs_cliq.html) — full-page inbox for directors / ops admin.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isManagementProfile(prof) {
    if (
      global.portalCsCliqHubRoles &&
      typeof global.portalCsCliqHubRoles.isManagementProfile === "function"
    ) {
      return global.portalCsCliqHubRoles.isManagementProfile(prof);
    }
    var app = String((prof && prof.app_role) || "").toLowerCase();
    return app === "admin" || app === "ceo";
  }

  function defaultChannelForProfile(prof) {
    var Mgmt = global.portalCsCliqManagementInbox;
    if (Mgmt && typeof Mgmt.isSevithaProfile === "function" && Mgmt.isSevithaProfile(prof)) {
      return "staff_lead";
    }
    if (isManagementProfile(prof)) return "ceo_exec";
    return "staff_lead";
  }

  function operationsAdminUrl() {
    try {
      return new URL("admin_dashboard.html", global.location.href).href;
    } catch (_e) {
      return "admin_dashboard.html";
    }
  }

  function configureModulesOnce() {
    if (global.__PORTAL_CS_CLIQ_APP_CONFIGURED__) return;
    global.__PORTAL_CS_CLIQ_APP_CONFIGURED__ = true;

    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.applyConfigure === "function") {
      global.portalCsCliqWorkspace.applyConfigure({
        esc: esc,
        initChat: function (channel) {
          if (typeof global.portalExecutiveDmInit === "function") {
            global.portalExecutiveDmInit(channel || "ceo_exec");
          }
        },
        openAdminView: function () {
          global.location.href = operationsAdminUrl();
        },
        focusChats: function () {
          if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
            global.PortalAdminCsCliq.setRailPane("chats");
          }
        },
        channels: {},
      });
    }

    if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.configure === "function") {
      global.PortalAdminCsCliq.configure({
        esc: esc,
        initChat: function (channel) {
          if (typeof global.portalExecutiveDmInit === "function") {
            global.portalExecutiveDmInit(channel || "ceo_exec");
          }
        },
        openAdminView: function () {
          global.location.href = operationsAdminUrl();
        },
        focusChats: function () {
          if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
            global.PortalAdminCsCliq.setRailPane("chats");
          }
        },
        channels: {},
      });
    }
  }

  function bindShellChrome() {
    var back = document.getElementById("csCliqInboxBackBtn");
    if (back && !back.dataset.portalCsCliqAppBound) {
      back.dataset.portalCsCliqAppBound = "1";
      back.hidden = false;
      back.setAttribute("aria-hidden", "false");
      back.addEventListener("click", function () {
        global.location.href = operationsAdminUrl();
      });
    }
    var opsLink = document.getElementById("csCliqAppOpsLink");
    if (opsLink && !opsLink.dataset.bound) {
      opsLink.dataset.bound = "1";
      opsLink.addEventListener("click", function (ev) {
        ev.preventDefault();
        global.location.href = operationsAdminUrl();
      });
    }
  }

  function bindPushAndCalls() {
    if (typeof global.portalConsumeIncomingCallPushQuery === "function") {
      global.portalConsumeIncomingCallPushQuery();
    }
    if ("serviceWorker" in global.navigator) {
      global.navigator.serviceWorker
        .register("/clubsensational-portal-sw.js", { scope: "/" })
        .catch(function () {});
    }
  }

  function parseDeepLinkChannel() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      var ch = String(q.get("portal_cliq_channel") || "").trim();
      if (ch === "ceo_exec" || ch === "staff_lead") return ch;
    } catch (_q) {}
    return "";
  }

  function bootCsCliqApp() {
    var box = global.__PORTAL_SUPABASE__ || {};
    var prof = box.staff_profile || {};
    if (!box.client || !prof.id) return false;

    if (!isManagementProfile(prof)) {
      var app = String(prof.app_role || "").toLowerCase();
      var dest =
        app === "lead"
          ? "lead_dashboard.html"
          : app === "ceo"
            ? "ceo_dashboard.html"
            : "staff_dashboard.html";
      global.location.replace(dest);
      return false;
    }

    if (!global.PortalAdminCsCliq || typeof global.PortalAdminCsCliq.viewHtml !== "function") {
      return false;
    }

    configureModulesOnce();

    global.__PORTAL_CS_CLIQ_STANDALONE = true;
    global.__PORTAL_CS_CLIQ_ACTIVE = true;
    global.__PORTAL_CS_CLIQ_EMBED_OPEN = false;
    global.__PORTAL_ADMIN_DM_OPEN = true;

    var host = document.getElementById("csCliqAppRoot");
    if (!host) return false;

    host.innerHTML =
      '<header class="cs-cliq-app-topbar">' +
      '<a class="cs-cliq-app-topbar__ops" id="csCliqAppOpsLink" href="' +
      esc(operationsAdminUrl()) +
      '">← Operations</a>' +
      '<span class="cs-cliq-app-topbar__title">CS Cliq</span>' +
      "</header>" +
      global.PortalAdminCsCliq.viewHtml();

    document.body.classList.add("cs-cliq-app", "admin-view-cs-cliq", "admin-touch-compact");

    if (typeof global.PortalAdminCsCliq.bindModule === "function") {
      global.PortalAdminCsCliq.bindModule();
    }

    bindShellChrome();

    var channel = parseDeepLinkChannel() || defaultChannelForProfile(prof);
    if (typeof global.portalExecutiveDmInit === "function") {
      global.portalExecutiveDmInit(channel);
    }

    bindPushAndCalls();
    return true;
  }

  global.portalCsCliqAppBoot = bootCsCliqApp;
})(typeof window !== "undefined" ? window : globalThis);
