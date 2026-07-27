/**
 * Admin — Policies & procedures acknowledgment matrix.
 * Staff from staff_profiles; columns from Policies Portal catalog.
 * Acknowledgments: documents.document_type = staff_policy_ack (related_session_key = POL-id)
 * when present; otherwise cells stay outstanding (template ready for live sign-offs).
 */
(function (global) {
  "use strict";

  var CATALOG = [{"id": "POL-001", "title": "Anti-Slavery and Human Trafficking Policy", "short": "Anti-Slavery and Human Tra…", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-002", "title": "Data Protection & GDPR Policy", "short": "Data Protection & GDPR", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-003", "title": "Whistleblowing Policy", "short": "Whistleblowing", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-004", "title": "Disciplinary Policy", "short": "Disciplinary", "kind": "policy", "category": "Employment and People"}, {"id": "POL-005", "title": "Grievance Policy", "short": "Grievance", "kind": "policy", "category": "Employment and People"}, {"id": "POL-006", "title": "Recruitment Policy", "short": "Recruitment", "kind": "policy", "category": "Employment and People"}, {"id": "POL-007", "title": "Diversity, Equality and Inclusion Policy", "short": "Diversity, Equality and In…", "kind": "policy", "category": "Employment and People"}, {"id": "POL-008", "title": "Safeguarding Policy", "short": "Safeguarding", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-009", "title": "Mental Health Policy", "short": "Mental Health", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-010", "title": "First Aid Policy", "short": "First Aid", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-011", "title": "Health and Safety Policy", "short": "Health and Safety", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-012", "title": "Equipment and Uniform Policy", "short": "Equipment and Uniform", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-014", "title": "Session Feedback & Record Keeping", "short": "Session Feedback & Record …", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-015", "title": "Incident Reporting Procedure", "short": "Incident Reporting", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-016", "title": "Safeguarding Reporting Procedure", "short": "Safeguarding Reporting", "kind": "procedure", "category": "Safeguarding and Wellbeing"}, {"id": "POL-017", "title": "Emergency Response Principles", "short": "Emergency Response Princip…", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-018", "title": "Missing Service User Procedure (Global)", "short": "Missing Service User Proce…", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-019", "title": "Session Delivery Standards", "short": "Session Delivery Standards", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-020", "title": "Supervision & Ratios", "short": "Supervision & Ratios", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-021", "title": "Transitions & Handover Procedure", "short": "Transitions & Handover", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-022", "title": "Recruitment Procedure", "short": "Recruitment", "kind": "procedure", "category": "Employment and People"}, {"id": "POL-023", "title": "Internal Communication Procedure", "short": "Internal Communication", "kind": "procedure", "category": "Employment and People"}, {"id": "POL-024", "title": "Aquatic Activity Procedure", "short": "Aquatic Activity", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-025", "title": "Climbing Activity Procedure", "short": "Climbing Activity", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-026", "title": "Multi Activity Procedure", "short": "Multi Activity", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-027", "title": "Physical Activity Procedure", "short": "Physical Activity", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-028", "title": "Active Play & Movement Procedure", "short": "Active Play & Movement", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-029", "title": "Acton Centre: Venue Overview", "short": "Acton Centre: Venue Overview", "kind": "procedure", "category": "Venue"}, {"id": "POL-030", "title": "Westway Sports Centre: Venue Overview", "short": "Westway Sports Centre: Ven…", "kind": "procedure", "category": "Venue"}, {"id": "POL-031", "title": "SwimFarm Centre: Venue Overview", "short": "SwimFarm Centre: Venue Ove…", "kind": "procedure", "category": "Venue"}, {"id": "POL-032", "title": "Northolt Leisure Centre: Venue Overview", "short": "Northolt Leisure Centre: V…", "kind": "procedure", "category": "Venue"}, {"id": "POL-033", "title": "Acton Centre: Emergency Procedures", "short": "Acton Centre: Emergency Pr…", "kind": "procedure", "category": "Venue"}, {"id": "POL-034", "title": "Westway Sports Centre: Emergency Procedures", "short": "Westway Sports Centre: Eme…", "kind": "procedure", "category": "Venue"}, {"id": "POL-035", "title": "SwimFarm Centre: Emergency Procedures", "short": "SwimFarm Centre: Emergency…", "kind": "procedure", "category": "Venue"}, {"id": "POL-036", "title": "Northolt Leisure Centre: Emergency Procedures", "short": "Northolt Leisure Centre: E…", "kind": "procedure", "category": "Venue"}, {"id": "POL-037", "title": "clubSENsational Hub: Venue Overview", "short": "clubSENsational Hub: Venue…", "kind": "procedure", "category": "Venue"}, {"id": "POL-038", "title": "clubSENsational Hub: Emergency Procedures", "short": "clubSENsational Hub: Emerg…", "kind": "procedure", "category": "Venue"}, {"id": "POL-039", "title": "Home Visit Safety Procedure", "short": "Home Visit Safety", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-040", "title": "Lone Working Guidelines", "short": "Lone Working Guidelines", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-041", "title": "Home Visit Emergency & Escalation Protocol", "short": "Home Visit Emergency & Esc…", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-042", "title": "Fire Evacuation: Quick Guide", "short": "Fire Evacuation", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-043", "title": "Missing Service User: Quick Guide", "short": "Missing Service User", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-044", "title": "Medical Emergency: Quick Guide", "short": "Medical Emergency", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-045", "title": "Incident Reporting: Quick Guide", "short": "Incident Reporting", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-046", "title": "Behaviour: Quick Guide", "short": "Behaviour", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-047", "title": "Pool Emergency: Quick Guide", "short": "Pool Emergency", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-048", "title": "Session Disruption Reporting Procedure", "short": "Session Disruption Reporting", "kind": "procedure", "category": "Health, Safety and Operations"}, {"id": "POL-049", "title": "Learning & Development Funding Scheme", "short": "Learning & Development Fun…", "kind": "policy", "category": "Employment and People"}, {"id": "POL-050", "title": "Complaints Policy", "short": "Complaints", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-051", "title": "Consent Policy & Procedure", "short": "Consent Policy", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-052", "title": "Governance & Quality Assurance Policy", "short": "Governance & Quality Assur…", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-053", "title": "Infection Prevention & Control Policy", "short": "Infection Prevention & Con…", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-054", "title": "Medicines Management Policy", "short": "Medicines Management", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-055", "title": "Positive Behaviour Support (PBS) Policy", "short": "Positive Behaviour Support…", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-056", "title": "Restraint & Restrictive Practice Policy", "short": "Restraint & Restrictive Pr…", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-057", "title": "Accessible Information & Communication Policy", "short": "Accessible Information & C…", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-058", "title": "Mental Capacity & Best Interests Policy", "short": "Mental Capacity & Best Int…", "kind": "policy", "category": "Safeguarding and Wellbeing"}, {"id": "POL-059", "title": "Photography, Media & Social Media Policy", "short": "Photography, Media & Socia…", "kind": "policy", "category": "Legal and Compliance"}, {"id": "POL-060", "title": "Transport & Escort Policy", "short": "Transport & Escort", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-061", "title": "Food, Allergies & Choking Policy", "short": "Food, Allergies & Choking", "kind": "policy", "category": "Health, Safety and Operations"}, {"id": "POL-062", "title": "Code of Conduct & Professional Boundaries Policy", "short": "Code of Conduct & Professi…", "kind": "policy", "category": "Employment and People"}, {"id": "POL-063", "title": "Business Continuity & IT Downtime Policy", "short": "Business Continuity & IT D…", "kind": "policy", "category": "Legal and Compliance"}];

  var cfg = {
    getClient: function () { return null; },
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    toast: function () {},
  };

  var state = {
    rootEl: null,
    tab: "policies",
    staff: [],
    acksByUser: {},
    loading: false,
    error: null,
    loaded: false,
  };

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.getClient === "function") cfg.getClient = opts.getClient;
    if (typeof opts.esc === "function") cfg.esc = opts.esc;
    if (typeof opts.toast === "function") cfg.toast = opts.toast;
  }

  function esc(s) { return cfg.esc(s); }

  function catalogForTab(tab) {
    if (tab === "all") return CATALOG.slice();
    return CATALOG.filter(function (d) { return d.kind === tab; });
  }

  function roleLabel(row) {
    return String(row.staff_role || row.app_role || row.dashboard_route || "Staff").trim() || "Staff";
  }

  function ackSetForUser(userId) {
    var m = state.acksByUser[String(userId)] || {};
    return m;
  }

  function isAcked(userId, polId) {
    return !!ackSetForUser(userId)[polId];
  }

  function donePct(userId, cols) {
    if (!cols.length) return 0;
    var n = 0;
    for (var i = 0; i < cols.length; i++) {
      if (isAcked(userId, cols[i].id)) n++;
    }
    return Math.round((n / cols.length) * 100);
  }

  function chipClass(pct) {
    if (pct >= 100) return "chip--ok";
    if (pct >= 50) return "chip--info";
    return "chip--pend";
  }

  function renderMatrix() {
    var root = state.rootEl;
    if (!root) return;
    var tab = state.tab || "policies";
    var cols = catalogForTab(tab);
    var staff = state.staff || [];

    if (state.loading && !state.loaded) {
      root.innerHTML = '<p class="muted" style="margin:0;padding:12px 0">Loading staff and acknowledgments…</p>';
      return;
    }
    if (state.error) {
      root.innerHTML = '<p class="submission-state is-error" style="margin:0">' + esc(state.error) + "</p>";
      return;
    }

    var tabs = [
      { id: "policies", label: "Policies", count: CATALOG.filter(function (d) { return d.kind === "policy"; }).length },
      { id: "procedures", label: "Procedures", count: CATALOG.filter(function (d) { return d.kind === "procedure"; }).length },
      { id: "all", label: "All", count: CATALOG.length },
    ];
    var tabHtml = tabs.map(function (t) {
      var on = t.id === tab;
      return (
        '<button type="button" class="c4k-sessions-hub-tab' + (on ? " is-active" : "") + '" data-policy-signoff-tab="' + esc(t.id) + '" aria-selected="' + (on ? "true" : "false") + '">' +
        '<span class="c4k-sessions-hub-tab__label">' + esc(t.label) + " (" + t.count + ")</span></button>"
      );
    }).join("");

    var th = cols.map(function (d) {
      var num = String(d.id).replace(/^POL-0?/, "");
      return (
        '<th scope="col" class="muted" style="font-size:10px;white-space:nowrap;padding:6px 4px;vertical-align:bottom;max-width:3.2rem" title="' +
        esc(d.id + " · " + d.title) + '">' +
        '<span style="display:block;font-weight:700;color:#2d3e50">' + esc(num) + "</span>" +
        '<span style="display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis">' + esc(d.short) + "</span>" +
        "</th>"
      );
    }).join("");

    var body;
    if (!staff.length) {
      body = '<tr><td colspan="' + (3 + cols.length) + '" class="muted" style="padding:16px">No active staff profiles found. Check H&amp;R / staff_profiles.</td></tr>';
    } else {
      body = staff.map(function (s) {
        var uid = String(s.id);
        var pct = donePct(uid, cols);
        var cells = cols.map(function (d) {
          var ok = isAcked(uid, d.id);
          return (
            '<td style="text-align:center;padding:6px 4px">' +
            (ok
              ? '<span class="chip chip--ok" title="Acknowledged">✓</span>'
              : '<span class="chip chip--pend" title="Outstanding">—</span>') +
            "</td>"
          );
        }).join("");
        return (
          "<tr>" +
          '<td style="white-space:nowrap;position:sticky;left:0;background:#fff;z-index:1"><strong>' + esc(s.full_name || s.username || "Staff") + "</strong></td>" +
          '<td class="muted" style="white-space:nowrap">' + esc(roleLabel(s)) + "</td>" +
          '<td style="text-align:center"><span class="chip ' + chipClass(pct) + '">' + pct + "%</span></td>" +
          cells +
          "</tr>"
        );
      }).join("");
    }

    var ackCount = 0;
    Object.keys(state.acksByUser).forEach(function (uid) {
      ackCount += Object.keys(state.acksByUser[uid] || {}).length;
    });

    root.innerHTML =
      '<div class="c4k-sessions-hub-tabs" role="tablist" aria-label="Policy sign-off groups" style="margin-bottom:12px">' + tabHtml + "</div>" +
      '<div class="card"><div class="card-h"><h3>Completion matrix</h3>' +
      '<span class="chip chip--info">' + esc(String(cols.length)) + " required · " + esc(String(staff.length)) + " staff</span></div>" +
      '<div class="card-pad" style="overflow:auto"><table class="tbl tbl--center" style="min-width:' + (280 + cols.length * 52) + 'px">' +
      "<thead><tr><th>Staff</th><th>Role</th><th>Done</th>" + th + "</tr></thead><tbody>" + body + "</tbody></table></div></div>" +
      '<p class="muted" style="margin:10px 0 0;font-size:12px;line-height:1.45;max-width:52rem">' +
      (ackCount
        ? "Live acknowledgments loaded from portal documents (" + ackCount + " signed cells). Outstanding cells need a staff signature in the Policies Portal."
        : "Template is live for all workers and documents. Acknowledgments appear here when saved as <code style=\"font-size:11px\">staff_policy_ack</code> in documents (or after staff sign in the Policies Portal once that write path is enabled). Until then every cell shows outstanding.") +
      ' <a href="/policies_portal.html" target="_blank" rel="noopener">Open Policies Portal</a>.' +
      "</p>";

    root.querySelectorAll("[data-policy-signoff-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-policy-signoff-tab") || "policies";
        if (next === state.tab) return;
        state.tab = next;
        renderMatrix();
      });
    });
  }

  function loadStaff(client) {
    return client
      .from("staff_profiles")
      .select("id, full_name, username, staff_role, app_role, dashboard_route, is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(500)
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).filter(function (r) {
          var role = String(r.app_role || "").toLowerCase();
          // Keep workers + leads; still include admin/ceo so directors can track their own reads if needed.
          return true;
        });
      });
  }

  function loadAcks(client) {
    return client
      .from("documents")
      .select("user_id, related_session_key, created_at, document_type")
      .eq("document_type", "staff_policy_ack")
      .limit(5000)
      .then(function (res) {
        if (res.error) {
          // Table/RLS may block admin list — degrade to empty matrix template.
          try { console.warn("[policy-signoffs] documents:", res.error.message); } catch (_) {}
          return {};
        }
        var map = {};
        (res.data || []).forEach(function (row) {
          var uid = String(row.user_id || "").trim();
          var pid = String(row.related_session_key || "").trim().toUpperCase();
          if (!uid || !pid) return;
          if (!map[uid]) map[uid] = {};
          map[uid][pid] = { at: row.created_at || null };
        });
        return map;
      });
  }

  function mount(rootEl) {
    state.rootEl = rootEl;
    state.loading = true;
    state.error = null;
    renderMatrix();

    var client = cfg.getClient && cfg.getClient();
    if (!client) {
      state.loading = false;
      state.error = "Connecting to Supabase… open this view again in a moment.";
      renderMatrix();
      global.addEventListener &&
        global.addEventListener(
          "portal:supabase-ready",
          function () {
            if (state.rootEl === rootEl) mount(rootEl);
          },
          { once: true }
        );
      return;
    }

    Promise.all([loadStaff(client), loadAcks(client)])
      .then(function (parts) {
        state.staff = parts[0] || [];
        state.acksByUser = parts[1] || {};
        state.loading = false;
        state.loaded = true;
        state.error = null;
        renderMatrix();
      })
      .catch(function (err) {
        state.loading = false;
        state.error = "Could not load policy sign-offs: " + ((err && err.message) || err);
        renderMatrix();
      });
  }

  global.AdminPolicySignoffs = {
    configure: configure,
    mount: mount,
    catalog: CATALOG,
  };
})(typeof window !== "undefined" ? window : this);
