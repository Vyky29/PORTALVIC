/**
 * Admin ghost view — read-only mirror of a worker dashboard via short-lived token.
 * URL: staff_dashboard.html?ghostToken=… (admin must be signed in on same origin).
 */
(function (global) {
  "use strict";

  function parseGhostTokenFromUrl() {
    try {
      var q = new URLSearchParams(String(global.location && global.location.search || ""));
      return String(q.get("ghostToken") || q.get("ghost") || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function supabaseConfig() {
    var url = "";
    var anon = "";
    try {
      url = String(global.SUPABASE_URL || "").trim().replace(/\/$/, "");
      anon = String(global.SUPABASE_ANON_KEY || "").trim();
      if (!url && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.url) {
        url = String(global.__PORTAL_SUPABASE__.url || "").trim().replace(/\/$/, "");
      }
      if (!anon && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.anonKey) {
        anon = String(global.__PORTAL_SUPABASE__.anonKey || "").trim();
      }
    } catch (_e) {}
    return { url: url, anon: anon };
  }

  async function authToken() {
    var sess =
      global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session
        ? global.__PORTAL_SUPABASE__.session
        : null;
    if (sess && sess.access_token) return sess.access_token;
    if (global.supabase && global.supabase.auth) {
      var r = await global.supabase.auth.getSession();
      sess = r && r.data && r.data.session ? r.data.session : null;
      if (sess && sess.access_token) return sess.access_token;
    }
    return null;
  }

  function applyGhostBanner(meta) {
    if (!meta || !meta.active) return;
    try {
      document.documentElement.classList.add("portal-ghost-view");
      document.body.classList.add("portal-ghost-view");
    } catch (_e) {}

    var host = document.getElementById("portalGhostViewBanner");
    if (!host) {
      host = document.createElement("div");
      host.id = "portalGhostViewBanner";
      host.className = "portal-ghost-view-banner";
      host.setAttribute("role", "status");
      document.body.insertBefore(host, document.body.firstChild);
    }

    var online = meta.online || {};
    var onlineBit = online.isOnline
      ? "Online · " + (online.lastPage || "active")
      : "Offline";
    host.innerHTML =
      '<div class="portal-ghost-view-banner__inner">' +
      '<span class="portal-ghost-view-banner__tag">GHOST VIEW</span>' +
      '<span class="portal-ghost-view-banner__name">' +
      escapeHtml(meta.displayName || meta.rosterKey || "Staff") +
      "</span>" +
      '<span class="portal-ghost-view-banner__meta muted">' +
      escapeHtml(onlineBit) +
      " · read-only</span>" +
      '<button type="button" class="portal-ghost-view-banner__close" id="portalGhostViewCloseBtn">Close</button>' +
      "</div>";

    var closeBtn = document.getElementById("portalGhostViewCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        try {
          if (global.parent && global.parent !== global) {
            global.parent.postMessage({ type: "portal-ghost-view-close" }, "*");
            return;
          }
        } catch (_eParent) {}
        try {
          global.close();
        } catch (_e2) {
          global.location.href = "admin_dashboard.html";
        }
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bindReadOnlyGuards() {
    if (global.__PORTAL_GHOST_GUARDS_BOUND__) return;
    global.__PORTAL_GHOST_GUARDS_BOUND__ = true;

    document.addEventListener(
      "submit",
      function (ev) {
        if (!portalIsGhostViewMode()) return;
        ev.preventDefault();
        ev.stopPropagation();
        portalGhostViewToast("Ghost view is read-only.");
      },
      true
    );

    document.addEventListener(
      "click",
      function (ev) {
        if (!portalIsGhostViewMode()) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest("#portalGhostViewBanner")) return;
        if (t.closest(".portal-ghost-view-allow")) return;
        var blocked = t.closest(
          "button[type='submit'], [data-portal-ghost-block], .portal-dm-compose, #internalChatSendBtn, .portal-feedback-submit, .portal-session-end-btn"
        );
        if (!blocked) return;
        ev.preventDefault();
        ev.stopPropagation();
        portalGhostViewToast("Ghost view is read-only.");
      },
      true
    );
  }

  function portalGhostViewToast(msg) {
    var el = document.getElementById("portalGhostViewToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "portalGhostViewToast";
      el.className = "portal-ghost-view-toast";
      el.setAttribute("role", "alert");
      document.body.appendChild(el);
    }
    el.textContent = String(msg || "Read-only");
    el.classList.add("is-visible");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2600);
  }

  function portalIsGhostViewMode() {
    return !!(global.__PORTAL_GHOST_VIEW__ && global.__PORTAL_GHOST_VIEW__.active);
  }

  /** Handoff for child pages (timesheet, payslips) opened from ghost dashboard quick menu. */
  function portalParseGhostHandoffFromUrl(loc) {
    try {
      var base = loc || (typeof global.location !== "undefined" ? global.location : null);
      if (!base || !base.search) return null;
      var q = new URLSearchParams(String(base.search || ""));
      var rosterKey = String(q.get("ghostRosterKey") || "")
        .trim()
        .toLowerCase();
      var staffUserId = String(q.get("ghostStaffUserId") || "").trim();
      if (!rosterKey && !staffUserId) return null;
      if (q.get("ghostView") !== "1" && !staffUserId) return null;
      return {
        rosterKey: rosterKey,
        staffUserId: staffUserId,
        displayName: String(q.get("ghostDisplayName") || "").trim(),
        readOnly: true,
      };
    } catch (_e) {
      return null;
    }
  }

  function portalAppendGhostHandoffToUrl(url) {
    var handoff =
      global.__PORTAL_GHOST_VIEW__ && global.__PORTAL_GHOST_VIEW__.active
        ? global.__PORTAL_GHOST_VIEW__
        : null;
    if (!handoff) return String(url || "");
    try {
      var tu = new URL(String(url || ""), global.location.href);
      if (handoff.rosterKey) tu.searchParams.set("ghostRosterKey", String(handoff.rosterKey));
      if (handoff.staffUserId) tu.searchParams.set("ghostStaffUserId", String(handoff.staffUserId));
      if (handoff.displayName) tu.searchParams.set("ghostDisplayName", String(handoff.displayName));
      tu.searchParams.set("ghostView", "1");
      return tu.href;
    } catch (_e2) {
      return String(url || "");
    }
  }

  async function verifyGhostToken(token) {
    var cfg = supabaseConfig();
    if (!cfg.url || !cfg.anon) {
      return { ok: false, error: "supabase_not_configured" };
    }
    var bearer = await authToken();
    if (!bearer) {
      return { ok: false, error: "admin_session_required" };
    }
    var res = await fetch(cfg.url + "/functions/v1/portal-admin-ghost-verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + bearer,
        apikey: cfg.anon,
      },
      body: JSON.stringify({ ghostToken: token }),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { ok: false, error: (j && j.error) || "verify_failed" };
    }
    return { ok: true, data: j };
  }

  function waitForSupabaseSession(maxMs) {
    maxMs = Number(maxMs) > 0 ? Number(maxMs) : 8000;
    return new Promise(function (resolve) {
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session) {
        resolve(global.__PORTAL_SUPABASE__.session);
        return;
      }
      var done = false;
      function finish(sess) {
        if (done) return;
        done = true;
        resolve(sess || null);
      }
      global.addEventListener(
        "portal:supabase-ready",
        function () {
          finish(global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session);
        },
        { once: true }
      );
      setTimeout(function () {
        if (global.supabase && global.supabase.auth) {
          global.supabase.auth
            .getSession()
            .then(function (r) {
              finish(r && r.data && r.data.session ? r.data.session : null);
            })
            .catch(function () {
              finish(null);
            });
          return;
        }
        finish(null);
      }, maxMs);
    });
  }

  async function runGhostBootstrap() {
    var token = parseGhostTokenFromUrl();
    if (!token) {
      global.__PORTAL_GHOST_VIEW__ = { active: false };
      return;
    }

    await waitForSupabaseSession(8000);

    var result = await verifyGhostToken(token);
    if ((!result.ok || !result.data) && result.error === "admin_session_required") {
      await waitForSupabaseSession(4000);
      result = await verifyGhostToken(token);
    }
    if (!result.ok || !result.data) {
      global.__PORTAL_GHOST_VIEW__ = {
        active: false,
        error: result.error || "verify_failed",
      };
      try {
        document.body.classList.add("portal-ghost-view-error");
        var err = document.createElement("div");
        err.className = "portal-ghost-view-error-panel";
        err.innerHTML =
          "<strong>Ghost view unavailable</strong><p>Stay signed in to the admin portal on this device, then open Teleport again. If this keeps happening, close other portal tabs and retry.</p>";
        document.body.insertBefore(err, document.body.firstChild);
      } catch (_e) {}
      return;
    }

    var target = result.data.target || {};
    var online = result.data.online || {};
    global.__PORTAL_GHOST_VIEW__ = {
      active: true,
      ghostToken: token,
      staffUserId: target.staffUserId || "",
      rosterKey: String(target.rosterKey || "").toLowerCase(),
      displayName: target.displayName || target.rosterKey || "",
      surface: target.surface || "staff",
      online: online,
      expiresAt: result.data.expiresAt || null,
    };

    applyGhostBanner(global.__PORTAL_GHOST_VIEW__);
    bindReadOnlyGuards();
    try {
      global.dispatchEvent(new CustomEvent("portal:ghost-ready", { detail: global.__PORTAL_GHOST_VIEW__ }));
    } catch (_e2) {}
  }

  var tokenEarly = parseGhostTokenFromUrl();
  if (tokenEarly) {
    global.__PORTAL_GHOST_VERIFY_PROMISE__ = new Promise(function (resolve) {
      var started = false;
      function finish() {
        resolve(global.__PORTAL_GHOST_VIEW__ || { active: false });
      }
      function start() {
        if (started) return;
        started = true;
        runGhostBootstrap()
          .then(finish)
          .catch(function () {
            global.__PORTAL_GHOST_VIEW__ = { active: false, error: "verify_failed" };
            finish();
          });
      }
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session) {
        start();
      } else {
        global.addEventListener("portal:supabase-ready", start, { once: true });
        setTimeout(start, 8000);
      }
    });
  } else {
    global.__PORTAL_GHOST_VIEW__ = { active: false };
    global.__PORTAL_GHOST_VERIFY_PROMISE__ = Promise.resolve(global.__PORTAL_GHOST_VIEW__);
    var handoffEarly = portalParseGhostHandoffFromUrl();
    if (handoffEarly) {
      global.__PORTAL_GHOST_VIEW__ = {
        active: true,
        staffUserId: handoffEarly.staffUserId,
        rosterKey: handoffEarly.rosterKey,
        displayName: handoffEarly.displayName,
        readOnly: true,
        handoffOnly: true,
      };
      applyGhostBanner(global.__PORTAL_GHOST_VIEW__);
      bindReadOnlyGuards();
    }
  }

  global.portalIsGhostViewMode = portalIsGhostViewMode;
  global.portalGhostViewToast = portalGhostViewToast;
  global.portalParseGhostHandoffFromUrl = portalParseGhostHandoffFromUrl;
  global.portalAppendGhostHandoffToUrl = portalAppendGhostHandoffToUrl;
})(typeof window !== "undefined" ? window : globalThis);
