/**
 * Share office WhatsApp unread cursors across phone / computer for the same login.
 * Surfaces: staff_wa, family_wa. Falls back to localStorage if the table is missing.
 */
(function (global) {
  "use strict";

  var TABLE = "portal_office_inbox_seen";

  function getClient() {
    var box = global.__PORTAL_SUPABASE__;
    return (box && box.client) || null;
  }

  function getUid() {
    var box = global.__PORTAL_SUPABASE__;
    var sess = box && box.session;
    return String((sess && sess.user && sess.user.id) || "").trim();
  }

  function laterIso(a, b) {
    var x = String(a || "");
    var y = String(b || "");
    if (!x) return y;
    if (!y) return x;
    return x >= y ? x : y;
  }

  async function loadInbox(inbox) {
    var out = {};
    var client = getClient();
    var uid = getUid();
    var kind = String(inbox || "").trim();
    if (!client || !uid || !kind) return out;
    try {
      var res = await client
        .from(TABLE)
        .select("thread_key, seen_at")
        .eq("user_id", uid)
        .eq("inbox", kind);
      if (res.error) return out;
      (res.data || []).forEach(function (row) {
        var k = String((row && row.thread_key) || "").trim();
        if (!k) return;
        out[k] = laterIso(out[k], row.seen_at);
      });
    } catch (_e) {}
    return out;
  }

  async function upsertSeen(inbox, threadKey, seenAt) {
    var client = getClient();
    var uid = getUid();
    var kind = String(inbox || "").trim();
    var key = String(threadKey || "").trim();
    var iso = String(seenAt || "").trim();
    if (!client || !uid || !kind || !key || !iso) return false;
    try {
      var res = await client.from(TABLE).upsert(
        {
          user_id: uid,
          inbox: kind,
          thread_key: key,
          seen_at: iso,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,inbox,thread_key" }
      );
      return !res.error;
    } catch (_e) {
      return false;
    }
  }

  function mergeMaps(localMap, remoteMap) {
    var out = {};
    var local = localMap && typeof localMap === "object" ? localMap : {};
    var remote = remoteMap && typeof remoteMap === "object" ? remoteMap : {};
    Object.keys(local).forEach(function (k) {
      out[k] = laterIso(out[k], local[k]);
    });
    Object.keys(remote).forEach(function (k) {
      out[k] = laterIso(out[k], remote[k]);
    });
    return out;
  }

  global.portalOfficeInboxSeenLoad = loadInbox;
  global.portalOfficeInboxSeenUpsert = upsertSeen;
  global.portalOfficeInboxSeenMerge = mergeMaps;
})(typeof window !== "undefined" ? window : globalThis);
