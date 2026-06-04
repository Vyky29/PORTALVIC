/**
 * Canonical brand assets for PORTALVIC static deploy (Vercel · working_ui/).
 * Use root-absolute paths so logos resolve from any HTML route.
 */
(function (global) {
  "use strict";
  var LOGO = "/portal/F-02-1.png";
  var FALLBACK = "/portal/portal_crest.svg";
  var LOGO_PRO = "/FOOTERLOGO.png?v=20260602-footerlogo";
  var LOGO_PRO_FALLBACK = "/portal/FOOTERLOGO.png?v=20260602-footerlogo";
  global.PORTAL_BRAND_LOGO_SRC = LOGO;
  global.PORTAL_BRAND_LOGO_FALLBACK = FALLBACK;
  global.PORTAL_BRAND_LOGO_PRO_SRC = LOGO_PRO;
  global.PORTAL_BRAND_LOGO_PRO_FALLBACK = LOGO_PRO_FALLBACK;
  /** Outbound mail (Resend/SMTP later). Not portal logins. */
  global.PORTAL_MAIL_CONTACT_EMAIL = "info@clubsensational.org";
  global.PORTAL_MAIL_FROM_EMAIL = "admin@clubsensational.org";
  global.PORTAL_MAIL_SAFEGUARDING_EMAIL = "management@clubsensational.org";

  global.portalBrandApplyLogoImg = function (img) {
    if (!img || !img.tagName) return;
    img.src = LOGO;
    img.dataset.logoTier = "0";
    img.onerror = function () {
      global.portalBrandLogoOnError(img);
    };
  };

  global.portalBrandLogoOnError = function (img) {
    var t = Number(img.dataset.logoTier || 0);
    img.dataset.logoTier = String(t + 1);
    if (t === 0) {
      img.src = FALLBACK;
      return;
    }
    img.onerror = null;
  };

  global.portalBrandLogoProOnError = function (img) {
    var t = Number(img.dataset.logoTier || 0);
    img.dataset.logoTier = String(t + 1);
    if (t === 0) {
      img.src = LOGO_PRO_FALLBACK;
      return;
    }
    if (t === 1) {
      img.src = LOGO;
      return;
    }
    if (t === 2) {
      img.src = FALLBACK;
      return;
    }
    img.onerror = null;
  };
})(typeof window !== "undefined" ? window : globalThis);
