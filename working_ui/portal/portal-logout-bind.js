/**
 * Reliable quick-menu logout (capture phase). Module auth may load later;
 * this always clears local state and redirects to login.
 */
(function () {
  function loginHref() {
    try {
      var base =
        typeof window.PORTAL_LOGIN_REDIRECT_URL === "string" &&
        window.PORTAL_LOGIN_REDIRECT_URL.trim()
          ? window.PORTAL_LOGIN_REDIRECT_URL.trim()
          : new URL("login.html", location.href).href;
      var u = new URL(base, location.href);
      u.searchParams.set("portal_logout", "1");
      return u.href;
    } catch (_) {}
    return "login.html?portal_logout=1";
  }

  function clearSupabaseAuthStorage() {
    try {
      var keys = [];
      var i;
      for (i = 0; i < localStorage.length; i++) {
        var lk = localStorage.key(i);
        if (lk && /^sb-.*-auth-token/i.test(lk)) keys.push(lk);
      }
      for (i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
      keys.length = 0;
      for (i = 0; i < sessionStorage.length; i++) {
        var sk = sessionStorage.key(i);
        if (sk && /^sb-.*-auth-token/i.test(sk)) keys.push(sk);
      }
      for (i = 0; i < keys.length; i++) sessionStorage.removeItem(keys[i]);
    } catch (_) {}
  }

  function clearLocalPortalSession() {
    clearSupabaseAuthStorage();
    try {
      localStorage.removeItem("portalStaffContext");
      localStorage.removeItem("portalAuthSessionGeneration");
    } catch (_) {}
    try {
      sessionStorage.removeItem("portalStaffContext");
    } catch (_) {}
    try {
      if (window.__PORTAL_SUPABASE__) {
        window.__PORTAL_SUPABASE__.staff_profile = null;
        window.__PORTAL_SUPABASE__.session = null;
      }
    } catch (_) {}
  }

  async function runLogout() {
    try {
      if (typeof window.portalEndVisitSession === "function") {
        await window.portalEndVisitSession();
      }
    } catch (_) {}
    clearLocalPortalSession();
    try {
      if (typeof window.portalLogoutRedirectToLogin === "function") {
        var mod =
          typeof window.__PORTAL_LOGOUT_FN__ === "function"
            ? window.__PORTAL_LOGOUT_FN__
            : null;
        await window.portalLogoutRedirectToLogin(mod);
        return;
      }
    } catch (_) {}
    try {
      var m = await import(
        "portal/auth-handler.js"
      );
      if (m && typeof m.portalLogout === "function") {
        await Promise.race([
          m.portalLogout(),
          new Promise(function (_, rej) {
            setTimeout(function () {
              rej(new Error("logout timeout"));
            }, 4000);
          }),
        ]);
      }
    } catch (_) {}
    try {
      window.location.replace(loginHref());
    } catch (_) {
      window.location.href = loginHref();
    }
  }

  function wireLogout() {
    var btn = document.getElementById("quickMenuLogout");
    if (!btn || btn.getAttribute("data-portal-logout-wired") === "1") return;
    btn.setAttribute("data-portal-logout-wired", "1");
    btn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        void runLogout();
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLogout);
  } else {
    wireLogout();
  }
})();
