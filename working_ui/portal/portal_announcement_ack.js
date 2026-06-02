/**
 * Persist portal announcement signatures to Supabase (portal_staff_announcement_acks).
 * Loaded on staff_dashboard.html and lead_dashboard.html.
 */
(function (global) {
  if (typeof global === "undefined") return;

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
})(typeof window !== "undefined" ? window : globalThis);
