/**
 * CEO strategic snapshot — live Supabase data (read-only, anon client + CEO JWT).
 * Renders into #ceoStrategicMount, reusing the .ceo-snap-* styles.
 *
 * RLS: CEO (app_role 'ceo'/'admin') can SELECT session_feedback, incident_reports,
 * cancellation_reports, venue_reviews, staff_profiles, staff_timesheets,
 * expense_claims, portal_staff_visit_sessions. One failing query never breaks the rest.
 */
(function () {
  "use strict";

  var WINDOW_DAYS = 120;

  function getClient() {
    return (
      (typeof window !== "undefined" &&
        window.__PORTAL_SUPABASE__ &&
        window.__PORTAL_SUPABASE__.client) ||
      null
    );
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    var v = Number(n) || 0;
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: v % 1 ? 2 : 0,
      }).format(v);
    } catch (e) {
      return "£" + v;
    }
  }

  function isoDaysAgo(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function monthStartIso() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }

  function monthLabel() {
    try {
      return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    } catch (e) {
      return "this month";
    }
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      });
    } catch (e) {
      return String(iso);
    }
  }

  function rows(res) {
    if (!res || res.status !== "fulfilled" || !res.value) return [];
    var data = res.value.data;
    return Array.isArray(data) ? data : [];
  }

  function isPresent(attendance) {
    var a = String(attendance || "").toLowerCase();
    if (!a) return false;
    if (/not\b|no[ -]?show|absent|cancel|did not/.test(a)) return false;
    return /attend|present|late/.test(a);
  }

  function topCounts(list, keyFn, limit) {
    var map = {};
    list.forEach(function (x) {
      var k = keyFn(x);
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map)
      .map(function (k) {
        return { label: k, count: map[k] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, limit || 99);
  }

  function kpi(label, value, sub) {
    return (
      '<div class="ceo-snap-kpi"><div class="ceo-snap-kpi-l">' +
      esc(label) +
      '</div><div class="ceo-snap-kpi-v">' +
      esc(value) +
      "</div>" +
      (sub ? '<div class="ceo-snap-kpi-s">' + esc(sub) + "</div>" : "") +
      "</div>"
    );
  }

  function render(model) {
    var hero =
      '<div class="ceo-snap-hero">' +
      '<div class="ceo-snap-eyebrow">Live snapshot · last ' +
      WINDOW_DAYS +
      " days</div>" +
      '<div class="ceo-snap-headline">' +
      esc(model.headline) +
      "</div>" +
      '<div class="ceo-snap-sub">Updated ' +
      esc(model.updatedAt) +
      " · figures pulled from the portal database (session feedback, reports, staff, finance).</div>" +
      "</div>";

    var kpis =
      '<div class="ceo-snap-kpis">' +
      kpi("Active staff", model.activeStaff, model.staffSub) +
      kpi("Sessions logged", model.sessionsLogged, "feedback submitted") +
      kpi("Participants seen", model.participants, "distinct in window") +
      kpi(
        "Avg engagement",
        model.avgEngagement != null ? model.avgEngagement + " / 5" : "—",
        "1–5 staff rating"
      ) +
      kpi(
        "Attendance",
        model.attendanceRate != null ? model.attendanceRate + "%" : "—",
        "present vs logged"
      ) +
      kpi("Portal active (7d)", model.portalActive7d, "staff used the app") +
      "</div>";

    var finance =
      '<div class="ceo-snap-card"><div class="ceo-snap-card-h">Finance · ' +
      esc(model.monthLabel) +
      '</div><div class="ceo-snap-card-p">' +
      '<div class="ceo-snap-grid2">' +
      '<div><p class="ceo-snap-muted" style="margin:0 0 6px">Payroll (timesheets)</p><p style="margin:0;font-size:22px;font-weight:700;color:var(--ink)">' +
      esc(model.payroll) +
      "</p></div>" +
      '<div><p class="ceo-snap-muted" style="margin:0 0 6px">Expense claims</p><p style="margin:0;font-size:22px;font-weight:700;color:var(--ink)">' +
      esc(model.expenses) +
      "</p></div></div>" +
      '<p class="ceo-snap-muted" style="margin:14px 0 0">Hours submitted this month <strong style="color:var(--ink)">' +
      esc(model.hours) +
      "</strong>" +
      (model.financeEmpty
        ? ' · <span style="color:var(--muted)">no finance submissions yet this month</span>'
        : "") +
      "</p></div></div>";

    var welfareLines =
      '<div class="ceo-snap-line"><strong>Incidents</strong><span class="ceo-snap-muted">' +
      (model.incidentsAvailable
        ? esc(model.incidents) +
          " logged" +
          (model.incidentTop ? " · top: " + esc(model.incidentTop) : "")
        : "Run the CEO reports migration to read incidents") +
      "</span></div>" +
      '<div class="ceo-snap-line"><strong>Cancellations</strong><span class="ceo-snap-muted">' +
      (model.cancellationsAvailable
        ? esc(model.cancellations) +
          " logged" +
          (model.cancelTop ? " · top: " + esc(model.cancelTop) : "")
        : "Run the CEO reports migration to read cancellations") +
      "</span></div>" +
      '<div class="ceo-snap-line"><strong>Venue issues</strong><span class="ceo-snap-muted">' +
      esc(model.venueIssues) +
      " flagged of " +
      esc(model.venueTotal) +
      " checklists</span></div>";

    var servicesRows = model.services.length
      ? model.services
          .map(function (s) {
            return (
              "<tr><td><strong>" +
              esc(s.label) +
              "</strong></td><td>" +
              esc(s.count) +
              '</td><td class="ceo-snap-muted">' +
              esc(s.pct) +
              "%</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="3" class="ceo-snap-muted">No session feedback in window.</td></tr>';

    var services =
      '<div class="ceo-snap-card" style="margin-bottom:14px"><div class="ceo-snap-card-h">Service mix (sessions logged)</div>' +
      '<div class="ceo-snap-card-p" style="overflow:auto"><table class="ceo-snap-tbl"><thead><tr><th>Service</th><th>Sessions</th><th>Share</th></tr></thead><tbody>' +
      servicesRows +
      "</tbody></table></div></div>";

    var recentRows = model.recent.length
      ? model.recent
          .map(function (r) {
            return (
              "<tr><td>" +
              esc(fmtDate(r.session_date)) +
              "</td><td><strong>" +
              esc(r.client_name || "—") +
              "</strong></td><td>" +
              esc(r.service || "—") +
              '</td><td><span class="ceo-snap-chip">' +
              esc(r.attendance || "—") +
              "</span></td><td>" +
              esc(r.completed_by_name || "—") +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5" class="ceo-snap-muted">No recent session feedback.</td></tr>';

    var recent =
      '<div class="ceo-snap-card" style="margin-bottom:14px"><div class="ceo-snap-card-h">Recent session feedback</div>' +
      '<div class="ceo-snap-card-p" style="overflow:auto"><table class="ceo-snap-tbl"><thead><tr><th>Date</th><th>Participant</th><th>Service</th><th>Attendance</th><th>By</th></tr></thead><tbody>' +
      recentRows +
      "</tbody></table></div></div>";

    var welfare =
      '<div class="ceo-snap-grid2" style="margin-bottom:14px"><div>' +
      '<div class="ceo-snap-section-h"><h3>Welfare &amp; operations</h3><p>Incidents, cancellations and venue checks in window.</p></div>' +
      welfareLines +
      "</div>" +
      services +
      "</div>";

    return hero + kpis + finance + welfare + recent;
  }

  function buildModel(results) {
    var feedback = rows(results.feedback);
    var incidentsRes = results.incidents;
    var cancellationsRes = results.cancellations;
    var incidents = rows(incidentsRes);
    var cancellations = rows(cancellationsRes);
    var venues = rows(results.venues);
    var staff = rows(results.staff);
    var timesheets = rows(results.timesheets);
    var expenses = rows(results.expenses);
    var visits = rows(results.visits);

    var incidentsAvailable = incidentsRes && incidentsRes.status === "fulfilled" && !incidentsRes.value.error;
    var cancellationsAvailable =
      cancellationsRes && cancellationsRes.status === "fulfilled" && !cancellationsRes.value.error;

    var activeStaff = staff.filter(function (s) {
      return s.is_active !== false;
    }).length;
    var leads = staff.filter(function (s) {
      return String(s.app_role || "").toLowerCase() === "lead";
    }).length;

    var participantsSet = {};
    feedback.forEach(function (f) {
      var key = String(f.client_id || f.client_name || "").trim().toLowerCase();
      if (key) participantsSet[key] = 1;
    });

    var ratings = feedback
      .map(function (f) {
        return Number(f.engagement_rating);
      })
      .filter(function (n) {
        return n >= 1 && n <= 5;
      });
    var avgEngagement = ratings.length
      ? Math.round((ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length) * 10) / 10
      : null;

    var logged = feedback.length;
    var present = feedback.filter(function (f) {
      return isPresent(f.attendance);
    }).length;
    var attendanceRate = logged ? Math.round((present / logged) * 100) : null;

    var services = topCounts(
      feedback,
      function (f) {
        return String(f.service || "").trim();
      },
      8
    ).map(function (s) {
      return {
        label: s.label,
        count: s.count,
        pct: logged ? Math.round((s.count / logged) * 100) : 0,
      };
    });

    var incidentTop = topCounts(incidents, function (i) {
      return String(i.incident_category || "").trim();
    }, 1)[0];
    var cancelTop = topCounts(cancellations, function (c) {
      return String(c.reason_category || "").trim();
    }, 1)[0];

    var venueIssues = venues.filter(function (v) {
      return String(v.has_issues || "").toLowerCase() === "yes";
    }).length;

    var payroll = timesheets.reduce(function (a, t) {
      return a + (Number(t.total_cost) || 0);
    }, 0);
    var hours = timesheets.reduce(function (a, t) {
      return a + (Number(t.total_hours) || 0);
    }, 0);
    var expenseTotal = expenses.reduce(function (a, e) {
      return a + (Number(e.total_amount) || 0);
    }, 0);
    var financeEmpty = timesheets.length === 0 && expenses.length === 0;

    var portalSet = {};
    visits.forEach(function (v) {
      var k = String(v.staff_user_id || "").trim();
      if (k) portalSet[k] = 1;
    });

    var recent = feedback.slice(0, 8);

    var headline;
    if (!logged) {
      headline = "No session feedback in the last " + WINDOW_DAYS + " days yet";
    } else {
      headline =
        logged +
        " sessions logged · " +
        Object.keys(participantsSet).length +
        " participants" +
        (attendanceRate != null ? " · " + attendanceRate + "% attendance" : "");
    }

    var updatedAt;
    try {
      updatedAt = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      updatedAt = new Date().toISOString();
    }

    return {
      headline: headline,
      updatedAt: updatedAt,
      monthLabel: monthLabel(),
      activeStaff: activeStaff,
      staffSub: leads ? leads + " leads on team" : "on the team",
      sessionsLogged: logged,
      participants: Object.keys(participantsSet).length,
      avgEngagement: avgEngagement,
      attendanceRate: attendanceRate,
      portalActive7d: Object.keys(portalSet).length,
      payroll: timesheets.length ? money(payroll) : "—",
      expenses: expenses.length ? money(expenseTotal) : "—",
      hours: hours ? hours + "h" : "—",
      financeEmpty: financeEmpty,
      incidents: incidents.length,
      incidentsAvailable: incidentsAvailable,
      incidentTop: incidentTop ? incidentTop.label + " (" + incidentTop.count + ")" : "",
      cancellations: cancellations.length,
      cancellationsAvailable: cancellationsAvailable,
      cancelTop: cancelTop ? cancelTop.label + " (" + cancelTop.count + ")" : "",
      venueIssues: venueIssues,
      venueTotal: venues.length,
      services: services,
      recent: recent,
    };
  }

  async function load() {
    var mount = document.getElementById("ceoStrategicMount");
    if (!mount) return;
    var client = getClient();
    if (!client) return;

    mount.innerHTML =
      '<p class="ceo-snap-muted" style="padding:8px 2px">Loading live snapshot…</p>';

    var since = isoDaysAgo(WINDOW_DAYS);
    var mStart = monthStartIso();
    var since7 = isoDaysAgo(7);

    var queries = [
      client
        .from("session_feedback")
        .select(
          "id, client_name, client_id, session_date, service, attendance, engagement_rating, completed_by_name, created_at"
        )
        .gte("session_date", since)
        .order("session_date", { ascending: false })
        .limit(2000),
      client
        .from("incident_reports")
        .select("id, incident_category, client_name, session_date, created_at")
        .gte("session_date", since)
        .order("session_date", { ascending: false })
        .limit(1000),
      client
        .from("cancellation_reports")
        .select("id, reason_category, cancellation_timing, session_date")
        .gte("session_date", since)
        .limit(1000),
      client
        .from("venue_reviews")
        .select("id, has_issues, review_date, venue")
        .gte("review_date", since)
        .limit(1000),
      client.from("staff_profiles").select("id, app_role, staff_role, is_active"),
      client
        .from("staff_timesheets")
        .select("total_hours, total_cost, period_month, status")
        .gte("period_month", mStart),
      client
        .from("expense_claims")
        .select("total_amount, claim_month, status")
        .gte("claim_month", mStart),
      client
        .from("portal_staff_visit_sessions")
        .select("staff_user_id, session_date")
        .gte("session_date", since7)
        .limit(2000),
    ];

    var settled = await Promise.allSettled(queries);
    var results = {
      feedback: settled[0],
      incidents: settled[1],
      cancellations: settled[2],
      venues: settled[3],
      staff: settled[4],
      timesheets: settled[5],
      expenses: settled[6],
      visits: settled[7],
    };

    try {
      mount.innerHTML = render(buildModel(results));
    } catch (e) {
      mount.innerHTML =
        '<p class="ceo-snap-muted" style="padding:8px 2px">Could not build the snapshot. ' +
        esc(e && e.message ? e.message : String(e)) +
        "</p>";
    }
  }

  function boot() {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      void load();
    }
    if (getClient()) {
      run();
      return;
    }
    window.addEventListener("portal:supabase-ready", run, { once: true });
    // Fallback: if the ready event was missed, poll briefly for the client.
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (done || tries > 30) {
        clearInterval(timer);
        return;
      }
      if (getClient()) {
        clearInterval(timer);
        run();
      }
    }, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
