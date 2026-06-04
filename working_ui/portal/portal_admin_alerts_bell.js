/**
 * Admin topbar bell — incidents, cancellations, chat, late approval requests only.
 * Newest first; short sound when a new allowed alert arrives.
 */
(function (global) {
  "use strict";

  var ALLOWED = {
    incident: true,
    cancellation: true,
    chat: true,
    late_approval: true,
  };

  var bootstrapSilent = false;
  var lastSoundAt = 0;

  function listRef() {
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ =
      global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ || [];
    return global.__PORTAL_ADMIN_ACTIVITY_ALERTS__;
  }

  function isAllowedKind(kind) {
    return !!ALLOWED[String(kind || "").trim()];
  }

  function sortKey(item) {
    var t = item && item.created_at ? new Date(item.created_at).getTime() : 0;
    return isNaN(t) ? 0 : t;
  }

  function pruneDisallowed() {
    var list = listRef();
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list.filter(function (a) {
      return a && isAllowedKind(a.kind);
    });
  }

  function sortNewestFirst() {
    var list = listRef();
    list.sort(function (a, b) {
      var d = sortKey(b) - sortKey(a);
      if (d !== 0) return d;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }

  function playSound() {
    if (bootstrapSilent) return;
    var now = Date.now();
    if (now - lastSoundAt < 1200) return;
    lastSoundAt = now;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = global.__portalAdminBellAudioCtx;
      if (!ctx) ctx = global.__portalAdminBellAudioCtx = new Ctx();
      if (ctx.state === "suspended") {
        try {
          var p = ctx.resume();
          if (p && typeof p.catch === "function") p.catch(function () {});
        } catch (_) {}
      }
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 784;
      g.gain.value = 0.11;
      o.connect(g);
      g.connect(ctx.destination);
      var t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.11, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      o.start(t0);
      o.stop(t0 + 0.3);
      window.setTimeout(function () {
        try {
          var o2 = ctx.createOscillator();
          var g2 = ctx.createGain();
          o2.type = "sine";
          o2.frequency.value = 988;
          g2.gain.value = 0.09;
          o2.connect(g2);
          g2.connect(ctx.destination);
          var t1 = ctx.currentTime;
          g2.gain.setValueAtTime(0.09, t1);
          g2.gain.exponentialRampToValueAtTime(0.001, t1 + 0.22);
          o2.start(t1);
          o2.stop(t1 + 0.24);
        } catch (_) {}
      }, 140);
    } catch (_) {}
  }

  function lateTypeLabel(t) {
    var x = String(t || "").toLowerCase();
    if (x === "cancellation") return "Cancellation";
    if (x === "incident") return "Incident";
    return "Feedback";
  }

  function activityFromLateRequest(row) {
    if (!row || !row.id) return null;
    var client = String(row.client_name || "Participant").trim() || "Participant";
    var typ = lateTypeLabel(row.submission_type);
    var d = String(row.session_date || "").trim().slice(0, 10);
    return {
      id: "late-" + row.id,
      title: "Approval · " + typ + " · " + client,
      sub:
        (d ? d + " · " : "") +
        String(row.service_label || "").trim() +
        " — past-session form",
      created_at: row.created_at,
      kind: "late_approval",
      view: "c4k_late_submissions",
      recordId: String(row.id || ""),
      clientName: client,
      sessionDate: d,
    };
  }

  function activityFromChatHint(hint, idx) {
    if (!hint) return null;
    var nm = String(hint.displayName || "Someone").trim() || "Someone";
    var id =
      hint.kind === "ceo_group"
        ? "chat-g-" + String(hint.groupId || idx)
        : "chat-t-" + String(hint.threadId || idx);
    return {
      id: id,
      title: "Chat · " + nm,
      sub: "New internal message — tap to open",
      created_at: hint.created_at || new Date().toISOString(),
      kind: "chat",
      view: "chat",
      chatHintIdx: idx,
      recordId: String(hint.threadId || hint.groupId || ""),
      clientName: "",
      sessionDate: "",
    };
  }

  function removeLateRequestAlert(requestId) {
    var id = "late-" + String(requestId || "").trim();
    if (!id || id === "late-") return false;
    var list = listRef();
    var next = list.filter(function (a) {
      return a.id !== id;
    });
    if (next.length === list.length) return false;
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = next;
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return true;
  }

  /**
   * Align bell with pending portal_late_submission_requests (sidebar count uses the same table).
   * @param {import("@supabase/supabase-js").SupabaseClient} client
   * @param {{ silent?: boolean }} [opts]
   */
  async function syncLateRequestsFromServer(client, opts) {
    opts = opts || {};
    if (!client || typeof client.from !== "function") return 0;
    var prevLateIds = listRef()
      .filter(function (a) {
        return a && a.kind === "late_approval";
      })
      .map(function (a) {
        return a.id;
      });
    var res = await client
      .from("portal_late_submission_requests")
      .select(
        "id,created_at,client_name,session_date,submission_type,service_label,status"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(40);
    if (res.error) {
      console.warn("[admin-bell] late requests", res.error);
      return 0;
    }
    var rows = res.data || [];
    var pendingIds = {};
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      pendingIds["late-" + r.id] = true;
    });
    var list = listRef().filter(function (a) {
      if (!a || a.kind !== "late_approval") return true;
      return !!pendingIds[a.id];
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
    rows.forEach(function (r) {
      var a = activityFromLateRequest(r);
      if (!a) return;
      pushActivityAlert(a, {
        silent: opts.silent || bootstrapSilent,
      });
    });
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return rows.length;
  }

  function unlockBellAudioOnGesture() {
    if (global.__portalAdminBellAudioUnlockBound) return;
    global.__portalAdminBellAudioUnlockBound = true;
    function tryResume() {
      try {
        var ctx = global.__portalAdminBellAudioCtx;
        if (ctx && ctx.state === "suspended") {
          var p = ctx.resume();
          if (p && typeof p.catch === "function") p.catch(function () {});
        }
      } catch (_) {}
    }
    ["click", "keydown", "touchstart"].forEach(function (ev) {
      try {
        document.addEventListener(ev, tryResume, { once: true, passive: true });
      } catch (_) {}
    });
  }

  function pushActivityAlert(item, opts) {
    opts = opts || {};
    if (!item || !item.id || !isAllowedKind(item.kind)) return false;
    var list = listRef();
    if (list.some(function (a) {
      return a.id === item.id;
    }))
      return false;
    list.unshift({
      id: item.id,
      title: item.title || "Portal activity",
      sub: item.sub || "",
      t:
        item.t ||
        (typeof global.portalAdminAlertTimeLabel === "function"
          ? global.portalAdminAlertTimeLabel(item.created_at)
          : "New"),
      created_at: item.created_at || null,
      kind: item.kind || "activity",
      view: item.view || "",
      recordId: item.recordId || "",
      clientName: item.clientName || "",
      sessionDate: item.sessionDate || "",
      chatHintIdx:
        item.chatHintIdx === undefined || item.chatHintIdx === null
          ? ""
          : item.chatHintIdx,
    });
    if (list.length > 60) list.length = 60;
    sortNewestFirst();
    if (!opts.silent) {
      playSound();
      if (typeof global.portalAdminShowInboundAlert === "function") {
        global.portalAdminShowInboundAlert({
          title: item.title,
          sub: item.sub,
        });
      }
    }
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return true;
  }

  /** Hints from sync, or generic rows when unread flags are set but sender lookup failed. */
  function resolveChatHints() {
    var hints = global.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || [];
    if (hints.length) return hints;
    var out = [];
    var now = new Date().toISOString();
    if (global.__PORTAL_ADMIN_DM_UNREAD) {
      out.push({
        kind: "staff",
        displayName: "Staff or lead",
        channel: "staff_lead",
        created_at: now,
      });
    }
    if (global.__PORTAL_ADMIN_CEO_DM_UNREAD) {
      out.push({
        kind: "ceo_dm",
        displayName: "CEO / admin chat",
        channel: "ceo_exec",
        created_at: now,
      });
    }
    if (global.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD) {
      out.push({
        kind: "ceo_group",
        groupId: "__unread__",
        displayName: "CEO group",
        channel: "ceo_exec",
        created_at: now,
      });
    }
    return out;
  }

  function syncChatBellAlerts(opts) {
    opts = opts || {};
    var list = listRef().filter(function (a) {
      return a.kind !== "chat";
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
    var hints = resolveChatHints();
    hints.forEach(function (h, idx) {
      var item = activityFromChatHint(h, idx);
      if (item) pushActivityAlert(item, { silent: true });
    });
    sortNewestFirst();
    if (!opts.silent && typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
  }

  function setBootstrapSilent(on) {
    bootstrapSilent = !!on;
  }

  function prepareForRender() {
    pruneDisallowed();
    syncChatBellAlerts({ silent: true });
    sortNewestFirst();
    return listRef().slice();
  }

  function badgeCount() {
    return prepareForRender().length;
  }

  global.portalAdminBellAllowedKind = isAllowedKind;
  global.portalAdminBellPlaySound = playSound;
  global.portalAdminBellSetBootstrapSilent = setBootstrapSilent;
  global.portalAdminBellPruneAndSort = function () {
    pruneDisallowed();
    sortNewestFirst();
  };
  global.portalAdminBellPrepareForRender = prepareForRender;
  global.portalAdminBellBadgeCount = badgeCount;
  global.portalAdminActivityFromLateRequest = activityFromLateRequest;
  global.portalAdminSyncChatBellAlerts = syncChatBellAlerts;
  global.portalAdminBellResolveChatHints = resolveChatHints;
  global.portalAdminPushActivityAlert = pushActivityAlert;
  global.portalAdminBellRemoveLateRequest = removeLateRequestAlert;
  global.portalAdminBellSyncLateFromServer = syncLateRequestsFromServer;
  unlockBellAudioOnGesture();
})(typeof window !== "undefined" ? window : globalThis);
