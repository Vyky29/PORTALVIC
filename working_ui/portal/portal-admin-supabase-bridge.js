/**
 * Admin dashboard: read Supabase session from storage before async bootstrap finishes.
 */
(function (global) {
  "use strict";

  var EXEC_BY_EMAIL = {
    "victor@clubsensational.org": { name: "Victor", key: "victor" },
    "raul@clubsensational.org": { name: "Raúl", key: "raul" },
    "javi@clubsensational.org": { name: "Javi", key: "javi" },
    "javier@clubsensational.org": { name: "Javi", key: "javi" },
    "sevitha@clubsensational.org": { name: "Sevitha", key: "sevitha" },
    "info@clubsensational.org": { name: "Sevitha", key: "sevitha" },
  };

  function parseStoredSession(raw) {
    try {
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.access_token && data.user) return data;
      if (data && data.currentSession && data.currentSession.access_token && data.currentSession.user) {
        return data.currentSession;
      }
    } catch (_) {}
    return null;
  }

  function readStoredAuthSession() {
    var stores = [global.localStorage, global.sessionStorage];
    var s;
    var i;
    var k;
    var sess;
    for (s = 0; s < stores.length; s++) {
      try {
        for (i = 0; i < stores[s].length; i++) {
          k = stores[s].key(i);
          if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
          sess = parseStoredSession(stores[s].getItem(k));
          if (sess) return sess;
        }
      } catch (_) {}
    }
    return null;
  }

  function mergeSessionIntoBox(session) {
    if (!session || !session.access_token) return;
    var box = global.__PORTAL_SUPABASE__ || {};
    if (!box.session || !box.session.access_token) box.session = session;
    global.__PORTAL_SUPABASE__ = box;
  }

  global.portalAdminReadStoredAuthSession = readStoredAuthSession;

  global.portalAdminResolveAccessToken = function portalAdminResolveAccessToken() {
    var box = global.__PORTAL_SUPABASE__ || {};
    if (box.session && box.session.access_token) return String(box.session.access_token);
    var stored = readStoredAuthSession();
    if (stored && stored.access_token) {
      mergeSessionIntoBox(stored);
      return String(stored.access_token);
    }
    return "";
  };

  global.portalAdminGetSupabaseClient = function portalAdminGetSupabaseClient() {
    var box = global.__PORTAL_SUPABASE__ || {};
    if (box.client) return box.client;
    if (global.__PORTAL_SUPABASE_SINGLETON__) return global.__PORTAL_SUPABASE_SINGLETON__;
    return null;
  };

  global.portalAdminPaintExecTopbarEarly = function portalAdminPaintExecTopbarEarly() {
    var doc = global.document;
    if (!doc) return;
    var sess =
      (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session) || readStoredAuthSession();
    var email =
      sess && sess.user && sess.user.email
        ? String(sess.user.email).trim().toLowerCase()
        : "";
    var exec = EXEC_BY_EMAIL[email];
    if (!exec) return;
    var nameEl = doc.getElementById("miniName");
    if (nameEl) nameEl.textContent = exec.name;
    var img = doc.getElementById("miniAvImg");
    var ini = doc.getElementById("miniAvInitials");
    var av = doc.getElementById("miniAv");
    if (ini) ini.textContent = exec.name.slice(0, 2).toUpperCase();
    if (!img) return;
    img.onerror = function () {
      img.hidden = true;
      img.removeAttribute("src");
      if (ini) {
        ini.textContent = exec.name.slice(0, 2).toUpperCase();
        ini.hidden = false;
      }
      if (av) av.classList.remove("admin-av--photo");
    };
    img.onload = function () {
      if (!img.naturalWidth) {
        img.onerror();
        return;
      }
      if (ini) ini.hidden = true;
      img.hidden = false;
      img.alt = exec.name + " profile photo";
      if (av) av.classList.add("admin-av--photo");
    };
    img.src = "/portal/staff_photos/" + exec.key + ".png";
  };

  function ensureBootstrapSoon() {
    if (global.portalAdminGetSupabaseClient()) return;
    if (global.__PORTAL_ADMIN_BOOTSTRAP_KICKED__) return;
    global.__PORTAL_ADMIN_BOOTSTRAP_KICKED__ = true;
    import("/portal/auth-handler.js?v=20260703-session-bridge")
      .then(function (mod) {
        if (typeof mod.bootstrapDashboardSupabase === "function") {
          return mod.bootstrapDashboardSupabase({ page: "admin" });
        }
      })
      .catch(function () {});
  }

  function onDomReady() {
    mergeSessionIntoBox(readStoredAuthSession());
    global.portalAdminPaintExecTopbarEarly();
    ensureBootstrapSoon();
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }

  global.addEventListener("portal:supabase-ready", function () {
    global.portalAdminPaintExecTopbarEarly();
    if (typeof global.portalSyncAdminTopbarProfile === "function") {
      try {
        var box = global.__PORTAL_SUPABASE__ || {};
        global.portalSyncAdminTopbarProfile({
          profile: box.staff_profile || null,
          session: box.session || null,
          email: String(
            (box.session && box.session.user && box.session.user.email) || "",
          ).trim(),
        });
      } catch (_) {}
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
