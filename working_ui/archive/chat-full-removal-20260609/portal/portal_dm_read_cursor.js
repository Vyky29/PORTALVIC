/**
 * Server-backed read cursors for portal DMs and CEO groups.
 * Falls back to localStorage ack when the table/RPC is not deployed yet.
 */
(function (global) {
  "use strict";

  var threads = Object.create(null);
  var groups = Object.create(null);
  var tableMissing = false;

  function pickIso(a, b) {
    a = String(a || "").trim();
    b = String(b || "").trim();
    if (!a) return b;
    if (!b) return a;
    try {
      return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
    } catch (_e) {
      return a;
    }
  }

  function cacheThread(threadId, iso) {
    threadId = String(threadId || "").trim();
    iso = String(iso || "").trim();
    if (!threadId || !iso) return;
    threads[threadId] = pickIso(threads[threadId], iso);
  }

  function cacheGroup(groupId, iso) {
    groupId = String(groupId || "").trim();
    iso = String(iso || "").trim();
    if (!groupId || !iso) return;
    groups[groupId] = pickIso(groups[groupId], iso);
  }

  function getThread(threadId) {
    threadId = String(threadId || "").trim();
    if (!threadId) return "";
    return String(threads[threadId] || "").trim();
  }

  function getGroup(groupId) {
    groupId = String(groupId || "").trim();
    if (!groupId) return "";
    return String(groups[groupId] || "").trim();
  }

  function isMissingTableError(err) {
    var msg = String((err && err.message) || err || "");
    var code = String((err && err.code) || "").trim();
    return (
      /does not exist|could not find|schema cache|PGRST205|404/i.test(msg) ||
      code === "PGRST205"
    );
  }

  function isReadCursorUnavailableError(err) {
    if (!err) return false;
    if (isMissingTableError(err)) return true;
    var status = Number(err.status || err.statusCode || 0);
    if (status >= 400) return true;
    var msg = String(err.message || err || "");
    return /permission denied|JWT|row-level security|42501/i.test(msg);
  }

  async function syncTargets(client, threadIds, groupIds) {
    if (!client || tableMissing) return;
    threadIds = (threadIds || []).filter(function (id, idx, arr) {
      id = String(id || "").trim();
      return id && arr.indexOf(id) === idx;
    });
    groupIds = (groupIds || []).filter(function (id, idx, arr) {
      id = String(id || "").trim();
      return id && arr.indexOf(id) === idx;
    });
    if (!threadIds.length && !groupIds.length) return;
    try {
      if (threadIds.length) {
        var tr = await client
          .from("portal_dm_read_cursor")
          .select("thread_id,read_at")
          .in("thread_id", threadIds);
        if (tr.error) {
          if (isReadCursorUnavailableError(tr.error)) {
            tableMissing = true;
            return;
          }
        } else if (Array.isArray(tr.data)) {
          tr.data.forEach(function (row) {
            if (row && row.thread_id && row.read_at) cacheThread(row.thread_id, row.read_at);
          });
        }
      }
      if (groupIds.length) {
        var gr = await client
          .from("portal_dm_read_cursor")
          .select("group_id,read_at")
          .in("group_id", groupIds);
        if (gr.error) {
          if (isReadCursorUnavailableError(gr.error)) {
            tableMissing = true;
            return;
          }
        } else if (Array.isArray(gr.data)) {
          gr.data.forEach(function (row) {
            if (row && row.group_id && row.read_at) cacheGroup(row.group_id, row.read_at);
          });
        }
      }
    } catch (_sync) {}
  }

  async function markThread(client, threadId, iso) {
    threadId = String(threadId || "").trim();
    iso = String(iso || "").trim();
    if (!threadId || !iso) return;
    cacheThread(threadId, iso);
    if (!client || tableMissing) return;
    try {
      var rpc = await client.rpc("portal_dm_mark_thread_read", {
        p_thread_id: threadId,
        p_read_at: iso,
      });
      if (rpc.error) {
        if (isReadCursorUnavailableError(rpc.error)) tableMissing = true;
        return;
      }
      if (rpc.data) cacheThread(threadId, rpc.data);
    } catch (_m) {}
  }

  async function markGroup(client, groupId, iso) {
    groupId = String(groupId || "").trim();
    iso = String(iso || "").trim();
    if (!groupId || !iso) return;
    cacheGroup(groupId, iso);
    if (!client || tableMissing) return;
    try {
      var rpc = await client.rpc("portal_dm_mark_group_read", {
        p_group_id: groupId,
        p_read_at: iso,
      });
      if (rpc.error) {
        if (isReadCursorUnavailableError(rpc.error)) tableMissing = true;
        return;
      }
      if (rpc.data) cacheGroup(groupId, rpc.data);
    } catch (_g) {}
  }

  async function markGroups(client, groupIds, iso) {
    iso = String(iso || "").trim();
    (groupIds || []).forEach(function (gid) {
      cacheGroup(gid, iso);
    });
    for (var i = 0; i < (groupIds || []).length; i++) {
      await markGroup(client, groupIds[i], iso);
    }
  }

  global.portalDmReadCursor = {
    syncTargets: syncTargets,
    markThread: markThread,
    markGroup: markGroup,
    markGroups: markGroups,
    getThread: getThread,
    getGroup: getGroup,
    cacheThread: cacheThread,
    cacheGroup: cacheGroup,
  };
})(typeof window !== "undefined" ? window : globalThis);
