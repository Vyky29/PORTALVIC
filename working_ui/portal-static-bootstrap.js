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

  /** Injected at Vercel build from STAFF_PROFILE_PORTAL_BRIDGE_SECRET (must match Supabase Edge secret). */
  window.STAFF_PROFILE_PORTAL_BRIDGE_SECRET =
    window.STAFF_PROFILE_PORTAL_BRIDGE_SECRET || "%%PB6%%";

  if (!window.PORTAL_SHARED_JS_BASE) {
    window.PORTAL_SHARED_JS_BASE = "/portal-shared-js";
  }

  /** Canonical Portal host — induction/My documents 404 on www.clubsensational.org. */
  window.PORTAL_CANONICAL_ORIGIN =
    window.PORTAL_CANONICAL_ORIGIN || "https://portalvic.vercel.app";
  /** Family portal (parents) — not the staff app host. */
  window.PORTAL_FAMILY_ORIGIN =
    window.PORTAL_FAMILY_ORIGIN || "https://family.clubsensational.org";
  window.portalFamilyPortalUrl = function portalFamilyPortalUrl(path) {
    path = String(path || "").replace(/^\//, "");
    if (path === "parents") path = "parent";
    if (/^parents\//.test(path)) path = path.replace(/^parents\//, "parent/");
    var base = String(window.PORTAL_FAMILY_ORIGIN || "https://family.clubsensational.org").replace(
      /\/$/,
      ""
    );
    if (!path || path === "parent") return base + "/parent";
    if (/^parent(?:\/|$)/.test(path)) return base + "/" + path;
    return base + "/parent/" + path;
  };
  /** visualVIC Routines Planner (prod). */
  window.ROUTINES_PLANNER_URL =
    window.ROUTINES_PLANNER_URL || "https://visual-vic.vercel.app/planner";
  window.ROUTINES_PLANNER_HANDOFF_URL =
    window.ROUTINES_PLANNER_HANDOFF_URL ||
    "https://visual-vic.vercel.app/planner/auth/handoff";
  window.ROUTINES_PLANNER_LOGIN_URL =
    window.ROUTINES_PLANNER_LOGIN_URL ||
    "https://visual-vic.vercel.app/planner/login";
  window.PORTAL_INDUCTION_BASE_URL =
    window.PORTAL_INDUCTION_BASE_URL ||
    String(window.PORTAL_CANONICAL_ORIGIN).replace(/\/$/, "") + "/general-induction/";

  window.portalCanonicalPortalPageUrl = function portalCanonicalPortalPageUrl(path) {
    path = String(path || "").replace(/^\//, "");
    try {
      var here = String(window.location.origin || "").replace(/\/$/, "");
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(here)) {
        return here + "/" + path;
      }
      if (/portalvic\.vercel\.app$/i.test(here)) {
        return here + "/" + path;
      }
    } catch (_) {}
    var origin = String(window.PORTAL_CANONICAL_ORIGIN || "https://portalvic.vercel.app").replace(
      /\/$/,
      ""
    );
    return origin + "/" + path;
  };

  window.portalPortalHostLooksWrong = function portalPortalHostLooksWrong() {
    try {
      var host = String(window.location.hostname || "").toLowerCase();
      if (!host || host === "localhost" || host === "127.0.0.1") return false;
      if (/portalvic\.vercel\.app$/i.test(host)) return false;
      if (/clubsensational-staff\.vercel\.app$/i.test(host)) return false;
      if (/vercel\.app$/i.test(host)) return false;
      if (/clubsensational\.org$/i.test(host)) return false;
      return true;
    } catch (_) {
      return false;
    }
  };

  /** Staff app must not host the family portal — send parents to clubsensational.org/parent. */
  (function portalRedirectFamilyOffStaffHost() {
    try {
      var host = String(window.location.hostname || "").toLowerCase();
      if (!/clubsensational-staff\.vercel\.app$/i.test(host)) return;
      var path = String(window.location.pathname || "").toLowerCase();
      if (
        path === "/parent" ||
        path === "/parents" ||
        path.indexOf("/parent/") === 0 ||
        path.indexOf("/parents/") === 0 ||
        path.indexOf("/parent_") === 0 ||
        path.indexOf("parent_portal") >= 0 ||
        path.indexOf("parent_reenrolment") >= 0 ||
        path.indexOf("parent_registration") >= 0 ||
        path.indexOf("climbing_registration") >= 0 ||
        path === "/re-enrolment"
      ) {
        var suffix =
          path.replace(/^\//, "") +
          String(window.location.search || "") +
          String(window.location.hash || "");
        if (/^parents(?:\/|$)/.test(suffix)) {
          suffix = suffix.replace(/^parents/, "parent");
        }
        window.location.replace(window.portalFamilyPortalUrl(suffix));
      }
    } catch (_) {}
  })();

  (function portalRedirectGeneralInductionOffWrongHost() {
    try {
      var path = String(window.location.pathname || "");
      if (path.toLowerCase().indexOf("general-induction") < 0) return;
      if (!window.portalPortalHostLooksWrong()) return;
      var suffix = path.replace(/^\//, "") + String(window.location.search || "") + String(window.location.hash || "");
      window.location.replace(window.portalCanonicalPortalPageUrl(suffix));
    } catch (_) {}
  })();

  (function portalLoadScreenshotGuardEarly() {
    try {
      var path = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (/login\.html(?:$|[?#])/.test(path) || /\/login(?:$|[/?#])/.test(path)) return;
      var sensitive =
        /staff_dashboard|staff_profile_update|portal-|cancellation|observation|policies|pickup|certificates|ra_portal|risk_assessment|staff_wellbeing_checkin|staff_wellbeing_review|venue-review|incident|expenses|timesheet/i.test(
          path
        );
      if (!sensitive) return;
      if (document.querySelector('script[src*="portal_screenshot_guard.js"]')) return;
      var base = window.PORTAL_SHARED_JS_BASE || "/portal-shared-js";
      var head = document.head || document.documentElement;
      if (!document.querySelector('link[data-portal-screenshot-guard-css="1"]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = base + "/portal_screenshot_guard.css?v=20260606-watermark-shot";
        link.setAttribute("data-portal-screenshot-guard-css", "1");
        head.appendChild(link);
      }
      if (!document.querySelector('script[data-portal-screenshot-guard-js="1"]')) {
        var s = document.createElement("script");
        s.src = base + "/portal_screenshot_guard.js?v=20260606-watermark-shot";
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
      var cached = sessionStorage.getItem(BRIDGE_KEY) || "";
      if (cached && cached.indexOf("%%") !== 0 && cached.length >= 16) return cached;
    } catch (_) {}
    try {
      var fromWin = String(window.STAFF_PROFILE_PORTAL_BRIDGE_SECRET || "").trim();
      if (fromWin && fromWin.indexOf("%%") !== 0 && fromWin.length >= 16) {
        window.portalPersistBridgeSecret(fromWin);
        return fromWin;
      }
    } catch (_) {}
    return "";
  };

  window.portalReadBridgeSecret = function portalReadBridgeSecret() {
    try {
      if (typeof window.portalEnsureBridgeCached === "function") {
        var cached = String(window.portalEnsureBridgeCached() || "").trim();
        if (cached) return cached;
      }
    } catch (_) {}
    try {
      var legacy =
        sessionStorage.getItem("clubsens_portal_bridge_v1") ||
        localStorage.getItem("clubsens_portal_bridge_v1") ||
        "";
      var t = String(legacy || "").trim();
      if (t && t.indexOf("%%") !== 0 && t.length >= 16) {
        window.portalPersistBridgeSecret(t);
        return t;
      }
    } catch (_) {}
    return "";
  };

  try {
    window.portalEnsureBridgeCached();
  } catch (_) {}

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

  /** Annual profile check-in campaign — hide hub menu once confirmed on/after this date (UTC). */
  window.PORTAL_ANNUAL_PROFILE_CAMPAIGN_START = "2026-01-01";
  /** Fixed announcement row id (portal_staff_announcements) for the 2026 annual profile campaign. */
  window.PORTAL_ANNUAL_PROFILE_2026_ANNOUNCEMENT_ID = "a0260001-0001-4000-8000-0000000a2601";
  /** Day Centre Calendar 2026/27 — sign saves PDF to My Documents. */
  window.PORTAL_CALENDAR_2026_27_ANNOUNCEMENT_ID = "a0270001-0001-4000-8000-0000000a2701";

  window.portalAnnualProfileCampaignStartMs = function portalAnnualProfileCampaignStartMs() {
    try {
      var start = String(window.PORTAL_ANNUAL_PROFILE_CAMPAIGN_START || "2026-01-01").trim();
      var ms = Date.parse(start + "T00:00:00Z");
      return isNaN(ms) ? 0 : ms;
    } catch (_) {
      return 0;
    }
  };

  window.portalAnnualProfileIsCompleteAt = function portalAnnualProfileIsCompleteAt(confirmedAtIso) {
    if (!confirmedAtIso) return false;
    try {
      var t = Date.parse(String(confirmedAtIso));
      if (isNaN(t)) return false;
      return t >= portalAnnualProfileCampaignStartMs();
    } catch (_) {
      return false;
    }
  };

  window.portalHideAnnualProfileQuickMenu = function portalHideAnnualProfileQuickMenu() {
    try {
      var g = document.getElementById("portalAnnualProfileQuickGroup");
      if (g) {
        g.hidden = true;
        g.setAttribute("aria-hidden", "true");
        g.classList.remove("portal-annual-profile--pending");
      }
    } catch (_) {}
  };

  window.portalShowAnnualProfileQuickMenu = function portalShowAnnualProfileQuickMenu() {
    try {
      var g = document.getElementById("portalAnnualProfileQuickGroup");
      if (g) {
        g.hidden = false;
        g.setAttribute("aria-hidden", "false");
        g.classList.add("portal-annual-profile--pending");
      }
    } catch (_) {}
  };

  window.portalAnnualProfileQuickMenuShouldShow = function portalAnnualProfileQuickMenuShouldShow(opts) {
    opts = opts || {};
    try {
      if (new URLSearchParams(window.location.search).get("portalAnnualProfile") === "1") return true;
    } catch (_) {}
    try {
      if (localStorage.getItem("portalvic_annual_profile_checkin_v1") === "1") return false;
    } catch (_) {}
    var profile = opts.profile;
    if (
      profile &&
      portalAnnualProfileIsCompleteAt(profile.profile_last_confirmed_at)
    ) {
      return false;
    }
    return true;
  };

  /** Hide Annual profile check-in when Supabase says this user already confirmed (2026 cycle). */
  window.portalSyncAnnualProfileQuickMenu = async function portalSyncAnnualProfileQuickMenu(opts) {
    opts = opts || {};
    try {
      var force = false;
      try {
        force = new URLSearchParams(window.location.search).get("portalAnnualProfile") === "1";
      } catch (_) {}
      if (force) {
        portalShowAnnualProfileQuickMenu();
        return;
      }

      try {
        if (localStorage.getItem("portalvic_annual_profile_checkin_v1") === "1") {
          portalHideAnnualProfileQuickMenu();
          return;
        }
      } catch (_) {}

      var profile = opts.profile;
      if (
        profile &&
        portalAnnualProfileIsCompleteAt(profile.profile_last_confirmed_at)
      ) {
        try {
          localStorage.setItem("portalvic_annual_profile_checkin_v1", "1");
        } catch (_) {}
        portalHideAnnualProfileQuickMenu();
        return;
      }

      if (portalAnnualProfileQuickMenuShouldShow({ profile: profile })) {
        portalShowAnnualProfileQuickMenu();
      }

      var client = opts.client;
      var userId =
        opts.userId ||
        (profile && profile.id) ||
        "";
      if (!client || !userId) {
        var box = window.__PORTAL_SUPABASE__;
        client = client || (box && box.client);
        userId =
          userId ||
          (box && box.staff_profile && box.staff_profile.id) ||
          (box && box.session && box.session.user && box.session.user.id) ||
          "";
      }
      if (!client || !userId) return;

      var res = await client
        .from("staff_profiles")
        .select("profile_last_confirmed_at")
        .eq("id", userId)
        .maybeSingle();
      if (res.error) return;
      if (portalAnnualProfileIsCompleteAt(res.data && res.data.profile_last_confirmed_at)) {
        try {
          localStorage.setItem("portalvic_annual_profile_checkin_v1", "1");
        } catch (_) {}
        portalHideAnnualProfileQuickMenu();
      } else if (portalAnnualProfileQuickMenuShouldShow()) {
        portalShowAnnualProfileQuickMenu();
      }
    } catch (_) {}
  };

  /** Auto-ack annual profile announcement after staff_profile_update save (Option A + B). */
  window.portalAckAnnualProfileCampaignAnnouncement = async function portalAckAnnualProfileCampaignAnnouncement() {
    var annId = String(window.PORTAL_ANNUAL_PROFILE_2026_ANNOUNCEMENT_ID || "").trim();
    if (!annId) return { ok: false };
    try {
      localStorage.setItem("portalvic_annual_profile_checkin_v1", "1");
    } catch (_) {}
    portalHideAnnualProfileQuickMenu();
    var key = "portal-ann:" + annId;
    var ack = {};
    try {
      var raw = localStorage.getItem("portalAnnouncementAckMap_v1");
      ack = raw ? JSON.parse(raw) : {};
      if (!ack || typeof ack !== "object") ack = {};
    } catch (_) {
      ack = {};
    }
    if (!ack[key]) {
      ack[key] = {
        title: "Annual profile check-in — please update your details",
        text: "",
        href: "staff_profile_update.html",
        signedAt: Date.now(),
        portalAnnouncementId: annId,
      };
      try {
        localStorage.setItem("portalAnnouncementAckMap_v1", JSON.stringify(ack));
      } catch (_) {}
    }
    try {
      if (typeof window.portalPersistAnnouncementAckToSupabase === "function") {
        await window.portalPersistAnnouncementAckToSupabase({
          portalAnnouncementId: annId,
          title: ack[key].title,
          text: ack[key].text,
          href: ack[key].href,
        });
      }
    } catch (_) {}
    try {
      var box = window.__PORTAL_SUPABASE__;
      if (box && box.staff_profile) {
        box.staff_profile.profile_last_confirmed_at = new Date().toISOString();
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("portal:annual-profile-complete"));
    } catch (_) {}
    return { ok: true };
  };

  (function portalAnnualProfileQuickMenuBootstrap() {
    try {
      var path = String((location && location.pathname) || "").toLowerCase();
      if (path.indexOf("staff_dashboard") < 0) return;
      window.addEventListener("portal:supabase-ready", function () {
        void window.portalSyncAnnualProfileQuickMenu();
      });
    } catch (_) {}
  })();

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
        var u = new URL(href, location.href);
        if (!u.searchParams.get("from_portal")) {
          var role =
            typeof window.portalFormRoleFromPath === "function"
              ? window.portalFormRoleFromPath()
              : "staff";
          u.searchParams.set("from_portal", role === "lead" ? "lead" : "staff");
        }
        if (!u.searchParams.get("portalReturn")) {
          var dash = String(location.href || "").split("#")[0];
          if (/staff_dashboard/i.test(String(location.pathname || "")) && dash) {
            u.searchParams.set("portalReturn", dash);
          }
        }
        href = u.href;
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
    if (fp === "lead" || fp === "staff") return "staff_dashboard.html";
    try {
      var box = window.__PORTAL_SUPABASE__;
      var profile = box && box.staff_profile;
      var email =
        box && box.session && box.session.user && box.session.user.email
          ? box.session.user.email
          : "";
      if (
        typeof window.portalIsProgrammeLeadUser === "function" &&
        window.portalIsProgrammeLeadUser(profile, email)
      ) {
        return "staff_dashboard.html";
      }
      if (
        typeof window.portalIsStaffHomeProgrammeLead === "function" &&
        window.portalIsStaffHomeProgrammeLead(profile, email)
      ) {
        return "staff_dashboard.html";
      }
      if (
        typeof window.portalIsAdminHomeExecutiveUser === "function" &&
        window.portalIsAdminHomeExecutiveUser(profile, email)
      ) {
        return "admin_dashboard.html";
      }
      if (
        typeof window.portalCanAccessCeoDashboard === "function" &&
        window.portalCanAccessCeoDashboard(profile, email)
      ) {
        return "admin_dashboard.html";
      }
    } catch (_) {}
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("staff_dashboard") >= 0) return "staff_dashboard.html";
      if (p.indexOf("portal-lead-feedback") >= 0) return "staff_dashboard.html";
      if (p.indexOf("portal-lead-session-overview") >= 0) return "staff_dashboard.html";
    } catch (_) {}
    return "staff_dashboard.html";
  };

  window.portalFormRoleFromPath = function portalFormRoleFromPath() {
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("staff_dashboard") >= 0) return "staff";
      if (p.indexOf("portal-lead-feedback") >= 0) return "lead_report";
      if (p.indexOf("portal-lead-session-overview") >= 0) return "lead";
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
              ? "staff_dashboard.html"
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

  function portalResolveVoiceStaffName() {
    try {
      if (typeof window.readPinIdentityName === "function") {
        var pin = String(window.readPinIdentityName() || "").trim();
        if (pin) return pin;
      }
    } catch (_) {}
    try {
      var box = window.__PORTAL_SUPABASE__;
      var profile = box && box.staff_profile;
      var nm = profile && (profile.full_name || profile.username);
      if (nm) return String(nm).trim();
    } catch (_) {}
    try {
      var bar = document.getElementById("portalPinIdentityBar");
      if (bar) {
        var txt = String(bar.textContent || "").trim();
        if (txt) return txt.replace(/^signed in as\s*/i, "").trim();
      }
    } catch (_) {}
    return "";
  }

  /** Voice transcriptor on all long textareas across portal staff forms. */
  (function portalFormVoiceBootstrap() {
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
        "termreview",
        "swtermreview",
        "staff_wellbeing_checkin",
        "staff_wellbeing_review",
        "performance",
      ];
      var isForm = formSlugs.some(function (slug) {
        return path.indexOf(slug) >= 0;
      });
      if (!isForm) return;

      var voiceRescanTimer = null;
      function scheduleVoiceRescan(staffName) {
        if (voiceRescanTimer) clearTimeout(voiceRescanTimer);
        voiceRescanTimer = setTimeout(function () {
          voiceRescanTimer = null;
          try {
            if (
              typeof window.PortalFeedbackVoiceInput !== "undefined" &&
              typeof window.PortalFeedbackVoiceInput.rescan === "function"
            ) {
              window.PortalFeedbackVoiceInput.rescan({ staffName: staffName || "" });
            }
          } catch (_) {}
        }, 180);
      }

      function runPortalVoiceInit() {
        if (typeof window.PortalFeedbackVoiceInput === "undefined") return;
        var staffName = portalResolveVoiceStaffName();
        try {
          window.PortalFeedbackVoiceInput.init({ auto: true, staffName: staffName });
        } catch (e) {
          console.warn("[portal] voice init", e);
        }
        try {
          if (typeof MutationObserver !== "undefined" && document.body) {
            var mo = new MutationObserver(function () {
              scheduleVoiceRescan(portalResolveVoiceStaffName());
            });
            mo.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ["hidden", "class"],
            });
          }
        } catch (_) {}
        try {
          if (
            typeof window.PortalFeedbackVoiceInput.prefetch === "function"
          ) {
            window.PortalFeedbackVoiceInput.prefetch();
          }
        } catch (_) {}
      }

      function startPortalVoice() {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", runPortalVoiceInit, { once: true });
        } else {
          runPortalVoiceInit();
        }
      }

      var voiceReady =
        typeof window.PortalFeedbackVoiceInput !== "undefined" &&
        typeof window.PortalFeedbackVoiceInput.rescan === "function" &&
        window.PortalFeedbackVoiceInput.captureVersion === "voice-status-clear";
      if (voiceReady) {
        startPortalVoice();
      } else {
        var voiceScript = document.createElement("script");
        voiceScript.src =
          "/portal/portal_feedback_voice_input.js?v=20260702-record-120s-warn-90s";
        voiceScript.onload = startPortalVoice;
        voiceScript.onerror = function () {};
        (document.head || document.documentElement).appendChild(voiceScript);
      }
    } catch (_) {}
  })();

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
        "session_disruption",
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

  /** When visualVIC prod URL is configured, enable Plan topbar + quick menu (session handoff). */
  (function portalRoutinesPlannerBootstrap() {
    var handoffUrl = String(window.ROUTINES_PLANNER_HANDOFF_URL || "").trim();
    var loginUrl = String(window.ROUTINES_PLANNER_LOGIN_URL || "").trim();
    if (!handoffUrl && !loginUrl) return;

    function resolveRoutinesAuthClient() {
      try {
        var box = window.__PORTAL_SUPABASE__;
        if (box && box.client && box.client.auth) return box.client;
      } catch (_) {}
      try {
        if (typeof supabase !== "undefined" && supabase && supabase.auth) return supabase;
      } catch (_) {}
      return null;
    }

    var VISUAL_VIC_WINDOW_NAME = "portalVisualVicPlanner";
    var VISUAL_VIC_WINDOW_FEATURES = "noopener,noreferrer";

    function openVisualVicPlannerUrl(url) {
      var u = String(url || "").trim();
      if (!u) return false;
      try {
        var w = window.open(u, VISUAL_VIC_WINDOW_NAME, VISUAL_VIC_WINDOW_FEATURES);
        if (w) {
          try {
            w.focus();
          } catch (_) {}
        }
        return !!w;
      } catch (_) {
        return false;
      }
    }

    window.portalOpenRoutinesPlanner = async function portalOpenRoutinesPlanner() {
      var handoff = handoffUrl;
      var login = loginUrl;
      if (!handoff || !login) return false;
      var authClient = resolveRoutinesAuthClient();
      if (!authClient) {
        return openVisualVicPlannerUrl(login);
      }
      try {
        var result = await authClient.auth.getSession();
        var session = result && result.data && result.data.session;
        if (!session || !session.access_token || !session.refresh_token) {
          return openVisualVicPlannerUrl(login);
        }
        var hash = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }).toString();
        return openVisualVicPlannerUrl(handoff + "#" + hash);
      } catch (_) {
        return openVisualVicPlannerUrl(login);
      }
    };

    var PLANNER_CLICK_IDS = [
      "topbarToolSessionPlanner",
      "quickMenuStaffSessionPlan",
      "quickMenuLeadSessionPlan",
    ];

    function bindPlannerHandoffClick(id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute("data-portal-planner-bound") === "1") return;
      el.setAttribute("data-portal-planner-bound", "1");
      el.addEventListener(
        "click",
        function (e) {
          if (el.disabled || el.getAttribute("aria-disabled") === "true") return;
          e.preventDefault();
          e.stopPropagation();
          void window.portalOpenRoutinesPlanner();
        },
        true,
      );
    }

    function enablePlannerUi() {
      PLANNER_CLICK_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove("menu-btn--feature-deactivated");
        el.removeAttribute("disabled");
        el.removeAttribute("aria-disabled");
        if (el.tagName === "BUTTON") el.disabled = false;
        el.removeAttribute("data-portal-external-url");
        if (id === "quickMenuStaffSessionPlan" || id === "quickMenuLeadSessionPlan") {
          el.setAttribute("aria-label", "Session planner — open routines planner");
        }
        var sub = el.querySelector(".menu-btn-sub");
        if (sub) sub.textContent = "Open routines planner";
        bindPlannerHandoffClick(id);
      });
    }
    window.portalEnableRoutinesPlannerUi = enablePlannerUi;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", enablePlannerUi);
    } else {
      enablePlannerUi();
    }
  })();
})();
