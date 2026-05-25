/**
 * Quick menu — Portal Guide placement (promo at top for first month, then Settings).
 */
(function (global) {
  'use strict';

  /** Last calendar day (inclusive) when Guide appears at the top of Quick menu. */
  var PORTAL_APP_GUIDE_PROMO_END_ISO = '2026-06-19';

  function portalGuidePromoActive() {
    try {
      var endIso = String(
        (global.PORTAL_APP_GUIDE_PROMO_END_ISO != null ? global.PORTAL_APP_GUIDE_PROMO_END_ISO : PORTAL_APP_GUIDE_PROMO_END_ISO) || ''
      )
        .trim()
        .slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return true;
      var d = new Date();
      var today =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      return today <= endIso;
    } catch (_) {
      return true;
    }
  }

  function portalSyncQuickMenuGuidePlacement() {
    try {
      var promo = portalGuidePromoActive();
      var topGrp = global.document && global.document.getElementById('portalQuickMenuGuideGroup');
      var setBtn = global.document && global.document.getElementById('quickMenuPortalGuideSettings');
      if (topGrp) topGrp.hidden = !promo;
      if (setBtn) setBtn.hidden = promo;
    } catch (_) {}
  }

  global.PORTAL_APP_GUIDE_PROMO_END_ISO = PORTAL_APP_GUIDE_PROMO_END_ISO;
  global.portalGuidePromoActive = portalGuidePromoActive;
  global.portalSyncQuickMenuGuidePlacement = portalSyncQuickMenuGuidePlacement;

  if (global.document) {
    function initGuidePlacement() {
      portalSyncQuickMenuGuidePlacement();
    }
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initGuidePlacement);
    } else {
      initGuidePlacement();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
