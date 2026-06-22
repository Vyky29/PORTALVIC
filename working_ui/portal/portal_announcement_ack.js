/**
 * Persist portal announcement signatures to Supabase (portal_staff_announcement_acks).
 * Loaded on staff_dashboard.html and staff_dashboard.html.
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
   * Worker inbox visibility on staff/lead dashboards (ignores admin/ceo SELECT bypass in RLS).
   * @param {object} row portal_staff_announcements row
   * @param {{authUserId?:string,userId?:string,appRole?:string,staffRole?:string}} ctx
   */
  global.portalStaffAnnouncementRowVisibleOnWorkerInbox = function portalStaffAnnouncementRowVisibleOnWorkerInbox(
    row,
    ctx
  ) {
    ctx = ctx || {};
    if (!row || !row.id) return false;

    var uid = String(ctx.authUserId || ctx.userId || "").trim();
    var appRole = String(ctx.appRole || "")
      .trim()
      .toLowerCase();
    var staffRole = String(ctx.staffRole || "").trim();

    var audience = String(row.audience_scope || "all_staff").trim();
    var delivery = String(row.delivery_scope || "everyone").trim();
    var targetUser = String(row.target_user_id || "").trim();
    var targetRole = String(row.target_staff_role || "").trim();
    var targetRoleBlank = !targetRole;

    if (delivery === "single_user") {
      return !!uid && targetUser === uid;
    }

    if (appRole === "staff") {
      if (delivery === "everyone" && audience === "all_staff" && !targetUser && targetRoleBlank) {
        return true;
      }
      if (
        delivery === "staff_role" &&
        audience === "all_staff" &&
        targetRole &&
        staffRole === targetRole
      ) {
        return true;
      }
      return false;
    }

    if (appRole === "lead") {
      if (delivery === "everyone" && audience === "all_staff" && !targetUser && targetRoleBlank) {
        return true;
      }
      if (delivery === "everyone" && audience === "leads") {
        return true;
      }
      if (
        delivery === "staff_role" &&
        audience === "all_staff" &&
        targetRole &&
        staffRole === targetRole
      ) {
        return true;
      }
      return false;
    }

    /* CEO/admin on staff dashboard: same inbox as leads (all_staff + leads-wide). */
    if (appRole === "ceo" || appRole === "admin") {
      if (delivery === "single_user") {
        return !!uid && targetUser === uid;
      }
      if (
        delivery === "staff_role" &&
        audience === "all_staff" &&
        targetRole &&
        staffRole === targetRole
      ) {
        return true;
      }
      if (delivery === "everyone" && !targetUser && targetRoleBlank) {
        return audience === "all_staff" || audience === "leads";
      }
      return false;
    }

    return false;
  };

  /** Signed production announcement/reminder ack (persists in worker archive even if row is later unpublished). */
  global.portalAnnouncementAckIsArchivedSigned = function portalAnnouncementAckIsArchivedSigned(
    rec,
    key
  ) {
    if (!rec || typeof rec !== "object") return false;
    var annId =
      String(rec.portalAnnouncementId || "").trim() ||
      global.portalAnnouncementIdFromAckKey(key);
    if (!annId) return false;
    var signedAt = Number(rec.signedAt || 0);
    if (!Number.isFinite(signedAt) || signedAt < global.PORTAL_ANNOUNCEMENTS_LIVE_FROM_MS)
      return false;
    return true;
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
    if (!global.portalAnnouncementAckIsArchivedSigned(rec, key)) return false;
    var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
    if (!Object.keys(liveSet).length) return true;
    var annId =
      String(rec.portalAnnouncementId || "").trim() ||
      global.portalAnnouncementIdFromAckKey(key);
    return !!(annId && liveSet[annId]);
  };

  /** Signed log row: still published, not past per-worker hide window. */
  global.portalAnnouncementAckShouldShowInSignedHistory = function portalAnnouncementAckShouldShowInSignedHistory(
    rec,
    key,
    liveIdSet,
    hidePastFn
  ) {
    if (!global.portalAnnouncementAckIsArchivedSigned(rec, key)) return false;
    if (typeof hidePastFn === "function" && hidePastFn(rec)) return false;
    var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
    var annId =
      String(rec.portalAnnouncementId || "").trim() ||
      global.portalAnnouncementIdFromAckKey(key);
    return !!(annId && liveSet[annId]);
  };

  /** Merge legacy title-key ack rows onto portal-ann:{uuid} after Supabase hydrate. */
  global.portalReconcileAnnouncementAckKeys = function portalReconcileAnnouncementAckKeys(
    notices,
    loadMap,
    saveMap
  ) {
    try {
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var list = Array.isArray(notices) ? notices : [];
      if (!list.length) return false;
      var ack = loadMap();
      var changed = false;
      list.forEach(function (n) {
        if (!n || !n.portalAnnouncementId) return;
        var canon = "portal-ann:" + String(n.portalAnnouncementId).trim();
        if (!canon || ack[canon]) return;
        var wantTitle = String(n.title || "")
          .trim()
          .toLowerCase();
        Object.keys(ack).forEach(function (k) {
          if (ack[canon]) return;
          var rec = ack[k];
          if (!rec || typeof rec !== "object") return;
          var signedAt = Number(rec.signedAt || 0);
          if (!Number.isFinite(signedAt) || signedAt <= 0) return;
          var recAnnId = String(rec.portalAnnouncementId || "").trim();
          if (recAnnId && recAnnId === String(n.portalAnnouncementId).trim()) {
            ack[canon] = Object.assign({}, rec, { portalAnnouncementId: recAnnId });
            if (k !== canon) {
              delete ack[k];
            }
            changed = true;
            return;
          }
          if (k.indexOf("portal-ann:") === 0) return;
          var recTitle = String(rec.title || "")
            .trim()
            .toLowerCase();
          if (wantTitle && recTitle === wantTitle) {
            ack[canon] = Object.assign({}, rec, {
              portalAnnouncementId: String(n.portalAnnouncementId).trim(),
              title: rec.title || n.title,
              text: rec.text || n.text || "",
              href: rec.href || n.href || "",
            });
            delete ack[k];
            changed = true;
          }
        });
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] reconcile announcement ack keys", e);
      } catch (_) {}
      return false;
    }
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
      Object.keys(ack).forEach(function (k) {
        var rec = ack[k];
        if (!rec || typeof rec !== "object") {
          delete ack[k];
          changed = true;
          return;
        }
        var annId =
          String(rec.portalAnnouncementId || "").trim() ||
          global.portalAnnouncementIdFromAckKey(k);
        var signedAt = Number(rec.signedAt || 0);
        /* Never drop a worker signature for a still-published announcement. */
        if (annId && liveSet[annId] && Number.isFinite(signedAt) && signedAt > 0) {
          return;
        }
        if (global.portalAnnouncementAckIsArchivedSigned(rec, k)) {
          if (
            !global.portalAnnouncementAckRecordIsLive(rec, k, liveSet)
          ) {
            delete ack[k];
            changed = true;
          }
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

  /** After Supabase hydrate: drop signed rows whose announcement id is no longer published (incl. empty live set). */
  global.portalPruneStaleSignedAnnouncementAcks = function portalPruneStaleSignedAnnouncementAcks(
    loadMap,
    saveMap,
    liveIdSet
  ) {
    try {
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var ack = loadMap();
      var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
      var changed = false;
      Object.keys(ack).forEach(function (k) {
        var rec = ack[k];
        if (!rec || typeof rec !== "object") {
          delete ack[k];
          changed = true;
          return;
        }
        if (!global.portalAnnouncementAckIsArchivedSigned(rec, k)) return;
        var annId =
          String(rec.portalAnnouncementId || "").trim() ||
          global.portalAnnouncementIdFromAckKey(k);
        var signedAt = Number(rec.signedAt || 0);
        if (annId && liveSet[annId] && Number.isFinite(signedAt) && signedAt > 0) {
          return;
        }
        if (!annId || !liveSet[annId]) {
          delete ack[k];
          changed = true;
        }
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] prune stale signed announcement acks", e);
      } catch (_) {}
      return false;
    }
  };

  /** After Supabase hydrate: drop signed reminder rows no longer in the admin reminder list. */
  global.portalPruneStaleReminderAcks = function portalPruneStaleReminderAcks(
    loadMap,
    saveMap,
    liveRemIdSet
  ) {
    try {
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var ack = loadMap();
      var liveSet = liveRemIdSet && typeof liveRemIdSet === "object" ? liveRemIdSet : {};
      var changed = false;
      Object.keys(ack).forEach(function (k) {
        if (String(k || "").indexOf("portal-rem:") !== 0) return;
        var remId = String(k.slice("portal-rem:".length) || "").trim();
        if (!remId || !liveSet[remId]) {
          delete ack[k];
          changed = true;
        }
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] prune stale reminder acks", e);
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

  function portalReminderMetaFromMap(metaById, remId) {
    var meta = metaById && typeof metaById === "object" ? metaById[remId] : null;
    if (!meta || typeof meta !== "object") return { title: "Reminder", text: "" };
    return {
      title: String(meta.title || "Reminder").trim() || "Reminder",
      text: String(meta.body || meta.text || "").trim(),
    };
  }

  /** Fill title/body on signed reminder ack rows from the live admin reminder list. */
  global.portalBackfillReminderAckMapFromAdminList = function portalBackfillReminderAckMapFromAdminList(
    remList,
    loadMap,
    saveMap
  ) {
    try {
      if (!Array.isArray(remList) || !remList.length) return false;
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var ack = loadMap();
      var changed = false;
      remList.forEach(function (r) {
        var remId = String((r && r.portalAdminReminderId) || "").trim();
        if (!remId) return;
        var key = "portal-rem:" + remId;
        var rec = ack[key];
        if (!rec || typeof rec !== "object") return;
        var wantTitle = String(r.title || "").trim();
        var wantText = String(r.body || r.text || "").trim();
        if (wantText && !String(rec.text || "").trim()) {
          rec.text = wantText;
          changed = true;
        }
        if (wantTitle && (!String(rec.title || "").trim() || rec.title === "Reminder")) {
          rec.title = wantTitle;
          changed = true;
        }
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] backfill reminder ack copy", e);
      } catch (_) {}
      return false;
    }
  };

  global.portalMergeReminderAcksFromSupabase = async function portalMergeReminderAcksFromSupabase(
    reminderIds,
    loadMap,
    saveMap,
    metaById
  ) {
    try {
      var ids = (reminderIds || [])
        .map(function (id) {
          return String(id || "").trim();
        })
        .filter(Boolean);
      if (!ids.length) return;
      metaById = metaById && typeof metaById === "object" ? metaById : {};
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
        var meta = portalReminderMetaFromMap(metaById, remId);
        var signedAt = Date.parse(row.signed_at || "");
        if (!ack[key]) {
          ack[key] = {
            title: meta.title,
            text: meta.text,
            signedAt: Number.isFinite(signedAt) ? signedAt : Date.now(),
            portalAdminReminderId: remId,
          };
          changed = true;
          return;
        }
        if (meta.text && !String(ack[key].text || "").trim()) {
          ack[key].text = meta.text;
          changed = true;
        }
        if (meta.title && (!String(ack[key].title || "").trim() || ack[key].title === "Reminder")) {
          ack[key].title = meta.title;
          changed = true;
        }
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

  global.portalSignableItemTriggersPortalPermissions = function portalSignableItemTriggersPortalPermissions(item) {
    return String(item && (item.onAckAction || item.on_ack_action) || "").trim() === "portal_permissions";
  };

  /** True when this worker already registered portal Web Push (skip onboarding announcements). */
  global.portalWorkerHasPortalPushSubscription = async function portalWorkerHasPortalPushSubscription(
    client,
    userId
  ) {
    userId = String(userId || "").trim();
    if (!client || !userId) return false;
    try {
      var res = await client
        .from("portal_push_subscriptions")
        .select("endpoint")
        .eq("user_id", userId)
        .eq("register_app", "portal")
        .limit(1);
      return !res.error && Array.isArray(res.data) && res.data.length > 0;
    } catch (_) {
      return false;
    }
  };

  global.portalHasPendingPermissionsSignable = function portalHasPendingPermissionsSignable() {
    try {
      var fn = global.portalActiveAnnouncementItems;
      if (typeof fn !== "function") return false;
      return fn().some(function (it) {
        return global.portalSignableItemTriggersPortalPermissions(it);
      });
    } catch (_) {
      return false;
    }
  };

  /** Drop superseded "Portal is ready" local ack rows (title-key or old uuid) after the thank-you notice shipped. */
  global.portalPruneSupersededPortalReadyAnnouncementAcks = function portalPruneSupersededPortalReadyAnnouncementAcks(
    loadMap,
    saveMap,
    liveIdSet
  ) {
    try {
      if (typeof loadMap !== "function" || typeof saveMap !== "function") return false;
      var liveSet = liveIdSet && typeof liveIdSet === "object" ? liveIdSet : {};
      var ack = loadMap();
      var changed = false;
      Object.keys(ack).forEach(function (k) {
        var rec = ack[k];
        if (!rec || typeof rec !== "object") return;
        var title = String(rec.title || "")
          .trim()
          .toLowerCase();
        if (title.indexOf("portal is ready") === -1) return;
        var annId =
          String(rec.portalAnnouncementId || "").trim() ||
          global.portalAnnouncementIdFromAckKey(k);
        if (annId && liveSet[annId]) return;
        delete ack[k];
        changed = true;
      });
      if (changed) saveMap(ack);
      return changed;
    } catch (e) {
      try {
        console.warn("[portal] prune superseded portal-ready acks", e);
      } catch (_) {}
      return false;
    }
  };

  /** User gesture: run default portal permissions when signable asks for it. */
  global.portalActivatePermissionsFromSignableItem = async function portalActivatePermissionsFromSignableItem(item) {
    if (!global.portalSignableItemTriggersPortalPermissions(item)) return null;
    try {
      var box = readBox();
      var client = box && box.client;
      var uid =
        (box.session && box.session.user && box.session.user.id) ||
        (box.staff_profile && box.staff_profile.id) ||
        "";
      if (
        typeof global.portalWorkerHasPortalPushSubscription === "function" &&
        client &&
        uid
      ) {
        var hasPush = await global.portalWorkerHasPortalPushSubscription(client, uid);
        if (hasPush) return null;
      }
    } catch (_) {}
    if (typeof global.portalRequestDefaultPortalPermissions === "function") {
      return await global.portalRequestDefaultPortalPermissions();
    }
    return null;
  };
})(typeof window !== "undefined" ? window : globalThis);
