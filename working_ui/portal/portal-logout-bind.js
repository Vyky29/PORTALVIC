/**
 * Reliable quick-menu logout (capture phase). Module auth may load later;
 * this always clears local state and redirects to login.
 */
(function () {
  function loginHref() {
    try {
      if (
        typeof window.PORTAL_LOGIN_REDIRECT_URL === "string" &&
        window.PORTAL_LOGIN_REDIRECT_URL.trim()
      ) {
        return window.PORTAL_LOGIN_REDIRECT_URL.trim();
      }
      return new URL("login.html", location.href).href;
    } catch (_) {}
    return "login.html";
  }

  function clearLocalPortalSession() {
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
