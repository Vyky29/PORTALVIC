/**
 * Quick menu — Portal Guide placement (promo at top until read / promo end; then Settings).
 */
(function (global) {
  "use strict";

  /** Last calendar day (inclusive) when Guide appears at the top of Quick menu. */
  var PORTAL_APP_GUIDE_PROMO_END_ISO = "2026-06-19";

  function portalGuidePromoActive() {
    try {
      var endIso = String(
        (global.PORTAL_APP_GUIDE_PROMO_END_ISO != null
          ? global.PORTAL_APP_GUIDE_PROMO_END_ISO
          : PORTAL_APP_GUIDE_PROMO_END_ISO) || ""
      )
        .trim()
        .slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return true;
      var d = new Date();
      var today =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
      return today <= endIso;
    } catch (_) {
      return true;
    }
  }

  function portalSyncQuickMenuGuidePlacement() {
    try {
      var showHeader =
        typeof global.portalGuideShowInHeader === "function" && global.portalGuideShowInHeader();
      var read = typeof global.portalGuideIsRead === "function" && global.portalGuideIsRead();
      var topGrp = global.document && global.document.getElementById("portalQuickMenuGuideGroup");
      var setBtn = global.document && global.document.getElementById("quickMenuPortalGuideSettings");
      var guideGrid = global.document && global.document.getElementById("portalQuickMenuGuideGrid");
      var ovHost =
        global.document && global.document.getElementById("portalQuickMenuScheduleOverridesTop");
      var hasOv = !!(ovHost && !ovHost.hidden && String(ovHost.innerHTML || "").trim());
      var hasOb =
        typeof global.portalOnboardingHasTopPromo === "function" &&
        global.portalOnboardingHasTopPromo();
      if (guideGrid) guideGrid.hidden = !showHeader;
      if (topGrp) topGrp.hidden = !showHeader && !hasOv && !hasOb;
      if (setBtn) setBtn.hidden = showHeader || (portalGuidePromoActive() && !read);
      if (typeof global.portalInitQuickMenuAccordion === "function") {
        global.portalInitQuickMenuAccordion();
      }
    } catch (_) {}
  }

  global.PORTAL_APP_GUIDE_PROMO_END_ISO = PORTAL_APP_GUIDE_PROMO_END_ISO;
  global.portalGuidePromoActive = portalGuidePromoActive;
  global.portalSyncQuickMenuGuidePlacement = portalSyncQuickMenuGuidePlacement;

  function onGuideRead() {
    portalSyncQuickMenuGuidePlacement();
    try {
      if (typeof global.syncPortalScheduleOverridesTopSlot === "function") {
        global.syncPortalScheduleOverridesTopSlot();
      }
      if (typeof global.syncPortalReminderChrome === "function") {
        global.syncPortalReminderChrome();
      }
    } catch (_) {}
  }

  if (global.addEventListener) {
    global.addEventListener("portal:guide-read", onGuideRead);
  }

  if (global.document) {
    function initGuidePlacement() {
      portalSyncQuickMenuGuidePlacement();
    }
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initGuidePlacement);
    } else {
      initGuidePlacement();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
