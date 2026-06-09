/**
 * Internal chat Web Push — open thread from notification (staff/lead/CEO on staff dashboard).
 */
(function (global) {
  "use strict";

  function parseChatOpenQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portal_open") !== "internal_chat") return null;
      return {
        threadId: String(q.get("portal_chat_thread") || "").trim(),
        groupId: String(q.get("portal_chat_group") || "").trim(),
      };
    } catch (_e) {
      return null;
    }
  }

  function clearChatOpenQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portal_open") !== "internal_chat") return;
      q.delete("portal_open");
      q.delete("portal_chat_thread");
      q.delete("portal_chat_group");
      var next =
        global.location.pathname +
        (q.toString() ? "?" + q.toString() : "") +
        (global.location.hash || "");
      global.history.replaceState(null, "", next);
    } catch (_e2) {}
  }

  async function portalOpenInternalChatFromPush(chat) {
    if (global.__PORTAL_CHAT_PUSH_OPENING__) return;
    global.__PORTAL_CHAT_PUSH_OPENING__ = true;
    chat = chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    try {
      if (typeof global.closeSheet === "function") {
        global.closeSheet({ bypassAnnouncementLock: true });
      }
    } catch (_c) {}
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    if (groupId) {
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = groupId;
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
    } else if (threadId) {
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = threadId;
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
      global.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = true;
    }
    try {
      if (typeof global.openSheet === "function") {
        global.openSheet("internalChatSheet", {
          bypassAnnouncementLock: true,
          skipInternalChatRender: true,
        });
      }
      if (typeof global.syncPortalInternalChatImmersive === "function") {
        global.syncPortalInternalChatImmersive();
      } else if (typeof global.portalSyncInternalChatMobileViewport === "function") {
        global.portalSyncInternalChatMobileViewport();
      }
      if (typeof global.portalStaffDmAckInboxOpened === "function") {
        await global.portalStaffDmAckInboxOpened();
      }
      if (typeof global.portalRenderInternalChatSheet === "function") {
        await global.portalRenderInternalChatSheet();
      }
    } finally {
      global.__PORTAL_CHAT_PUSH_OPENING__ = false;
    }
  }

  function portalStaffToast(msg) {
    if (typeof document === "undefined" || !document.body) return;
    var host = document.getElementById("portalStaffToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "portalStaffToastHost";
      host.setAttribute("aria-live", "polite");
      host.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:9600;pointer-events:none;display:flex;flex-direction:column;gap:8px;max-width:520px;margin:0 auto;";
      document.body.appendChild(host);
    }
    var el = document.createElement("button");
    el.type = "button";
    el.className = "portal-staff-toast";
    el.style.cssText =
      "pointer-events:auto;width:100%;margin:0;padding:12px 14px;border:0;border-radius:14px;background:#0f172a;color:#f8fafc;font:inherit;font-size:14px;font-weight:600;line-height:1.35;text-align:left;box-shadow:0 8px 24px rgba(15,23,42,.28);cursor:pointer;min-width:0;overflow-wrap:break-word;";
    el.textContent = String(msg || "New message");
    el.addEventListener("click", function () {
      try {
        el.remove();
      } catch (_r) {}
      if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
        global.portalOpenInternalChatFromHeaderQuickMenu();
      }
    });
    host.appendChild(el);
    setTimeout(function () {
      try {
        el.remove();
      } catch (_t) {}
    }, 8000);
  }

  function portalStaffShowChatPushToast(title, body) {
    var msg = String(body || "").trim()
      ? String(title || "New message").trim() + " — " + String(body || "").trim()
      : String(title || "New message").trim();
    portalStaffToast(msg);
  }

  function portalStaffNotifyIncomingChat(title, preview, row) {
    title = String(title || "Admin").trim();
    preview = String(preview || "New message").trim();
    var dedupeKey = String((row && row.id) || title + "|" + preview).trim();
    var dedupeMap = global.__PORTAL_CHAT_NOTIFY_DEDUPE__ || {};
    var dedupeAt = dedupeMap[dedupeKey] || 0;
    if (dedupeKey && dedupeAt && Date.now() - dedupeAt < 5000) return;
    if (dedupeKey) {
      dedupeMap[dedupeKey] = Date.now();
      global.__PORTAL_CHAT_NOTIFY_DEDUPE__ = dedupeMap;
    }
    if (typeof global.portalStaffDmBumpUnreadOptimistic === "function") {
      global.portalStaffDmBumpUnreadOptimistic();
    }
    if (global.navigator && global.navigator.vibrate) {
      try {
        global.navigator.vibrate([120, 55, 120, 55, 160]);
      } catch (_v) {}
    }
    var appVisible =
      global.document && String(global.document.visibilityState || "") === "visible";
    if (!appVisible && typeof global.portalStaffNotifyOsWhiteTile === "function") {
      global.portalStaffNotifyOsWhiteTile(
        title,
        preview,
        "portal-chat-live-" + String((row && row.id) || Date.now())
      );
    }
    if (typeof global.syncPortalHeaderAlertChrome === "function") {
      global.syncPortalHeaderAlertChrome(
        typeof global.portalReminderState === "function" ? global.portalReminderState() : null
      );
    }
    if (typeof global.portalStaffDmSyncUnreadChrome === "function") {
      void global.portalStaffDmSyncUnreadChrome();
    }
  }

  function handleChatPushMessage(data, opts) {
    opts = opts || {};
    if (!data || data.portalOpen !== "chat") return;
    var chat = data.chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    if (!threadId && !groupId) {
      if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
        global.portalOpenInternalChatFromHeaderQuickMenu();
      }
      return;
    }
    if (
      !opts.fromNotificationClick &&
      global.document &&
      global.document.visibilityState === "visible"
    ) {
      portalStaffNotifyIncomingChat(data.title, data.body, { id: data.tag || "" });
      return;
    }
    void portalOpenInternalChatFromPush(chat);
  }

  function bindChatPushMessages() {
    if (!("serviceWorker" in global.navigator)) return;
    if (global.__PORTAL_CHAT_PUSH_BOUND__) return;
    global.__PORTAL_CHAT_PUSH_BOUND__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        try {
          var d = ev.data;
          if (!d || !d.type) return;
          if (d.type === "portal-push-received" && d.portalOpen === "chat") {
            handleChatPushMessage(d, { fromNotificationClick: false });
            return;
          }
          if (d.type === "portal-notification-click" && d.portalOpen === "chat") {
            handleChatPushMessage(d, { fromNotificationClick: true });
          }
        } catch (_e) {}
      });
    } catch (_e2) {}
  }

  function consumeChatOpenQueryOnReady() {
    var parsed = parseChatOpenQuery();
    if (!parsed) return;
    clearChatOpenQuery();
    var run = function () {
      void portalOpenInternalChatFromPush(parsed);
    };
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      run();
      return;
    }
    global.addEventListener("portal:supabase-ready", run, { once: true });
  }

  global.portalOpenInternalChatFromPush = portalOpenInternalChatFromPush;
  global.portalStaffToast = portalStaffToast;
  global.portalStaffShowChatPushToast = portalStaffShowChatPushToast;
  global.portalStaffNotifyIncomingChat = portalStaffNotifyIncomingChat;
  global.portalBindChatPushMessages = bindChatPushMessages;
  global.portalConsumeChatPushQuery = consumeChatOpenQueryOnReady;

  bindChatPushMessages();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", consumeChatOpenQueryOnReady);
    } else {
      consumeChatOpenQueryOnReady();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
