/**
 * Floating Internal Chat button (outside Quick menu).
 */
(function (global) {
  "use strict";

  var CHAT_SVG =
    '<svg class="portal-floating-chat-btn__svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

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
  }

  function portalInitFloatingInternalChat() {
    var btn = portalFloatingChatBtn();
    if (!btn || btn.getAttribute("data-portal-floating-chat-bound") === "1") return;
    btn.setAttribute("data-portal-floating-chat-bound", "1");
    btn.hidden = false;
    btn.setAttribute("aria-hidden", "false");
    if (!btn.querySelector(".portal-floating-chat-btn__icon")) {
      btn.innerHTML =
        '<span class="portal-floating-chat-btn__icon" aria-hidden="true">' +
        CHAT_SVG +
        '</span><span class="portal-floating-chat-btn__label">Chat</span>';
    }
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
