(function () {
  function loginHrefWithLogoutFlag(baseHref) {
    try {
      var base =
        typeof baseHref === "string" && baseHref.trim()
          ? baseHref.trim()
          : new URL("login.html", location.href).href;
      var u = new URL(base, location.href);
      u.searchParams.set("portal_logout", "1");
      return u.href;
    } catch (_) {}
    return "login.html?portal_logout=1";
  }

  window.portalResolveLoginHref = function () {
    try {
      if (typeof window.PORTAL_LOGIN_REDIRECT_URL === "string" && window.PORTAL_LOGIN_REDIRECT_URL.trim()) {
        return window.PORTAL_LOGIN_REDIRECT_URL.trim();
      }
      return new URL("login.html", location.href).href;
    } catch (_) {}
    return "login.html";
  };
  window.portalLogoutRedirectToLogin = async function (portalLogoutFn) {
    var dest = loginHrefWithLogoutFlag(
      typeof window.portalResolveLoginHref === "function"
        ? window.portalResolveLoginHref()
        : "login.html"
    );
    try {
      if (typeof portalLogoutFn === "function") {
        await Promise.race([
          portalLogoutFn(),
          new Promise(function (_, rej) {
            setTimeout(function () {
              rej(new Error("portal logout timeout"));
            }, 4000);
          }),
        ]);
      }
    } catch (_) {}
    try {
      window.location.replace(dest);
    } catch (_) {
      window.location.href = dest;
    }
  };
})();
