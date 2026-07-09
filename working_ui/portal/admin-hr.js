/**
 * Admin HR module — live, editable Staff & HR powered by public.hr_records.
 *
 * Mounted from admin_dashboard.html into the "Staff & HR" view. Reads/writes the
 * Portal Supabase project with the signed-in admin/CEO JWT (RLS: hr_records_admin_all).
 *
 * UX:
 *  - Filter every category by Active (default) / All / Inactive + free-text search.
 *  - Staff first: people table, then category boxes nested under Staff (open one
 *    category individually, or browse the group). Then annual profile + L&D cards.
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

  var ANNUAL_PROFILE_CAMPAIGN_START_MS = Date.parse("2026-07-03T00:00:00Z");

  var state = {
    rootEl: null,
    rows: [],
    people: [],
    linkedKeys: {}, // name_key -> true when the person has a login account
    unavail: [],    // staff_unavailability rows
    profileConfirmRows: [], // staff_profiles with profile_last_confirmed_at
    ldFundingApps: [],
    ldFundingFilter: "pending",
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
      ".hr-staff-cats{padding:14px 16px 16px;border-top:1px solid #eef2f7;min-width:0}",
      ".hr-staff-cats__head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;min-width:0}",
      ".hr-staff-cats__title{margin:0;font-size:13px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:break-word}",
      ".hr-staff-cats__title .hr-ico{flex:0 0 auto;color:#2d84b3}",
      ".hr-staff-cats__hint{margin:0;font-size:12px;color:#64748b;min-width:0;overflow-wrap:break-word}",
      ".hr-ico{display:block}",
      ".hr-tbl-wrap{overflow-x:auto;min-width:0}",
      ".hr-tbl{width:100%;border-collapse:collapse;font-size:14px}",
      ".hr-tbl th,.hr-tbl td{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:top;overflow-wrap:break-word;max-width:280px}",
      ".hr-tbl thead th{background:#f8fafc;color:#0f172a;font-size:11px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}",
      ".hr-tbl tbody tr{cursor:pointer}",
      ".hr-tbl tbody tr:hover{background:#f8fafc}",
      ".hr-name{font-weight:700;color:#0f172a;white-space:nowrap;display:flex;align-items:center;gap:8px;min-width:0}",
      ".hr-name__text{min-width:0;overflow:hidden;text-overflow:ellipsis}",
      ".hr-name .portal-roster-avatar--staff{width:32px;height:32px;border-radius:10px;font-size:11px;flex:0 0 auto}",
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
      ".hr-contract-list{padding:14px 16px;display:flex;flex-direction:column;gap:8px}",
      ".hr-contract-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;background:#f0f7fb;border:1px solid #bae6fd;border-radius:10px;padding:10px 12px}",
      ".hr-contract-row b{color:#0c4a6e;font-size:14px}",
      ".hr-contract-row .hr-contract-meta{color:#64748b;font-size:12px}",
      ".hr-contract-row .hr-contract-pdf{margin-left:auto;font:inherit;font-weight:700;font-size:12px;border:1px solid #2d84b3;background:#fff;color:#2d84b3;border-radius:8px;padding:6px 12px;cursor:pointer}",
      ".hr-contract-row .hr-contract-pdf:hover{background:#eff6ff}",
      ".hr-contract-empty{padding:0 16px 6px;color:#64748b;font-size:13px}",
      ".hr-contract-loading{padding:0 16px 6px;color:#64748b;font-size:13px}",
      ".hr-card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0}",
      ".hr-card-h .btn--sm{font:inherit;font-size:12px;font-weight:700;padding:7px 12px;border-radius:9px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a}",
      ".hr-card-h .btn--sm:hover{background:#f8fafc;border-color:#2d84b3;color:#2d84b3}",
      ".hr-tbl .btn--sm{font:inherit;font-size:12px;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a;white-space:nowrap}",
      ".hr-tbl .btn--sm:hover{background:#f0f7fb;border-color:#2d84b3;color:#2d84b3}",
      ".hr-tbl tbody tr[data-hr-profile-row]{cursor:default}",
      ".hr-tbl tbody tr[data-hr-profile-row]:hover{background:#fff}",
      ".hr-profile-kv{display:grid;gap:12px;margin:0}",
      ".hr-profile-kv__block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;min-width:0}",
      ".hr-profile-kv__block h4{margin:0 0 8px;font-size:13px;color:#0f172a;display:flex;align-items:center;gap:8px}",
      ".hr-profile-kv__row{display:grid;gap:4px;margin:0 0 10px}",
      ".hr-profile-kv__row:last-child{margin-bottom:0}",
      ".hr-profile-kv__label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em}",
      ".hr-profile-kv__value{margin:0;font-size:14px;line-height:1.45;color:#0f172a;overflow-wrap:break-word;white-space:pre-wrap}",
      ".hr-profile-kv__value--muted{color:#64748b}",
      ".hr-profile-avail-pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#eff6ff;color:#1d4ed8}",
      ".hr-profile-avail-pill--reduce{background:#fff7ed;color:#c2410c}",
      ".hr-profile-avail-pill--increase{background:#ecfdf5;color:#047857}",
      ".hr-profile-avail-pill--unsure{background:#f5f3ff;color:#6d28d9}",
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

  function hrStaffAvatarHtml(person) {
    if (typeof global.portalStaffAvatarInnerHtml !== "function") return "";
    var name = person && (person.employee_name || person.staff_name) ? String(person.employee_name || person.staff_name).trim() : "";
    var key = person && person.staff_id ? String(person.staff_id).trim() : firstKey(name);
    return global.portalStaffAvatarInnerHtml(key || name, {
      esc: esc,
      displayName: name,
      className: "portal-roster-avatar portal-roster-avatar--staff",
    });
  }

  function hrNameCell(person) {
    var label = esc((person && person.employee_name) || "—");
    var av = hrStaffAvatarHtml(person);
    if (!av) return '<td class="hr-name">' + label + "</td>";
    return '<td class="hr-name">' + av + '<span class="hr-name__text">' + label + "</span></td>";
  }

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

  function annualProfileComplete(iso) {
    if (!iso) return false;
    try {
      var t = Date.parse(String(iso));
      return !isNaN(t) && t >= ANNUAL_PROFILE_CAMPAIGN_START_MS;
    } catch (_) {
      return false;
    }
  }

  function fmtDateTime(iso) {
    var s = String(iso || "");
    if (!s) return "";
    try {
      var d = new Date(s);
      if (isNaN(d.getTime())) return s.slice(0, 10);
      return d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      });
    } catch (_) {
      return s.slice(0, 16).replace("T", " ");
    }
  }

  function profileRowById(staffId) {
    var id = String(staffId || "");
    if (!id) return null;
    var rows = state.profileConfirmRows || [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id || "") === id) return rows[i];
    }
    return null;
  }

  function availabilityStatusLabel(code) {
    var k = String(code || "").trim().toLowerCase();
    if (k === "continue") return "Continue current availability";
    if (k === "reduce") return "Reduce availability";
    if (k === "increase") return "Increase availability";
    if (k === "unsure") return "Unsure / needs discussion";
    return "";
  }

  function availabilityStatusPill(code) {
    var label = availabilityStatusLabel(code);
    if (!label) return '<span class="muted">—</span>';
    var k = String(code || "").trim().toLowerCase();
    var cls = "hr-profile-avail-pill";
    if (k === "reduce") cls += " hr-profile-avail-pill--reduce";
    else if (k === "increase") cls += " hr-profile-avail-pill--increase";
    else if (k === "unsure") cls += " hr-profile-avail-pill--unsure";
    return '<span class="' + cls + '">' + esc(label) + "</span>";
  }

  function availabilitySummaryText(r) {
    if (!r) return "";
    return String(r.availability_summary || r.availability_changes || "").trim();
  }

  function otherWorkStatusLabel(code) {
    var k = String(code || "").trim().toLowerCase();
    if (k === "only_clubsensational") return "Only ClubSENsational";
    if (k === "also_other") return "Also other organisations";
    return String(code || "").trim();
  }

  function profileHasAvailabilityResponse(r) {
    if (!r) return false;
    return !!(
      String(r.availability_status || "").trim() ||
      availabilitySummaryText(r) ||
      String(r.other_work_status || "").trim() ||
      String(r.wellbeing_notes || "").trim()
    );
  }

  function profileResponseBlock(title, ico, rowsHtml) {
    return '<section class="hr-profile-kv__block"><h4>' + icon(ico || "field", 16) + esc(title) + '</h4>' + rowsHtml + "</section>";
  }

  function profileKvRow(label, value, emptyText) {
    var v = String(value == null ? "" : value).trim();
    var show = v || emptyText || "—";
    var muted = !v && emptyText;
    return '<div class="hr-profile-kv__row"><div class="hr-profile-kv__label">' + esc(label)
      + '</div><p class="hr-profile-kv__value' + (muted ? " hr-profile-kv__value--muted" : "") + '">' + esc(show) + "</p></div>";
  }

  function annualProfileHasSavedResponses(r) {
    if (!r) return false;
    return Boolean(
      String(r.availability_status || "").trim()
        || String(r.availability_summary || r.availability_changes || "").trim()
        || String(r.other_work_status || "").trim()
        || String(r.wellbeing_notes || "").trim(),
    );
  }

  function annualProfileResponseBody(r) {
    if (!r) return '<p class="hr-empty">Profile not found.</p>';
    var complete = annualProfileComplete(r.profile_last_confirmed_at);
    var meta = profileKvRow(
      "Check-in status",
      complete ? "Done — " + fmtDateTime(r.profile_last_confirmed_at) : "Pending — not confirmed since 3 Jul 2026 fix",
    );
    if (r.profile_last_updated_at && r.profile_last_updated_at !== r.profile_last_confirmed_at) {
      meta += profileKvRow("Last updated", fmtDateTime(r.profile_last_updated_at));
    }
    if (complete && !annualProfileHasSavedResponses(r)) {
      meta += '<p class="hr-profile-kv__warn" style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:13px;line-height:1.45;overflow-wrap:break-word">'
        + "Marked Done but no availability answers were saved. Ask them to open <strong>Annual profile</strong> again and resubmit — a form bug previously allowed confirm without saving."
        + "</p>";
    }
    var avail = profileResponseBlock(
      "Availability",
      "cal",
      profileKvRow("Choice", availabilityStatusLabel(r.availability_status), "No choice recorded yet")
        + profileKvRow("Notes / requested changes", availabilitySummaryText(r), "No notes left"),
    );
    var other = profileResponseBlock(
      "Other work",
      "field",
      profileKvRow("Status", otherWorkStatusLabel(r.other_work_status), "Not answered")
        + profileKvRow("Organisation", r.other_work_organisation, "—")
        + profileKvRow("Schedule", r.other_work_schedule, "—")
        + profileKvRow(
          "Affects ClubSENsational availability",
          r.other_work_affects_availability == null
            ? ""
            : (r.other_work_affects_availability ? "Yes — please review my availability" : "No — current shifts still work"),
          "Not answered",
        ),
    );
    var wellbeing = profileResponseBlock(
      "Wellbeing notes",
      "heart",
      profileKvRow("Notes", r.wellbeing_notes, "None"),
    );
    return '<div class="hr-profile-kv">' + meta + avail + other + wellbeing + "</div>";
  }

  function openAnnualProfileResponse(staffId) {
    var r = profileRowById(staffId);
    if (!r) return;
    var name = String(r.full_name || r.username || "Staff").trim() || "Staff";
    var sub = availabilityStatusPill(r.availability_status);
    if (annualProfileComplete(r.profile_last_confirmed_at)) {
      sub += ' <span class="hr-pill hr-pill--on">Done</span>';
    } else {
      sub += ' <span class="hr-pill hr-pill--off">Pending</span>';
    }
    openScreen({
      headIcon: icon("clipboard", 22),
      title: name,
      sub: sub,
      body: annualProfileResponseBody(r),
      foot: '<button type="button" class="btn btn--ghost" id="hrScreenClose">Close</button>',
    });
  }

  function openAnnualProfileResponsesOverview() {
    var rows = (state.profileConfirmRows || []).slice().sort(function (a, b) {
      return String(a.full_name || a.username || "").localeCompare(String(b.full_name || b.username || ""));
    });
    var q = String(state.query || "").trim().toLowerCase();
    var shown = rows.filter(function (r) {
      if (!q) return true;
      var hay = [r.full_name, r.username, availabilityStatusLabel(r.availability_status), availabilitySummaryText(r)]
        .map(function (x) { return String(x || "").toLowerCase(); })
        .join(" ");
      return hay.indexOf(q) >= 0;
    });
    var body = '<p class="muted" style="margin:0 0 12px;font-size:13px;overflow-wrap:break-word">Responses from the annual profile form (staff_profile_update). Tap <strong>View</strong> for full notes, other work and wellbeing.</p>';
    body += '<div class="hr-tbl-wrap"><table class="hr-tbl hr-tbl--center"><thead><tr>'
      + "<th>Name</th><th>Availability</th><th>Notes (preview)</th><th>Status</th><th></th></tr></thead><tbody>";
    if (!shown.length) {
      body += '<tr><td colspan="5" class="hr-empty">No portal accounts match this filter.</td></tr>';
    } else {
      shown.forEach(function (r) {
        var name = String(r.full_name || r.username || "—").trim() || "—";
        var notes = availabilitySummaryText(r);
        if (notes.length > 90) notes = notes.slice(0, 87) + "…";
        var complete = annualProfileComplete(r.profile_last_confirmed_at);
        var pill = complete
          ? '<span class="hr-pill hr-pill--on">Done</span>'
          : '<span class="hr-pill hr-pill--off">Pending</span>';
        var availCell = profileHasAvailabilityResponse(r)
          ? availabilityStatusPill(r.availability_status)
          : '<span class="muted">Not submitted</span>';
        body += '<tr data-hr-profile-row="1"><td class="hr-name">' + esc(name) + "</td><td>" + availCell + "</td><td>"
          + esc(notes || "—") + "</td><td>" + pill
          + '</td><td><button type="button" class="btn btn--sm" data-hr-profile-view="' + esc(String(r.id || "")) + '">View</button></td></tr>';
      });
    }
    body += "</tbody></table></div>";
    var screen = openScreen({
      headIcon: icon("clipboard", 22),
      title: "Availability responses (2026)",
      sub: '<span>' + shown.filter(profileHasAvailabilityResponse).length + " with answers · " + shown.length + " accounts</span>",
      body: body,
      foot: '<button type="button" class="btn btn--ghost" id="hrScreenClose">Close</button>',
    });
    screen.querySelectorAll("[data-hr-profile-view]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openAnnualProfileResponse(btn.getAttribute("data-hr-profile-view"));
      });
    });
  }

  function renderAnnualProfileCard() {
    var rows = (state.profileConfirmRows || []).slice().sort(function (a, b) {
      return String(a.full_name || a.username || "").localeCompare(String(b.full_name || b.username || ""));
    });
    var done = 0;
    var pending = 0;
    rows.forEach(function (r) {
      if (annualProfileComplete(r.profile_last_confirmed_at)) done++;
      else pending++;
    });
    var q = String(state.query || "").trim().toLowerCase();
    var shown = rows.filter(function (r) {
      if (!q) return true;
      var hay = [r.full_name, r.username].map(function (x) { return String(x || "").toLowerCase(); }).join(" ");
      return hay.indexOf(q) >= 0;
    });
    var html = '<div class="hr-card"><div class="hr-card-h"><h3>' + icon("clipboard", 17) + 'Annual profile check-in (2026)</h3>'
      + '<div class="hr-card-actions"><button type="button" class="btn btn--sm" id="hrProfileViewAll">Availability responses</button>'
      + '<span class="hr-multi">' + done + ' done · ' + pending + ' pending</span></div></div>';
    html += '<div class="hr-tbl-wrap"><table class="hr-tbl hr-tbl--center"><thead><tr>'
      + '<th>Name</th><th>Portal login</th><th>Availability</th><th>Last confirmed</th><th>Status</th><th></th></tr></thead><tbody>';
    if (!shown.length) {
      html += '<tr><td colspan="6" class="hr-empty">No active portal accounts match this filter.</td></tr>';
    } else {
      shown.forEach(function (r) {
        var name = String(r.full_name || r.username || "—").trim() || "—";
        var login = String(r.username || "—").trim() || "—";
        var complete = annualProfileComplete(r.profile_last_confirmed_at);
        var when = complete ? fmtDateTime(r.profile_last_confirmed_at) : "—";
        var pill = complete
          ? '<span class="hr-pill hr-pill--on">Done</span>'
          : '<span class="hr-pill hr-pill--off">Pending</span>';
        var availCell = profileHasAvailabilityResponse(r)
          ? availabilityStatusPill(r.availability_status)
          : '<span class="muted">—</span>';
        html += '<tr data-hr-profile-row="1"><td class="hr-name">' + esc(name) + '</td><td>' + esc(login) + '</td><td>'
          + availCell + '</td><td>' + esc(when) + '</td><td>' + pill
          + '</td><td><button type="button" class="btn btn--sm" data-hr-profile-view="' + esc(String(r.id || "")) + '">View</button></td></tr>';
      });
    }
    html += '</tbody></table></div></div>';
    return html;
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

    // Staff first (people + nested category boxes), then annual profile / L&D.
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
          + hrNameCell(p)
          + '<td>' + (esc(role) || dash) + '</td>'
          + '<td>' + (esc(shifts) || dash) + '</td>'
          + '<td>' + (esc(svc) || dash) + '</td>'
          + '<td>' + (esc(rota) || dash) + '</td>'
          + '<td>' + (esc(ven) || dash) + '</td>'
          + '<td>' + pill + offChip + '</td></tr>';
      });
    }
    html += '</tbody></table></div>';

    // Categories live under Staff: open one box for an individual sheet, or use the group.
    html += '<div class="hr-staff-cats">'
      + '<div class="hr-staff-cats__head">'
      + '<h4 class="hr-staff-cats__title">' + icon("grid", 15) + 'Categories</h4>'
      + '<p class="hr-staff-cats__hint">Open one category, or browse the group below</p>'
      + '</div><div class="hr-boxes">';
    CATEGORY_ORDER.forEach(function (sheet) {
      var present = state.rows.some(function (r) { return r.sheet === sheet; });
      if (!present) return;
      html += '<button type="button" class="hr-box" data-hr-cat="' + esc(sheet) + '">'
        + '<span class="hr-box__top"><span class="hr-box__ico">' + sheetIcon(sheet, 16) + '</span><b>' + esc(labelFor(sheet)) + '</b></span>'
        + '<span>' + categoryCount(sheet) + ' record' + (categoryCount(sheet) === 1 ? "" : "s") + '</span>'
        + '</button>';
    });
    html += '</div></div></div>';

    html += renderAnnualProfileCard();
    if (global.AdminLDFundingReview && typeof global.AdminLDFundingReview.renderCard === "function") {
      html += global.AdminLDFundingReview.renderCard(state.ldFundingApps, state.ldFundingFilter);
    }
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
    var viewAll = root.querySelector("#hrProfileViewAll");
    if (viewAll) viewAll.addEventListener("click", openAnnualProfileResponsesOverview);
    root.querySelectorAll("[data-hr-profile-view]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openAnnualProfileResponse(btn.getAttribute("data-hr-profile-view"));
      });
    });
    if (global.AdminLDFundingReview && typeof global.AdminLDFundingReview.bindCard === "function") {
      global.AdminLDFundingReview.bindCard(root, state.ldFundingApps, {
        client: deps.getClient(),
        filter: state.ldFundingFilter,
        onFilterChange: function (f) {
          state.ldFundingFilter = f || "pending";
          render();
        },
        onSaved: function () {
          reloadLdFundingApps(deps.getClient());
        },
      });
    }
  }

  function reloadLdFundingApps(client) {
    if (!client || !global.AdminLDFundingReview) return Promise.resolve();
    return global.AdminLDFundingReview.loadApplications(client)
      .then(function (apps) {
        state.ldFundingApps = apps || [];
        render();
      })
      .catch(function (err) {
        try {
          console.warn("[hr] ld funding load", err);
        } catch (_) {}
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
        body += '<tr data-hr-person="' + esc(nk(r)) + '">' + hrNameCell(r);
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
    sections += employmentContractsSectionHtml();
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
      headIcon: hrStaffAvatarHtml(personRow) || icon("user", 22),
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
    bindEmploymentContracts(screen, personRow);
  }

  function employmentContractsSectionHtml() {
    var chev = '<svg class="hr-ico hr-sec__chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    return '<details class="hr-sec" open data-sec="employment-contracts">'
      + '<summary>' + icon("doc", 17) + '<span>Employment contracts (Portal)</span>' + chev + '</summary>'
      + '<p class="hr-contract-loading" id="hrContractLoadMsg">Loading signed contracts…</p>'
      + '<div class="hr-contract-list" id="hrContractList" hidden></div></details>';
  }

  function hrSupabaseUrl() {
    var u = typeof global.SUPABASE_URL === "string" ? global.SUPABASE_URL.trim() : "";
    return u || "https://cklpnwhlqsulpmkipmqb.supabase.co";
  }

  function hrAdminAccessToken() {
    var box = global.__PORTAL_SUPABASE__ || {};
    if (box.session && box.session.access_token) return Promise.resolve(box.session.access_token);
    var client = deps.getClient();
    if (!client || !client.auth) return Promise.resolve("");
    return client.auth.getSession().then(function (res) {
      var s = res && res.data && res.data.session;
      return s && s.access_token ? s.access_token : "";
    });
  }

  function hrAdminSignedDocumentUrl(filePath) {
    var path = String(filePath || "").trim().replace(/^\/+/, "");
    if (!path) return Promise.resolve(null);
    return hrAdminAccessToken().then(function (token) {
      if (!token) return null;
      return fetch(hrSupabaseUrl() + "/functions/v1/portal-admin-hr-file-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ path: path, bucket: "documents", source: "portal" })
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body && body.signed_url) return body.signed_url;
          if (body && body.data && body.data.signed_url) return body.data.signed_url;
          return null;
        })
        .catch(function () { return null; });
    });
  }

  function contractStatusLabel(status) {
    var s = String(status || "").toLowerCase();
    if (s === "completed") return "Signed";
    if (s === "awaiting_employee") return "Awaiting signature";
    if (s === "expired") return "Expired";
    return status || "Unknown";
  }

  function loadPersonEmploymentContracts(staffId, screen) {
    var listEl = screen && screen.querySelector("#hrContractList");
    var msgEl = screen && screen.querySelector("#hrContractLoadMsg");
    if (!listEl) return;
    var uid = staffId ? String(staffId).trim() : "";
    if (!uid) {
      if (msgEl) msgEl.textContent = "No portal login linked — employment contracts appear here once the person has a staff account.";
      return;
    }
    var client = deps.getClient();
    if (!client) {
      if (msgEl) msgEl.textContent = "Could not load contracts (not signed in).";
      return;
    }
    client
      .from("employment_contracts")
      .select("id, contract_reference, status, role, completed_at, employee_signed_at, document_id, documents(file_url, title)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) {
          if (msgEl) msgEl.textContent = "Could not load contracts: " + (res.error.message || res.error);
          return;
        }
        var rows = res.data || [];
        if (msgEl) msgEl.hidden = true;
        if (!rows.length) {
          listEl.hidden = true;
          if (msgEl) {
            msgEl.hidden = false;
            msgEl.textContent = "No employment contracts sent via the Portal yet.";
          }
          return;
        }
        listEl.hidden = false;
        listEl.innerHTML = rows.map(function (c) {
          var ref = esc(c.contract_reference || "Contract");
          var role = c.role ? esc(c.role) : "";
          var when = fmtDate(c.employee_signed_at || c.completed_at);
          var status = contractStatusLabel(c.status);
          var doc = c.documents && !Array.isArray(c.documents) ? c.documents : (Array.isArray(c.documents) ? c.documents[0] : null);
          var filePath = doc && doc.file_url ? String(doc.file_url) : "";
          var pdfBtn = filePath
            ? '<button type="button" class="hr-contract-pdf" data-hr-contract-pdf="' + esc(filePath) + '">View PDF</button>'
            : (c.status === "completed" ? '<span class="hr-contract-meta">PDF pending</span>' : "");
          return '<div class="hr-contract-row" data-hr-contract-id="' + esc(c.id) + '">'
            + '<b>' + ref + '</b>'
            + (role ? '<span class="hr-contract-meta">' + role + '</span>' : "")
            + '<span class="hr-contract-meta">' + esc(status) + (when ? " · " + esc(when) : "") + '</span>'
            + pdfBtn
            + '</div>';
        }).join("");
        bindEmploymentContractPdfButtons(screen);
      });
  }

  function bindEmploymentContractPdfButtons(screen) {
    if (!screen) return;
    screen.querySelectorAll("[data-hr-contract-pdf]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var path = btn.getAttribute("data-hr-contract-pdf");
        btn.disabled = true;
        hrAdminSignedDocumentUrl(path).then(function (url) {
          btn.disabled = false;
          if (url) {
            try { global.open(url, "_blank", "noopener,noreferrer"); } catch (_) {}
          } else {
            deps.toast("Could not open PDF. Try again or check admin access.");
          }
        });
      });
    });
  }

  function bindEmploymentContracts(screen, personRow) {
    var staffId = personRow && personRow.staff_id ? personRow.staff_id : null;
    loadPersonEmploymentContracts(staffId, screen);
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

    if (global.AdminLDFundingReview && typeof global.AdminLDFundingReview.configure === "function") {
      global.AdminLDFundingReview.configure({
        esc: deps.esc,
        toast: deps.toast,
        openScreen: openScreen,
        closeScreen: closeScreen,
        icon: icon,
      });
    }

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
      return Promise.all([
        loadUnavail(client),
        loadStaffProfileConfirmations(client),
        global.AdminLDFundingReview
          ? global.AdminLDFundingReview.loadApplications(client).catch(function () {
              return [];
            })
          : Promise.resolve([]),
      ]).then(function (parts) {
        state.unavail = parts[0] || [];
        state.profileConfirmRows = parts[1] || [];
        state.ldFundingApps = parts[2] || [];
        render();
      });
    }).catch(function (err) {
      rootEl.innerHTML = '<p class="hr-empty">Could not load H&amp;R: ' + esc((err && err.message) || err) + "</p>";
    });
  }

  function loadStaffProfileConfirmations(client) {
    return client
      .from("staff_profiles")
      .select(
        "id, full_name, username, profile_last_confirmed_at, profile_last_updated_at, is_active, " +
          "availability_status, availability_summary, availability_changes, " +
          "other_work_status, other_work_organisation, other_work_schedule, other_work_affects_availability, " +
          "wellbeing_notes",
      )
      .neq("is_active", false)
      .order("full_name", { ascending: true })
      .then(function (res) {
        if (res.error) {
          try { console.warn("[hr] staff_profiles confirmations:", res.error.message); } catch (_) {}
          return [];
        }
        return res.data || [];
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
