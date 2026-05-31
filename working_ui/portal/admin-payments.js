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
    mode: "payments",     // payments | orders | participants (same data, different framing)
    statusFilter: "active", // active (re-enrolled) | all | outstanding | paid | notreenrolled
    sheetFilter: "",      // "" = all groups, else sheet name
    laFilter: "",         // "" = all LAs, else normalized LA label (Ealing, LBHF (H&F)…)
    query: "",
  };

  function esc(s) { return deps.esc(s); }
  function labelFor(sheet) { return SHEET_LABELS[sheet] || sheet; }

  var ICONS = {
    billed: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    paid: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    out: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    priv: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    fund: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 21 8 3 8"/>',
    clients: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    field: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    dots: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  };

  // Field-grouping for the detail screen: each raw spreadsheet key is sorted into
  // the first group whose pattern matches (order matters), the rest go to "Other".
  var FIELD_GROUPS = [
    { label: "Money & billing", ico: "coins", rx: /(cost|total|vat|amount|price|fee|balance|deposit|owed|\bpaid\b|invoice|charge|payment|funding|gbp|£)/i },
    { label: "Dates & period", ico: "calendar", rx: /(month|date|period|term|start|end|week|\bday\b|year|time)/i },
    { label: "Sessions & counts", ico: "list", rx: /(session|hours?|qty|quantity|count|number|ratio)/i },
    { label: "People & contact", ico: "users", rx: /(name|parent|client|carer|email|phone|contact|guardian|address)/i },
  ];

  function groupedFieldsHtml(d, skipKey) {
    var keys = Object.keys(d).filter(function (k) { return k !== skipKey; });
    if (!keys.length) return '<p class="pay-empty">No extra fields.</p>';
    var used = {};
    var html = "";
    FIELD_GROUPS.forEach(function (g) {
      var inGroup = keys.filter(function (k) { return !used[k] && g.rx.test(k); });
      if (!inGroup.length) return;
      inGroup.forEach(function (k) { used[k] = true; });
      html += '<div class="pay-subh">' + icon(g.ico, 13) + "<span>" + esc(g.label) + "</span></div>"
        + '<div class="pay-fields">'
        + inGroup.map(function (k) { return field(k, k, d[k], "data", g.ico); }).join("")
        + "</div>";
    });
    var other = keys.filter(function (k) { return !used[k]; });
    if (other.length) {
      html += '<div class="pay-subh">' + icon("dots", 13) + "<span>Other</span></div>"
        + '<div class="pay-fields">'
        + other.map(function (k) { return field(k, k, d[k], "data", "field"); }).join("")
        + "</div>";
    }
    return html;
  }
  function icon(name, px) {
    var p = ICONS[name] || "";
    var s = px || 18;
    return '<svg class="pay-ico" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

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
      ".pay-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 12px}",
      ".pay-kpi{display:flex;align-items:center;justify-content:center;gap:12px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px}",
      ".pay-kpi__ico{flex:0 0 auto;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#eff6ff;color:#2d84b3}",
      ".pay-kpi__txt{min-width:0;text-align:center}",
      ".pay-kpi b{display:block;font-size:22px;color:#0f172a}",
      ".pay-kpi span{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;font-weight:700}",
      ".pay-kpi--out b{color:#b91c1c}",
      ".pay-kpi--out .pay-kpi__ico{background:#fef2f2;color:#b91c1c}",
      ".pay-kpi--paid b{color:#15803d}",
      ".pay-kpi--paid .pay-kpi__ico{background:#e7f6ee;color:#15803d}",
      ".pay-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:0 0 14px}",
      ".pay-grp{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;min-width:0}",
      ".pay-grp__h{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 12px;min-width:0}",
      ".pay-grp__ico{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#eef2f7;color:#334155}",
      ".pay-grp--priv .pay-grp__ico{background:#eff6ff;color:#2d84b3}",
      ".pay-grp--fund .pay-grp__ico{background:#f1ecfb;color:#7c3aed}",
      ".pay-grp__head-txt{min-width:0;text-align:center}",
      ".pay-grp__t{display:block;font-size:14px;font-weight:800;color:#0f172a;overflow-wrap:break-word}",
      ".pay-grp__sub{display:block;font-size:11px;color:#94a3b8;font-weight:700}",
      ".pay-grp__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".pay-grp__stat{min-width:0;text-align:center}",
      ".pay-grp__stat span{display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;font-weight:700}",
      ".pay-grp__stat b{font-size:17px;color:#0f172a;font-variant-numeric:tabular-nums;overflow-wrap:break-word}",
      ".pay-grp__stat--paid b{color:#15803d}",
      ".pay-grp__stat--out b{color:#b91c1c}",
      ".pay-ico{display:block}",
      ".pay-card-h h3{display:flex;align-items:center;gap:8px}",
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
      ".pay-tbl th,.pay-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:center;vertical-align:middle;overflow-wrap:break-word;max-width:260px}",
      ".pay-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".pay-tbl tbody tr{cursor:pointer}",
      ".pay-tbl tbody tr:hover{background:#f8fafc}",
      ".pay-tbl td.num{text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".pay-name{font-weight:700;color:#0f172a}",
      ".pay-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}",
      ".pay-pill--paid{background:#e7f6ee;color:#15803d}",
      ".pay-pill--out{background:#fef2f2;color:#b91c1c}",
      ".pay-pill--na{background:#eef2f7;color:#475569}",
      ".pay-empty{color:#64748b;padding:18px;text-align:center;font-size:14px}",
      ".pay-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}",
      ".pay-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".pay-field label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".pay-field label .pay-ico{flex:0 0 auto;color:#94a3b8}",
      ".pay-field input,.pay-field select,.pay-field textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;width:100%}",
      ".pay-field textarea{min-height:60px;resize:vertical}",
      // Full-screen client detail
      ".pay-screen{position:fixed;inset:0;z-index:2147483000;background:#f1f5f9;display:flex;flex-direction:column}",
      ".pay-screen__head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff;border-bottom:1px solid #e2e8f0}",
      ".pay-screen__ico{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#eff6ff;color:#2d84b3}",
      ".pay-screen__ttl{min-width:0;flex:1}",
      ".pay-screen__ttl h2{margin:0;font-size:20px;color:#0f172a;overflow-wrap:break-word}",
      ".pay-screen__ttl .pay-screen__sub{font-size:13px;color:#64748b;font-weight:700}",
      ".pay-screen__x{flex:0 0 auto;width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;display:grid;place-items:center}",
      ".pay-screen__x:hover{background:#f1f5f9}",
      ".pay-screen__body{flex:1 1 auto;overflow-y:auto;padding:20px;min-height:0}",
      ".pay-screen__inner{max-width:1100px;margin:0 auto}",
      ".pay-sect{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 16px}",
      ".pay-sect__h{display:flex;align-items:center;gap:9px;margin:0 0 14px;font-size:15px;font-weight:800;color:#0f172a}",
      ".pay-sect__h .pay-ico{flex:0 0 auto;color:#2d84b3}",
      ".pay-subh{display:flex;align-items:center;gap:7px;margin:16px 0 8px;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em}",
      ".pay-subh:first-child{margin-top:0}",
      ".pay-subh .pay-ico{flex:0 0 auto;color:#94a3b8}",
      ".pay-screen__foot{flex:0 0 auto;display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;background:#fff;border-top:1px solid #e2e8f0}",
      ".pay-screen__foot .pay-msg{flex:1;align-self:center;font-size:13px;color:#64748b;margin:0}",
      "@media(max-width:560px){.pay-screen__body{padding:14px}.pay-screen__ttl h2{font-size:17px}}",
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
      if (state.laFilter && laFor(r) !== state.laFilter) return false;
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

  function termFor(r) {
    var d = r.data || {};
    var keys = ["Term", "term", "Terms"];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim() && String(v).trim() !== "-") return String(v).trim();
    }
    return "Summer term 2026";
  }

  // Local authority / funder for the row, normalized to a short label so it can
  // be its own column and a filter (Ealing, LBHF (H&F), NHS · SBS, NHS · ILA).
  // Private (parents) rows have no LA -> "".
  function laFor(r) {
    var d = r.data || {};
    var raw = String(d.Funder || "").trim();
    if (!raw) {
      var pn = String(r.parent_name || "");
      var ix = pn.indexOf("\u00b7"); // "·"
      if (ix > 0) raw = pn.slice(0, ix).trim();
    }
    if (!raw) return "";
    if (/hammersmith|h&f|lbhf/i.test(raw)) return "LBHF (H&F)";
    if (/ealing/i.test(raw)) return "Ealing";
    if (/nhs/i.test(raw) && /sbs/i.test(raw)) return "NHS \u00b7 SBS";
    if (/nhs/i.test(raw) && /ila/i.test(raw)) return "NHS \u00b7 ILA";
    if (/nhs/i.test(raw)) return "NHS";
    return raw;
  }

  // Parent / contact name only (strip the "Funder ·" prefix now shown in the LA column).
  function parentPersonFor(r) {
    var pn = String(r.parent_name || "").trim();
    var ix = pn.indexOf("\u00b7"); // "·"
    if (ix >= 0) return pn.slice(ix + 1).trim() || "—";
    return pn || "—";
  }

  function render() {
    var root = state.rootEl;
    if (!root) return;
    var scoped = baseRows();
    var visible = scoped.filter(statusMatch);

    var billed = 0, paid = 0, outstanding = 0, paidN = 0, outN = 0, naN = 0;
    // Income split by funding type: Private (parents) vs Funded (local authority).
    var grp = { PARENTS: { billed: 0, paid: 0, out: 0, n: 0 }, LA: { billed: 0, paid: 0, out: 0, n: 0 } };
    scoped.forEach(function (r) {
      var a = Number(r.amount) || 0;
      var c = category(r);
      if (c !== "notreenrolled") billed += a;
      if (c === "paid") { paid += a; paidN++; }
      else if (c === "outstanding") { outstanding += a; outN++; }
      else if (c === "notreenrolled") naN++;
      var g = grp[r.sheet];
      if (g && c !== "notreenrolled") {
        g.billed += a; g.n++;
        if (c === "paid") g.paid += a; else g.out += a;
      }
    });

    var html = '<div class="pay-wrap">';

    // KPIs
    html += '<div class="pay-kpis">'
      + kpiCard("billed", "", "Billed", money(billed))
      + kpiCard("paid", "pay-kpi--paid", "Paid", money(paid))
      + kpiCard("out", "pay-kpi--out", "Outstanding", money(outstanding))
      + '</div>';

    // Income by funding type (private parents vs funded / local authority).
    // Only on the dedicated payments screen; Participants/Orders stay leaner.
    if (state.mode === "payments") {
      html += '<div class="pay-groups">'
        + grpCard("priv", "pay-grp--priv", labelFor("PARENTS"), grp.PARENTS)
        + grpCard("fund", "pay-grp--fund", labelFor("LA"), grp.LA)
        + '</div>';
    }

    // Filter bar
    var sheetOpts = '<option value="">All groups</option>';
    SHEET_ORDER.forEach(function (s) {
      if (state.rows.some(function (r) { return r.sheet === s; })) {
        sheetOpts += '<option value="' + esc(s) + '"' + (state.sheetFilter === s ? " selected" : "") + ">" + esc(labelFor(s)) + "</option>";
      }
    });
    // LA / funder filter — distinct normalized LA labels present in the data.
    var laVals = {};
    state.rows.forEach(function (r) { var l = laFor(r); if (l) laVals[l] = 1; });
    var laList = Object.keys(laVals).sort();
    var laOpts = '<option value="">All LAs</option>';
    laList.forEach(function (l) {
      laOpts += '<option value="' + esc(l) + '"' + (state.laFilter === l ? " selected" : "") + ">" + esc(l) + "</option>";
    });

    html += '<div class="pay-bar">'
      + '<div class="pay-seg" role="group" aria-label="Status filter">'
      + seg("active", "Active (" + (paidN + outN) + ")") + seg("outstanding", "Outstanding (" + outN + ")") + seg("paid", "Paid (" + paidN + ")") + seg("notreenrolled", "Not re-enrolled (" + naN + ")") + seg("all", "All")
      + '</div>'
      + '<select class="pay-sel" id="paySheet">' + sheetOpts + '</select>'
      + (laList.length ? '<select class="pay-sel" id="payLA" aria-label="Local authority filter">' + laOpts + '</select>' : '')
      + '<input type="search" class="pay-search" id="paySearch" placeholder="Search client, parent…" value="' + esc(state.query) + '" />'
      + '</div>';

    // Table — Participants roster (aggregated) for "participants" mode, otherwise
    // one row per record (Orders / Payments). Same source, detail, edits + audit.
    if (state.mode === "participants") {
      html += participantsTableHtml(visible);
    } else {
      var cardTitle = state.mode === "orders" ? "Orders" : "Participants";
      html += '<div class="pay-card"><div class="pay-card-h"><h3>' + icon("clients", 17) + esc(cardTitle) + '</h3><span style="font-size:12px;color:#64748b">' + visible.length + ' shown</span></div>';
      html += '<div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th>' + (state.mode === "orders" ? "Participant" : "Client") + '</th><th>Group</th><th>Service</th><th>Term</th><th>LA</th><th>Parent</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>';
      if (!visible.length) {
        html += '<tr><td colspan="8" class="pay-empty">No records match this filter.</td></tr>';
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
            + "<td>" + esc(termFor(r)) + "</td>"
            + "<td>" + esc(laFor(r) || "—") + "</td>"
            + "<td>" + esc(parentPersonFor(r)) + "</td>"
            + '<td class="num">' + money(r.amount) + "</td>"
            + "<td>" + pillFor(r) + "</td></tr>";
        });
      }
      html += "</tbody></table></div></div>";
    }
    html += "</div>";

    root.innerHTML = html;
    bindRoot(root);
  }

  function seg(id, label) {
    return '<button type="button" data-pay-status="' + id + '" aria-pressed="' + (state.statusFilter === id) + '">' + label + "</button>";
  }

  // Aggregate orders into one row per participant (used by Participants view).
  function participantsTableHtml(rows) {
    var byName = {};
    var order = [];
    rows.forEach(function (r) {
      var key = String(r.client_name || "").toLowerCase().trim() || ("id:" + r.id);
      if (!byName[key]) {
        byName[key] = { name: r.client_name || "—", sheet: r.sheet, services: {}, orders: [], total: 0, anyOut: false };
        order.push(key);
      }
      var g = byName[key];
      g.orders.push(r);
      var svc = serviceFor(r);
      if (svc && svc !== "—") g.services[svc] = 1;
      g.total += Number(r.amount) || 0;
      if (category(r) === "outstanding") g.anyOut = true;
    });
    var people = order.map(function (k) { return byName[k]; }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });

    var html = '<div class="pay-card"><div class="pay-card-h"><h3>' + icon("clients", 17) + 'Participants</h3><span style="font-size:12px;color:#64748b">' + people.length + ' shown</span></div>';
    html += '<div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th>Participant</th><th>Group</th><th>Service(s)</th><th class="num">Orders</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>';
    if (!people.length) {
      html += '<tr><td colspan="6" class="pay-empty">No participants match this filter.</td></tr>';
    } else {
      people.forEach(function (g) {
        var svcList = Object.keys(g.services);
        var svcTxt = svcList.length ? svcList.join(" · ") : "—";
        var pill = g.anyOut
          ? '<span class="pay-pill pay-pill--out">Outstanding</span>'
          : '<span class="pay-pill pay-pill--paid">Paid</span>';
        // One order -> open its record directly. Several orders -> open an
        // intermediate screen listing them all, then drill into one.
        var rowAttr = g.orders.length > 1
          ? 'data-pay-orders="' + esc(g.orders.map(function (o) { return o.id; }).join(",")) + '" data-pay-pname="' + esc(g.name) + '"'
          : 'data-pay-id="' + esc(g.orders[0].id) + '"';
        html += '<tr ' + rowAttr + '>'
          + '<td class="pay-name">' + esc(g.name) + "</td>"
          + "<td>" + esc(labelFor(g.sheet)) + "</td>"
          + "<td>" + esc(svcTxt) + "</td>"
          + '<td class="num">' + g.orders.length + "</td>"
          + '<td class="num">' + money(g.total) + "</td>"
          + "<td>" + pill + "</td></tr>";
      });
    }
    html += "</tbody></table></div></div>";
    return html;
  }

  function kpiCard(ico, cls, label, value) {
    return '<div class="pay-kpi ' + cls + '">'
      + '<span class="pay-kpi__ico">' + icon(ico, 20) + '</span>'
      + '<span class="pay-kpi__txt"><span>' + esc(label) + '</span><b>' + value + '</b></span>'
      + '</div>';
  }

  function grpCard(ico, cls, title, g) {
    return '<div class="pay-grp ' + cls + '">'
      + '<div class="pay-grp__h">'
      + '<span class="pay-grp__ico">' + icon(ico, 18) + '</span>'
      + '<span class="pay-grp__head-txt">'
      + '<span class="pay-grp__t">' + esc(title) + '</span>'
      + '<span class="pay-grp__sub">' + g.n + ' client' + (g.n === 1 ? "" : "s") + ' · re-enrolled</span>'
      + '</span></div>'
      + '<div class="pay-grp__stats">'
      + '<div class="pay-grp__stat"><span>Billed</span><b>' + money(g.billed) + '</b></div>'
      + '<div class="pay-grp__stat pay-grp__stat--paid"><span>Received</span><b>' + money(g.paid) + '</b></div>'
      + '<div class="pay-grp__stat pay-grp__stat--out"><span>Outstanding</span><b>' + money(g.out) + '</b></div>'
      + '</div></div>';
  }

  function bindRoot(root) {
    root.querySelectorAll("[data-pay-status]").forEach(function (b) {
      b.addEventListener("click", function () { state.statusFilter = b.getAttribute("data-pay-status"); render(); });
    });
    var sh = root.querySelector("#paySheet");
    if (sh) sh.addEventListener("change", function () { state.sheetFilter = sh.value; render(); });
    var la = root.querySelector("#payLA");
    if (la) la.addEventListener("change", function () { state.laFilter = la.value; render(); });
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
    root.querySelectorAll("[data-pay-orders]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var ids = String(tr.getAttribute("data-pay-orders") || "").split(",").filter(Boolean);
        openParticipantOrders(tr.getAttribute("data-pay-pname"), ids);
      });
    });
  }

  // Intermediate screen: a participant's full list of orders. Tap one to open
  // its editable record (same detail + audit as everywhere else).
  function openParticipantOrders(name, ids) {
    var orders = ids
      .map(function (id) { return state.rows.filter(function (x) { return String(x.id) === String(id); })[0]; })
      .filter(Boolean);
    if (!orders.length) return;
    if (orders.length === 1) { openDetail(orders[0].id); return; }

    var rowsHtml = orders
      .slice()
      .sort(function (a, b) { return String(serviceFor(a)).localeCompare(String(serviceFor(b))); })
      .map(function (r) {
        return '<tr data-pay-open="' + esc(r.id) + '">'
          + '<td>' + esc(serviceFor(r)) + '</td>'
          + '<td>' + esc(termFor(r)) + '</td>'
          + '<td>' + esc(r.parent_name || "") + '</td>'
          + '<td class="num">' + money(r.amount) + '</td>'
          + '<td>' + pillFor(r) + '</td></tr>';
      }).join("");

    closeScreen();
    var screen = document.createElement("div");
    screen.id = "payScreen";
    screen.className = "pay-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.innerHTML =
      '<div class="pay-screen__head">'
      + '<span class="pay-screen__ico">' + icon("users", 22) + '</span>'
      + '<div class="pay-screen__ttl"><h2>' + esc(name || "Participant") + '</h2>'
      + '<span class="pay-screen__sub">' + icon("list", 12) + " " + orders.length + ' orders · ' + esc(labelFor(orders[0].sheet)) + '</span></div>'
      + '<button type="button" class="pay-screen__x" id="payClose" aria-label="Close">' + icon("x", 20) + '</button>'
      + '</div>'
      + '<div class="pay-screen__body"><div class="pay-screen__inner">'
      + '<p class="muted" style="margin:0 0 12px;font-size:13px">Tap an order to open and edit its full record.</p>'
      + '<div class="pay-card"><div class="pay-tbl-wrap"><table class="pay-tbl"><thead><tr><th>Service</th><th>Term</th><th>Parent / LA</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>'
      + rowsHtml
      + '</tbody></table></div></div>'
      + '</div></div>'
      + '<div class="pay-screen__foot"><p class="pay-msg"></p>'
      + '<button type="button" class="btn btn--ghost" id="payCancel">Close</button></div>';
    document.body.appendChild(screen);
    state.prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    state.escHandler = function (e) { if (e.key === "Escape") closeScreen(); };
    document.addEventListener("keydown", state.escHandler);

    var x = screen.querySelector("#payClose");
    if (x) x.addEventListener("click", function () { closeScreen(); });
    var c = screen.querySelector("#payCancel");
    if (c) c.addEventListener("click", function () { closeScreen(); });
    screen.querySelectorAll("[data-pay-open]").forEach(function (tr) {
      tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-pay-open")); });
    });
  }

  function field(name, label, value, type, ico) {
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
    var lab = (ico ? icon(ico, 13) : icon("field", 13)) + "<span>" + esc(label) + "</span>";
    return '<div class="pay-field"><label>' + lab + "</label>" + control + "</div>";
  }

  function closeScreen() {
    if (state.escHandler) { document.removeEventListener("keydown", state.escHandler); state.escHandler = null; }
    var el = document.getElementById("payScreen");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.documentElement.style.overflow = state.prevHtmlOverflow || "";
  }

  function openDetail(id) {
    var r = state.rows.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return;
    var d = r.data || {};

    // Resolve which data key actually holds the booked service, so editing
    // writes back to the right key (avoids creating a duplicate "Services").
    var svcKey = ["Services", "Service", "Programme", "Programmes", "Activity"].filter(function (k) {
      return d[k] != null && String(d[k]).trim();
    })[0] || "Services";

    var top = '<div class="pay-fields">'
      + field("client_name", "Client name", r.client_name, "prop", "user")
      + field("parent_name", "Parent / LA", r.parent_name, "prop", "users")
      + field(svcKey, "Service", d[svcKey] || "", "data", "tag")
      + field(null, "Status", r.payment_status, "status", "flag")
      + field(null, "Total (£)", r.amount, "amount", "coins")
      + "</div>";

    // Service is shown prominently above, so skip its key here; the rest are
    // grouped by type (money, dates, sessions, people, other) for readability.
    var dataFields = groupedFieldsHtml(d, svcKey);

    closeScreen();
    var screen = document.createElement("div");
    screen.id = "payScreen";
    screen.className = "pay-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.innerHTML =
      '<div class="pay-screen__head">'
      + '<span class="pay-screen__ico">' + icon("user", 22) + '</span>'
      + '<div class="pay-screen__ttl"><h2>' + esc(r.client_name || "Client") + '</h2>'
      + '<span class="pay-screen__sub">' + icon("fund", 12) + " " + esc(labelFor(r.sheet)) + '</span></div>'
      + '<button type="button" class="pay-screen__x" id="payClose" aria-label="Close">' + icon("x", 20) + '</button>'
      + '</div>'
      + '<div class="pay-screen__body"><div class="pay-screen__inner">'
      + '<section class="pay-sect"><div class="pay-sect__h">' + icon("clients", 17) + 'Key details</div>' + top + '</section>'
      + '<section class="pay-sect"><div class="pay-sect__h">' + icon("list", 17) + 'All spreadsheet fields</div>'
      + dataFields + '</section>'
      + '</div></div>'
      + '<div class="pay-screen__foot">'
      + '<p id="payMsg" class="pay-msg"></p>'
      + '<button type="button" class="btn btn--ghost" id="payCancel">Close</button>'
      + '<button type="button" class="btn btn--pri" id="paySave">Save changes</button>'
      + '</div>';
    document.body.appendChild(screen);
    state.prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    state.escHandler = function (e) { if (e.key === "Escape") closeScreen(); };
    document.addEventListener("keydown", state.escHandler);

    var mr = screen;
    var closeX = mr.querySelector("#payClose");
    if (closeX) closeX.addEventListener("click", function () { closeScreen(); });
    var cancel = mr.querySelector("#payCancel");
    if (cancel) cancel.addEventListener("click", function () { closeScreen(); });
    var save = mr.querySelector("#paySave");
    if (save) save.addEventListener("click", function () { saveDetail(r, mr, save); });
  }

  function saveDetail(r, mr, saveBtn) {
    var client = deps.getClient();
    var msg = mr.querySelector("#payMsg");
    if (!client) { if (msg) msg.textContent = "Supabase not connected yet — sign in as admin and retry."; return; }

    // Snapshot before the write so we can log a readable diff afterwards.
    var logLabels = { client_name: "Client name", parent_name: "Parent / LA", payment_status: "Status", amount: "Total (£)" };
    var oldFlat = Object.assign({ client_name: r.client_name, parent_name: r.parent_name, payment_status: r.payment_status, amount: r.amount }, r.data || {});

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

    // .select() returns the row(s) actually written. If RLS / the current session
    // blocks the update, Supabase reports NO error but writes 0 rows — so we must
    // check the returned rows rather than trusting a missing error.
    client.from("client_payments").update(patch).eq("id", r.id).select().then(function (res) {
      if (res.error) throw res.error;
      var saved = (res.data && res.data.length) ? res.data[0] : null;
      if (!saved) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
        if (msg) msg.textContent = "Not saved: no row was updated. You are likely not signed in as an admin (RLS blocks the change). Sign in to the admin dashboard and retry.";
        return;
      }
      // Audit log: record who changed what (readable field diff).
      if (global.PortalChangeLog) {
        var newFlat = Object.assign({ client_name: saved.client_name, parent_name: saved.parent_name, payment_status: saved.payment_status, amount: saved.amount }, saved.data || {});
        var df = global.PortalChangeLog.diff(oldFlat, newFlat, logLabels);
        if (df) global.PortalChangeLog.record({ area: "Payments", entity: saved.client_name || r.client_name, action: "update", summary: df.summary, details: { changes: df.changes, group: labelFor(r.sheet) }, source: "reenrol_payments" });
      }
      // Sync the in-memory row with exactly what the database stored.
      Object.keys(saved).forEach(function (k) { r[k] = saved[k]; });
      deps.toast("Saved.");
      // Let other views (Orders/Participants catalogues fed from client_payments)
      // refresh their money columns after an edit.
      try {
        if (global.dispatchEvent && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("portal:payments-updated", { detail: { id: saved.id } }));
        }
      } catch (_e) {}
      closeScreen();
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

  function mount(rootEl, opts) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    // mode: "payments" (default) | "orders" | "participants" — same data, same
    // detail/edit/audit; only the framing of the list differs per related view.
    state.mode = (opts && opts.mode) || "payments";
    rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Loading…</p>';

    var client = deps.getClient();
    if (!client) {
      rootEl.innerHTML = '<p class="muted" style="padding:8px 0">Connecting to Supabase… open this view again in a moment.</p>';
      global.addEventListener && global.addEventListener("portal:supabase-ready", function () {
        if (state.rootEl === rootEl) mount(rootEl, { mode: state.mode });
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

  // Ensure rows are in memory (load once if needed), then run cb(true|false).
  function ensureLoaded(cb) {
    if (state.rows && state.rows.length) { cb(true); return; }
    var client = deps.getClient();
    if (!client) { cb(false); return; }
    loadAll(client).then(function (rows) { state.rows = rows; cb(true); }).catch(function () { cb(false); });
  }

  // Open the editable full-screen record for a single client_payments id.
  // Inject the screen CSS first: when called from the Orders catalogue the
  // module may not have been mounted yet, so the .pay-screen styles (position
  // fixed + z-index) would otherwise be missing and the overlay renders behind.
  function openRecord(id) {
    injectStyleOnce();
    ensureLoaded(function (ok) { if (ok) openDetail(id); });
  }

  // Open one editable record (1 id) or the intermediate list (several ids) for
  // a participant/family — used by the Orders catalogue "Edit" action.
  function openRecords(name, ids) {
    injectStyleOnce();
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    ensureLoaded(function (ok) {
      if (!ok) return;
      if (ids.length === 1) openDetail(ids[0]);
      else openParticipantOrders(name || "Orders", ids);
    });
  }

  global.AdminPayments = { configure: configure, mount: mount, openRecord: openRecord, openRecords: openRecords };
})(typeof window !== "undefined" ? window : globalThis);
