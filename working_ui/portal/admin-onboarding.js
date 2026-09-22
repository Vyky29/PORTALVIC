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
  // pathKey = uploads / upload_paths key used for counts and preferred open path.
  var DOC_CHIP_SPECS = [
    { key: "passport", label: "Passport / ID", docFilter: "passport" },
    { key: "checklist", label: "Checklist", docFilter: "checklist" },
    { key: "certificate", label: "Certificate", docFilter: "certificate" },
    { key: "firstaid", label: "First aid", docFilter: "firstaid" },
    { key: "safeguarding", label: "Safeguarding", docFilter: "safeguarding" }
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
    var old = document.getElementById("adminOnboardingStyle");
    if (old && old.getAttribute("data-ob-pin-table") === "1") return;
    if (old) old.remove();
    var css =
      ".ob-wrap .ob-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}" +
      ".ob-wrap .ob-refresh{font-size:12px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:6px 12px;cursor:pointer}" +
      ".ob-wrap .ob-refresh:hover{background:#e0e7ff}" +
      ".ob-wrap .ob-meta{margin:0 0 14px;font-size:13px;color:#64748b;line-height:1.45}" +
      ".ob-wrap .ob-table-wrap{overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff}" +
      ".ob-wrap table.ob-table{width:100%;border-collapse:collapse;font-size:13px}" +
      ".ob-wrap table.ob-table th,.ob-wrap table.ob-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;vertical-align:middle;min-width:0}" +
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
      ".ob-pin{min-width:132px;max-width:200px}" +
      ".ob-pin-missing{margin:0 0 4px;font-size:11px;color:#9a3412;line-height:1.35;overflow-wrap:break-word}" +
      ".ob-pin-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:.06em}" +
      ".ob-pin-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
      ".ob-pin-issue{font-size:11px;font-weight:700;color:#fff;background:#0f2747;border:1px solid #0f2747;border-radius:8px;padding:4px 10px;cursor:pointer}" +
      ".ob-pin-issue:hover{background:#16345c}" +
      ".ob-pin-issue:disabled{opacity:.45;cursor:not-allowed}" +
      ".ob-pin-copy{font-size:11px;font-weight:700;color:#0f2747;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:4px 10px;cursor:pointer}" +
      ".ob-pill--draft{background:#fef3c7;color:#92400e}" +
      ".ob-photo-cell{display:flex;align-items:center;gap:8px;min-width:0}" +
      ".ob-photo-thumb{width:28px;height:28px;border-radius:999px;object-fit:cover;flex:0 0 auto;background:#e2e8f0}" +
      ".ob-modal{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".ob-modal-card{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:18px 18px 16px;box-shadow:0 18px 50px rgba(15,23,42,.25);min-width:0}" +
      ".ob-modal-card h3{margin:0 0 8px;font-size:16px;color:#0f2747}" +
      ".ob-modal-card p{margin:0 0 10px;font-size:13px;color:#334155;line-height:1.45;overflow-wrap:break-word}" +
      ".ob-modal-card pre{margin:0 0 12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}" +
      ".ob-notice{padding:16px;font-size:13px;color:#475569;line-height:1.5}";
    var st = document.createElement("style");
    st.id = "adminOnboardingStyle";
    st.setAttribute("data-ob-pin-table", "1");
    st.textContent = css;
    document.head.appendChild(st);
  }

  function pill(done, draft) {
    if (done) return '<span class="ob-pill ob-pill--yes">Done</span>';
    if (draft) return '<span class="ob-pill ob-pill--draft">Draft</span>';
    return '<span class="ob-pill ob-pill--no">—</span>';
  }

  function docChips(uploads, sessionId, name, uploadPaths) {
    uploads = uploads || {};
    uploadPaths = uploadPaths || {};
    var chips = [];
    DOC_CHIP_SPECS.forEach(function (spec) {
      var n = uploads[spec.key] || 0;
      if (!n) return;
      var label = spec.label + (n > 1 ? " \u00d7" + n : "");
      var paths = uploadPaths[spec.key] || [];
      var preferredPath = paths.length ? String(paths[0] || "") : "";
      var canOpen = !!deps.gotoDocuments;
      if (canOpen) {
        chips.push(
          '<button type="button" class="ob-chip ob-chip--open" data-ob-doc="' +
            esc(spec.docFilter) +
            '" data-ob-sid="' +
            esc(sessionId || "") +
            '" data-ob-name="' +
            esc(name || "") +
            '" data-ob-path="' +
            esc(preferredPath) +
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

  function photoCell(a) {
    var url = String((a && (a.photo_url || a.photoUrl)) || "").trim();
    if (url) {
      if (typeof window.portalRememberStaffLiveAvatar === "function") {
        window.portalRememberStaffLiveAvatar(a.login_username || a.display_name, url);
      }
      return (
        '<span class="ob-photo-cell">' +
        '<img class="ob-photo-thumb" src="' +
        esc(url) +
        '" alt="" loading="lazy" decoding="async" onerror="this.remove()" />' +
        pill(true, false) +
        "</span>"
      );
    }
    return pill(!!(a && a.photo), false);
  }

  function pinCell(a) {
    var sid = esc(a.applicant_session_id || "");
    if (a.pin_issued && a.pin) {
      return (
        '<div class="ob-pin"><div class="ob-pin-code">' +
        esc(a.pin) +
        '</div><div class="ob-pin-actions"><button type="button" class="ob-pin-copy" data-ob-copy-pin="' +
        esc(a.pin) +
        '">Copy PIN</button></div></div>'
      );
    }
    var missing = Array.isArray(a.missing) ? a.missing : [];
    var missingHtml = missing.length
      ? '<p class="ob-pin-missing">' + esc(missing.join(". ")) + ".</p>"
      : "";
    if (a.ready_for_pin) {
      return (
        '<div class="ob-pin">' +
        missingHtml +
        '<div class="ob-pin-actions"><button type="button" class="ob-pin-issue" data-ob-issue-pin="' +
        sid +
        '">Issue PIN</button></div></div>'
      );
    }
    return (
      '<div class="ob-pin">' +
      missingHtml +
      '<div class="ob-pin-actions"><button type="button" class="ob-pin-issue" disabled title="' +
      esc(missing.join(". ") || "Hub not complete") +
      '">Issue PIN</button></div></div>'
    );
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
      txt += " Validate Job, Health, photo, passport and starter checklist, then issue a PIN.";
    }
    return txt;
  }

  function rowsHtml() {
    if (state.error) {
      return '<tr><td colspan="8"><div class="ob-notice"><strong>Onboarding storage not linked.</strong> ' + esc(state.error) + "</div></td></tr>";
    }
    if (!state.applicants.length) {
      return '<tr><td colspan="8"><div class="ob-notice"><strong>No applicants yet.</strong> After an invite they appear here as they use the onboarding hub. Admin validates Job, Health, photo and documents, then issues a PIN.</div></td></tr>';
    }
    return state.applicants
      .map(function (a) {
        var name = (a.display_name || a.portal_staff_name || "").trim();
        var sid = String(a.applicant_session_id || "");
        if (!name) name = sid ? "Session " + sid.slice(0, 8) : "Unknown";
        return (
          "<tr><td>" +
          esc(name) +
          "</td><td>" +
          pinCell(a) +
          "</td><td>" +
          pill(!!a.job_submitted, !!a.job) +
          "</td><td>" +
          pill(!!a.health_submitted, !!a.health) +
          "</td><td>" +
          photoCell(a) +
          '</td><td class="ob-counts">' +
          docChips(a.uploads, sid, name, a.upload_paths) +
          '</td><td class="ob-counts">' +
          esc(fmtDate(a.last_online_at)) +
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
      "<th>Applicant</th><th>PIN</th><th>Job application</th><th>Health</th><th>Photo</th><th>Documents uploaded</th>" +
      "<th>Last online</th><th>Export</th>" +
      "</tr></thead><tbody>" +
      (state.loading ? '<tr><td colspan="8"><div class="ob-notice">Loading…</div></td></tr>' : rowsHtml()) +
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
          name: btn.getAttribute("data-ob-name") || "",
          path: btn.getAttribute("data-ob-path") || ""
        });
      });
    });
    root.querySelectorAll("[data-ob-issue-pin]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        issuePin(btn.getAttribute("data-ob-issue-pin") || "", btn);
      });
    });
    root.querySelectorAll("[data-ob-copy-pin]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-ob-copy-pin") || "", "PIN copied.");
      });
    });
  }

  function copyText(text, okMsg) {
    var value = String(text || "");
    if (!value) return;
    function done() {
      if (deps.toast) deps.toast(okMsg || "Copied.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {
        window.prompt("Copy", value);
      });
      return;
    }
    window.prompt("Copy", value);
  }

  function showPinIssued(body) {
    var existing = document.getElementById("obPinIssuedModal");
    if (existing) existing.remove();
    var details =
      "Staff app: " + (body.login_url || "https://clubsensational-staff.vercel.app/login.html") + "\n" +
      "Name: " + (body.name || "") + "\n" +
      "Email: " + (body.email || "") + "\n" +
      "PIN: " + (body.pin || "");
    var mailNote = body.email_ok
      ? "We also emailed them this PIN."
      : "Email did not send. Give them the PIN from here.";
    var waNote = body.whatsapp_ok
      ? " WhatsApp API also told them the account is open and that Comms is the communication channel."
      : body.whatsapp_error === "missing_staff_phone"
        ? " WhatsApp did not send (no mobile on the job application)."
        : body.whatsapp_error
          ? " WhatsApp did not send. They still have email if that went through."
          : "";
    var modal = document.createElement("div");
    modal.id = "obPinIssuedModal";
    modal.className = "ob-modal";
    modal.innerHTML =
      '<div class="ob-modal-card" role="dialog" aria-labelledby="obPinIssuedTitle">' +
      '<h3 id="obPinIssuedTitle">PIN issued</h3>' +
      "<p>" +
      esc(body.full_name || body.name || "This hire") +
      " can now sign in on the staff app with their first name (or email) and this PIN.</p>" +
      "<pre>" +
      esc(details) +
      "</pre>" +
      "<p>" +
      esc(mailNote + waNote) +
      "</p>" +
      '<div class="ob-pin-actions">' +
      '<button type="button" class="ob-pin-copy" data-ob-modal-copy>Copy details</button>' +
      '<button type="button" class="ob-refresh" data-ob-modal-close>Close</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    modal.querySelector("[data-ob-modal-copy]").addEventListener("click", function () {
      copyText(details, "PIN details copied.");
    });
    function close() {
      modal.remove();
    }
    modal.querySelector("[data-ob-modal-close]").addEventListener("click", close);
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) close();
    });
  }

  async function issuePin(sessionId, btn) {
    var sid = String(sessionId || "").trim();
    if (!sid) return;
    var row = (state.applicants || []).filter(function (a) {
      return String(a.applicant_session_id || "") === sid;
    })[0];
    var name = row ? (row.display_name || row.portal_staff_name || "this hire") : "this hire";
    var ok = window.confirm(
      "Validate onboarding for " +
        name +
        " and issue a staff PIN?\n\n" +
        "Check Job, Health, photo and documents first. This replaces their temporary invite password."
    );
    if (!ok) return;
    var token = await authToken();
    if (!token) {
      if (deps.toast) deps.toast("Sign in to admin again to issue a PIN.");
      else alert("Sign in to admin again to issue a PIN.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Issuing…";
    }
    try {
      var res = await fetch(supabaseUrl() + "/functions/v1/portal-admin-onboarding-issue-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anonKey()
        },
        body: JSON.stringify({ applicant_session_id: sid })
      });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok || !body.ok) {
        var missing = Array.isArray(body.missing) ? body.missing.join(". ") : "";
        var msg = missing
          ? "Not complete yet: " + missing + "."
          : (body.error || "Could not issue PIN.");
        if (deps.toast) deps.toast(msg);
        else alert(msg);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Issue PIN";
        }
        return;
      }
      showPinIssued(body);
      await load();
    } catch (err) {
      var fail = (err && err.message) || "Could not issue PIN.";
      if (deps.toast) deps.toast(fail);
      else alert(fail);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Issue PIN";
      }
    }
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
