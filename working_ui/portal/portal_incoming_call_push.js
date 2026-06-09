/**
 * Incoming call Web Push — ring/vibrate when app is closed; open + answer from notification tap.
 */
(function (global) {
  "use strict";

  var PENDING_CALL_KEY = "portal_pending_incoming_call_v1";

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

  function stashPendingIncomingCall(opts) {
    opts = opts || {};
    var msgId = String(opts.msgId || opts.messageId || "").trim();
    if (!msgId) return;
    try {
      global.sessionStorage.setItem(
        PENDING_CALL_KEY,
        JSON.stringify({
          msgId: msgId,
          src: String(opts.src || opts.source || "dm").trim() === "group" ? "group" : "dm",
          ts: Date.now(),
        })
      );
    } catch (_s) {}
  }

  function consumePendingIncomingCall() {
    try {
      var raw = global.sessionStorage.getItem(PENDING_CALL_KEY);
      if (!raw) return null;
      global.sessionStorage.removeItem(PENDING_CALL_KEY);
      var p = JSON.parse(raw);
      if (!p || !p.msgId || Date.now() - Number(p.ts || 0) > 120000) return null;
      return p;
    } catch (_c) {
      return null;
    }
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

  async function openChatForIncomingRow(row) {
    if (!row) return;
    var isAdminDash = false;
    try {
      isAdminDash = /admin_dashboard\.html/i.test(String(global.location.pathname || ""));
    } catch (_path) {}
    if (isAdminDash && typeof global.portalAdminNavigateToCsCliq === "function") {
      await global.portalAdminNavigateToCsCliq();
    }
    if (row.group_id && typeof global.portalAdminDmOpenGroupThread === "function") {
      global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
      global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = String(row.group_id);
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = "";
      await global.portalAdminDmOpenGroupThread(String(row.group_id));
      return;
    }
    if (row.thread_id && typeof global.portalAdminDmOpenThread === "function") {
      global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = String(row.thread_id);
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = "";
      await global.portalAdminDmOpenThread(String(row.thread_id));
      return;
    }
    var calls = global.portalStaffChatCalls;
    if (calls && typeof calls.openIncomingCallChatContext === "function") {
      await calls.openIncomingCallChatContext(row);
      return;
    }
    try {
      if (typeof global.closeSheet === "function") {
        global.closeSheet({ bypassAnnouncementLock: true });
      }
    } catch (_c) {}
    if (typeof global.openSheet === "function") {
      global.openSheet("internalChatSheet");
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  async function handleIncomingCallPush(opts) {
    opts = opts || {};
    var msgId = String(opts.msgId || opts.messageId || "").trim();
    var src = String(opts.src || opts.source || "dm").trim() === "group" ? "group" : "dm";
    if (!msgId) return false;

    stashPendingIncomingCall({ msgId: msgId, src: src });

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

    var data =
      calls.parseCallPayload && typeof calls.parseCallPayload === "function"
        ? calls.parseCallPayload(String(row.body || ""))
        : null;
    if (
      typeof calls.isIncomingCallInviteLive === "function" &&
      !(await calls.isIncomingCallInviteLive(client, row, data))
    ) {
      if (typeof calls.stopIncomingCallAlert === "function") {
        calls.stopIncomingCallAlert();
      }
      try {
        global.sessionStorage.removeItem(PENDING_CALL_KEY);
      } catch (_dead) {}
      return false;
    }

    await openChatForIncomingRow(row);

    if (typeof calls.processIncomingCallRow === "function") {
      calls.processIncomingCallRow(row, 0);
      try {
        global.sessionStorage.removeItem(PENDING_CALL_KEY);
      } catch (_clr) {}
      return true;
    }
    return false;
  }

  function handlePushMessage(data) {
    if (!data || data.portalOpen !== "incoming_call") return;
    var call = data.call || {};
    var msgId = String(call.messageId || call.msgId || "").trim();
    if (!msgId) return;
    void handleIncomingCallPush({
      msgId: msgId,
      src: call.source || call.src || "dm",
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

  function bindPendingIncomingCallOnVisible() {
    if (global.__PORTAL_INCOMING_CALL_VIS_BOUND__) return;
    global.__PORTAL_INCOMING_CALL_VIS_BOUND__ = true;
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.visibilityState !== "visible") return;
      var pending = consumePendingIncomingCall();
      if (!pending || !pending.msgId) return;
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
        void handleIncomingCallPush(pending);
        return;
      }
      stashPendingIncomingCall(pending);
      global.addEventListener(
        "portal:supabase-ready",
        function () {
          void handleIncomingCallPush(pending);
        },
        { once: true }
      );
    });
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
    bindPendingIncomingCallOnVisible();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", consumeIncomingCallQueryOnReady);
    } else {
      consumeIncomingCallQueryOnReady();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
