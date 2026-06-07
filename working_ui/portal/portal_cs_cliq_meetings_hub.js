/**
 * CS Cliq Meetings centre ù schedule, requests and upcoming meetings.
 */
(function (global) {
  "use strict";

  var UPCOMING_KEY = "portal_cs_cliq_upcoming_meetings";
  var eventsBound = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function canSchedule() {
    return (
      global.portalCsCliqHubRoles &&
      typeof global.portalCsCliqHubRoles.canScheduleMeetings === "function" &&
      global.portalCsCliqHubRoles.canScheduleMeetings()
    );
  }

  function uiState() {
    var adminUi = global.__PORTAL_ADMIN_DM_UI || {};
    var internalUi = global.__PORTAL_INTERNAL_CHAT_UI || {};
    return {
      threadId: String(adminUi.threadId || internalUi.threadId || "").trim(),
      groupId: String(adminUi.groupId || "").trim(),
      peerLabel: String(adminUi.peerLabel || internalUi.peerLabel || "").trim(),
      peerRole: String(adminUi.peerRole || internalUi.peerRole || "").trim(),
    };
  }

  function hasActiveChat() {
    var s = uiState();
    return !!(s.threadId || s.groupId);
  }

  function formatRole(role) {
    var r = String(role || "").trim();
    if (!r) return "Staff";
    if (r.toLowerCase() === "group") return "Group";
    if (r.toLowerCase() === "team") return "Team";
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  function readUpcoming() {
    try {
      var raw = global.localStorage.getItem(UPCOMING_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function writeUpcoming(arr) {
    try {
      global.localStorage.setItem(UPCOMING_KEY, JSON.stringify(arr.slice(0, 30)));
    } catch (_e2) {}
  }

  function addUpcoming(detail) {
    detail = detail || {};
    var list = readUpcoming();
    list.unshift({
      id: String(detail.id || "mtg-" + Date.now()),
      title: String(detail.title || "").trim() || "Meeting",
      participants: String(detail.participants || "").trim(),
      scheduledAt: String(detail.scheduledAt || "").trim(),
      duration: String(detail.duration || "30 min").trim(),
      type: String(detail.type || "video").trim() === "voice" ? "voice" : "video",
      notes: String(detail.notes || "").trim(),
    });
    writeUpcoming(list);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isToday(iso) {
    if (!iso) return false;
    try {
      var d = new Date(iso);
      var now = new Date();
      return startOfDay(d).getTime() === startOfDay(now).getTime();
    } catch (_e) {
      return false;
    }
  }

  function isThisWeekNotToday(iso) {
    if (!iso || isToday(iso)) return false;
    try {
      var d = new Date(iso);
      var now = new Date();
      var weekStart = new Date(now);
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      weekStart = startOfDay(weekStart);
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return d >= weekStart && d < weekEnd;
    } catch (_e2) {
      return false;
    }
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return (
        d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
        " ù " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
    } catch (_e) {
      return iso;
    }
  }

  function meetingRequests() {
    if (!global.portalCsCliqSupport || typeof global.portalCsCliqSupport.readRequests !== "function") {
      return [];
    }
    return global.portalCsCliqSupport.readRequests().filter(function (r) {
      return r && r.type === "meeting_request" && r.status !== "closed";
    });
  }

  function openPanel(opts) {
    if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.openMeetingPanel === "function") {
      global.portalStaffChatCalls.openMeetingPanel(opts || {});
    }
  }

  function renderUpcomingCard(mtg) {
    var typeLabel = mtg.type === "voice" ? "Voice" : "Video";
    var reschedule =
      canSchedule() ?
        '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--ghost" data-cs-cliq-meetings-action="reschedule" data-meeting-id="' +
        esc(mtg.id) +
        '">Reschedule</button>'
      : "";
    return (
      '<article class="portal-cs-cliq-meetings-upcoming-card">' +
      '<div class="portal-cs-cliq-meetings-upcoming-card__head">' +
      '<h4 class="portal-cs-cliq-meetings-upcoming-card__title">' +
      esc(mtg.title) +
      "</h4>" +
      '<span class="portal-cs-cliq-meetings-upcoming-card__type">' +
      esc(typeLabel) +
      "</span>" +
      "</div>" +
      '<p class="portal-cs-cliq-meetings-upcoming-card__when">' +
      esc(formatWhen(mtg.scheduledAt)) +
      (mtg.duration ? " ù " + esc(mtg.duration) : "") +
      "</p>" +
      '<p class="portal-cs-cliq-meetings-upcoming-card__who">' +
      esc(mtg.participants || "Participants TBC") +
      "</p>" +
      '<div class="portal-cs-cliq-meetings-upcoming-card__actions">' +
      '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--pri" data-cs-cliq-meetings-action="join" data-meeting-id="' +
      esc(mtg.id) +
      '">Join</button>' +
      reschedule +
      "</div></article>"
    );
  }

  function renderRequestItem(req) {
    var when = req.scheduled_at ? formatWhen(req.scheduled_at) : "Time to be confirmed";
    return (
      '<div class="portal-cs-cliq-meetings-request-item">' +
      '<p class="portal-cs-cliq-meetings-request-item__title">' +
      esc(req.title || req.label || "Meeting request") +
      "</p>" +
      '<p class="portal-cs-cliq-meetings-request-item__meta">' +
      esc(req.from || "Staff") +
      (req.with ? " ù with " + esc(req.with) : "") +
      "</p>" +
      '<p class="portal-cs-cliq-meetings-request-item__when">' +
      esc(when) +
      "</p></div>"
    );
  }

  function render() {
    var host = document.getElementById("csCliqMeetingsCentre");
    if (!host) return;

    var schedule = canSchedule();
    var state = uiState();
    var active = hasActiveChat();
    var upcoming = readUpcoming();
    var todayList = upcoming.filter(function (m) {
      return isToday(m.scheduledAt);
    });
    var weekList = upcoming.filter(function (m) {
      return isThisWeekNotToday(m.scheduledAt);
    });
    var requests = meetingRequests();

    var primaryTitle = schedule ? "Schedule meeting" : "Request meeting";
    var primaryDesc = schedule
      ? "Create a meeting with staff, leads or management."
      : "Ask a Lead or Management user to arrange a meeting.";
    var primaryBtn = schedule ? "New meeting" : "Request meeting";
    var primaryAction = schedule ? "new" : "request";

    var activeBlock = "";
    if (active && state.peerLabel) {
      var contextualBtn = schedule ? "Schedule with this person" : "Request meeting with this person";
      activeBlock =
        '<section class="portal-cs-cliq-meetings-card">' +
        '<p class="portal-cs-cliq-meetings-card__eyebrow">Active conversation</p>' +
        '<h3 class="portal-cs-cliq-meetings-card__title">' +
        esc(state.peerLabel) +
        "</h3>" +
        '<p class="portal-cs-cliq-meetings-card__role">' +
        esc(formatRole(state.peerRole)) +
        "</p>" +
        '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--sec" data-cs-cliq-meetings-action="contextual">' +
        esc(contextualBtn) +
        "</button></section>";
    } else {
      activeBlock =
        '<section class="portal-cs-cliq-meetings-card portal-cs-cliq-meetings-card--muted">' +
        '<p class="portal-cs-cliq-meetings-card__eyebrow">Active conversation</p>' +
        '<h3 class="portal-cs-cliq-meetings-card__title">No active conversation selected</h3>' +
        '<p class="portal-cs-cliq-meetings-card__desc">Choose a chat first or create a new meeting from the button above.</p>' +
        "</section>";
    }

    var requestsBlock = "";
    if (schedule) {
      var requestsBody =
        requests.length > 0
          ? '<div class="portal-cs-cliq-meetings-requests-list">' +
            requests
              .slice(0, 8)
              .map(renderRequestItem)
              .join("") +
            "</div>"
          : '<p class="portal-cs-cliq-meetings-empty">No meeting requests yet.</p>';
      requestsBlock =
        '<section class="portal-cs-cliq-meetings-card">' +
        '<h3 class="portal-cs-cliq-meetings-card__title">Meeting requests</h3>' +
        '<p class="portal-cs-cliq-meetings-card__desc">Staff requests for urgent support or internal meetings.</p>' +
        requestsBody +
        "</section>";
    }

    var todayBody =
      todayList.length > 0
        ? '<div class="portal-cs-cliq-meetings-upcoming-list">' + todayList.map(renderUpcomingCard).join("") + "</div>"
        : '<p class="portal-cs-cliq-meetings-empty">No meetings scheduled today.</p>';
    var weekBody =
      weekList.length > 0
        ? '<div class="portal-cs-cliq-meetings-upcoming-list">' + weekList.map(renderUpcomingCard).join("") + "</div>"
        : '<p class="portal-cs-cliq-meetings-empty">No meetings scheduled this week.</p>';

    host.innerHTML =
      '<header class="portal-cs-cliq-meetings-header">' +
      "<h2>Meetings</h2>" +
      "<p>Schedule and manage internal calls, video meetings and staff coordination.</p>" +
      "</header>" +
      '<section class="portal-cs-cliq-meetings-card portal-cs-cliq-meetings-card--primary">' +
      "<h3>" +
      esc(primaryTitle) +
      "</h3>" +
      '<p class="portal-cs-cliq-meetings-card__desc">' +
      esc(primaryDesc) +
      "</p>" +
      '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--pri" data-cs-cliq-meetings-action="' +
      esc(primaryAction) +
      '">' +
      esc(primaryBtn) +
      "</button></section>" +
      activeBlock +
      requestsBlock +
      '<section class="portal-cs-cliq-meetings-upcoming">' +
      "<h3 class=\"portal-cs-cliq-meetings-upcoming__title\">Upcoming meetings</h3>" +
      '<div class="portal-cs-cliq-meetings-upcoming__group">' +
      '<h4 class="portal-cs-cliq-meetings-upcoming__label">Today</h4>' +
      todayBody +
      "</div>" +
      '<div class="portal-cs-cliq-meetings-upcoming__group">' +
      '<h4 class="portal-cs-cliq-meetings-upcoming__label">This week</h4>' +
      weekBody +
      "</div></section>";
  }

  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;
    global.addEventListener("portal-cs-cliq-meeting-created", function (ev) {
      if (ev && ev.detail) addUpcoming(ev.detail);
      refresh();
    });
    global.addEventListener("portal-cs-cliq-support-submitted", function (ev) {
      if (ev && ev.detail && ev.detail.type === "meeting_request") refresh();
    });
  }

  function bindHost(host) {
    if (!host || host.dataset.meetingsBound === "1") return;
    host.dataset.meetingsBound = "1";
    host.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-cs-cliq-meetings-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-cs-cliq-meetings-action");
      if (action === "new" || action === "request") {
        openPanel({ contextual: false });
        return;
      }
      if (action === "contextual") {
        openPanel({ contextual: true });
        return;
      }
      if (action === "join") {
        return;
      }
      if (action === "reschedule") {
        var id = btn.getAttribute("data-meeting-id");
        var mtg = readUpcoming().find(function (m) {
          return m.id === id;
        });
        if (mtg) {
          openPanel({ prefill: mtg, rescheduleId: id });
        }
      }
    });
  }

  function refresh() {
    bindEventsOnce();
    render();
    bindHost(document.getElementById("csCliqMeetingsCentre"));
  }

  global.portalCsCliqMeetingsHub = {
    refresh: refresh,
    addUpcoming: addUpcoming,
  };
})(typeof window !== "undefined" ? window : globalThis);
