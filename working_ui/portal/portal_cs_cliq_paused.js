/**
 * CS Cliq paused — chat/calls moved out of Operations while cs_cliq.html is built.
 * Directors: use Zoho Cliq until portal messaging is ready.
 */
(function (global) {
  "use strict";

  global.PORTAL_CS_CLIQ_PAUSED = true;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cardInnerHtml(opts) {
    opts = opts || {};
    var standalone = !!opts.standalone;
    var title = standalone
      ? "CS Cliq — coming soon"
      : "CS Cliq is under construction";
    var lead = standalone
      ? "We are building a dedicated clubSENsational app for messages and video calls. It is not ready for daily use yet."
      : "Team chat and video calls have moved out of Operations while we finish the new CS Cliq app.";

    return (
      '<div class="portal-cs-cliq-paused__card">' +
      '<p class="portal-cs-cliq-paused__badge">Under construction</p>' +
      "<h1 class=\"portal-cs-cliq-paused__title\">" +
      esc(title) +
      "</h1>" +
      '<p class="portal-cs-cliq-paused__lead">' +
      esc(lead) +
      "</p>" +
      '<div class="portal-cs-cliq-paused__zoho">' +
      "<strong>For urgent messages and calls, use Zoho Cliq</strong> until CS Cliq is fully stable. " +
      "The new CS Cliq app is in early rollout — report issues to Victor." +
      "</div>" +
      "<ul class=\"portal-cs-cliq-paused__list\">" +
      "<li>Operations admin stays here for scheduling, feedback, participants and HR.</li>" +
      "<li>When CS Cliq launches, you will open it from its own link (same club login).</li>" +
      "</ul>" +
      '<div class="portal-cs-cliq-paused__actions">' +
      (standalone
        ? '<a class="portal-cs-cliq-paused__btn portal-cs-cliq-paused__btn--primary" href="cs_cliq.html">Open CS Cliq app</a>'
        : '<a class="portal-cs-cliq-paused__btn portal-cs-cliq-paused__btn--primary" href="cs_cliq.html">Open CS Cliq app</a>') +
      '<button type="button" class="portal-cs-cliq-paused__btn" data-cs-cliq-paused-act="dashboard">' +
      (standalone ? "Day operations" : "Back to operations") +
      "</button>" +
      "</div>" +
      "</div>"
    );
  }

  function adminViewHtml() {
    return (
      '<div class="portal-cs-cliq-paused">' +
      cardInnerHtml({ standalone: false }) +
      "</div>"
    );
  }

  function standaloneShellHtml() {
    return (
      '<div class="portal-cs-cliq-paused portal-cs-cliq-paused--standalone">' +
      '<div class="portal-cs-cliq-paused__brand">' +
      '<img src="/portal/F-02-1.png" alt="clubSENsational" width="72" height="72" decoding="async" ' +
      'onerror="typeof portalBrandLogoOnError===\'function\'&&portalBrandLogoOnError(this)" />' +
      "</div>" +
      cardInnerHtml({ standalone: true }) +
      "</div>"
    );
  }

  function bindDashboardButton(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-cs-cliq-paused-act="dashboard"]').forEach(function (btn) {
      if (btn.__PORTAL_CS_CLIQ_PAUSED_BOUND__) return;
      btn.__PORTAL_CS_CLIQ_PAUSED_BOUND__ = true;
      btn.addEventListener("click", function () {
        try {
          if (/admin_dashboard\.html/i.test(String(global.location.pathname || ""))) {
            if (typeof global.portalAdminSetView === "function") {
              global.portalAdminSetView("dashboard");
              return;
            }
            global.location.hash = "dashboard";
            return;
          }
          global.location.href = "admin_dashboard.html#dashboard";
        } catch (_e) {
          global.location.href = "admin_dashboard.html";
        }
      });
    });
  }

  function bindAdminView() {
    bindDashboardButton(global.document);
  }

  function bindStandaloneView() {
    var host = global.document.getElementById("csCliqAppRoot");
    if (!host) return;
    host.innerHTML = standaloneShellHtml();
    bindDashboardButton(host);
  }

  function chatPaused() {
    return global.PORTAL_CS_CLIQ_PAUSED !== false;
  }

  global.portalCsCliqPaused = {
    chatPaused: chatPaused,
    adminViewHtml: adminViewHtml,
    standaloneShellHtml: standaloneShellHtml,
    bindAdminView: bindAdminView,
    bindStandaloneView: bindStandaloneView,
  };
})(typeof window !== "undefined" ? window : globalThis);
