/**
 * Replace the 2025/26 "Our Terms" HTML widget on clubsensational.org
 * (.cs-calendar) with the live 2026/27 green/red term calendars (After-Schools,
 * Day Centre, Crash) hosted on Vercel.
 */
(function () {
  "use strict";
  var nodes = document.querySelectorAll(".cs-calendar");
  if (!nodes.length) return;
  var url = "/portal/day-centre-calendar-2026-27-section.html?v=20260903-tt-visual";
  fetch(url, { credentials: "omit" })
    .then(function (res) {
      if (!res.ok) throw new Error("calendar_http_" + res.status);
      return res.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var fresh = doc.querySelector(".dc-cal");
      if (!fresh) return;
      var back = fresh.querySelector(".dc-cal__back-wrap");
      if (back) back.remove();
      nodes.forEach(function (el, i) {
        var node = i === 0 ? fresh : fresh.cloneNode(true);
        el.replaceWith(node);
        if (typeof window.portalInitCalendar202627Tabs === "function") {
          window.portalInitCalendar202627Tabs(node);
        } else {
          /* Lightweight tab fallback if portal_calendar_2026_27.js is not on the page. */
          var tabs = node.querySelectorAll(".dc-cal-tab[data-dc-cal-target]");
          function showPanel(targetId) {
            tabs.forEach(function (t) {
              t.setAttribute(
                "aria-selected",
                t.getAttribute("data-dc-cal-target") === targetId ? "true" : "false",
              );
            });
            node.querySelectorAll(".dc-cal-panel").forEach(function (p) {
              p.hidden = p.id !== targetId;
            });
            node.querySelectorAll("[data-dc-cal-summary]").forEach(function (s) {
              s.hidden = s.getAttribute("data-dc-cal-summary") !== targetId;
            });
          }
          tabs.forEach(function (tab) {
            tab.addEventListener("click", function () {
              var target = tab.getAttribute("data-dc-cal-target");
              if (target) showPanel(target);
            });
          });
          var initial =
            node.querySelector('.dc-cal-tab[aria-selected="true"]') || tabs[0];
          if (initial) showPanel(initial.getAttribute("data-dc-cal-target"));
        }
      });
    })
    .catch(function () {
      /* Keep the published widget if the portal file is unavailable. */
    });
})();
