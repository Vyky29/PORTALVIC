/**
 * Replace the 2025/26 "Our Terms" HTML widget on clubsensational.org
 * (.cs-calendar) with the live 2026/27 calendars hosted on Vercel.
 */
(function () {
  "use strict";
  var nodes = document.querySelectorAll(".cs-calendar");
  if (!nodes.length) return;
  var url = "/portal/public-term-calendars-2026-27.html?v=20260901-tt";
  fetch(url, { credentials: "omit" })
    .then(function (res) {
      if (!res.ok) throw new Error("calendar_http_" + res.status);
      return res.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var fresh = doc.querySelector(".cs-calendar");
      if (!fresh) return;
      nodes.forEach(function (el) {
        el.replaceWith(fresh.cloneNode(true));
      });
    })
    .catch(function () {
      /* Keep the published widget if the portal file is unavailable. */
    });
})();
