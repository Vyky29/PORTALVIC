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
    if (box && box.client) return box.client;
    try {
      if (typeof global.portalAdminGetSupabaseClient === "function") {
        var adminClient = global.portalAdminGetSupabaseClient();
        if (adminClient) return adminClient;
      }
    } catch (_a) {}
    if (global.__PORTAL_SUPABASE_SINGLETON__) return global.__PORTAL_SUPABASE_SINGLETON__;
    return null;
  }

  function myUserIds() {
    var ids = {};
    function add(raw) {
      var s = String(raw || "").trim().toLowerCase();
      if (s) ids[s] = true;
    }
    try {
      var box = supabaseBox();
      if (box && box.staff_profile && box.staff_profile.id) add(box.staff_profile.id);
      if (box && box.session && box.session.user && box.session.user.id) add(box.session.user.id);
    } catch (_b) {}
    try {
      if (typeof global.portalCurrentPushAuthUserId === "function") {
        add(global.portalCurrentPushAuthUserId());
      }
    } catch (_p) {}
    try {
      if (typeof global.portalAdminReadStoredAuthSession === "function") {
        var stored = global.portalAdminReadStoredAuthSession();
        if (stored && stored.user && stored.user.id) add(stored.user.id);
      }
    } catch (_s) {}
    return Object.keys(ids);
  }

  function myUserId() {
    return myUserIds()[0] || "";
  }

  function isOwnCommsRow(row) {
    if (!row) return false;
    var mine = myUserIds();
    if (!mine.length) return false;
    var a = String(row.performed_by_user_id || "").trim().toLowerCase();
    var b = String(row.sender_user_id || "").trim().toLowerCase();
    for (var i = 0; i < mine.length; i++) {
      if (a && a === mine[i]) return true;
      if (b && b === mine[i]) return true;
    }
    return false;
  }

  var lastUnreadCount = 0;
  var unreadHoldMin = 0;
  var unreadHoldUntil = 0;
  var lastPersonalCount = -1;
  var lastAdminCount = -1;
  var lastToastMode = "";
  var lastToastConv = "";
  var convMetaCache = {};
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
    var params = {};
    if (lastToastMode) params.mode = lastToastMode;
    if (lastToastConv) params.conv = lastToastConv;
    global.location.href = commsUrlWith(params);
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

  function ensureUnreadBadgeCss() {
    if (typeof document === "undefined") return;
    var st = document.getElementById("portalCommsUnreadBadgeCss");
    if (!st) {
      st = document.createElement("style");
      st.id = "portalCommsUnreadBadgeCss";
    }
    st.textContent =
      "#adminTopbar,.admin-topbar,.admin-topbar-meta,#btnComunicaciones,#topbarStaffWaBtn,#topbarToolCellStaffWa," +
      ".topbar-tool-cell--staff-wa,.topbar-tools-grid{overflow:visible!important;contain:none!important}" +
      "#btnComunicaciones,.admin-icon-btn--chat,#topbarStaffWaBtn,[data-comms-unread-host]," +
      "#topbarStaffWaBtn.topbar-tool-btn{position:relative!important;isolation:isolate!important;overflow:visible!important}" +
      "#topbarStaffWaBtn.topbar-tool-btn--staff-wa{display:inline-flex!important;flex-direction:row!important;" +
      "align-items:center!important;justify-content:center!important;grid-template-rows:none!important;overflow:visible!important}" +
      "#commsBadge.is-empty,.topbar-staff-wa-btn__badge.is-empty,.portal-comms-corner-badge.is-empty{display:none!important}" +
      "#btnComunicaciones.admin-icon-btn--has-alerts,#btnComunicaciones.portal-comms-has-unread{" +
      "border-color:#dc2626!important;background:#fff5f5!important;" +
      "box-shadow:0 0 0 2px rgba(220,38,38,.55)!important;animation:portalCommsBtnPulse 1.1s ease infinite}" +
      "@keyframes portalCommsBtnPulse{0%,100%{box-shadow:0 0 0 2px rgba(220,38,38,.45)}50%{box-shadow:0 0 0 6px rgba(220,38,38,.2)}}" +
      /* 3 IDs so this beats the gold flank pill (`#grid > #cell > .btn`). */
      "#topbarToolsGridRight > #topbarToolCellStaffWa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread," +
      "#topbarToolsGridRight > .topbar-tool-cell--staff-wa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread{" +
      "background:#dc2626!important;border-color:#991b1b!important;color:#fff!important;" +
      "box-shadow:0 0 0 2px rgba(220,38,38,.35),0 2px 8px rgba(220,38,38,.35)!important}" +
      "#topbarToolsGridRight > #topbarToolCellStaffWa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread .topbar-tool-label," +
      "#topbarToolsGridRight > #topbarToolCellStaffWa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread .topbar-staff-wa-btn__label{color:#fff!important}" +
      "#topbarToolsGridRight > #topbarToolCellStaffWa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread .topbar-tool-btn__ico," +
      "#topbarToolsGridRight > #topbarToolCellStaffWa > #topbarStaffWaBtn.topbar-tool-btn--staff-wa-unread .topbar-tool-btn__ico svg{color:#fff!important}" +
      /* Number sits in the gold/red chip (flex item), not an absolute corner that parents clip. */
      "#topbarStaffWaBtn .topbar-staff-wa-btn__badge:not(.is-empty)," +
      "#topbarStaffWaBtn [data-comms-unread]:not(.is-empty){" +
      "position:static!important;display:inline-flex!important;align-items:center;justify-content:center;" +
      "flex:0 0 auto!important;min-width:18px!important;height:18px!important;margin:0 0 0 4px!important;" +
      "padding:0 5px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;" +
      "font-size:11px!important;font-weight:800!important;line-height:18px!important;opacity:1!important;" +
      "visibility:visible!important;z-index:2!important;text-decoration:none!important}";
    (document.head || document.documentElement).appendChild(st);
  }

  var CORNER_BADGE_ON =
    "display:flex!important;align-items:center;justify-content:center;" +
    "position:absolute!important;top:0!important;right:0!important;left:auto!important;bottom:auto!important;" +
    "z-index:80!important;min-width:18px!important;height:18px!important;width:auto!important;" +
    "padding:0 5px!important;margin:0!important;border:0!important;border-radius:999px!important;" +
    "background:#dc2626!important;color:#fff!important;font-size:11px!important;font-weight:800!important;" +
    "line-height:18px!important;letter-spacing:0!important;text-align:center!important;" +
    "box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.28)!important;" +
    "pointer-events:none!important;opacity:1!important;visibility:visible!important;" +
    "flex:0 0 auto!important;transform:none!important";
  var STAFF_BADGE_ON =
    "display:inline-flex!important;align-items:center;justify-content:center;" +
    "position:static!important;top:auto!important;right:auto!important;left:auto!important;bottom:auto!important;" +
    "z-index:2!important;min-width:18px!important;height:18px!important;width:auto!important;" +
    "padding:0 5px!important;margin:0 0 0 4px!important;border:0!important;border-radius:999px!important;" +
    "background:#dc2626!important;color:#fff!important;font-size:11px!important;font-weight:800!important;" +
    "line-height:18px!important;letter-spacing:0!important;text-align:center!important;" +
    "box-shadow:0 0 0 1px rgba(255,255,255,.9)!important;" +
    "pointer-events:none!important;opacity:1!important;visibility:visible!important;" +
    "flex:0 0 auto!important;transform:none!important;text-decoration:none!important";
  var CORNER_BADGE_OFF = "display:none!important";

  function isStaffCommsHost(host) {
    if (!host) return false;
    return host.id === "topbarStaffWaBtn" || host.classList.contains("topbar-tool-btn--staff-wa");
  }

  function paintCornerBadge(host, count) {
    if (!host) return;
    var staffHost = isStaffCommsHost(host);
    try {
      host.style.setProperty("overflow", "visible", "important");
      host.style.setProperty("position", "relative", "important");
      if (staffHost) {
        host.style.setProperty("display", "inline-flex", "important");
        host.style.setProperty("flex-direction", "row", "important");
        host.style.setProperty("align-items", "center", "important");
      }
      var p = host.parentElement;
      var n = 0;
      while (p && n < 3) {
        if (p === document.body || p === document.documentElement) break;
        if (p.classList && p.classList.contains("app")) break;
        p.style.setProperty("overflow", "visible", "important");
        p = p.parentElement;
        n += 1;
      }
    } catch (_p) {}
    if (count > 0) host.setAttribute("data-comms-count", unreadLabel(count));
    else host.removeAttribute("data-comms-count");
    var badge =
      host.querySelector("#commsBadge, .topbar-staff-wa-btn__badge, [data-comms-unread], .portal-comms-corner-badge") ||
      null;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "portal-comms-corner-badge topbar-staff-wa-btn__badge";
      badge.setAttribute("data-comms-unread", "");
      host.appendChild(badge);
    }
    try {
      badge.removeAttribute("hidden");
    } catch (_h) {}
    badge.hidden = false;
    if (count > 0) {
      badge.classList.remove("is-empty");
      badge.textContent = unreadLabel(count);
      badge.style.cssText = staffHost ? STAFF_BADGE_ON : CORNER_BADGE_ON;
      badge.setAttribute("aria-hidden", "false");
    } else {
      badge.classList.add("is-empty");
      badge.textContent = "0";
      badge.style.cssText = CORNER_BADGE_OFF;
      badge.setAttribute("aria-hidden", "true");
    }
  }

  function paintDataUnreadNodes(count) {
    ensureUnreadBadgeCss();
    paintCornerBadge(document.getElementById("btnComunicaciones"), count);
    paintCornerBadge(document.getElementById("topbarStaffWaBtn"), count);
    var hosts = document.querySelectorAll("[data-comms-unread-host]");
    for (var h = 0; h < hosts.length; h++) {
      paintCornerBadge(hosts[h], count);
    }
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    paintDataUnreadNodes(lastUnreadCount);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      btn.classList.toggle("topbar-staff-wa-btn--unread", lastUnreadCount > 0);
      btn.classList.toggle("topbar-tool-btn--staff-wa-unread", lastUnreadCount > 0);
      paintCornerBadge(btn, lastUnreadCount);
      var lab = lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications";
      btn.setAttribute("aria-label", lab);
      var labelEl = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
      if (labelEl) {
        labelEl.textContent = "COMMS";
        labelEl.style.setProperty("overflow", "visible", "important");
      }
    }
    var adminBtn = document.getElementById("btnComunicaciones");
    if (adminBtn) {
      adminBtn.classList.toggle("admin-icon-btn--has-alerts", lastUnreadCount > 0);
      adminBtn.classList.toggle("portal-comms-has-unread", lastUnreadCount > 0);
      adminBtn.setAttribute(
        "aria-label",
        lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications"
      );
      paintCornerBadge(adminBtn, lastUnreadCount);
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
    watchBadgeHosts();
  }

  function watchBadgeHosts() {
    if (global.__PORTAL_COMMS_BADGE_OBS__ || typeof MutationObserver === "undefined") return;
    global.__PORTAL_COMMS_BADGE_OBS__ = true;
    var t = 0;
    var obs = new MutationObserver(function () {
      if (t) return;
      t = global.setTimeout(function () {
        t = 0;
        if (lastUnreadCount > 0) applyUnreadBadge(lastUnreadCount);
      }, 80);
    });
    ["adminTopbar", "topbarToolCellStaffWa", "btnComunicaciones", "topbarStaffWaBtn"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) {
        try {
          obs.observe(n, { childList: true, subtree: true });
        } catch (_o) {}
      }
    });
  }

  function applyUnreadFromServer(n) {
    var next = Math.max(0, Number(n) || 0);
    if (Date.now() < unreadHoldUntil && next < unreadHoldMin) next = unreadHoldMin;
    else if (next >= unreadHoldMin) unreadHoldUntil = 0;
    applyUnreadBadge(next);
  }

  function scheduleUnreadRetry() {
    if (unreadRetryTimer) return;
    unreadRetryTimer = global.setTimeout(function () {
      unreadRetryTimer = null;
      void refreshUnread();
    }, 1500);
  }

  async function hasAuthSession(c) {
    try {
      var box = supabaseBox();
      if (box && box.session && box.session.user && box.session.user.id) return true;
    } catch (_b) {}
    try {
      if (c && c.auth && typeof c.auth.getSession === "function") {
        var gs = await c.auth.getSession();
        if (gs && gs.data && gs.data.session && gs.data.session.user) return true;
      }
    } catch (_s) {}
    return false;
  }

  async function inboxUnreadTotal(c) {
    try {
      var inboxRes = await c.rpc("communication_inbox", { p_mode: "personal" });
      if (inboxRes && inboxRes.error) return 0;
      var data = inboxRes && inboxRes.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (_j) {
          data = {};
        }
      }
      var items = (data && data.items) || (Array.isArray(data) ? data : []);
      var sum = 0;
      for (var i = 0; i < items.length; i++) {
        sum += Math.max(0, Number(items[i] && items[i].unread) || 0);
      }
      return sum;
    } catch (_e) {
      return 0;
    }
  }

  function parseUnreadCounts(raw) {
    var data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_j) {
        data = {};
      }
    }
    if (Array.isArray(data)) data = data[0] || {};
    if (!data || typeof data !== "object") data = {};
    var personal = Math.max(0, Number(data.personal) || 0);
    var administration = Math.max(0, Number(data.administration) || 0);
    var listed = Math.max(0, Number(data.total) || 0);
    return {
      personal: personal,
      administration: administration,
      total: Math.max(listed, personal, administration),
    };
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
        if (!(await hasAuthSession(c))) {
          scheduleUnreadRetry();
          return lastUnreadCount;
        }
        var countsRes = await c.rpc("communication_unread_counts");
        if (countsRes && countsRes.error) {
          var res = await c.rpc("communication_unread_count");
          if (res.error) {
            scheduleUnreadRetry();
            return lastUnreadCount;
          }
          applyUnreadFromServer(Math.max(0, Number(res.data) || 0, await inboxUnreadTotal(c)));
        } else {
          var parsed = parseUnreadCounts(countsRes && countsRes.data);
          if (
            lastPersonalCount >= 0 &&
            parsed.personal > lastPersonalCount &&
            !isCommsAppPage()
          ) {
            lastToastMode = "personal";
            lastToastConv = "";
            maybeShowMessageToast({
              message_type: "text",
              body:
                parsed.personal === 1
                  ? "New message in My account"
                  : parsed.personal + " unread in My account",
              sender_context: "PERSONAL",
              performed_by_user_id: "",
              _alertTitle: "My account",
              _alertMode: "personal",
            });
          }
          if (
            lastAdminCount >= 0 &&
            parsed.administration > lastAdminCount &&
            !isCommsAppPage()
          ) {
            lastToastMode = "administration";
            lastToastConv = "";
            maybeShowMessageToast({
              message_type: "text",
              body:
                parsed.administration === 1
                  ? "New message in ADMIN"
                  : parsed.administration + " unread in ADMIN",
              sender_context: "ADMINISTRATION",
              performed_by_user_id: "",
              _alertTitle: "ADMIN",
              _alertMode: "administration",
            });
          }
          lastPersonalCount = parsed.personal;
          lastAdminCount = parsed.administration;
          var inboxSum = await inboxUnreadTotal(c);
          var n = Math.max(parsed.total, parsed.personal, inboxSum);
          applyUnreadFromServer(n);
          updateCommsLaunchLinks(parsed.personal > 0 || n > 0 ? "personal" : "");
        }
        return lastUnreadCount;
      } catch (_e) {
        scheduleUnreadRetry();
        return lastUnreadCount;
      } finally {
        fetchInFlight = null;
        if (unreadRefreshQueued) {
          unreadRefreshQueued = false;
          global.setTimeout(function () {
            void refreshUnread();
          }, 400);
        }
      }
    })();
    return fetchInFlight;
  }

  function updateCommsLaunchLinks(preferMode) {
    var href = commsUrlWith(preferMode ? { mode: preferMode } : {});
    var hosts = document.querySelectorAll("[data-comms-unread-host]");
    for (var i = 0; i < hosts.length; i++) {
      if (String(hosts[i].tagName || "").toLowerCase() === "a") {
        hosts[i].setAttribute("href", href);
      }
    }
    var staff = document.getElementById("topbarStaffWaBtn");
    if (staff && String(staff.tagName || "").toLowerCase() === "a") {
      staff.setAttribute("href", href);
    }
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
            if (isOwnCommsRow(row)) return;
            bumpUnreadFromIncoming(row);
            void maybeShowMessageToast(row);
            global.setTimeout(function () {
              void refreshUnread();
            }, 900);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_message_reads" },
          function (payload) {
            var row = (payload && payload.new) || {};
            var uid = myUserId();
            if (uid && String(row.user_id || "") !== uid) return;
            unreadHoldUntil = 0;
            void refreshUnread();
          }
        )
        .subscribe(function (status) {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            try {
              c.removeChannel(unreadChannel);
            } catch (_rm) {}
            unreadChannel = null;
            global.setTimeout(subscribeUnreadRealtime, 2500);
          }
        });
    } catch (_rt) {
      unreadChannel = null;
    }
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
  var incomingCallLive = false;
  var incomingCueTimer = null;
  var incomingCueCount = 0;
  var convCallCache = {};
  var messageToastTimer = null;
  var messageToastCount = 0;

  function fetchCallConversation(id) {
    if (!id) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(convCallCache, id)) {
      return Promise.resolve(convCallCache[id]);
    }
    var c = client();
    if (!c || typeof c.from !== "function") return Promise.resolve(null);
    return c
      .from("communication_conversations")
      .select("id,type,employee_id,peer_a,peer_b,group_id")
      .eq("id", id)
      .maybeSingle()
      .then(function (res) {
        if (res && res.data) {
          convCallCache[id] = res.data;
          return res.data;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  async function incomingCallTarget(row) {
    var uid = myUserId();
    if (!row || !row.id) return { forMe: false };
    if (uid && String(row.initiated_by || "") === uid) return { forMe: false };
    if (!uid) return { forMe: false, pending: true };
    var conv = await fetchCallConversation(row.conversation_id);
    if (!conv) return { forMe: false, pending: true };
    var t = String(conv.type || "").toUpperCase();
    var employee = String(conv.employee_id || "");
    var initiated = String(row.initiated_by || "");
    if (t === "ADMIN_STAFF") {
      if (employee === uid) {
        return {
          forMe: true,
          mode: "personal",
          title: String(row.type || "").toUpperCase() === "VIDEO" ? "Incoming video call" : "Incoming call",
          subtitle: "ADMIN is calling you",
        };
      }
      if (initiated && initiated === employee) {
        return {
          forMe: true,
          mode: "administration",
          title: String(row.type || "").toUpperCase() === "VIDEO" ? "Incoming video call" : "Incoming call",
          subtitle: "Worker calling ADMIN",
        };
      }
      return { forMe: false };
    }
    if (t === "PEER" || t === "CEO_PEER") {
      var a = String(conv.peer_a || "");
      var b = String(conv.peer_b || "");
      if (a !== uid && b !== uid) return { forMe: false };
      return {
        forMe: true,
        mode: "personal",
        title: String(row.type || "").toUpperCase() === "VIDEO" ? "Incoming video call" : "Incoming call",
        subtitle: "Communications",
      };
    }
    if (t === "GROUP") {
      return {
        forMe: true,
        mode: "personal",
        title: String(row.type || "").toUpperCase() === "VIDEO" ? "Incoming video call" : "Incoming group call",
        subtitle: "Group call",
      };
    }
    return { forMe: false };
  }

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
    if (!document.getElementById("portalCommsIncomingCss30")) {
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
    if (isOwnCommsRow(row)) return;
    var next = lastUnreadCount + 1;
    unreadHoldMin = next;
    unreadHoldUntil = Date.now() + 25000;
    applyUnreadBadge(next);
  }

  async function conversationAlertMeta(row) {
    if (row && row._alertMode) {
      return {
        mode: String(row._alertMode),
        title: String(row._alertTitle || "My account"),
      };
    }
    var convId = String((row && row.conversation_id) || "");
    if (convId && convMetaCache[convId]) return convMetaCache[convId];
    var fallback = { mode: "personal", title: "Communications" };
    var c = client();
    if (!c || !convId || typeof c.from !== "function") return fallback;
    try {
      var res = await c
        .from("communication_conversations")
        .select("type,employee_id,peer_a,peer_b")
        .eq("id", convId)
        .maybeSingle();
      var conv = res && res.data;
      if (!conv) return fallback;
      var t = String(conv.type || "").toUpperCase();
      var meta;
      if (t === "PEER") meta = { mode: "personal", title: "My account" };
      else if (t === "ADMIN_STAFF") {
        var mine = myUserIds();
        var emp = String(conv.employee_id || "").trim().toLowerCase();
        var isMineThread = false;
        for (var i = 0; i < mine.length; i++) {
          if (emp && emp === mine[i]) {
            isMineThread = true;
            break;
          }
        }
        meta = isMineThread
          ? { mode: "personal", title: "My account" }
          : mine.length
            ? { mode: "administration", title: "ADMIN" }
            : fallback;
      } else meta = { mode: "personal", title: "Communications" };
      convMetaCache[convId] = meta;
      return meta;
    } catch (_e) {
      return fallback;
    }
  }

  function commsNotifyIcon() {
    try {
      return new URL("/portal/app-icon/icon-192.png?v=20260624-push-icon", global.location.href).href;
    } catch (_e) {
      return "/portal/app-icon/icon-192.png";
    }
  }

  function showCommsOsBanner(title, body, convId) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    var url = commsUrlWith(convId ? { conv: convId } : lastToastMode ? { mode: lastToastMode } : {});
    var opts = {
      body: String(body || "New message"),
      icon: commsNotifyIcon(),
      badge: commsNotifyIcon(),
      tag: "comms-msg-" + String(convId || Date.now()),
      renotify: true,
      silent: false,
      data: { url: url, portalOpen: "communications" },
    };
    try {
      if (global.navigator && global.navigator.serviceWorker && global.navigator.serviceWorker.ready) {
        void global.navigator.serviceWorker.ready.then(function (reg) {
          if (reg && reg.showNotification) return reg.showNotification(title || "Communications", opts);
        });
        return;
      }
    } catch (_sw) {}
    try {
      var n = new Notification(title || "Communications", opts);
      n.onclick = function () {
        try {
          global.focus();
          global.location.href = url;
        } catch (_c) {}
        try {
          n.close();
        } catch (_cl) {}
      };
    } catch (_n) {}
  }

  async function maybeShowMessageToast(row) {
    if (isCommsAppPage() || !row) return;
    var type = String(row.message_type || "text").toLowerCase();
    if (type === "system" || type === "call") return;
    if (isOwnCommsRow(row)) return;
    if (typeof global.portalPushIsForCurrentUser === "function" && !global.portalPushIsForCurrentUser(row)) {
      return;
    }
    var meta = await conversationAlertMeta(row);
    lastToastMode = meta.mode || "personal";
    lastToastConv = String(row.conversation_id || lastToastConv || "");
    var preview = previewMessageBody(row);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    messageToastCount += 1;
    var el = ensureMessageToast();
    var titleEl = document.getElementById("portalCommsMsgToastTitle");
    var bodyEl = document.getElementById("portalCommsMsgToastBody");
    if (titleEl) {
      titleEl.textContent =
        messageToastCount > 1 ? meta.title + " (" + messageToastCount + " new)" : meta.title;
    }
    if (bodyEl) bodyEl.textContent = preview;
    el.hidden = false;
    try {
      el.removeAttribute("hidden");
    } catch (_sh) {}
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
    incomingCueCount += 1;
    try {
      if (global.navigator && global.navigator.vibrate) {
        global.navigator.vibrate([400, 160, 400]);
      }
    } catch (_v) {}
    if (incomingCueCount > 1) return;
    try {
      if (typeof global.portalPlayAlertCue === "function") {
        global.portalPlayAlertCue({ vibrate: [400, 160, 400] });
      }
    } catch (_c) {}
  }

  function ensureIncomingBrandHost() {
    var ring = document.getElementById("portalCommsIncomingRing");
    var brand = document.getElementById("portalCommsIncomingBrand");
    if (brand) return brand;
    if (!ring) return null;
    brand = document.createElement("div");
    brand.id = "portalCommsIncomingBrand";
    ring.insertBefore(brand, ring.firstChild);
    return brand;
  }

  function ensureIncomingOverlay() {
    if (document.getElementById("portalCommsIncoming")) {
      ensureIncomingBrandHost();
      if (!document.getElementById("portalCommsConnectingCover")) {
        var liveOld = document.getElementById("portalCommsIncomingLive");
        var hangOld = document.getElementById("portalCommsLiveHang");
        if (liveOld) {
          var coverOld = document.createElement("div");
          coverOld.id = "portalCommsConnectingCover";
          coverOld.className = "portal-comms-connecting-cover";
          coverOld.innerHTML = '<div id="portalCommsConnectingBrand"></div><p>Connecting...</p>';
          liveOld.insertBefore(coverOld, hangOld || null);
        }
      }
      return document.getElementById("portalCommsIncoming");
    }
    if (!document.getElementById("portalCommsIncomingCss30")) {
      var st = document.createElement("style");
      st.id = "portalCommsIncomingCss30";
      st.textContent =
        "#portalCommsIncoming{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));background:rgba(5,12,20,.94)}" +
        "#portalCommsIncoming[hidden]{display:none!important}" +
        "#portalCommsIncoming.is-live{padding:0;align-items:stretch}" +
        ".portal-comms-incoming-card{width:100%;max-width:24rem;padding:28px 22px 22px;border-radius:24px;background:#173247;border:1px solid rgba(255,255,255,.16);color:#fff;text-align:center}" +
        ".portal-comms-call-brand{display:flex;flex-direction:column;align-items:center;gap:14px;margin:0 0 18px}" +
        ".portal-comms-call-logo{width:88px;height:88px;object-fit:contain;flex:0 0 auto}" +
        ".portal-comms-call-kind{width:56px;height:56px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff}" +
        ".portal-comms-call-kind[data-kind=\"audio\"]{background:#16a34a}" +
        ".portal-comms-call-kind[data-kind=\"video\"]{background:#2563eb}" +
        ".portal-comms-call-kind svg{width:28px;height:28px;display:block}" +
        ".portal-comms-incoming-card h2{margin:0 0 6px;font-size:18px}" +
        ".portal-comms-incoming-card p{margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.78)}" +
        ".portal-comms-incoming-actions{display:flex;gap:10px}" +
        ".portal-comms-incoming-actions button{flex:1;min-width:0;padding:12px 10px;border-radius:999px;border:0;font:inherit;font-size:14px;font-weight:800;cursor:pointer}" +
        "#portalCommsIncomingDecline{background:rgba(255,255,255,.12);color:#fff}" +
        "#portalCommsIncomingAnswer{background:#16a34a;color:#fff}" +
        "#portalCommsIncomingLive{position:absolute;inset:0;display:flex;flex-direction:column;background:#0b1b26;min-width:0;min-height:0}" +
        "#portalCommsIncomingLive[hidden]{display:none!important}" +
        "#portalCommsJitsi{flex:1;min-height:50vh;min-width:0;height:100%}" +
        "#portalCommsJitsi iframe{width:100%;height:100%;border:0;display:block}" +
        ".portal-comms-connecting-cover{position:absolute;inset:0 0 64px;z-index:5;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(11,27,38,.88);pointer-events:none;color:#fff;text-align:center;padding:16px}" +
        "#portalCommsIncoming.is-connecting .portal-comms-connecting-cover{display:flex}" +
        ".portal-comms-call-logo-aura{position:relative;width:118px;height:118px;display:flex;align-items:center;justify-content:center}" +
        ".portal-comms-call-logo-aura::before,.portal-comms-call-logo-aura::after{content:\"\";position:absolute;inset:8px;border-radius:50%;border:3px solid #3b82f6;box-shadow:0 0 0 6px rgba(59,130,246,.22);opacity:0}" +
        "#portalCommsIncoming.is-connecting .portal-comms-call-logo-aura::before,#portalCommsIncoming.is-connecting .portal-comms-call-logo-aura::after{animation:portal-comms-logo-aura 1.35s ease-out infinite}" +
        "#portalCommsIncoming.is-connecting .portal-comms-call-logo-aura::after{animation-delay:.45s}" +
        "@keyframes portal-comms-logo-aura{0%{transform:scale(.86);opacity:.95}100%{transform:scale(1.42);opacity:0}}" +
        "@keyframes portal-comms-logo-blink{0%,100%{box-shadow:0 0 0 4px rgba(59,130,246,.95),0 0 22px rgba(59,130,246,.5)}50%{box-shadow:0 0 0 8px rgba(59,130,246,.28),0 0 36px rgba(59,130,246,.85)}}" +
        "#portalCommsIncoming.is-connecting .portal-comms-call-logo{border-radius:50%;animation:portal-comms-logo-blink 1.1s ease-in-out infinite}" +
        "#portalCommsLiveHang{margin:12px 16px max(16px,env(safe-area-inset-bottom));padding:12px 10px;border:0;border-radius:999px;background:#dc2626;color:#fff;font:inherit;font-size:14px;font-weight:800}";
      (document.head || document.documentElement).appendChild(st);
    }
    var el = document.createElement("div");
    el.id = "portalCommsIncoming";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Incoming call");
    el.innerHTML =
      '<div id="portalCommsIncomingRing" class="portal-comms-incoming-card">' +
      '<div id="portalCommsIncomingBrand"></div>' +
      "<h2 id=\"portalCommsIncomingTitle\">Incoming call</h2>" +
      "<p id=\"portalCommsIncomingSub\">Communications</p>" +
      '<div class="portal-comms-incoming-actions">' +
      '<button type="button" id="portalCommsIncomingDecline">Decline</button>' +
      '<button type="button" id="portalCommsIncomingAnswer">Answer</button>' +
      "</div></div>" +
      '<div id="portalCommsIncomingLive" hidden>' +
      '<div id="portalCommsJitsi"></div>' +
      '<div id="portalCommsConnectingCover" class="portal-comms-connecting-cover">' +
      '<div id="portalCommsConnectingBrand"></div>' +
      "<p>Connecting...</p>" +
      "</div>" +
      '<button type="button" id="portalCommsLiveHang">Hang up</button>' +
      "</div>";
    (document.body || document.documentElement).appendChild(el);
    document.getElementById("portalCommsIncomingAnswer").addEventListener("pointerdown", function () {
      var helper = global.PortalCommsCalls;
      var st = incomingCallState;
      if (!helper || !st) return;
      if (typeof helper.prepare === "function") {
        void helper.prepare({
          client: client(),
          callId: st.id,
          conversationId: st.conversation_id,
          displayName: myDashboardCallName(st.mode),
        }).catch(function () {});
      }
    });
    document.getElementById("portalCommsIncomingAnswer").addEventListener("click", function () {
      void answerIncomingOverlay();
    });
    document.getElementById("portalCommsIncomingDecline").addEventListener("click", function () {
      void declineIncomingOverlay();
    });
    document.getElementById("portalCommsLiveHang").addEventListener("click", function () {
      void hangupDashboardCall(true);
    });
    return el;
  }

  function ensureCallsHelper() {
    if (global.PortalCommsCalls) return Promise.resolve(global.PortalCommsCalls);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "/portal/comunicaciones/portal_comms_calls.js?v=20260904-comms-30";
      s.onload = function () {
        if (global.PortalCommsCalls) resolve(global.PortalCommsCalls);
        else reject(new Error("Call service failed to load."));
      };
      s.onerror = function () {
        reject(new Error("Call service failed to load."));
      };
      document.head.appendChild(s);
    });
  }

  function myDashboardCallName(mode) {
    if (mode === "administration") return "ADMIN";
    try {
      var box = supabaseBox();
      var n = box && box.staff_profile && (box.staff_profile.full_name || box.staff_profile.username);
      n = String(n || "").trim();
      if (n) return n;
    } catch (_n) {}
    return "Staff";
  }

  function resetIncomingOverlayLayout() {
    incomingCallLive = false;
    var root = document.getElementById("portalCommsIncoming");
    if (root) {
      root.classList.remove("is-live");
      root.classList.remove("is-connecting");
    }
    var ring = document.getElementById("portalCommsIncomingRing");
    var live = document.getElementById("portalCommsIncomingLive");
    var host = document.getElementById("portalCommsJitsi");
    if (ring) ring.hidden = false;
    if (live) live.hidden = true;
    if (host) {
      try {
        if (global.PortalCommsCalls && typeof global.PortalCommsCalls.stopTracksOn === "function") {
          global.PortalCommsCalls.stopTracksOn(host);
        }
      } catch (_st) {}
      host.innerHTML = "";
    }
  }

  function hideIncomingOverlay() {
    stopIncomingCue();
    incomingCueCount = 0;
    incomingCallState = null;
    incomingCallLive = false;
    try {
      if (global.PortalCommsCalls) global.PortalCommsCalls.dispose();
    } catch (_d) {}
    resetIncomingOverlayLayout();
    var el = document.getElementById("portalCommsIncoming");
    if (el) el.hidden = true;
  }

  async function showIncomingOverlay(row, opts) {
    opts = opts || {};
    if (isCommsAppPage() || !row || !row.id) return;
    if (String(row.status || "calling") !== "calling") return;
    if (incomingCallLive) return;
    var helper = await ensureCallsHelper().catch(function () {
      return null;
    });
    var info;
    if (opts.trusted || row.ring_mode) {
      info = {
        forMe: true,
        mode: row.ring_mode === "administration" ? "administration" : "personal",
        title: row.ring_title || (String(row.type || "").toUpperCase() === "VIDEO" ? "Incoming video call" : "Incoming call"),
        subtitle: row.ring_subtitle || "Communications",
      };
    } else {
      info = helper
        ? await helper.describeIncomingAsync(client(), row, myUserId())
        : await incomingCallTarget(row);
    }
    if (!info.forMe) return;
    if (incomingCallState && String(incomingCallState.id) === String(row.id)) {
      var existing = document.getElementById("portalCommsIncoming");
      if (existing && existing.hidden) {
        existing.hidden = false;
        try {
          existing.removeAttribute("hidden");
        } catch (_h) {}
      }
      return;
    }
    incomingCallState = {
      id: String(row.id),
      type: String(row.type || "AUDIO"),
      conversation_id: String(row.conversation_id || ""),
      mode: info.mode || "personal",
    };
    incomingCueCount = 0;
    var el = ensureIncomingOverlay();
    resetIncomingOverlayLayout();
    incomingCallState.mode = info.mode || "personal";
    var title = document.getElementById("portalCommsIncomingTitle");
    var sub = document.getElementById("portalCommsIncomingSub");
    if (title) title.textContent = info.title || "Incoming call";
    if (sub) sub.textContent = info.subtitle || "Communications";
    var brand = ensureIncomingBrandHost();
    if (brand) {
      brand.innerHTML =
        helper && typeof helper.incomingBrandHtml === "function"
          ? helper.incomingBrandHtml(row.type)
          : "";
    }
    el.hidden = false;
    try {
      el.removeAttribute("hidden");
    } catch (_sh) {}
    playIncomingCue();
    if (!incomingCueTimer) {
      incomingCueTimer = global.setInterval(playIncomingCue, 4000);
    }
    if (helper) {
      if (typeof helper.preload === "function") helper.preload();
      if (typeof helper.prepare === "function") {
        void helper.prepare({
          client: client(),
          callId: row.id,
          conversationId: row.conversation_id,
          displayName: myDashboardCallName(incomingCallState.mode),
        }).catch(function () {});
      }
    }
  }

  async function hangupDashboardCall(notify) {
    var st = incomingCallState;
    incomingCallLive = false;
    try {
      if (global.PortalCommsCalls) global.PortalCommsCalls.dispose();
    } catch (_d) {}
    if (notify && st && st.id) {
      try {
        var c = client();
        if (c) await c.rpc("communication_call_respond", { p_call_id: st.id, p_action: "end" });
      } catch (_e) {}
    }
    hideIncomingOverlay();
  }

  async function answerIncomingOverlay() {
    var st = incomingCallState;
    if (!st || incomingCallLive) return;
    stopIncomingCue();
    incomingCueCount = 0;
    var helper;
    try {
      helper = await ensureCallsHelper();
    } catch (err) {
      window.alert((err && err.message) || "Could not answer.");
      return;
    }
    var el = ensureIncomingOverlay();
    var ring = document.getElementById("portalCommsIncomingRing");
    var live = document.getElementById("portalCommsIncomingLive");
    var host = document.getElementById("portalCommsJitsi");
    if (ring) ring.hidden = true;
    if (live) {
      live.hidden = false;
      try {
        live.removeAttribute("hidden");
      } catch (_lv) {}
    }
    el.classList.add("is-live", "is-connecting");
    incomingCallLive = true;
    var coverBrand = document.getElementById("portalCommsConnectingBrand");
    if (coverBrand && helper && typeof helper.incomingBrandHtml === "function") {
      coverBrand.innerHTML = helper.incomingBrandHtml(st.type);
    }
    var c = client();
    if (!c || !host) {
      window.alert("Could not answer.");
      hideIncomingOverlay();
      return;
    }
    try {
      await helper.join({
        client: c,
        callId: st.id,
        conversationId: st.conversation_id,
        displayName: myDashboardCallName(st.mode),
        video: String(st.type || "").toUpperCase() === "VIDEO",
        parent: host,
        onJoined: function () {
          el.classList.remove("is-connecting");
        },
        onHangup: function () {
          void hangupDashboardCall(true);
        },
      });
      await c.rpc("communication_call_respond", { p_call_id: st.id, p_action: "answer" });
    } catch (err) {
      incomingCallLive = false;
      window.alert((err && err.message) || "Could not answer.");
      if (ring) ring.hidden = false;
      if (live) live.hidden = true;
      el.classList.remove("is-live");
    }
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
    if (isCommsAppPage()) return;
    if (incomingCallChannel) return;
    var c = client();
    if (!c || typeof c.channel !== "function") {
      global.setTimeout(subscribeIncomingCalls, 1500);
      return;
    }
    try {
      incomingCallChannel = c
        .channel("portal-comms-incoming-calls")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_calls" },
          function () {
            void pollRingingCalls();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "communication_calls" },
          function (payload) {
            var row = (payload && payload.new) || {};
            if (!incomingCallState || String(row.id) !== String(incomingCallState.id)) return;
            if (row.status === "answered" && incomingCallLive) return;
            if (row.status && row.status !== "calling" && row.status !== "answered") {
              void hangupDashboardCall(false);
            } else {
              void pollRingingCalls();
            }
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
      global.setTimeout(subscribeIncomingCalls, 2500);
    }
  }

  async function fallbackCallingRows(c) {
    var res = await c
      .from("communication_calls")
      .select("id,type,status,conversation_id,initiated_by,started_at")
      .eq("status", "calling")
      .order("started_at", { ascending: false })
      .limit(8);
    var raw = (res && res.data) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var info = await incomingCallTarget(raw[i]);
      if (info.pending) continue;
      if (!info.forMe) continue;
      raw[i].ring_mode = info.mode;
      raw[i].ring_title = info.title;
      raw[i].ring_subtitle = info.subtitle;
      out.push(raw[i]);
    }
    return out;
  }

  async function pollRingingCalls() {
    if (isCommsAppPage()) return;
    var c = client();
    if (!c || typeof c.from !== "function") return;
    try {
      var rows = [];
      var rpcRes = await c.rpc("communication_ringing_for_me");
      if (rpcRes && !rpcRes.error && Array.isArray(rpcRes.data)) {
        rows = rpcRes.data;
      } else {
        rows = await fallbackCallingRows(c);
      }
      if (incomingCallLive) return;
      if (incomingCallState) {
        var still = rows.some(function (r) {
          return String(r.id) === String(incomingCallState.id);
        });
        if (!still) hideIncomingOverlay();
      }
      if (!incomingCallState && rows.length) {
        await showIncomingOverlay(rows[0], { trusted: true });
      }
    } catch (_e) {
      try {
        var fallback = await fallbackCallingRows(c);
        if (incomingCallLive) return;
        if (!incomingCallState && fallback.length) {
          await showIncomingOverlay(fallback[0], { trusted: true });
        }
      } catch (_f) {}
    }
  }

  function watchIncomingCalls() {
    ensureIncomingOverlay();
    void ensureCallsHelper().catch(function () {});
    subscribeIncomingCalls();
    void pollRingingCalls();
    if (!global.__PORTAL_COMMS_CALL_POLL__) {
      global.__PORTAL_COMMS_CALL_POLL__ = true;
      global.setInterval(function () {
        try {
          if (isCommsAppPage()) return;
          if (document.visibilityState === "visible") void pollRingingCalls();
        } catch (_p) {}
      }, 1500);
    }
  }

  function ensurePortalPushSw() {
    if (!global.navigator || !global.navigator.serviceWorker) return;
    try {
      var swUrl = new URL("clubsensational-portal-sw.js?v=20260905-comms-32", global.location.href).href;
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
          if (typeof global.portalPushIsForCurrentUser === "function" && !global.portalPushIsForCurrentUser(d)) {
            return;
          }
          if (isOwnCommsRow({ performed_by_user_id: d.senderUserId || "", sender_user_id: d.senderUserId || "" })) {
            return;
          }
          var toastEl = document.getElementById("portalCommsMsgToast");
          if (!toastEl || toastEl.hidden) {
            maybeShowMessageToast({
              message_type: "text",
              body: d.body || "New message",
              sender_context: String(d.title || "").toUpperCase() === "ADMIN" ? "ADMINISTRATION" : "PERSONAL",
              performed_by_user_id: d.senderUserId || "",
              _alertTitle: d.title || "Communications",
              _alertMode: String(d.title || "").toUpperCase() === "ADMIN" ? "administration" : "personal",
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
        lab.textContent = "COMMS";
      }
    } else {
      btn.className = "topbar-staff-wa-btn";
      if (ico) ico.className = "topbar-staff-wa-btn__ico";
      if (lab) {
        lab.className = "topbar-staff-wa-btn__label";
        lab.textContent = "COMMS";
      }
    }
    if (lastUnreadCount > 0) {
      btn.classList.add(inGrid ? "topbar-tool-btn--staff-wa-unread" : "topbar-staff-wa-btn--unread");
    }
    paintCornerBadge(btn, lastUnreadCount);
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
    if (lastUnreadCount > 0) applyUnreadBadge(lastUnreadCount);
    try {
      if (typeof global.portalSyncHaloFlankToolPlacement === "function") {
        global.portalSyncHaloFlankToolPlacement();
      }
    } catch (_e) {}
    if (lastUnreadCount > 0) applyUnreadBadge(lastUnreadCount);
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
      '<span class="topbar-staff-wa-btn__label">COMMS</span>' +
      '<span class="topbar-staff-wa-btn__badge is-empty" data-comms-unread aria-hidden="true">0</span>';
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
  global.portalCommsPaintUnread = applyUnreadBadge;

  function boot() {
    try {
      ensurePortalPushSw();
      bindIncomingPushMessages();
      bindIntrinsicCommsAlerts();
      if (isCommsAppPage()) return;
      ensureIncomingOverlay();
      ensureUnreadBadgeCss();
      watchIncomingCalls();
      subscribeUnreadRealtime();
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
      if (isCommsAppPage()) return;
      boot();
      void refreshUnread();
      watchIncomingCalls();
    });
    document.addEventListener("visibilitychange", function () {
      if (isCommsAppPage()) return;
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
        if (isCommsAppPage()) return;
        if (document.visibilityState === "visible") void refreshUnread();
      } catch (_p) {}
    }, 3000);
  }
})(typeof window !== "undefined" ? window : this);
