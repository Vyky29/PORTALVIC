/**
 * Portal app guide — mark as read (localStorage + portal_staff_app_guide_acks).
 */
(function (global) {
  "use strict";

  var PORTAL_APP_GUIDE_READ_KEY = "portalAppGuideRead_v1";
  var PORTAL_APP_GUIDE_VERSION = "2026-06";

  function readBox() {
    return global.__PORTAL_SUPABASE__ || null;
  }

  global.PORTAL_APP_GUIDE_READ_KEY = PORTAL_APP_GUIDE_READ_KEY;
  global.PORTAL_APP_GUIDE_VERSION = PORTAL_APP_GUIDE_VERSION;

  global.portalGuideIsReadLocal = function portalGuideIsReadLocal() {
    try {
      return !!global.localStorage.getItem(PORTAL_APP_GUIDE_READ_KEY);
    } catch (_) {
      return false;
    }
  };

  global.portalGuideMarkReadLocal = function portalGuideMarkReadLocal() {
    try {
      global.localStorage.setItem(PORTAL_APP_GUIDE_READ_KEY, String(Date.now()));
    } catch (_) {}
    try {
      global.dispatchEvent(new CustomEvent("portal:guide-read"));
    } catch (_) {}
  };

  global.portalGuideIsRead = function portalGuideIsRead() {
    if (global.portalGuideIsReadLocal()) return true;
    try {
      return !!global.__PORTAL_GUIDE_ACK_SERVER__;
    } catch (_) {
      return false;
    }
  };

  /** Header promo tile: until promo end and not marked read. */
  global.portalGuideShowInHeader = function portalGuideShowInHeader() {
    var promo =
      typeof global.portalGuidePromoActive === "function" && global.portalGuidePromoActive();
    return !!promo && !global.portalGuideIsRead();
  };

  global.portalPersistGuideAckToSupabase = async function portalPersistGuideAckToSupabase() {
    try {
      var box = readBox();
      var client = box && box.client;
      var profile = box && box.staff_profile;
      var session = box && box.session;
      var uid =
        (session && session.user && session.user.id) || (profile && profile.id) || "";
      if (!client || !uid || !client.from) return { ok: false };
      var row = {
        staff_id: uid,
        read_at: new Date().toISOString(),
        staff_full_name: String((profile && profile.full_name) || "").trim() || null,
        staff_username: String((profile && profile.username) || "").trim() || null,
        guide_version: PORTAL_APP_GUIDE_VERSION,
      };
      var res = await client
        .from("portal_staff_app_guide_acks")
        .upsert(row, { onConflict: "staff_id" });
      if (res.error) {
        try {
          console.warn("[portal] guide ack upsert", res.error);
        } catch (_) {}
        return { ok: false };
      }
      global.__PORTAL_GUIDE_ACK_SERVER__ = true;
      return { ok: true };
    } catch (e) {
      try {
        console.warn("[portal] guide ack", e);
      } catch (_) {}
      return { ok: false };
    }
  };

  global.portalMergeGuideAckFromSupabase = async function portalMergeGuideAckFromSupabase() {
    try {
      var box = readBox();
      var client = box && box.client;
      var session = box && box.session;
      var uid = session && session.user && session.user.id;
      if (!client || !uid || !client.from) return;
      var res = await client
        .from("portal_staff_app_guide_acks")
        .select("staff_id,read_at")
        .eq("staff_id", uid)
        .maybeSingle();
      if (res.error || !res.data) return;
      global.__PORTAL_GUIDE_ACK_SERVER__ = true;
      global.portalGuideMarkReadLocal();
    } catch (e) {
      try {
        console.warn("[portal] guide ack merge", e);
      } catch (_) {}
    }
  };

  global.portalMarkPortalGuideRead = async function portalMarkPortalGuideRead() {
    global.portalGuideMarkReadLocal();
    var remote = await global.portalPersistGuideAckToSupabase();
    return { ok: true, remote: !!(remote && remote.ok) };
  };
})(typeof window !== "undefined" ? window : globalThis);
