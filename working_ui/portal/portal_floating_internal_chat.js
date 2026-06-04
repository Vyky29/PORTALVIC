/**
 * Internal Chat — topbar button (beside achievements camera), outside Quick menu.
 */
(function (global) {
  "use strict";

  function portalFloatingChatBtn() {
    return global.document && global.document.getElementById("portalFloatingChatBtn");
  }

  function portalFloatingChatBadgeEl() {
    return (
      (global.document && global.document.getElementById("portalFloatingChatBadge")) ||
      (portalFloatingChatBtn() &&
        portalFloatingChatBtn().querySelector(".portal-floating-chat-badge"))
    );
  }

  function portalStaffDmUnreadCount() {
    try {
      var n = parseInt(global.window.__PORTAL_STAFF_DM_UNREAD_COUNT__, 10);
      if (!isNaN(n) && n > 0) return n;
    } catch (_) {}
    try {
      if (global.window.__PORTAL_STAFF_DM_HAS_UNREAD__) return 1;
    } catch (_) {}
    var menuBtn =
      global.document && global.document.getElementById("portalQuickMenuInternalChatBtn");
    if (menuBtn && menuBtn.classList.contains("menu-btn--portal-ic--unread")) return 1;
    return 0;
  }

  function portalSyncFloatingChatUnreadFromMenuBtn() {
    var floatBtn = portalFloatingChatBtn();
    if (!floatBtn) return;
    var count = portalStaffDmUnreadCount();
    var unread = count > 0;
    floatBtn.classList.toggle("portal-floating-chat-btn--unread", unread);
    floatBtn.classList.toggle("topbar-chat-btn--unread", unread);
    floatBtn.classList.toggle("menu-btn--portal-pulse", unread);
    var badge = portalFloatingChatBadgeEl();
    if (!badge) {
      badge = global.document.createElement("span");
      badge.className = "portal-floating-chat-badge";
      badge.id = "portalFloatingChatBadge";
      badge.setAttribute("aria-hidden", "true");
      floatBtn.appendChild(badge);
    }
    if (unread) {
      badge.hidden = false;
      badge.setAttribute("aria-hidden", "false");
      badge.textContent = count > 99 ? "99+" : String(count);
      var label =
        count === 1
          ? "Open internal chat — 1 unread message"
          : "Open internal chat — " + count + " unread messages";
      floatBtn.setAttribute("aria-label", label);
      floatBtn.title = count === 1 ? "Chat — 1 new message" : "Chat — " + count + " new messages";
    } else {
      badge.hidden = true;
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "";
      floatBtn.setAttribute("aria-label", "Open internal chat");
      floatBtn.title = "Chat";
    }
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
