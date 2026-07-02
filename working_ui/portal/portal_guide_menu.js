/**
 * Quick menu — Staff help guide lives in Settings (no chat bot).
 */
(function (global) {
  "use strict";

  function portalSyncQuickMenuGuidePlacement() {
    try {
      var topGrp = global.document && global.document.getElementById("portalQuickMenuGuideGroup");
      var guideGrid = global.document && global.document.getElementById("portalQuickMenuGuideGrid");
      var guideTop = global.document && global.document.getElementById("quickMenuPortalGuideTop");
      var ovHost =
        global.document && global.document.getElementById("portalQuickMenuScheduleOverridesTop");
      var hasOv = !!(ovHost && !ovHost.hidden && String(ovHost.innerHTML || "").trim());
      var hasOb =
        typeof global.portalOnboardingHasTopPromo === "function" &&
        global.portalOnboardingHasTopPromo();

      if (guideGrid) {
        guideGrid.hidden = true;
        guideGrid.setAttribute("aria-hidden", "true");
      }
      if (guideTop) {
        guideTop.hidden = true;
        guideTop.setAttribute("aria-hidden", "true");
      }

      if (topGrp) {
        topGrp.hidden = !hasOv && !hasOb;
        topGrp.setAttribute("aria-hidden", topGrp.hidden ? "true" : "false");
      }

      if (typeof global.portalInitQuickMenuAccordion === "function") {
        global.portalInitQuickMenuAccordion();
      }
    } catch (_) {}
  }

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
