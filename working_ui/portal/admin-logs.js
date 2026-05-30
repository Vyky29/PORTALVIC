/**
 * Admin Activity log — read-only audit trail viewer.
 *
 * Reads public.change_log (Portal Supabase, RLS admin/CEO) via
 * window.PortalChangeLog.load() and lists every recorded change grouped by day,
 * newest first. Each entry shows WHEN (day header) · WHAT TIME · BY WHOM · WHAT.
 * Search + area filter on top. Nothing is editable here.
 */
(function (global) {
  "use strict";

  var deps = {
    toast: function (m) { try { console.log("[logs]", m); } catch (_) {} },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
  };

  var state = { rootEl: null, rows: [], query: "", area: "", loading: false };

  function esc(s) { return deps.esc(s); }

  var ICONS = {
    log: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  };
  function icon(name, px) {
    var s = px || 16;
    return '<svg class="lg-ico" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  function injectStyleOnce() {
    if (document.getElementById("adminLogStyle")) return;
    var css = [
      ".lg-wrap{min-width:0}",
      ".lg-ico{display:block}",
      ".lg-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px;min-width:0}",
      ".lg-sel{font:inherit;font-size:13px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".lg-search{flex:1;min-width:180px;font:inherit;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}",
      ".lg-btn{font:inherit;font-weight:700;font-size:13px;border:1px solid #c3d0e0;border-radius:10px;background:#fff;color:#334155;padding:9px 13px;cursor:pointer}",
      ".lg-day{margin:0 0 16px}",
      ".lg-day__h{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.03em}",
      ".lg-day__h .lg-ico{color:#2d84b3}",
      ".lg-day__count{margin-left:6px;font-size:11px;font-weight:700;color:#94a3b8}",
      ".lg-list{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.05);overflow:hidden}",
      ".lg-item{display:grid;grid-template-columns:84px 160px 1fr;gap:12px;padding:12px 16px;border-bottom:1px solid #eef2f7;align-items:start}",
      ".lg-item:last-child{border-bottom:0}",
      ".lg-time{display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;font-weight:700;color:#0f172a;font-size:13px;white-space:nowrap}",
      ".lg-time .lg-ico{color:#94a3b8}",
      ".lg-who{min-width:0}",
      ".lg-who b{display:block;color:#0f172a;font-size:13px;overflow-wrap:break-word}",
      ".lg-who span{font-size:11px;color:#94a3b8;font-weight:700}",
      ".lg-what{min-width:0}",
      ".lg-chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800;background:#eff6ff;color:#2d84b3;margin-right:6px;white-space:nowrap}",
      ".lg-chip--hr{background:#f1ecfb;color:#7c3aed}",
      ".lg-entity{font-weight:800;color:#0f172a}",
      ".lg-sum{display:block;margin-top:3px;color:#475569;font-size:13px;overflow-wrap:break-word}",
      ".lg-empty{color:#64748b;padding:22px;text-align:center;font-size:14px;background:#fff;border:1px solid #e2e8f0;border-radius:14px}",
      "@media(max-width:640px){.lg-item{grid-template-columns:1fr;gap:4px}.lg-time{order:0}}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminLogStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function dayKey(dt) { return dt.getFullYear() + "-" + (dt.getMonth() + 1) + "-" + dt.getDate(); }
  function dayLabel(dt) {
    return dt.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  function timeLabel(dt) {
    return dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function matches(r) {
    if (state.area && r.area !== state.area) return false;
    var q = state.query;
    if (!q) return true;
    return [r.actor_name, r.area, r.entity, r.summary, r.action]
      .some(function (v) { return String(v || "").toLowerCase().indexOf(q) >= 0; });
  }

  function render() {
    var root = state.rootEl;
    if (!root) return;

    var areas = {};
    state.rows.forEach(function (r) { if (r.area) areas[r.area] = 1; });
    var areaOpts = '<option value="">All areas</option>'
      + Object.keys(areas).sort().map(function (a) {
        return '<option value="' + esc(a) + '"' + (state.area === a ? " selected" : "") + ">" + esc(a) + "</option>";
      }).join("");

    var visible = state.rows.filter(matches);

    var html = '<div class="lg-wrap">';
    html += '<div class="lg-bar">'
      + '<select class="lg-sel" id="lgArea">' + areaOpts + '</select>'
      + '<input type="search" class="lg-search" id="lgSearch" placeholder="Search who, record, change…" value="' + esc(state.query) + '" />'
      + '<button type="button" class="lg-btn" id="lgRefresh">Refresh</button>'
      + '</div>';

    if (state.loading) {
      html += '<p class="lg-empty">Loading activity…</p>';
    } else if (!visible.length) {
      html += '<p class="lg-empty">No changes recorded yet.</p>';
    } else {
      // Group by day (rows already newest-first).
      var groups = [];
      var byKey = {};
      visible.forEach(function (r) {
        var dt = new Date(r.occurred_at);
        var k = dayKey(dt);
        if (!byKey[k]) { byKey[k] = { label: dayLabel(dt), items: [] }; groups.push(k); }
        byKey[k].items.push(r);
      });
      groups.forEach(function (k) {
        var g = byKey[k];
        html += '<div class="lg-day"><div class="lg-day__h">' + icon("cal", 15) + esc(g.label)
          + '<span class="lg-day__count">' + g.items.length + ' change' + (g.items.length === 1 ? "" : "s") + '</span></div>';
        html += '<div class="lg-list">';
        g.items.forEach(function (r) {
          var dt = new Date(r.occurred_at);
          var chipCls = r.area === "Staff & HR" ? "lg-chip lg-chip--hr" : "lg-chip";
          html += '<div class="lg-item">'
            + '<div class="lg-time">' + icon("clock", 14) + esc(timeLabel(dt)) + '</div>'
            + '<div class="lg-who">' + icon("user", 13) + ' <b style="display:inline">' + esc(r.actor_name || "Unknown") + '</b>'
            + (r.actor_role ? '<span> · ' + esc(r.actor_role) + '</span>' : "") + '</div>'
            + '<div class="lg-what"><span class="' + chipCls + '">' + esc(r.area || "General") + '</span>'
            + (r.entity ? '<span class="lg-entity">' + esc(r.entity) + '</span>' : "")
            + '<span class="lg-sum">' + esc(r.summary || (r.action || "changed")) + '</span></div>'
            + '</div>';
        });
        html += '</div></div>';
      });
    }
    html += "</div>";

    root.innerHTML = html;
    bind(root);
  }

  function bind(root) {
    var area = root.querySelector("#lgArea");
    if (area) area.addEventListener("change", function () { state.area = area.value; render(); });
    var s = root.querySelector("#lgSearch");
    if (s) s.addEventListener("input", function () {
      state.query = String(s.value || "").trim().toLowerCase();
      var pos = s.selectionStart;
      render();
      var s2 = state.rootEl.querySelector("#lgSearch");
      if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} }
    });
    var rf = root.querySelector("#lgRefresh");
    if (rf) rf.addEventListener("click", function () { refresh(); });
  }

  function refresh() {
    if (!global.PortalChangeLog) {
      state.rows = [];
      render();
      return;
    }
    state.loading = true;
    render();
    global.PortalChangeLog.load({ limit: 2000 }).then(function (rows) {
      state.rows = rows || [];
      state.loading = false;
      render();
    }).catch(function (err) {
      state.loading = false;
      state.rows = [];
      render();
      try { console.warn("[logs]", (err && err.message) || err); } catch (_) {}
    });
  }

  function configure(opts) {
    opts = opts || {};
    ["toast", "esc"].forEach(function (k) { if (typeof opts[k] === "function") deps[k] = opts[k]; });
  }

  function mount(rootEl) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    refresh();
  }

  global.AdminLogs = { configure: configure, mount: mount };
})(typeof window !== "undefined" ? window : globalThis);
