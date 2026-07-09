/**
 * Admin topbar bell — incidents, cancellations, expenses, wellbeing, late approvals.
 * Chat unread uses the Chat button badge in the header only (never this bell).
 * Absent quick marks are excluded from this bell.
 */
(function (global) {
  "use strict";

  var ALLOWED = {
    incident: true,
    cancellation: true,
    absent: false,
    chat: false,
    late_approval: true,
    wellbeing: true,
    expense_unpaid: true,
    staff_support: false,
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

  function activityFromWellbeingNotification(row) {
    if (!row || !row.id) return null;
    var body = String(row.body || "");
    var staff = "Staff member";
    var reqIdx = body.indexOf(" has requested a wellbeing conversation");
    if (reqIdx > 0) {
      staff = body.slice(0, reqIdx).trim() || staff;
    } else {
      var staffLine = body.split("\n")[0] || "";
      staff = staffLine.replace(/^Staff:\s*/i, "").trim() || staff;
    }
    return {
      id: "wellbeing-" + row.id,
      title: String(row.headline || "Wellbeing Support Request"),
      sub: staff + " — Open 1 to 1 Review",
      created_at: row.created_at,
      kind: "wellbeing",
      view: "wellbeing",
      recordId: String(row.checkin_id || ""),
      clientName: staff,
      sessionDate: "",
    };
  }

  var WELLBEING_BELL_PENDING = {
    needs_1to1: true,
    awaiting_1to1: true,
    in_progress: true,
  };

  function wellbeingCheckinFromRow(row) {
    if (!row) return null;
    var c = row.checkin;
    if (Array.isArray(c)) c = c[0];
    return c && typeof c === "object" ? c : null;
  }

  function wellbeingCheckinStatus(row) {
    var c = wellbeingCheckinFromRow(row);
    return String((c && c.status) || "").toLowerCase();
  }

  function wellbeingBellIsPending(row) {
    var c = wellbeingCheckinFromRow(row);
    if (!c) return false;
    if (c.has_concerns === false) return false;
    return !!WELLBEING_BELL_PENDING[wellbeingCheckinStatus(row)];
  }

  function wellbeingRowIsStale(row) {
    if (!row || !row.id) return true;
    var c = wellbeingCheckinFromRow(row);
    if (!c) return true;
    return !wellbeingBellIsPending(row);
  }

  async function enrichWellbeingRowsWithCheckins(client, rows) {
    if (!client || !rows || !rows.length) return rows;
    var missing = [];
    rows.forEach(function (r) {
      if (!r || !r.checkin_id) return;
      if (!wellbeingCheckinFromRow(r)) missing.push(String(r.checkin_id));
    });
    missing = missing.filter(function (id, i, arr) {
      return arr.indexOf(id) === i;
    });
    if (!missing.length) return rows;
    var res = await client
      .from("portal_staff_wellbeing_checkins")
      .select("id,status,has_concerns")
      .in("id", missing);
    if (res.error) {
      console.warn("[admin-bell] wellbeing checkin lookup", res.error);
      return rows;
    }
    var byId = {};
    (res.data || []).forEach(function (c) {
      if (c && c.id) byId[c.id] = c;
    });
    rows.forEach(function (r) {
      if (!r || wellbeingCheckinFromRow(r)) return;
      r.checkin = byId[String(r.checkin_id || "")] || null;
    });
    return rows;
  }

  async function autoResolveStaleWellbeingNotifications(client, rows) {
    if (!client || !rows || !rows.length) return;
    var staleIds = [];
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      if (wellbeingRowIsStale(r)) staleIds.push(r.id);
    });
    if (!staleIds.length) return;
    var res = await client
      .from("portal_wellbeing_admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", staleIds)
      .is("read_at", null);
    if (res.error) {
      console.warn("[admin-bell] resolve stale wellbeing notifications", res.error);
    }
  }

  function removeWellbeingAlertsForCheckin(checkinId) {
    var cid = String(checkinId || "").trim();
    if (!cid) return false;
    var list = listRef();
    var next = list.filter(function (a) {
      if (!a || a.kind !== "wellbeing") return true;
      return String(a.recordId || "") !== cid;
    });
    if (next.length === list.length) return false;
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = next;
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return true;
  }

  function applyWellbeingRowsToBell(rows, opts) {
    opts = opts || {};
    var pending = (rows || []).filter(wellbeingBellIsPending);
    var pendingIds = {};
    pending.forEach(function (r) {
      if (!r || !r.id) return;
      pendingIds["wellbeing-" + r.id] = true;
    });
    var list = listRef().filter(function (a) {
      if (!a || a.kind !== "wellbeing") return true;
      return !!pendingIds[a.id];
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
    pending.forEach(function (r) {
      var a = activityFromWellbeingNotification(r);
      if (!a) return;
      pushActivityAlert(a, { silent: opts.silent || bootstrapSilent });
    });
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return pending.length;
  }

  async function syncWellbeingFromServer(client, opts) {
    opts = opts || {};
    if (!client || typeof client.from !== "function") return 0;
    var res = await client
      .from("portal_wellbeing_admin_notifications")
      .select(
        "id,created_at,headline,body,checkin_id, checkin:portal_staff_wellbeing_checkins(status,has_concerns)"
      )
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (res.error) {
      console.warn("[admin-bell] wellbeing notifications", res.error);
      return 0;
    }
    var rows = res.data || [];
    await enrichWellbeingRowsWithCheckins(client, rows);
    await autoResolveStaleWellbeingNotifications(client, rows);
    var pending = rows.filter(wellbeingBellIsPending);
    return applyWellbeingRowsToBell(pending, opts);
  }

  async function dismissWellbeingCheckin(client, checkinId) {
    var cid = String(checkinId || "").trim();
    if (!client || !cid) return false;
    var res = await client
      .from("portal_wellbeing_admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("checkin_id", cid)
      .is("read_at", null);
    if (res.error) {
      console.warn("[admin-bell] dismiss wellbeing", res.error);
      return false;
    }
    removeWellbeingAlertsForCheckin(cid);
    return true;
  }

  async function dismissAllWellbeingNotifications(client) {
    if (!client) return false;
    var res = await client
      .from("portal_wellbeing_admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (res.error) {
      console.warn("[admin-bell] dismiss all wellbeing", res.error);
      return false;
    }
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
      return !a || a.kind !== "wellbeing";
    });
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return true;
  }

  async function onWellbeingNotificationInsert(client, row, opts) {
    opts = opts || {};
    if (!client || !row || !row.id) return false;
    var checkinId = String(row.checkin_id || "").trim();
    if (!checkinId) return false;
    var res = await client
      .from("portal_staff_wellbeing_checkins")
      .select("status,has_concerns")
      .eq("id", checkinId)
      .maybeSingle();
    if (res.error || !res.data) return false;
    row.checkin = res.data;
    if (!wellbeingBellIsPending(row)) return false;
    var a = activityFromWellbeingNotification(row);
    if (!a) return false;
    var pushed = pushActivityAlert(a, { silent: !!opts.silent });
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return pushed;
  }

  function onWellbeingCheckinUpdated(row) {
    if (!row || !row.id) return;
    var st = String(row.status || "").toLowerCase();
    if (WELLBEING_BELL_PENDING[st]) return;
    removeWellbeingAlertsForCheckin(row.id);
  }

  function clampSub(text, max) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    max = max || 140;
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
  }

  function activityFromSupportDm(row, authorName) {
    if (!row || !row.id) return null;
    var body = String(row.body || "");
    if (
      global.portalCsCliqSupportRoute &&
      typeof global.portalCsCliqSupportRoute.isSupportRouteBody === "function" &&
      !global.portalCsCliqSupportRoute.isSupportRouteBody(body)
    ) {
      return null;
    }
    if (
      body.indexOf("[CS Cliq Support]") !== 0 &&
      body.indexOf("[CS Cliq Meeting request]") !== 0
    ) {
      return null;
    }
    var nm = String(authorName || "Staff").trim() || "Staff";
    var isMeeting = body.indexOf("[CS Cliq Meeting request]") === 0;
    var preview = body.replace(/^\[CS Cliq[^\]]+\]\s*/i, "").trim();
    return {
      id: "support-author-" + String(row.author_id || row.id),
      title: (isMeeting ? "Meeting request" : "Support") + " · " + nm,
      sub: clampSub(preview, 140) || "Tap to open chat with " + nm,
      created_at: row.created_at || new Date().toISOString(),
      kind: "staff_support",
      view: "cs_cliq",
      recordId: String(row.thread_id || ""),
      clientName: nm,
      sessionDate: "",
    };
  }

  function clearStaffSupportAlerts() {
    var list = listRef().filter(function (a) {
      return !a || a.kind !== "staff_support";
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
  }

  function syncSupportUnreadFromMessages(messages, profBy, me, opts) {
    opts = opts || {};
    if (!Array.isArray(messages) || !messages.length) return 0;
    me = String(me || "").trim();
    var box = global.__PORTAL_SUPABASE__ || {};
    var role = String((box.staff_profile && box.staff_profile.app_role) || "").toLowerCase();
    if (role !== "admin" && role !== "ceo") return 0;
    var pushed = 0;
    var seenAuthors = {};
    messages.forEach(function (row) {
      if (!row || !row.id || !row.thread_id) return;
      if (me && String(row.author_id || "") === me) return;
      var authorId = String(row.author_id || "");
      if (!authorId || seenAuthors[authorId]) return;
      var pr = (profBy && profBy[authorId]) || {};
      var nm = String(pr.full_name || pr.username || "Staff").trim() || "Staff";
      var item = activityFromSupportDm(row, nm);
      if (!item) return;
      seenAuthors[authorId] = true;
      if (pushActivityAlert(item, { silent: !!opts.silent })) pushed++;
    });
    return pushed;
  }

  function isPortalCallMessageRow(row) {
    if (!row) return false;
    var body = String(row.body || "");
    return (
      body.indexOf("[[portal-staff-call:") >= 0 ||
      body.indexOf("[[portal-staff-call-end:") >= 0
    );
  }

  async function onStaffDmInsert(row) {
    if (!row || !row.id || !row.thread_id) return false;
    if (isPortalCallMessageRow(row)) return false;
    var me = "";
    try {
      me = String(
        (global.__PORTAL_SUPABASE__ &&
          global.__PORTAL_SUPABASE__.session &&
          global.__PORTAL_SUPABASE__.session.user &&
          global.__PORTAL_SUPABASE__.session.user.id) ||
          ""
      ).trim();
    } catch (_me) {}
    if (me && String(row.author_id || "") === me) return false;
    var box = global.__PORTAL_SUPABASE__ || {};
    var role = String((box.staff_profile && box.staff_profile.app_role) || "").toLowerCase();
    if (role !== "admin" && role !== "ceo") return false;
    if (typeof global.portalAdminDmNotifyIncomingMessageRow === "function") {
      global.portalAdminDmNotifyIncomingMessageRow(row);
    } else if (typeof global.portalAdminDmPlayIncomingChatAlertSound === "function") {
      global.portalAdminDmPlayIncomingChatAlertSound(row);
    }
    if (typeof global.portalAdminDmSyncIncomingAttention === "function") {
      void global.portalAdminDmSyncIncomingAttention({ suppressNotify: true });
    } else if (typeof global.portalSyncFloatingChatUnreadFromMenuBtn === "function") {
      global.portalSyncFloatingChatUnreadFromMenuBtn();
    }
    return false;
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

  function activityFromUnpaidExpense(row) {
    if (!row || !row.id) return null;
    var title = String(row.title || row.name || "Expense").trim() || "Expense";
    var d = String(row.related_date || row.created_at || "").trim().slice(0, 10);
    return {
      id: "expense-" + row.id,
      title: "Expense · pending payment",
      sub: title + (d ? " · " + d : "") + " — include in payroll",
      created_at: row.created_at || new Date().toISOString(),
      kind: "expense_unpaid",
      view: "portal_docs_expense",
      recordId: String(row.id || ""),
      clientName: "",
      sessionDate: d,
    };
  }

  function removeExpenseUnpaidAlert(documentId) {
    var id = "expense-" + String(documentId || "").trim();
    if (!id || id === "expense-") return false;
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
   * @param {(path: string, body: object) => Promise<{ error?: string, data?: object }>} edgePost
   * @param {{ silent?: boolean, unpaid_since?: string }} [opts]
   */
  async function syncUnpaidExpensesFromServer(edgePost, opts) {
    opts = opts || {};
    if (typeof edgePost !== "function") return 0;
    var list = listRef().filter(function (a) {
      return !a || a.kind !== "expense_unpaid";
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
    var res = await edgePost("portal-admin-expenses-list", {
      unpaid_since: opts.unpaid_since || "2026-04-01",
    });
    if (res.error) {
      console.warn("[admin-bell] unpaid expenses", res.error);
      return 0;
    }
    var unpaid = (res.data && res.data.unpaid) || [];
    unpaid.forEach(function (row) {
      var a = activityFromUnpaidExpense(row);
      if (a && typeof global.portalAdminPushActivityAlert === "function") {
        global.portalAdminPushActivityAlert(a, { silent: opts.silent || bootstrapSilent });
      }
    });
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return unpaid.length;
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
    if (!global.__PORTAL_HIDE_CHAT_UI__) {
      var hints = resolveChatHints();
      hints.forEach(function (h, idx) {
        var item = activityFromChatHint(h, idx);
        if (item) pushActivityAlert(item, { silent: true });
      });
    }
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
    var list = listRef().filter(function (a) {
      return a && a.kind !== "chat";
    });
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list;
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
  global.portalAdminActivityFromWellbeingNotification = activityFromWellbeingNotification;
  global.portalAdminSyncChatBellAlerts = syncChatBellAlerts;
  global.portalAdminBellResolveChatHints = resolveChatHints;
  global.portalAdminPushActivityAlert = pushActivityAlert;
  global.portalAdminBellRemoveLateRequest = removeLateRequestAlert;
  global.portalAdminBellSyncLateFromServer = syncLateRequestsFromServer;
  global.portalAdminBellSyncWellbeingFromServer = syncWellbeingFromServer;
  global.portalAdminBellRemoveWellbeingForCheckin = removeWellbeingAlertsForCheckin;
  global.portalAdminBellOnWellbeingNotificationInsert = onWellbeingNotificationInsert;
  global.portalAdminBellOnWellbeingCheckinUpdated = onWellbeingCheckinUpdated;
  global.portalAdminBellDismissWellbeingCheckin = dismissWellbeingCheckin;
  global.portalAdminBellDismissAllWellbeing = dismissAllWellbeingNotifications;
  global.portalAdminBellOnStaffDmInsert = onStaffDmInsert;
  global.portalAdminBellSyncSupportUnread = syncSupportUnreadFromMessages;
  global.portalAdminBellClearStaffSupport = clearStaffSupportAlerts;
  global.portalAdminActivityFromSupportDm = activityFromSupportDm;
  global.portalAdminBellRemoveExpenseUnpaid = removeExpenseUnpaidAlert;
  global.portalAdminBellSyncUnpaidExpensesFromServer = syncUnpaidExpensesFromServer;
  global.portalAdminActivityFromUnpaidExpense = activityFromUnpaidExpense;
  unlockBellAudioOnGesture();
})(typeof window !== "undefined" ? window : globalThis);
