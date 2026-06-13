/**
 * Management CS Cliq inbox ù one dedicated thread per worker (mine) + Sevitha ops lane for CEOs.
 */
(function (global) {
  "use strict";

  function clientBox() {
    return global.__PORTAL_SUPABASE__ || {};
  }

  function normUser(row) {
    if (global.portalDmRoles && typeof global.portalDmRoles.normKey === "function") {
      return global.portalDmRoles.normKey((row && row.username) || "");
    }
    return String((row && row.username) || "")
      .trim()
      .toLowerCase();
  }

  function isSevithaProfile(row) {
    if (!row) return false;
    var nk = normUser(row);
    if (nk === "sevitha" || nk === "info") return true;
    return false;
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

  function isCeoViewer(prof) {
    prof = prof || clientBox().staff_profile || {};
    if (global.portalDmRoles) {
      if (
        typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
        global.portalDmRoles.portalDmIsDirectorProfile(prof)
      ) {
        return true;
      }
      if (
        typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function" &&
        global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(prof)
      ) {
        return true;
      }
    }
    return String(prof.app_role || "").toLowerCase() === "ceo";
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

  async function resolveSevithaStaffId(client) {
    if (!client) return "";
    var res = await client
      .from("staff_profiles")
      .select("id,username,full_name,app_role,is_active")
      .eq("app_role", "admin")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(40);
    if (!res.error && Array.isArray(res.data)) {
      for (var i = 0; i < res.data.length; i++) {
        var row = res.data[i];
        if (row && row.id && isSevithaProfile(row)) return String(row.id);
      }
      var any = res.data.find(function (r) {
        return r && r.id && r.is_active !== false;
      });
      if (any && any.id) return String(any.id);
    }
    if (typeof global.portalAdminDmResolveFirstOpsAdminId === "function") {
      return String((await global.portalAdminDmResolveFirstOpsAdminId(client)) || "").trim();
    }
    return "";
  }

  async function loadActiveWorkers(client) {
    if (!client) return [];
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(500);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data.filter(function (p) {
      return p && p.id && isWorkerRecipient(p);
    });
  }

  function makeDmItem(worker, row, lane, names) {
    var wid = String(worker.id);
    var label = "";
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.inboxPeerLabel === "function"
    ) {
      label = String(global.portalChatActorIdentity.inboxPeerLabel(worker) || "").trim();
    }
    if (!label) {
      label = String(names[wid] || worker.full_name || worker.username || "Staff").trim() || "Staff";
    }
    return {
      kind: "dm",
      id: row && row.id ? String(row.id) : "",
      label: label,
      when: row && row.updated_at ? row.updated_at : null,
      peerId: wid,
      peerProf: worker,
      isTeamChat: false,
      threadRow: row || null,
      inboxLane: lane,
      workerId: wid,
      synthetic: !(row && row.id),
    };
  }

  /**
   * @returns {{ mineItems: object[], opsItems: object[], sevithaId: string, showOpsLane: boolean }}
   */
  async function buildSections(client, me, threadRows, profBy, names) {
    names = names || {};
    profBy = profBy || {};
    me = String(me || "").trim();
    threadRows = Array.isArray(threadRows) ? threadRows : [];

    var sevithaId = await resolveSevithaStaffId(client);
    var viewerProf = profBy[me] || clientBox().staff_profile || {};
    var ceoViewer = isCeoViewer(viewerProf);
    var sevithaViewer = isSevithaProfile(viewerProf);
    var showOpsLane = ceoViewer && !sevithaViewer && !!sevithaId;

    var mineMap = {};
    var opsMap = {};
    threadRows.forEach(function (r) {
      if (!r || !r.id) return;
      var wid = workerPeerFromThread(r, profBy, me);
      if (!wid || !isWorkerRecipient(profBy[wid] || {})) return;
      var a = String(r.participant_a || "");
      var b = String(r.participant_b || "");
      if (a === me || b === me) mineMap[wid] = r;
      if (sevithaId && (a === sevithaId || b === sevithaId)) opsMap[wid] = r;
    });

    var workers = await loadActiveWorkers(client);
    workers.forEach(function (w) {
      var id0 = String(w.id || "");
      if (!id0) return;
      profBy[id0] = w;
      if (
        global.portalChatActorIdentity &&
        typeof global.portalChatActorIdentity.inboxPeerLabel === "function"
      ) {
        names[id0] = String(global.portalChatActorIdentity.inboxPeerLabel(w) || "").trim() || id0.slice(0, 8);
      } else {
        names[id0] = String(w.full_name || w.username || "").trim() || id0.slice(0, 8);
      }
    });

    var mineItems = [];
    var opsItems = [];
    workers.forEach(function (w) {
      var wid = String(w.id || "");
      if (!wid || wid === me) return;
      if (ceoViewer && !sevithaViewer && sevithaId) {
        // CEOs share one ops line per worker (Sevitha ? staff) ? not personal CEO ? worker silos.
        if (opsMap[wid]) opsItems.push(makeDmItem(w, opsMap[wid], "ops", names));
        else if (mineMap[wid]) opsItems.push(makeDmItem(w, mineMap[wid], "ops", names));
        else opsItems.push(makeDmItem(w, null, "ops", names));
        return;
      }
      // Ops admin (Sevitha) and other management: full staff roster in inbox ? click to open even with no history.
      if (mineMap[wid]) mineItems.push(makeDmItem(w, mineMap[wid], "mine", names));
      else mineItems.push(makeDmItem(w, null, "mine", names));
      if (showOpsLane && opsMap[wid]) opsItems.push(makeDmItem(w, opsMap[wid], "ops", names));
    });

    mineItems.sort(function (a, b) {
      return rowWhenMs({ updated_at: b.when }) - rowWhenMs({ updated_at: a.when });
    });
    opsItems.sort(function (a, b) {
      return rowWhenMs({ updated_at: b.when }) - rowWhenMs({ updated_at: a.when });
    });

    return {
      mineItems: mineItems,
      opsItems: opsItems,
      sevithaId: sevithaId,
      showOpsLane: showOpsLane,
    };
  }

  async function openWorkerThread(client, me, workerId, lane, sevithaId) {
    workerId = String(workerId || "").trim();
    lane = String(lane || "mine");
    me = String(me || "").trim();
    sevithaId = String(sevithaId || "").trim();
    if (!client || !workerId) return "";

    var route = global.portalCsCliqSupportRoute || {};

    async function findExistingOpsThread() {
      if (sevithaId && typeof route.findDmThreadId === "function") {
        var opsTid = await route.findDmThreadId(client, sevithaId, workerId);
        if (opsTid) return opsTid;
      }
      if (typeof route.findOfficeThreadForWorker === "function") {
        return route.findOfficeThreadForWorker(client, workerId);
      }
      return "";
    }

    async function ensureOpsThreadRpc() {
      try {
        var rpc = await client.rpc("portal_staff_dm_ensure_ops_thread", { p_worker_id: workerId });
        if (!rpc.error && rpc.data) return String(rpc.data);
      } catch (_rpc) {}
      return "";
    }

    if (lane === "ops" && sevithaId) {
      var existing = await findExistingOpsThread();
      if (existing) return existing;
      var ensured = await ensureOpsThreadRpc();
      if (ensured) return ensured;
      return findExistingOpsThread();
    }
    if (typeof route.ensureDmThreadId === "function") {
      return route.ensureDmThreadId(client, me, workerId);
    }
    return "";
  }

  function shouldUseSplitInbox() {
    var prof = clientBox().staff_profile || {};
    var app = String(prof.app_role || "").toLowerCase();
    if (app === "admin" || app === "ceo") return true;
    var sr = String(prof.staff_role || "").toLowerCase();
    return sr === "manager" || sr === "admin";
  }

  global.portalCsCliqManagementInbox = {
    buildSections: buildSections,
    openWorkerThread: openWorkerThread,
    resolveSevithaStaffId: resolveSevithaStaffId,
    isCeoViewer: isCeoViewer,
    isSevithaProfile: isSevithaProfile,
    shouldUseSplitInbox: shouldUseSplitInbox,
  };
})(typeof window !== "undefined" ? window : globalThis);
