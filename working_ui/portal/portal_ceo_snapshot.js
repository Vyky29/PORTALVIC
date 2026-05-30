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

  function yearStartIso() {
    return new Date().getFullYear() + "-01-01";
  }

  // 'YYYY-MM' bucket key from any date-ish value.
  function mKey(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d.getTime())) return null;
    var m = d.getMonth() + 1;
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m);
  }

  function currentMonthKey() {
    var d = new Date();
    var m = d.getMonth() + 1;
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m);
  }

  /**
   * Full salary + client-money picture, mirroring payroll-yearly.html:
   *  - staff_timesheets (deduped latest per user|month) + staff_timesheet_imports
   *    (pay_type 'contract' = base salary, else extra/timesheet), minus double counts
   *    for users who have a contract import.
   *  - expense_claims (excluding rejected).
   *  - client_payments: amount received so far (status starting "paid").
   */
  function computeFinance(timesheets, imports, expenses, payments) {
    var contractUserIds = {};
    imports.forEach(function (im) {
      if (String(im.pay_type || "") === "contract") {
        var u = String(im.user_id || "");
        if (u) contractUserIds[u] = 1;
      }
    });

    var latest = {};
    timesheets.forEach(function (r) {
      var uid = String(r.submitted_by_user_id || "");
      if (!uid || contractUserIds[uid]) return;
      var k = mKey(r.period_month);
      if (!k) return;
      var key = uid + "|" + k;
      var prev = latest[key];
      if (!prev || new Date(r.created_at || 0) > new Date(prev.created_at || 0)) {
        latest[key] = r;
      }
    });

    var months = {};
    function bucket(k) {
      if (!months[k]) months[k] = { ts: 0, contract: 0, exp: 0, hours: 0 };
      return months[k];
    }
    var submitted = {};
    Object.keys(latest).forEach(function (key) {
      var r = latest[key];
      var k = key.split("|")[1];
      var b = bucket(k);
      b.ts += Number(r.total_cost || 0);
      b.hours += Number(r.total_hours || 0);
      submitted[key] = 1;
    });
    imports.forEach(function (im) {
      var k = mKey(im.period_month);
      if (!k) return;
      var gross = Number(im.gross || 0);
      if (String(im.pay_type || "timesheet") === "contract") {
        bucket(k).contract += gross;
      } else {
        var uid = String(im.user_id || "");
        if (uid && submitted[uid + "|" + k]) return;
        bucket(k).ts += gross;
      }
    });
    expenses.forEach(function (ex) {
      if (String(ex.status || "") === "rejected") return;
      var k = mKey(ex.claim_month) || mKey(ex.submitted_on) || mKey(ex.created_at);
      if (!k) return;
      bucket(k).exp += Number(ex.total_amount || 0);
    });

    var curK = currentMonthKey();
    var curYear = String(new Date().getFullYear());
    var monthB = months[curK] || { ts: 0, contract: 0, exp: 0, hours: 0 };
    var ytdSal = 0, ytdExp = 0;
    Object.keys(months).forEach(function (k) {
      if (k.slice(0, 4) !== curYear) return;
      ytdSal += months[k].ts + months[k].contract;
      ytdExp += months[k].exp;
    });

    var clientsPaid = 0, clientsPaidN = 0, clientsBilled = 0;
    payments.forEach(function (p) {
      var a = Number(p.amount) || 0;
      var s = String(p.payment_status || "").toLowerCase();
      var notReenrol = s.indexOf("re-enrol") >= 0 || s.indexOf("reenrol") >= 0;
      if (!notReenrol) clientsBilled += a;
      if (s.indexOf("paid") === 0) {
        clientsPaid += a;
        clientsPaidN += 1;
      }
    });

    return {
      monthSal: monthB.ts + monthB.contract,
      monthExp: monthB.exp,
      monthHours: monthB.hours,
      ytdSal: ytdSal,
      ytdExp: ytdExp,
      hasSalary: timesheets.length > 0 || imports.length > 0,
      hasExpense: expenses.length > 0,
      clientsPaid: clientsPaid,
      clientsPaidN: clientsPaidN,
      clientsBilled: clientsBilled,
      hasPayments: payments.length > 0
    };
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

  function fmtDayMonth(d) {
    try {
      return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function startOfWeek(d) {
    var x = new Date(d);
    if (isNaN(x.getTime())) return null;
    var day = (x.getDay() + 6) % 7; // Monday = 0
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
  }

  function weeklyTrend(feedback, weeks) {
    weeks = weeks || 10;
    var now = startOfWeek(new Date());
    var buckets = [];
    var index = {};
    for (var i = weeks - 1; i >= 0; i--) {
      var ws = new Date(now);
      ws.setDate(ws.getDate() - i * 7);
      var key = ws.toISOString().slice(0, 10);
      var b = { key: key, label: fmtDayMonth(ws), count: 0 };
      index[key] = b;
      buckets.push(b);
    }
    feedback.forEach(function (f) {
      if (!f.session_date) return;
      var sw = startOfWeek(f.session_date);
      if (!sw) return;
      var k = sw.toISOString().slice(0, 10);
      if (index[k]) index[k].count += 1;
    });
    return buckets;
  }

  function renderBars(items) {
    if (!items || !items.length) {
      return '<p class="ceo-snap-muted">No session feedback in window.</p>';
    }
    var max = items.reduce(function (m, s) {
      return Math.max(m, s.count);
    }, 0) || 1;
    return (
      '<div class="ceo-snap-bars">' +
      items
        .map(function (s) {
          var w = Math.max(3, Math.round((s.count / max) * 100));
          return (
            '<div class="ceo-snap-bar-row"><span class="ceo-snap-bar-lab" title="' +
            esc(s.label) +
            '">' +
            esc(s.label) +
            '</span><span class="ceo-snap-bar-track"><span class="ceo-snap-bar-fill" style="width:' +
            w +
            '%"></span></span><span class="ceo-snap-bar-val">' +
            esc(s.count) +
            " · " +
            esc(s.pct) +
            "%</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderTrend(trend) {
    var total = trend.reduce(function (a, b) {
      return a + b.count;
    }, 0);
    if (!total) {
      return '<p class="ceo-snap-muted">No sessions logged in the trend window.</p>';
    }
    var max = trend.reduce(function (m, b) {
      return Math.max(m, b.count);
    }, 0) || 1;
    return (
      '<div class="ceo-snap-trend">' +
      trend
        .map(function (b) {
          var h = b.count ? Math.max(4, Math.round((b.count / max) * 100)) : 0;
          return (
            '<div class="ceo-snap-trend-col"><span class="ceo-snap-trend-val">' +
            (b.count ? esc(b.count) : "") +
            '</span><span class="ceo-snap-trend-bar-wrap"><span class="ceo-snap-trend-bar" style="height:' +
            h +
            '%"></span></span><span class="ceo-snap-trend-lab">' +
            esc(b.label) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function rows(res) {
    if (!res || res.status !== "fulfilled" || !res.value) return [];
    var data = res.value.data;
    return Array.isArray(data) ? data : [];
  }

  function isPresent(attendance) {
    var a = String(attendance || "").trim().toLowerCase();
    if (!a) return false;
    // Session feedback stores attendance as "Yes"/"No" (absences go via the Absent quick mark).
    if (a === "no" || /\bnot\b|no[ -]?show|absent|cancel|did not/.test(a)) return false;
    if (a === "yes" || /attend|present|late|^y$/.test(a)) return true;
    return false;
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
      kpi(
        "Portal active (7d)",
        model.portalAvailable ? model.portalActive7d : "—",
        model.portalAvailable ? "staff used the app" : "run visit-sessions migration"
      ) +
      "</div>";

    var clientsLine = model.hasPayments
      ? '<p class="ceo-snap-muted" style="margin:8px 0 0">Clients: <strong style="color:var(--ink)">' +
        esc(model.clientsPaidCount) +
        "</strong> payment" + (model.clientsPaidCount === 1 ? "" : "s") +
        " received · of " +
        esc(money(model.clientsBilled)) +
        " billed</p>"
      : "";

    var finance =
      '<div class="ceo-snap-card"><div class="ceo-snap-card-h">Finance · ' +
      esc(model.monthLabel) +
      '</div><div class="ceo-snap-card-p">' +
      '<div class="ceo-snap-grid2">' +
      '<div><p class="ceo-snap-muted" style="margin:0 0 6px">Salaries this month</p><p style="margin:0;font-size:22px;font-weight:700;color:var(--ink)">' +
      esc(model.payroll) +
      "</p></div>" +
      '<div><p class="ceo-snap-muted" style="margin:0 0 6px">Client payments received</p><p style="margin:0;font-size:22px;font-weight:700;color:var(--ink)">' +
      esc(model.clientsPaid) +
      "</p></div></div>" +
      '<p class="ceo-snap-muted" style="margin:14px 0 0">Hours submitted this month <strong style="color:var(--ink)">' +
      esc(model.hours) +
      "</strong> · expense claims <strong style=\"color:var(--ink)\">" +
      esc(model.expenses) +
      "</strong>" +
      (model.financeEmpty
        ? ' · <span style="color:var(--muted)">no finance data yet</span>'
        : "") +
      "</p>" +
      '<p class="ceo-snap-muted" style="margin:8px 0 0">Year to date: salaries <strong style="color:var(--ink)">' +
      esc(model.ytdSalaries) +
      "</strong> · expenses <strong style=\"color:var(--ink)\">" +
      esc(model.ytdExpenses) +
      "</strong></p>" +
      clientsLine +
      "</div></div>";

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

    var charts =
      '<div id="ceo-charts" class="ceo-snap-grid2" style="margin-bottom:14px">' +
      '<div class="ceo-snap-card"><div class="ceo-snap-card-h">Weekly trend · sessions logged</div>' +
      '<div class="ceo-snap-card-p">' +
      renderTrend(model.trend) +
      '<p class="ceo-snap-muted" style="margin-top:10px">Last ' +
      model.trend.length +
      " weeks (week beginning Monday).</p></div></div>" +
      '<div class="ceo-snap-card"><div class="ceo-snap-card-h">Sessions per service</div>' +
      '<div class="ceo-snap-card-p">' +
      renderBars(model.services) +
      "</div></div>" +
      "</div>";

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
      '<div class="ceo-snap-card" style="margin-bottom:14px"><div class="ceo-snap-card-h">Welfare &amp; operations</div>' +
      '<div class="ceo-snap-card-p">' +
      welfareLines +
      "</div></div>";

    return hero + kpis + charts + finance + welfare + recent;
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
    var imports = rows(results.imports);
    var payments = rows(results.payments);
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

    var fin = computeFinance(timesheets, imports, expenses, payments);
    var financeEmpty = !fin.hasSalary && !fin.hasExpense && !fin.hasPayments;

    var portalAvailable =
      results.visits && results.visits.status === "fulfilled" && !results.visits.value.error;
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
      portalAvailable: portalAvailable,
      payroll: fin.hasSalary ? money(fin.monthSal) : "—",
      expenses: fin.hasExpense ? money(fin.monthExp) : "—",
      hours: fin.monthHours ? fin.monthHours + "h" : "—",
      ytdSalaries: fin.hasSalary ? money(fin.ytdSal) : "—",
      ytdExpenses: fin.hasExpense ? money(fin.ytdExp) : "—",
      clientsPaid: fin.hasPayments ? money(fin.clientsPaid) : "—",
      clientsPaidCount: fin.clientsPaidN,
      clientsBilled: fin.clientsBilled,
      clientsPaidValue: fin.clientsPaid,
      hasPayments: fin.hasPayments,
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
      trend: weeklyTrend(feedback, 10),
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
    var yStart = yearStartIso();
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
        .select("submitted_by_user_id, total_hours, total_cost, period_month, created_at, status")
        .gte("period_month", yStart),
      client
        .from("expense_claims")
        .select("total_amount, claim_month, submitted_on, created_at, status")
        .gte("claim_month", yStart),
      client
        .from("portal_staff_visit_sessions")
        .select("staff_user_id, session_date")
        .gte("session_date", since7)
        .limit(2000),
      client
        .from("staff_timesheet_imports")
        .select("user_id, period_month, pay_type, gross"),
      client
        .from("client_payments")
        .select("payment_status, amount"),
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
      imports: settled[8],
      payments: settled[9],
    };

    try {
      mount.innerHTML = render(buildModel(results));
      try {
        window.dispatchEvent(new CustomEvent("portal:ceo-snapshot-rendered"));
      } catch (e2) {}
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
