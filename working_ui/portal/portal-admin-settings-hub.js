/**
 * Admin Settings hub — live session, data exports, payments/funding, ops counts, shortcuts.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    return esc(s).replace(/'/g, "&#39;");
  }

  function money(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return (
      "£" +
      Number(n).toLocaleString("en-GB", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  }

  function parseMoney(v) {
    if (v == null || v === "" || v === "—") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    var n = parseFloat(String(v).replace(/[£,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function payRows() {
    var src = global.CLIENTS_PAYMENTS_PORTAL_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function exportMeta(name) {
    var src = global[name];
    if (!src || !src.meta) return { loaded: false, label: name };
    var m = src.meta;
    return {
      loaded: true,
      label: name,
      rows: Array.isArray(src.rows) ? src.rows.length : 0,
      exportedAt: m.exportedAt || m.sourceFile || "",
      live: !!m.live,
      sourceFile: m.sourceFile || "",
    };
  }

  function aggregatePayments(rows) {
    var out = {
      rowCount: rows.length,
      outstanding: 0,
      billed: 0,
      paid: 0,
      outstandingFamilies: 0,
      byFund: {},
      laRows: 0,
      sheetParents: 0,
      sheetLa: 0,
    };
    var famOutstanding = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tot = parseMoney(r.tot);
      var paid = parseMoney(r.paid);
      var outN = parseMoney(r.out);
      var due = 0;
      if (outN != null && outN > 0.02) due = outN;
      else if (tot != null) {
        due = Math.max(0, tot - (paid != null ? paid : 0));
      }
      if (due > 0.02) {
        out.outstanding += due;
        var fam = String(r.parent || r.pax || i).trim();
        famOutstanding[fam] = (famOutstanding[fam] || 0) + due;
      }
      if (tot != null) out.billed += tot;
      if (paid != null) out.paid += paid;
      var fund = String(r.fund || "Other").trim() || "Other";
      out.byFund[fund] = (out.byFund[fund] || 0) + 1;
      if (r.sheet === "LA" || String(fund).toLowerCase().indexOf("authority") >= 0) {
        out.laRows++;
      }
      if (r.sheet === "LA") out.sheetLa++;
      else if (!r.sheet || r.sheet === "PARENTS") out.sheetParents++;
    }
    out.outstandingFamilies = Object.keys(famOutstanding).filter(function (k) {
      return famOutstanding[k] > 0.02;
    }).length;
    return out;
  }

  function sessionSnapshot() {
    var box = global.__PORTAL_SUPABASE__;
    var user = box && box.session && box.session.user;
    var prof = box && box.staff_profile;
    return {
      ok: !!(box && box.client && user && user.id),
      email: user && user.email ? String(user.email) : "",
      role: prof && prof.app_role ? String(prof.app_role) : "",
      name:
        (prof && (prof.full_name || prof.username)) ?
          String(prof.full_name || prof.username) :
        "",
    };
  }

  function notifySnapshot() {
    var perm =
      typeof Notification !== "undefined" ? Notification.permission : "unsupported";
    var vapid = !!(
      global.__PORTAL_VAPID_PUBLIC_KEY__ &&
      String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
    );
    return { permission: perm, vapid: vapid };
  }

  function termSnapshot() {
    var t = global.PORTAL_TERM_FROM_TIMETABLE || {};
    return {
      firstDate: String(t.firstDate || "").slice(0, 10),
      lastDate: String(t.lastDate || "").slice(0, 10),
      label: String(t.termLabel || t.label || "Current term").trim(),
    };
  }

  function queryLatePending(client) {
    if (
      global.PortalAdminLateSubmissions &&
      typeof global.PortalAdminLateSubmissions.fetchPendingCount === "function"
    ) {
      return global.PortalAdminLateSubmissions.fetchPendingCount();
    }
    if (!client || !client.from) return Promise.resolve(null);
    return client
      .from("portal_late_submission_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(function (res) {
        if (res.error) return null;
        return res.count != null ? res.count : null;
      })
      .catch(function () {
        return null;
      });
  }

  function queryClientPaymentsCount(client) {
    if (!client || !client.from) return Promise.resolve(null);
    return client
      .from("client_payments")
      .select("id", { count: "exact", head: true })
      .then(function (res) {
        if (res.error) return null;
        return res.count != null ? res.count : null;
      })
      .catch(function () {
        return null;
      });
  }

  function loadLivePayments(getClient) {
    return new Promise(function (resolve) {
      if (typeof global.portalLoadLivePaymentsSource !== "function") {
        resolve(false);
        return;
      }
      try {
        global.portalLoadLivePaymentsSource(function (ok) {
          resolve(!!ok);
        }, false);
      } catch (_e) {
        resolve(false);
      }
    });
  }

  /**
   * @param {{ getClient?: function, refreshKpis?: function, getOpsKpis?: function }} opts
   */
  function collect(opts) {
    opts = opts || {};
    var getClient =
      typeof opts.getClient === "function" ?
        opts.getClient :
        function () {
          var box = global.__PORTAL_SUPABASE__;
          return box && box.client ? box.client : null;
        };
    if (typeof opts.refreshKpis === "function") opts.refreshKpis();

    var client = getClient();
    var k =
      typeof opts.getOpsKpis === "function" ?
        opts.getOpsKpis() :
        (global.MOCK && global.MOCK.kpi) || {};

    return loadLivePayments(getClient).then(function () {
      return Promise.all([
        queryLatePending(client),
        queryClientPaymentsCount(client),
      ]).then(function (pair) {
        var rows = payRows();
        var pay = aggregatePayments(rows);
        var exports = {
          payments: exportMeta("CLIENTS_PAYMENTS_PORTAL_SOURCE"),
          participants: exportMeta("PARTICIPANTS_PARENTS_PORTAL_SOURCE"),
          feedback: exportMeta("SESSION_FEEDBACK_PORTAL_SOURCE"),
          absentees: exportMeta("ABSENTEES_CREDITS_PORTAL_SOURCE"),
        };
        return {
          collectedAt: new Date().toISOString(),
          session: sessionSnapshot(),
          notify: notifySnapshot(),
          term: termSnapshot(),
          portal: {
            host: global.location && global.location.host ? global.location.host : "",
            path: global.location && global.location.pathname ? global.location.pathname : "",
          },
          payments: Object.assign(pay, {
            liveTableCount: pair[1],
            source: exports.payments.live ?
              "client_payments" :
              exports.payments.loaded ?
                "export" :
                "none",
          }),
          exports: exports,
          ops: {
            latePending: pair[0],
            incidentsOpen: k.incidentsOpen != null ? k.incidentsOpen : null,
            absentsPending: k.cancellationsOpen != null ? k.cancellationsOpen : null,
            reportsPending: k.reportsPending != null ? k.reportsPending : null,
            onboardingPending: k.onboardingPending != null ? k.onboardingPending : null,
            participantsRows: k.participantsParentsRows != null ?
              k.participantsParentsRows :
              null,
            sessionFeedbackRows: k.sessionFeedbackRows != null ?
              k.sessionFeedbackRows :
              null,
          },
        };
      });
    });
  }

  function kpiTile(label, value, sub, viewTarget, alert) {
    var btn = viewTarget ?
      '<button type="button" class="admin-settings-kpi' +
        (alert ? " admin-settings-kpi--alert" : "") +
        '" data-view-target="' +
        escAttr(viewTarget) +
        '">' :
      '<div class="admin-settings-kpi' +
        (alert ? " admin-settings-kpi--alert" : "") +
        '">';
    var end = viewTarget ? "</button>" : "</div>";
    return (
      btn +
      '<span class="admin-settings-kpi__v">' +
      esc(value) +
      "</span>" +
      '<span class="admin-settings-kpi__l">' +
      esc(label) +
      "</span>" +
      (sub ?
        '<span class="admin-settings-kpi__s">' + esc(sub) + "</span>" :
        "") +
      end
    );
  }

  function fundChips(byFund) {
    var keys = Object.keys(byFund || {}).sort(function (a, b) {
      return (byFund[b] || 0) - (byFund[a] || 0);
    });
    if (!keys.length) return '<p class="muted" style="margin:0">No funding labels in export.</p>';
    return keys
      .slice(0, 8)
      .map(function (k) {
        return (
          '<span class="chip chip--info" style="margin:0 6px 6px 0;max-width:100%;overflow-wrap:break-word">' +
          esc(k) +
          " · " +
          esc(String(byFund[k])) +
          "</span>"
        );
      })
      .join("");
  }

  function exportRow(e) {
    if (!e.loaded) {
      return (
        '<tr><td style="min-width:0;overflow-wrap:break-word">' +
        esc(e.label) +
        '</td><td><span class="chip chip--pend">Not loaded</span></td><td class="muted">—</td><td class="muted">Add JS export or sign in for live tables</td></tr>'
      );
    }
    var chip = e.live ?
      '<span class="chip chip--ok">Live</span>' :
      '<span class="chip chip--info">Export</span>';
    var when = e.exportedAt ?
      String(e.exportedAt).slice(0, 10) :
      "—";
    var note = e.sourceFile ?
      esc(String(e.sourceFile)) :
      (e.live ? "Supabase" : "—");
    return (
      '<tr><td style="min-width:0;overflow-wrap:break-word">' +
      esc(e.label) +
      "</td><td>" +
      chip +
      '</td><td style="white-space:nowrap">' +
      esc(String(e.rows)) +
      '</td><td class="muted" style="min-width:0;overflow-wrap:break-word;font-size:12px">' +
      note +
      " · " +
      esc(when) +
      "</td></tr>"
    );
  }

  function renderHtml(snap) {
    snap = snap || {};
    var sess = snap.session || {};
    var n = snap.notify || {};
    var pay = snap.payments || {};
    var ops = snap.ops || {};
    var ex = snap.exports || {};
    var term = snap.term || {};

    var sessChip = sess.ok ?
      '<span class="chip chip--ok">Signed in</span>' :
      '<span class="chip chip--urg">Not connected</span>';
    var roleLine = sess.role ?
      " · " + esc(sess.role) :
      "";
    var notifyLine =
      n.permission === "granted" ?
        "Browser notifications allowed" :
        n.permission === "denied" ?
          "Blocked in browser — allow in site settings" :
          "Not enabled yet";
    if (n.vapid) notifyLine += " · VAPID configured";
    else notifyLine += " · VAPID missing (closed-tab push disabled)";

    var paySource =
      pay.source === "client_payments" ?
        "Programme payments (Supabase)" :
        pay.source === "export" ?
          "Clients Payments export" :
          "No payment data — open Programme payments or load export";

    var lateN = ops.latePending != null ? ops.latePending : "—";
    var kpiRow =
      '<div class="admin-settings-kpi-grid">' +
      kpiTile(
        "Outstanding",
        money(pay.outstanding),
        pay.outstandingFamilies + " families · " + paySource,
        "orders_outstanding",
        pay.outstanding > 500,
      ) +
      kpiTile(
        "Late approvals",
        String(lateN),
        "Past-session forms",
        "c4k_late_submissions",
        lateN > 0,
      ) +
      kpiTile(
        "Open incidents",
        String(ops.incidentsOpen != null ? ops.incidentsOpen : "—"),
        "Needs admin sign-off",
        "incidents",
        ops.incidentsOpen > 0,
      ) +
      kpiTile(
        "Absents pending",
        String(ops.absentsPending != null ? ops.absentsPending : "—"),
        "Credits / refunds queue",
        "absents_refunds",
        ops.absentsPending > 0,
      ) +
      kpiTile(
        "Payment rows",
        String(pay.rowCount || 0),
        pay.liveTableCount != null ?
          "Live table: " + pay.liveTableCount + " rows" :
          "In merged source",
        "c4k_payments",
        false,
      ) +
      kpiTile(
        "LA / NHS rows",
        String(pay.laRows || 0),
        "Authority & NHS ledger lines",
        "c4k_payments",
        false,
      ) +
      "</div>";

    var shortcuts =
      '<div class="admin-settings-links">' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="c4k_payments">Programme payments</button> ' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="orders_all">Orders catalogue</button> ' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="comms_ops">Ops comms &amp; log</button> ' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="portal_activity">Activity log</button> ' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="logs">Change log</button> ' +
      '<button type="button" class="btn btn--sec btn--sm" data-view-target="portal_training_progress">Training progress</button> ' +
      "</div>";

    return (
      '<h1 class="page-title">Settings</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">Session health, programme money, data exports, and shortcuts — everything ops needs without hunting the menu.</p>' +
      '<div class="card card-pad" style="margin-bottom:14px;border-color:#c5d9ef;background:linear-gradient(180deg,#f8fbff,#eef5fc)">' +
      '<h3 style="margin:0 0 8px;font-size:14px">Admin portal guide</h3>' +
      '<p class="muted" style="margin:0 0 12px;max-width:42rem;overflow-wrap:break-word">How this app is organised and how it differs from the staff phone dashboard.</p>' +
      '<a class="btn btn--pri btn--sm" href="/admin_portal_guide.html" target="_blank" rel="noopener">Open admin portal guide</a> ' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalAdminGuideReadLogBtn" style="margin-left:8px">Staff guide — who marked read</button></div>' +
      '<div class="card card-pad" style="margin-bottom:14px;border-color:#e8d9a8;background:linear-gradient(180deg,#fffdf5,#fff8e6)">' +
      '<h3 style="margin:0 0 8px;font-size:14px">Device notifications</h3>' +
      '<p class="muted" style="margin:0 0 8px;max-width:42rem;overflow-wrap:break-word">' +
      esc(notifyLine) +
      ".</p>" +
      '<button type="button" class="btn btn--pri btn--sm" data-open="alertsNotificationsSheet">Manage notifications</button></div>' +
      kpiRow +
      '<div class="grid-2" style="margin-top:14px;align-items:start">' +
      '<div class="card card-pad" style="min-width:0">' +
      '<h3 style="margin:0 0 10px;font-size:14px">Connections</h3>' +
      '<p style="margin:0 0 8px">' +
      sessChip +
      "</p>" +
      '<p class="muted" style="margin:0 0 6px;overflow-wrap:break-word"><strong style="color:var(--ink)">' +
      esc(sess.name || "—") +
      "</strong>" +
      roleLine +
      "</p>" +
      '<p class="muted" style="margin:0 0 6px;font-size:12px;overflow-wrap:break-word">' +
      esc(sess.email || "—") +
      "</p>" +
      '<p class="muted" style="margin:0 0 6px;font-size:12px;overflow-wrap:break-word">Host: <code>' +
      esc(snap.portal && snap.portal.host ? snap.portal.host : "—") +
      "</code> · <code>admin_dashboard.html</code></p>" +
      '<p class="muted" style="margin:0;font-size:12px;overflow-wrap:break-word">Term: <strong style="color:var(--ink)">' +
      esc(term.label) +
      "</strong>" +
      (term.firstDate ?
        " (" + esc(term.firstDate) + " → " + esc(term.lastDate) + ")" :
        "") +
      "</p></div>" +
      '<div class="card card-pad" style="min-width:0">' +
      '<h3 style="margin:0 0 10px;font-size:14px">Programme money</h3>' +
      '<p class="muted" style="margin:0 0 8px;font-size:12px;overflow-wrap:break-word">' +
      esc(paySource) +
      ".</p>" +
      '<p class="muted" style="margin:0">Billed <strong style="color:var(--ink)">' +
      money(pay.billed) +
      "</strong> · Collected <strong style=\"color:var(--ink)\">" +
      money(pay.paid) +
      '</strong> · <span style="color:#b91c1c;font-weight:700">Due ' +
      money(pay.outstanding) +
      "</span></p>" +
      '<div style="margin-top:10px;min-width:0">' +
      fundChips(pay.byFund) +
      "</div></div></div>" +
      '<div class="card" style="margin-top:14px;min-width:0">' +
      '<div class="card-h"><h3 style="margin:0;font-size:14px">Data exports loaded in this browser</h3></div>' +
      '<div class="card-pad" style="padding-top:0;overflow:auto">' +
      '<table class="tbl" style="min-width:0"><thead><tr><th>Source</th><th>Mode</th><th>Rows</th><th>Notes</th></tr></thead><tbody>' +
      exportRow(ex.payments || { label: "Clients Payments" }) +
      exportRow(ex.participants || { label: "Participants & parents" }) +
      exportRow(ex.feedback || { label: "Session feedback" }) +
      exportRow(ex.absentees || { label: "Absentees & credits" }) +
      "</tbody></table></div></div>" +
      '<div class="card" style="margin-top:14px"><div class="card-pad" style="min-width:0">' +
      '<h3 style="margin:0 0 10px;font-size:14px">Quick links</h3>' +
      shortcuts +
      '<div class="toolbar" style="margin-top:14px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sec" data-open-report>Report generator</button> ' +
      '<button type="button" class="btn btn--ghost" data-portal-logout>Log out</button>' +
      "</div>" +
      '<p class="muted" style="margin:10px 0 0;font-size:11px;overflow-wrap:break-word">Snapshot: ' +
      esc(
        snap.collectedAt ?
          new Date(snap.collectedAt).toLocaleString("en-GB") :
          "—",
      ) +
      "</p></div></div>"
    );
  }

  function renderLoading() {
    return (
      '<h1 class="page-title">Settings</h1>' +
      '<p class="page-intro">Loading session, payments, and operational counts…</p>' +
      '<div class="card card-pad"><p class="muted" style="margin:0">Please wait.</p></div>'
    );
  }

  global.PortalAdminSettingsHub = {
    collect: collect,
    renderHtml: renderHtml,
    renderLoading: renderLoading,
  };
})(typeof window !== "undefined" ? window : globalThis);
