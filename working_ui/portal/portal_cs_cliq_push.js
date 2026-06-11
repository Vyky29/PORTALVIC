/**
 * CS Cliq standalone — in-app chat alerts + Web Push subscription.
 */
(function (global) {
  "use strict";

  var VAPID =
    typeof global.__PORTAL_VAPID_PUBLIC_KEY__ === "string"
      ? String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
      : "";

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function ensureWebPushSubscription() {
    if (global.__PORTAL_WPS_IN_FLIGHT) return { ok: true, reason: "in-flight" };
    global.__PORTAL_WPS_IN_FLIGHT = true;
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return { ok: false, reason: "no-notify-perm" };
      }
      if (!VAPID) return { ok: false, reason: "no-vapid" };
      if (!("serviceWorker" in global.navigator)) return { ok: false, reason: "no-sw" };
      var reg =
        typeof global.portalAwaitServiceWorkerReady === "function"
          ? await global.portalAwaitServiceWorkerReady(15000)
          : await global.navigator.serviceWorker.ready;
      var box = global.__PORTAL_SUPABASE__ || {};
      var token = box.session && box.session.access_token ? String(box.session.access_token) : "";
      if (!token) return { ok: false, reason: "no-session" };
      if (
        typeof global.portalEnsureFreshPushSubscription === "function" &&
        box.client
      ) {
        return global.portalEnsureFreshPushSubscription(reg, VAPID, box.client, box.session);
      }
      var sub =
        typeof global.portalSubscribePushWithCurrentVapid === "function"
          ? await global.portalSubscribePushWithCurrentVapid(reg, VAPID)
          : await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID),
            });
      if (typeof global.portalPostPushSubscriptionToServer === "function" && box.client) {
        return global.portalPostPushSubscriptionToServer(box.client, box.session, sub);
      }
      return { ok: false, reason: "no-post-fn" };
    } catch (e) {
      return { ok: false, reason: "exception", error: e };
    } finally {
      global.__PORTAL_WPS_IN_FLIGHT = false;
    }
  }

  async function openChatFromPush(chat) {
    chat = chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    if (groupId && typeof global.portalAdminDmOpenGroupThread === "function") {
      await global.portalAdminDmOpenGroupThread(groupId);
      return;
    }
    if (threadId && typeof global.portalAdminDmOpenThread === "function") {
      await global.portalAdminDmOpenThread(threadId);
    }
  }

  function parseChatDeepLink() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      var threadId = String(q.get("portal_chat_thread") || "").trim();
      var groupId = String(q.get("portal_chat_group") || "").trim();
      if (!threadId && !groupId) return null;
      return { threadId: threadId, groupId: groupId };
    } catch (_e) {
      return null;
    }
  }

  function clearChatDeepLink() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (!q.get("portal_chat_thread") && !q.get("portal_chat_group")) return;
      q.delete("portal_chat_thread");
      q.delete("portal_chat_group");
      q.delete("portal_open");
      var next =
        global.location.pathname +
        (q.toString() ? "?" + q.toString() : "") +
        (global.location.hash || "");
      global.history.replaceState(null, "", next);
    } catch (_e2) {}
  }

  function consumeChatDeepLink() {
    var link = parseChatDeepLink();
    if (!link) return;
    clearChatDeepLink();
    var run = function () {
      void openChatFromPush(link);
    };
    if (global.__PORTAL_CS_CLIQ_ACTIVE && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      setTimeout(run, 400);
      return;
    }
    global.addEventListener("portal:supabase-ready", run, { once: true });
  }

  function handleForegroundPush(d) {
    if (!d) return;
    if (d.portalOpen === "incoming_call") {
      if (typeof global.portalHandleIncomingCallPush === "function") {
        void global.portalHandleIncomingCallPush({
          msgId: (d.call && (d.call.messageId || d.call.msgId)) || "",
          src: (d.call && (d.call.source || d.call.src)) || "dm",
        });
      }
      return;
    }
    if (d.portalOpen === "chat") {
      if (typeof global.portalStaffNotifyIncomingChat === "function") {
        global.portalStaffNotifyIncomingChat(d.title, d.body, { id: d.tag || "" }, {
          fromServerPush: true,
        });
      }
      if (global.document && global.document.visibilityState === "visible") {
        return;
      }
      void openChatFromPush(d.chat || {});
    }
  }

  function bindServiceWorkerMessages() {
    if (!("serviceWorker" in global.navigator)) return;
    if (global.__PORTAL_CS_CLIQ_PUSH_SW_BOUND__) return;
    global.__PORTAL_CS_CLIQ_PUSH_SW_BOUND__ = true;
    global.navigator.serviceWorker.addEventListener("message", function (ev) {
      try {
        var d = ev.data;
        if (!d || !d.type) return;
        if (d.type === "portal-push-received") {
          handleForegroundPush(d);
          return;
        }
        if (d.type === "portal-notification-click" && d.portalOpen === "chat") {
          void openChatFromPush(d.chat || {});
        }
      } catch (_e) {}
    });
  }

  function ensureNotifyBanner() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    if (global.__PORTAL_CS_CLIQ_NOTIFY_BANNER__) return;
    if (global.localStorage && global.localStorage.getItem("portal_cs_cliq_notify_dismiss") === "1") {
      return;
    }
    var host = document.getElementById("csCliqAppRoot");
    if (!host || !host.parentNode) return;
    global.__PORTAL_CS_CLIQ_NOTIFY_BANNER__ = true;
    var bar = document.createElement("div");
    bar.className = "cs-cliq-notify-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Enable notifications");
    bar.innerHTML =
      '<p class="cs-cliq-notify-banner__text">Turn on alerts to hear and see new messages when CS Cliq is in the background.</p>' +
      '<div class="cs-cliq-notify-banner__actions">' +
      '<button type="button" class="btn btn--pri btn--sm" id="csCliqNotifyEnableBtn">Turn on alerts</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="csCliqNotifyDismissBtn">Not now</button>' +
      "</div>";
    host.parentNode.insertBefore(bar, host);
    var enable = document.getElementById("csCliqNotifyEnableBtn");
    var dismiss = document.getElementById("csCliqNotifyDismissBtn");
    if (dismiss) {
      dismiss.addEventListener("click", function () {
        try {
          global.localStorage.setItem("portal_cs_cliq_notify_dismiss", "1");
        } catch (_ls) {}
        bar.remove();
      });
    }
    if (enable) {
      enable.addEventListener("click", function () {
        enable.disabled = true;
        Notification.requestPermission()
          .then(function (perm) {
            if (perm !== "granted") {
              enable.disabled = false;
              return;
            }
            return ensureWebPushSubscription();
          })
          .then(function (wp) {
            if (wp && wp.ok) bar.remove();
            else if (enable) enable.disabled = false;
          })
          .catch(function () {
            if (enable) enable.disabled = false;
          });
      });
    }
  }

  function onSupabaseReady() {
    bindServiceWorkerMessages();
    ensureNotifyBanner();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void ensureWebPushSubscription();
    }
    consumeChatDeepLink();
  }

  global.portalEnsureWebPushSubscription = ensureWebPushSubscription;
  global.portalCsCliqOpenChatFromPush = openChatFromPush;

  bindServiceWorkerMessages();
  global.addEventListener("portal:supabase-ready", onSupabaseReady);
  if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session) {
    onSupabaseReady();
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", consumeChatDeepLink);
    } else {
      consumeChatDeepLink();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
