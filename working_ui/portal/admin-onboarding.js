/**
 * Admin Onboarding — live applicant document tracker.
 *
 * Mirrors the "Onboarding" board from the other portal: one row per applicant
 * session with Job application / Health draft status, uploaded document chips,
 * last online / last upload, and Job/Health CSV export.
 *
 * Data comes from the Portal Edge Function `portal-admin-onboarding-documents-list`
 * (service role reads the Onboarding project Storage); CSV uses
 * `portal-admin-onboarding-draft-export`. The browser only ever holds the admin's
 * own Supabase session token + the publishable/anon key.
 *
 * Mounted by admin_dashboard.html into #onboardingModuleRoot (see bindView).
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: null,
    getSupabaseUrl: null,
    getAnonKey: null,
    esc: null,
    toast: null,
    gotoDocuments: null
  };

  var root = null;
  var state = {
    loading: false,
    applicants: [],
    uploadCounts: {},
    unlinked: 0,
    meta: {},
    error: ""
  };

  // docFilter = the matching filter key in the admin Documents view.
  var DOC_CHIP_SPECS = [
    { key: "passport", label: "Passport", docFilter: "passport" },
    { key: "checklist", label: "Checklist", docFilter: "checklist" },
    { key: "certificate", label: "Certificate", docFilter: "certificate" },
    { key: "firstaid", label: "First aid", docFilter: "firstaid" },
    { key: "safeguarding", label: "Safeguarding", docFilter: "certificate" }
  ];

  function esc(s) {
    if (deps.esc) return deps.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function supabaseUrl() {
    var u = deps.getSupabaseUrl ? deps.getSupabaseUrl() : "";
    u = (typeof u === "string" ? u : "").trim();
    return (u || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(/\/$/, "");
  }

  function anonKey() {
    var k = deps.getAnonKey ? deps.getAnonKey() : "";
    return typeof k === "string" ? k : "";
  }

  function client() {
    return deps.getClient ? deps.getClient() : null;
  }

  function fmtDate(iso) {
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
    if (document.getElementById("adminOnboardingStyle")) return;
    var css =
      ".ob-wrap .ob-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}" +
      ".ob-wrap .ob-refresh{font-size:12px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:6px 12px;cursor:pointer}" +
      ".ob-wrap .ob-refresh:hover{background:#e0e7ff}" +
      ".ob-wrap .ob-meta{margin:0 0 14px;font-size:13px;color:#64748b;line-height:1.45}" +
      ".ob-wrap .ob-table-wrap{overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff}" +
      ".ob-wrap table.ob-table{width:100%;border-collapse:collapse;font-size:13px}" +
      ".ob-wrap table.ob-table th,.ob-wrap table.ob-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;vertical-align:middle}" +
      ".ob-wrap table.ob-table th{background:#f8fafc;font-weight:700;color:#0f2747;white-space:nowrap}" +
      ".ob-wrap table.ob-table tr:last-child td{border-bottom:0}" +
      ".ob-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}" +
      ".ob-pill--yes{background:#d1fae5;color:#065f46}" +
      ".ob-pill--no{background:#f1f5f9;color:#64748b}" +
      ".ob-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
      ".ob-chip{font-size:11px;font-weight:700;color:#1e3a8a;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 10px;line-height:1.2;font-family:inherit}" +
      ".ob-chip--open{cursor:pointer}" +
      ".ob-chip--open:hover{background:#e0e7ff;border-color:#a5b4fc}" +
      ".ob-counts{font-size:12px;color:#64748b;line-height:1.4}" +
      ".ob-export{display:flex;flex-wrap:wrap;gap:6px}" +
      ".ob-export .ob-link{font-size:11px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:4px 10px;cursor:pointer}" +
      ".ob-export .ob-link:hover{background:#e0e7ff}" +
      ".ob-export .ob-link:disabled{opacity:.45;cursor:not-allowed;pointer-events:none}" +
      ".ob-notice{padding:16px;font-size:13px;color:#475569;line-height:1.5}";
    var st = document.createElement("style");
    st.id = "adminOnboardingStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function pill(done) {
    return '<span class="ob-pill ob-pill--' + (done ? "yes" : "no") + '">' + (done ? "Done" : "—") + "</span>";
  }

  function docChips(uploads, sessionId, name) {
    uploads = uploads || {};
    var chips = [];
    DOC_CHIP_SPECS.forEach(function (spec) {
      var n = uploads[spec.key] || 0;
      if (!n) return;
      var label = spec.label + (n > 1 ? " \u00d7" + n : "");
      var canOpen = !!deps.gotoDocuments;
      if (canOpen) {
        chips.push(
          '<button type="button" class="ob-chip ob-chip--open" data-ob-doc="' +
            esc(spec.docFilter) +
            '" data-ob-sid="' +
            esc(sessionId || "") +
            '" data-ob-name="' +
            esc(name || "") +
            '" title="Open in Documents">' +
            esc(label) +
            "</button>"
        );
      } else {
        chips.push('<span class="ob-chip">' + esc(label) + "</span>");
      }
    });
    if (!chips.length) return '<span class="ob-pill ob-pill--no">—</span>';
    return '<div class="ob-chips">' + chips.join("") + "</div>";
  }

  function exportActions(a) {
    var sid = esc(a.applicant_session_id || "");
    var jobBtn = a.job
      ? '<button type="button" class="ob-link" data-ob-csv="job" data-ob-sid="' + sid + '">Job CSV</button>'
      : '<button type="button" class="ob-link" disabled>Job CSV</button>';
    var healthBtn = a.health
      ? '<button type="button" class="ob-link" data-ob-csv="health" data-ob-sid="' + sid + '">Health CSV</button>'
      : '<button type="button" class="ob-link" disabled>Health CSV</button>';
    return '<div class="ob-export">' + jobBtn + healthBtn + "</div>";
  }

  function metaText() {
    var uc = state.uploadCounts || {};
    var n = state.applicants.length;
    var txt =
      n + " registered applicant" + (n === 1 ? "" : "s") +
      ". Total in storage: " +
      (uc.passport || 0) + " passport, " +
      (uc.checklist || 0) + " checklist, " +
      (uc.certificate || 0) + " certificate, " +
      (uc.firstaid || 0) + " first aid, " +
      (uc.safeguarding || 0) + " safeguarding.";
    if (state.unlinked) {
      txt += " " + state.unlinked + " file(s) uploaded before session linking — re-upload from staff portal after PIN login.";
    } else {
      txt += " New uploads use each applicant session folder.";
    }
    return txt;
  }

  function rowsHtml() {
    if (state.error) {
      return '<tr><td colspan="7"><div class="ob-notice"><strong>Onboarding storage not linked.</strong> ' + esc(state.error) + "</div></td></tr>";
    }
    if (!state.applicants.length) {
      return '<tr><td colspan="7"><div class="ob-notice"><strong>No applicants yet.</strong> Once an applicant logs in at the staff portal (PIN) and uploads from the onboarding pages, they appear here. Old uploads without a session folder will not attach automatically.</div></td></tr>';
    }
    return state.applicants
      .map(function (a) {
        var name = (a.display_name || a.portal_staff_name || "").trim();
        var sid = String(a.applicant_session_id || "");
        if (!name) name = sid ? "Session " + sid.slice(0, 8) : "Unknown";
        return (
          "<tr><td>" +
          esc(name) +
          '<div class="ob-counts">' + esc(sid ? sid.slice(0, 8) + "…" : "") + "</div></td><td>" +
          pill(!!a.job) +
          "</td><td>" +
          pill(!!a.health) +
          '</td><td class="ob-counts">' +
          docChips(a.uploads, sid, name) +
          '</td><td class="ob-counts">' +
          esc(fmtDate(a.last_online_at)) +
          '</td><td class="ob-counts">' +
          esc(fmtDate(a.last_upload_at)) +
          "</td><td>" +
          exportActions(a) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function render() {
    if (!root) return;
    root.innerHTML =
      '<div class="ob-wrap">' +
      '<div class="ob-toolbar"><button type="button" class="ob-refresh" data-ob-refresh>' +
      (state.loading ? "Refreshing…" : "↻ Refresh") +
      "</button></div>" +
      '<p class="ob-meta" id="obMeta">' +
      (state.loading ? "Loading applicant progress…" : esc(metaText())) +
      "</p>" +
      '<div class="ob-table-wrap"><table class="ob-table"><thead><tr>' +
      "<th>Applicant</th><th>Job application</th><th>Health</th><th>Documents uploaded</th>" +
      "<th>Last online</th><th>Last upload</th><th>Export</th>" +
      "</tr></thead><tbody>" +
      (state.loading ? '<tr><td colspan="7"><div class="ob-notice">Loading…</div></td></tr>' : rowsHtml()) +
      "</tbody></table></div></div>";
    bindRoot();
  }

  function bindRoot() {
    var refresh = root.querySelector("[data-ob-refresh]");
    if (refresh) refresh.addEventListener("click", function () { load(); });
    root.querySelectorAll("[data-ob-csv]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sid = btn.getAttribute("data-ob-sid");
        var kind = btn.getAttribute("data-ob-csv");
        if (!sid || !kind) return;
        downloadCsv(sid, kind, kind === "job" ? "job-application" : "health-questionnaire");
      });
    });
    root.querySelectorAll("[data-ob-doc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!deps.gotoDocuments) return;
        deps.gotoDocuments({
          filter: btn.getAttribute("data-ob-doc") || "all",
          sessionId: btn.getAttribute("data-ob-sid") || "",
          name: btn.getAttribute("data-ob-name") || ""
        });
      });
    });
  }

  async function authToken() {
    var sb = client();
    if (!sb || !sb.auth || typeof sb.auth.getSession !== "function") return "";
    try {
      var res = await sb.auth.getSession();
      return (res && res.data && res.data.session && res.data.session.access_token) || "";
    } catch (e) {
      return "";
    }
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();
    var token = await authToken();
    if (!token) {
      state.loading = false;
      state.error = "Sign in to the admin again to load onboarding applicants.";
      render();
      return;
    }
    try {
      var res = await fetch(supabaseUrl() + "/functions/v1/portal-admin-onboarding-documents-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anonKey()
        },
        body: "{}"
      });
      var body = await res.json().catch(function () { return {}; });
      state.meta = body.meta || {};
      state.applicants = body.applicants || [];
      state.uploadCounts = body.upload_counts || {};
      state.unlinked = body.unlinked_documents || 0;
      if (!res.ok || !body.ok) {
        if (body.error === "onboarding_storage_not_configured") {
          state.error =
            "Set ONBOARDING_SUPABASE_URL and ONBOARDING_SUPABASE_SERVICE_ROLE_KEY on Portal Supabase, then deploy portal-admin-onboarding-documents-list.";
        } else {
          state.error = (body && body.error) || ("Request failed (HTTP " + res.status + ").");
        }
      }
    } catch (err) {
      state.error = (err && err.message) || "Could not reach the onboarding documents function.";
    }
    state.loading = false;
    render();
  }

  async function downloadCsv(sessionId, formType, label) {
    var token = await authToken();
    if (!token) {
      if (deps.toast) deps.toast("Sign in to admin again to export CSV.");
      else alert("Sign in to admin again to export CSV.");
      return;
    }
    try {
      var res = await fetch(supabaseUrl() + "/functions/v1/portal-admin-onboarding-draft-export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anonKey()
        },
        body: JSON.stringify({ applicant_session_id: sessionId, form_type: formType })
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        var msg = (errBody && errBody.error) || ("Could not export " + label + " (not saved yet?).");
        if (deps.toast) deps.toast(msg); else alert(msg);
        return;
      }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = label + "-" + String(sessionId).slice(0, 8) + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (deps.toast) deps.toast(err.message || "Export failed");
      else alert(err.message || "Export failed");
    }
  }

  function configure(opts) {
    opts = opts || {};
    if (opts.getClient) deps.getClient = opts.getClient;
    if (opts.getSupabaseUrl) deps.getSupabaseUrl = opts.getSupabaseUrl;
    if (opts.getAnonKey) deps.getAnonKey = opts.getAnonKey;
    if (opts.esc) deps.esc = opts.esc;
    if (opts.toast) deps.toast = opts.toast;
    if (opts.gotoDocuments) deps.gotoDocuments = opts.gotoDocuments;
  }

  function mount(rootEl) {
    root = rootEl;
    if (!root) return;
    injectStyleOnce();
    state.loading = true;
    render();
    load();
  }

  global.AdminOnboarding = { configure: configure, mount: mount };
})(window);
