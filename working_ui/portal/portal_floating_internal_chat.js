/**
 * Internal Chat — topbar button (beside achievements camera), outside Quick menu.
 */
(function (global) {
  "use strict";

  function portalFloatingChatBtn() {
    return global.document && global.document.getElementById("portalFloatingChatBtn");
  }

  function portalSyncFloatingChatUnreadFromMenuBtn() {
    var floatBtn = portalFloatingChatBtn();
    var menuBtn = global.document && global.document.getElementById("portalQuickMenuInternalChatBtn");
    if (!floatBtn) return;
    var unread = !!(menuBtn && menuBtn.classList.contains("menu-btn--portal-ic--unread"));
    if (!unread) {
      try {
        unread = !!global.window.__PORTAL_STAFF_DM_HAS_UNREAD__;
      } catch (_) {}
    }
    floatBtn.classList.toggle("portal-floating-chat-btn--unread", unread);
    floatBtn.classList.toggle("topbar-chat-btn--unread", unread);
  }

  function portalInitFloatingInternalChat() {
    var btn = portalFloatingChatBtn();
    if (!btn || btn.getAttribute("data-portal-floating-chat-bound") === "1") return;
    btn.setAttribute("data-portal-floating-chat-bound", "1");
    btn.hidden = false;
    btn.setAttribute("aria-hidden", "false");
    btn.addEventListener("click", function () {
      if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
        global.portalOpenInternalChatFromHeaderQuickMenu();
      }
    });

    var origSync = global.portalStaffDmSyncUnreadChrome;
    if (typeof origSync === "function" && !origSync.__portalFloatingChatWrapped) {
      global.portalStaffDmSyncUnreadChrome = async function portalStaffDmSyncUnreadChromeWrapped() {
        await origSync.apply(this, arguments);
        portalSyncFloatingChatUnreadFromMenuBtn();
      };
      global.portalStaffDmSyncUnreadChrome.__portalFloatingChatWrapped = true;
    }
    portalSyncFloatingChatUnreadFromMenuBtn();
  }

  global.portalInitFloatingInternalChat = portalInitFloatingInternalChat;
  global.portalSyncFloatingChatUnreadFromMenuBtn = portalSyncFloatingChatUnreadFromMenuBtn;

  if (global.document) {
    function boot() {
      portalInitFloatingInternalChat();
    }
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
    global.addEventListener("portal:supabase-ready", boot);
  }
})(typeof window !== "undefined" ? window : globalThis);
