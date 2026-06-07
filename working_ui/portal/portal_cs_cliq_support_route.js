/**
 * CS Cliq support routing ù one shared management thread per staff (WhatsApp-style).
 */
(function (global) {
  "use strict";

  var SUPPORT_PREFIX = "[CS Cliq Support]";
  var MEETING_PREFIX = "[CS Cliq Meeting request]";

  function clientBox() {
    return global.__PORTAL_SUPABASE__ || {};
  }

  function meId() {
    var box = clientBox();
    return String(
      (box.session && box.session.user && box.session.user.id) ||
        (box.staff_profile && box.staff_profile.id) ||
        ""
    ).trim();
  }

  function dmThreadPairGuess(me, peer) {
    if (typeof global.portalDmCanonThreadParticipantsGuess === "function") {
      return global.portalDmCanonThreadParticipantsGuess(me, peer);
    }
    me = String(me || "").trim();
    peer = String(peer || "").trim();
    return me < peer
      ? { participant_a: me, participant_b: peer }
      : { participant_a: peer, participant_b: me };
  }

  function pickThreadId(rows) {
    var row0 = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return row0 && row0.id ? String(row0.id) : "";
  }

  function isOfficeParticipant(row) {
    if (!row || row.is_active === false) return false;
    var app = String(row.app_role || "").toLowerCase();
    if (app === "admin" || app === "ceo") return true;
    var sr = String(row.staff_role || "").toLowerCase();
    return sr === "manager" || sr === "admin";
  }

  function isWorkerRecipient(row) {
    if (typeof global.portalInternalDmIsWorkerRecipient === "function") {
      return global.portalInternalDmIsWorkerRecipient(row);
    }
    if (!row || row.is_active === false) return false;
    var app = String(row.app_role || "").toLowerCase();
    if (app === "admin" || app === "ceo") return false;
    var sr = String(row.staff_role || "").toLowerCase();
    if (sr === "manager" || sr === "admin") return false;
    return !!(row.full_name || row.username);
  }

  function workerPeerFromThread(row, profBy, me) {
    if (!row) return "";
    if (
      global.portalAdminDmWorkerPeerFromThread &&
      typeof global.portalAdminDmWorkerPeerFromThread === "function"
    ) {
      return global.portalAdminDmWorkerPeerFromThread(row, profBy, me);
    }
    var a = String(row.participant_a || "");
    var b = String(row.participant_b || "");
    var pa = (profBy && profBy[a]) || {};
    var pb = (profBy && profBy[b]) || {};
    if (isWorkerRecipient(pa)) return a;
    if (isWorkerRecipient(pb)) return b;
    me = String(me || "").trim();
    if (a === me) return b;
    if (b === me) return a;
    return a || b;
  }

  function rowWhenMs(row) {
    try {
      return row && row.updated_at ? new Date(row.updated_at).getTime() : 0;
    } catch (_t) {
      return 0;
    }
  }

  async function findDmThreadId(client, userA, userB) {
    userA = String(userA || "").trim();
    userB = String(userB || "").trim();
    if (!client || !userA || !userB || userA === userB) return "";
    var guess = dmThreadPairGuess(userA, userB);
    var a = guess.participant_a;
    var b = guess.participant_b;
    var r = await client
      .from("portal_staff_dm_threads")
      .select("id")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .maybeSingle();
    if (!r.error && r.data && r.data.id) return String(r.data.id);
    var r2 = await client
      .from("portal_staff_dm_threads")
      .select("id")
      .eq("participant_a", b)
      .eq("participant_b", a)
      .maybeSingle();
    if (!r2.error && r2.data && r2.data.id) return String(r2.data.id);
    return "";
  }

  async function ensureDmThreadId(client, me, peerId) {
    if (!client || !me || !peerId || peerId === me) return "";
    var tid = await findDmThreadId(client, me, peerId);
    if (tid) return tid;
    var guess = dmThreadPairGuess(me, peerId);
    var a = guess.participant_a;
    var b = guess.participant_b;
    var ins = await client.from("portal_staff_dm_threads").insert([{ participant_a: a, participant_b: b }]).select("id");
    tid = pickThreadId(ins.data);
    if (
      !tid &&
      ins.error &&
      global.portalDmIsCheckOrderedPairError &&
      global.portalDmIsCheckOrderedPairError(ins.error)
    ) {
      ins = await client.from("portal_staff_dm_threads").insert([{ participant_a: b, participant_b: a }]).select("id");
      tid = pickThreadId(ins.data);
    }
    if (!tid) tid = await findDmThreadId(client, me, peerId);
    return tid;
  }

  async function resolveFirstOpsAdminId(client) {
    if (!client) return "";
    if (
      typeof global.portalAdminDmResolveFirstOpsAdminId === "function"
    ) {
      return String((await global.portalAdminDmResolveFirstOpsAdminId(client)) || "").trim();
    }
    var q = await client
      .from("staff_profiles")
      .select("id,is_active")
      .eq("app_role", "admin")
      .order("full_name", { ascending: true })
      .limit(40);
    if (q.error || !Array.isArray(q.data)) return "";
    var row = q.data.find(function (r) {
      return r && r.is_active !== false;
    });
    return row && row.id ? String(row.id) : "";
  }

  async function resolvePrimaryManagementPeer(client, staffId) {
    staffId = String(staffId || "").trim();
    if (!client || !staffId) return "";
    var res = await client
      .from("portal_staff_dm_threads")
      .select("id,participant_a,participant_b,updated_at")
      .or("participant_a.eq." + staffId + ",participant_b.eq." + staffId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!res.error && Array.isArray(res.data) && res.data.length) {
      var officeIds = [];
      res.data.forEach(function (r) {
        var o = String(r.participant_a) === staffId ? String(r.participant_b) : String(r.participant_a);
        if (o && officeIds.indexOf(o) < 0) officeIds.push(o);
      });
      var profBy = {};
      if (officeIds.length) {
        var pr = await client
          .from("staff_profiles")
          .select("id,app_role,staff_role,is_active")
          .in("id", officeIds);
        if (!pr.error && Array.isArray(pr.data)) {
          pr.data.forEach(function (p) {
            if (p && p.id) profBy[String(p.id)] = p;
          });
        }
      }
      for (var i = 0; i < res.data.length; i++) {
        var r = res.data[i];
        var officePeer = String(r.participant_a) === staffId ? String(r.participant_b) : String(r.participant_a);
        var p = profBy[officePeer] || {};
        if (String(p.app_role || "").toLowerCase() === "admin") return officePeer;
      }
      for (var j = 0; j < res.data.length; j++) {
        var r2 = res.data[j];
        var officePeer2 = String(r2.participant_a) === staffId ? String(r2.participant_b) : String(r2.participant_a);
        if (isOfficeParticipant(profBy[officePeer2] || {})) return officePeer2;
      }
    }
    return await resolveFirstOpsAdminId(client);
  }

  async function resolveCanonicalThreadRow(client, workerId, candidateRows, profBy) {
    workerId = String(workerId || "").trim();
    candidateRows = Array.isArray(candidateRows) ? candidateRows : [];
    if (!workerId) return candidateRows[0] || null;
    var adminPeer = await resolvePrimaryManagementPeer(client, workerId);
    if (adminPeer) {
      var match = candidateRows.find(function (r) {
        var a = String(r.participant_a || "");
        var b = String(r.participant_b || "");
        return (a === workerId && b === adminPeer) || (b === workerId && a === adminPeer);
      });
      if (match) return match;
      var tid = await findDmThreadId(client, workerId, adminPeer);
      if (tid) {
        var byId = candidateRows.find(function (r) {
          return String(r.id || "") === tid;
        });
        if (byId) return byId;
      }
    }
    for (var i = 0; i < candidateRows.length; i++) {
      var r = candidateRows[i];
      var officePeer = String(r.participant_a) === workerId ? String(r.participant_b) : String(r.participant_a);
      var p = (profBy && profBy[officePeer]) || {};
      if (String(p.app_role || "").toLowerCase() === "admin") return r;
    }
    var best = null;
    var bestT = 0;
    candidateRows.forEach(function (r) {
      var t = rowWhenMs(r);
      if (!best || t >= bestT) {
        bestT = t;
        best = r;
      }
    });
    return best || candidateRows[0] || null;
  }

  async function collapseStaffDmRowsToCanonical(client, rows, profBy, me) {
    if (!Array.isArray(rows) || rows.length < 2) return rows || [];
    var byWorker = {};
    var other = [];
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      var wid = workerPeerFromThread(r, profBy, me);
      if (!wid || !isWorkerRecipient((profBy && profBy[wid]) || {})) {
        other.push(r);
        return;
      }
      if (!byWorker[wid]) byWorker[wid] = [];
      byWorker[wid].push(r);
    });
    var out = other.slice();
    var workers = Object.keys(byWorker);
    for (var i = 0; i < workers.length; i++) {
      var list = byWorker[workers[i]];
      if (list.length === 1) {
        out.push(list[0]);
        continue;
      }
      var canonical = await resolveCanonicalThreadRow(client, workers[i], list, profBy);
      out.push(canonical || list[0]);
    }
    return out;
  }

  function buildMessageBody(req) {
    req = req || {};
    var name = String(req.from || "Staff member").trim() || "Staff member";
    if (String(req.type || "") === "meeting_request") {
      var parts = [MEETING_PREFIX + " " + name + " requested a meeting."];
      if (req.title) parts.push("Title: " + String(req.title).trim());
      if (req.scheduled_at) {
        try {
          parts.push(
            "When: " +
              new Date(req.scheduled_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
          );
        } catch (_d) {
          parts.push("When: " + String(req.scheduled_at));
        }
      }
      if (req.duration) parts.push("Duration: " + String(req.duration));
      if (req.meetingType) parts.push("Type: " + (req.meetingType === "voice" ? "Voice" : "Video"));
      if (req.with) parts.push("With: " + String(req.with));
      if (req.notes) parts.push("Notes: " + String(req.notes));
      return parts.join("\n");
    }
    return SUPPORT_PREFIX + " " + name + " needs help. Please reply in this chat.";
  }

  function isSupportRouteBody(body) {
    var b = String(body || "");
    return b.indexOf(SUPPORT_PREFIX) === 0 || b.indexOf(MEETING_PREFIX) === 0;
  }

  async function insertThreadMessage(client, threadId, body) {
    if (!client || !threadId || !body) return null;
    var rpc = await client.rpc("portal_staff_dm_insert_message", {
      p_thread_id: threadId,
      p_body: body,
      p_message_type: "text",
    });
    if (!rpc.error && rpc.data) return String(rpc.data);
    var ins = await client
      .from("portal_staff_dm_messages")
      .insert([{ thread_id: threadId, author_id: meId(), body: body, message_type: "text" }])
      .select("id");
    if (ins.error || !ins.data || !ins.data[0]) return null;
    return String(ins.data[0].id);
  }

  function isExecutiveCeo(profile) {
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function"
    ) {
      return global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(profile);
    }
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsDirectorProfile === "function"
    ) {
      return global.portalDmRoles.portalDmIsDirectorProfile(profile);
    }
    return String((profile && profile.app_role) || "").toLowerCase() === "ceo";
  }

  async function loadExecutiveCeoProfiles(client) {
    if (!client) return [];
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .or("is_active.is.null,is_active.eq.true");
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data.filter(function (p) {
      return p && p.id && isExecutiveCeo(p);
    });
  }

  /** Staff must not see support handoff threads until management replies. */
  function isStaffSupportHandoffOnlyThread(messages, me) {
    if (!Array.isArray(messages) || !messages.length) return false;
    me = String(me || "").trim();
    return messages.every(function (m) {
      if (String(m.author_id || "") !== me) return false;
      return isSupportRouteBody(m.body);
    });
  }

  function filterStaffInboxThreadRows(rows, msgsByThread, me) {
    if (!Array.isArray(rows)) return [];
    me = String(me || "").trim();
    return rows.filter(function (r) {
      var tid = String((r && r.id) || "");
      if (!tid) return false;
      var msgs = (msgsByThread && msgsByThread[tid]) || [];
      if (!msgs.length) return true;
      return !isStaffSupportHandoffOnlyThread(msgs, me);
    });
  }

  async function resolveOpsAdminId(client) {
    if (
      global.portalCsCliqManagementInbox &&
      typeof global.portalCsCliqManagementInbox.resolveSevithaStaffId === "function"
    ) {
      var sid = await global.portalCsCliqManagementInbox.resolveSevithaStaffId(client);
      if (sid) return String(sid);
    }
    if (typeof global.portalAdminDmResolveFirstOpsAdminId === "function") {
      return String((await global.portalAdminDmResolveFirstOpsAdminId(client)) || "").trim();
    }
    if (!client) return "";
    var q = await client
      .from("staff_profiles")
      .select("id,is_active")
      .eq("app_role", "admin")
      .order("full_name", { ascending: true })
      .limit(40);
    if (q.error || !Array.isArray(q.data)) return "";
    var row = q.data.find(function (r) {
      return r && r.is_active !== false;
    });
    return row && row.id ? String(row.id) : "";
  }

  /** Staff support ? Sevitha ops line (CEOs read in "Sevitha & staff"). */
  async function routeToCeos(req) {
    var box = clientBox();
    var client = box.client;
    var me = meId();
    if (!client || !me) return { ok: false, reason: "no_client" };
    var body = buildMessageBody(req);
    var opsId = await resolveOpsAdminId(client);
    if (!opsId) return { ok: false, reason: "no_ops_admin" };
    var tid = await ensureDmThreadId(client, me, opsId);
    if (!tid) return { ok: false, reason: "no_thread" };
    var mid = await insertThreadMessage(client, tid, body);
    return {
      ok: !!mid,
      sent: mid ? 1 : 0,
      threadIds: mid ? [tid] : [],
      body: body,
    };
  }

  function purgeLocalTestData() {
    try {
      global.localStorage.removeItem("portal_cs_cliq_support_requests");
      global.localStorage.removeItem("portal_cs_cliq_upcoming_meetings");
    } catch (_ls) {}
    try {
      global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__ = [];
    } catch (_mem) {}
    if (typeof global.portalAdminBellClearStaffSupport === "function") {
      global.portalAdminBellClearStaffSupport();
    }
  }

  function isManagementViewer() {
    if (
      global.portalCsCliqHubRoles &&
      typeof global.portalCsCliqHubRoles.isManagementProfile === "function"
    ) {
      return global.portalCsCliqHubRoles.isManagementProfile();
    }
    var p = clientBox().staff_profile || {};
    var ar = String(p.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function purgeLocalTestDataOnce() {
    try {
      if (!isManagementViewer()) return;
      if (global.localStorage.getItem("portal_cs_cliq_test_purged_v2")) return;
      purgeLocalTestData();
      global.localStorage.setItem("portal_cs_cliq_test_purged_v2", "1");
    } catch (_once) {}
  }

  global.portalCsCliqSupportRoute = {
    routeToCeos: routeToCeos,
    buildMessageBody: buildMessageBody,
    isSupportRouteBody: isSupportRouteBody,
    isStaffSupportHandoffOnlyThread: isStaffSupportHandoffOnlyThread,
    filterStaffInboxThreadRows: filterStaffInboxThreadRows,
    purgeLocalTestData: purgeLocalTestData,
    purgeLocalTestDataOnce: purgeLocalTestDataOnce,
    collapseStaffDmRowsToCanonical: collapseStaffDmRowsToCanonical,
    resolveCanonicalThreadRow: resolveCanonicalThreadRow,
    resolvePrimaryManagementPeer: resolvePrimaryManagementPeer,
    findDmThreadId: findDmThreadId,
    ensureDmThreadId: ensureDmThreadId,
    resolveOpsAdminId: resolveOpsAdminId,
    SUPPORT_PREFIX: SUPPORT_PREFIX,
    MEETING_PREFIX: MEETING_PREFIX,
  };
})(typeof window !== "undefined" ? window : globalThis);
