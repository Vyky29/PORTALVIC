/**
 * Internal Chat — header Chat button (badge + pulse when unread).
 */
(function (global) {
  "use strict";

  function portalFloatingChatBtn() {
    return global.document && global.document.getElementById("portalFloatingChatBtn");
  }

  function portalFloatingChatOrbitWrap() {
    return global.document && global.document.getElementById("portalFloatingChatOrbitWrap");
  }

  function portalStaffDmUnreadCount() {
    try {
      if (global.window.__PORTAL_ADMIN_DM_INBOX_UNREAD_SYNCED__) {
        var synced = parseInt(global.window.__PORTAL_STAFF_DM_UNREAD_COUNT__, 10);
        return !isNaN(synced) && synced > 0 ? synced : 0;
      }
    } catch (_) {}
    try {
      var n = parseInt(global.window.__PORTAL_STAFF_DM_UNREAD_COUNT__, 10);
      if (!isNaN(n) && n > 0) return n;
    } catch (_) {}
    try {
      if (global.window.__PORTAL_STAFF_DM_HAS_UNREAD__) return 1;
    } catch (_) {}
    try {
      if (typeof global.window.portalAdminDmHasUnread === "function" && global.window.portalAdminDmHasUnread()) {
        return 1;
      }
    } catch (_) {}
    return 0;
  }

  function portalApplyChatDockChrome(wrap, btn, unread) {
    if (wrap) {
      wrap.classList.toggle("dock-chat-wrap--unread", unread);
      wrap.classList.toggle("dock-chat-wrap--idle", !unread);
      wrap.classList.toggle("topbar-chat-orbit-wrap--unread", unread);
      wrap.classList.toggle("topbar-chat-orbit-wrap--idle", !unread);
      wrap.classList.toggle("portal-admin-floating-chat-wrap--unread", unread);
      wrap.classList.toggle("portal-admin-floating-chat-wrap--idle", !unread);
    }
    if (btn) {
      btn.classList.toggle("portal-floating-chat-btn--unread", unread);
      btn.classList.toggle("dock-nav-item--unread", unread);
    }
  }

  function portalApplyChatButtonChrome(btn, badge, count, unread) {
    if (!btn) return;
    portalApplyChatDockChrome(portalFloatingChatOrbitWrap(), btn, unread);
    if (!badge) {
      badge = btn.querySelector(".portal-floating-chat-badge");
    }
    if (!badge) {
      badge = global.document.createElement("span");
      badge.className = "portal-floating-chat-badge";
      badge.setAttribute("aria-hidden", "true");
      btn.appendChild(badge);
    }
    if (unread) {
      badge.hidden = false;
      badge.setAttribute("aria-hidden", "false");
      badge.textContent = count > 99 ? "99+" : String(count);
      var label =
        count === 1
          ? "Open internal chat — 1 unread message"
          : "Open internal chat — " + count + " unread messages";
      btn.setAttribute("aria-label", label);
      btn.title = count === 1 ? "Chat — 1 new message" : "Chat — " + count + " new messages";
    } else {
      badge.hidden = true;
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "";
      btn.setAttribute("aria-label", "Open internal chat");
      btn.title = "Chat";
    }
  }

  function portalSyncFloatingChatUnreadFromMenuBtn() {
    var count = portalStaffDmUnreadCount();
    var unread = count > 0;
    portalApplyChatButtonChrome(
      portalFloatingChatBtn(),
      global.document && global.document.getElementById("portalFloatingChatBadge"),
      count,
      unread
    );
  }

  function portalOpenInternalChatFromFooter() {
    if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
      global.portalOpenInternalChatFromHeaderQuickMenu();
      return;
    }
    try {
      if (typeof global.closeSheet === "function") {
        global.closeSheet({ bypassAnnouncementLock: true });
      }
    } catch (_cl) {}
    if (typeof global.openSheet === "function") {
      global.openSheet("internalChatSheet", { bypassAnnouncementLock: true });
    }
  }

  function portalInitFloatingInternalChat() {
    var btn = portalFloatingChatBtn();
    if (!btn || btn.getAttribute("data-portal-floating-chat-bound") === "1") {
      portalSyncFloatingChatUnreadFromMenuBtn();
      return;
    }
    btn.setAttribute("data-portal-floating-chat-bound", "1");
    btn.hidden = false;
    btn.removeAttribute("aria-hidden");
    btn.addEventListener("click", function (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_ev) {}
      portalOpenInternalChatFromFooter();
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
  global.portalApplyTopbarChatOrbit = function (unread) {
    portalApplyChatDockChrome(portalFloatingChatOrbitWrap(), portalFloatingChatBtn(), unread);
  };

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
