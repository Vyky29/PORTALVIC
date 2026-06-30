/**
 * clubSENsational Family portal — Add to Home Screen hint (sign-in screen, mobile).
 */
(function (global) {
  "use strict";

  var path = String((global.location && global.location.pathname) || "").toLowerCase();
  if (path.indexOf("parent") < 0 && !/parent_portal\.html$/i.test(path)) return;

  var STYLE_ID = "family-app-install-hint-css";
  var KEY = "familyAppInstallHintDismissed";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent =
      ".family-app-install-hint{margin:0 0 14px;padding:12px 14px;border-radius:14px;" +
      "background:#fff8e6;border:1px solid #f4b740;font-size:13px;line-height:1.45;color:#173247}" +
      ".family-app-install-hint p{margin:0 0 10px;overflow-wrap:break-word}" +
      ".family-app-install-hint button{border:0;border-radius:999px;padding:8px 14px;" +
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
    var identify = document.getElementById("ppStepIdentify");
    if (!identify || document.getElementById("familyAppInstallHint")) return;
    injectStyles();
    var box = document.createElement("div");
    box.id = "familyAppInstallHint";
    box.className = "family-app-install-hint";
    box.setAttribute("role", "status");
    box.innerHTML =
      "<p><strong>Install the app:</strong> On iPhone use <strong>Share</strong> → <strong>Add to Home Screen</strong>. " +
      "On Android use the browser menu → <strong>Install app</strong>. Open Family from that icon for the best experience.</p>" +
      '<button type="button" id="familyAppInstallHintDismiss">Got it</button>';
    identify.insertBefore(box, identify.firstChild);
    var btn = document.getElementById("familyAppInstallHintDismiss");
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
