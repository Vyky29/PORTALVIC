/**
 * Admin topbar bell — open work only.
 * Incidents, cancellations still to decide, absents still to decide,
 * service-cancel refunds not paid back, unpaid expenses, wellbeing still
 * pending, late incident approvals, session disruptions, general-info
 * updates, parent portal actions (photo, consents, messages, a declined
 * makeup), and makeup accepts whose session is today or later.
 * A makeup whose session date has passed drops off.
 * Closing a makeup accept removes it for that admin only.
 * If the absence was already decided, the bell keeps the accept
 * and drops the earlier decide line.
 * Chat unread uses the Chat button badge in the header only (never this bell).
 * Absent quick marks from the session board stay off this bell.
 * A parent-portal absent with no proof is a notice (none), not a decision.
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
    absent_decision: true,
    parent_absent: true,
    cancel_refund: true,
    staff_support: false,
    general_info: true,
    session_disruption: true,
    makeup_accepted: true,
    parent_action: true,
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

  /** Instructor cancellation report (cx-…). Decide rows are cxdec-, unpaid refunds are cxpay-. */
  function isInstructorCancellationReport(item) {
    var id = String((item && item.id) || "");
    return id.indexOf("cx-") === 0 && id.indexOf("cxdec-") !== 0 && id.indexOf("cxpay-") !== 0;
  }

  function pruneDisallowed() {
    var list = listRef();
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list.filter(function (a) {
      return a && isAllowedKind(a.kind) && !isInstructorCancellationReport(a);
    });
  }

  function londonTodayIso() {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      var y = "";
      var m = "";
      var d = "";
      parts.forEach(function (p) {
        if (p.type === "year") y = p.value;
        if (p.type === "month") m = p.value;
        if (p.type === "day") d = p.value;
      });
      if (y && m && d) return y + "-" + m + "-" + d;
    } catch (_) {}
    var n = new Date();
    return (
      n.getFullYear() +
      "-" +
      String(n.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(n.getDate()).padStart(2, "0")
    );
  }

  function isoDay(value) {
    var d = String(value || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }

  /** Makeup stays on the bell only while the session day has not passed. */
  function makeupStillUpcoming(item) {
    var d = isoDay(item && item.sessionDate);
    if (!d) return false;
    return d >= londonTodayIso();
  }

  function prunePassedMakeups() {
    var list = listRef();
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list.filter(function (a) {
      if (!a || a.kind !== "makeup_accepted") return true;
      return makeupStillUpcoming(a);
    });
  }

  function parentActionDismissedMap() {
    global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED__ =
      global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED__ || Object.create(null);
    return global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED__;
  }

  function parentActionDismissed(item) {
    if (!item) return false;
    var kind = String(item.kind || "");
    if (kind !== "general_info" && kind !== "parent_absent" && kind !== "parent_action") {
      return false;
    }
    var id = String(item.id || "").trim();
    return !!(id && parentActionDismissedMap()[id]);
  }

  async function ensureParentActionDismissed(client) {
    var mine = parentActionDismissedMap();
    if (global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED_AT__) return mine;
    global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED_AT__ = Date.now();
    if (!client || !client.auth || !client.from) return mine;
    try {
      var sess = await client.auth.getSession();
      var uid =
        sess &&
        sess.data &&
        sess.data.session &&
        sess.data.session.user &&
        sess.data.session.user.id;
      if (!uid) return mine;
      var res = await client
        .from("portal_admin_bell_item_reads")
        .select("item_id")
        .eq("user_id", uid)
        .eq("item_kind", "parent_action")
        .limit(400);
      if (res.error) {
        console.warn("[admin-bell] parent action reads", res.error);
        global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED_AT__ = 0;
        return mine;
      }
      (res.data || []).forEach(function (r) {
        if (r && r.item_id) mine[String(r.item_id)] = true;
      });
    } catch (err) {
      global.__PORTAL_ADMIN_PARENT_ACTION_DISMISSED_AT__ = 0;
      console.warn("[admin-bell] parent action reads", err);
    }
    return mine;
  }

  function makeupDismissedMap() {
    global.__PORTAL_ADMIN_MAKEUP_DISMISSED__ =
      global.__PORTAL_ADMIN_MAKEUP_DISMISSED__ || Object.create(null);
    return global.__PORTAL_ADMIN_MAKEUP_DISMISSED__;
  }

  function makeupAcceptDismissed(item) {
    if (!item || item.kind !== "makeup_accepted") return false;
    var id = String(item.recordId || "").trim();
    return !!(id && makeupDismissedMap()[id]);
  }

  function bellShows(item) {
    if (!item || !isAllowedKind(item.kind)) return false;
    if (isInstructorCancellationReport(item)) return false;
    if (item.kind === "chat") return false;
    if (item.kind === "makeup_accepted") {
      if (makeupAcceptDismissed(item)) return false;
      return makeupStillUpcoming(item);
    }
    if (parentActionDismissed(item)) return false;
    return true;
  }

  /**
   * A parent accept is the end of that absence. Drop the earlier
   * "still to decide" line so a late viewer sees the result, not the steps.
   */
  function collapseJudgedMakeupProcess() {
    var list = listRef();
    var acceptedAbsence = Object.create(null);
    list.forEach(function (a) {
      if (!a || a.kind !== "makeup_accepted" || makeupAcceptDismissed(a)) return;
      var key = String(a.caseKey || "").trim();
      if (key) acceptedAbsence[key] = true;
    });
    var keys = Object.keys(acceptedAbsence);
    if (!keys.length) return;
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = list.filter(function (a) {
      if (!a) return false;
      var id = String(a.id || "");
      if (id.indexOf("absdec-") !== 0 && id.indexOf("cxdec-") !== 0) return true;
      return !acceptedAbsence[String(a.recordId || "")];
    });
  }

  function unpaidExpenseCount() {
    var n = 0;
    listRef().forEach(function (a) {
      if (a && a.kind === "expense_unpaid") n++;
    });
    return n;
  }

  function notifyExpenseBadges() {
    if (typeof global.portalPaintUnpaidExpenseBadges === "function") {
      try {
        global.portalPaintUnpaidExpenseBadges();
      } catch (_) {}
    }
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
    /* Instructor cancels + feedback are self-serve; only late incidents need approval. */
    var subType = String(row.submission_type || "").toLowerCase();
    if (subType !== "incident") return null;
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

  function activityFromGeneralInfoLog(row, displayName) {
    if (!row || !row.id) return null;
    var cid = String(row.contact_id || "").trim();
    var who =
      String(displayName || "").trim() ||
      (cid ? "Contact " + cid : "Participant");
    var src = String(row.source || "parent").trim().toLowerCase();
    var by = src === "admin" ? "Office" : "Parent";
    return {
      id: "gi-" + row.id,
      title: "General info updated · " + who,
      sub: by + " changed registration details — review Assessment",
      created_at: row.created_at,
      kind: "general_info",
      view: "clients",
      recordId: cid ? "pp-" + cid : "",
      clientName: who,
      sessionDate: "",
    };
  }

  async function syncGeneralInfoFromServer(client, opts) {
    opts = opts || {};
    if (!client || !client.from) return 0;
    await ensureParentActionDismissed(client);
    var since = new Date();
    since.setDate(since.getDate() - 14);
    var res = await client
      .from("portal_participant_general_info_log")
      .select("id, contact_id, source, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(40);
    if (res.error) {
      console.warn("[admin-bell] general info log", res.error);
      return 0;
    }
    var rows = res.data || [];
    var contactIds = [];
    rows.forEach(function (r) {
      var c = String((r && r.contact_id) || "").trim();
      if (c && contactIds.indexOf(c) < 0) contactIds.push(c);
    });
    var nameByContact = Object.create(null);
    if (contactIds.length) {
      try {
        var pax = await client
          .from("portal_participants")
          .select("contact_id, display_name")
          .in("contact_id", contactIds);
        (pax.data || []).forEach(function (p) {
          if (!p || !p.contact_id) return;
          nameByContact[String(p.contact_id)] = String(p.display_name || "").trim();
        });
      } catch (_) {}
      try {
        var pc = await client
          .from("portal_parent_contacts")
          .select("contact_id, child_display")
          .in("contact_id", contactIds);
        (pc.data || []).forEach(function (p) {
          if (!p || !p.contact_id) return;
          var id = String(p.contact_id);
          if (!nameByContact[id] && p.child_display) {
            nameByContact[id] = String(p.child_display).trim();
          }
        });
      } catch (_) {}
    }
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      var a = activityFromGeneralInfoLog(
        r,
        nameByContact[String(r.contact_id || "")] || "",
      );
      if (!a) return;
      if (parentActionDismissedMap()[a.id]) return;
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

  async function syncMakeupAcceptsFromServer(client, opts) {
    opts = opts || {};
    if (!client || !client.from) return 0;
    var since = new Date();
    since.setDate(since.getDate() - 14);
    var res = await client
      .from("portal_parent_makeup_offers")
      .select("id, grant_id, venue, session_date, session_time, instructor_name, status, responded_at")
      .eq("status", "accepted")
      .gte("responded_at", since.toISOString())
      .order("responded_at", { ascending: false })
      .limit(30);
    if (res.error) {
      console.warn("[admin-bell] makeup accepts", res.error);
      return 0;
    }
    var rows = res.data || [];
    var grantIds = [];
    rows.forEach(function (r) {
      var g = String((r && r.grant_id) || "").trim();
      if (g && grantIds.indexOf(g) < 0) grantIds.push(g);
    });
    var nameByGrant = Object.create(null);
    if (grantIds.length) {
      try {
        var grants = await client
          .from("portal_parent_makeup_grants")
          .select("id, participant_display, absence_report_id")
          .in("id", grantIds);
        (grants.data || []).forEach(function (g) {
          if (!g || !g.id) return;
          nameByGrant[String(g.id)] = {
            name: String(g.participant_display || "").trim(),
            absenceId: String(g.absence_report_id || "").trim(),
          };
        });
      } catch (_) {}
    }
    var dismissed = await loadMakeupDismissedIds(client);
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      if (dismissed[String(r.id)]) return;
      var sessionDay = isoDay(r.session_date);
      if (!sessionDay || sessionDay < londonTodayIso()) return;
      var grant = nameByGrant[String(r.grant_id || "")] || {};
      var who = grant.name || "Participant";
      var when = [r.session_date, r.session_time, r.venue, r.instructor_name]
        .map(function (x) { return String(x || "").trim(); })
        .filter(Boolean)
        .join(" · ");
      pushActivityAlert(
        {
          id: "makeup-accept-" + r.id,
          title: "Makeup accepted · " + who,
          sub: when || "Parent accepted in the parent portal",
          created_at: r.responded_at || r.updated_at,
          kind: "makeup_accepted",
          view: "absents_refunds",
          recordId: String(r.id),
          clientName: who,
          sessionDate: String(r.session_date || "").slice(0, 10),
          caseKey: grant.absenceId || "",
        },
        { silent: opts.silent || bootstrapSilent },
      );
    });
    dropDismissedMakeupAccepts();
    collapseJudgedMakeupProcess();
    prunePassedMakeups();
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return rows.length;
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
    var amt = moneyLabel(row.expense_amount);
    var bits = [title];
    if (d) bits.push(d);
    if (amt) bits.push(amt);
    return {
      id: "expense-" + row.id,
      title: "Expense · pending payment",
      sub: bits.join(" · "),
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
    notifyExpenseBadges();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return unpaid.length;
  }

  function moneyLabel(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (!isFinite(v)) return "";
    if (Math.abs(v - Math.round(v)) < 0.001) return "£" + String(Math.round(v));
    return "£" + v.toFixed(2);
  }

  function absenceStillToDecide(row) {
    if (!row || !row.id) return false;
    var st = String(row.status || "");
    if (st === "pending_review") return true;
    if (st === "missed" && (row.proof_storage_path || row.schedule_override_id)) return true;
    return false;
  }

  function activityFromParentPortalAbsent(row) {
    if (!row || !row.id) return null;
    var payload = row.payload || {};
    if (payload.source && String(payload.source) !== "parent_portal") return null;
    if (String(row.status || "") !== "noted") return null;
    if (String(row.outcome || "") !== "none") return null;
    var who = String(row.participant_display || "Participant").trim() || "Participant";
    var when = String(row.session_date || "").slice(0, 10);
    var service = String(row.service_label || "").trim();
    var bits = [];
    if (service) bits.push(service);
    if (when) bits.push(when);
    bits.push(payload.expects_proof ? "Will upload proof" : "No proof · none");
    return {
      id: "pabs-" + row.id,
      title: "Parent absent · " + who,
      sub: bits.join(" · "),
      created_at: row.created_at || new Date().toISOString(),
      kind: "parent_absent",
      view: "absents_refunds",
      recordId: String(row.id || ""),
      clientName: who,
      sessionDate: when,
    };
  }

  function dropParentAbsentAlerts() {
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
      return String((a && a.id) || "").indexOf("pabs-") !== 0;
    });
  }

  async function syncParentPortalAbsents(edgePost, opts) {
    opts = opts || {};
    if (typeof edgePost !== "function") return 0;
    var bellClient = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client;
    if (bellClient) await ensureParentActionDismissed(bellClient);
    dropParentAbsentAlerts();
    var res = await edgePost("portal-admin-parent-absence-list", {
      status: "parent_portal_notice",
      since: "2026-09-01",
      limit: 40,
    });
    if (res.error) {
      console.warn("[admin-bell] parent absents", res.error);
      return 0;
    }
    var n = 0;
    var reports = (res.data && res.data.reports) || [];
    reports.forEach(function (r) {
      var a = activityFromParentPortalAbsent(r);
      if (!a) return;
      if (parentActionDismissedMap()[a.id]) return;
      pushActivityAlert(a, { silent: true });
      n++;
    });
    if (!opts.silent && typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return n;
  }

  function dropDecideQueueAlerts() {
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
      var id = String((a && a.id) || "");
      return id.indexOf("absdec-") !== 0 && id.indexOf("cxdec-") !== 0 && id.indexOf("cxpay-") !== 0;
    });
  }

  /**
   * Absents still waiting for a decision, one-day cancellations in that same
   * queue, and standing-service refunds that have not been marked paid back.
   * @param {(path: string, body: object) => Promise<{ error?: string, data?: object }>} edgePost
   */
  async function syncDecideQueuesFromServer(edgePost, opts) {
    opts = opts || {};
    if (typeof edgePost !== "function") return 0;
    dropDecideQueueAlerts();
    var n = 0;
    var absRes = await edgePost("portal-admin-parent-absence-list", {
      status: "needs_decision",
      since: "2026-09-01",
      limit: 120,
    });
    if (absRes.error) {
      console.warn("[admin-bell] absents to decide", absRes.error);
    } else {
      var reports = (absRes.data && absRes.data.reports) || [];
      reports.forEach(function (r) {
        if (!absenceStillToDecide(r)) return;
        var isCancel = String(r.case_kind || "") === "cancellation";
        var who = String(r.participant_display || "Participant").trim() || "Participant";
        var when = String(r.session_date || "").slice(0, 10);
        var service = String(r.service_label || "").trim();
        var bits = [];
        if (service) bits.push(service);
        if (when) bits.push(when);
        bits.push(isCancel ? "Decide credit, refund, makeup or none" : "Still to decide");
        pushActivityAlert(
          {
            id: (isCancel ? "cxdec-" : "absdec-") + r.id,
            title: (isCancel ? "Cancellation · " : "Absent · ") + who,
            sub: bits.join(" · "),
            created_at: r.created_at || new Date().toISOString(),
            kind: isCancel ? "cancellation" : "absent_decision",
            view: "absents_refunds",
            recordId: String(r.id || ""),
            clientName: who,
            sessionDate: when,
          },
          { silent: true }
        );
        n++;
      });
    }
    var refRes = await edgePost("portal-admin-parent-credits-list", {
      status: "open",
      kind: "refund",
      source: "club_cancellation",
      limit: 40,
    });
    if (refRes.error) {
      console.warn("[admin-bell] cancel refunds", refRes.error);
    } else {
      var entries = (refRes.data && refRes.data.entries) || [];
      entries.forEach(function (e) {
        if (!e || !e.id) return;
        if (String(e.status || "") !== "open") return;
        if (String(e.source || "") !== "club_cancellation") return;
        var who = String(e.participant_display || "Family").trim() || "Family";
        var amt = moneyLabel(e.amount_gbp);
        var when = String(e.session_date || e.created_at || "").slice(0, 10);
        pushActivityAlert(
          {
            id: "cxpay-" + e.id,
            title: "Cancel refund · " + who,
            sub: (amt ? amt + " · " : "") + "Not paid back yet",
            created_at: e.created_at || new Date().toISOString(),
            kind: "cancel_refund",
            view: "absents_refunds",
            recordId: String(e.id || ""),
            clientName: who,
            sessionDate: when,
          },
          { silent: true }
        );
        n++;
      });
    }
    sortNewestFirst();
    if (!opts.silent && typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    return n;
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
      .eq("submission_type", "incident")
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
    if (isInstructorCancellationReport(item)) return false;
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
      caseKey: item.caseKey || "",
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
    prunePassedMakeups();
    dropDismissedMakeupAccepts();
    collapseJudgedMakeupProcess();
    sortNewestFirst();
    notifyExpenseBadges();
    return listRef().filter(bellShows);
  }

  async function loadMakeupDismissedIds(client) {
    var mine = makeupDismissedMap();
    if (!client || !client.auth || !client.from) return mine;
    var sess = await client.auth.getSession();
    var uid =
      sess &&
      sess.data &&
      sess.data.session &&
      sess.data.session.user &&
      sess.data.session.user.id;
    if (!uid) return mine;
    var res = await client
      .from("portal_admin_bell_item_reads")
      .select("item_id")
      .eq("user_id", uid)
      .eq("item_kind", "makeup_accepted")
      .limit(200);
    if (res.error) {
      console.warn("[admin-bell] makeup dismiss reads", res.error);
      return mine;
    }
    (res.data || []).forEach(function (r) {
      if (r && r.item_id) mine[String(r.item_id)] = true;
    });
    return mine;
  }

  function dropDismissedMakeupAccepts() {
    var mine = makeupDismissedMap();
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
      return !makeupAcceptDismissed(a);
    });
    return mine;
  }

  async function dismissMakeupAccept(client, offerId) {
    var id = String(offerId || "").trim();
    if (!id) return false;
    makeupDismissedMap()[id] = true;
    dropDismissedMakeupAccepts();
    collapseJudgedMakeupProcess();
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    if (!client || !client.auth || !client.from) return true;
    var sess = await client.auth.getSession();
    var uid =
      sess &&
      sess.data &&
      sess.data.session &&
      sess.data.session.user &&
      sess.data.session.user.id;
    if (!uid) return true;
    var res = await client.from("portal_admin_bell_item_reads").insert({
      item_kind: "makeup_accepted",
      item_id: id,
      user_id: uid,
    });
    var code = res && res.error && String(res.error.code || "");
    if (res && res.error && code !== "23505") {
      console.warn("[admin-bell] dismiss makeup accept", res.error);
    }
    return true;
  }

  var PARENT_PHOTO_SOURCES = {
    parent_portal: true,
    parent_portal_reenrol: true,
    re_enrolment: true,
    parent_form: true,
    booking_existing_confirm: true,
    parent_portal_removed: true,
    parent_portal_reenrol_removed: true,
    re_enrolment_removed: true,
    parent_form_removed: true,
    booking_existing_confirm_removed: true,
  };

  async function namesForContacts(client, contactIds) {
    var nameByContact = Object.create(null);
    if (!client || !contactIds.length) return nameByContact;
    try {
      var pax = await client
        .from("portal_participants")
        .select("contact_id, display_name")
        .in("contact_id", contactIds);
      (pax.data || []).forEach(function (p) {
        if (!p || !p.contact_id) return;
        nameByContact[String(p.contact_id)] = String(p.display_name || "").trim();
      });
    } catch (_) {}
    return nameByContact;
  }

  function pushParentAction(item, opts) {
    if (!item || !item.id) return;
    if (parentActionDismissedMap()[item.id]) return;
    pushActivityAlert(item, opts);
  }

  /**
   * Parent portal writes that already landed in a table the office can read.
   * View opens the admin screen that shows the change. Close is per admin.
   */
  async function syncParentPortalActionsFromServer(client, opts) {
    opts = opts || {};
    if (!client || !client.from) return 0;
    try {
      await ensureParentActionDismissed(client);
      global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
        return !a || a.kind !== "parent_action";
      });
      var since = new Date();
      since.setDate(since.getDate() - 14);
      var sinceIso = since.toISOString();
      var silent = opts.silent || bootstrapSilent;
      var photosP = client
        .from("portal_participant_avatar_history")
        .select("id, contact_id, source, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(40);
      var consentsP = client
        .from("portal_participant_parent_consents")
        .select("contact_id, updated_at, updated_by_parent_person_id")
        .gte("updated_at", sinceIso)
        .not("updated_by_parent_person_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(30);
      var declinedP = client
        .from("portal_parent_makeup_offers")
        .select("id, grant_id, venue, session_date, session_time, responded_at")
        .eq("status", "declined")
        .gte("responded_at", sinceIso)
        .order("responded_at", { ascending: false })
        .limit(20);
      var packed = await Promise.all([photosP, consentsP, declinedP]);
      var photosRes = packed[0];
      var consentsRes = packed[1];
      var declinedRes = packed[2];
      var contactIds = [];
      function addContact(id) {
        id = String(id || "").trim();
        if (id && contactIds.indexOf(id) < 0) contactIds.push(id);
      }
      if (photosRes && !photosRes.error) {
        (photosRes.data || []).forEach(function (row) {
          if (!row || !PARENT_PHOTO_SOURCES[String(row.source || "")]) return;
          addContact(row.contact_id);
        });
      } else if (photosRes && photosRes.error) {
        console.warn("[admin-bell] parent photos", photosRes.error);
      }
      if (consentsRes && !consentsRes.error) {
        (consentsRes.data || []).forEach(function (row) {
          addContact(row && row.contact_id);
        });
      } else if (consentsRes && consentsRes.error) {
        console.warn("[admin-bell] parent consents", consentsRes.error);
      }
      var grantIds = [];
      if (declinedRes && !declinedRes.error) {
        (declinedRes.data || []).forEach(function (row) {
          var g = String((row && row.grant_id) || "").trim();
          if (g && grantIds.indexOf(g) < 0) grantIds.push(g);
        });
      } else if (declinedRes && declinedRes.error) {
        console.warn("[admin-bell] makeup declined", declinedRes.error);
      }
      var nameByGrant = Object.create(null);
      if (grantIds.length) {
        try {
          var grants = await client
            .from("portal_parent_makeup_grants")
            .select("id, participant_display")
            .in("id", grantIds);
          (grants.data || []).forEach(function (g) {
            if (!g || !g.id) return;
            nameByGrant[String(g.id)] = String(g.participant_display || "").trim();
          });
        } catch (_) {}
      }
      var names = await namesForContacts(client, contactIds);
      var n = 0;
      if (photosRes && !photosRes.error) {
        (photosRes.data || []).forEach(function (row) {
          if (!row || !row.id) return;
          var source = String(row.source || "");
          if (!PARENT_PHOTO_SOURCES[source]) return;
          var cid = String(row.contact_id || "").trim();
          var who = names[cid] || "Participant";
          var removed = source.indexOf("removed") >= 0;
          pushParentAction(
            {
              id: "pphoto-" + row.id,
              title: (removed ? "Photo removed · " : "Photo updated · ") + who,
              sub: "Parent portal — Active clients",
              created_at: row.created_at,
              kind: "parent_action",
              view: "clients",
              recordId: cid ? "pp-" + cid : "",
              clientName: who,
              sessionDate: "",
            },
            { silent: silent }
          );
          n++;
        });
      }
      if (consentsRes && !consentsRes.error) {
        (consentsRes.data || []).forEach(function (row) {
          if (!row || !row.contact_id || !row.updated_at) return;
          var cid = String(row.contact_id).trim();
          var who = names[cid] || "Participant";
          var stamp = String(row.updated_at);
          pushParentAction(
            {
              id: "pcons-" + cid + "-" + stamp,
              title: "Consents updated · " + who,
              sub: "Parent portal — Parent consents",
              created_at: stamp,
              kind: "parent_action",
              view: "portal_parent_consents",
              recordId: cid,
              clientName: who,
              sessionDate: "",
            },
            { silent: silent }
          );
          n++;
        });
      }
      if (declinedRes && !declinedRes.error) {
        (declinedRes.data || []).forEach(function (row) {
          if (!row || !row.id) return;
          var who = nameByGrant[String(row.grant_id || "")] || "Participant";
          var when = [row.session_date, row.session_time, row.venue]
            .map(function (x) { return String(x || "").trim(); })
            .filter(Boolean)
            .join(" · ");
          pushParentAction(
            {
              id: "pmkdec-" + row.id,
              title: "Makeup declined · " + who,
              sub: (when ? when + " · " : "") + "Parent portal — Absents, refunds and credits",
              created_at: row.responded_at,
              kind: "parent_action",
              view: "absents_refunds",
              recordId: String(row.id),
              clientName: who,
              sessionDate: String(row.session_date || "").slice(0, 10),
            },
            { silent: silent }
          );
          n++;
        });
      }
      sortNewestFirst();
      if (typeof global.__portalAdminRenderAlerts === "function") {
        global.__portalAdminRenderAlerts();
      }
      return n;
    } catch (err) {
      console.warn("[admin-bell] parent portal actions", err);
      return 0;
    }
  }

  async function dismissParentAction(client, alertId) {
    var id = String(alertId || "").trim();
    if (!id) return false;
    parentActionDismissedMap()[id] = true;
    global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ = listRef().filter(function (a) {
      return !a || String(a.id) !== id;
    });
    sortNewestFirst();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      global.__portalAdminRenderAlerts();
    }
    if (!client || !client.auth || !client.from) return true;
    var sess = await client.auth.getSession();
    var uid =
      sess &&
      sess.data &&
      sess.data.session &&
      sess.data.session.user &&
      sess.data.session.user.id;
    if (!uid) return true;
    var res = await client.from("portal_admin_bell_item_reads").insert({
      item_kind: "parent_action",
      item_id: id,
      user_id: uid,
    });
    var code = res && res.error && String(res.error.code || "");
    if (res && res.error && code !== "23505") {
      console.warn("[admin-bell] dismiss parent action", res.error);
    }
    return true;
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
  global.portalAdminUnpaidExpenseCount = unpaidExpenseCount;
  global.portalAdminActivityFromLateRequest = activityFromLateRequest;
  global.portalAdminActivityFromWellbeingNotification = activityFromWellbeingNotification;
  global.portalAdminActivityFromGeneralInfoLog = activityFromGeneralInfoLog;
  global.portalAdminBellSyncGeneralInfoFromServer = syncGeneralInfoFromServer;
  global.portalAdminBellSyncMakeupAcceptsFromServer = syncMakeupAcceptsFromServer;
  global.portalAdminBellSyncParentPortalActions = syncParentPortalActionsFromServer;
  global.portalAdminBellDismissParentAction = dismissParentAction;
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
  global.portalAdminBellDismissMakeupAccept = dismissMakeupAccept;
  global.portalAdminBellDismissAllWellbeing = dismissAllWellbeingNotifications;
  global.portalAdminBellOnStaffDmInsert = onStaffDmInsert;
  global.portalAdminBellSyncSupportUnread = syncSupportUnreadFromMessages;
  global.portalAdminBellClearStaffSupport = clearStaffSupportAlerts;
  global.portalAdminActivityFromSupportDm = activityFromSupportDm;
  global.portalAdminBellRemoveExpenseUnpaid = removeExpenseUnpaidAlert;
  global.portalAdminBellSyncUnpaidExpensesFromServer = syncUnpaidExpensesFromServer;
  global.portalAdminBellSyncDecideQueuesFromServer = syncDecideQueuesFromServer;
  global.portalAdminBellSyncParentAbsents = syncParentPortalAbsents;
  global.portalAdminActivityFromParentPortalAbsent = activityFromParentPortalAbsent;
  global.portalAdminActivityFromUnpaidExpense = activityFromUnpaidExpense;
  unlockBellAudioOnGesture();
})(typeof window !== "undefined" ? window : globalThis);
