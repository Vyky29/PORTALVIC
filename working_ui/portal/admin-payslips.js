/**
 * Admin Payslips — upload monthly payslip PDFs into each worker's My Documents folder.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    toast: function (m) {
      try {
        console.log("[payslips]", m);
      } catch (_) {}
    },
  };

  var state = {
    staff: [],
    uploads: [],
    uploading: false,
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function client() {
    return cfg.getClient();
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalPayslipsStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  function sanitizeFilenamePart(value) {
    return String(value || "")
      .trim()
      .replace(/[^\w\- ]+/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "payslip";
  }

  function monthLabelFromIso(iso) {
    var s = String(iso || "").trim();
    if (!/^\d{4}-\d{2}/.test(s)) return s || "Payslip";
    var d = new Date(s.slice(0, 7) + "-01T12:00:00");
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  async function loadStaffDirectory() {
    var sb = client();
    if (!sb) throw new Error("Supabase client not available.");
    var resp = await sb
      .from("staff_profiles")
      .select("id, full_name, username, app_role")
      .order("full_name", { ascending: true });
    if (resp.error) throw resp.error;
    state.staff = (resp.data || []).filter(function (r) {
      return r && r.id;
    });
  }

  async function loadRecentUploads() {
    var sb = client();
    if (!sb) throw new Error("Supabase client not available.");
    var resp = await sb
      .from("documents")
      .select("id, user_id, title, related_date, created_at, file_url")
      .eq("category", "payslips")
      .order("created_at", { ascending: false })
      .limit(80);
    if (resp.error) throw resp.error;
    state.uploads = resp.data || [];
  }

  function staffNameById(id) {
    var hit = state.staff.find(function (s) {
      return String(s.id) === String(id);
    });
    if (!hit) return "Worker";
    return hit.full_name || hit.username || "Worker";
  }

  function renderStaffOptions() {
    var sel = document.getElementById("portalPayslipsStaff");
    if (!sel) return;
    var prev = sel.value || "";
    sel.innerHTML =
      '<option value="">Select worker…</option>' +
      state.staff
        .map(function (s) {
          var label = s.full_name || s.username || s.id;
          return (
            '<option value="' +
            esc(s.id) +
            '">' +
            esc(label) +
            "</option>"
          );
        })
        .join("");
    if (prev) sel.value = prev;
  }

  function renderUploadsTable() {
    var tbody = document.getElementById("portalPayslipsTbody");
    if (!tbody) return;
    if (!state.uploads.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="muted" style="padding:16px">No payslips uploaded yet.</td></tr>';
      return;
    }
    tbody.innerHTML = state.uploads
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" +
          esc(staffNameById(row.user_id)) +
          "</td>" +
          "<td>" +
          esc(row.title || monthLabelFromIso(row.related_date) + " Payslip") +
          "</td>" +
          "<td style=\"white-space:nowrap\">" +
          esc(formatDateTime(row.created_at)) +
          "</td>" +
          "<td class=\"muted\" style=\"font-size:12px;max-width:220px;overflow-wrap:anywhere\">" +
          esc(row.file_url || "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function refreshAll() {
    setStatus("<strong>Loading…</strong> Staff directory and recent uploads.");
    try {
      await Promise.all([loadStaffDirectory(), loadRecentUploads()]);
      renderStaffOptions();
      renderUploadsTable();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(
        "<strong>Error</strong> " + esc(err.message || String(err)),
        true
      );
    }
  }

  async function handleUpload(ev) {
    ev.preventDefault();
    if (state.uploading) return;
    var staffSel = document.getElementById("portalPayslipsStaff");
    var monthInput = document.getElementById("portalPayslipsMonth");
    var fileInput = document.getElementById("portalPayslipsFile");
    var staffId = staffSel ? String(staffSel.value || "").trim() : "";
    var monthVal = monthInput ? String(monthInput.value || "").trim() : "";
    var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!staffId) {
      setStatus("<strong>Select a worker</strong> before uploading.", true);
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(monthVal)) {
      setStatus("<strong>Choose the payslip month</strong> (YYYY-MM).", true);
      return;
    }
    if (!file) {
      setStatus("<strong>Choose a PDF file</strong> to upload.", true);
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      setStatus("<strong>PDF only</strong> — choose a .pdf payslip file.", true);
      return;
    }

    var sb = client();
    if (!sb) {
      setStatus("<strong>Not signed in</strong> — refresh and try again.", true);
      return;
    }

    var relatedDate = monthVal + "-01";
    var title = monthLabelFromIso(relatedDate) + " Payslip";
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    var filename = stamp + "_" + sanitizeFilenamePart(title) + ".pdf";
    var storagePath = staffId + "/payslips/" + filename;

    state.uploading = true;
    var btn = document.getElementById("portalPayslipsSubmit");
    if (btn) btn.disabled = true;
    setStatus("<strong>Uploading…</strong> " + esc(title) + " for " + esc(staffNameById(staffId)) + ".");

    try {
      var up = await sb.storage.from("documents").upload(storagePath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (up.error) throw up.error;

      var ins = await sb.from("documents").insert([
        {
          user_id: staffId,
          document_type: "payslip",
          category: "payslips",
          title: title,
          related_date: relatedDate,
          file_url: storagePath,
          source_page: "payslips",
        },
      ]);
      if (ins.error) throw ins.error;

      if (fileInput) fileInput.value = "";
      cfg.toast("Payslip uploaded for " + staffNameById(staffId));
      setStatus(
        "<strong>Uploaded.</strong> " +
          esc(title) +
          " is now visible in the worker's <em>My Documents → Payslips</em>."
      );
      await loadRecentUploads();
      renderUploadsTable();
    } catch (err) {
      console.error(err);
      setStatus(
        "<strong>Upload failed</strong> " + esc(err.message || String(err)),
        true
      );
    } finally {
      state.uploading = false;
      if (btn) btn.disabled = false;
    }
  }

  function bindModule() {
    var root = document.getElementById("portalPayslipsRoot");
    if (!root || root.getAttribute("data-portal-payslips-bound") === "1") return;
    root.setAttribute("data-portal-payslips-bound", "1");

    var form = document.getElementById("portalPayslipsForm");
    if (form) form.addEventListener("submit", function (ev) {
      void handleUpload(ev);
    });

    var refreshBtn = document.getElementById("portalPayslipsRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refreshAll();
      });
    }

    var monthInput = document.getElementById("portalPayslipsMonth");
    if (monthInput && !monthInput.value) {
      var now = new Date();
      monthInput.value =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0");
    }

    void refreshAll();
  }

  function viewHtml() {
    return (
      '<div id="portalPayslipsRoot" class="portal-payslips-embed portal-day-ops-embed" data-portal-payslips-bound="0">' +
      "<style>" +
      "#portalPayslipsRoot .portal-payslips-card{background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:16px 18px;margin:0 0 16px;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end;min-width:0}" +
      "#portalPayslipsRoot label{display:block;font-size:12px;font-weight:700;color:var(--muted,#64748b);margin:0 0 6px;text-transform:uppercase;letter-spacing:.03em}" +
      "#portalPayslipsRoot select,#portalPayslipsRoot input[type=month],#portalPayslipsRoot input[type=file]{width:100%;min-width:0;font:inherit;padding:9px 11px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff}" +
      "#portalPayslipsRoot .portal-payslips-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}" +
      "</style>" +
      '<h1 class="page-title">Payslips</h1>' +
      '<p class="page-intro">Upload monthly payslip PDFs for each worker. Files go to their personal folder and appear in <strong>My Documents → Payslips</strong> on the staff app.</p>' +
      '<div id="portalPayslipsStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-payslips-card">' +
      '<h2 style="margin:0 0 12px;font-size:16px;color:var(--ink,#0f172a)">Upload payslip</h2>' +
      '<form id="portalPayslipsForm">' +
      '<div class="portal-payslips-grid">' +
      "<div><label for=\"portalPayslipsStaff\">Worker</label><select id=\"portalPayslipsStaff\" required></select></div>" +
      "<div><label for=\"portalPayslipsMonth\">Payslip month</label><input type=\"month\" id=\"portalPayslipsMonth\" required /></div>" +
      "<div><label for=\"portalPayslipsFile\">PDF file</label><input type=\"file\" id=\"portalPayslipsFile\" accept=\"application/pdf,.pdf\" required /></div>" +
      "</div>" +
      '<div class="portal-payslips-actions">' +
      '<button type="submit" class="btn btn--pri" id="portalPayslipsSubmit">Upload payslip</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalPayslipsRefresh">Refresh list</button>' +
      "</div>" +
      "</form></div>" +
      '<div class="portal-forms-table-wrap">' +
      '<table class="portal-forms-table portal-forms-table--full-detail">' +
      "<thead><tr><th>Worker</th><th>Title</th><th>Uploaded</th><th>Storage path</th></tr></thead>" +
      '<tbody id="portalPayslipsTbody"><tr><td colspan="4" class="muted" style="padding:16px">Loading…</td></tr></tbody>' +
      "</table></div></div>"
    );
  }

  global.PortalPayslips = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refreshAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
