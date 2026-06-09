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
    if (typeof global.openSheet === "function") {
      global.openSheet("internalChatSheet", { bypassAnnouncementLock: true });
    }
    if (typeof global.syncPortalInternalChatImmersive === "function") {
      global.syncPortalInternalChatImmersive();
    } else if (typeof global.portalSyncInternalChatMobileViewport === "function") {
      global.portalSyncInternalChatMobileViewport();
    }
    if (typeof global.portalStaffDmAckInboxOpened === "function") {
      void global.portalStaffDmAckInboxOpened();
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  function portalStaffShowChatPushToast(title, body) {
    var msg = String(body || "").trim()
      ? String(title || "New message").trim() + " — " + String(body || "").trim()
      : String(title || "New message").trim();
    if (typeof global.portalStaffToast === "function") {
      global.portalStaffToast(msg);
      return;
    }
    if (typeof global.portalAdminShowInboundAlert === "function") {
      global.portalAdminShowInboundAlert({ title: title, body: body });
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
      portalStaffShowChatPushToast(data.title, data.body);
      if (typeof global.portalStaffDmSyncUnreadChrome === "function") {
        void global.portalStaffDmSyncUnreadChrome();
      }
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
  global.portalStaffShowChatPushToast = portalStaffShowChatPushToast;
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
