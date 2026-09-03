/**
 * Communications unread badge + Staff COMMS launcher.
 * Same count on Staff, Admin, CEO and Office — per signed-in user, not shared reads.
 */
(function (global) {
  "use strict";

  function normalizeKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isCommsUser(_key) {
    return true;
  }

  function supabaseBox() {
    return global.__PORTAL_SUPABASE__ || null;
  }

  function client() {
    var box = supabaseBox();
    return box && box.client ? box.client : null;
  }

  var lastUnreadCount = 0;
  var fetchInFlight = null;
  var unreadRetryTimer = null;
  var unreadRefreshQueued = false;
  var unreadChannel = null;
  var COMMS_ICO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

  function detectFromPortal() {
    try {
      var path = String(global.location && global.location.pathname || "").toLowerCase();
      if (path.indexOf("admin_dashboard") >= 0) return "admin";
      if (path.indexOf("ceo_dashboard") >= 0) return "ceo";
      if (path.indexOf("office_portal") >= 0) return "office";
      if (path.indexOf("staff_dashboard") >= 0) return "staff";
    } catch (_e) {}
    return "";
  }

  function commsUrl() {
    try {
      var u = new URL("comunicaciones.html", global.location.href);
      var from = detectFromPortal();
      if (from) u.searchParams.set("from", from);
      return u.href;
    } catch (_e) {
      var from2 = detectFromPortal();
      return from2 ? "comunicaciones.html?from=" + encodeURIComponent(from2) : "comunicaciones.html";
    }
  }

  function openApp() {
    global.location.href = commsUrl();
  }

  function currentStaffKey() {
    try {
      if (typeof global.resolveTopbarStaffKey === "function") {
        var k = normalizeKey(global.resolveTopbarStaffKey() || "");
        if (k) return k;
      }
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        return normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
    } catch (_e) {}
    return "";
  }

  function unreadLabel(n) {
    if (n > 99) return "99+";
    return String(n);
  }

  function paintDataUnreadNodes(count) {
    var nodes = document.querySelectorAll("[data-comms-unread]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = count > 0 ? unreadLabel(count) : "0";
      el.classList.toggle("is-empty", count < 1);
      try {
        el.removeAttribute("hidden");
      } catch (_h) {}
      el.hidden = false;
      el.setAttribute("aria-hidden", count < 1 ? "true" : "false");
      var host = el.closest("[data-comms-unread-host]") || el.parentElement;
      if (host) host.classList.toggle("portal-comms-has-unread", count > 0);
    }
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    paintDataUnreadNodes(lastUnreadCount);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      var inGrid = btn.classList.contains("topbar-tool-btn--staff-wa");
      btn.classList.toggle("topbar-staff-wa-btn--unread", !inGrid && lastUnreadCount > 0);
      btn.classList.toggle("topbar-tool-btn--staff-wa-unread", inGrid && lastUnreadCount > 0);
      var badge = btn.querySelector("[data-comms-unread], .topbar-staff-wa-btn__badge");
      if (lastUnreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "topbar-staff-wa-btn__badge";
          badge.setAttribute("data-comms-unread", "");
          badge.setAttribute("aria-hidden", "true");
          btn.appendChild(badge);
        }
        badge.hidden = false;
        badge.classList.remove("is-empty");
        badge.textContent = unreadLabel(lastUnreadCount);
      } else if (badge) {
        badge.hidden = true;
        badge.classList.add("is-empty");
        badge.textContent = "0";
      }
      var lab = lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications";
      btn.setAttribute("aria-label", lab);
      var labelEl = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
      if (labelEl) labelEl.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
    }
    var adminBtn = document.getElementById("btnComunicaciones");
    if (adminBtn) {
      adminBtn.classList.toggle("admin-icon-btn--has-alerts", lastUnreadCount > 0);
      adminBtn.setAttribute(
        "aria-label",
        lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications"
      );
    }
    var alertsBlock = document.getElementById("portalStaffWaAlertsBlock");
    var alertsStatus = document.getElementById("portalStaffWaAlertsStatus");
    var alertsBtn = document.getElementById("portalStaffWaAlertsOpenBtn");
    if (alertsBlock) {
      alertsBlock.hidden = false;
      alertsBlock.classList.toggle("portal-alerts-block--wa-unread", lastUnreadCount > 0);
      if (alertsStatus) {
        alertsStatus.textContent =
          lastUnreadCount > 0
            ? lastUnreadCount === 1
              ? "1 unread message"
              : lastUnreadCount + " unread messages"
            : "No unread messages";
      }
      if (alertsBtn) {
        alertsBtn.textContent = lastUnreadCount > 0 ? "Open Communications (" + lastUnreadCount + ")" : "Open Communications";
      }
    }
    try {
      global.dispatchEvent(
        new CustomEvent("portal:comms-unread", { detail: { count: lastUnreadCount } })
      );
    } catch (_ev) {}
  }

  function scheduleUnreadRetry() {
    if (unreadRetryTimer) return;
    unreadRetryTimer = global.setTimeout(function () {
      unreadRetryTimer = null;
      void refreshUnread();
    }, 700);
  }

  async function refreshUnread() {
    if (fetchInFlight) {
      unreadRefreshQueued = true;
      return fetchInFlight;
    }
    fetchInFlight = (async function () {
      try {
        var c = client();
        if (!c || !c.rpc) {
          scheduleUnreadRetry();
          return lastUnreadCount;
        }
        var res = await c.rpc("communication_unread_count");
        if (res.error) {
          scheduleUnreadRetry();
          return lastUnreadCount;
        }
        var next = Math.max(0, Number(res.data) || 0);
        applyUnreadBadge(next);
        subscribeUnreadRealtime();
        watchIncomingCalls();
        bindIntrinsicCommsAlerts();
        return lastUnreadCount;
      } catch (_e) {
        scheduleUnreadRetry();
        return lastUnreadCount;
      } finally {
        fetchInFlight = null;
        if (unreadRefreshQueued) {
          unreadRefreshQueued = false;
          void refreshUnread();
        }
      }
    })();
    return fetchInFlight;
  }

  function subscribeUnreadRealtime() {
    var c = client();
    if (!c || typeof c.channel !== "function") return;
    if (unreadChannel) return;
    try {
      unreadChannel = c
        .channel("portal-comms-unread-badge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_messages" },
          function (payload) {
            var row = (payload && payload.new) || {};
            bumpUnreadFromIncoming(row);
            maybeShowMessageToast(row);
            void refreshUnread();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_message_reads" },
          function () {
            void refreshUnread();
          }
        )
        .subscribe();
    } catch (_rt) {
      unreadChannel = null;
    }
  }

  function myUserId() {
    try {
      var box = supabaseBox();
      if (box && box.staff_profile && box.staff_profile.id) return String(box.staff_profile.id);
      if (box && box.session && box.session.user && box.session.user.id) {
        return String(box.session.user.id);
      }
    } catch (_e) {}
    return "";
  }

  function isCommsAppPage() {
    try {
      return String(global.location && global.location.pathname || "")
        .toLowerCase()
        .indexOf("comunicaciones") >= 0;
    } catch (_e2) {
      return false;
    }
  }

  function commsUrlWith(params) {
    var href = commsUrl();
    try {
      var url = new URL(href, global.location.href);
      Object.keys(params || {}).forEach(function (k) {
        if (params[k]) url.searchParams.set(k, params[k]);
      });
      return url.href;
    } catch (_e) {
      return href;
    }
  }

  var incomingCallChannel = null;
  var incomingCallState = null;
  var incomingCueTimer = null;
  var messageToastTimer = null;
  var messageToastCount = 0;

  function previewMessageBody(row) {
    var type = String((row && row.message_type) || "text").toLowerCase();
    if (type === "image") return "Photo";
    if (type === "file") return String((row && row.file_name) || "File");
    if (type === "voice") return "Voice note";
    var body = String((row && row.body) || "").replace(/\s+/g, " ").trim();
    if (!body) return "New message";
    return body.length > 90 ? body.slice(0, 89) + "..." : body;
  }

  function messageToastSender(row) {
    var ctx = String((row && row.sender_context) || "").toUpperCase();
    if (ctx === "ADMINISTRATION" || ctx === "ADMIN") return "ADMIN";
    return "Communications";
  }

  function ensureMessageToast() {
    if (document.getElementById("portalCommsMsgToast")) {
      return document.getElementById("portalCommsMsgToast");
    }
    if (!document.getElementById("portalCommsIncomingCss")) {
      ensureIncomingOverlay();
    }
    if (!document.getElementById("portalCommsMsgToastCss")) {
      var st = document.createElement("style");
      st.id = "portalCommsMsgToastCss";
      st.textContent =
        "#btnComunicaciones,#topbarStaffWaBtn{overflow:visible!important}" +
        "#portalCommsMsgToast{position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147482500;display:flex;gap:10px;align-items:center;max-width:28rem;margin:0 auto;padding:12px 12px 12px 14px;border-radius:16px;background:#173247;color:#fff;box-shadow:0 12px 32px rgba(15,23,42,.35);border:1px solid rgba(255,255,255,.14);min-width:0}" +
        "#portalCommsMsgToast[hidden]{display:none!important}" +
        "#portalCommsMsgToast .portal-comms-toast-copy{min-width:0;flex:1}" +
        "#portalCommsMsgToast strong{display:block;font-size:13px;line-height:1.25;overflow-wrap:anywhere}" +
        "#portalCommsMsgToast span{display:block;margin-top:2px;font-size:12px;color:rgba(255,255,255,.78);overflow-wrap:anywhere;max-height:2.6em;overflow:hidden}" +
        "#portalCommsMsgToastOpen{flex:0 0 auto;padding:8px 12px;border:0;border-radius:999px;background:#16a34a;color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}";
      (document.head || document.documentElement).appendChild(st);
    }
    var el = document.createElement("div");
    el.id = "portalCommsMsgToast";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="portal-comms-toast-copy"><strong id="portalCommsMsgToastTitle">Communications</strong><span id="portalCommsMsgToastBody">New message</span></div>' +
      '<button type="button" id="portalCommsMsgToastOpen">Open</button>';
    (document.body || document.documentElement).appendChild(el);
    el.addEventListener("click", function (ev) {
      if (ev.target && ev.target.id === "portalCommsMsgToastOpen") return;
      hideMessageToast();
      openApp();
    });
    document.getElementById("portalCommsMsgToastOpen").addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      hideMessageToast();
      openApp();
    });
    return el;
  }

  function hideMessageToast() {
    if (messageToastTimer) {
      global.clearTimeout(messageToastTimer);
      messageToastTimer = null;
    }
    messageToastCount = 0;
    var el = document.getElementById("portalCommsMsgToast");
    if (el) el.hidden = true;
  }

  function bumpUnreadFromIncoming(row) {
    if (!row) return;
    var type = String(row.message_type || "text").toLowerCase();
    if (type === "system") return;
    if (String(row.performed_by_user_id || "") === myUserId()) return;
    applyUnreadBadge(lastUnreadCount + 1);
  }

  function maybeShowMessageToast(row) {
    if (isCommsAppPage() || !row) return;
    var type = String(row.message_type || "text").toLowerCase();
    if (type === "system" || type === "call") return;
    if (String(row.performed_by_user_id || "") === myUserId()) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    messageToastCount += 1;
    var el = ensureMessageToast();
    var titleEl = document.getElementById("portalCommsMsgToastTitle");
    var bodyEl = document.getElementById("portalCommsMsgToastBody");
    if (titleEl) {
      titleEl.textContent =
        messageToastCount > 1
          ? "Communications (" + messageToastCount + " new)"
          : messageToastSender(row);
    }
    if (bodyEl) bodyEl.textContent = previewMessageBody(row);
    el.hidden = false;
    try {
      if (typeof global.portalPlayAlertCue === "function") {
        global.portalPlayAlertCue({ vibrate: [180, 80, 180] });
      } else if (global.navigator && global.navigator.vibrate) {
        global.navigator.vibrate([180, 80, 180]);
      }
    } catch (_cue) {}
    if (messageToastTimer) global.clearTimeout(messageToastTimer);
    messageToastTimer = global.setTimeout(hideMessageToast, 8000);
  }

  function subscribeIfNotifyGranted() {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        void global.portalEnsureWebPushSubscription();
      }
    } catch (_s) {}
  }

  function requestCommsNotifyQuietly() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      subscribeIfNotifyGranted();
      return;
    }
    if (Notification.permission === "denied") return;
    try {
      void Notification.requestPermission().then(function (r) {
        if (r === "granted") subscribeIfNotifyGranted();
      });
    } catch (_r) {}
  }

  function bindIntrinsicCommsAlerts() {
    if (global.__PORTAL_COMMS_ALERTS_BOUND__) {
      subscribeIfNotifyGranted();
      return;
    }
    global.__PORTAL_COMMS_ALERTS_BOUND__ = true;
    subscribeIfNotifyGranted();
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    function onFirstGesture() {
      document.removeEventListener("pointerdown", onFirstGesture, true);
      document.removeEventListener("keydown", onFirstGesture, true);
      requestCommsNotifyQuietly();
    }
    document.addEventListener("pointerdown", onFirstGesture, true);
    document.addEventListener("keydown", onFirstGesture, true);
  }

  function stopIncomingCue() {
    if (incomingCueTimer) {
      global.clearInterval(incomingCueTimer);
      incomingCueTimer = null;
    }
    try {
      if (global.navigator && global.navigator.vibrate) global.navigator.vibrate(0);
    } catch (_v) {}
  }

  function playIncomingCue() {
    try {
      if (global.navigator && global.navigator.vibrate) {
        global.navigator.vibrate([500, 180, 500, 180, 700]);
      }
    } catch (_v) {}
    try {
      if (typeof global.portalPlayAlertCue === "function") {
        global.portalPlayAlertCue({ vibrate: [500, 180, 500, 180, 700] });
        return;
      }
    } catch (_c) {}
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.08;
      o.start();
      o.stop(ctx.currentTime + 0.28);
    } catch (_a) {}
  }

  function ensureIncomingOverlay() {
    if (document.getElementById("portalCommsIncoming")) {
      return document.getElementById("portalCommsIncoming");
    }
    if (!document.getElementById("portalCommsIncomingCss")) {
      var st = document.createElement("style");
      st.id = "portalCommsIncomingCss";
      st.textContent =
        "#portalCommsIncoming{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));background:rgba(5,12,20,.94)}" +
        "#portalCommsIncoming[hidden]{display:none!important}" +
        ".portal-comms-incoming-card{width:100%;max-width:24rem;padding:28px 22px 22px;border-radius:24px;background:#173247;border:1px solid rgba(255,255,255,.16);color:#fff;text-align:center}" +
        ".portal-comms-incoming-card h2{margin:0 0 6px;font-size:18px}" +
        ".portal-comms-incoming-card p{margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.78)}" +
        ".portal-comms-incoming-actions{display:flex;gap:10px}" +
        ".portal-comms-incoming-actions button{flex:1;min-width:0;padding:12px 10px;border-radius:999px;border:0;font:inherit;font-size:14px;font-weight:800;cursor:pointer}" +
        "#portalCommsIncomingDecline{background:rgba(255,255,255,.12);color:#fff}" +
        "#portalCommsIncomingAnswer{background:#16a34a;color:#fff}";
      (document.head || document.documentElement).appendChild(st);
    }
    var el = document.createElement("div");
    el.id = "portalCommsIncoming";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Incoming call");
    el.innerHTML =
      '<div class="portal-comms-incoming-card">' +
      "<h2 id=\"portalCommsIncomingTitle\">Incoming call</h2>" +
      "<p id=\"portalCommsIncomingSub\">Communications</p>" +
      '<div class="portal-comms-incoming-actions">' +
      '<button type="button" id="portalCommsIncomingDecline">Decline</button>' +
      '<button type="button" id="portalCommsIncomingAnswer">Answer</button>' +
      "</div></div>";
    (document.body || document.documentElement).appendChild(el);
    document.getElementById("portalCommsIncomingAnswer").addEventListener("click", function () {
      answerIncomingOverlay();
    });
    document.getElementById("portalCommsIncomingDecline").addEventListener("click", function () {
      void declineIncomingOverlay();
    });
    return el;
  }

  function hideIncomingOverlay() {
    stopIncomingCue();
    incomingCallState = null;
    var el = document.getElementById("portalCommsIncoming");
    if (el) el.hidden = true;
  }

  function showIncomingOverlay(row) {
    if (isCommsAppPage() || !row || !row.id) return;
    var uid = myUserId();
    if (uid && String(row.initiated_by || "") === uid) return;
    if (String(row.status || "calling") !== "calling") return;
    if (incomingCallState && String(incomingCallState.id) === String(row.id)) return;
    incomingCallState = {
      id: String(row.id),
      type: String(row.type || "AUDIO"),
      conversation_id: String(row.conversation_id || ""),
    };
    var el = ensureIncomingOverlay();
    var title = document.getElementById("portalCommsIncomingTitle");
    var sub = document.getElementById("portalCommsIncomingSub");
    if (title) {
      title.textContent = incomingCallState.type === "VIDEO" ? "Incoming video call" : "Incoming call";
    }
    if (sub) sub.textContent = "Communications";
    el.hidden = false;
    playIncomingCue();
    if (!incomingCueTimer) {
      incomingCueTimer = global.setInterval(playIncomingCue, 2200);
    }
  }

  function answerIncomingOverlay() {
    var st = incomingCallState;
    hideIncomingOverlay();
    if (!st) return;
    var params = { call: st.id };
    if (st.conversation_id) params.conv = st.conversation_id;
    global.location.href = commsUrlWith(params);
  }

  async function declineIncomingOverlay() {
    var st = incomingCallState;
    hideIncomingOverlay();
    if (!st || !st.id) return;
    var c = client();
    if (!c) return;
    var isGroup = false;
    try {
      if (st.conversation_id) {
        var conv = await c
          .from("communication_conversations")
          .select("type")
          .eq("id", st.conversation_id)
          .maybeSingle();
        isGroup = String((conv && conv.data && conv.data.type) || "").toUpperCase() === "GROUP";
      }
    } catch (_t) {}
    if (isGroup) return;
    try {
      await c.rpc("communication_call_respond", { p_call_id: st.id, p_action: "reject" });
    } catch (_e) {}
  }

  function subscribeIncomingCalls() {
    var c = client();
    if (!c || typeof c.channel !== "function" || isCommsAppPage()) return;
    if (incomingCallChannel) return;
    try {
      incomingCallChannel = c
        .channel("portal-comms-incoming-calls")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_calls" },
          function (payload) {
            var row = (payload && payload.new) || {};
            showIncomingOverlay(row);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "communication_calls" },
          function (payload) {
            var row = (payload && payload.new) || {};
            if (!incomingCallState || String(row.id) !== String(incomingCallState.id)) return;
            if (row.status && row.status !== "calling") hideIncomingOverlay();
          }
        )
        .subscribe(function (status) {
          if (status === "SUBSCRIBED") {
            void pollRingingCalls();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            try {
              c.removeChannel(incomingCallChannel);
            } catch (_rm) {}
            incomingCallChannel = null;
            global.setTimeout(subscribeIncomingCalls, 2500);
          }
        });
    } catch (_rt) {
      incomingCallChannel = null;
    }
  }

  async function pollRingingCalls() {
    if (isCommsAppPage()) return;
    var c = client();
    if (!c || typeof c.from !== "function") return;
    try {
      var res = await c
        .from("communication_calls")
        .select("id,type,status,conversation_id,initiated_by,started_at")
        .eq("status", "calling")
        .order("started_at", { ascending: false })
        .limit(8);
      var rows = (res && res.data) || [];
      if (incomingCallState) {
        var still = rows.some(function (r) {
          return String(r.id) === String(incomingCallState.id) && String(r.status) === "calling";
        });
        if (!still) hideIncomingOverlay();
      }
      if (!incomingCallState) {
        for (var i = 0; i < rows.length; i++) {
          showIncomingOverlay(rows[i]);
          if (incomingCallState) break;
        }
      }
    } catch (_e) {}
  }

  function watchIncomingCalls() {
    subscribeIncomingCalls();
    void pollRingingCalls();
    if (!global.__PORTAL_COMMS_CALL_POLL__) {
      global.__PORTAL_COMMS_CALL_POLL__ = true;
      global.setInterval(function () {
        try {
          if (document.visibilityState === "visible") void pollRingingCalls();
        } catch (_p) {}
      }, 2000);
    }
  }

  function ensurePortalPushSw() {
    if (!global.navigator || !global.navigator.serviceWorker) return;
    try {
      var swUrl = new URL("clubsensational-portal-sw.js?v=20260904-comms-14", global.location.href).href;
      var scopeBase = new URL("./", global.location.href).href;
      global.navigator.serviceWorker.register(swUrl, { scope: scopeBase }).catch(function () {});
    } catch (_sw) {}
  }

  function bindIncomingPushMessages() {
    if (global.__PORTAL_COMMS_PUSH_MSG_BOUND__) return;
    if (!global.navigator || !global.navigator.serviceWorker) return;
    global.__PORTAL_COMMS_PUSH_MSG_BOUND__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        var d = ev && ev.data;
        if (!d) return;
        var open = String(d.portalOpen || "");
        if (d.type === "portal-push-received" && open === "communications_call") {
          var callId = d.call && (d.call.callId || d.call.id);
          if (callId) {
            showIncomingOverlay({
              id: callId,
              type: (d.call && d.call.type) || "AUDIO",
              status: "calling",
              initiated_by: d.senderUserId || "",
              conversation_id: (d.call && (d.call.conversationId || d.call.conversation_id)) || "",
            });
          }
        }
        if (d.type === "portal-push-received" && open === "communications") {
          var toastEl = document.getElementById("portalCommsMsgToast");
          if (!toastEl || toastEl.hidden) {
            maybeShowMessageToast({
              message_type: "text",
              body: d.body || "New message",
              sender_context: "PERSONAL",
              performed_by_user_id: d.senderUserId || "",
            });
          }
          void refreshUnread();
        }
        if (d.type === "portal-notification-click" && (open === "communications" || open === "communications_call")) {
          if (d.url) {
            try {
              global.location.href = d.url;
            } catch (_u) {}
          }
        }
      });
    } catch (_m) {}
  }

  function countSessionTopbarTools() {
    var roots = [];
    var left = document.getElementById("topbarToolsGridLeft");
    var right = document.getElementById("topbarToolsGridRight");
    var legacy = document.getElementById("topbarToolsGrid");
    if (left) roots.push(left);
    if (right) roots.push(right);
    if (!left && !right && legacy) roots.push(legacy);
    var n = 0;
    roots.forEach(function (grid) {
      var cells = grid.querySelectorAll(".topbar-tool-cell");
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (cell.id === "topbarToolCellStaffWa") continue;
        if (cell.classList.contains("topbar-tool-cell--staff-wa")) continue;
        if (cell.hidden) continue;
        n++;
      }
    });
    return n;
  }

  function ensureWaGridCell() {
    var cell = document.getElementById("topbarToolCellStaffWa");
    if (cell) return cell;
    var host =
      document.getElementById("topbarToolsGridRight") ||
      document.getElementById("topbarWaRow") ||
      document.getElementById("topbarToolsGrid");
    if (!host) return null;
    cell = document.createElement("div");
    cell.id = "topbarToolCellStaffWa";
    cell.className = "topbar-tool-cell topbar-tool-cell--staff-wa topbar-tool-cell--span2";
    host.appendChild(cell);
    return cell;
  }

  function styleWaButtonForMode(btn, inGrid) {
    if (!btn) return;
    var lab = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
    var ico = btn.querySelector(".topbar-staff-wa-btn__ico, .topbar-tool-btn__ico");
    if (inGrid) {
      btn.className = "topbar-tool-btn topbar-tool-btn--staff-wa";
      if (ico) ico.className = "topbar-tool-btn__ico";
      if (lab) {
        lab.className = "topbar-tool-label";
        lab.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
      }
    } else {
      btn.className = "topbar-staff-wa-btn";
      if (ico) ico.className = "topbar-staff-wa-btn__ico";
      if (lab) {
        lab.className = "topbar-staff-wa-btn__label";
        lab.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
      }
    }
    if (lastUnreadCount > 0) {
      btn.classList.add(inGrid ? "topbar-tool-btn--staff-wa-unread" : "topbar-staff-wa-btn--unread");
    }
  }

  function placeWaInGrid(btn) {
    if (!btn) return;
    var cell = ensureWaGridCell();
    if (!cell) return;
    styleWaButtonForMode(btn, true);
    cell.hidden = false;
    cell.setAttribute("aria-hidden", "false");
    cell.style.gridColumn = "1 / -1";
    cell.style.width = "100%";
    if (btn.parentNode !== cell) cell.appendChild(btn);
    var right = document.getElementById("topbarToolsGridRight");
    if (right && cell.parentNode !== right) right.appendChild(cell);
  }

  function syncWaTopbarPlacement() {
    var btn = document.getElementById("topbarStaffWaBtn");
    var cell = document.getElementById("topbarToolCellStaffWa");
    var lead = document.querySelector(".topbar-lead");
    if (!btn) {
      if (cell) {
        cell.hidden = true;
        cell.setAttribute("aria-hidden", "true");
      }
      if (lead) lead.classList.remove("topbar-lead--wa-in-grid");
      return;
    }
    placeWaInGrid(btn);
    if (lead) lead.classList.add("topbar-lead--wa-in-grid");
    applyUnreadBadge(lastUnreadCount);
    try {
      if (typeof global.portalSyncHaloFlankToolPlacement === "function") {
        global.portalSyncHaloFlankToolPlacement();
      }
    } catch (_e) {}
  }

  function ensureButton(staffKey) {
    if (
      !document.getElementById("topbarToolsGridLeft") &&
      !document.getElementById("topbarToolsGridRight") &&
      !document.getElementById("topbarToolsGrid") &&
      !document.getElementById("topbarWaRow")
    ) {
      return;
    }
    var existing = document.getElementById("topbarStaffWaBtn");
    if (existing) {
      existing.setAttribute("aria-label", "Communications");
      if (!existing.getAttribute("href") || existing.getAttribute("href").indexOf("comunicaciones") >= 0) {
        existing.setAttribute("href", commsUrl());
      }
      syncWaTopbarPlacement();
      void refreshUnread();
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "topbarStaffWaBtn";
    btn.className = "topbar-staff-wa-btn";
    btn.setAttribute("aria-label", "Communications");
    btn.innerHTML =
      '<span class="topbar-staff-wa-btn__ico" aria-hidden="true">' +
      COMMS_ICO +
      "</span>" +
      '<span class="topbar-staff-wa-btn__label">COMMS</span>';
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openApp();
    });
    placeWaInGrid(btn);
    syncWaTopbarPlacement();
    void refreshUnread();
    return btn;
  }

  function syncForStaffKey(staffKey) {
    ensureButton(staffKey);
    if (isCommsUser(staffKey)) void refreshUnread();
    else applyUnreadBadge(0);
  }

  global.portalStaffWaSyncTopbar = syncForStaffKey;
  global.portalStaffWaSyncPlacement = syncWaTopbarPlacement;
  global.portalCountSessionTopbarTools = countSessionTopbarTools;
  global.portalStaffWaOpen = openApp;
  global.portalStaffWaClose = function () {};
  global.portalStaffIsWhatsappLeaderKey = isCommsUser;
  global.portalStaffWaRefreshUnread = refreshUnread;
  global.portalCommsOpen = openApp;
  global.portalCommsRefreshUnread = refreshUnread;
  global.portalAdminRefreshCommsBadge = refreshUnread;

  function boot() {
    try {
      ensurePortalPushSw();
      bindIncomingPushMessages();
      bindIntrinsicCommsAlerts();
      watchIncomingCalls();
      var key = "";
      if (typeof global.resolveTopbarStaffKey === "function") {
        key = global.resolveTopbarStaffKey() || "";
      }
      if (!key && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        key = normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
      if (
        document.getElementById("topbarToolsGridLeft") ||
        document.getElementById("topbarToolsGridRight") ||
        document.getElementById("topbarToolsGrid") ||
        document.getElementById("topbarWaRow") ||
        document.getElementById("topbarStaffWaBtn")
      ) {
        syncForStaffKey(key);
      } else {
        void refreshUnread();
      }
    } catch (_e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  try {
    global.addEventListener("portal:staff-profile-ready", boot);
    global.addEventListener("portal:supabase-ready", function () {
      boot();
      void refreshUnread();
      watchIncomingCalls();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        void refreshUnread();
        void pollRingingCalls();
      }
    });
  } catch (_e2) {}
  if (!global.__PORTAL_COMMS_UNREAD_POLL__) {
    global.__PORTAL_COMMS_UNREAD_POLL__ = true;
    global.setInterval(function () {
      try {
        if (document.visibilityState === "visible") void refreshUnread();
      } catch (_p) {}
    }, 8000);
  }
})(typeof window !== "undefined" ? window : this);
