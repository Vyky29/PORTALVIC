/**
 * Quick menu ù Staff Wellbeing Review reminder (frontend demo when outstanding).
 */
(function (global) {
  "use strict";

  /** Demo: set false when backend term completion is wired. */
  var PORTAL_WELLBEING_REVIEW_DEMO_OUTSTANDING = true;

  function portalStaffWellbeingReviewOutstanding() {
    if (!PORTAL_WELLBEING_REVIEW_DEMO_OUTSTANDING) return false;
    try {
      if (global.dashboardData && global.dashboardData.portalIdentityResolved === false) return false;
    } catch (_) {}
    return true;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function portalBuildWellbeingReviewReminderHtml() {
    if (!portalStaffWellbeingReviewOutstanding()) return "";
    var icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
    return (
      '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-wellbeing-review menu-btn--portal-wellbeing menu-btn--portal-pulse" id="portalWellbeingReviewReminderBtn" data-portal-external-url="staff_wellbeing_review.html" aria-label="' +
      esc("Staff Wellbeing Review Due ù complete your end-of-term wellbeing review") +
      '">' +
      '<div class="menu-btn-icon" aria-hidden="true">' +
      icon +
      "</div>" +
      '<div class="menu-btn-copy"><strong>Staff Wellbeing Review Due</strong><span class="menu-btn-sub">Complete your end-of-term wellbeing review.</span></div>' +
      '<span class="menu-btn-chev" aria-hidden="true">ù</span></button>'
    );
  }

  function syncPortalWellbeingReviewReminderSlot() {
    var slot = global.document && global.document.getElementById("portalQuickMenuWellbeingReviewSlot");
    if (!slot) return false;
    var html =
      typeof global.portalBuildWellbeingReviewReminderHtml === "function"
        ? global.portalBuildWellbeingReviewReminderHtml()
        : "";
    if (html) {
      slot.innerHTML = html;
      slot.hidden = false;
      return true;
    }
    slot.innerHTML = "";
    slot.hidden = true;
    return false;
  }

  global.PORTAL_WELLBEING_REVIEW_DEMO_OUTSTANDING = PORTAL_WELLBEING_REVIEW_DEMO_OUTSTANDING;
  global.portalStaffWellbeingReviewOutstanding = portalStaffWellbeingReviewOutstanding;
  global.portalBuildWellbeingReviewReminderHtml = portalBuildWellbeingReviewReminderHtml;
  global.syncPortalWellbeingReviewReminderSlot = syncPortalWellbeingReviewReminderSlot;

  if (global.document) {
    function initWellbeingReminder() {
      syncPortalWellbeingReviewReminderSlot();
      try {
        if (typeof global.syncPortalQuickMenuNotificationsGroupVisibility === "function") {
          global.syncPortalQuickMenuNotificationsGroupVisibility();
        }
      } catch (_) {}
    }
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initWellbeingReminder);
    } else {
      initWellbeingReminder();
    }
    global.addEventListener("portal:supabase-ready", initWellbeingReminder);
  }
})(typeof window !== "undefined" ? window : globalThis);
