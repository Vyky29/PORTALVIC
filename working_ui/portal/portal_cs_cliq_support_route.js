/**
 * Route staff CS Cliq support / meeting requests to each CEO via DM + bell alerts.
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

  async function ensureDmThreadId(client, me, peerId) {
    if (!client || !me || !peerId || peerId === me) return "";
    var guess = dmThreadPairGuess(me, peerId);
    var a = guess.participant_a;
    var b = guess.participant_b;
    var r = await client
      .from("portal_staff_dm_threads")
      .select("id")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .maybeSingle();
    if (r.error) return "";
    var tid = r.data && r.data.id ? String(r.data.id) : "";
    if (tid) return tid;
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
    if (!tid) {
      var r2 = await client
        .from("portal_staff_dm_threads")
        .select("id")
        .eq("participant_a", a)
        .eq("participant_b", b)
        .maybeSingle();
      tid = r2.data && r2.data.id ? String(r2.data.id) : "";
    }
    if (!tid) {
      var r3 = await client
        .from("portal_staff_dm_threads")
        .select("id")
        .eq("participant_a", b)
        .eq("participant_b", a)
        .maybeSingle();
      tid = r3.data && r3.data.id ? String(r3.data.id) : "";
    }
    return tid;
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
    return String(profile && profile.app_role || "").toLowerCase() === "ceo";
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

  async function routeToCeos(req) {
    var box = clientBox();
    var client = box.client;
    var me = meId();
    if (!client || !me) return { ok: false, reason: "no_client" };
    var body = buildMessageBody(req);
    var ceos = await loadExecutiveCeoProfiles(client);
    if (!ceos.length) return { ok: false, reason: "no_ceos" };
    var sent = 0;
    var threadIds = [];
    for (var i = 0; i < ceos.length; i++) {
      var ceo = ceos[i];
      var ceoId = String(ceo.id || "").trim();
      if (!ceoId || ceoId === me) continue;
      var tid = await ensureDmThreadId(client, me, ceoId);
      if (!tid) continue;
      var mid = await insertThreadMessage(client, tid, body);
      if (mid) {
        sent++;
        threadIds.push(tid);
      }
    }
    return { ok: sent > 0, sent: sent, threadIds: threadIds, body: body };
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

  function threadHasParticipant(threadRow, userId) {
    userId = String(userId || "").trim();
    if (!userId || !threadRow) return false;
    return (
      String(threadRow.participant_a || "") === userId ||
      String(threadRow.participant_b || "") === userId
    );
  }

  function itemWhenMs(item) {
    try {
      return item && item.when ? new Date(item.when).getTime() : 0;
    } catch (_t) {
      return 0;
    }
  }

  /** Shared staff inbox shows one row per worker (not one per CEO thread). */
  function dedupeInboxByWorkerPeer(items, me) {
    if (!Array.isArray(items) || items.length < 2) return items || [];
    me = String(me || "").trim();
    var peerKeep = {};
    var out = [];
    items.forEach(function (item) {
      if (!item || item.kind !== "dm" || item.isTeamChat || !item.peerId) {
        out.push(item);
        return;
      }
      var key = String(item.peerId);
      var kept = peerKeep[key];
      if (!kept) {
        peerKeep[key] = item;
        out.push(item);
        return;
      }
      var mine = threadHasParticipant(item.threadRow, me);
      var keptMine = threadHasParticipant(kept.threadRow, me);
      if (mine && !keptMine) {
        kept.id = item.id;
        kept.when = item.when;
        kept.threadRow = item.threadRow;
        kept.lastSender = item.lastSender || kept.lastSender;
        kept.lastPreview = item.lastPreview || kept.lastPreview;
      } else if (!mine && keptMine) {
        /* keep existing */
      } else if (itemWhenMs(item) > itemWhenMs(kept)) {
        kept.id = item.id;
        kept.when = item.when;
        kept.threadRow = item.threadRow;
        kept.lastSender = item.lastSender || kept.lastSender;
        kept.lastPreview = item.lastPreview || kept.lastPreview;
      }
      kept.unreadCount = (Number(kept.unreadCount) || 0) + (Number(item.unreadCount) || 0);
    });
    return out;
  }

  global.portalCsCliqSupportRoute = {
    routeToCeos: routeToCeos,
    buildMessageBody: buildMessageBody,
    isSupportRouteBody: isSupportRouteBody,
    purgeLocalTestData: purgeLocalTestData,
    purgeLocalTestDataOnce: purgeLocalTestDataOnce,
    dedupeInboxByWorkerPeer: dedupeInboxByWorkerPeer,
    SUPPORT_PREFIX: SUPPORT_PREFIX,
    MEETING_PREFIX: MEETING_PREFIX,
  };
})(typeof window !== "undefined" ? window : globalThis);
