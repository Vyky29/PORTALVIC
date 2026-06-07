/**
 * Full-screen CS Cliq embed for directors/admin on staff and lead portals.
 */
(function (global) {
  "use strict";

  var configured = false;
  var BODY_LOCK = "portal-cs-cliq-embed-open";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function onAdminPortal() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmOnAdminPortal === "function") {
      return global.portalDmRoles.portalDmOnAdminPortal();
    }
    try {
      return /admin_dashboard\.html/i.test(String((global.location && global.location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  function ensureShell() {
    var backdrop = document.getElementById("portalCsCliqEmbedBackdrop");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.id = "portalCsCliqEmbedBackdrop";
    backdrop.className = "portal-cs-cliq-embed-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    var logoSrc =
      (global.PORTAL_BRAND_LOGO_SRC && String(global.PORTAL_BRAND_LOGO_SRC)) || "/portal/F-02-1.png";
    backdrop.innerHTML =
      '<div id="portalCsCliqEmbedSheet" class="portal-cs-cliq-embed-sheet" role="dialog" aria-modal="true" aria-label="CS Cliq">' +
      '<header class="portal-cs-cliq-embed-head">' +
      '<div class="portal-cs-cliq-embed-brand">' +
      '<img class="portal-cs-cliq-embed-logo" src="' +
      esc(logoSrc) +
      '" alt="" width="40" height="40" decoding="async" referrerpolicy="no-referrer-when-downgrade" onerror="typeof portalBrandLogoOnError===\'function\'?portalBrandLogoOnError(this):(this.onerror=null,this.src=\'/portal/portal_crest.svg\')" />' +
      '<div class="portal-cs-cliq-embed-head__meta">' +
      '<span class="portal-cs-cliq-embed-kicker">clubSENsational</span>' +
      '<h2 class="portal-cs-cliq-embed-title">CS Cliq</h2>' +
      "</div></div>" +
      '<button type="button" class="portal-cs-cliq-embed-close" id="portalCsCliqEmbedClose" aria-label="Close CS Cliq">&times;</button>' +
      "</header>" +
      '<div id="portalCsCliqEmbedHost" class="portal-cs-cliq-embed-host"></div>' +
      "</div>";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) close();
    });
    var closeBtn = document.getElementById("portalCsCliqEmbedClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        close();
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && global.__PORTAL_CS_CLIQ_EMBED_OPEN) close();
    });
    return backdrop;
  }

  function configureOnce() {
    if (configured || !global.PortalAdminCsCliq) return;
    configured = true;
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.applyConfigure === "function") {
      global.portalCsCliqWorkspace.applyConfigure({
        initChat: function (channel) {
          if (typeof global.portalExecutiveDmInit === "function") {
            global.portalExecutiveDmInit(channel || "staff_lead");
          }
        },
      });
      return;
    }
    global.PortalAdminCsCliq.configure({
      esc: esc,
      initChat: function (channel) {
        if (typeof global.portalExecutiveDmInit === "function") {
          global.portalExecutiveDmInit(channel || "staff_lead");
        }
      },
    });
  }

  function open(channel, opts) {
    opts = opts || {};
    if (onAdminPortal()) return false;
    channel = String(channel || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
    if (!global.PortalAdminCsCliq || typeof global.PortalAdminCsCliq.viewHtml !== "function") {
      return false;
    }
    configureOnce();
    var backdrop = ensureShell();
    var host = document.getElementById("portalCsCliqEmbedHost");
    if (!host) return false;

    global.__PORTAL_CS_CLIQ_EMBED_OPEN = true;
    global.__PORTAL_CS_CLIQ_EMBED_SHEET = backdrop;
    global.__PORTAL_CS_CLIQ_ACTIVE = true;
    global.__PORTAL_CS_CLIQ_PENDING_CHANNEL = channel;
    var pane = String(opts.pane || global.__PORTAL_CS_CLIQ_PENDING_PANE || "chats").trim();
    if (pane === "channels" || pane === "teams" || pane === "operations") pane = pane === "channels" ? "announcements" : "chats";
    if (["chats", "announcements", "phone", "files", "calendar", "support"].indexOf(pane) < 0) {
      pane = "chats";
    }
    global.__PORTAL_CS_CLIQ_PENDING_PANE = pane;
    global.__PORTAL_ADMIN_DM_CHANNEL = channel;

    host.innerHTML = global.PortalAdminCsCliq.viewHtml();
    backdrop.classList.add("is-open");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add(BODY_LOCK);

    if (typeof global.PortalAdminCsCliq.bindModule === "function") {
      global.PortalAdminCsCliq.bindModule();
    }
    if (typeof global.portalExecutiveDmInit === "function") {
      global.portalExecutiveDmInit(channel);
    }
    return true;
  }

  function close() {
    global.__PORTAL_CS_CLIQ_EMBED_OPEN = false;
    global.__PORTAL_CS_CLIQ_ACTIVE = false;
    global.__PORTAL_CS_CLIQ_EMBED_SHEET = null;
    global.__PORTAL_ADMIN_DM_OPEN = false;
    var backdrop = document.getElementById("portalCsCliqEmbedBackdrop");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");
    }
    var host = document.getElementById("portalCsCliqEmbedHost");
    if (host) host.innerHTML = "";
    if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.destroyModule === "function") {
      global.PortalAdminCsCliq.destroyModule();
    }
    document.body.classList.remove(BODY_LOCK);
  }

  function isOpen() {
    return !!global.__PORTAL_CS_CLIQ_EMBED_OPEN;
  }

  global.portalCsCliqEmbed = {
    open: open,
    close: close,
    isOpen: isOpen,
  };
})(typeof window !== "undefined" ? window : globalThis);
