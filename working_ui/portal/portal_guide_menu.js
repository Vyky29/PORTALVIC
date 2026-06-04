/**
 * Quick menu — Getting started (Guide at top until first read); then Guide in Settings only.
 */
(function (global) {
  "use strict";

  function portalSyncQuickMenuGuidePlacement() {
    try {
      var read =
        typeof global.portalGuideIsRead === "function" && global.portalGuideIsRead();
      var showGettingStarted =
        typeof global.portalGuideShowInHeader === "function" &&
        global.portalGuideShowInHeader();
      var topGrp = global.document && global.document.getElementById("portalQuickMenuGuideGroup");
      var setBtn = global.document && global.document.getElementById("quickMenuPortalGuideSettings");
      var guideGrid = global.document && global.document.getElementById("portalQuickMenuGuideGrid");
      var ovHost =
        global.document && global.document.getElementById("portalQuickMenuScheduleOverridesTop");
      var hasOv = !!(ovHost && !ovHost.hidden && String(ovHost.innerHTML || "").trim());
      var hasOb =
        typeof global.portalOnboardingHasTopPromo === "function" &&
        global.portalOnboardingHasTopPromo();

      if (guideGrid) guideGrid.hidden = !showGettingStarted;

      if (topGrp) {
        topGrp.hidden = !showGettingStarted && !hasOv && !hasOb;
        topGrp.setAttribute("aria-hidden", topGrp.hidden ? "true" : "false");
      }

      if (setBtn) {
        setBtn.hidden = !read;
        setBtn.setAttribute("aria-hidden", read ? "false" : "true");
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
