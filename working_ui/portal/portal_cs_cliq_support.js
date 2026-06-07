/**
 * Staff support request flow for CS Cliq hub.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "portal_cs_cliq_support_requests";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function profileName() {
    var p = (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
    return String(p.full_name || p.username || "Staff member").trim();
  }

  function readRequests() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function writeRequests(arr) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 50)));
    } catch (_e2) {}
  }

  function pushManagementAlert(req) {
    global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__ = global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__ || [];
    global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__.unshift(req);
    if (global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__.length > 30) {
      global.__PORTAL_CS_CLIQ_SUPPORT_INBOX__.length = 30;
    }
    try {
      global.dispatchEvent(new CustomEvent("portal-cs-cliq-support-submitted", { detail: req }));
    } catch (_ev) {}
  }

  function openMeetingRequest() {
    if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.openMeetingPanel === "function") {
      global.portalStaffChatCalls.openMeetingPanel({ contextual: false });
      return;
    }
    submit("meeting_request");
  }

  function bindPane() {
    var pane = document.getElementById("csCliqSupportPane");
    if (!pane || pane.dataset.bound === "1") return;
    pane.dataset.bound = "1";
    pane.addEventListener("click", function (ev) {
      var meetingBtn = ev.target.closest("[data-cs-cliq-support-action='meeting']");
      if (meetingBtn) {
        openMeetingRequest();
        return;
      }
      var btn = ev.target.closest("[data-cs-cliq-support-type]");
      if (!btn) return;
      submit(String(btn.getAttribute("data-cs-cliq-support-type") || "other"));
    });
  }

  function submit(type) {
    var labels = {
      urgent_callback: "Urgent call back",
      participant_concern: "Participant concern",
      safeguarding: "Safeguarding concern",
      staff_issue: "Staff issue",
      meeting_request: "Meeting request",
      other: "Need help",
    };
    var req = {
      id: "sr-" + Date.now(),
      type: type,
      label: labels[type] || labels.other,
      from: profileName(),
      created_at: new Date().toISOString(),
      status: "open",
    };
    var all = readRequests();
    all.unshift(req);
    writeRequests(all);
    pushManagementAlert(req);
    if (global.portalCsCliqSupportRoute && typeof global.portalCsCliqSupportRoute.routeToCeos === "function") {
      void global.portalCsCliqSupportRoute.routeToCeos(req).then(function (res) {
        if (!res || !res.ok) {
          try {
            console.warn("[cs-cliq-support] route to CEOs", res && res.reason);
          } catch (_w) {}
        }
      });
    }
    showConfirmation(req);
  }

  function showConfirmation(req) {
    var host = document.getElementById("csCliqSupportBody");
    if (!host) return;
    host.innerHTML =
      '<div class="portal-cs-cliq-support-confirm">' +
      '<h3>Support request sent</h3>' +
      "<p>Your <strong>" +
      esc(req.label) +
      "</strong> request was routed to Management. Someone will follow up in your inbox.</p>" +
      '<button type="button" class="portal-dm-btn portal-dm-btn--primary" id="csCliqSupportDone">Back to options</button>' +
      "</div>";
    var done = document.getElementById("csCliqSupportDone");
    if (done) {
      done.addEventListener("click", function () {
        renderPane();
      });
    }
  }

  function renderPane() {
    var host = document.getElementById("csCliqSupportBody");
    if (!host) return;
    host.innerHTML =
      '<p class="portal-cs-cliq-support-lead">Choose how Management should follow up. Your request is routed to the ops inbox.</p>' +
      '<div class="portal-cs-cliq-support-grid portal-cs-cliq-support-grid--staff">' +
      '<button type="button" class="portal-cs-cliq-support-card" data-cs-cliq-support-type="other">' +
      '<span class="portal-cs-cliq-support-card__title">Need help</span>' +
      '<span class="portal-cs-cliq-support-card__sub">Ask Management or a Lead for support</span>' +
      "</button>" +
      '<button type="button" class="portal-cs-cliq-support-card" data-cs-cliq-support-action="meeting">' +
      '<span class="portal-cs-cliq-support-card__title">Meeting request</span>' +
      '<span class="portal-cs-cliq-support-card__sub">Request a voice or video meeting</span>' +
      "</button></div>";
  }

  function refresh() {
    bindPane();
    renderPane();
  }

  function submitMeetingRequest(opts) {
    opts = opts || {};
    var req = {
      id: "sr-" + Date.now(),
      type: "meeting_request",
      label: "Meeting request",
      from: profileName(),
      created_at: new Date().toISOString(),
      status: "open",
      with: String(opts.with || "").trim(),
      title: String(opts.title || "").trim(),
      scheduled_at: String(opts.scheduledAt || "").trim(),
      duration: String(opts.duration || "").trim(),
      notes: String(opts.notes || "").trim(),
      meetingType: String(opts.meetingType || "video").trim() === "voice" ? "voice" : "video",
    };
    var all = readRequests();
    all.unshift(req);
    writeRequests(all);
    pushManagementAlert(req);
    if (global.portalCsCliqSupportRoute && typeof global.portalCsCliqSupportRoute.routeToCeos === "function") {
      void global.portalCsCliqSupportRoute.routeToCeos(req);
    }
    return req;
  }

  function purgeTestMeetingAlerts() {
    if (global.portalCsCliqSupportRoute && typeof global.portalCsCliqSupportRoute.purgeLocalTestData === "function") {
      global.portalCsCliqSupportRoute.purgeLocalTestData();
    } else {
      try {
        global.localStorage.removeItem("portal_cs_cliq_support_requests");
        global.localStorage.removeItem("portal_cs_cliq_upcoming_meetings");
      } catch (_e) {}
    }
  }

  if (global.portalCsCliqSupportRoute && typeof global.portalCsCliqSupportRoute.purgeLocalTestDataOnce === "function") {
    global.portalCsCliqSupportRoute.purgeLocalTestDataOnce();
  }

  global.portalCsCliqSupport = {
    refresh: refresh,
    readRequests: readRequests,
    submit: submit,
    submitMeetingRequest: submitMeetingRequest,
    purgeTestMeetingAlerts: purgeTestMeetingAlerts,
  };
})(typeof window !== "undefined" ? window : globalThis);
