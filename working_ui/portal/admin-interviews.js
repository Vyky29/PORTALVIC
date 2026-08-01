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
      '<a class="btn btn--pri" href="/Working_interview.html">' +
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
