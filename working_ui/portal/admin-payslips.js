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
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
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
    filter: "all",
    search: "",
    previewIdx: -1,
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function client() {
    return cfg.getClient();
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function portalAuthToken() {
    var sb = client();
    if (!sb || !sb.auth) return null;
    var sessResp = await sb.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  async function edgePost(path, body) {
    var token = await portalAuthToken();
    if (!token) return { error: "session_expired" };
    var res = await fetch(supabaseBase() + "/functions/v1/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: body == null ? "{}" : JSON.stringify(body),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && (j.error || j.message)) || res.statusText || "request_failed" };
    }
    return { data: j };
  }

  async function getSignedUrl(path) {
    var body = await edgePost("portal-admin-hr-file-signed-url", {
      path: path,
      bucket: "documents",
      source: "portal",
    });
    if (body.error || !body.data || !body.data.signed_url) return null;
    return body.data.signed_url;
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

  function monthKeyFromRow(row) {
    var rd = String((row && row.related_date) || "").trim();
    if (/^\d{4}-\d{2}/.test(rd)) return rd.slice(0, 7);
    var ca = row && row.created_at ? String(row.created_at) : "";
    if (/^\d{4}-\d{2}/.test(ca)) return ca.slice(0, 7);
    return "";
  }

  function monthLabelFromIso(iso) {
    var s = String(iso || "").trim();
    if (!/^\d{4}-\d{2}/.test(s)) return s || "Payslip";
    var d = new Date(s.slice(0, 7) + "-01T12:00:00");
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  function monthNameOnlyFromIso(iso) {
    var s = String(iso || "").trim();
    if (!/^\d{4}-\d{2}/.test(s)) return s || "Payslip";
    var d = new Date(s.slice(0, 7) + "-01T12:00:00");
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-GB", { month: "long" });
  }

  function monthPillLabel(row) {
    var key = monthKeyFromRow(row);
    if (!key) return "—";
    return monthNameOnlyFromIso(key + "-01").toUpperCase();
  }

  function staffFirstNameById(id) {
    var hit = state.staff.find(function (s) {
      return String(s.id) === String(id);
    });
    if (!hit) return "Worker";
    var name = String(hit.full_name || hit.username || "Worker").trim();
    var parts = name.split(/\s+/);
    return parts[0] || name;
  }

  function buildPayslipTitle(staffId, monthVal, existingSameMonthCount) {
    var first = staffFirstNameById(staffId);
    var month = monthNameOnlyFromIso(monthVal + "-01");
    var seq = Number(existingSameMonthCount || 0) + 1;
    if (seq > 1) {
      return first + "'s Payslip (" + month + " " + seq + ")";
    }
    return first + "'s Payslip (" + month + ")";
  }

  function countExistingPayslipsForMonth(staffId, monthVal) {
    return state.uploads.filter(function (row) {
      if (!row || String(row.user_id) !== String(staffId)) return false;
      return monthKeyFromRow(row) === monthVal;
    }).length;
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        weekday: "short",
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
      .select("id, full_name, username, app_role, is_active")
      .order("full_name", { ascending: true });
    if (resp.error) throw resp.error;
    state.staff = (resp.data || []).filter(function (r) {
      return r && r.id && r.is_active !== false;
    });
  }

  async function loadRecentUploads() {
    var sb = client();
    if (!sb) throw new Error("Supabase client not available.");
    var resp = await sb
      .from("documents")
      .select("id, user_id, title, related_date, created_at, file_url, document_type")
      .eq("category", "payslips")
      .order("related_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(400);
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

  function uniqueMonthFilters() {
    var seen = Object.create(null);
    var keys = [];
    state.uploads.forEach(function (row) {
      var k = monthKeyFromRow(row);
      if (!k || seen[k]) return;
      seen[k] = true;
      keys.push(k);
    });
    keys.sort(function (a, b) {
      return b.localeCompare(a);
    });
    return keys;
  }

  function countByMonth(monthKey) {
    return state.uploads.filter(function (row) {
      return monthKeyFromRow(row) === monthKey;
    }).length;
  }

  function filteredUploads() {
    var q = String(state.search || "")
      .trim()
      .toLowerCase();
    return state.uploads
      .filter(function (row) {
        if (state.filter !== "all" && monthKeyFromRow(row) !== state.filter) return false;
        if (!q) return true;
        var hay =
          (row.title || "") +
          " " +
          staffNameById(row.user_id) +
          " " +
          monthLabelFromIso(monthKeyFromRow(row) + "-01") +
          " " +
          (row.file_url || "");
        return hay.toLowerCase().indexOf(q) >= 0;
      })
      .sort(function (a, b) {
        var ma = monthKeyFromRow(a);
        var mb = monthKeyFromRow(b);
        if (ma !== mb) return mb.localeCompare(ma);
        var ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        var tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
  }

  function renderMonthFilters() {
    var host = document.getElementById("portalPayslipsMonthFilters");
    if (!host) return;
    var months = uniqueMonthFilters();
    var html =
      '<button type="button" class="portal-payslips-statcard' +
      (state.filter === "all" ? " is-active" : "") +
      '" data-payslip-month="all">' +
      '<span class="portal-payslips-statcard-num">' +
      esc(String(state.uploads.length)) +
      "</span>" +
      '<span class="portal-payslips-statcard-label">All payroll docs</span></button>';
    months.forEach(function (mk) {
      html +=
        '<button type="button" class="portal-payslips-statcard' +
        (state.filter === mk ? " is-active" : "") +
        '" data-payslip-month="' +
        esc(mk) +
        '">' +
        '<span class="portal-payslips-statcard-num">' +
        esc(String(countByMonth(mk))) +
        "</span>" +
        '<span class="portal-payslips-statcard-label">' +
        esc(monthLabelFromIso(mk + "-01")) +
        "</span></button>";
    });
    host.innerHTML = html;
    host.querySelectorAll("[data-payslip-month]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-payslip-month") || "all";
        state.filter = state.filter === key && key !== "all" ? "all" : key;
        closePreview();
        renderMonthFilters();
        renderUploadsTable();
      });
    });
  }

  function renderStaffOptions() {
    var hid = document.getElementById("portalPayslipsStaff");
    var inp = document.getElementById("portalPayslipsStaffInput");
    var sug = document.getElementById("portalPayslipsStaffSuggest");
    if (!hid) return;
    var prev = String(hid.value || "").trim();
    if (prev && inp) {
      inp.value = staffNameById(prev);
    } else if (inp && !prev) {
      inp.value = "";
    }
    if (sug) {
      sug.hidden = true;
      sug.replaceChildren();
    }
  }

  function payslipsStaffMatches(query) {
    var qt = String(query || "").trim().toLowerCase();
    if (!qt) {
      return state.staff.slice(0, 24);
    }
    var out = [];
    for (var i = 0; i < state.staff.length; i++) {
      var s = state.staff[i];
      var label = String(s.full_name || s.username || s.id || "").trim();
      var blob = (label + " " + String(s.username || "") + " " + String(s.app_role || "")).toLowerCase();
      if (blob.indexOf(qt) !== -1) out.push(s);
      if (out.length >= 24) break;
    }
    return out;
  }

  function renderStaffSuggest(query) {
    var sug = document.getElementById("portalPayslipsStaffSuggest");
    var inp = document.getElementById("portalPayslipsStaffInput");
    var hid = document.getElementById("portalPayslipsStaff");
    if (!sug) return;
    sug.replaceChildren();
    var matches = payslipsStaffMatches(query);
    if (!matches.length) {
      sug.hidden = true;
      return;
    }
    matches.forEach(function (s) {
      var label = s.full_name || s.username || s.id;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-payslips-suggest__btn";
      btn.textContent = label;
      btn.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        if (hid) hid.value = String(s.id || "");
        if (inp) inp.value = String(label || "");
        sug.hidden = true;
        sug.replaceChildren();
      });
      sug.appendChild(btn);
    });
    sug.hidden = false;
  }

  function bindStaffCombo() {
    var inp = document.getElementById("portalPayslipsStaffInput");
    var hid = document.getElementById("portalPayslipsStaff");
    var sug = document.getElementById("portalPayslipsStaffSuggest");
    if (!inp || inp.getAttribute("data-payslips-staff-bound") === "1") return;
    inp.setAttribute("data-payslips-staff-bound", "1");

    inp.addEventListener("input", function () {
      if (hid) hid.value = "";
      renderStaffSuggest(inp.value);
    });
    inp.addEventListener("focus", function () {
      renderStaffSuggest(inp.value);
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && sug) {
        sug.hidden = true;
        sug.replaceChildren();
        return;
      }
      if (ev.key !== "Enter") return;
      var first = sug && !sug.hidden ? sug.querySelector(".portal-payslips-suggest__btn") : null;
      if (first) {
        ev.preventDefault();
        first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    });
    inp.addEventListener("blur", function () {
      setTimeout(function () {
        if (sug) {
          sug.hidden = true;
          sug.replaceChildren();
        }
      }, 160);
    });
    document.addEventListener(
      "click",
      function (ev) {
        if (!sug || sug.hidden) return;
        var wrap = document.getElementById("portalPayslipsStaffCombo");
        if (wrap && ev.target && wrap.contains(ev.target)) return;
        sug.hidden = true;
        sug.replaceChildren();
      },
      true
    );
  }

  async function openPreview(idx) {
    var rows = global._portalPayslipsCurrent || [];
    var row = rows[idx];
    if (!row || !row.file_url) return;
    state.previewIdx = idx;
    var panel = document.getElementById("portalPayslipsPreview");
    var frame = document.getElementById("portalPayslipsPreviewFrame");
    var title = document.getElementById("portalPayslipsPreviewTitle");
    var root = document.getElementById("portalPayslipsRoot");
    if (root) root.classList.add("portal-payslips--has-preview");
    if (panel) panel.hidden = false;
    if (title) {
      title.textContent =
        row.title || monthLabelFromIso(monthKeyFromRow(row) + "-01") + " Payslip";
    }
    if (frame) frame.removeAttribute("src");
    setStatus("<strong>Opening…</strong> Generating a secure link.");
    var url = await getSignedUrl(row.file_url);
    setStatus("");
    if (!url) {
      try {
        window.alert("Could not open payslip. Sign in again or check admin access.");
      } catch (_e) {}
      return;
    }
    if (frame) frame.src = url;
    var openBtn = document.getElementById("portalPayslipsPreviewOpen");
    if (openBtn) {
      openBtn.onclick = function () {
        window.open(url, "_blank", "noopener,noreferrer");
      };
    }
    var dlBtn = document.getElementById("portalPayslipsPreviewDownload");
    if (dlBtn) {
      dlBtn.onclick = function () {
        var a = document.createElement("a");
        a.href = url;
        a.download = (row.title || "payslip") + ".pdf";
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    }
  }

  function closePreview() {
    state.previewIdx = -1;
    var panel = document.getElementById("portalPayslipsPreview");
    var frame = document.getElementById("portalPayslipsPreviewFrame");
    var root = document.getElementById("portalPayslipsRoot");
    if (frame) frame.removeAttribute("src");
    if (panel) panel.hidden = true;
    if (root) root.classList.remove("portal-payslips--has-preview");
  }

  async function deletePayslip(row) {
    if (!row || !row.id) throw new Error("Missing document id.");
    var res = await edgePost("portal-admin-document-delete", { document_id: row.id });
    if (res.error) throw new Error(res.error);
    return res.data;
  }

  function docKindLabel(row) {
    var dt = String((row && row.document_type) || "").toLowerCase();
    if (dt === "contractor_invoice") return "Invoice";
    return "Payslip";
  }

  function renderUploadsTable() {
    var tbody = document.getElementById("portalPayslipsTbody");
    if (!tbody) return;
    var items = filteredUploads();
    global._portalPayslipsCurrent = items;
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="muted" style="padding:16px">No payslips match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (row, idx) {
        var title = row.title || monthLabelFromIso(monthKeyFromRow(row) + "-01") + " Payslip";
        var worker = staffNameById(row.user_id);
        var path = String(row.file_url || "");
        var kind = docKindLabel(row);
        return (
          '<tr class="portal-payslips-data-row" data-payslip-idx="' +
          idx +
          '">' +
          '<td><span class="portal-payslips-month-pill">' +
          esc(monthPillLabel(row)) +
          "</span></td>" +
          '<td><div class="portal-forms-cell-main">' +
          esc(title) +
          '</div><div class="portal-forms-cell-sub">' +
          esc(worker) +
          (path ? " · " + esc(path) : "") +
          "</div></td>" +
          '<td style="white-space:nowrap">' +
          esc(formatDateTime(row.created_at)) +
          "</td>" +
          '<td style="white-space:nowrap">' +
          esc(kind) +
          "</td>" +
          '<td style="white-space:nowrap">' +
          '<button type="button" class="portal-forms-view-btn" data-payslip-view="' +
          idx +
          '">View</button>' +
          ' <button type="button" class="portal-forms-view-btn portal-payslips-delete-btn" data-payslip-delete="' +
          idx +
          '">Delete</button>' +
          "</td></tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-payslip-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        void openPreview(Number(btn.getAttribute("data-payslip-view")));
      });
    });
    tbody.querySelectorAll(".portal-payslips-data-row").forEach(function (tr) {
      tr.addEventListener("dblclick", function () {
        var idx = Number(tr.getAttribute("data-payslip-idx"));
        if (!Number.isNaN(idx)) void openPreview(idx);
      });
    });
    tbody.querySelectorAll("[data-payslip-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-payslip-delete"));
        var row = items[idx];
        if (!row) return;
        var ok = false;
        try {
          ok = window.confirm(
            "Delete this payslip?\n\n" +
              (row.title || "Payslip") +
              "\n" +
              staffNameById(row.user_id) +
              "\n\nThis permanently removes the file from the worker's My Documents."
          );
        } catch (_e) {
          ok = true;
        }
        if (!ok) return;
        btn.disabled = true;
        setStatus("<strong>Deleting…</strong> Removing payslip.");
        void deletePayslip(row)
          .then(function () {
            closePreview();
            setStatus("<strong>Deleted.</strong> Payslip removed.");
            return loadRecentUploads();
          })
          .then(function () {
            renderMonthFilters();
            renderUploadsTable();
          })
          .catch(function (err) {
            console.error(err);
            setStatus("<strong>Error</strong> " + esc(err.message || String(err)), true);
            btn.disabled = false;
          });
      });
    });
  }

  async function waitForClient(maxWaitMs) {
    maxWaitMs = maxWaitMs || 15000;
    var sb = client();
    if (sb) return sb;
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(found) {
        if (settled) return;
        settled = true;
        clearInterval(pollId);
        clearTimeout(timeoutId);
        window.removeEventListener("portal:supabase-ready", onReady);
        if (found) resolve(found);
        else reject(new Error("Supabase client not available."));
      }
      function onReady() {
        done(client());
      }
      window.addEventListener("portal:supabase-ready", onReady);
      var pollId = setInterval(function () {
        var live = client();
        if (live) done(live);
      }, 50);
      var timeoutId = setTimeout(function () {
        done(client());
      }, maxWaitMs);
    });
  }

  async function refreshAll() {
    setStatus("<strong>Loading…</strong> Staff directory and payslips.");
    try {
      await waitForClient();
      await Promise.all([loadStaffDirectory(), loadRecentUploads()]);
      renderStaffOptions();
      renderMonthFilters();
      renderUploadsTable();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("<strong>Error</strong> " + esc(err.message || String(err)), true);
    }
  }

  async function handleUpload(ev) {
    ev.preventDefault();
    if (state.uploading) return;
    var staffSel = document.getElementById("portalPayslipsStaff");
    var staffInput = document.getElementById("portalPayslipsStaffInput");
    var monthInput = document.getElementById("portalPayslipsMonth");
    var fileInput = document.getElementById("portalPayslipsFile");
    var staffId = staffSel ? String(staffSel.value || "").trim() : "";
    if (!staffId && staffInput) {
      var typed = String(staffInput.value || "").trim().toLowerCase();
      if (typed) {
        var hit = state.staff.find(function (s) {
          var label = String(s.full_name || s.username || "").trim().toLowerCase();
          return label === typed;
        });
        if (hit) staffId = String(hit.id || "").trim();
      }
    }
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
      try {
        sb = await waitForClient();
      } catch (_) {
        sb = null;
      }
    }
    if (!sb) {
      setStatus("<strong>Not signed in</strong> — refresh and try again.", true);
      return;
    }

    var relatedDate = monthVal + "-01";
    var sameMonthCount = countExistingPayslipsForMonth(staffId, monthVal);
    var title = buildPayslipTitle(staffId, monthVal, sameMonthCount);
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
      state.filter = monthVal;
      renderMonthFilters();
      renderUploadsTable();
    } catch (err) {
      console.error(err);
      setStatus("<strong>Upload failed</strong> " + esc(err.message || String(err)), true);
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
    if (form)
      form.addEventListener("submit", function (ev) {
        void handleUpload(ev);
      });

    var refreshBtn = document.getElementById("portalPayslipsRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refreshAll();
      });
    }

    var search = document.getElementById("portalPayslipsSearch");
    if (search) {
      search.addEventListener("input", function () {
        state.search = search.value || "";
        closePreview();
        renderUploadsTable();
      });
    }

    var closeBtn = document.getElementById("portalPayslipsPreviewClose");
    if (closeBtn) closeBtn.addEventListener("click", closePreview);

    var monthInput = document.getElementById("portalPayslipsMonth");
    if (monthInput && !monthInput.value) {
      var now = new Date();
      monthInput.value =
        now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    }

    void refreshAll();
    bindStaffCombo();
  }

  function styleHtml() {
    return (
      "<style>" +
      "#portalPayslipsRoot .portal-payslips-card{background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:16px 18px;margin:0 0 16px;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end;min-width:0}" +
      "#portalPayslipsRoot label{display:block;font-size:12px;font-weight:700;color:var(--muted,#64748b);margin:0 0 6px;text-transform:uppercase;letter-spacing:.03em}" +
      "#portalPayslipsRoot input[type=month],#portalPayslipsRoot input[type=file],#portalPayslipsRoot .portal-payslips-staff-combo .inp{width:100%;min-width:0;font:inherit;padding:9px 11px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff;color:var(--ink,#0f172a)}" +
      "#portalPayslipsRoot .portal-payslips-staff-combo{position:relative;min-width:0;max-width:100%}" +
      "#portalPayslipsRoot .portal-payslips-suggest{margin-top:6px;border:1px solid var(--line,#e5e7eb);border-radius:10px;max-height:min(240px,42vh);overflow:auto;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.08);-webkit-overflow-scrolling:touch}" +
      "#portalPayslipsRoot .portal-payslips-suggest[hidden]{display:none!important}" +
      "#portalPayslipsRoot .portal-payslips-suggest__btn{display:block;width:100%;max-width:100%;min-width:0;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--line,#e5e7eb);background:#fff;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--ink,#0f172a);overflow-wrap:break-word}" +
      "#portalPayslipsRoot .portal-payslips-suggest__btn:last-child{border-bottom:0}" +
      "#portalPayslipsRoot .portal-payslips-suggest__btn:hover,#portalPayslipsRoot .portal-payslips-suggest__btn:focus-visible{background:#f0f7ff;outline:none}" +
      "#portalPayslipsRoot .portal-payslips-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}" +
      "#portalPayslipsRoot .portal-payslips-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 12px;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-statrow{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-statcard{flex:1 1 120px;min-width:110px;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;cursor:pointer;text-align:left;transition:border-color .12s,box-shadow .12s;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-statcard:hover{border-color:var(--brand,#2563eb)}" +
      "#portalPayslipsRoot .portal-payslips-statcard.is-active{border-color:var(--brand,#2563eb);box-shadow:0 0 0 2px rgba(37,99,235,.18)}" +
      "#portalPayslipsRoot .portal-payslips-statcard-num{font-size:22px;font-weight:800;color:var(--ink,#0f172a);line-height:1.1}" +
      "#portalPayslipsRoot .portal-payslips-statcard-label{font-size:12px;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.03em;overflow-wrap:break-word}" +
      "#portalPayslipsRoot .portal-payslips-main{display:flex;gap:16px;align-items:flex-start;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-listcol{flex:1 1 auto;min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-preview{flex:0 0 420px;max-width:46%;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:var(--card,#fff);overflow:hidden;display:flex;flex-direction:column;min-height:440px}" +
      "#portalPayslipsRoot.portal-payslips--has-preview .portal-payslips-listcol{flex:1 1 0}" +
      "#portalPayslipsRoot .portal-payslips-preview-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);min-width:0}" +
      "#portalPayslipsRoot .portal-payslips-preview-title{flex:1;min-width:0;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#portalPayslipsRoot .portal-payslips-preview-frame{flex:1;width:100%;border:0;min-height:380px;background:#f8fafc}" +
      "#portalPayslipsRoot .portal-payslips-preview-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line,#e5e7eb)}" +
      "#portalPayslipsRoot .portal-payslips-month-pill{display:inline-block;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#fff7ed;color:#c2410c;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}" +
      "#portalPayslipsRoot .portal-payslips-data-row:hover td{background:#f8fafc!important;cursor:pointer}" +
      "#portalPayslipsRoot .portal-payslips-delete-btn{background:#fff;color:#b91c1c;border:1px solid #fca5a5}" +
      "#portalPayslipsRoot .portal-payslips-delete-btn:hover{background:#fef2f2;border-color:#ef4444}" +
      "@media(max-width:860px){#portalPayslipsRoot .portal-payslips-main{flex-direction:column}#portalPayslipsRoot .portal-payslips-preview{flex:1 1 auto;max-width:none;width:100%}}" +
      "</style>"
    );
  }

  function viewHtml() {
    return (
      '<div id="portalPayslipsRoot" class="portal-payslips-embed portal-day-ops-embed" data-portal-payslips-bound="0">' +
      styleHtml() +
      '<h1 class="page-title">Payslips</h1>' +
      '<p class="page-intro">Upload monthly payslip PDFs for each worker. Files go to their personal folder and appear in <strong>My Documents → Payslips</strong> on the staff app. Browse by month below — click <strong>View</strong> to preview the PDF.</p>' +
      '<div id="portalPayslipsStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-payslips-card">' +
      '<h2 style="margin:0 0 12px;font-size:16px;color:var(--ink,#0f172a)">Upload payslip</h2>' +
      '<form id="portalPayslipsForm">' +
      '<div class="portal-payslips-grid">' +
      "<div><label for=\"portalPayslipsStaffInput\">Worker</label>" +
      '<div class="portal-payslips-staff-combo" id="portalPayslipsStaffCombo">' +
      '<input type="hidden" id="portalPayslipsStaff" value="" />' +
      '<input class="inp" id="portalPayslipsStaffInput" type="text" placeholder="Type to search worker…" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="portalPayslipsStaffSuggest" required />' +
      '<div id="portalPayslipsStaffSuggest" class="portal-payslips-suggest" role="listbox" aria-label="Matching workers" hidden></div>' +
      "</div></div>" +
      "<div><label for=\"portalPayslipsMonth\">Payslip month</label><input type=\"month\" id=\"portalPayslipsMonth\" required /></div>" +
      "<div><label for=\"portalPayslipsFile\">PDF file</label><input type=\"file\" id=\"portalPayslipsFile\" accept=\"application/pdf,.pdf\" required /></div>" +
      "</div>" +
      '<div class="portal-payslips-actions">' +
      '<button type="submit" class="btn btn--pri" id="portalPayslipsSubmit">Upload payslip</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalPayslipsRefresh">Refresh list</button>' +
      "</div>" +
      "</form></div>" +
      '<div class="portal-payslips-toolbar">' +
      '<input type="search" class="inp" id="portalPayslipsSearch" placeholder="Search worker, title, month…" style="max-width:280px;min-width:0" />' +
      "</div>" +
      '<div class="portal-payslips-statrow" id="portalPayslipsMonthFilters"></div>' +
      '<div class="portal-payslips-main">' +
      '<div class="portal-payslips-listcol">' +
      '<div class="portal-forms-table-wrap">' +
      '<table class="portal-forms-table portal-forms-table--full-detail">' +
      "<thead><tr><th>Month</th><th>Name / details</th><th>Uploaded</th><th>Size</th><th>View</th></tr></thead>" +
      '<tbody id="portalPayslipsTbody"><tr><td colspan="5" class="muted" style="padding:16px">Loading…</td></tr></tbody>' +
      "</table></div></div>" +
      '<aside class="portal-payslips-preview" id="portalPayslipsPreview" hidden>' +
      '<div class="portal-payslips-preview-head">' +
      '<span class="portal-payslips-preview-title" id="portalPayslipsPreviewTitle">Payslip</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalPayslipsPreviewClose" aria-label="Close preview">✕</button>' +
      "</div>" +
      '<iframe class="portal-payslips-preview-frame" id="portalPayslipsPreviewFrame" title="Payslip preview"></iframe>' +
      '<div class="portal-payslips-preview-foot">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalPayslipsPreviewOpen">Open</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="portalPayslipsPreviewDownload">Download</button>' +
      "</div>" +
      "</aside></div></div>"
    );
  }

  global.PortalPayslips = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refreshAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
