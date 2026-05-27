/**
 * Lazy-load large portal data scripts so admin_dashboard.html stays responsive on first paint.
 */
(function () {
  "use strict";

  var SETS = {
    roster: [
      "/portal/term_from_timetable.js?v=20260519-portal-roster",
      "/portal/staff_dashboard_spreadsheet_bundle.js?v=20260520-client-weekdays",
      "/portal/clients_info_embed.js?v=20260519-portal-roster",
      "/portal/staff_dashboard_spreadsheet_adapter.js?v=20260519-portal-roster",
    ],
    feedback: [
      "/portal/cancellations_portal_data.js?v=20260528-timi-cancel",
      "/portal/session_feedback_status_portal_data.js?v=20260528-timi-cancel",
      "/portal/session_feedback_portal_data.js?v=20260528-timi-cancel",
      "/portal/venue_reviews_portal_data.js?v=20260520",
    ],
    payments: ["/portal/clients_payments_portal_data.js?v=20260507-portalfix"],
    absentees: ["/portal/absentees_credits_portal_data.js?v=20260530-abs"],
    participants: ["/portal/participants_parents_portal_data.js?v=20260430-pp"],
    oldpax: ["/portal/old_participants_portal_data.js?v=20260430-oldpax-export"],
    waitlist: ["/portal/waiting_list_portal_data.js?v=20260430-waitlist"],
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
