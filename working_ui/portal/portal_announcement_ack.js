/**
 * Persist portal announcement signatures to Supabase (portal_staff_announcement_acks).
 * Loaded on staff_dashboard.html and lead_dashboard.html.
 */
(function (global) {
  if (typeof global === "undefined") return;

  /** Staff announcements go-live (Europe/London calendar day). */
  global.PORTAL_ANNOUNCEMENTS_LIVE_FROM_ISO = "2026-06-02";
  global.PORTAL_ANNOUNCEMENTS_LIVE_FROM_MS = Date.parse("2026-06-02T00:00:00");

  global.portalAnnouncementCreatedOnOrAfterLive = function portalAnnouncementCreatedOnOrAfterLive(
    createdAt
  ) {
    var d = String(createdAt || "")
      .trim()
      .slice(0, 10);
    return !!d && d >= global.PORTAL_ANNOUNCEMENTS_LIVE_FROM_ISO;
  };

  global.portalAnnouncementIdFromAckKey = function portalAnnouncementIdFromAckKey(key) {
    var k = String(key || "").trim();
    if (!k || k.indexOf("portal-ann:contract:") === 0) return "";
    if (k.indexOf("portal-ann:") === 0) return k.slice("portal-ann:".length);
    return "";
  };

  /**
   * @param {object} rec ack map value
   * @param {string} key ack map key
   * @param {Record<string, boolean>} liveIdSet announcement ids from Supabase (go-live)
   */
  global.portalAnnouncementAckRecordIsLive = function portalAnnouncementAckRecordIsLive(
    rec,
    key,
    liveIdSet
  ) {
    if (!rec || typeof rec !== "object") return false;
    var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
    var annId =
      String(rec.portalAnnouncementId || "").trim() ||
      global.portalAnnouncementIdFromAckKey(key);
    if (!annId || !liveSet[annId]) return false;
    var signedAt = Number(rec.signedAt || 0);
    if (!Number.isFinite(signedAt) || signedAt < global.PORTAL_ANNOUNCEMENTS_LIVE_FROM_MS)
      return false;
    return true;
  };

  /** Drop pre-launch / orphan announcement ack rows from localStorage. */
  global.portalPrunePreLaunchAnnouncementAcks = function portalPrunePreLaunchAnnouncementAcks(
    loadMap,
    saveMap,
    liveIdSet
  ) {
    try {
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var ack = loadMap();
      var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
      /* Do not prune until live announcement ids are loaded — empty set would wipe valid acks on every cold open. */
      if (!Object.keys(liveSet).length) return false;
      var changed = false;
      var welcomeNeedle = "welcome to the new club";
      Object.keys(ack).forEach(function (k) {
        var rec = ack[k];
        if (!rec || typeof rec !== "object") {
          delete ack[k];
          changed = true;
          return;
        }
        var title = String(rec.title || "")
          .trim()
          .toLowerCase();
        if (title.indexOf(welcomeNeedle) !== -1) {
          delete ack[k];
          changed = true;
          return;
        }
        if (!global.portalAnnouncementAckRecordIsLive(rec, k, liveSet)) {
          delete ack[k];
          changed = true;
        }
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] prune pre-launch announcement acks", e);
      } catch (_) {}
      return false;
    }
  };

  function readBox() {
    return global.__PORTAL_SUPABASE__ || null;
  }

  /**
   * @param {object} pending Notice item with portalAnnouncementId, title, text, href, etc.
   * @returns {Promise<{ok?:boolean}>}
   */
  global.portalPersistAnnouncementAckToSupabase = async function portalPersistAnnouncementAckToSupabase(
    pending
  ) {
    try {
      var annId = String((pending && pending.portalAnnouncementId) || "").trim();
      if (!annId) return { ok: false };
      var box = readBox();
      var client = box && box.client;
      var profile = box && box.staff_profile;
      var session = box && box.session;
      var uid =
        (session && session.user && session.user.id) ||
        (profile && profile.id) ||
        "";
      if (!client || !uid || !client.from) return { ok: false };
      var row = {
        announcement_id: annId,
        staff_id: uid,
        staff_full_name: String((profile && profile.full_name) || "").trim() || null,
        staff_username: String((profile && profile.username) || "").trim() || null,
      };
      var res = await client
        .from("portal_staff_announcement_acks")
        .upsert(row, { onConflict: "announcement_id,staff_id", ignoreDuplicates: true });
      if (res.error) {
        try {
          console.warn("[portal] announcement ack upsert", res.error);
        } catch (_) {}
        return { ok: false };
      }
      return { ok: true };
    } catch (e) {
      try {
        console.warn("[portal] announcement ack", e);
      } catch (_) {}
      return { ok: false };
    }
  };

  /**
   * Merge server-side acks into localStorage ack map (cross-device / fresh browser).
   */
  global.PORTAL_REMINDER_ACK_STORAGE = "portalReminderAckMap_v1";

  global.portalReminderSignatureKey = function portalReminderSignatureKey(item) {
    var id = String((item && item.portalAdminReminderId) || "").trim();
    return id ? "portal-rem:" + id : "";
  };

  /**
   * @param {object} pending Reminder item with portalAdminReminderId, title, body.
   */
  global.portalPersistReminderAckToSupabase = async function portalPersistReminderAckToSupabase(
    pending
  ) {
    try {
      var remId = String((pending && pending.portalAdminReminderId) || "").trim();
      if (!remId) return { ok: false };
      var wrapped = { portalAnnouncementId: remId };
      return await global.portalPersistAnnouncementAckToSupabase(wrapped);
    } catch (e) {
      try {
        console.warn("[portal] reminder ack", e);
      } catch (_) {}
      return { ok: false };
    }
  };

  global.portalMergeReminderAcksFromSupabase = async function portalMergeReminderAcksFromSupabase(
    reminderIds,
    loadMap,
    saveMap
  ) {
    try {
      var ids = (reminderIds || [])
        .map(function (id) {
          return String(id || "").trim();
        })
        .filter(Boolean);
      if (!ids.length) return;
      var box = readBox();
      var client = box && box.client;
      var session = box && box.session;
      var uid = session && session.user && session.user.id;
      if (!client || !uid || !client.from) return;
      var res = await client
        .from("portal_staff_announcement_acks")
        .select("announcement_id,signed_at,staff_full_name")
        .eq("staff_id", uid)
        .in("announcement_id", ids);
      if (res.error || !Array.isArray(res.data) || !res.data.length) return;
      var ack = typeof loadMap === "function" ? loadMap() : {};
      var changed = false;
      res.data.forEach(function (row) {
        var remId = String(row.announcement_id || "").trim();
        if (!remId) return;
        var key = "portal-rem:" + remId;
        if (ack[key]) return;
        var signedAt = Date.parse(row.signed_at || "");
        ack[key] = {
          title: "Reminder",
          text: "",
          signedAt: Number.isFinite(signedAt) ? signedAt : Date.now(),
          portalAdminReminderId: remId,
        };
        changed = true;
      });
      if (changed && typeof saveMap === "function") saveMap(ack);
    } catch (e) {
      try {
        console.warn("[portal] merge reminder acks", e);
      } catch (_) {}
    }
  };

  global.portalMergeAnnouncementAcksFromSupabase = async function portalMergeAnnouncementAcksFromSupabase(
    announcementIds,
    loadMap,
    saveMap,
    signatureKeyFromItem
  ) {
    try {
      var ids = (announcementIds || [])
        .map(function (id) {
          return String(id || "").trim();
        })
        .filter(Boolean);
      if (!ids.length) return;
      var box = readBox();
      var client = box && box.client;
      var session = box && box.session;
      var uid = session && session.user && session.user.id;
      if (!client || !uid || !client.from) return;
      var res = await client
        .from("portal_staff_announcement_acks")
        .select("announcement_id,signed_at,staff_full_name")
        .eq("staff_id", uid)
        .in("announcement_id", ids);
      if (res.error || !Array.isArray(res.data) || !res.data.length) return;
      var ack = typeof loadMap === "function" ? loadMap() : {};
      var changed = false;
      res.data.forEach(function (row) {
        var annId = String(row.announcement_id || "").trim();
        if (!annId) return;
        var item = { portalAnnouncementId: annId, title: "Announcement", text: "", href: "#portal-ann-" + annId };
        var key =
          typeof signatureKeyFromItem === "function" ? signatureKeyFromItem(item) : "portal-ann:" + annId;
        if (!key || ack[key]) return;
        var signedAt = Date.parse(row.signed_at || "");
        ack[key] = {
          title: "Announcement",
          text: "",
          href: "#portal-ann-" + annId,
          signedAt: Number.isFinite(signedAt) ? signedAt : Date.now(),
          portalAnnouncementId: annId,
        };
        changed = true;
      });
      if (changed && typeof saveMap === "function") saveMap(ack);
    } catch (e) {
      try {
        console.warn("[portal] merge announcement acks", e);
      } catch (_) {}
    }
  };

  /** Escape + paragraph breaks for announcement/reminder body (pending sign + signed log). */
  global.portalFormatSignableMessageHtml = function portalFormatSignableMessageHtml(raw) {
    function esc(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    var text = String(raw || "").trim();
    if (!text) {
      return '<p class="announcement-message-p announcement-message-p--empty">No details captured.</p>';
    }
    if (/\n\s*\n/.test(text)) {
      return text
        .split(/\n\s*\n+/)
        .map(function (block) {
          return String(block || "").trim();
        })
        .filter(Boolean)
        .map(function (block) {
          return (
            '<p class="announcement-message-p">' +
            esc(block).replace(/\n/g, "<br>") +
            "</p>"
          );
        })
        .join("");
    }
    if (/\n/.test(text)) {
      return (
        '<p class="announcement-message-p">' +
        esc(text).replace(/\n/g, "<br>") +
        "</p>"
      );
    }
    if (text.length < 80) {
      return '<p class="announcement-message-p">' + esc(text) + "</p>";
    }
    var parts = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
    parts = parts
      .map(function (part) {
        return String(part || "").trim();
      })
      .filter(Boolean);
    if (parts.length <= 1) {
      return '<p class="announcement-message-p">' + esc(text) + "</p>";
    }
    return parts
      .map(function (part) {
        return '<p class="announcement-message-p">' + esc(part) + "</p>";
      })
      .join("");
  };
})(typeof window !== "undefined" ? window : globalThis);
