/**
 * CEO/admin DM routing on staff + lead dashboards — same ops thread as admin CS Cliq.
 */
(function (global) {
  "use strict";

  function route() {
    return global.portalCsCliqSupportRoute || {};
  }

  function directory() {
    return global.portalLeadStaffChatDirectory || {};
  }

  function profile() {
    var box = global.__PORTAL_SUPABASE__ || {};
    return box.staff_profile || {};
  }

  function isManagementMessenger(prof) {
    prof = prof || profile();
    var dir = directory();
    if (typeof dir.portalStaffIsManagementMessenger === "function") {
      return !!dir.portalStaffIsManagementMessenger(prof);
    }
    var ar = String(prof.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function isWorkerProfile(row) {
    row = row || {};
    var r = route();
    if (typeof r.isWorkerRecipient === "function") return r.isWorkerRecipient(row);
    if (typeof global.portalInternalDmIsWorkerRecipient === "function") {
      return global.portalInternalDmIsWorkerRecipient(row);
    }
    return false;
  }

  async function collapseInboxRows(client, me, rows, profBy) {
    rows = Array.isArray(rows) ? rows : [];
    if (!client || !me || rows.length < 2 || !isManagementMessenger()) return rows;
    var r = route();
    if (typeof r.collapseStaffDmRowsToCanonical !== "function") return rows;
    try {
      return await r.collapseStaffDmRowsToCanonical(client, rows, profBy || {}, me);
    } catch (_c) {
      return rows;
    }
  }

  async function resolveSendTarget(client, me, ui) {
    ui = ui || {};
    me = String(me || "").trim();
    if (!client || !me || !isManagementMessenger()) {
      return { threadId: String(ui.threadId || "").trim(), workerId: "" };
    }
    var r = route();
    if (typeof r.resolveManagementSendTarget !== "function") {
      return { threadId: String(ui.threadId || "").trim(), workerId: "" };
    }
    try {
      return await r.resolveManagementSendTarget(client, me, ui);
    } catch (_s) {
      return { threadId: String(ui.threadId || "").trim(), workerId: "" };
    }
  }

  async function resolveOpenWorkerThread(client, workerId) {
    workerId = String(workerId || "").trim();
    if (!client || !workerId || !isManagementMessenger()) return "";
    var r = route();
    if (typeof r.resolveManagementOpenWorkerThread === "function") {
      try {
        return String((await r.resolveManagementOpenWorkerThread(client, workerId)) || "").trim();
      } catch (_o) {}
    }
    return "";
  }

  async function applyThreadOpenState(client, me, tid, profByOpen, threadRow) {
    var out = {
      threadId: String(tid || "").trim(),
      workerId: "",
      peerId: "",
      peerProf: null,
      peerLabel: "",
    };
    if (!client || !me || !out.threadId || !threadRow || !isManagementMessenger()) return out;
    var r = route();
    var workerPeer = r.workerPeerFromThread
      ? r.workerPeerFromThread(threadRow, profByOpen || {}, me)
      : "";
    if (!workerPeer || !isWorkerProfile((profByOpen || {})[workerPeer] || {})) return out;
    var canonTid = "";
    if (typeof r.findOfficeThreadForWorker === "function") {
      try {
        canonTid = String((await r.findOfficeThreadForWorker(client, workerPeer)) || "").trim();
      } catch (_f) {}
    }
    if (canonTid) out.threadId = canonTid;
    out.workerId = workerPeer;
    out.peerId = workerPeer;
    out.peerProf = (profByOpen || {})[workerPeer] || null;
    if (
      global.portalDmPeerDisplayLabel &&
      typeof global.portalDmPeerDisplayLabel === "function"
    ) {
      out.peerLabel = global.portalDmPeerDisplayLabel(workerPeer, out.peerProf || {});
    }
    return out;
  }

  function stampWorkerContext(workerId) {
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    if (workerId) {
      global.__PORTAL_INTERNAL_CHAT_UI.managementWorkerId = workerId;
      global.__PORTAL_INTERNAL_CHAT_UI.workerId = workerId;
      global.__PORTAL_INTERNAL_CHAT_UI.inboxLane = "ops";
    } else {
      global.__PORTAL_INTERNAL_CHAT_UI.managementWorkerId = "";
      global.__PORTAL_INTERNAL_CHAT_UI.workerId = "";
      global.__PORTAL_INTERNAL_CHAT_UI.inboxLane = "";
    }
  }

  global.portalManagementDmRouting = {
    isManagementMessenger: isManagementMessenger,
    isWorkerProfile: isWorkerProfile,
    collapseInboxRows: collapseInboxRows,
    resolveSendTarget: resolveSendTarget,
    resolveOpenWorkerThread: resolveOpenWorkerThread,
    applyThreadOpenState: applyThreadOpenState,
    stampWorkerContext: stampWorkerContext,
  };
})(typeof window !== "undefined" ? window : globalThis);
