/**
 * Session plan for support workers. Not Visual Vic.
 * Add a day under PORTAL_SESSION_PLAN_DAYS to show its activities.
 */
(function (global) {
  var PLANS = {
    "2026-09-24": {
      title: "Day Centre",
      venue: "SwimFarm",
      activities: [
        { time: "12.30", title: "Arrival and settle", note: "Coats, hello, and the plan for the afternoon." },
        { time: "1.00", title: "Group activity", note: "One shared task the whole group can join." },
        { time: "1.45", title: "Snack and reset", note: "Quiet break, then the next activity." },
        { time: "2.15", title: "Choice time", note: "Two options. The child picks one." },
        { time: "2.45", title: "Pack up and goodbye", note: "Tidy, then hand over." },
      ],
    },
  };

  function londonTodayIso() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (_) {
      return "";
    }
  }

  function selectedDayIso() {
    var el = document.getElementById("staffDayDate") || document.querySelector("[data-staff-day-iso]");
    var raw = el && (el.value || el.getAttribute("data-staff-day-iso") || "");
    var m = String(raw || "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return londonTodayIso();
  }

  function prettyDate(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso || "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
    return wd + " " + m[3] + "-" + m[2] + "-" + m[1];
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    var body = document.getElementById("staffSessionPlanBody");
    var sub = document.getElementById("staffSessionPlanSubtitle");
    if (!body) return;
    var iso = selectedDayIso();
    var plan = PLANS[iso] || null;
    if (sub) {
      sub.textContent = plan
        ? prettyDate(iso) + (plan.venue ? " · " + plan.venue : "")
        : prettyDate(iso);
    }
    if (!plan || !plan.activities || !plan.activities.length) {
      body.innerHTML =
        '<p class="alerts-sheet-placeholder">No session plan for this day yet.</p>';
      return;
    }
    var rows = plan.activities
      .map(function (a) {
        return (
          '<li class="session-plan-item">' +
          '<span class="session-plan-item__time">' +
          esc(a.time) +
          "</span>" +
          '<span class="session-plan-item__body">' +
          "<strong>" +
          esc(a.title) +
          "</strong>" +
          (a.note ? '<span class="session-plan-item__note">' + esc(a.note) + "</span>" : "") +
          "</span></li>"
        );
      })
      .join("");
    body.innerHTML =
      '<p class="session-plan-kicker">' +
      esc(plan.title || "Session plan") +
      "</p>" +
      '<ol class="session-plan-list">' +
      rows +
      "</ol>";
  }

  global.portalOpenSessionPlanSheet = function portalOpenSessionPlanSheet() {
    render();
    if (typeof global.openSheet === "function") {
      global.openSheet("staffSessionPlanSheet");
    }
  };

  global.PORTAL_SESSION_PLAN_DAYS = PLANS;
})(window);
