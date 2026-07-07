/**
 * Lazy-load large portal data scripts so admin_dashboard.html stays responsive on first paint.
 */
(function () {
  "use strict";

  var SETS = {
    roster: [
      "/portal/term_from_timetable.js?v=20260703-bundle-iife",
      "/portal/staff_dashboard_spreadsheet_bundle.js?v=20260707-roberto-venues",
      "/portal/clients_info_embed.js?v=20260608-anas-ismail",
      "/portal/staff_dashboard_spreadsheet_adapter.js?v=20260628-eddie-mc-alias",
      "/portal/portal_participant_catalog.js?v=20260707-acat-keep-q6-exclude",
      "/portal/portal-roster-rows-merge.js?v=20260704-roster-504",
      "/portal/portal_madre_fold.js?v=20260706-madre-no-store-fix",
      "/portal/portal_roster_canonical.js?v=20260614-madre-dedupe",
      "/portal/staff_dashboard_portal_roster_source.js?v=20260704-roster-seq",
    ],
    feedback: [
      "/portal/cancellations_portal_data.js?v=20260528-timi-cancel",
      "/portal/session_feedback_status_portal_data.js?v=20260614-acat-jun8-absent",
      "/portal/session_feedback_portal_data.js?v=20260531-multi-90",
      "/portal/venue_reviews_portal_data.js?v=20260520",
    ],
    payments: ["/portal/clients_payments_portal_data.js?v=20260507-portalfix"],
    absentees: ["/portal/absentees_credits_portal_data.js?v=20260530-abs"],
    participants: ["/portal/participants_parents_portal_data.js?v=20260707-jad-zerti"],
    oldpax: ["/portal/old_participants_portal_data.js?v=20260430-oldpax-export"],
    waitlist: ["/portal/waiting_list_portal_data.js?v=20260430-waitlist"],
    spreadsheet_ref: ["/portal/spreadsheet_reference_data.js?v=20260602-weekend"],
  };

  var inflight = {};
  var done = {};

  function loadUrl(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + url));
      };
      document.head.appendChild(s);
    });
  }

  window.portalAdminLoadScriptSet = function portalAdminLoadScriptSet(name) {
    var key = String(name || "").trim();
    if (!SETS[key]) return Promise.resolve();
    if (done[key]) return done[key];
    if (inflight[key]) return inflight[key];
    inflight[key] = (async function () {
      var urls = SETS[key];
      for (var i = 0; i < urls.length; i++) {
        await loadUrl(urls[i]);
      }
    })()
      .then(function () {
        inflight[key] = null;
        done[key] = Promise.resolve();
        return done[key];
      })
      .catch(function (err) {
        inflight[key] = null;
        console.debug("[portal] admin script set " + key, err);
        return Promise.resolve();
      });
    return inflight[key];
  };

  window.portalAdminLoadHeavyScripts = function portalAdminLoadHeavyScripts(names) {
    var list = names && names.length ? names : ["roster", "feedback"];
    return Promise.all(
      list.map(function (n) {
        return window.portalAdminLoadScriptSet(n);
      })
    );
  };

  window.portalAdminLoadAllDataScriptsIdle = function portalAdminLoadAllDataScriptsIdle() {
    var queue = ["payments", "absentees", "participants", "oldpax", "waitlist"];
    function step() {
      var next = queue.shift();
      if (!next) return;
      var run = function () {
        window.portalAdminLoadScriptSet(next).finally(step);
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 15000 });
      } else {
        setTimeout(run, 4000);
      }
    }
    step();
  };
})();
