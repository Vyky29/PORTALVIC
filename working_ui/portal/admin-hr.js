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
    unavail: [],    // staff_unavailability rows
    activeFilter: "active", // active | inactive | all
    query: "",
  };

  function esc(s) { return deps.esc(s); }
  function labelFor(sheet) { return SHEET_LABELS[sheet] || sheet; }

  var ICONS = {
    staff: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    field: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  };
  // Per-category icon for section headers / boxes.
  var SHEET_ICONS = {
    "Employees info": "user",
    "Employee Docs": "doc",
    "Emergency Contact Info": "phone",
    "Induction & Safeguarding": "shield",
    "Shadowings & Trainings": "award",
    "Observations": "eye",
    "Paid CoursesCertificatesFirst A": "award",
    "Health Questionaire": "heart",
    "Job application": "clipboard",
    "Interviews": "chat",
  };
  function icon(name, px) {
    var p = ICONS[name] || "";
    var s = px || 18;
    return '<svg class="hr-ico" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }
  function sheetIcon(sheet, px) { return icon(SHEET_ICONS[sheet] || "field", px); }

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
      ".hr-card-h h3{margin:0;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px}",
      ".hr-card-h h3 .hr-ico{flex:0 0 auto;color:#2d84b3}",
      ".hr-ico{display:block}",
      ".hr-tbl-wrap{overflow-x:auto;min-width:0}",
      ".hr-tbl{width:100%;border-collapse:collapse;font-size:14px}",
      ".hr-tbl th,.hr-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:top;overflow-wrap:break-word;max-width:280px}",
      ".hr-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".hr-tbl tbody tr{cursor:pointer}",
      ".hr-tbl tbody tr:hover{background:#f8fafc}",
      ".hr-name{font-weight:700;color:#0f172a;white-space:nowrap}",
      ".hr-tbl--center th,.hr-tbl--center td{text-align:center;vertical-align:middle}",
      ".hr-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px}",
      ".hr-pill--on{background:#e7f6ee;color:#15803d}",
      ".hr-pill--off{background:#fef2f2;color:#b91c1c}",
      ".hr-boxes{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}",
      ".hr-box{display:flex;flex-direction:column;gap:4px;text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;font:inherit}",
      ".hr-box:hover{border-color:#2d84b3;background:#f0f7fb}",
      ".hr-box__top{display:flex;align-items:center;gap:8px}",
      ".hr-box__ico{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#eef4f9;color:#2d84b3}",
      ".hr-box b{color:#0f172a;font-size:14px;overflow-wrap:break-word}",
      ".hr-box span{color:#64748b;font-size:12px}",
      ".hr-empty{color:#64748b;padding:18px;text-align:center;font-size:14px}",
      /* Full-screen person / category */
      ".hr-screen{position:fixed;inset:0;z-index:2147483000;background:#f1f5f9;display:flex;flex-direction:column}",
      ".hr-screen__head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff;border-bottom:1px solid #e2e8f0}",
      ".hr-screen__ico{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#eff6ff;color:#2d84b3}",
      ".hr-screen__ttl{min-width:0;flex:1}",
      ".hr-screen__ttl h2{margin:0;font-size:20px;color:#0f172a;overflow-wrap:break-word}",
      ".hr-screen__ttl .hr-screen__sub{display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b;font-weight:700;margin-top:2px}",
      ".hr-screen__x{flex:0 0 auto;width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;display:grid;place-items:center}",
      ".hr-screen__x:hover{background:#f1f5f9}",
      ".hr-screen__body{flex:1 1 auto;overflow-y:auto;padding:20px;min-height:0}",
      ".hr-screen__inner{max-width:1100px;margin:0 auto}",
      ".hr-screen__foot{flex:0 0 auto;display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 20px;background:#fff;border-top:1px solid #e2e8f0}",
      ".hr-screen__foot .hr-msg{flex:1;font-size:13px;color:#64748b;margin:0}",
      /* Person card sections */
      ".hr-sec{background:#fff;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 14px;overflow:hidden}",
      ".hr-sec>summary{cursor:pointer;list-style:none;padding:13px 16px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:9px}",
      ".hr-sec>summary::-webkit-details-marker{display:none}",
      ".hr-sec>summary .hr-ico{flex:0 0 auto;color:#2d84b3}",
      ".hr-sec>summary .hr-sec__chev{margin-left:auto;color:#94a3b8;transition:transform .15s}",
      ".hr-sec[open]>summary{border-bottom:1px solid #eef2f7}",
      ".hr-sec[open]>summary .hr-sec__chev{transform:rotate(180deg)}",
      ".hr-fields{padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}",
      ".hr-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".hr-field label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".hr-field label .hr-ico{flex:0 0 auto;color:#94a3b8}",
      ".hr-field input,.hr-field textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a;width:100%}",
      ".hr-field textarea{min-height:62px;resize:vertical}",
      ".hr-toggle{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#0f172a;font-weight:700}",
      ".hr-multi{font-size:11px;color:#64748b;margin:2px 0 0}",
      /* Days off */
      ".hr-off-chip{display:inline-flex;align-items:center;gap:5px;margin-left:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#fff7ed;color:#c2410c}",
      ".hr-off-chip .hr-ico{width:12px;height:12px;color:#ea580c}",
      ".hr-off-list{padding:14px 16px;display:flex;flex-direction:column;gap:8px}",
      ".hr-off-row{display:flex;align-items:center;gap:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:9px 12px}",
      ".hr-off-row .hr-ico{flex:0 0 auto;color:#ea580c}",
      ".hr-off-row b{color:#9a3412;font-size:14px}",
      ".hr-off-row .hr-off-reason{color:#9a6a4a;font-size:12px;min-width:0;overflow-wrap:break-word}",
      ".hr-off-row .hr-off-del{margin-left:auto;flex:0 0 auto;border:1px solid #fecaca;background:#fff;color:#b91c1c;border-radius:8px;width:32px;height:32px;display:grid;place-items:center;cursor:pointer}",
      ".hr-off-row .hr-off-del:hover{background:#fef2f2}",
      ".hr-off-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:4px 16px 14px}",
      ".hr-off-add input{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#0f172a}",
      ".hr-off-add input.hr-off-reason-in{flex:1;min-width:160px}",
      ".hr-off-add .hr-off-addbtn{font:inherit;font-weight:700;font-size:13px;border:0;background:#2d84b3;color:#fff;border-radius:9px;padding:9px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}",
      ".hr-off-empty{padding:0 16px 6px;color:#64748b;font-size:13px}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminHrStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function nk(r) { return String(r.name_key || ""); }

  // ---- Days off / unavailability -------------------------------------------
  function offsFor(nameKey) {
    return (state.unavail || [])
      .filter(function (u) { return String(u.name_key || "") === String(nameKey || ""); })
      .sort(function (a, b) { return String(a.off_date).localeCompare(String(b.off_date)); });
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function upcomingOffs(nameKey) {
    var t = todayIso();
    return offsFor(nameKey).filter(function (u) { return String(u.off_date) >= t; });
  }
  function fmtDate(iso) {
    var s = String(iso || "");
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Number(m[3]) + " " + months[Number(m[2]) - 1] + " " + m[1];
  }

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

  // Read the first non-empty value among likely matrix keys (the workbook column
  // names vary), so the staff table can surface fields without a fixed schema.
  function pickData(d, keys) {
    d = d || {};
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v != null && String(v).trim() && String(v).trim() !== "-") return String(v).trim();
    }
    return "";
  }
  var STAFF_COL_KEYS = {
    services: ["Services booked for", "Services booked", "Services", "Service", "Programmes", "Programme", "Activities", "Activity"],
    venues: ["Venues", "Venue", "Sites", "Site", "Locations", "Location"],
    rota: ["Days on rota", "Days on Rota", "Rota days", "Days", "Rota", "Working days", "Days working", "Availability"]
  };

  // ---- Roster-derived schedule (from STAFF_DASHBOARD_SOURCE) ----------------
  // The HR matrix (hr_records) does not carry rota/venue/service columns, so we
  // derive Shifts / Services / Days on rota / Venues from the live roster bundle
  // and match each HR person to a roster staff by first name.
  var DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
  var ROLE_ABBR = {
    CLI: "Climbing Instructor", SWI: "Swimming Instructor", SI: "Swimming Instructor",
    SW: "Support Worker", SWL: "Lead Support Worker", SL: "Support Lead", FI: "Fitness Instructor",
  };
  function normName(v) {
    var s = String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!s) return "";
    if (s === "yousef" || s === "youssef" || s === "yusef") return "youssef";
    return s;
  }
  function firstKey(name) { return normName(String(name || "").trim().split(/\s+/)[0]); }
  function shortDay(day) { var d = String(day || "").trim(); return d ? d.slice(0, 3) : ""; }
  function normTime(label) { return String(label || "").replace(/\s*-\s*/g, " to ").replace(/\s+/g, " ").trim(); }

  // Parse a clock token ("9", "9.30", "11.45", "1pm") into minutes-from-midnight.
  // Roster labels are 12h with no am/pm, but the club day runs 7am→7pm, so:
  // 7–11 = morning, 12 = noon, 1–6 = afternoon/evening (keeps the day monotonic).
  function shiftParseClock(tok) {
    var t = String(tok == null ? "" : tok).trim().toLowerCase();
    var ap = /pm/.test(t) ? "pm" : (/am/.test(t) ? "am" : null);
    var m = t.match(/(\d{1,2})(?:[.:](\d{1,2}))?/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mn = m[2] ? parseInt(m[2], 10) : 0;
    var h24;
    if (ap === "pm") h24 = (h % 12) + 12;
    else if (ap === "am") h24 = (h % 12);
    else if (h === 12) h24 = 12;
    else if (h >= 7 && h <= 11) h24 = h;   // morning
    else h24 = h + 12;                      // 1..6 -> afternoon/evening
    return h24 * 60 + mn;
  }
  function shiftFmtClock(abs) {
    var h24 = Math.floor(abs / 60), mn = abs % 60;
    var ap = h24 >= 12 ? "pm" : "am";
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    var s = "" + h12;
    if (mn > 0) s += "." + (mn < 10 ? "0" : "") + mn;
    return s + ap;
  }
  function shiftFmtDur(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    if (m === 0) return h + "h";
    if (h === 0) return m + "m";
    return h + "h " + m + "m";
  }
  // Collapse contiguous slots ("10 to 11 / 11 to 12 / 12 to 1") into a single
  // range with a total ("10am to 1pm (3h)"). Gaps start a new range.
  function shiftCompress(labels) {
    var slots = [];
    (labels || []).forEach(function (lbl) {
      var parts = String(lbl).split(/\s+to\s+/i);
      if (parts.length < 2) return;
      var s = shiftParseClock(parts[0]);
      var e = shiftParseClock(parts[parts.length - 1]);
      if (s == null || e == null) return;
      if (e < s) e += 720; // crossed the 12h heuristic boundary
      slots.push({ s: s, e: e });
    });
    slots.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    var groups = [];
    slots.forEach(function (sl) {
      var g = groups[groups.length - 1];
      if (g && sl.s <= g.e) { if (sl.e > g.e) g.e = sl.e; }
      else groups.push({ s: sl.s, e: sl.e });
    });
    return groups.map(function (g) {
      return shiftFmtClock(g.s) + " to " + shiftFmtClock(g.e) + " (" + shiftFmtDur(g.e - g.s) + ")";
    });
  }

  function buildRosterSummary() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    var adapter = global.StaffDashboardSpreadsheetAdapter;
    if (!src || !src.staffProfiles || !adapter || typeof adapter.bootstrap !== "function") return {};
    var map = {};
    Object.keys(src.staffProfiles).forEach(function (sid) {
      if (sid === "demo") return;
      var prof = src.staffProfiles[sid] || {};
      var boot;
      try { boot = adapter.bootstrap({ source: src, staffId: sid }); } catch (_e) { return; }
      var sessions = (boot && boot.sessionsModel) || [];
      var days = [], venues = [], services = [], byDayLabels = {};
      sessions.forEach(function (s) {
        if (s.status === "closed") return;
        var day = String(s.day || "").trim();
        var ven = String(s.venue || "").trim();
        var svc = String(s.rosterService || s.activity || "").trim();
        var lbl = normTime(s.timeSlotLabel);
        if (day && days.indexOf(day) < 0) days.push(day);
        if (ven && venues.indexOf(ven) < 0) venues.push(ven);
        if (svc && services.indexOf(svc) < 0) services.push(svc);
        if (day && lbl) {
          if (!byDayLabels[day]) byDayLabels[day] = [];
          if (byDayLabels[day].indexOf(lbl) < 0) byDayLabels[day].push(lbl);
        }
      });
      if (!days.length && !venues.length && !services.length) return;
      days.sort(function (a, b) { return (DAY_ORDER[a.toLowerCase()] || 9) - (DAY_ORDER[b.toLowerCase()] || 9); });
      var shifts;
      if (days.length <= 1) {
        shifts = shiftCompress(byDayLabels[days[0]] || []).join(" / ");
      } else {
        var parts = [];
        days.forEach(function (day) {
          shiftCompress(byDayLabels[day] || []).forEach(function (g) { parts.push(g + " (" + shortDay(day) + ")"); });
        });
        shifts = parts.join(" / ");
      }
      var dd = days.length <= 1 ? days.join("") : (days.length === 2 ? days.join(" & ") : days.join(", "));
      var summary = {
        shifts: shifts,
        services: services.join(", "),
        venues: venues.join(", "),
        days: dd,
        track: prof.staffRoleTrack || "",
        primaryService: services[0] || "",
      };
      map[normName(sid)] = summary;
      if (prof.staffName) map[normName(prof.staffName)] = summary;
    });
    return map;
  }
  function rosterMap() {
    if (!state._roster || !Object.keys(state._roster).length) state._roster = buildRosterSummary();
    return state._roster;
  }
  function rosterFor(p) {
    var m = rosterMap();
    return m[firstKey(p && p.employee_name)] || m[normName(p && p.employee_name)] || null;
  }
  function roleLabel(rawRole, rsum) {
    var raw = String(rawRole || "").trim();
    if (raw) {
      var up = raw.toUpperCase();
      if (ROLE_ABBR[up]) return ROLE_ABBR[up];
      if (raw.length > 4) return raw; // already a full label
    }
    if (rsum) {
      var svc = String(rsum.primaryService || "").toLowerCase();
      if (svc.indexOf("climb") >= 0) return "Climbing Instructor";
      if (svc.indexOf("aquatic") >= 0 || svc.indexOf("swim") >= 0) return "Swimming Instructor";
      if (svc.indexOf("fit") >= 0 || svc.indexOf("gym") >= 0) return "Fitness Instructor";
      var tr = String(rsum.track || "").toLowerCase();
      if (tr === "support_lead") return "Lead Support Worker";
      if (tr === "support") return "Support Worker";
      if (tr === "swimming") return "Swimming Instructor";
      if (tr === "fitness") return "Fitness Instructor";
    }
    return raw;
  }

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
    html += '<div class="hr-card"><div class="hr-card-h"><h3>' + icon("staff", 17) + 'Staff</h3><span class="hr-multi">' + peopleRows.length + ' shown</span></div>';
    html += '<div class="hr-tbl-wrap"><table class="hr-tbl hr-tbl--center"><thead><tr><th>Name</th><th>Role</th><th>Shifts</th><th>Services booked for</th><th>Days on rota</th><th>Venues</th><th>Status</th></tr></thead><tbody>';
    if (!peopleRows.length) {
      html += '<tr><td colspan="7" class="hr-empty">No people match this filter.</td></tr>';
    } else {
      peopleRows.forEach(function (p) {
        var d = p.data || {};
        var pill = personActive(p)
          ? '<span class="hr-pill hr-pill--on">Active</span>'
          : '<span class="hr-pill hr-pill--off">Inactive</span>';
        var up = upcomingOffs(nk(p));
        var offChip = up.length
          ? '<span class="hr-off-chip" title="' + esc(up.map(function (u) { return fmtDate(u.off_date); }).join(", ")) + '">' + icon("cal", 12) + up.length + ' day' + (up.length === 1 ? "" : "s") + ' off</span>'
          : "";
        var dash = '<span class="muted">—</span>';
        var rsum = rosterFor(p);
        var role = roleLabel(d.Role || d.role || "", rsum);
        var shifts = (rsum && rsum.shifts) || String(d.Shifts || "");
        var svc = (rsum && rsum.services) || pickData(d, STAFF_COL_KEYS.services);
        var ven = (rsum && rsum.venues) || pickData(d, STAFF_COL_KEYS.venues);
        var rota = (rsum && rsum.days) || pickData(d, STAFF_COL_KEYS.rota);
        html += '<tr data-hr-person="' + esc(nk(p)) + '">'
          + '<td class="hr-name">' + esc(p.employee_name || "—") + '</td>'
          + '<td>' + (esc(role) || dash) + '</td>'
          + '<td>' + (esc(shifts) || dash) + '</td>'
          + '<td>' + (esc(svc) || dash) + '</td>'
          + '<td>' + (esc(rota) || dash) + '</td>'
          + '<td>' + (esc(ven) || dash) + '</td>'
          + '<td>' + pill + offChip + '</td></tr>';
      });
    }
    html += '</tbody></table></div></div>';

    // Category boxes
    html += '<div class="hr-card"><div class="hr-card-h"><h3>' + icon("grid", 17) + 'Categories</h3></div><div style="padding:14px"><div class="hr-boxes">';
    CATEGORY_ORDER.forEach(function (sheet) {
      var present = state.rows.some(function (r) { return r.sheet === sheet; });
      if (!present) return;
      html += '<button type="button" class="hr-box" data-hr-cat="' + esc(sheet) + '">'
        + '<span class="hr-box__top"><span class="hr-box__ico">' + sheetIcon(sheet, 16) + '</span><b>' + esc(labelFor(sheet)) + '</b></span>'
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

  function openScreen(opts) {
    closeScreen();
    var screen = document.createElement("div");
    screen.id = "hrScreen";
    screen.className = "hr-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.innerHTML =
      '<div class="hr-screen__head">'
      + '<span class="hr-screen__ico">' + (opts.headIcon || icon("user", 22)) + '</span>'
      + '<div class="hr-screen__ttl"><h2>' + esc(opts.title || "") + '</h2>'
      + (opts.sub ? '<div class="hr-screen__sub">' + opts.sub + '</div>' : "")
      + '</div>'
      + '<button type="button" class="hr-screen__x" id="hrScreenX" aria-label="Close">' + icon("x", 20) + '</button>'
      + '</div>'
      + '<div class="hr-screen__body"><div class="hr-screen__inner">' + (opts.body || "") + '</div></div>'
      + '<div class="hr-screen__foot">' + (opts.foot || '<button type="button" class="btn btn--ghost" id="hrScreenClose">Close</button>') + '</div>';
    document.body.appendChild(screen);
    state.prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    state.escHandler = function (e) { if (e.key === "Escape") closeScreen(); };
    document.addEventListener("keydown", state.escHandler);
    var x = screen.querySelector("#hrScreenX");
    if (x) x.addEventListener("click", function () { closeScreen(); });
    var c = screen.querySelector("#hrScreenClose");
    if (c) c.addEventListener("click", function () { closeScreen(); });
    return screen;
  }

  function closeScreen() {
    if (state.escHandler) { document.removeEventListener("keydown", state.escHandler); state.escHandler = null; }
    var el = document.getElementById("hrScreen");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.documentElement.style.overflow = state.prevHtmlOverflow || "";
  }

  function openCategory(sheet) {
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
    var bodyHtml = '<p class="muted" style="margin:0 0 12px;font-size:13px">Tap a row to open and edit that person.</p>'
      + '<div class="hr-card"><div class="hr-tbl-wrap"><table class="hr-tbl"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    var screen = openScreen({
      headIcon: sheetIcon(sheet, 22),
      title: labelFor(sheet),
      sub: icon("staff", 12) + " " + rows.length + " record" + (rows.length === 1 ? "" : "s"),
      body: bodyHtml,
    });
    screen.querySelectorAll("[data-hr-person]").forEach(function (tr) {
      tr.addEventListener("click", function () { openPerson(tr.getAttribute("data-hr-person")); });
    });
  }

  function fieldInput(rowId, key, value, ico) {
    var v = value == null ? "" : String(value);
    var long = v.length > 48;
    var control = long
      ? '<textarea data-field="' + esc(key) + '">' + esc(v) + '</textarea>'
      : '<input type="text" data-field="' + esc(key) + '" value="' + esc(v) + '" />';
    var lab = icon(ico || "field", 13) + "<span>" + esc(key) + "</span>";
    return '<div class="hr-field" data-row-id="' + esc(rowId) + '"><label>' + lab + '</label>' + control + '</div>';
  }

  function openPerson(nameKey) {
    var rows = state.rows.filter(function (r) { return nk(r) === nameKey; });
    if (!rows.length) return;
    var personRow = rows.filter(function (r) { return r.sheet === PEOPLE_SHEET; })[0] || rows[0];
    var displayName = personRow.employee_name || "Person";
    var linked = personActive(personRow);
    var d0 = personRow.data || {};
    var roleStr = d0.Role || d0.role || "";

    // Order: Employee info first, then the rest by CATEGORY_ORDER, then any others.
    var order = [PEOPLE_SHEET].concat(CATEGORY_ORDER);
    rows.sort(function (a, b) {
      var ia = order.indexOf(a.sheet); var ib = order.indexOf(b.sheet);
      ia = ia < 0 ? 99 : ia; ib = ib < 0 ? 99 : ib;
      if (ia !== ib) return ia - ib;
      return (a.row_index || 0) - (b.row_index || 0);
    });

    var sections = daysOffSectionHtml(nameKey);
    rows.forEach(function (r, idx) {
      var d = r.data || {};
      var keys = Object.keys(d);
      // Ensure Employee info always exposes Role + Shifts to edit.
      if (r.sheet === PEOPLE_SHEET) {
        if (keys.indexOf("Role") < 0 && keys.indexOf("role") < 0) keys.push("Role");
        if (keys.indexOf("Shifts") < 0) keys.push("Shifts");
      }
      var secIco = SHEET_ICONS[r.sheet] || "field";
      var fields = keys.map(function (k) { return fieldInput(r.id, k, d[k], secIco); }).join("");
      if (!fields) fields = '<p class="muted" style="margin:0;font-size:13px">No fields.</p>';
      var openAttr = (r.sheet === PEOPLE_SHEET || idx === 0) ? " open" : "";
      var chev = '<svg class="hr-ico hr-sec__chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
      sections += '<details class="hr-sec"' + openAttr + ' data-sheet-row="' + esc(r.id) + '">'
        + '<summary>' + sheetIcon(r.sheet, 17) + '<span>' + esc(labelFor(r.sheet)) + '</span>' + chev + '</summary>'
        + '<div class="hr-fields">' + fields + '</div></details>';
    });

    var pill = linked
      ? '<span class="hr-pill hr-pill--on">Active</span> <span class="muted" style="font-weight:600">has a login account</span>'
      : '<span class="hr-pill hr-pill--off">Inactive</span> <span class="muted" style="font-weight:600">no login account</span>';
    var sub = (roleStr ? '<span>' + esc(roleStr) + '</span> · ' : "") + pill;

    var foot = '<p id="hrPersonMsg" class="hr-msg"></p>'
      + '<button type="button" class="btn btn--ghost" id="hrPersonCancel">Close</button>'
      + '<button type="button" class="btn btn--pri" id="hrPersonSave">Save changes</button>';

    var screen = openScreen({
      headIcon: icon("user", 22),
      title: displayName,
      sub: sub,
      body: '<div class="hr-person">' + sections + '</div>',
      foot: foot,
    });

    var cancel = screen.querySelector("#hrPersonCancel");
    if (cancel) cancel.addEventListener("click", function () { closeScreen(); });
    var saveBtn = screen.querySelector("#hrPersonSave");
    if (saveBtn) saveBtn.addEventListener("click", function () { savePerson(nameKey, screen, saveBtn); });

    bindDaysOff(screen, nameKey, displayName, personRow);
  }

  function daysOffSectionHtml(nameKey) {
    var offs = offsFor(nameKey);
    var listHtml;
    if (offs.length) {
      listHtml = '<div class="hr-off-list">' + offs.map(function (u) {
        return '<div class="hr-off-row">' + icon("cal", 16)
          + '<b>' + esc(fmtDate(u.off_date)) + '</b>'
          + (u.reason ? '<span class="hr-off-reason">' + esc(u.reason) + '</span>' : "")
          + '<button type="button" class="hr-off-del" data-off-del="' + esc(u.id) + '" title="Remove day off">' + icon("trash", 16) + '</button>'
          + '</div>';
      }).join("") + '</div>';
    } else {
      listHtml = '<p class="hr-off-empty">No days off recorded.</p>';
    }
    var addHtml = '<div class="hr-off-add">'
      + '<input type="date" id="hrOffDate" aria-label="Day off date" />'
      + '<input type="text" class="hr-off-reason-in" id="hrOffReason" placeholder="Reason (optional)" />'
      + '<button type="button" class="hr-off-addbtn" id="hrOffAdd">' + icon("plus", 14) + 'Add day off</button>'
      + '</div>';
    var chev = '<svg class="hr-ico hr-sec__chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    return '<details class="hr-sec" open data-sec="daysoff">'
      + '<summary>' + icon("cal", 17) + '<span>Days off / unavailability</span>' + chev + '</summary>'
      + listHtml + addHtml + '</details>';
  }

  function bindDaysOff(screen, nameKey, displayName, personRow) {
    var addBtn = screen.querySelector("#hrOffAdd");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var dateEl = screen.querySelector("#hrOffDate");
        var reasonEl = screen.querySelector("#hrOffReason");
        var dateStr = dateEl ? String(dateEl.value || "").trim() : "";
        var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
        addOff(nameKey, displayName, personRow, dateStr, reason, screen);
      });
    }
    screen.querySelectorAll("[data-off-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        removeOff(nameKey, displayName, b.getAttribute("data-off-del"), screen);
      });
    });
  }

  function setPersonMsg(screen, text) {
    var msg = screen && screen.querySelector("#hrPersonMsg");
    if (msg) msg.textContent = text || "";
  }

  function addOff(nameKey, displayName, personRow, dateStr, reason, screen) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { setPersonMsg(screen, "Pick a valid date for the day off."); return; }
    if (offsFor(nameKey).some(function (u) { return String(u.off_date) === dateStr; })) {
      setPersonMsg(screen, "That date is already marked as a day off."); return;
    }
    var client = deps.getClient();
    if (!client) { setPersonMsg(screen, "Supabase not connected yet — sign in as admin and retry."); return; }
    var staffId = (personRow && personRow.staff_id) || null;
    var row = { name_key: nameKey, staff_name: displayName, staff_id: staffId, off_date: dateStr, reason: reason || null };
    setPersonMsg(screen, "Saving day off…");
    client.from("staff_unavailability").insert(row).select().then(function (res) {
      if (res.error) throw res.error;
      if (!(res.data && res.data.length)) {
        setPersonMsg(screen, "Not saved: no rows were inserted. You are likely not signed in as an admin (RLS). Sign in to the admin dashboard and retry.");
        return;
      }
      state.unavail.push(res.data[0]);
      if (global.PortalChangeLog) {
        global.PortalChangeLog.record({
          area: "Staff & HR", entity: displayName, action: "create",
          summary: "Day off added: " + fmtDate(dateStr) + (reason ? " (" + reason + ")" : ""),
          details: { off_date: dateStr, reason: reason || null }, source: "staffhr",
        });
      }
      deps.toast("Day off added.");
      render();
      openPerson(nameKey);
    }).catch(function (err) {
      setPersonMsg(screen, "Could not save day off: " + ((err && err.message) || err));
    });
  }

  function removeOff(nameKey, displayName, id, screen) {
    var client = deps.getClient();
    if (!client) { setPersonMsg(screen, "Supabase not connected yet — sign in as admin and retry."); return; }
    var rec = (state.unavail || []).filter(function (u) { return String(u.id) === String(id); })[0];
    setPersonMsg(screen, "Removing…");
    client.from("staff_unavailability").delete().eq("id", id).select().then(function (res) {
      if (res.error) throw res.error;
      if (!(res.data && res.data.length)) {
        setPersonMsg(screen, "Not removed: RLS blocked the change. Sign in as an admin and retry.");
        return;
      }
      state.unavail = (state.unavail || []).filter(function (u) { return String(u.id) !== String(id); });
      if (global.PortalChangeLog && rec) {
        global.PortalChangeLog.record({
          area: "Staff & HR", entity: displayName, action: "delete",
          summary: "Day off removed: " + fmtDate(rec.off_date),
          details: { off_date: rec.off_date }, source: "staffhr",
        });
      }
      deps.toast("Day off removed.");
      render();
      openPerson(nameKey);
    }).catch(function (err) {
      setPersonMsg(screen, "Could not remove day off: " + ((err && err.message) || err));
    });
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

    var personRow = rows.filter(function (r) { return r.sheet === PEOPLE_SHEET; })[0] || rows[0];
    var displayName = (personRow && personRow.employee_name) || "Person";

    // We loaded every row, so `rows` already holds all rows for this person.
    // Active is derived from the login account, so we only persist field edits.
    // .select() confirms the write actually landed (RLS blocks return 0 rows, no error).
    var blocked = 0;
    var allChanges = [];
    var ops = rows.map(function (r) {
      var oldData = r.data || {};
      var newData = collectRowData(mr, r.id);
      if (global.PortalChangeLog) {
        var df = global.PortalChangeLog.diff(oldData, newData);
        if (df) df.changes.forEach(function (c) { allChanges.push({ field: labelFor(r.sheet) + " · " + c.field, from: c.from, to: c.to }); });
      }
      return client.from("hr_records").update({ data: newData }).eq("id", r.id).select().then(function (res) {
        if (res.error) throw res.error;
        if (!(res.data && res.data.length)) { blocked++; return; }
        r.data = newData;
      });
    });

    Promise.all(ops).then(function () {
      if (blocked) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save changes"; }
        if (msg) msg.textContent = "Not saved: no rows were updated. You are likely not signed in as an admin (RLS blocks the change). Sign in to the admin dashboard and retry.";
        return;
      }
      // Audit log: who changed what across this person's categories.
      if (global.PortalChangeLog && allChanges.length) {
        var summary = allChanges.map(function (c) {
          var from = c.from === "" ? "∅" : c.from; var to = c.to === "" ? "∅" : c.to;
          return c.field + ": " + from + " → " + to;
        }).join("; ");
        global.PortalChangeLog.record({ area: "Staff & HR", entity: displayName, action: "update", summary: summary, details: { changes: allChanges }, source: "staffhr" });
      }
      deps.toast("Saved.");
      closeScreen();
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
      return loadUnavail(client).then(function (offs) {
        state.unavail = offs || [];
        render();
      });
    }).catch(function (err) {
      rootEl.innerHTML = '<p class="hr-empty">Could not load H&amp;R: ' + esc((err && err.message) || err) + "</p>";
    });
  }

  function loadUnavail(client) {
    return client
      .from("staff_unavailability")
      .select("id, name_key, staff_name, staff_id, off_date, reason")
      .order("off_date", { ascending: true })
      .then(function (res) {
        // Table may not exist yet (migration not run) — degrade gracefully.
        if (res.error) { try { console.warn("[hr] staff_unavailability:", res.error.message); } catch (_) {} return []; }
        return res.data || [];
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
