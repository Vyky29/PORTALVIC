/**
 * Quick menu — Staff Wellbeing Review reminder (disabled in Quick menu; Compliance tile only).
 */
(function (global) {
  "use strict";

  function syncPortalWellbeingReviewReminderSlot() {
    var slot = global.document && global.document.getElementById("portalQuickMenuWellbeingReviewSlot");
    if (!slot) return false;
    slot.innerHTML = "";
    slot.hidden = true;
    return false;
  }

  global.syncPortalWellbeingReviewReminderSlot = syncPortalWellbeingReviewReminderSlot;

  if (global.document) {
    function initWellbeingReminder() {
      syncPortalWellbeingReviewReminderSlot();
    }
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initWellbeingReminder);
    } else {
      initWellbeingReminder();
    }
    global.addEventListener("portal:supabase-ready", initWellbeingReminder);
  }
})(typeof window !== "undefined" ? window : globalThis);
