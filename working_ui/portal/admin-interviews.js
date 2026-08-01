/**
 * Admin Interviews — live pipeline from Portal `onboarding_candidates`
 * (same records as Working_interview.html).
 *
 * Buckets:
 *   - Onboarding: face successful-ready / ready to start
 *   - Call back later: unsuccessful or successful-hold (contact again later)
 *   - In progress: call / face still open
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: null,
    esc: null,
    toast: null
  };

  var root = null;
  var state = {
    loading: false,
    rows: [],
    error: ""
  };

  function esc(s) {
    if (deps.esc) return deps.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function client() {
    return deps.getClient ? deps.getClient() : null;
  }

  function ensureShape(raw) {
    var c = raw && typeof raw === "object" ? raw : {};
    c.callInterview = c.callInterview || {};
    c.faceToFaceInterview = c.faceToFaceInterview || {};
    c.onboarding = c.onboarding || {};
    return c;
  }

  function phaseOf(candidate) {
    var c = ensureShape(candidate);
    var face = String(c.faceToFaceInterview.status || "");
    var call = String(c.callInterview.status || "");
    var ob = c.onboarding;
    if (ob.readyToStart || ob.onboardingCompleted) return "ready";
    if (face === "successful-ready" || face === "successful") return "onboarding";
    if (face === "successful-hold") return "hold";
    if (face === "unsuccessful") return "face_unsuccessful";
    if (call === "successful") return "face_to_face";
    if (call === "unsuccessful") return "call_unsuccessful";
    if (c.callInterview.date || c.callInterview.time || c.callInterview.comments) return "call";
    return "new";
  }

  function bucketOf(phase) {
    if (phase === "ready" || phase === "onboarding") return "onboarding";
    if (phase === "hold" || phase === "face_unsuccessful" || phase === "call_unsuccessful") {
      return "callback";
    }
    return "progress";
  }

  function stageLabel(phase) {
    return (
      {
        ready: "Ready for onboarding",
        onboarding: "Onboarding",
        hold: "Successful — on hold (call later)",
        face_unsuccessful: "Face unsuccessful — call later",
        call_unsuccessful: "Call unsuccessful — call later",
        face_to_face: "Face to face",
        call: "Call interview",
        new: "New / in progress"
      }[phase] || phase
    );
  }

  function stageTone(phase) {
    if (phase === "ready" || phase === "onboarding") return "#15803d";
    if (phase === "hold") return "#7c3aed";
    if (phase === "face_unsuccessful" || phase === "call_unsuccessful") return "#b45309";
    if (phase === "face_to_face" || phase === "call") return "#2d84b3";
    return "#64748b";
  }

  function nextStep(c, phase) {
    var face = c.faceToFaceInterview || {};
    var ob = c.onboarding || {};
    if (phase === "ready") return "Start date / induction";
    if (phase === "onboarding") {
      return ob.role ? "Continue " + ob.role + " checklist" : "Open onboarding checklist";
    }
    if (phase === "hold") {
      return (face.successfulHoldReason || "Recontact when a seat opens").slice(0, 120);
    }
    if (phase === "face_unsuccessful") {
      return (face.unsuccessfulReason || "Keep for a future call").slice(0, 120);
    }
    if (phase === "call_unsuccessful") {
      return ((c.callInterview && c.callInterview.unsuccessfulReason) || "Call again later").slice(0, 120);
    }
    if (phase === "face_to_face") return "Book / complete face to face";
    if (phase === "call") return "Finish call interview";
    return "Start interview";
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function injectStyleOnce() {
    if (document.getElementById("adminInterviewsStyle")) return;
    var css =
      ".ai-wrap .ai-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}" +
      ".ai-wrap .ai-refresh{font-size:12px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:6px 12px;cursor:pointer}" +
      ".ai-wrap .ai-meta{margin:0 0 14px;font-size:13px;color:#64748b;line-height:1.45;max-width:52rem;min-width:0;overflow-wrap:break-word}" +
      ".ai-wrap .ai-section{margin-bottom:14px}" +
      ".ai-wrap .ai-table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff}" +
      ".ai-wrap table.ai-table{width:100%;border-collapse:collapse;font-size:13px}" +
      ".ai-wrap table.ai-table th,.ai-wrap table.ai-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;vertical-align:middle;min-width:0}" +
      ".ai-wrap table.ai-table th{background:#f8fafc;font-weight:700;color:#0f2747;white-space:nowrap}" +
      ".ai-wrap table.ai-table tr:last-child td{border-bottom:0}" +
      ".ai-wrap table.ai-table td{overflow-wrap:break-word}" +
      ".ai-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid transparent;max-width:100%;overflow-wrap:break-word}" +
      ".ai-empty{padding:16px;font-size:13px;color:#64748b}" +
      ".ai-err{padding:12px 14px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:13px;margin-bottom:12px}";
    var st = document.createElement("style");
    st.id = "adminInterviewsStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function openHref(name) {
    var q = name ? "?q=" + encodeURIComponent(name) : "";
    return "/Working_interview.html" + q;
  }

  async function readAdminSessionForHandoff() {
    // Prefer the live Admin client session first (this is what already loads the Interviews list).
    var sb = client();
    if (sb && sb.auth && typeof sb.auth.getSession === "function") {
      try {
        var res = await sb.auth.getSession();
        if (res && res.data && res.data.session && res.data.session.access_token) {
          return res.data.session;
        }
      } catch (_e) {
        /* ignore */
      }
    }
    var box = global.__PORTAL_SUPABASE__ || {};
    if (box.session && box.session.access_token) {
      return box.session;
    }
    if (typeof global.portalAdminReadStoredAuthSession === "function") {
      var stored = global.portalAdminReadStoredAuthSession();
      if (stored && stored.access_token) return stored;
    }
    if (typeof global.portalAdminResolveAccessToken === "function") {
      var tok = global.portalAdminResolveAccessToken();
      if (tok) return { access_token: tok, refresh_token: "" };
    }
    return null;
  }

  function closeInterviewOverlay() {
    var ov = document.getElementById("aiInterviewOverlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    try {
      document.documentElement.classList.remove("ai-interview-overlay-open");
      document.body.classList.remove("ai-interview-overlay-open");
    } catch (_e) {
      /* ignore */
    }
    if (global.__aiInterviewAuthListener) {
      try {
        global.removeEventListener("message", global.__aiInterviewAuthListener);
      } catch (_e2) {
        /* ignore */
      }
      global.__aiInterviewAuthListener = null;
    }
    load();
  }

  async function openInterviewInApp(url) {
    var target = String(url || "/Working_interview.html");
    var sess = null;
    try {
      sess = await readAdminSessionForHandoff();
    } catch (_e) {
      sess = null;
    }
    if (!sess || !sess.access_token) {
      if (deps.toast) {
        deps.toast("Admin session not ready — wait a second and try Start again.", "err");
      }
      return;
    }

    closeInterviewOverlay();

    var sep = target.indexOf("?") >= 0 ? "&" : "?";
    var src = target + sep + "embedded=1";

    var ov = document.createElement("div");
    ov.id = "aiInterviewOverlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "Interview portal");
    ov.innerHTML =
      '<div class="ai-interview-overlay__bar">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="aiInterviewOverlayClose">← Back to Interviews</button>' +
      '<span class="ai-interview-overlay__title">Interview (same Admin login)</span>' +
      "</div>" +
      '<iframe class="ai-interview-overlay__frame" id="aiInterviewOverlayFrame" title="Interview and onboarding"></iframe>';

    if (!document.getElementById("aiInterviewOverlayStyle")) {
      var st = document.createElement("style");
      st.id = "aiInterviewOverlayStyle";
      st.textContent =
        "html.ai-interview-overlay-open,body.ai-interview-overlay-open{overflow:hidden!important}" +
        "#aiInterviewOverlay{position:fixed;inset:0;z-index:12000;display:flex;flex-direction:column;background:#0b1220}" +
        "#aiInterviewOverlay .ai-interview-overlay__bar{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:10px 14px;background:#0f2747;color:#fff;min-width:0}" +
        "#aiInterviewOverlay .ai-interview-overlay__title{font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
        "#aiInterviewOverlay .ai-interview-overlay__frame{flex:1 1 auto;width:100%;border:0;background:#fff;min-height:0}";
      document.head.appendChild(st);
    }

    document.body.appendChild(ov);
    try {
      document.documentElement.classList.add("ai-interview-overlay-open");
      document.body.classList.add("ai-interview-overlay-open");
    } catch (_eCls) {
      /* ignore */
    }

    var closeBtn = document.getElementById("aiInterviewOverlayClose");
    if (closeBtn) closeBtn.addEventListener("click", closeInterviewOverlay);

    var iframe = document.getElementById("aiInterviewOverlayFrame");
    var payload = {
      type: "portal-interview-auth",
      session: {
        access_token: sess.access_token,
        refresh_token: sess.refresh_token || "",
        expires_at: sess.expires_at || null,
        user: sess.user || null
      }
    };

    function sendAuth() {
      try {
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(payload, global.location.origin);
        }
      } catch (_eSend) {
        /* ignore */
      }
    }

    function onMsg(ev) {
      if (!ev || ev.origin !== global.location.origin) return;
      var data = ev.data || {};
      if (data.type === "portal-interview-auth-request") sendAuth();
      if (data.type === "portal-interview-close") closeInterviewOverlay();
    }
    global.__aiInterviewAuthListener = onMsg;
    global.addEventListener("message", onMsg);

    if (iframe) {
      iframe.addEventListener("load", function () {
        sendAuth();
        setTimeout(sendAuth, 400);
        setTimeout(sendAuth, 1200);
      });
      iframe.src = src;
    }
  }

  function bindInterviewOpenLinks() {
    if (!root) return;
    root.querySelectorAll("[data-interview-open]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        var href = el.getAttribute("data-interview-open") || openHref("");
        openInterviewInApp(href);
      });
    });
  }

  function tableFor(list) {
    if (!list.length) {
      return '<div class="ai-empty">None in this bucket yet.</div>';
    }
    var rows = list
      .map(function (row) {
        var c = row.candidate;
        var phase = row.phase;
        var tone = stageTone(phase);
        var role = (c.onboarding && c.onboarding.role) || "—";
        return (
          "<tr>" +
          "<td><strong>" +
          esc(c.name || "—") +
          "</strong></td>" +
          "<td>" +
          esc(role) +
          "</td>" +
          '<td><span class="ai-pill" style="background:' +
          tone +
          "14;color:" +
          tone +
          ";border-color:" +
          tone +
          '40">' +
          esc(stageLabel(phase)) +
          "</span></td>" +
          "<td class=\"muted\">" +
          esc(fmtWhen(c.updatedAt || row.updated_at)) +
          "</td>" +
          "<td>" +
          esc(nextStep(c, phase)) +
          "</td>" +
          '<td class="toolbar"><a class="btn btn--pri btn--sm" href="' +
          esc(openHref(c.name || "")) +
          '" data-interview-open="' +
          esc(openHref(c.name || "")) +
          '">Open</a></td>' +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="ai-table-wrap"><table class="ai-table tbl"><thead><tr>' +
      "<th>Name</th><th>Role</th><th>Stage</th><th>Updated</th><th>Next step</th><th></th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>"
    );
  }

  function section(title, hint, list) {
    return (
      '<div class="card ai-section"><div class="card-h"><h3>' +
      esc(title) +
      '</h3><span class="muted" style="font-size:12px">' +
      list.length +
      "</span></div>" +
      '<div class="card-pad">' +
      (hint
        ? '<p class="muted" style="margin:0 0 10px;font-size:12px;min-width:0;overflow-wrap:break-word">' +
          esc(hint) +
          "</p>"
        : "") +
      tableFor(list) +
      "</div></div>"
    );
  }

  function render() {
    if (!root) return;
    injectStyleOnce();
    var onboarding = [];
    var callback = [];
    var progress = [];
    state.rows.forEach(function (row) {
      var b = bucketOf(row.phase);
      if (b === "onboarding") onboarding.push(row);
      else if (b === "callback") callback.push(row);
      else progress.push(row);
    });

    var playIco =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none" style="flex:0 0 auto;vertical-align:-3px;margin-right:6px" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"/></svg>';

    root.innerHTML =
      '<div class="ai-wrap">' +
      '<div class="ai-toolbar">' +
      '<a class="btn btn--pri" href="/Working_interview.html" data-interview-open="/Working_interview.html">' +
      playIco +
      "Start a new interview</a>" +
      '<button type="button" class="ai-refresh" id="aiRefreshBtn">' +
      (state.loading ? "Loading…" : "Refresh") +
      "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="onboarding">Onboarding docs</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="staffhr">Staff &amp; HR</button>' +
      "</div>" +
      (state.error ? '<div class="ai-err">' + esc(state.error) + "</div>" : "") +
      '<p class="ai-meta">Live from interview portal (<code>onboarding_candidates</code>). Successful → Onboarding. Unsuccessful / on hold → Call back later so you can contact them again.</p>' +
      section(
        "Onboarding",
        "Face outcome Successful (Ready for onboarding). Open the record to continue the checklist.",
        onboarding
      ) +
      section(
        "Call back later",
        "Unsuccessful or Successful (on hold). Kept here to call again when a seat opens — not deleted.",
        callback
      ) +
      section("In progress", "Call or face-to-face still open.", progress) +
      "</div>";

    var btn = document.getElementById("aiRefreshBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        load();
      });
    }
    bindInterviewOpenLinks();
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();
    var sb = client();
    if (!sb) {
      state.loading = false;
      state.error = "Sign in to the admin portal to load live interview candidates.";
      render();
      return;
    }
    try {
      var res = await sb
        .from("onboarding_candidates")
        .select("id, data, updated_at")
        .order("updated_at", { ascending: false });
      if (res.error) throw res.error;
      state.rows = (res.data || []).map(function (row) {
        var candidate = ensureShape(Object.assign({}, row.data || {}, { id: row.id }));
        if (!candidate.updatedAt && row.updated_at) candidate.updatedAt = row.updated_at;
        return {
          id: row.id,
          updated_at: row.updated_at,
          candidate: candidate,
          phase: phaseOf(candidate)
        };
      });
    } catch (e) {
      state.rows = [];
      state.error = (e && e.message) || "Could not load interview candidates.";
      if (deps.toast) deps.toast(state.error, "err");
    }
    state.loading = false;
    render();
  }

  function configure(next) {
    deps = Object.assign(deps, next || {});
  }

  function mount(el) {
    root = el;
    if (!root) return;
    load();
  }

  global.AdminInterviews = {
    configure: configure,
    mount: mount,
    refresh: load
  };
})(typeof window !== "undefined" ? window : globalThis);
