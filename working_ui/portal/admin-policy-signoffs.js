/**
 * Admin — Policies & procedures acknowledgment matrix (role-scoped).
 *
 * - Company policies: mandatory for every worker.
 * - Procedures: only those matching the worker's contract roles / venues
 *   (or staff_role fallback). Non-applicable cells show N/A, not outstanding.
 *
 * Acknowledgments: documents.document_type = staff_policy_ack
 * (related_session_key = POL-id) when present.
 */
(function (global) {
  "use strict";

  var CATALOG = [{"id": "POL-001", "title": "Anti-Slavery and Human Trafficking Policy", "short": "Anti-Slavery and Human Tra…", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-002", "title": "Data Protection & GDPR Policy", "short": "Data Protection & GDPR", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-003", "title": "Whistleblowing Policy", "short": "Whistleblowing", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-004", "title": "Disciplinary Policy", "short": "Disciplinary", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-005", "title": "Grievance Policy", "short": "Grievance", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-006", "title": "Recruitment Policy", "short": "Recruitment", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-007", "title": "Diversity, Equality and Inclusion Policy", "short": "Diversity, Equality and In…", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-008", "title": "Safeguarding Policy", "short": "Safeguarding", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-009", "title": "Mental Health Policy", "short": "Mental Health", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-010", "title": "First Aid Policy", "short": "First Aid", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-011", "title": "Health and Safety Policy", "short": "Health and Safety", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-012", "title": "Equipment and Uniform Policy", "short": "Equipment and Uniform", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-014", "title": "Session Feedback & Record Keeping", "short": "Session Feedback & Record …", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-015", "title": "Incident Reporting Procedure", "short": "Incident Reporting", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-016", "title": "Safeguarding Reporting Procedure", "short": "Safeguarding Reporting", "kind": "procedure", "category": "Safeguarding and Wellbeing", "tags": ["core"]}, {"id": "POL-017", "title": "Emergency Response Principles", "short": "Emergency Response Princip…", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-018", "title": "Missing Service User Procedure (Global)", "short": "Missing Service User Proce…", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-019", "title": "Session Delivery Standards", "short": "Session Delivery Standards", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-020", "title": "Supervision & Ratios", "short": "Supervision & Ratios", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-021", "title": "Transitions & Handover Procedure", "short": "Transitions & Handover", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-022", "title": "Recruitment Procedure", "short": "Recruitment", "kind": "procedure", "category": "Employment and People", "tags": ["office"]}, {"id": "POL-023", "title": "Internal Communication Procedure", "short": "Internal Communication", "kind": "procedure", "category": "Employment and People", "tags": ["core"]}, {"id": "POL-024", "title": "Aquatic Activity Procedure", "short": "Aquatic Activity", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["swim"]}, {"id": "POL-025", "title": "Climbing Activity Procedure", "short": "Climbing Activity", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["climb"]}, {"id": "POL-026", "title": "Multi Activity Procedure", "short": "Multi Activity", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["hub", "day_centre"]}, {"id": "POL-027", "title": "Physical Activity Procedure", "short": "Physical Activity", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["fitness"]}, {"id": "POL-028", "title": "Active Play & Movement Procedure", "short": "Active Play & Movement", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["hub", "day_centre"]}, {"id": "POL-029", "title": "Acton Centre: Venue Overview", "short": "Acton Centre: Venue Overview", "kind": "procedure", "category": "Venue", "tags": ["venue_acton"]}, {"id": "POL-030", "title": "Westway Sports Centre: Venue Overview", "short": "Westway Sports Centre: Ven…", "kind": "procedure", "category": "Venue", "tags": ["venue_westway"]}, {"id": "POL-031", "title": "SwimFarm Centre: Venue Overview", "short": "SwimFarm Centre: Venue Ove…", "kind": "procedure", "category": "Venue", "tags": ["venue_swimfarm"]}, {"id": "POL-032", "title": "Northolt Leisure Centre: Venue Overview", "short": "Northolt Leisure Centre: V…", "kind": "procedure", "category": "Venue", "tags": ["venue_northolt"]}, {"id": "POL-033", "title": "Acton Centre: Emergency Procedures", "short": "Acton Centre: Emergency Pr…", "kind": "procedure", "category": "Venue", "tags": ["venue_acton"]}, {"id": "POL-034", "title": "Westway Sports Centre: Emergency Procedures", "short": "Westway Sports Centre: Eme…", "kind": "procedure", "category": "Venue", "tags": ["venue_westway"]}, {"id": "POL-035", "title": "SwimFarm Centre: Emergency Procedures", "short": "SwimFarm Centre: Emergency…", "kind": "procedure", "category": "Venue", "tags": ["venue_swimfarm"]}, {"id": "POL-036", "title": "Northolt Leisure Centre: Emergency Procedures", "short": "Northolt Leisure Centre: E…", "kind": "procedure", "category": "Venue", "tags": ["venue_northolt"]}, {"id": "POL-037", "title": "clubSENsational Hub: Venue Overview", "short": "clubSENsational Hub: Venue…", "kind": "procedure", "category": "Venue", "tags": ["venue_hub", "hub", "day_centre"]}, {"id": "POL-038", "title": "clubSENsational Hub: Emergency Procedures", "short": "clubSENsational Hub: Emerg…", "kind": "procedure", "category": "Venue", "tags": ["venue_hub", "hub", "day_centre"]}, {"id": "POL-039", "title": "Home Visit Safety Procedure", "short": "Home Visit Safety", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["home_visit"]}, {"id": "POL-040", "title": "Lone Working Guidelines", "short": "Lone Working Guidelines", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["home_visit"]}, {"id": "POL-041", "title": "Home Visit Emergency & Escalation Protocol", "short": "Home Visit Emergency & Esc…", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["home_visit"]}, {"id": "POL-042", "title": "Fire Evacuation: Quick Guide", "short": "Fire Evacuation", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-043", "title": "Missing Service User: Quick Guide", "short": "Missing Service User", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-044", "title": "Medical Emergency: Quick Guide", "short": "Medical Emergency", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-045", "title": "Incident Reporting: Quick Guide", "short": "Incident Reporting", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-046", "title": "Behaviour: Quick Guide", "short": "Behaviour", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-047", "title": "Pool Emergency: Quick Guide", "short": "Pool Emergency", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["swim"]}, {"id": "POL-048", "title": "Session Disruption Reporting Procedure", "short": "Session Disruption Reporting", "kind": "procedure", "category": "Health, Safety and Operations", "tags": ["core"]}, {"id": "POL-049", "title": "Learning & Development Funding Scheme", "short": "Learning & Development Fun…", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-050", "title": "Complaints Policy", "short": "Complaints", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-051", "title": "Consent Policy & Procedure", "short": "Consent Policy", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-052", "title": "Governance & Quality Assurance Policy", "short": "Governance & Quality Assur…", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-053", "title": "Infection Prevention & Control Policy", "short": "Infection Prevention & Con…", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-054", "title": "Medicines Management Policy", "short": "Medicines Management", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-055", "title": "Positive Behaviour Support (PBS) Policy", "short": "Positive Behaviour Support…", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-056", "title": "Restraint & Restrictive Practice Policy", "short": "Restraint & Restrictive Pr…", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-057", "title": "Accessible Information & Communication Policy", "short": "Accessible Information & C…", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-058", "title": "Mental Capacity & Best Interests Policy", "short": "Mental Capacity & Best Int…", "kind": "policy", "category": "Safeguarding and Wellbeing", "tags": ["all"]}, {"id": "POL-059", "title": "Photography, Media & Social Media Policy", "short": "Photography, Media & Socia…", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}, {"id": "POL-060", "title": "Transport & Escort Policy", "short": "Transport & Escort", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-061", "title": "Food, Allergies & Choking Policy", "short": "Food, Allergies & Choking", "kind": "policy", "category": "Health, Safety and Operations", "tags": ["all"]}, {"id": "POL-062", "title": "Code of Conduct & Professional Boundaries Policy", "short": "Code of Conduct & Professi…", "kind": "policy", "category": "Employment and People", "tags": ["all"]}, {"id": "POL-063", "title": "Business Continuity & IT Downtime Policy", "short": "Business Continuity & IT D…", "kind": "policy", "category": "Legal and Compliance", "tags": ["all"]}];

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
    tagsByUser: {},
    acksByUser: {},
    loading: false,
    error: null,
    loaded: false,
    _boundContractRefresh: false,
    acksMeta: { count: 0, source: null, via: null },
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
    // Tab ids are plural ("policies" / "procedures"); catalog kinds are singular.
    var kind = tab === "policies" ? "policy" : tab === "procedures" ? "procedure" : tab;
    return CATALOG.filter(function (d) { return d.kind === kind; });
  }

  function scopeApi() {
    return global.PortalPolicySignoffScope || null;
  }

  function roleLabel(row) {
    var tags = state.tagsByUser[String(row.id)] || [];
    var api = scopeApi();
    var fromApi = api && api.roleLabelFromTags ? api.roleLabelFromTags(tags) : "";
    if (fromApi) return fromApi;
    return String(row.staff_role || row.app_role || "Staff").trim() || "Staff";
  }

  function deriveTagsForWorker(profile, contracts) {
    var api = scopeApi();
    if (api && typeof api.deriveTagsForWorker === "function") {
      return api.deriveTagsForWorker(profile, contracts);
    }
    return ["core"];
  }

  function docAppliesToWorker(doc, workerTags) {
    var api = scopeApi();
    if (api && typeof api.docApplies === "function") {
      return api.docApplies(doc, workerTags);
    }
    if (!doc) return false;
    var wt = workerTags || ["core"];
    if (wt.indexOf("sign_all") >= 0) return true;
    if (doc.kind === "policy") return true;
    var tags = doc.tags || ["core"];
    if (tags.indexOf("all") >= 0) return true;
    for (var i = 0; i < tags.length; i++) {
      if (wt.indexOf(tags[i]) >= 0) return true;
    }
    return false;
  }

  function isAcked(userId, polId) {
    var m = state.acksByUser[String(userId)] || {};
    return !!m[polId];
  }

  function requiredCols(userId, cols) {
    var tags = state.tagsByUser[String(userId)] || ["core"];
    return cols.filter(function (d) { return docAppliesToWorker(d, tags); });
  }

  function donePct(userId, cols) {
    // Empty catalog (misconfigured tab) must not look like "fully done".
    if (!cols || !cols.length) return null;
    var req = requiredCols(userId, cols);
    if (!req.length) return 100;
    var n = 0;
    for (var i = 0; i < req.length; i++) {
      if (isAcked(userId, req[i].id)) n++;
    }
    return Math.round((n / req.length) * 100);
  }

  function chipClass(pct) {
    if (pct == null) return "chip--pend";
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
      root.innerHTML = '<p class="muted" style="margin:0;padding:12px 0">Loading staff, contracts and acknowledgments…</p>';
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
      var fullName = String(d.id) + " · " + String(d.title || d.short || "");
      return (
        '<th scope="col" class="muted" style="font-size:10px;white-space:nowrap;padding:6px 4px;vertical-align:bottom;max-width:3.2rem;cursor:help" title="' +
        esc(fullName) +
        '" aria-label="' +
        esc(fullName) +
        '">' +
        '<span style="display:block;font-weight:700;color:#2d3e50" title="' +
        esc(fullName) +
        '">' +
        esc(num) +
        "</span>" +
        '<span style="display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis" title="' +
        esc(fullName) +
        '">' +
        esc(d.short) +
        "</span>" +
        "</th>"
      );
    }).join("");

    var body;
    if (!staff.length) {
      body = '<tr><td colspan="' + (3 + cols.length) + '" class="muted" style="padding:16px">No active staff profiles found.</td></tr>';
    } else {
      body = staff.map(function (s) {
        var uid = String(s.id);
        var tags = state.tagsByUser[uid] || ["core"];
        var pct = donePct(uid, cols);
        var reqN = requiredCols(uid, cols).length;
        var staffName = s.full_name || s.username || "Staff";
        var cells = cols.map(function (d) {
          var fullName = String(d.id) + " · " + String(d.title || d.short || "");
          if (!docAppliesToWorker(d, tags)) {
            return (
              '<td style="text-align:center;padding:6px 4px;cursor:help" title="' +
              esc(fullName + " — not required for " + staffName) +
              '"><span class="muted" style="font-size:11px">n/a</span></td>'
            );
          }
          var ok = isAcked(uid, d.id);
          var tip = fullName + (ok ? " — acknowledged" : " — required · outstanding");
          return (
            '<td style="text-align:center;padding:6px 4px;cursor:help" title="' +
            esc(tip) +
            '">' +
            (ok
              ? '<span class="chip chip--ok">✓</span>'
              : '<span class="chip chip--pend">—</span>') +
            "</td>"
          );
        }).join("");
        var pctLabel = pct == null ? "—" : pct + "%";
        return (
          "<tr>" +
          '<td style="white-space:nowrap;position:sticky;left:0;background:#fff;z-index:1"><strong>' + esc(staffName) + "</strong></td>" +
          '<td class="muted" style="white-space:nowrap;font-size:12px" title="' + esc(tags.join(", ")) + '">' + esc(roleLabel(s)) + "</td>" +
          '<td style="text-align:center"><span class="chip ' + chipClass(pct) + '" title="' + reqN + ' required in this tab">' + pctLabel + "</span></td>" +
          cells +
          "</tr>"
        );
      }).join("");
    }

    root.innerHTML =
      '<div class="card" style="margin-bottom:12px"><div class="card-pad" style="font-size:13px;line-height:1.5;color:#374151">' +
      "<strong>How this works:</strong> company <em>policies</em> are required for everyone. " +
      "<em>Procedures</em> are required only for the worker's contract roles and venues " +
      "(e.g. swimming-only staff do not get climbing, Hub/fitness or home-visit procedures marked as outstanding). " +
      "Managers (Victor, Palankas, Raul) must acknowledge <em>all</em> policies and procedures. " +
      "Each service role also requires the emergency procedures (and venue overviews) for its usual venues. " +
      "Pre-contract dual roles: Luliya, Youssef and Roberto = Swim + class support; Bismark = Climb + class support. " +
      "Completions come from portal <code>staff_policy_ack</code> documents (not browser-only saves). " +
      "Grey <code>n/a</code> means not in scope for that person." +
      "</div></div>" +
      (function () {
        var meta = state.acksMeta || {};
        if (meta.via === "rpc" && meta.count > 0) {
          return (
            '<p class="muted" style="margin:0 0 12px;font-size:12px">Loaded <strong>' +
            meta.count +
            "</strong> acknowledgment(s) from the portal.</p>"
          );
        }
        if (meta.count === 0) {
          return (
            '<div class="card" style="margin-bottom:12px;border-color:#f59e0b"><div class="card-pad" style="font-size:13px;line-height:1.5;color:#92400e">' +
            "<strong>No portal acknowledgments loaded.</strong> " +
            "If staff see Completed in Policies but this matrix stays empty, run the SQL in " +
            "<code>working_ui/portal/APPLY-policy-ack-matrix.sql</code> in the Supabase SQL Editor, " +
            "then ask the worker to open Policies once from the Staff Portal (signed in), and refresh this page." +
            (meta.source ? " <span class=\"muted\">(" + esc(meta.source) + ")</span>" : "") +
            "</div></div>"
          );
        }
        return "";
      })() +
      '<div class="c4k-sessions-hub-tabs" role="tablist" aria-label="Policy sign-off groups" style="margin-bottom:12px">' + tabHtml + "</div>" +
      '<div class="card"><div class="card-h"><h3>Completion matrix</h3>' +
      '<span class="chip chip--info">' + esc(String(staff.length)) + " staff · scoped by role</span></div>" +
      '<div class="card-pad" style="overflow:auto"><table class="tbl tbl--center" style="min-width:' + (300 + cols.length * 52) + 'px">' +
      "<thead><tr><th>Staff</th><th>Services</th><th>Done</th>" + th + "</tr></thead><tbody>" + body + "</tbody></table></div></div>" +
      '<p class="muted" style="margin:10px 0 0;font-size:12px;line-height:1.45;max-width:54rem">' +
      "Scope updates automatically when you send or complete an employment contract " +
      "(multi-role workers get the union of all roles and venues). " +
      "Fallback is <code>staff_role</code> until a live contract exists. " +
      '<a href="/policies_portal.html" target="_blank" rel="noopener">Policies Portal</a>.' +
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
        return res.data || [];
      });
  }

  function loadContracts(client) {
    var api = scopeApi();
    return client
      .from("employment_contracts")
      .select("id, user_id, role, status, form_payload")
      .limit(2000)
      .then(function (res) {
        if (res.error) {
          try { console.warn("[policy-signoffs] employment_contracts:", res.error.message); } catch (_) {}
          return [];
        }
        var rows = res.data || [];
        if (api && typeof api.isLiveContractStatus === "function") {
          return rows.filter(function (c) {
            return api.isLiveContractStatus(c && c.status);
          });
        }
        return rows.filter(function (c) {
          var s = String((c && c.status) || "").toLowerCase();
          return s === "awaiting_employee" || s === "completed" || s === "active" || s === "sent" || s === "pending";
        });
      })
      .catch(function () { return []; });
  }

  function loadAcks(client) {
    function mapRows(rows) {
      var map = {};
      (rows || []).forEach(function (row) {
        var uid = String(row.user_id || "").trim();
        var pid = String(row.related_session_key || "").trim().toUpperCase();
        if (!uid || !pid) return;
        if (!map[uid]) map[uid] = {};
        map[uid][pid] = { at: row.created_at || null };
      });
      return map;
    }

    state.acksMeta = { count: 0, source: null, via: null };

    return client
      .rpc("portal_admin_list_staff_policy_acks")
      .then(function (res) {
        if (!res.error) {
          var mapped = mapRows(res.data || []);
          var n = 0;
          Object.keys(mapped).forEach(function (uid) {
            n += Object.keys(mapped[uid]).length;
          });
          state.acksMeta = { count: n, source: null, via: "rpc" };
          return mapped;
        }
        state.acksMeta.source = res.error.message || "rpc_failed";
        try { console.warn("[policy-signoffs] rpc acks:", res.error.message); } catch (_) {}
        return client
          .from("documents")
          .select("user_id, related_session_key, created_at, document_type")
          .eq("document_type", "staff_policy_ack")
          .limit(5000)
          .then(function (res2) {
            if (res2.error) {
              state.acksMeta.source = res2.error.message || "documents_failed";
              try { console.warn("[policy-signoffs] documents:", res2.error.message); } catch (_) {}
              return {};
            }
            var mapped2 = mapRows(res2.data || []);
            var n2 = 0;
            Object.keys(mapped2).forEach(function (uid) {
              n2 += Object.keys(mapped2[uid]).length;
            });
            state.acksMeta = {
              count: n2,
              source: n2 === 0 ? "empty_or_rls" : null,
              via: "documents",
            };
            return mapped2;
          });
      })
      .catch(function (err) {
        state.acksMeta = { count: 0, source: (err && err.message) || "load_failed", via: null };
        return {};
      });
  }

  function bindContractRefresh() {
    if (state._boundContractRefresh || !global.addEventListener) return;
    state._boundContractRefresh = true;
    global.addEventListener("portal:employment-contract-published", function () {
      if (state.rootEl) mount(state.rootEl);
    });
    global.addEventListener("portal:employment-contract-updated", function () {
      if (state.rootEl) mount(state.rootEl);
    });
  }

  function mount(rootEl) {
    state.rootEl = rootEl;
    state.loading = true;
    state.error = null;
    bindContractRefresh();
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

    Promise.all([loadStaff(client), loadContracts(client), loadAcks(client)])
      .then(function (parts) {
        var staff = parts[0] || [];
        var contracts = parts[1] || [];
        var byUser = {};
        contracts.forEach(function (c) {
          var uid = String(c.user_id || "").trim();
          if (!uid) return;
          if (!byUser[uid]) byUser[uid] = [];
          byUser[uid].push(c);
        });
        var tagsByUser = {};
        staff.forEach(function (s) {
          tagsByUser[String(s.id)] = deriveTagsForWorker(s, byUser[String(s.id)] || []);
        });
        state.staff = staff;
        state.tagsByUser = tagsByUser;
        state.acksByUser = parts[2] || {};
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
    remount: function () {
      if (state.rootEl) mount(state.rootEl);
    },
    catalog: CATALOG,
  };
})(typeof window !== "undefined" ? window : this);
