/**
 * Hydrate participant avatar URLs from portal_participants (Supabase Storage).
 * Shared source for instructor dashboard + parent portal static fallbacks.
 */
(function (global) {
  "use strict";

  function supabaseUrl() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function avatarPublicUrl(storagePath) {
    var path = String(storagePath || "").trim();
    if (!path) return "";
    var base = supabaseUrl();
    if (!base) return "";
    return (
      base +
      "/storage/v1/object/public/participant-avatars/" +
      path
        .split("/")
        .map(function (seg) {
          return encodeURIComponent(seg);
        })
        .join("/")
    );
  }

  async function hydrateParticipantAvatarsFromSupabase() {
    if (typeof global.portalRegisterParticipantStorageAvatar !== "function") return false;
    var box = global.__PORTAL_SUPABASE__;
    var sb = box && box.client;
    if (!sb) return false;

    var res = await sb
      .from("portal_participants")
      .select("contact_id, display_name, avatar_storage_path")
      .not("avatar_storage_path", "is", null);
    if (res.error || !Array.isArray(res.data)) {
      console.warn("[portal] participant avatars hydrate", res.error || "no data");
      return false;
    }

    res.data.forEach(function (row) {
      if (!row || !row.avatar_storage_path) return;
      var url = avatarPublicUrl(row.avatar_storage_path);
      if (!url) return;
      global.portalRegisterParticipantStorageAvatar(row.contact_id, row.display_name, url);
    });

    if (typeof global.portalRefreshDashboardParticipantPhotos === "function") {
      global.portalRefreshDashboardParticipantPhotos(document);
    }
    return true;
  }

  function bindHydrate() {
    global.addEventListener("portal:supabase-ready", function () {
      void hydrateParticipantAvatarsFromSupabase();
    });
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      void hydrateParticipantAvatarsFromSupabase();
    }
  }

  global.portalHydrateParticipantAvatarsFromSupabase = hydrateParticipantAvatarsFromSupabase;
  bindHydrate();
})(typeof window !== "undefined" ? window : globalThis);
