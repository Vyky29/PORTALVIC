/**
 * Admin HR module — live, editable Staff & HR powered by public.hr_records.
 *
 * Mounted from admin_dashboard.html into the "Staff & HR" view. Reads/writes the
 * Portal Supabase project with the signed-in admin/CEO JWT (RLS: hr_records_admin_all).
 *
 * UX:
 *  - Filter every category by Active (default) / All / Inactive + free-text search.
 *  - Basics table: Name · Role · Shifts (click a person -> full editable card).
 *  - Category boxes (Docs, Emergency, Health, Trainings, …) open that category as a
 *    table; clicking a row opens the same person card.
 *  - Person card: edit any field across every category, set Active, and Save — all
 *    persisted to Supabase. No code change needed for the admin to update data.
 *
 * `active` is an HR-only label (does not affect login). Toggling a person updates
 * every hr_records row that shares their name_key.
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: function () { return (global.__PORTAL_SUPABASE__ || {}).client || null; },
    getProfile: function () { return (global.__PORTAL_SUPABASE__ || {}).staff_profile || null; },
    toast: function (m) { try { console.log("[hr]", m); } catch (_) {} },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    openModal: null,
    closeModal: null,
  };

  var PEOPLE_SHEET = "Employees info";
  var SHEET_LABELS = {
    "Employees info": "Employee info",
    "Employee Docs": "Documents & checks",
    "Emergency Contact Info": "Emergency contact",
    "Induction & Safeguarding": "Induction & safeguarding",
    "Shadowings & Trainings": "Shadowings & trainings",
    "Observations": "Observations",
    "Paid CoursesCertificatesFirst A": "Paid courses & certificates",
    "Interviews": "Interviews",
    "Job application": "Job application",
    "Health Questionaire": "Health questionnaire",
  };
  var CATEGORY_ORDER = [
    "Employee Docs", "Emergency Contact Info", "Induction & Safeguarding",
    "Shadowings & Trainings", "Observations", "Paid CoursesCertificatesFirst A",
    "Health Questionaire", "Job application", "Interviews",
  ];

  var state = {
    rootEl: null,
    rows: [],
    people: [],
    linkedKeys: {}, // name_key -> true when the person has a login account
    activeFilter: "active", // active | inactive | all
    query: "",
  };

  function esc(s) { return deps.esc(s); }
  function labelFor(sheet) { return SHEET_LABELS[sheet] || sheet; }

  function injectStyleOnce() {
    if (document.getElementById("adminHrStyle")) return;
    var css = [
      ".hr-wrap{min-width:0}",
      ".hr-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px;min-width:0}",
      ".hr-seg{display:inline-flex;border:1px solid #c3d0e0;border-radius:10px;overflow:hidden}",
      ".hr-seg button{font:inherit;font-weight:700;font-size:13px;border:0;background:#fff;color:#334155;padding:9px 14px;cursor:pointer}",
      ".hr-seg button[aria-pressed=true]{background:#2d84b3;color:#fff}",
      ".hr-search{flex:1;min-width:180px;font:inherit;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".hr-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.05);margin-bottom:16px;overflow:hidden}",
      ".hr-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid #eef2f7}",
      ".hr-card-h h3{margin:0;font-size:15px;color:#0f172a}",
      ".hr-tbl-wrap{overflow-x:auto;min-width:0}",
      ".hr-tbl{width:100%;border-collapse:collapse;font-size:14px}",
      ".hr-tbl th,.hr-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:top;overflow-wrap:break-word;max-width:280px}",
      ".hr-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".hr-tbl tbody tr{cursor:pointer}",
      ".hr-tbl tbody tr:hover{background:#f8fafc}",
      ".hr-name{font-weight:700;color:#0f172a;white-space:nowrap}",
      ".hr-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px}",
      ".hr-pill--on{background:#e7f6ee;color:#15803d}",
      ".hr-pill--off{background:#fef2f2;color:#b91c1c}",
      ".hr-boxes{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}",
      ".hr-box{display:flex;flex-direction:column;gap:4px;text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;font:inherit}",
      ".hr-box:hover{border-color:#2d84b3;background:#f0f7fb}",
      ".hr-box b{color:#0f172a;font-size:14px}",
      ".hr-box span{color:#64748b;font-size:12px}",
      ".hr-empty{color:#64748b;padding:18px;text-align:center;font-size:14px}",
      /* Person card */
      ".hr-person .hr-sec{border:1px solid #e2e8f0;border-radius:12px;margin:0 0 12px}",
      ".hr-person .hr-sec>summary{cursor:pointer;list-style:none;padding:11px 14px;font-weight:700;color:#0f172a;display:flex;justify-content:space-between;align-items:center;gap:8px}",
      ".hr-person .hr-sec>summary::-webkit-details-marker{display:none}",
      ".hr-person .hr-sec[open]>summary{border-bottom:1px solid #eef2f7}",
      ".hr-fields{padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
      ".hr-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".hr-field label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".hr-field input,.hr-field textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;width:100%}",
      ".hr-field textarea{min-height:62px;resize:vertical}",
      ".hr-toggle{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#0f172a;font-weight:700}",
      ".hr-multi{font-size:11px;color:#64748b;margin:2px 0 0}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminHrStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function nk(r) { return String(r.name_key || ""); }

  function rebuildDerived() {
    state.people = state.rows
      .filter(function (r) { return r.sheet === PEOPLE_SHEET; })
      .sort(function (a, b) {
        return String(a.employee_name || "").localeCompare(String(b.employee_name || ""));
      });
    // Active = has a login account (linked to staff_profiles). Everyone else is
    // inactive. Linkage is per-person, so a name_key counts as linked if ANY of
    // its rows carries a staff_id.
    state.linkedKeys = {};
    state.rows.forEach(function (r) {
      if (r.staff_id) state.linkedKeys[nk(r)] = true;
    });
  }

  function personActive(r) { return !!state.linkedKeys[nk(r)]; }

  function matchesFilter(r) {
    if (state.activeFilter === "all") return true;
    if (state.activeFilter === "inactive") return !personActive(r);
    return personActive(r); // active (default) = has a login account
  }

  function rowMatchesQuery(r) {
    var q = state.query;
    if (!q) return true;
    if (String(r.employee_name || "").toLowerCase().indexOf(q) >= 0) return true;
    var d = r.data || {};
    for (var k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k)) {
        if (String(d[k]).toLowerCase().indexOf(q) >= 0) return true;
      }
    }
    return false;
  }

  function categoryCount(sheet) {
    var n = 0;
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (r.sheet === sheet && matchesFilter(r)) n++;
    }
    return n;
  }

  function render() {
    var root = state.rootEl;
    if (!root) return;
    var counts = { active: 0, all: 0, inactive: 0 };
    state.people.forEach(function (p) {
      counts.all++;
      if (personActive(p)) counts.active++; else counts.inactive++;
    });

    var peopleRows = state.people.filter(function (p) {
      return matchesFilter(p) && rowMatchesQuery(p);
    });

    var html = '<div class="hr-wrap">';
    html += '<div class="hr-bar">'
      + '<div class="hr-seg" role="group" aria-label="Account filter">'
      + '<button type="button" data-hr-filter="active" aria-pressed="' + (state.activeFilter === "active") + '">Active (' + counts.active + ')</button>'
      + '<button type="button" data-hr-filter="inactive" aria-pressed="' + (state.activeFilter === "inactive") + '">Inactive (' + counts.inactive + ')</button>'
      + '<button type="button" data-hr-filter="all" aria-pressed="' + (state.activeFilter === "all") + '">All (' + counts.all + ')</button>'
      + '</div>'
      + '<input type="search" class="hr-search" id="hrSearch" placeholder="Search people & all categories…" value="' + esc(state.query) + '" />'
      + '</div>';

    // People table (basics)
    html += '<div class="hr-card"><div class="hr-card-h"><h3>Staff</h3><span class="hr-multi">' + peopleRows.length + ' shown</span></div>';
    html += '<div class="hr-tbl-wrap"><table class="hr-tbl"><thead><tr><th>Name</th><th>Role</th><th>Shifts</th><th>Status</th></tr></thead><tbody>';
    if (!peopleRows.length) {
      html += '<tr><td colspan="4" class="hr-empty">No people match this filter.</td></tr>';
    } else {
      peopleRows.forEach(function (p) {
        var d = p.data || {};
        var pill = personActive(p)
          ? '<span class="hr-pill hr-pill--on">Active</span>'
          : '<span class="hr-pill hr-pill--off">Inactive</span>';
        html += '<tr data-hr-person="' + esc(nk(p)) + '">'
          + '<td class="hr-name">' + esc(p.employee_name || "—") + '</td>'
          + '<td>' + esc(d.Role || d.role || "") + '</td>'
          + '<td>' + esc(d.Shifts || "") + '</td>'
          + '<td>' + pill + '</td></tr>';
      });
    }
    html += '</tbody></table></div></div>';

    // Category boxes
    html += '<div class="hr-card"><div class="hr-card-h"><h3>Categories</h3></div><div style="padding:14px"><div class="hr-boxes">';
    CATEGORY_ORDER.forEach(function (sheet) {
      var present = state.rows.some(function (r) { return r.sheet === sheet; });
      if (!present) return;
      html += '<button type="button" class="hr-box" data-hr-cat="' + esc(sheet) + '">'
        + '<b>' + esc(labelFor(sheet)) + '</b>'
        + '<span>' + categoryCount(sheet) + ' record' + (categoryCount(sheet) === 1 ? "" : "s") + '</span>'
        + '</button>';
    });
    html += '</div></div></div>';
    html += '</div>';

    root.innerHTML = html;
    bindRoot(root);
  }

  function bindRoot(root) {
    root.querySelectorAll("[data-hr-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.activeFilter = b.getAttribute("data-hr-filter");
        render();
      });
    });
    var s = root.querySelector("#hrSearch");
    if (s) {
      s.addEventListener("input", function () {
        state.query = String(s.value || "").trim().toLowerCase();
        // Re-render but keep focus + caret on the search box.
        var pos = s.selectionStart;
        render();
        var s2 = state.rootEl.querySelector("#hrSearch");
        if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} }
      });
    }
    root.querySelectorAll("[data-hr-person]").forEach(function (tr) {
      tr.addEventListener("click", function () { openPerson(tr.getAttribute("data-hr-person")); });
    });
    root.querySelectorAll("[data-hr-cat]").forEach(function (b) {
      b.addEventListener("click", function () { openCategory(b.getAttribute("data-hr-cat")); });
    });
  }

  function openCategory(sheet) {
    if (typeof deps.openModal !== "function") return;
    var rows = state.rows.filter(function (r) {
      return r.sheet === sheet && matchesFilter(r) && rowMatchesQuery(r);
    });
    // Column union (first-seen order; json preserves it).
    var seen = {}, cols = [];
    rows.forEach(function (r) {
      var d = r.data || {};
      for (var k in d) { if (Object.prototype.hasOwnProperty.call(d, k) && !seen[k]) { seen[k] = 1; cols.push(k); } }
    });
    var head = '<th>Person</th>';
    cols.forEach(function (c) { head += '<th>' + esc(c) + '</th>'; });
    var body = "";
    if (!rows.length) {
      body = '<tr><td class="hr-empty">No records for this filter.</td></tr>';
    } else {
      rows.forEach(function (r) {
        var d = r.data || {};
        body += '<tr data-hr-person="' + esc(nk(r)) + '"><td class="hr-name">' + esc(r.employee_name || "—") + '</td>';
        cols.forEach(function (c) { body += '<td>' + esc(d[c] != null ? d[c] : "") + '</td>'; });
        body += '</tr>';
      });
    }
    var html = '<div class="modal-h"><h2 id="modalTitle">' + esc(labelFor(sheet)) + '</h2></div>'
      + '<div class="modal-b"><p class="muted" style="margin:0 0 10px;font-size:13px">Tap a row to open and edit that person.</p>'
      + '<div class="hr-tbl-wrap"><table class="hr-tbl"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div></div>'
      + '<div class="modal-f"><button type="button" class="btn btn--ghost" id="hrCatClose">Close</button></div>';
    deps.openModal(html);
    var mr = document.getElementById("modalRoot") || document;
    var cl = mr.querySelector("#hrCatClose");
    if (cl) cl.addEventListener("click", function () { if (deps.closeModal) deps.closeModal(); });
    mr.querySelectorAll("[data-hr-person]").forEach(function (tr) {
      tr.addEventListener("click", function () { openPerson(tr.getAttribute("data-hr-person")); });
    });
  }

  function fieldInput(rowId, key, value) {
    var v = value == null ? "" : String(value);
    var long = v.length > 48;
    var control = long
      ? '<textarea data-field="' + esc(key) + '">' + esc(v) + '</textarea>'
      : '<input type="text" data-field="' + esc(key) + '" value="' + esc(v) + '" />';
    return '<div class="hr-field" data-row-id="' + esc(rowId) + '"><label>' + esc(key) + '</label>' + control + '</div>';
  }

  function openPerson(nameKey) {
    if (typeof deps.openModal !== "function") return;
    var rows = state.rows.filter(function (r) { return nk(r) === nameKey; });
    if (!rows.length) return;
    var personRow = rows.filter(function (r) { return r.sheet === PEOPLE_SHEET; })[0] || rows[0];
    var displayName = personRow.employee_name || "Person";
    var linked = personActive(personRow);

    // Order: Employee info first, then the rest by CATEGORY_ORDER, then any others.
    var order = [PEOPLE_SHEET].concat(CATEGORY_ORDER);
    rows.sort(function (a, b) {
      var ia = order.indexOf(a.sheet); var ib = order.indexOf(b.sheet);
      ia = ia < 0 ? 99 : ia; ib = ib < 0 ? 99 : ib;
      if (ia !== ib) return ia - ib;
      return (a.row_index || 0) - (b.row_index || 0);
    });

    var sections = "";
    rows.forEach(function (r, idx) {
      var d = r.data || {};
      var keys = Object.keys(d);
      // Ensure Employee info always exposes Role + Shifts to edit.
      if (r.sheet === PEOPLE_SHEET) {
        if (keys.indexOf("Role") < 0 && keys.indexOf("role") < 0) keys.push("Role");
        if (keys.indexOf("Shifts") < 0) keys.push("Shifts");
      }
      var fields = keys.map(function (k) { return fieldInput(r.id, k, d[k]); }).join("");
      if (!fields) fields = '<p class="muted" style="margin:0;font-size:13px">No fields.</p>';
      var openAttr = (r.sheet === PEOPLE_SHEET || idx === 0) ? " open" : "";
      sections += '<details class="hr-sec"' + openAttr + ' data-sheet-row="' + esc(r.id) + '">'
        + '<summary>' + esc(labelFor(r.sheet)) + '</summary>'
        + '<div class="hr-fields">' + fields + '</div></details>';
    });

    var html = '<div class="modal-h"><h2 id="modalTitle">' + esc(displayName) + '</h2></div>'
      + '<div class="modal-b hr-person">'
      + '<p style="margin:0 0 12px;font-size:13px">Status: '
      + (linked
          ? '<span class="hr-pill hr-pill--on">Active</span> <span class="muted">has a login account</span>'
          : '<span class="hr-pill hr-pill--off">Inactive</span> <span class="muted">no login account</span>')
      + '</p>'
      + sections
      + '<p id="hrPersonMsg" class="muted" style="margin:8px 0 0;font-size:13px"></p>'
      + '</div>'
      + '<div class="modal-f">'
      + '<button type="button" class="btn btn--ghost" id="hrPersonCancel">Close</button>'
      + '<button type="button" class="btn btn--pri" id="hrPersonSave">Save changes</button>'
      + '</div>';
    deps.openModal(html);

    var mr = document.getElementById("modalRoot") || document;
    var cancel = mr.querySelector("#hrPersonCancel");
    if (cancel) cancel.addEventListener("click", function () { if (deps.closeModal) deps.closeModal(); });
    var saveBtn = mr.querySelector("#hrPersonSave");
    if (saveBtn) saveBtn.addEventListener("click", function () { savePerson(nameKey, mr, saveBtn); });
  }

  function collectRowData(mr, rowId) {
    var out = {};
    mr.querySelectorAll('.hr-field[data-row-id="' + cssEscape(rowId) + '"] [data-field]').forEach(function (inp) {
      var k = inp.getAttribute("data-field");
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (v !== "") out[k] = v;
    });
    return out;
  }

  function cssEscape(s) {
    return String(s).replace(/["\\\]\[\.:#>+~*^$|()=]/g, "\\$&");
  }

  function savePerson(nameKey, mr, saveBtn) {
    var client = deps.getClient();
    var msg = mr.querySelector("#hrPersonMsg");
    if (!client) { if (msg) msg.textContent = "Supabase not connected yet — sign in as admin and retry."; return; }
    var rows = state.rows.filter(function (r) { return nk(r) === nameKey; });

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
    if (msg) msg.textContent = "";

    // We loaded every row, so `rows` already holds all rows for this person.
    // Active is derived from the login account, so we only persist field edits.
    var ops = rows.map(function (r) {
      var newData = collectRowData(mr, r.id);
      return client.from("hr_records").update({ data: newData }).eq("id", r.id).then(function (res) {
        if (res.error) throw res.error;
        r.data = newData;
      });
    });

    Promise.all(ops).then(function () {
      deps.toast("Saved.");
      if (deps.closeModal) deps.closeModal();
      rebuildDerived();
      render();
    }).catch(function (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
      if (msg) msg.textContent = "Could not save: " + ((err && err.message) || err);
    });
  }

  function configure(opts) {
    opts = opts || {};
    ["getClient", "getProfile", "toast", "esc", "openModal", "closeModal"].forEach(function (k) {
      if (typeof opts[k] === "function") deps[k] = opts[k];
    });
  }

  function mount(rootEl) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Loading H&amp;R…</p>';

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
      rebuildDerived();
      if (!rows.length) {
        rootEl.innerHTML = '<p class="hr-empty">No HR data yet. Import the STAFF MATRIX (hr_records) in Supabase, then reopen this view.</p>';
        return;
      }
      render();
    }).catch(function (err) {
      rootEl.innerHTML = '<p class="hr-empty">Could not load H&amp;R: ' + esc((err && err.message) || err) + "</p>";
    });
  }

  function loadAll(client) {
    var pageSize = 1000;
    var all = [];
    function page(from) {
      return client
        .from("hr_records")
        .select("id, sheet, row_index, name_key, employee_name, staff_id, active, data")
        .order("sheet", { ascending: true })
        .order("row_index", { ascending: true })
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

  global.AdminHR = { configure: configure, mount: mount };
})(typeof window !== "undefined" ? window : globalThis);
