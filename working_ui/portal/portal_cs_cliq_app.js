/**
 * Standalone CS Cliq app (cs_cliq.html) — full-page inbox for directors / ops admin.
 */
(function (global) {
  "use strict";

  /** Bump when chat/push logic changes — PWA auto-reloads once on open. */
  var PORTAL_CS_CLIQ_BUILD = "20260609-peers-v2";

  if (typeof global.adminTouchCompactLayoutActive !== "function") {
    global.adminTouchCompactLayoutActive = function () {
      try {
        var w = global.innerWidth || document.documentElement.clientWidth || 0;
        return w > 0 && w <= 899;
      } catch (_e) {
        return false;
      }
    };
  }

  function portalCsCliqMaybeApplyBuildUpdate() {
    var key = "portal_cs_cliq_build";
    var prev = "";
    try {
      prev = String(global.localStorage.getItem(key) || "").trim();
    } catch (_e) {}
    if (prev && prev !== PORTAL_CS_CLIQ_BUILD) {
      try {
        global.localStorage.setItem(key, PORTAL_CS_CLIQ_BUILD);
      } catch (_e2) {}
      try {
        global.setTimeout(function () {
          try {
            global.location.reload();
          } catch (_r) {}
        }, 0);
        return true;
      } catch (_e3) {}
    }
    if (!prev) {
      try {
        global.localStorage.setItem(key, PORTAL_CS_CLIQ_BUILD);
      } catch (_e4) {}
    }
    return false;
  }

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
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmUsesAdminCliq === "function"
    ) {
      return global.portalDmRoles.portalDmUsesAdminCliq(prof);
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
      back.hidden = true;
      back.setAttribute("aria-hidden", "true");
    }
  }

  function bindPushAndCalls() {
    if (typeof global.portalConsumeIncomingCallPushQuery === "function") {
      global.portalConsumeIncomingCallPushQuery();
    }
    if ("serviceWorker" in global.navigator) {
      global.navigator.serviceWorker
        .register("/clubsensational-portal-sw.js", { scope: "/" })
        .then(function (reg) {
          try {
            reg.update();
          } catch (_u) {}
        })
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

  function canRunCsCliqStandalone(prof) {
    if (isManagementProfile(prof)) return true;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
      global.portalDmRoles.portalDmIsDirectorProfile(prof)
    ) {
      return true;
    }
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsAdminProfile === "function" &&
      global.portalDmRoles.portalDmIsAdminProfile(prof)
    ) {
      return true;
    }
    return false;
  }

  async function bootCsCliqApp() {
    var box = global.__PORTAL_SUPABASE__ || {};
    var client = box.client;
    if (
      client &&
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.ensureSessionProfile === "function"
    ) {
      try {
        await global.portalChatActorIdentity.ensureSessionProfile(client);
      } catch (_sess) {}
    }
    box = global.__PORTAL_SUPABASE__ || {};
    var prof = box.staff_profile || {};
    if (!client || !prof.id) return false;

    if (!canRunCsCliqStandalone(prof)) {
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
      '<header class="cs-cliq-app-topbar cs-cliq-app-topbar--standalone">' +
      '<img class="cs-cliq-app-topbar__logo" src="/portal/announcements_logo_red_clean.png?v=20260612-clean-red" alt="" width="32" height="32" decoding="async" />' +
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
    if (typeof global.portalAdminDmRenderList === "function") {
      void global.portalAdminDmRenderList();
    }
    function retryStandalonePeers(ms) {
      global.setTimeout(function () {
        if (
          global.portalCsCliqAdminInbox &&
          typeof global.portalCsCliqAdminInbox.ensureStandaloneLeadershipPeers === "function"
        ) {
          void global.portalCsCliqAdminInbox.ensureStandaloneLeadershipPeers();
        }
      }, ms);
    }
    retryStandalonePeers(400);
    retryStandalonePeers(1800);
    return true;
  }

  global.portalCsCliqAppBoot = bootCsCliqApp;
  if (portalCsCliqMaybeApplyBuildUpdate()) return;
})(typeof window !== "undefined" ? window : globalThis);
