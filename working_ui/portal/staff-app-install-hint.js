/**
 * clubSENsational Staff — mobile install hint (login only, staff deploy).
 */
(function (global) {
  "use strict";
  if (!global.PORTAL_STAFF_APP) return;
  if (!/login(?:\.html)?(?:$|[?#])/i.test(String(global.location.pathname || ""))) return;

  var STYLE_ID = "staff-app-install-hint-css";
  var KEY = "staffAppInstallHintDismissed";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent =
      ".staff-app-install-hint{margin:14px 0 0;padding:12px 14px;border-radius:14px;" +
      "background:#fff8e6;border:1px solid #f4b740;font-size:13px;line-height:1.45;color:#173247}" +
      ".staff-app-install-hint p{margin:0 0 10px}" +
      ".staff-app-install-hint button{border:0;border-radius:999px;padding:8px 14px;" +
      "background:#173247;color:#fff;font-weight:700;font-size:13px;cursor:pointer}";
    (document.head || document.documentElement).appendChild(el);
  }

  function shouldShow() {
    try {
      if (global.navigator.standalone === true) return false;
      if (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) return false;
      if (global.sessionStorage.getItem(KEY) === "1") return false;
    } catch (_) {}
    if (!global.matchMedia) return false;
    return global.matchMedia("(max-width: 900px)").matches;
  }

  function mount() {
    if (!shouldShow()) return;
    injectStyles();
    var panel = document.querySelector(".login-panel");
    if (!panel || document.getElementById("staffAppInstallHint")) return;
    var box = document.createElement("div");
    box.id = "staffAppInstallHint";
    box.className = "staff-app-install-hint";
    box.setAttribute("role", "status");
    box.innerHTML =
      "<p><strong>Tip:</strong> On iPhone or Android, tap <strong>Share</strong> (or menu) → " +
      "<strong>Add to Home Screen</strong> and always open staff from that icon — not a Safari tab or old portal bookmark.</p>" +
      '<button type="button" id="staffAppInstallHintDismiss">Got it</button>';
    panel.insertBefore(box, panel.firstChild);
    var btn = document.getElementById("staffAppInstallHintDismiss");
    if (btn) {
      btn.addEventListener("click", function () {
        try {
          global.sessionStorage.setItem(KEY, "1");
        } catch (_) {}
        box.remove();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
