/**
 * Internal Chat — topbar + Quick menu circle buttons (orbit halo, badge).
 */
(function (global) {
  "use strict";

  function portalFloatingChatBtn() {
    return global.document && global.document.getElementById("portalFloatingChatBtn");
  }

  function portalFloatingChatOrbitWrap() {
    return global.document && global.document.getElementById("portalFloatingChatOrbitWrap");
  }

  function portalQuickMenuChatOrbitWrap() {
    return global.document && global.document.getElementById("portalQuickMenuChatOrbitWrap");
  }

  function portalQuickMenuChatBtn() {
    return global.document && global.document.getElementById("portalQuickMenuInternalChatBtn");
  }

  function portalStaffDmUnreadCount() {
    try {
      var n = parseInt(global.window.__PORTAL_STAFF_DM_UNREAD_COUNT__, 10);
      if (!isNaN(n) && n > 0) return n;
    } catch (_) {}
    try {
      if (global.window.__PORTAL_STAFF_DM_HAS_UNREAD__) return 1;
    } catch (_) {}
    var menuBtn = portalQuickMenuChatBtn();
    if (menuBtn && menuBtn.classList.contains("menu-btn--portal-ic--unread")) return 1;
    return 0;
  }

  function portalApplyChatOrbitChrome(wrap, unread) {
    if (!wrap) return;
    wrap.classList.toggle("topbar-chat-orbit-wrap--unread", unread);
    wrap.classList.toggle("topbar-chat-orbit-wrap--idle", !unread);
  }

  function portalApplyChatButtonChrome(btn, badge, count, unread) {
    if (!btn) return;
    btn.classList.toggle("portal-floating-chat-btn--unread", unread);
    btn.classList.toggle("topbar-chat-btn--unread", unread);
    btn.classList.toggle("menu-btn--portal-ic--unread", unread);
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
    portalApplyChatOrbitChrome(portalFloatingChatOrbitWrap(), unread);
    portalApplyChatButtonChrome(
      portalFloatingChatBtn(),
      global.document && global.document.getElementById("portalFloatingChatBadge"),
      count,
      unread
    );
    portalApplyChatOrbitChrome(portalQuickMenuChatOrbitWrap(), unread);
    portalApplyChatButtonChrome(
      portalQuickMenuChatBtn(),
      global.document && global.document.getElementById("portalQuickMenuChatBadge"),
      count,
      unread
    );
  }

  function portalBindQuickMenuInternalChatBtn() {
    var btn = portalQuickMenuChatBtn();
    if (!btn) return;
    if (btn.getAttribute("data-portal-qm-chat-bound") !== "1") {
      btn.setAttribute("data-portal-qm-chat-bound", "1");
      btn.addEventListener("click", function () {
        if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
          global.portalOpenInternalChatFromHeaderQuickMenu();
        }
      });
    }
    portalSyncFloatingChatUnreadFromMenuBtn();
  }

  function portalInitFloatingInternalChat() {
    var btn = portalFloatingChatBtn();
    if (!btn || btn.getAttribute("data-portal-floating-chat-bound") === "1") {
      portalBindQuickMenuInternalChatBtn();
      portalSyncFloatingChatUnreadFromMenuBtn();
      return;
    }
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
    portalBindQuickMenuInternalChatBtn();
    portalSyncFloatingChatUnreadFromMenuBtn();
  }

  global.portalInitFloatingInternalChat = portalInitFloatingInternalChat;
  global.portalSyncFloatingChatUnreadFromMenuBtn = portalSyncFloatingChatUnreadFromMenuBtn;
  global.portalBindQuickMenuInternalChatBtn = portalBindQuickMenuInternalChatBtn;
  global.portalApplyTopbarChatOrbit = function (unread) {
    portalApplyChatOrbitChrome(portalFloatingChatOrbitWrap(), unread);
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
