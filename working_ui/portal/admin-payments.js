/**
 * Admin Payments module — live, editable client re-enrolment payments.
 *
 * Powered by public.client_payments (Portal Supabase, RLS admin/CEO only),
 * seeded from the "SUMMER. Re-enrolments" workbook. Mounted into the admin
 * "Re-enrolment payments" view (#payModuleRoot).
 *
 * UX:
 *  - Totals KPIs: billed / paid / outstanding (respecting group + search).
 *  - Filter by status (All / Outstanding / Paid / Not re-enrolled) and by group
 *    (Private parents / Local authority / Not re-enrolled), plus free-text search.
 *  - Tap a client to open and edit status, amount, names and every field.
 *
 * Edits are saved to Supabase (the workbook was the initial load only).
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: function () { return (global.__PORTAL_SUPABASE__ || {}).client || null; },
    toast: function (m) { try { console.log("[pay]", m); } catch (_) {} },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    openModal: null,
    closeModal: null,
  };

  var SHEET_LABELS = {
    "PARENTS": "Private (parents)",
    "LA": "Local authority",
    "No re-enroled": "Not re-enrolled",
  };
  var SHEET_ORDER = ["PARENTS", "LA", "No re-enroled"];
  var STATUS_OPTIONS = ["Paid", "Outstanding", "Not paid", "Pending", "Not re-enrolled"];

  var state = {
    rootEl: null,
    rows: [],
    statusFilter: "active", // active (re-enrolled) | all | outstanding | paid | notreenrolled
    sheetFilter: "",      // "" = all groups, else sheet name
    query: "",
  };

  function esc(s) { return deps.esc(s); }
  function labelFor(sheet) { return SHEET_LABELS[sheet] || sheet; }

  function money(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "—";
    return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function category(r) {
    var s = String(r.payment_status || "").toLowerCase();
    if (s.indexOf("re-enrol") >= 0 || s.indexOf("reenrol") >= 0) return "notreenrolled";
    if (s.indexOf("paid") === 0) return "paid"; // "Paid"
    return "outstanding"; // Outstanding / Not paid / Pending / blank
  }

  function injectStyleOnce() {
    if (document.getElementById("adminPayStyle")) return;
    var css = [
      ".pay-wrap{min-width:0}",
      ".pay-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 14px}",
      ".pay-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px}",
      ".pay-kpi b{display:block;font-size:22px;color:#0f172a}",
      ".pay-kpi span{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;font-weight:700}",
      ".pay-kpi--out b{color:#b91c1c}",
      ".pay-kpi--paid b{color:#15803d}",
      ".pay-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px;min-width:0}",
      ".pay-seg{display:inline-flex;border:1px solid #c3d0e0;border-radius:10px;overflow:hidden}",
      ".pay-seg button{font:inherit;font-weight:700;font-size:13px;border:0;background:#fff;color:#334155;padding:9px 13px;cursor:pointer}",
      ".pay-seg button[aria-pressed=true]{background:#2d84b3;color:#fff}",
      ".pay-sel{font:inherit;font-size:13px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".pay-search{flex:1;min-width:160px;font:inherit;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".pay-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.05);overflow:hidden}",
      ".pay-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid #eef2f7}",
      ".pay-card-h h3{margin:0;font-size:15px;color:#0f172a}",
      ".pay-tbl-wrap{overflow-x:auto;min-width:0}",
      ".pay-tbl{width:100%;border-collapse:collapse;font-size:14px}",
      ".pay-tbl th,.pay-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;overflow-wrap:break-word;max-width:260px}",
      ".pay-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".pay-tbl tbody tr{cursor:pointer}",
      ".pay-tbl tbody tr:hover{background:#f8fafc}",
      ".pay-tbl td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".pay-name{font-weight:700;color:#0f172a;white-space:nowrap}",
      ".pay-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}",
      ".pay-pill--paid{background:#e7f6ee;color:#15803d}",
      ".pay-pill--out{background:#fef2f2;color:#b91c1c}",
      ".pay-pill--na{background:#eef2f7;color:#475569}",
      ".pay-empty{color:#64748b;padding:18px;text-align:center;font-size:14px}",
      ".pay-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
      ".pay-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".pay-field label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".pay-field input,.pay-field select,.pay-field textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;width:100%}",
      ".pay-field textarea{min-height:60px;resize:vertical}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminPayStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function pillFor(r) {
    var c = category(r);
    var label = r.payment_status || (c === "paid" ? "Paid" : "Outstanding");
    var cls = c === "paid" ? "pay-pill--paid" : (c === "notreenrolled" ? "pay-pill--na" : "pay-pill--out");
    return '<span class="pay-pill ' + cls + '">' + esc(label) + "</span>";
  }

  function baseRows() {
    // Rows matching the group + search, regardless of status (for KPI totals).
    var q = state.query;
    return state.rows.filter(function (r) {
      if (state.sheetFilter && r.sheet !== state.sheetFilter) return false;
      if (!q) return true;
      if (String(r.client_name || "").toLowerCase().indexOf(q) >= 0) return true;
      if (String(r.parent_name || "").toLowerCase().indexOf(q) >= 0) return true;
      var d = r.data || {};
      for (var k in d) { if (String(d[k]).toLowerCase().indexOf(q) >= 0) return true; }
      return false;
    });
  }

  function statusMatch(r) {
    if (state.statusFilter === "all") return true;
    // "Active" = currently re-enrolled (everyone except the Not re-enrolled list).
    if (state.statusFilter === "active") return category(r) !== "notreenrolled";
    return category(r) === state.statusFilter;
  }

  function serviceFor(r) {
    var d = r.data || {};
    var keys = ["Services", "Service", "Programme", "Programmes", "Activity"];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim() && String(v).trim() !== "-") return String(v).trim();
    }
    return "—";
  }

  function render() {
    var root = state.rootEl;
    if (!root) return;
    var scoped = baseRows();
    var visible = scoped.filter(statusMatch);

    var billed = 0, paid = 0, outstanding = 0, paidN = 0, outN = 0;
    scoped.forEach(function (r) {
      var a = Number(r.amount) || 0;
      var c = category(r);
      if (c !== "notreenrolled") billed += a;
      if (c === "paid") { paid += a; paidN++; }
      else if (c === "outstanding") { outstanding += a; outN++; }
    });

    var html = '<div class="pay-wrap">';

    // KPIs
    html += '<div class="pay-kpis">'
      + '<div class="pay-kpi"><span>Billed</span><b>' + money(billed) + '</b></div>'
      + '<div class="pay-kpi pay-kpi--paid"><span>Paid</span><b>' + money(paid) + '</b></div>'
      + '<div class="pay-kpi pay-kpi--out"><span>Outstanding</span><b>' + money(outstanding) + '</b></div>'
      + '</div>';

    // Filter bar
    var sheetOpts = '<option value="">All groups</option>';
    SHEET_ORDER.forEach(function (s) {
      if (state.rows.some(function (r) { return r.sheet === s; })) {
        sheetOpts += '<option value="' + esc(s) + '"' + (state.sheetFilter === s ? " selected" : "") + ">" + esc(labelFor(s)) + "</option>";
      }
    });
    html += '<div class="pay-bar">'
      + '<div class="pay-seg" role="group" aria-label="Status filter">'
      + seg("active", "Active (" + (paidN + outN) + ")") + seg("outstanding", "Outstanding (" + outN + ")") + seg("paid", "Paid (" + paidN + ")") + seg("notreenrolled", "Not re-enrolled") + seg("all", "All")
      + '</div>'
      + '<select class="pay-sel" id="paySheet">' + sheetOpts + '</select>'
      + '<input type="search" class="pay-search" id="paySearch" placeholder="Search client, parent…" value="' + esc(state.query) + '" />'
      + '</div>';

    // Table
    html += '<div class="pay-card"><div class="pay-card-h"><h3>Clients</h3><span style="font-size:12px;color:#64748b">' + visible.length + ' shown</span></div>';
    html += '<div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th>Client</th><th>Group</th><th>Service</th><th>Parent / LA</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>';
    if (!visible.length) {
      html += '<tr><td colspan="6" class="pay-empty">No clients match this filter.</td></tr>';
    } else {
      visible.sort(function (a, b) {
        var s = String(a.sheet).localeCompare(String(b.sheet));
        if (s) return s;
        return String(a.client_name || "").localeCompare(String(b.client_name || ""));
      });
      visible.forEach(function (r) {
        html += '<tr data-pay-id="' + esc(r.id) + '">'
          + '<td class="pay-name">' + esc(r.client_name || "—") + "</td>"
          + "<td>" + esc(labelFor(r.sheet)) + "</td>"
          + "<td>" + esc(serviceFor(r)) + "</td>"
          + "<td>" + esc(r.parent_name || "") + "</td>"
          + '<td class="num">' + money(r.amount) + "</td>"
          + "<td>" + pillFor(r) + "</td></tr>";
      });
    }
    html += "</tbody></table></div></div></div>";

    root.innerHTML = html;
    bindRoot(root);
  }

  function seg(id, label) {
    return '<button type="button" data-pay-status="' + id + '" aria-pressed="' + (state.statusFilter === id) + '">' + label + "</button>";
  }

  function bindRoot(root) {
    root.querySelectorAll("[data-pay-status]").forEach(function (b) {
      b.addEventListener("click", function () { state.statusFilter = b.getAttribute("data-pay-status"); render(); });
    });
    var sh = root.querySelector("#paySheet");
    if (sh) sh.addEventListener("change", function () { state.sheetFilter = sh.value; render(); });
    var s = root.querySelector("#paySearch");
    if (s) {
      s.addEventListener("input", function () {
        state.query = String(s.value || "").trim().toLowerCase();
        var pos = s.selectionStart;
        render();
        var s2 = state.rootEl.querySelector("#paySearch");
        if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} }
      });
    }
    root.querySelectorAll("[data-pay-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-pay-id")); });
    });
  }

  function field(name, label, value, type) {
    var v = value == null ? "" : String(value);
    var control;
    if (type === "status") {
      var opts = STATUS_OPTIONS.slice();
      if (v && opts.indexOf(v) < 0) opts.unshift(v);
      control = '<select data-prop="payment_status">' + opts.map(function (o) {
        return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select>";
    } else if (type === "amount") {
      control = '<input type="number" step="0.01" data-prop="amount" value="' + esc(v) + '" />';
    } else if (type === "prop") {
      control = '<input type="text" data-prop="' + esc(name) + '" value="' + esc(v) + '" />';
    } else {
      var long = v.length > 48;
      control = long
        ? '<textarea data-data="' + esc(name) + '">' + esc(v) + "</textarea>"
        : '<input type="text" data-data="' + esc(name) + '" value="' + esc(v) + '" />';
    }
    return '<div class="pay-field"><label>' + esc(label) + "</label>" + control + "</div>";
  }

  function openDetail(id) {
    if (typeof deps.openModal !== "function") return;
    var r = state.rows.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    var d = r.data || {};

    var top = '<div class="pay-fields" style="margin-bottom:12px">'
      + field("client_name", "Client name", r.client_name, "prop")
      + field("parent_name", "Parent / LA", r.parent_name, "prop")
      + field(null, "Status", r.payment_status, "status")
      + field(null, "Total (£)", r.amount, "amount")
      + "</div>";

    var dataFields = Object.keys(d).map(function (k) { return field(k, k, d[k], "data"); }).join("");
    if (!dataFields) dataFields = '<p class="pay-empty">No extra fields.</p>';

    var html = '<div class="modal-h"><h2 id="modalTitle">' + esc(r.client_name || "Client") + " · " + esc(labelFor(r.sheet)) + "</h2></div>"
      + '<div class="modal-b">'
      + top
      + '<div class="pay-card-h" style="padding:0 0 8px;border:0"><h3>All spreadsheet fields</h3></div>'
      + '<div class="pay-fields">' + dataFields + "</div>"
      + '<p id="payMsg" class="muted" style="margin:10px 0 0;font-size:13px"></p>'
      + "</div>"
      + '<div class="modal-f">'
      + '<button type="button" class="btn btn--ghost" id="payCancel">Close</button>'
      + '<button type="button" class="btn btn--pri" id="paySave">Save changes</button>'
      + "</div>";
    deps.openModal(html);

    var mr = document.getElementById("modalRoot") || document;
    var cancel = mr.querySelector("#payCancel");
    if (cancel) cancel.addEventListener("click", function () { if (deps.closeModal) deps.closeModal(); });
    var save = mr.querySelector("#paySave");
    if (save) save.addEventListener("click", function () { saveDetail(r, mr, save); });
  }

  function saveDetail(r, mr, saveBtn) {
    var client = deps.getClient();
    var msg = mr.querySelector("#payMsg");
    if (!client) { if (msg) msg.textContent = "Supabase not connected yet — sign in as admin and retry."; return; }

    var patch = {};
    mr.querySelectorAll("[data-prop]").forEach(function (inp) {
      var p = inp.getAttribute("data-prop");
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (p === "amount") patch.amount = v === "" ? null : Number(v);
      else patch[p] = v === "" ? null : v;
    });
    var newData = {};
    mr.querySelectorAll("[data-data]").forEach(function (inp) {
      var k = inp.getAttribute("data-data");
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (v !== "") newData[k] = v;
    });
    patch.data = newData;

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
    if (msg) msg.textContent = "";

    client.from("client_payments").update(patch).eq("id", r.id).then(function (res) {
      if (res.error) throw res.error;
      Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
      deps.toast("Saved.");
      if (deps.closeModal) deps.closeModal();
      render();
    }).catch(function (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
      if (msg) msg.textContent = "Could not save: " + ((err && err.message) || err);
    });
  }

  function configure(opts) {
    opts = opts || {};
    ["getClient", "toast", "esc", "openModal", "closeModal"].forEach(function (k) {
      if (typeof opts[k] === "function") deps[k] = opts[k];
    });
  }

  function mount(rootEl) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Loading payments…</p>';

    var client = deps.getClient();
    if (!client) {
      rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Connecting to Supabase… open this view again in a moment.</p>';
      global.addEventListener && global.addEventListener("portal:supabase-ready", function () {
        if (state.rootEl === rootEl) mount(rootEl);
      }, { once: true });
      return;
    }

    loadAll(client).then(function (rows) {
      state.rows = rows;
      if (!rows.length) {
        rootEl.innerHTML = '<p class="pay-empty">No payments yet. Run the client_payments migration + seed in Supabase, then reopen this view.</p>';
        return;
      }
      render();
    }).catch(function (err) {
      rootEl.innerHTML = '<p class="pay-empty">Could not load payments: ' + esc((err && err.message) || err) + "</p>";
    });
  }

  function loadAll(client) {
    var pageSize = 1000;
    var all = [];
    function page(from) {
      return client
        .from("client_payments")
        .select("id, sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data")
        .order("sheet", { ascending: true })
        .order("client_name", { ascending: true })
        .range(from, from + pageSize - 1)
        .then(function (res) {
          if (res.error) throw res.error;
          var data = res.data || [];
          all = all.concat(data);
          if (data.length < pageSize) return all;
          return page(from + pageSize);
        });
    }
    return page(0);
  }

  global.AdminPayments = { configure: configure, mount: mount };
})(typeof window !== "undefined" ? window : globalThis);
