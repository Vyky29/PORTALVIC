/**
 * Admin UI: late session feedback log + approve/reject past-session incident requests.
 * Feedback and instructor cancellations are self-serve; this screen lists late feedback
 * and incidents that still need approval.
 */
(function () {
  "use strict";

  var TABLE = "portal_late_submission_requests";
  var FEEDBACK_TABLE = "session_feedback";
  var LONDON_TZ = "Europe/London";
  var _esc = function (s) {
    return String(s == null ? "" : s);
  };
  var _toast = null;
  var _getClient = null;
  var _getAuthUid = null;

  function client() {
    try {
      if (typeof _getClient === "function") {
        var c = _getClient();
        if (c) return c;
      }
    } catch (_) {}
    try {
      var box = window.__PORTAL_SUPABASE__;
      if (box && box.client) return box.client;
    } catch (_) {}
    return null;
  }

  var _bootstrapTried = false;

  async function tryBootstrapPortal() {
    if (client()) return true;
    if (_bootstrapTried) return !!client();
    _bootstrapTried = true;
    try {
      var mod = await import(
        "/portal/auth-handler.js?v=20260430-portalauth5"
      );
      if (mod && typeof mod.bootstrapDashboardSupabase === "function") {
        await mod.bootstrapDashboardSupabase({ page: "admin" });
      }
      if (client()) return true;
      if (mod && typeof mod.getSupabaseClient === "function") {
        var sb = mod.getSupabaseClient();
        var sessRes = await sb.auth.getSession();
        var session =
          sessRes && sessRes.data && sessRes.data.session
            ? sessRes.data.session
            : null;
        if (session && session.user && session.user.id) {
          window.__PORTAL_SUPABASE__ = window.__PORTAL_SUPABASE__ || {};
          window.__PORTAL_SUPABASE__.client = sb;
          window.__PORTAL_SUPABASE__.session = session;
          try {
            window.dispatchEvent(
              new CustomEvent("portal:supabase-ready", {
                detail: window.__PORTAL_SUPABASE__,
              })
            );
          } catch (_) {}
          return true;
        }
      }
    } catch (err) {
      console.debug("[late-admin] bootstrap:", err);
    }
    return !!client();
  }

  function waitForClientQuick(maxMs) {
    var c = client();
    if (c) return Promise.resolve(c);
    var limit = typeof maxMs === "number" ? maxMs : 3500;
    return new Promise(function (resolve) {
      var done = false;
      function tryFinish() {
        if (done) return;
        var cx = client();
        if (cx) {
          done = true;
          resolve(cx);
        }
      }
      try {
        window.addEventListener("portal:supabase-ready", tryFinish, { once: true });
      } catch (_) {}
      var t0 = Date.now();
      var iv = setInterval(function () {
        tryFinish();
        if (done || Date.now() - t0 >= limit) {
          clearInterval(iv);
          if (!done) resolve(null);
        }
      }, 200);
    });
  }

  function waitForClient(maxMs, opts) {
    opts = opts || {};
    var c = client();
    if (c) return Promise.resolve(c);
    var limit = typeof maxMs === "number" ? maxMs : 18000;
    var boot = opts.tryBootstrap === true
      ? tryBootstrapPortal()
      : Promise.resolve();
    return boot.then(function () {
      c = client();
      if (c) return c;
      return new Promise(function (resolve) {
        var done = false;
        function tryFinish() {
          if (done) return;
          var cx = client();
          if (cx) {
            done = true;
            resolve(cx);
          }
        }
        try {
          window.addEventListener("portal:supabase-ready", tryFinish, {
            once: true,
          });
        } catch (_) {}
        var t0 = Date.now();
        var iv = setInterval(function () {
          tryFinish();
          if (done || Date.now() - t0 >= limit) {
            clearInterval(iv);
            if (!done) resolve(null);
          }
        }, 250);
      });
    });
  }

  function authUid() {
    try {
      if (typeof _getAuthUid === "function") return _getAuthUid() || "";
    } catch (_) {}
    try {
      var box = window.__PORTAL_SUPABASE__;
      if (box && box.session && box.session.user && box.session.user.id) {
        return box.session.user.id;
      }
    } catch (_) {}
    return "";
  }

  function typeLabel(t) {
    var x = String(t || "").toLowerCase();
    if (x === "cancellation") return "Cancellation";
    if (x === "incident") return "Incident";
    return "Feedback";
  }

  function statusChip(status) {
    var s = String(status || "").toLowerCase();
    if (s === "approved") return '<span class="chip chip--ok">Approved</span>';
    if (s === "rejected") return '<span class="chip chip--urg">Rejected</span>';
    return '<span class="chip">Pending</span>';
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return _esc(iso);
      return d.toLocaleString("en-GB", {
        timeZone: LONDON_TZ,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (_) {
      return _esc(iso);
    }
  }

  function londonIsoDay(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: LONDON_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch (_) {
      return "";
    }
  }

  function formatSessionDate(isoDay) {
    var s = String(isoDay || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
    try {
      var d = new Date(s + "T12:00:00Z");
      return d.toLocaleDateString("en-GB", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_) {
      return s;
    }
  }

  function timeFromKeyOrField(sessionTime, portalKey) {
    var t = String(sessionTime || "").trim();
    if (t) return t;
    var parts = String(portalKey || "").split("|");
    if (parts.length >= 2 && parts[1]) return String(parts[1]).trim();
    return "—";
  }

  function staffName(map, uid) {
    var p = map && map[uid];
    if (!p) return "Staff";
    return (
      String(p.full_name || p.username || "")
        .trim() || "Staff"
    );
  }

  async function loadStaffNames(ids) {
    var out = {};
    var list = (ids || []).filter(Boolean);
    if (!list.length) return out;
    var c = client();
    if (!c) return out;
    try {
      var res = await c
        .from("staff_profiles")
        .select("id,full_name,username")
        .in("id", list);
      if (res.error || !res.data) return out;
      res.data.forEach(function (row) {
        if (row && row.id) out[row.id] = row;
      });
    } catch (_) {}
    return out;
  }

  function setStatus(text, isError) {
    var el = document.getElementById("portalLateAdminStatus");
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.toggle("is-error", !!isError);
  }

  function roleHint() {
    try {
      var p =
        window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
      if (!p) return "";
      var name = String(p.full_name || p.username || "").trim() || "Admin";
      var role = String(p.app_role || "").trim();
      var staff = String(p.staff_role || "").trim();
      return name + (role ? " · " + role : "") + (staff ? " / " + staff : "");
    } catch (_) {
      return "";
    }
  }

  function portalFallbackToday() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function isLateFeedbackRow(row) {
    if (!row || !row.session_date || !row.created_at) return false;
    var sess = String(row.session_date).slice(0, 10);
    var parts = null;
    try {
      var d = new Date(row.created_at);
      if (isNaN(d.getTime())) return false;
      var fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: LONDON_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      var fp = fmt.formatToParts(d);
      var get = function (t) {
        for (var i = 0; i < fp.length; i++) {
          if (fp[i].type === t) return fp[i].value;
        }
        return "";
      };
      var hour = Number(get("hour"));
      if (hour === 24) hour = 0;
      parts = {
        date: get("year") + "-" + get("month") + "-" + get("day"),
        hour: hour,
        minute: Number(get("minute") || 0) || 0,
        second: Number(get("second") || 0) || 0,
      };
    } catch (_) {
      return false;
    }
    if (!parts || !parts.date) return false;
    if (parts.date > sess) return true;
    if (parts.date < sess) return false;
    var mins = parts.hour * 60 + parts.minute + (parts.second > 0 ? 1 : 0);
    return mins > 21 * 60;
  }

  var CLEAR_TABLE = "portal_late_feedback_pay_clearances";

  var DOW_LONG = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  var DAY_COLORS = [
    "#3b82f6",
    "#8b5cf6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#6366f1",
  ];
  var DAY_SOFT = [
    "rgba(59,130,246,.15)",
    "rgba(139,92,246,.15)",
    "rgba(6,182,212,.15)",
    "rgba(16,185,129,.15)",
    "rgba(245,158,11,.15)",
    "rgba(236,72,153,.15)",
    "rgba(99,102,241,.15)",
  ];

  function parseIsoDayParts(iso) {
    var s = String(iso || "").slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }

  function addDaysIso(iso, delta) {
    var p = parseIsoDayParts(iso);
    if (!p) return "";
    var dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function mondayOfWeekIso(iso) {
    var p = parseIsoDayParts(iso);
    if (!p) return "";
    var dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
    var dow = dt.getUTCDay(); // 0 Sun … 6 Sat
    var toMon = dow === 0 ? -6 : 1 - dow;
    dt.setUTCDate(dt.getUTCDate() + toMon);
    return dt.toISOString().slice(0, 10);
  }

  function weekDaysMonSun(mondayIso) {
    var mon = mondayOfWeekIso(mondayIso);
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDaysIso(mon, i));
    return out;
  }

  function formatDdMm(iso) {
    var p = parseIsoDayParts(iso);
    if (!p) return "—";
    return (
      String(p.d).padStart(2, "0") + "/" + String(p.mo).padStart(2, "0")
    );
  }

  function weekRangeLabel(mondayIso) {
    var days = weekDaysMonSun(mondayIso);
    if (days.length < 7) return "—";
    return formatDdMm(days[0]) + " – " + formatDdMm(days[6]);
  }

  function utcFloorForLondonDay(isoDay) {
    // London midnight is UTC 23:00 previous day in BST, or 00:00 in GMT.
    // Pull from noon UTC of previous calendar day to be safe.
    return addDaysIso(isoDay, -1) + "T12:00:00.000Z";
  }

  function utcCeilForLondonDay(isoDay) {
    return addDaysIso(isoDay, 2) + "T12:00:00.000Z";
  }

  var _weekState = {
    monday: "",
    selectedDay: "",
    weekRows: [],
  };

  function enrichLateRow(r) {
    r._completed_day = londonIsoDay(r.created_at);
    r._completed_when = formatWhen(r.created_at);
    r._session_time = timeFromKeyOrField(r.session_time, r.portal_session_key);
    r._staff_name = String(r.completed_by_name || "").trim() || "Staff";
    return r;
  }

  function countsByCompletedDay(rows) {
    var map = Object.create(null);
    (rows || []).forEach(function (r) {
      var d = r._completed_day || londonIsoDay(r.created_at);
      if (!d) return;
      map[d] = (map[d] || 0) + 1;
    });
    return map;
  }

  function pickDefaultSelectedDay(days, counts, londonToday) {
    if (londonToday && days.indexOf(londonToday) >= 0) return londonToday;
    for (var i = days.length - 1; i >= 0; i--) {
      if ((counts[days[i]] || 0) > 0) return days[i];
    }
    return days[days.length - 1] || londonToday || "";
  }

  window.PortalAdminLateSubmissions = {
    configure: function (opts) {
      opts = opts || {};
      if (typeof opts.esc === "function") _esc = opts.esc;
      if (typeof opts.toast === "function") _toast = opts.toast;
      if (typeof opts.getClient === "function") _getClient = opts.getClient;
      if (typeof opts.getAuthUid === "function") _getAuthUid = opts.getAuthUid;
    },

    fetchPendingCount: async function () {
      var c = client() || (await waitForClientQuick(2500));
      if (!c) return 0;
      try {
        var res = await c
          .from(TABLE)
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("submission_type", "incident");
        if (res.error) {
          var res2 = await c
            .from(TABLE)
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .neq("submission_type", "feedback")
            .neq("submission_type", "cancellation");
          if (res2.error) return 0;
          return typeof res2.count === "number" ? res2.count : 0;
        }
        return typeof res.count === "number" ? res.count : 0;
      } catch (_) {
        return 0;
      }
    },

    fetchLateFeedbackForWeek: async function (mondayIso) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            "Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh.",
          rows: [],
          days: [],
          counts: {},
        };
      }
      var londonToday =
        londonIsoDay(new Date().toISOString()) || portalFallbackToday();
      var monday = mondayOfWeekIso(mondayIso || londonToday);
      var days = weekDaysMonSun(monday);
      var floor = utcFloorForLondonDay(days[0]);
      var ceil = utcCeilForLondonDay(days[6]);
      try {
        var res = await c
          .from(FEEDBACK_TABLE)
          .select(
            "id,created_at,session_date,session_time,client_name,service,completed_by_name,submitted_by_user_id,portal_session_key,attendance"
          )
          .gte("created_at", floor)
          .lt("created_at", ceil)
          .order("created_at", { ascending: false })
          .limit(800);
        if (res.error) {
          return {
            ok: false,
            error: res.error.message || "fetch_failed",
            rows: [],
            days: days,
            counts: {},
          };
        }
        var rows = (res.data || [])
          .filter(isLateFeedbackRow)
          .map(enrichLateRow)
          .filter(function (r) {
            return days.indexOf(r._completed_day) >= 0;
          });
        var clearedMap = Object.create(null);
        try {
          var staffIds = [];
          var seenStaff = Object.create(null);
          rows.forEach(function (r) {
            var uid = String(r.submitted_by_user_id || "").trim();
            if (uid && !seenStaff[uid]) {
              seenStaff[uid] = true;
              staffIds.push(uid);
            }
          });
          var sessDates = [];
          var seenSess = Object.create(null);
          rows.forEach(function (r) {
            var sd = String(r.session_date || "").slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && !seenSess[sd]) {
              seenSess[sd] = true;
              sessDates.push(sd);
            }
          });
          if (staffIds.length && sessDates.length) {
            var clr = await c
              .from(CLEAR_TABLE)
              .select("staff_user_id,session_date,cleared_at")
              .in("staff_user_id", staffIds)
              .in("session_date", sessDates);
            if (!clr.error && Array.isArray(clr.data)) {
              clr.data.forEach(function (row) {
                var k =
                  String(row.staff_user_id || "").trim() +
                  "|" +
                  String(row.session_date || "").slice(0, 10);
                clearedMap[k] = row;
              });
            }
          }
        } catch (_) {}
        rows.forEach(function (r) {
          var k =
            String(r.submitted_by_user_id || "").trim() +
            "|" +
            String(r.session_date || "").slice(0, 10);
          r._pay_cleared = !!clearedMap[k];
          r._clear_key = k;
        });
        return {
          ok: true,
          rows: rows,
          days: days,
          monday: monday,
          counts: countsByCompletedDay(rows),
          londonToday: londonToday,
        };
      } catch (e) {
        return {
          ok: false,
          error: String(e && e.message ? e.message : e),
          rows: [],
          days: days,
          counts: {},
        };
      }
    },

    /** @deprecated prefer fetchLateFeedbackForWeek */
    fetchLateFeedback: async function () {
      var today =
        londonIsoDay(new Date().toISOString()) || portalFallbackToday();
      return this.fetchLateFeedbackForWeek(mondayOfWeekIso(today));
    },

    fetchRequests: async function (statusFilter) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            "Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh.",
          rows: [],
        };
      }
      var filter = String(statusFilter || "pending").toLowerCase();
      try {
        var q = c
          .from(TABLE)
          .select(
            "id,created_at,updated_at,staff_user_id,portal_session_key,session_date,submission_type,client_name,service_label,status,admin_note,reviewed_at,reviewed_by_user_id"
          )
          .eq("submission_type", "incident")
          .order("created_at", { ascending: false })
          .limit(120);
        if (filter !== "all") q = q.eq("status", filter);
        var res = await q;
        if (res.error) {
          return { ok: false, error: res.error.message || "fetch_failed", rows: [] };
        }
        var rows = res.data || [];
        var ids = [];
        rows.forEach(function (r) {
          if (r && r.staff_user_id && ids.indexOf(r.staff_user_id) < 0) {
            ids.push(r.staff_user_id);
          }
        });
        var staffMap = await loadStaffNames(ids);
        rows.forEach(function (r) {
          r._staff_name = staffName(staffMap, r.staff_user_id);
        });
        return { ok: true, rows: rows };
      } catch (e) {
        return {
          ok: false,
          error: String(e && e.message ? e.message : e),
          rows: [],
        };
      }
    },

    reviewRequest: async function (id, status, adminNote) {
      var c = client() || (await waitForClient(8000, { tryBootstrap: true }));
      var uid = authUid();
      if (!c || !uid) {
        return {
          ok: false,
          error: "Portal sign-in is still loading. Try again in a moment.",
        };
      }
      var st = String(status || "").toLowerCase();
      if (st !== "approved" && st !== "rejected") {
        return { ok: false, error: "bad_status" };
      }
      try {
        var res = await c
          .from(TABLE)
          .update({
            status: st,
            reviewed_at: new Date().toISOString(),
            reviewed_by_user_id: uid,
            admin_note: String(adminNote || "").trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select("id,status")
          .single();
        if (res.error) {
          return { ok: false, error: res.error.message || "update_failed" };
        }
        return { ok: true, row: res.data };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderDayStripHtml: function (days, counts, selectedDay) {
      var cards = (days || [])
        .map(function (iso, idx) {
          var n = (counts && counts[iso]) || 0;
          var isSel = iso === selectedDay;
          var col = DAY_COLORS[idx % DAY_COLORS.length];
          var soft = DAY_SOFT[idx % DAY_SOFT.length];
          var dayLong = DOW_LONG[idx] || "";
          return (
            '<button type="button" class="c4k-hub-sess-card' +
            (isSel ? " is-selected" : "") +
            (n > 0 ? " portal-late-day--has" : "") +
            '" data-late-day="' +
            _escAttr(iso) +
            '" title="' +
            _escAttr(String(n) + " late delivered") +
            '" style="--cap-soft:' +
            soft +
            ";--cap-border:" +
            col +
            ";border-color:" +
            (isSel ? col : "var(--line)") +
            '">' +
            '<div class="c4k-hub-sess-card__day" style="color:' +
            col +
            '">' +
            _esc(dayLong) +
            "</div>" +
            '<div class="c4k-hub-sess-card__date">' +
            _esc(formatDdMm(iso)) +
            "</div>" +
            '<div class="c4k-hub-sess-card__rule" style="background:' +
            col +
            '"></div>' +
            '<div class="c4k-hub-sess-card__count">' +
            _esc(String(n)) +
            "</div>" +
            '<div class="c4k-hub-sess-card__lbl">LATE</div>' +
            "</button>"
          );
        })
        .join("");
      return cards;
    },

    renderLateFeedbackTableHtml: function (rows, selectedDay) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No late feedback on " +
          _esc(formatSessionDate(selectedDay) || "this day") +
          "</strong>" +
          "<p style=\"margin:8px 0 0\">Late = completed after the session London day, or same day after 21:00. Pick another day above, or another week.</p></div>"
        );
      }
      var body = rows
        .map(function (r) {
          var svc = _esc(r.service || "—");
          var dateLine = _esc(formatSessionDate(r.session_date));
          var timeLine = _esc(r._session_time || "—");
          var cleared = !!r._pay_cleared;
          var uid = _escAttr(String(r.submitted_by_user_id || "").trim());
          var sdate = _escAttr(String(r.session_date || "").slice(0, 10));
          var action = cleared
            ? '<span class="chip chip--ok">Pay released</span>'
            : '<button type="button" class="btn btn--pri btn--sm" data-late-release-pay="' +
              uid +
              '" data-late-release-date="' +
              sdate +
              '">Release for pay</button>';
          return (
            "<tr>" +
            '<td class="portal-late-fb-staff"><div class="portal-late-fb-staff__name">' +
            _esc(r._staff_name || "—") +
            "</div></td>" +
            '<td class="portal-late-fb-when">' +
            '<div class="portal-late-fb-stack">' +
            '<span class="portal-late-fb-stack__svc">' +
            svc +
            "</span>" +
            '<span class="portal-late-fb-stack__date">' +
            dateLine +
            "</span>" +
            '<span class="portal-late-fb-stack__time">' +
            timeLine +
            "</span>" +
            "</div></td>" +
            '<td class="portal-late-fb-pax">' +
            _esc(r.client_name || "—") +
            "</td>" +
            '<td class="portal-late-fb-done">' +
            _esc(r._completed_when || formatWhen(r.created_at)) +
            "</td>" +
            '<td class="portal-late-fb-pay">' +
            action +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
      return (
        '<div class="portal-late-fb-wrap">' +
        '<table class="tbl portal-late-fb-tbl">' +
        "<thead><tr>" +
        '<th scope="col">Staff</th>' +
        '<th scope="col">Service / Date / Time</th>' +
        '<th scope="col">Participant</th>' +
        '<th scope="col">Completed feedback</th>' +
        '<th scope="col">Timesheet pay</th>' +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></div>"
      );
    },

    releaseLateDayForPay: async function (staffUserId, sessionDate, note) {
      var c = await waitForClient();
      if (!c) return { ok: false, error: "not_signed_in" };
      var uid = String(staffUserId || "").trim();
      var sdate = String(sessionDate || "").slice(0, 10);
      if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(sdate)) {
        return { ok: false, error: "bad_args" };
      }
      var adminUid = authUid() || null;
      try {
        var res = await c.from(CLEAR_TABLE).upsert(
          [
            {
              staff_user_id: uid,
              session_date: sdate,
              cleared_by_user_id: adminUid,
              note: note ? String(note).slice(0, 500) : null,
            },
          ],
          { onConflict: "staff_user_id,session_date" }
        );
        if (res.error) return { ok: false, error: res.error.message || "upsert_failed" };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    renderRowsHtml: function (rows) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No incident requests in this filter</strong>" +
          '<p style="margin:8px 0 0">Instructor cancellations and session feedback do not need approval — they appear in Day operations when submitted. Late feedback is listed above when completed after the session day.</p></div>'
        );
      }
      var body = rows
        .map(function (r) {
          var pending = String(r.status || "").toLowerCase() === "pending";
          var noteVal = r.admin_note ? String(r.admin_note) : "";
          var actions = pending
            ? '<div class="portal-late-admin-row__actions">' +
              '<textarea class="txa portal-late-admin-note" rows="2" placeholder="Optional note to staff…" data-late-note="' +
              _escAttr(r.id) +
              '">' +
              _esc(noteVal) +
              "</textarea>" +
              '<div class="toolbar" style="margin-top:8px;flex-wrap:wrap;gap:8px">' +
              '<button type="button" class="btn btn--pri btn--sm" data-late-approve="' +
              _escAttr(r.id) +
              '">Approve</button>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-late-reject="' +
              _escAttr(r.id) +
              '">Reject</button>' +
              "</div></div>"
            : r.admin_note
              ? '<p class="muted portal-late-admin-reviewed-note" style="margin:8px 0 0;font-size:13px;overflow-wrap:break-word"><strong>Note:</strong> ' +
                _esc(r.admin_note) +
                "</p>"
              : "";
          return (
            '<article class="portal-late-admin-row card card-pad" data-late-id="' +
            _escAttr(r.id) +
            '">' +
            '<div class="portal-late-admin-row__head">' +
            '<div style="min-width:0;flex:1">' +
            "<strong>" +
            _esc(typeLabel(r.submission_type)) +
            "</strong> · " +
            _esc(r.client_name || "Participant") +
            statusChip(r.status) +
            "</div>" +
            '<span class="muted" style="font-size:12px;flex-shrink:0">' +
            formatWhen(r.created_at) +
            "</span></div>" +
            '<dl class="portal-late-admin-meta">' +
            "<div><dt>Staff</dt><dd>" +
            _esc(r._staff_name || "—") +
            "</dd></div>" +
            "<div><dt>Session date</dt><dd>" +
            _esc(r.session_date || "—") +
            "</dd></div>" +
            "<div><dt>Service</dt><dd>" +
            _esc(r.service_label || "—") +
            "</dd></div>" +
            "</dl>" +
            actions +
            "</article>"
          );
        })
        .join("");
      return '<div class="portal-late-admin-rows">' + body + "</div>";
    },

    bindPanel: function (rootEl, opts) {
      opts = opts || {};
      var root = rootEl || document.getElementById("portalLateAdminList");
      if (!root) return;
      var stripEl = document.getElementById("portalLateDayStrip");
      var rangeEl = document.getElementById("portalLateWeekRange");
      var refreshBtn = document.getElementById("portalLateAdminRefresh");
      var prevBtn = document.getElementById("portalLateWeekPrev");
      var nextBtn = document.getElementById("portalLateWeekNext");
      var thisBtn = document.getElementById("portalLateWeekThis");
      var approvalFilterEl = document.getElementById("portalLateApprovalFilter");
      var approvalList = document.getElementById("portalLateApprovalList");
      var self = window.PortalAdminLateSubmissions;

      function paintDayView() {
        var day = _weekState.selectedDay;
        var dayRows = (_weekState.weekRows || []).filter(function (r) {
          return r._completed_day === day;
        });
        if (stripEl) {
          stripEl.innerHTML = self.renderDayStripHtml(
            _weekState.days || [],
            _weekState.counts || {},
            day
          );
        }
        if (rangeEl) {
          rangeEl.textContent = weekRangeLabel(_weekState.monday);
        }
        var n = dayRows.length;
        var hint = roleHint();
        var staffSet = {};
        dayRows.forEach(function (r) {
          var nm = String(r._staff_name || "").trim();
          if (nm) staffSet[nm] = true;
        });
        var staffN = Object.keys(staffSet).length;
        var weekTotal = (_weekState.weekRows || []).length;
        setStatus(
          (hint ? hint + " — " : "") +
            n +
            " late on " +
            formatSessionDate(day) +
            (staffN ? " · " + staffN + " staff" : "") +
            " · " +
            weekTotal +
            " late this week",
          false
        );
        root.innerHTML = self.renderLateFeedbackTableHtml(dayRows, day);
      }

      async function reloadApprovals() {
        if (!approvalList) return;
        approvalList.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        var filter = approvalFilterEl ? approvalFilterEl.value : "pending";
        var res = await self.fetchRequests(filter);
        if (!res.ok) {
          approvalList.innerHTML =
            '<div class="portal-late-admin-msg is-error"><strong>Could not load</strong><p style="margin:8px 0 0">' +
            _esc(res.error || "error") +
            "</p></div>";
          return;
        }
        approvalList.innerHTML = self.renderRowsHtml(res.rows);
        if (typeof opts.onLoaded === "function") {
          try {
            opts.onLoaded(res.rows);
          } catch (_) {}
        }
      }

      async function reloadWeek(mondayIso, preferSelected) {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        setStatus("Loading late feedback…", false);
        if (stripEl) {
          stripEl.innerHTML =
            '<div class="portal-late-admin-msg" style="grid-column:1/-1;padding:8px 0"><strong>Loading week…</strong></div>';
        }
        var res = await self.fetchLateFeedbackForWeek(mondayIso);
        if (!res.ok) {
          root.innerHTML =
            '<div class="portal-late-admin-msg is-error"><strong>Could not load</strong><p style="margin:8px 0 0">' +
            _esc(res.error || "error") +
            "</p></div>";
          setStatus(_esc(res.error || "error"), true);
          return;
        }
        var keep =
          preferSelected &&
          res.days &&
          res.days.indexOf(preferSelected) >= 0
            ? preferSelected
            : pickDefaultSelectedDay(
                res.days,
                res.counts,
                res.londonToday
              );
        _weekState.monday = res.monday;
        _weekState.days = res.days;
        _weekState.counts = res.counts;
        _weekState.weekRows = res.rows;
        _weekState.selectedDay = keep;
        paintDayView();
        await reloadApprovals();
      }

      if (approvalFilterEl && !approvalFilterEl._portalLateBound) {
        approvalFilterEl._portalLateBound = true;
        approvalFilterEl.addEventListener("change", reloadApprovals);
      }
      if (refreshBtn && !refreshBtn._portalLateBound) {
        refreshBtn._portalLateBound = true;
        refreshBtn.addEventListener("click", function () {
          void reloadWeek(_weekState.monday, _weekState.selectedDay);
        });
      }
      if (prevBtn && !prevBtn._portalLateBound) {
        prevBtn._portalLateBound = true;
        prevBtn.addEventListener("click", function () {
          void reloadWeek(addDaysIso(_weekState.monday || mondayOfWeekIso(portalFallbackToday()), -7));
        });
      }
      if (nextBtn && !nextBtn._portalLateBound) {
        nextBtn._portalLateBound = true;
        nextBtn.addEventListener("click", function () {
          void reloadWeek(addDaysIso(_weekState.monday || mondayOfWeekIso(portalFallbackToday()), 7));
        });
      }
      if (thisBtn && !thisBtn._portalLateBound) {
        thisBtn._portalLateBound = true;
        thisBtn.addEventListener("click", function () {
          var today =
            londonIsoDay(new Date().toISOString()) || portalFallbackToday();
          void reloadWeek(mondayOfWeekIso(today), today);
        });
      }

      var clickRoot =
        document.getElementById("portalLateAdminRoot") ||
        root.parentElement ||
        root;
      if (clickRoot && !clickRoot._portalLateClickBound) {
        clickRoot._portalLateClickBound = true;
        clickRoot.addEventListener("click", async function (ev) {
          var dayBtn = ev.target.closest("[data-late-day]");
          if (dayBtn && clickRoot.contains(dayBtn)) {
            var day = dayBtn.getAttribute("data-late-day");
            if (day && day !== _weekState.selectedDay) {
              _weekState.selectedDay = day;
              paintDayView();
            }
            return;
          }
          var releaseBtn = ev.target.closest("[data-late-release-pay]");
          if (releaseBtn && clickRoot.contains(releaseBtn)) {
            var staffUid = releaseBtn.getAttribute("data-late-release-pay");
            var sessDate = releaseBtn.getAttribute("data-late-release-date");
            if (!staffUid || !sessDate) return;
            if (
              !window.confirm(
                "Release this late day for timesheet pay?\n\nStaff day: " +
                  sessDate +
                  "\n\nNo penalty will be applied. The day will turn green/payable on their timesheet."
              )
            ) {
              return;
            }
            releaseBtn.disabled = true;
            var released = await self.releaseLateDayForPay(staffUid, sessDate, "");
            releaseBtn.disabled = false;
            if (!released.ok) {
              if (_toast) _toast("Could not release: " + (released.error || "error"));
              else if (window.alert)
                window.alert("Could not release: " + (released.error || "error"));
              return;
            }
            if (_toast) _toast("Released for pay — timesheet can include that day.");
            await reloadWeek(_weekState.monday, _weekState.selectedDay);
            return;
          }
          var approveBtn = ev.target.closest("[data-late-approve]");
          var rejectBtn = ev.target.closest("[data-late-reject]");
          var btn = approveBtn || rejectBtn;
          if (!btn || !clickRoot.contains(btn)) return;
          var id = btn.getAttribute(
            approveBtn ? "data-late-approve" : "data-late-reject"
          );
          if (!id) return;
          var noteEl = clickRoot.querySelector('[data-late-note="' + id + '"]');
          var note = noteEl ? noteEl.value : "";
          var status = approveBtn ? "approved" : "rejected";
          var verb = approveBtn ? "Approve" : "Reject";
          if (!window.confirm(verb + " this late submission request?")) return;
          btn.disabled = true;
          var out = await self.reviewRequest(id, status, note);
          btn.disabled = false;
          if (!out.ok) {
            if (_toast) _toast("Could not save: " + (out.error || "error"));
            else if (window.alert)
              window.alert("Could not save: " + (out.error || "error"));
            return;
          }
          if (_toast) {
            _toast(
              status === "approved"
                ? "Approved — staff can submit with the original session date."
                : "Rejected."
            );
          }
          if (typeof opts.onReviewed === "function") {
            try {
              opts.onReviewed(id, status);
            } catch (_) {}
          }
          await reloadApprovals();
        });
      }

      function startReload() {
        var today =
          londonIsoDay(new Date().toISOString()) || portalFallbackToday();
        var mon = _weekState.monday || mondayOfWeekIso(today);
        return reloadWeek(mon, _weekState.selectedDay || today);
      }
      if (!client()) {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Connecting to Portal…</strong><p style="margin:8px 0 0">Loading your admin session.</p></div>';
        setStatus("Waiting for Portal sign-in…", false);
        waitForClient().then(function (cx) {
          if (cx && root.isConnected) startReload();
          else if (root.isConnected) {
            root.innerHTML =
              '<div class="portal-late-admin-msg is-error"><strong>Could not connect</strong><p style="margin:8px 0 0">Open from <code>login.html</code> as admin or CEO, then tap Refresh.</p></div>';
            setStatus("Not signed in to Portal.", true);
          }
        });
        return startReload;
      }
      void startReload();
      return startReload;
    },
  };

  function _escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;");
  }
})();
