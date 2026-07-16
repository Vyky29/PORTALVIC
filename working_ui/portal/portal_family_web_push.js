/**
 * Family portal Web Push — Turn on alerts CTA + subscribe with parent session.
 */
(function (global) {
  "use strict";

  var STYLE_ID = "family-push-alerts-css";
  var DISMISS_KEY = "familyPushAlertsDismissed";
  // Served under /parent/ so default SW max-scope covers the portal even when
  // WordPress (www) strips Service-Worker-Allowed from /portal/* responses.
  var SW_URL = "/parent/clubsensational-family-sw.js?v=20260716-parent-sw-scope";

  function $(id) {
    return document.getElementById(id);
  }

  function supabaseBase() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "");
  }

  function vapidKey() {
    return global.__PORTAL_VAPID_PUBLIC_KEY__
      ? String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
      : "";
  }

  function sessionToken() {
    return global.__FAMILY_PUSH_SESSION_TOKEN__
      ? String(global.__FAMILY_PUSH_SESSION_TOKEN__).trim()
      : "";
  }

  function isStandalonePwa() {
    try {
      if (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) {
        return true;
      }
      if (global.navigator && global.navigator.standalone === true) return true;
    } catch (_) {}
    return false;
  }

  function isIOS() {
    try {
      return /iPhone|iPad|iPod/i.test(String((global.navigator && global.navigator.userAgent) || ""));
    } catch (_) {
      return false;
    }
  }

  function pushSupported() {
    return !!(
      global.isSecureContext &&
      global.navigator &&
      "serviceWorker" in global.navigator &&
      "PushManager" in global &&
      typeof global.Notification !== "undefined"
    );
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent =
      ".family-push-alerts{margin:0 0 14px;padding:12px 14px;border-radius:14px;" +
      "background:#eaf5fb;border:1px solid #9ec9e0;font-size:13px;line-height:1.45;color:#173247;" +
      "min-width:0}" +
      ".family-push-alerts p{margin:0 0 10px;overflow-wrap:break-word;min-width:0}" +
      ".family-push-alerts__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}" +
      ".family-push-alerts button{border:0;border-radius:999px;padding:8px 14px;" +
      "font-weight:700;font-size:13px;cursor:pointer;max-width:100%}" +
      ".family-push-alerts__go{background:#173247;color:#fff}" +
      ".family-push-alerts__later{background:transparent;color:#173247;text-decoration:underline;" +
      "padding:8px 6px;font-weight:600}" +
      ".family-push-alerts--ok{background:#eef8f0;border-color:#9fd0a8}" +
      ".family-push-alerts--warn{background:#fff8e6;border-color:#f4b740}";
    (document.head || document.documentElement).appendChild(el);
  }

  function dismissed() {
    try {
      return global.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setDismissed() {
    try {
      global.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch (_) {}
  }

  async function registerFamilySw() {
    if (!global.navigator || !("serviceWorker" in global.navigator)) return null;
    if (global.__FAMILY_SW_REG__ && global.__FAMILY_SW_REG__.active) {
      return global.__FAMILY_SW_REG__;
    }
    try {
      var swUrl = new URL(SW_URL, global.location.href).href;
      // Script path /parent/… → max scope /parent (no special header required).
      var reg = await global.navigator.serviceWorker.register(swUrl, { scope: "/parent" });
      global.__FAMILY_SW_REG__ = reg;
      try {
        await reg.update();
      } catch (_u) {}
      await global.navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      console.warn("[family-push] sw register", e);
      return null;
    }
  }

  async function postSubscription(sub) {
    var token = sessionToken();
    var base = supabaseBase();
    var key = anonKey();
    if (!token || !base || !key) {
      return { ok: false, reason: "no-session" };
    }
    var res = await fetch(base + "/functions/v1/portal-push-subscribe-family", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: "Bearer " + key,
        "x-parent-portal-session": token,
      },
      body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub }),
    });
    var body = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !body.ok) {
      return { ok: false, reason: body.error || "subscribe-failed", status: res.status };
    }
    return { ok: true };
  }

  async function subscribeNow() {
    if (!pushSupported()) {
      return { ok: false, reason: "unsupported" };
    }
    if (isIOS() && !isStandalonePwa()) {
      return { ok: false, reason: "ios-need-homescreen" };
    }
    var vapid = vapidKey();
    if (!vapid) return { ok: false, reason: "no-vapid" };
    if (!sessionToken()) return { ok: false, reason: "no-session" };

    var perm = global.Notification.permission;
    if (perm !== "granted") {
      perm = await global.Notification.requestPermission();
    }
    if (perm !== "granted") {
      return { ok: false, reason: perm === "denied" ? "denied" : "permission" };
    }

    var reg = await registerFamilySw();
    if (!reg || !reg.pushManager) {
      return { ok: false, reason: "no-sw" };
    }

    var keyU8 = urlBase64ToUint8Array(vapid);
    var existing = await reg.pushManager.getSubscription();
    var sub = existing;
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyU8,
      });
    }
    return postSubscription(sub);
  }

  function statusCopy(reason) {
    if (reason === "ios-need-homescreen") {
      return "On iPhone, add Family to your Home Screen (Share → Add to Home Screen), open it from that icon, then tap Turn on alerts.";
    }
    if (reason === "denied") {
      return isIOS()
        ? "Notifications are blocked. Open Settings → Notifications → this Family app → Allow, then try again."
        : "Notifications are blocked for this site. Allow them in browser settings, then try again.";
    }
    if (reason === "unsupported") {
      return "This browser cannot receive alerts when closed. Try Chrome/Edge on Android, or Safari from the Home Screen on iPhone.";
    }
    if (reason === "no-vapid") {
      return "Alert keys are not configured yet — please try again later.";
    }
    return "Could not enable alerts. Please try again.";
  }

  function ensureBannerHost() {
    var home = $("ppStepHome");
    if (!home) return null;
    var existing = $("familyPushAlertsBanner");
    if (existing) return existing;
    injectStyles();
    var box = document.createElement("div");
    box.id = "familyPushAlertsBanner";
    box.className = "family-push-alerts";
    box.setAttribute("role", "status");
    box.hidden = true;
    var head = home.querySelector(".pp-home-head");
    if (head && head.parentNode) {
      head.parentNode.insertBefore(box, head.nextSibling);
    } else {
      home.insertBefore(box, home.firstChild);
    }
    return box;
  }

  function ensureHubBannerHost() {
    var step = $("ppStepParticipant");
    if (!step) return null;
    var existing = $("familyPushAlertsBannerHub");
    if (existing) return existing;
    injectStyles();
    var box = document.createElement("div");
    box.id = "familyPushAlertsBannerHub";
    box.className = "family-push-alerts";
    box.setAttribute("role", "status");
    box.hidden = true;
    var body = step.querySelector(".pp-participant-body") || step;
    body.insertBefore(box, body.firstChild);
    return box;
  }

  function renderBanner(el, state) {
    if (!el) return;
    if (state === "hidden") {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.classList.remove("family-push-alerts--ok", "family-push-alerts--warn");
    if (state === "enabled") {
      el.classList.add("family-push-alerts--ok");
      el.innerHTML =
        "<p><strong>Alerts on.</strong> Session changes (instructor, cancellation, absence) can reach this phone even when the browser is closed.</p>";
      return;
    }
    if (state === "busy") {
      el.innerHTML = "<p>Turning on alerts…</p>";
      return;
    }
    if (state && state.error) {
      el.classList.add("family-push-alerts--warn");
      el.innerHTML =
        "<p>" +
        statusCopy(state.error) +
        '</p><div class="family-push-alerts__actions">' +
        '<button type="button" class="family-push-alerts__go" data-family-push="retry">Try again</button>' +
        '<button type="button" class="family-push-alerts__later" data-family-push="dismiss">Not now</button>' +
        "</div>";
      return;
    }
    if (isIOS() && !isStandalonePwa()) {
      el.innerHTML =
        "<p><strong>Alerts on iPhone</strong> need the Family app on your Home Screen first: " +
        "Share → <strong>Add to Home Screen</strong>, open that icon, then tap Turn on alerts. " +
        "Safari in the browser tab cannot keep alerts when the phone is locked.</p>" +
        '<div class="family-push-alerts__actions">' +
        '<button type="button" class="family-push-alerts__go" data-family-push="enable">Turn on alerts</button>' +
        '<button type="button" class="family-push-alerts__later" data-family-push="dismiss">Not now</button>' +
        "</div>";
      return;
    }
    el.innerHTML =
      "<p><strong>Turn on alerts</strong> for instructor changes, cancellations and absences — even when the browser is closed. " +
      "Works in Chrome/Edge on phone or computer; no app install needed.</p>" +
      '<div class="family-push-alerts__actions">' +
      '<button type="button" class="family-push-alerts__go" data-family-push="enable">Turn on alerts</button>' +
      '<button type="button" class="family-push-alerts__later" data-family-push="dismiss">Not now</button>' +
      "</div>";
  }

  function bindBannerClicks(el) {
    if (!el || el.__familyPushBound) return;
    el.__familyPushBound = true;
    el.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute("data-family-push");
      if (!act) return;
      if (act === "dismiss") {
        setDismissed();
        renderBanner($("familyPushAlertsBanner"), "hidden");
        renderBanner($("familyPushAlertsBannerHub"), "hidden");
        return;
      }
      if (act === "enable" || act === "retry") {
        void (async function () {
          renderBanner($("familyPushAlertsBanner"), "busy");
          renderBanner($("familyPushAlertsBannerHub"), "busy");
          var result = await subscribeNow();
          if (result.ok) {
            try {
              global.localStorage.setItem("familyPushSubscribed", "1");
            } catch (_) {}
            renderBanner($("familyPushAlertsBanner"), "enabled");
            renderBanner($("familyPushAlertsBannerHub"), "enabled");
            setTimeout(function () {
              renderBanner($("familyPushAlertsBanner"), "hidden");
              renderBanner($("familyPushAlertsBannerHub"), "hidden");
            }, 4000);
          } else {
            renderBanner($("familyPushAlertsBanner"), { error: result.reason });
            renderBanner($("familyPushAlertsBannerHub"), { error: result.reason });
          }
        })();
      }
    });
  }

  async function maybeAutoSubscribeQuiet() {
    if (!pushSupported() || !sessionToken() || !vapidKey()) return false;
    if (isIOS() && !isStandalonePwa()) return false;
    if (typeof global.Notification === "undefined") return false;
    if (global.Notification.permission !== "granted") return false;
    var result = await subscribeNow();
    return !!(result && result.ok);
  }

  async function syncUi() {
    var token = sessionToken();
    if (!token) {
      renderBanner($("familyPushAlertsBanner"), "hidden");
      renderBanner($("familyPushAlertsBannerHub"), "hidden");
      return;
    }

    var homeBanner = ensureBannerHost();
    var hubBanner = ensureHubBannerHost();
    bindBannerClicks(homeBanner);
    bindBannerClicks(hubBanner);

    if (dismissed()) {
      renderBanner(homeBanner, "hidden");
      renderBanner(hubBanner, "hidden");
      return;
    }

    if (
      typeof global.Notification !== "undefined" &&
      global.Notification.permission === "granted"
    ) {
      var auto = await maybeAutoSubscribeQuiet();
      if (auto) {
        renderBanner(homeBanner, "hidden");
        renderBanner(hubBanner, "hidden");
        return;
      }
    }

    if (!pushSupported() && !(isIOS() && !isStandalonePwa())) {
      renderBanner(homeBanner, "hidden");
      renderBanner(hubBanner, "hidden");
      return;
    }

    renderBanner(homeBanner, "prompt");
    renderBanner(hubBanner, "prompt");
  }

  /**
   * Call after Family sign-in / hub load with the parent session token.
   */
  global.portalFamilyWebPushOnSession = function portalFamilyWebPushOnSession(token) {
    global.__FAMILY_PUSH_SESSION_TOKEN__ = String(token || "").trim();
    if (!global.__FAMILY_PUSH_SESSION_TOKEN__) {
      void syncUi();
      return;
    }
    void registerFamilySw().then(function () {
      return syncUi();
    });
  };

  global.portalFamilyWebPushClear = function portalFamilyWebPushClear() {
    global.__FAMILY_PUSH_SESSION_TOKEN__ = "";
    renderBanner($("familyPushAlertsBanner"), "hidden");
    renderBanner($("familyPushAlertsBannerHub"), "hidden");
  };
})(typeof window !== "undefined" ? window : globalThis);
