/**
 * Programme leads on admin (Michelle, …): General Induction entry on admin_dashboard.
 */
(function (global) {
  "use strict";

  var BANNER_ID = "portalInductionAdminBanner";

  function inductionUrl() {
    if (typeof global.portalCanonicalPortalPageUrl === "function") {
      return global.portalCanonicalPortalPageUrl("general-induction/");
    }
    return "https://portalvic.vercel.app/general-induction/";
  }

  function injectStyleOnce() {
    if (global.document.getElementById("portalInductionAdminBannerStyle")) return;
    var css =
      "#" +
      BANNER_ID +
      "{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));z-index:1190;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:14px;background:#0f2840;color:#fff;box-shadow:0 10px 30px rgba(15,23,42,.28);font-size:13px;line-height:1.35;max-width:640px;margin:0 auto}" +
      "#" +
      BANNER_ID +
      " .portal-ind-admin-banner__copy{min-width:0;flex:1 1 180px;overflow-wrap:break-word}" +
      "#" +
      BANNER_ID +
      " a.portal-ind-admin-banner__btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;background:#f0b323;color:#0f2840;text-decoration:none;font-weight:700;white-space:nowrap}";
    var st = global.document.createElement("style");
    st.id = "portalInductionAdminBannerStyle";
    st.textContent = css;
    global.document.head.appendChild(st);
  }

  function removeBanner() {
    var el = global.document && global.document.getElementById(BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function renderBanner(profile, email) {
    if (!global.document || !global.document.body) return;
    if (typeof global.portalInductionMustComplete !== "function") return;
    if (!global.portalInductionMustComplete(profile, email)) {
      removeBanner();
      return;
    }
    if (
      typeof global.portalInductionIsComplete === "function" &&
      global.portalInductionIsComplete(profile, email) &&
      typeof global.portalInductionNeedsCertificateDownload === "function" &&
      !global.portalInductionNeedsCertificateDownload(profile, email)
    ) {
      removeBanner();
      return;
    }
    injectStyleOnce();
    var existing = global.document.getElementById(BANNER_ID);
    if (!existing) {
      existing = global.document.createElement("div");
      existing.id = BANNER_ID;
      global.document.body.appendChild(existing);
    }
    var needsCert =
      typeof global.portalInductionNeedsCertificateDownload === "function" &&
      global.portalInductionNeedsCertificateDownload(profile, email);
    var label = needsCert
      ? "Download your General Induction certificate on the portal."
      : "Complete General Induction (6 modules) on the portal.";
    existing.innerHTML =
      '<div class="portal-ind-admin-banner__copy"><strong>General Induction</strong> — ' +
      label +
      ' Use <strong>portalvic.vercel.app</strong>, not clubsensational.org.</div>' +
      '<a class="portal-ind-admin-banner__btn" href="' +
      inductionUrl() +
      '">Open induction</a>';
  }

  function syncBanner() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = "";
      if (box.session && box.session.user && box.session.user.email) {
        email = String(box.session.user.email);
      }
      if (typeof global.portalInductionApplyGrandfather === "function") {
        global.portalInductionApplyGrandfather(profile, email);
      }
      renderBanner(profile, email);
    } catch (_) {}
  }

  if (global.addEventListener) {
    global.addEventListener("portal:supabase-ready", function () {
      syncBanner();
    });
    global.addEventListener("portal:induction-cert-downloaded", function () {
      syncBanner();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
