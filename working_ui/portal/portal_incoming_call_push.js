/**
 * Incoming call Web Push — ring/vibrate when app is closed; open + answer from notification tap.
 */
(function (global) {
  "use strict";

  function parseIncomingCallQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portalIncomingCall") !== "1") return null;
      return {
        msgId: String(q.get("callMsgId") || "").trim(),
        src: String(q.get("callSrc") || "dm").trim() === "group" ? "group" : "dm",
      };
    } catch (_e) {
      return null;
    }
  }

  function clearIncomingCallQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portalIncomingCall") !== "1") return;
      q.delete("portalIncomingCall");
      q.delete("callMsgId");
      q.delete("callSrc");
      var next =
        global.location.pathname +
        (q.toString() ? "?" + q.toString() : "") +
        (global.location.hash || "");
      global.history.replaceState(null, "", next);
    } catch (_e2) {}
  }

  async function fetchCallMessageRow(client, msgId, src) {
    if (!client || !msgId) return null;
    var table = src === "group" ? "portal_ceo_group_message" : "portal_staff_dm_messages";
    var select =
      src === "group"
        ? "id,author_id,body,group_id,created_at"
        : "id,author_id,body,thread_id,created_at";
    try {
      var res = await client.from(table).select(select).eq("id", msgId).maybeSingle();
      return res && res.data ? res.data : null;
    } catch (_e) {
      return null;
    }
  }

  async function handleIncomingCallPush(opts) {
    opts = opts || {};
    var msgId = String(opts.msgId || opts.messageId || "").trim();
    var src = String(opts.src || opts.source || "dm").trim() === "group" ? "group" : "dm";
    if (!msgId) return false;

    var box = global.__PORTAL_SUPABASE__ || {};
    var client = box.client;
    if (!client) return false;

    var calls = global.portalStaffChatCalls;
    if (!calls) return false;

    if (typeof calls.primeCallRingAudio === "function") {
      calls.primeCallRingAudio();
    }

    var row = await fetchCallMessageRow(client, msgId, src);
    if (!row) return false;

    if (src === "group" && row.group_id) {
      var isAdmin =
        typeof global.portalAdminDmOpenGroupThread === "function" &&
        typeof global.portalAdminDmMe === "function";
      if (isAdmin) {
        global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
        global.__PORTAL_ADMIN_DM_UI.groupId = String(row.group_id);
        global.__PORTAL_ADMIN_DM_UI.threadId = "";
        global.__PORTAL_ADMIN_DM_UI.panel = "thread";
        await global.portalAdminDmOpenGroupThread(String(row.group_id));
      }
    } else if (row.thread_id) {
      global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = String(row.thread_id);
      if (typeof global.portalRenderInternalChatSheet === "function") {
        await global.portalRenderInternalChatSheet();
      }
    }

    if (typeof calls.processIncomingCallRow === "function") {
      calls.processIncomingCallRow(row, 0);
      return true;
    }
    return false;
  }

  function handlePushMessage(data) {
    if (!data || data.portalOpen !== "incoming_call") return;
    var call = data.call || {};
    var msgId = String(call.messageId || "").trim();
    if (!msgId) return;
    void handleIncomingCallPush({
      msgId: msgId,
      src: call.source || "dm",
    });
  }

  function bindIncomingCallPushMessages() {
    if (!("serviceWorker" in global.navigator)) return;
    if (global.__PORTAL_INCOMING_CALL_PUSH_BOUND__) return;
    global.__PORTAL_INCOMING_CALL_PUSH_BOUND__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        try {
          var d = ev.data;
          if (!d || !d.type) return;
          if (d.type === "portal-push-received") {
            handlePushMessage(d);
            return;
          }
          if (d.type === "portal-notification-click" && d.portalOpen === "incoming_call") {
            handlePushMessage(d);
          }
        } catch (_e) {}
      });
    } catch (_e2) {}
  }

  function consumeIncomingCallQueryOnReady() {
    var parsed = parseIncomingCallQuery();
    if (!parsed || !parsed.msgId) return;
    clearIncomingCallQuery();
    var run = function () {
      void handleIncomingCallPush(parsed);
    };
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      run();
      return;
    }
    global.addEventListener("portal:supabase-ready", run, { once: true });
  }

  global.portalHandleIncomingCallPush = handleIncomingCallPush;
  global.portalBindIncomingCallPushMessages = bindIncomingCallPushMessages;
  global.portalConsumeIncomingCallPushQuery = consumeIncomingCallQueryOnReady;

  bindIncomingCallPushMessages();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", consumeIncomingCallQueryOnReady);
    } else {
      consumeIncomingCallQueryOnReady();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
