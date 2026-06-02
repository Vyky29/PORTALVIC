/**
 * Portal static bootstrap (Vercel / working_ui root).
 * Sets Supabase globals and shared JS base for portal-* forms from the other project.
 */
(function () {
  if (typeof window === "undefined") return;

  window.SUPABASE_URL =
    window.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co";
  window.SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE";

  if (!window.PORTAL_SHARED_JS_BASE) {
    window.PORTAL_SHARED_JS_BASE = "/portal-shared-js";
  }

  (function portalLoadScreenshotGuardEarly() {
    try {
      var path = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (/login\.html(?:$|[?#])/.test(path) || /\/login(?:$|[/?#])/.test(path)) return;
      var sensitive =
        /staff_dashboard|lead_dashboard|staff_profile_update|portal-|cancellation|observation|policies|pickup|certificates|ra_portal|venue-review|incident|expenses|timesheet/i.test(
          path
        );
      if (!sensitive) return;
      var base = window.PORTAL_SHARED_JS_BASE || "/portal-shared-js";
      var head = document.head || document.documentElement;
      if (!document.querySelector('link[data-portal-screenshot-guard-css="1"]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = base + "/portal_screenshot_guard.css?v=20260602";
        link.setAttribute("data-portal-screenshot-guard-css", "1");
        head.appendChild(link);
      }
      if (!document.querySelector('script[data-portal-screenshot-guard-js="1"]')) {
        var s = document.createElement("script");
        s.src = base + "/portal_screenshot_guard.js?v=20260602";
        s.setAttribute("data-portal-screenshot-guard-js", "1");
        head.appendChild(s);
      }
    } catch (_) {}
  })();

  var BRIDGE_KEY = "portalStaffProfileBridgeSecret_v1";

  window.portalPersistBridgeSecret = function portalPersistBridgeSecret(secret) {
    var s = String(secret || "").trim();
    if (!s || s.indexOf("%%") === 0 || s.length < 16) return;
    try {
      sessionStorage.setItem(BRIDGE_KEY, s);
    } catch (_) {}
  };

  window.portalEnsureBridgeCached = function portalEnsureBridgeCached() {
    try {
      return sessionStorage.getItem(BRIDGE_KEY) || "";
    } catch (_) {
      return "";
    }
  };

  function portalReadStoredSupabaseAccessToken() {
    try {
      var parseToken = function (raw) {
        try {
          if (!raw) return "";
          var data = JSON.parse(raw);
          if (data && data.access_token) return String(data.access_token);
          if (data && data.currentSession && data.currentSession.access_token) {
            return String(data.currentSession.access_token);
          }
        } catch (_) {}
        return "";
      };
      var stores = [localStorage, sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var store = stores[s];
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (!k || !/^sb-.*-auth-token/i.test(k)) continue;
          var tok = parseToken(store.getItem(k));
          if (tok) return tok;
        }
      }
    } catch (_) {}
    return "";
  }

  function portalWriteProfileUpdateHandoff(accessToken, staffId) {
    var token = String(accessToken || "").trim();
    if (!token) return false;
    try {
      localStorage.setItem(
        "portalProfileAuthHandoff_v1",
        JSON.stringify({
          access_token: token,
          staff_id: staffId ? String(staffId) : "",
          at: Date.now(),
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /** One-shot Supabase access token for Annual profile from Staff/Lead hub. */
  window.portalPrepareProfileUpdateHandoff = function portalPrepareProfileUpdateHandoff() {
    try {
      var box = window.__PORTAL_SUPABASE__;
      var token =
        box && box.session && box.session.access_token
          ? String(box.session.access_token)
          : "";
      if (!token) token = portalReadStoredSupabaseAccessToken();
      if (!token) return false;
      var profile = box && box.staff_profile;
      return portalWriteProfileUpdateHandoff(
        token,
        profile && profile.id ? String(profile.id) : ""
      );
    } catch (_) {
      return false;
    }
  };

  /** Async handoff — refreshes session from the dashboard client when needed. */
  window.portalPrepareProfileUpdateHandoffAsync =
    async function portalPrepareProfileUpdateHandoffAsync() {
      try {
        if (window.portalPrepareProfileUpdateHandoff()) return true;
      } catch (_) {}
      try {
        var box = window.__PORTAL_SUPABASE__;
        var client = box && box.client;
        if (client && client.auth && typeof client.auth.getSession === "function") {
          var res = await client.auth.getSession();
          var session = res && res.data && res.data.session;
          if (session && session.access_token) {
            var prof = box && box.staff_profile;
            return portalWriteProfileUpdateHandoff(
              session.access_token,
              prof && prof.id ? String(prof.id) : ""
            );
          }
        }
      } catch (_) {}
      try {
        var stored = portalReadStoredSupabaseAccessToken();
        if (stored) return portalWriteProfileUpdateHandoff(stored, "");
      } catch (_) {}
      return false;
    };

  /** Same-tab navigation so Annual profile inherits the portal auth session reliably. */
  window.portalOpenAnnualProfileUpdate = function portalOpenAnnualProfileUpdate(targetUrl) {
    var href = String(targetUrl || "staff_profile_update.html");
    void (async function () {
      try {
        if (typeof window.portalPrepareProfileUpdateHandoffAsync === "function") {
          await window.portalPrepareProfileUpdateHandoffAsync();
        } else if (typeof window.portalPrepareProfileUpdateHandoff === "function") {
          window.portalPrepareProfileUpdateHandoff();
        }
      } catch (_) {}
      try {
        window.location.href = href;
      } catch (_) {}
    })();
  };

  try {
    document.documentElement.classList.add("portal-app-shell");
  } catch (_) {}

  /** Dashboard HTML for staff vs lead (forms + quick links). */
  window.portalResolveHubUrl = function portalResolveHubUrl(fromPortal) {
    var fp = String(fromPortal || "").trim().toLowerCase();
    if (fp === "lead") return "lead_dashboard.html";
    if (fp === "staff") return "staff_dashboard.html";
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("lead_dashboard") >= 0) return "lead_dashboard.html";
    } catch (_) {}
    return "staff_dashboard.html";
  };

  window.portalFormRoleFromPath = function portalFormRoleFromPath() {
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("lead_dashboard") >= 0) return "lead";
    } catch (_) {}
    return "staff";
  };

  /**
   * Where a portal form should land after a successful submit.
   * Prefers an explicit `return` URL (feedback), then a `rp` return path
   * (cancellation / incident), then the staff/lead hub. Carries the session
   * date context so the dashboard reopens the same review day and shows the
   * freshly updated (green + chip) session card.
   */
  function portalFormComputeReturnTarget() {
    var search = "";
    try {
      search = String((typeof location !== "undefined" && location.search) || "");
    } catch (_) {}
    var sp = new URLSearchParams(search.replace(/^\?/, ""));
    var baseHref =
      (typeof location !== "undefined" && location.href) || "staff_dashboard.html";

    // 1) Explicit absolute return URL (feedback flow builds this).
    var ret = sp.get("return");
    if (ret) {
      try {
        var ru = new URL(ret, baseHref);
        if (ru.protocol === "http:" || ru.protocol === "https:") return ru.href;
      } catch (_) {}
    }

    // 2) Resolve the hub (from `rp` return path or by role).
    var hub;
    var rp = sp.get("rp");
    try {
      if (rp && /\.html(\?|$)/i.test(rp)) {
        hub = new URL(rp, baseHref);
      } else {
        var role =
          typeof window.portalFormRoleFromPath === "function"
            ? window.portalFormRoleFromPath()
            : "staff";
        var hubName =
          typeof window.portalResolveHubUrl === "function"
            ? window.portalResolveHubUrl(role)
            : role === "lead"
              ? "lead_dashboard.html"
              : "staff_dashboard.html";
        hub = new URL(hubName, baseHref);
      }
    } catch (_) {
      try {
        hub = new URL("staff_dashboard.html", baseHref);
      } catch (e2) {
        return "staff_dashboard.html";
      }
    }

    // 3) Carry day context so the dashboard reopens on the right day.
    var iso = sp.get("rd") || sp.get("date");
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      hub.searchParams.set("portalReviewDate", iso);
    } else {
      var rday = sp.get("rday");
      if (rday) hub.searchParams.set("portalReviewDay", rday);
    }
    var origin = sp.get("origin");
    if (origin === "dashboard") hub.searchParams.set("portalReturnToToday", "1");
    return hub.href;
  }
  window.portalFormComputeReturnTarget = portalFormComputeReturnTarget;

  /**
   * Shared success handler for portal forms. Signature is flexible:
   *   portalRedirectAfterSubmitSuccess(message)
   *   portalRedirectAfterSubmitSuccess(message, delayMs, doneFn)
   * When `doneFn` is provided (feedback uses this) it owns the navigation.
   */
  window.portalRedirectAfterSubmitSuccess = function portalRedirectAfterSubmitSuccess(
    message,
    delayMs,
    doneFn
  ) {
    var go = function () {
      if (typeof doneFn === "function") {
        try {
          doneFn();
          return;
        } catch (_) {}
      }
      var target = "";
      try {
        if (typeof window.portalGetPortalReturnUrl === "function") {
          target = window.portalGetPortalReturnUrl() || "";
        }
      } catch (_) {}
      if (!target) target = portalFormComputeReturnTarget();
      try {
        window.location.assign(target);
      } catch (e) {
        try {
          window.location.href = target;
        } catch (e2) {}
      }
    };
    var ms = typeof delayMs === "number" && delayMs >= 0 ? delayMs : 0;
    if (ms > 0) {
      try {
        setTimeout(go, ms);
      } catch (_) {
        go();
      }
    } else {
      go();
    }
  };

  window.PORTAL_CONTEXT_ROW_ICONS = {
    participant:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    service:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    date:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    time:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  };

  window.portalRenderSessionContextCard = function portalRenderSessionContextCard(
    cardEl,
    rows
  ) {
    if (!cardEl) return;
    cardEl.replaceChildren();
    var grid = document.createElement("div");
    grid.className = "portal-session-context__grid";
    var icons = window.PORTAL_CONTEXT_ROW_ICONS || {};
    (rows || []).forEach(function (item) {
      if (!item || !item.value) return;
      var r = document.createElement("div");
      r.className = "portal-session-context__row";
      var line = document.createElement("p");
      line.className = "portal-session-context__line";
      var iconKey = item.icon || "";
      if (iconKey && icons[iconKey]) {
        var ic = document.createElement("span");
        ic.className = "portal-session-context__icon";
        ic.setAttribute("aria-hidden", "true");
        ic.innerHTML = icons[iconKey];
        line.appendChild(ic);
      }
      var lt = document.createElement("span");
      lt.className = "portal-session-context__label-text";
      lt.textContent = String(item.label || "").replace(/\s*$/,"") + ": ";
      line.appendChild(lt);
      var v = document.createElement("span");
      v.className = "portal-session-context__value";
      v.textContent = String(item.value || "");
      line.appendChild(v);
      r.appendChild(line);
      grid.appendChild(r);
    });
    cardEl.appendChild(grid);
  };

  /** Start visit tracking on standalone portal forms (feedback, cancellation, …). */
  (function portalFormVisitBootstrap() {
    try {
      var path = String((location && location.pathname) || "").toLowerCase();
      var formSlugs = [
        "portal-session-feedback",
        "cancellation",
        "portal-expenses",
        "portal-incident",
        "portal-venue-review",
        "portal-lead-feedback",
        "portal-pickup",
        "portal-timesheet",
      ];
      var isForm = formSlugs.some(function (slug) {
        return path.indexOf(slug) >= 0;
      });
      if (!isForm) return;
      var s = document.createElement("script");
      s.type = "module";
      s.textContent =
        'import { bootstrapDashboardSupabase } from "/portal/auth-handler.js";\n' +
        'const page = typeof window.portalFormRoleFromPath === "function" ? window.portalFormRoleFromPath() : "staff";\n' +
        'try { await bootstrapDashboardSupabase({ page }); } catch (e) { console.warn("[portal] form visit bootstrap", e); }\n';
      (document.head || document.documentElement).appendChild(s);
    } catch (_) {}
  })();
})();
