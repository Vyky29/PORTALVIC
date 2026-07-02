/**
 * clubSENsational Staff — phased script loading (Next.js-style chunks).
 * Tier 1+2 in parallel, then externalized dashboard JS, tier 3 on idle.
 */
(function (global) {
  "use strict";
  /* Injected by build-time perf patch on portalvic + clubsensational-staff. */

  var VER = "20260630-today-no-dayoff-link";

  var TIER_ROSTER = [
    "/portal/term_from_timetable.js?v=20260702-feedback-jun25",
    "/portal/term_calendar_dashboard_shared.js?v=20260702-feedback-jun25",
    "/portal/staff_dashboard_spreadsheet_bundle.js?v=20260630-staff-display-names",
    "/portal/staff_dashboard_spreadsheet_adapter.js?v=20260614-aurora-dedupe",
    "/portal/portal_staff_feedback_data_loader.js?v=20260702-feedback-jun25",
    "/portal-shared-js/portal_late_submission.js?v=20260620-late-feedback-open",
    "/portal/portal-roster-rows-merge.js?v=20260622-canonical-roster",
    "/portal/portal_roster_canonical.js?v=20260614-madre-dedupe",
    "/portal/portal_madre_canonical.js?v=20260622-madre-live",
    "/portal/portal_madre_fold.js?v=20260614-madre-dedupe",
    "/portal/staff_dashboard_portal_roster_source.js?v=20260622-canonical-roster",
    "/portal/clients_info_embed.js?v=20260608-anas-ismail",
    "/portal/clients_gender_embed.js?v=20260605-gender3",
    "/portal/portal_participants_sheet.js?v=20260614-roster-day-group",
    "/portal/portal_staff_lead_aquatic_slots.js?v=20260704-cover-merge-feedback",
    "/portal/portal_participant_identity.js?v=20260702-berta-today-dedupe",
    "/portal/portal_participant_catalog.js?v=20260606-next-dedupe",
    "/portal/staff_roster_resolve.js?v=20260630-staff-display-names",
    "/portal/portal_staff_display_names.js?v=20260630-staff-display-names",
  ];

  var TIER_UI = [
    "/portal/portal_staff_gender_embed.js?v=20260605-mockup-compact",
    "/portal/portal_dashboard_ui_coalesce.js?v=20260630-term-idle-rAF",
    "/portal/portal_participant_photos.js?v=20260628-timi-smile",
    "/portal/portal_topbar_header.js?v=20260622-sandra-visual-vic",
    "/portal/portal_quick_menu_accordion.js?v=20260606-feedbacks-category",
    "/portal/portal_swimming_instructor_menus.js?v=20260622-sandra-visual-vic",
    "/portal/portal_area_note_icons.js?v=20260610-area-note-img",
    "/portal/portal_today_next_chips.js?v=20260609-photo-fallback",
    "/portal/portal_staff_photos.js?v=20260624-rt-debug",
    "/portal/portal_sheet_back.js?v=20260624-dock-qm-fix",
  ];

  var TIER_UI_MODULES = [
    "/portal/portal_quick_menu_service_leads.js?v=20260621-pickup-lead-roster",
    "/portal/portal_lead_team_shift.js?v=20260702-ma-lead-team-absent",
  ];

  var TIER_IDLE = [
    "/portal/portal_wellbeing_review_reminder.js?v=20260604-wellbeing-reminder-off",
    "/portal/portal-ghost-view.js?v=20260624-ghost-handoff",
  ];

  var EXTRACTED_BEFORE_AUTH = [
    "/portal/staff-dashboard-topbar.js?v=" + VER,
    "/portal/staff-dashboard-feedback.js?v=" + VER,
    "/portal/staff-dashboard-calendar.js?v=" + VER,
    "/portal/staff-dashboard-term.js?v=" + VER,
    "/portal/staff-dashboard-participants.js?v=" + VER,
    "/portal/staff-dashboard-today.js?v=" + VER,
    "/portal/staff-dashboard-ui.js?v=" + VER,
    "/portal/staff-dashboard-auth-bridge.js?v=" + VER,
    "/portal/staff-dashboard-rehydrate.js?v=" + VER,
  ];

  var EXTRACTED_AFTER_AUTH = [
    "/portal/staff-dashboard-achievements-boot.js?v=" + VER,
  ];

  function loadScript(src, asModule) {
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = src;
      if (asModule) s.type = "module";
      s.async = false;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        resolve();
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function loadParallel(urls, asModule) {
    return Promise.all(
      urls.map(function (u) {
        return loadScript(u, asModule);
      })
    );
  }

  function loadSequential(urls, asModule) {
    var chain = Promise.resolve();
    urls.forEach(function (u) {
      chain = chain.then(function () {
        return loadScript(u, asModule);
      });
    });
    return chain;
  }

  function loadCss(href) {
    return new Promise(function (resolve) {
      if (document.querySelector('link[href="' + href + '"]')) {
        resolve();
        return;
      }
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = l.onerror = resolve;
      (document.head || document.documentElement).appendChild(l);
    });
  }

  function scheduleIdle() {
    var run = function () {
      loadParallel(TIER_IDLE, false);
      loadCss("/portal/portal_ghost_view.css?v=20260624-ghost-handoff");
      loadCss("/portal/portal_achievements.css?v=20260702-lead-gallery-upload");
      if (typeof global.portalStaffDeferWebPush === "function") {
        global.portalStaffDeferWebPush();
      }
    };
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(run, { timeout: 3500 });
    } else {
      global.setTimeout(run, 1500);
    }
  }

  function boot() {
    Promise.all([loadParallel(TIER_ROSTER, false), loadParallel(TIER_UI, false), loadParallel(TIER_UI_MODULES, true)])
      .then(function () {
        return loadScript("/portal/portal-logout-bind.js", false);
      })
      .then(function () {
        return loadSequential(EXTRACTED_BEFORE_AUTH, false);
      })
      .then(function () {
        return loadScript("/portal/staff-dashboard-auth-supabase.js?v=" + VER, true);
      })
      .then(function () {
        return loadSequential(EXTRACTED_AFTER_AUTH, false);
      })
      .then(function () {
        global.__PORTAL_STAFF_CHUNKS_READY__ = true;
        try {
          global.dispatchEvent(new Event("portal:staff-chunks-ready"));
        } catch (_) {}
        scheduleIdle();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
