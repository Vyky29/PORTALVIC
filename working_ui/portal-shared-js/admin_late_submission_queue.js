/**
 * Admin UI: late session feedback pay release (by worker) + past-session incident approvals.
 * Feedback and instructor cancellations are self-serve (no approval to submit).
 * Timesheet pay for late feedback needs admin Release into portal_late_feedback_pay_clearances.
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

  var RECENT_DAYS = 60;

  var _listState = {
    mode: "recent60", // "recent60" | "week"
    monday: "",
    rangeFrom: "",
    rangeTo: "",
    rows: [],
    groups: [],
    expandedStaffId: "",
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

  async function attachPayClearanceFlags(c, rows) {
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
          .select("staff_user_id,session_date,created_at")
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
    return rows;
  }

  function aggregateStaffGroups(rows) {
    var byStaff = Object.create(null);
    (rows || []).forEach(function (r) {
      var uid = String(r.submitted_by_user_id || "").trim();
      if (!uid) uid = "__unknown__";
      if (!byStaff[uid]) {
        byStaff[uid] = {
          staff_user_id: uid === "__unknown__" ? "" : uid,
          staff_name: String(r._staff_name || "").trim() || "Staff",
          lateRows: 0,
          unclearedDates: Object.create(null),
          clearedDates: Object.create(null),
          rows: [],
        };
      }
      var g = byStaff[uid];
      g.lateRows += 1;
      g.rows.push(r);
      if (r._staff_name && g.staff_name === "Staff") {
        g.staff_name = String(r._staff_name).trim();
      }
      var sd = String(r.session_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return;
      if (r._pay_cleared) g.clearedDates[sd] = true;
      else g.unclearedDates[sd] = true;
    });
    var groups = Object.keys(byStaff).map(function (k) {
      var g = byStaff[k];
      g.unclearedSessionDays = Object.keys(g.unclearedDates).sort();
      g.clearedSessionDays = Object.keys(g.clearedDates).sort();
      g.unclearedCount = g.unclearedSessionDays.length;
      g.clearedCount = g.clearedSessionDays.length;
      g.rows.sort(function (a, b) {
        var ad = String(a.session_date || "");
        var bd = String(b.session_date || "");
        if (ad !== bd) return bd.localeCompare(ad);
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
      return g;
    });
    groups.sort(function (a, b) {
      if (b.unclearedCount !== a.unclearedCount) {
        return b.unclearedCount - a.unclearedCount;
      }
      if (b.lateRows !== a.lateRows) return b.lateRows - a.lateRows;
      return String(a.staff_name || "").localeCompare(String(b.staff_name || ""));
    });
    return groups;
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

    fetchLateFeedbackInRange: async function (fromIso, toIso) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            "Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh.",
          rows: [],
          groups: [],
        };
      }
      var from = String(fromIso || "").slice(0, 10);
      var to = String(toIso || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { ok: false, error: "bad_range", rows: [], groups: [] };
      }
      var floor = utcFloorForLondonDay(from);
      var ceil = utcCeilForLondonDay(to);
      try {
        var res = await c
          .from(FEEDBACK_TABLE)
          .select(
            "id,created_at,session_date,session_time,client_name,service,completed_by_name,submitted_by_user_id,portal_session_key,attendance"
          )
          .gte("created_at", floor)
          .lt("created_at", ceil)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (res.error) {
          return {
            ok: false,
            error: res.error.message || "fetch_failed",
            rows: [],
            groups: [],
          };
        }
        var rows = (res.data || [])
          .filter(isLateFeedbackRow)
          .map(enrichLateRow)
          .filter(function (r) {
            var day = r._completed_day || "";
            return day >= from && day <= to;
          });
        await attachPayClearanceFlags(c, rows);
        var ids = [];
        rows.forEach(function (r) {
          var uid = String(r.submitted_by_user_id || "").trim();
          if (uid && ids.indexOf(uid) < 0) ids.push(uid);
        });
        var staffMap = await loadStaffNames(ids);
        rows.forEach(function (r) {
          var fromProfile = staffName(staffMap, r.submitted_by_user_id);
          if (fromProfile && fromProfile !== "Staff") {
            r._staff_name = fromProfile;
          }
        });
        var groups = aggregateStaffGroups(rows);
        return {
          ok: true,
          rows: rows,
          groups: groups,
          rangeFrom: from,
          rangeTo: to,
          londonToday:
            londonIsoDay(new Date().toISOString()) || portalFallbackToday(),
        };
      } catch (e) {
        return {
          ok: false,
          error: String(e && e.message ? e.message : e),
          rows: [],
          groups: [],
        };
      }
    },

    fetchLateFeedbackRecent: async function (days) {
      var n = typeof days === "number" && days > 0 ? days : RECENT_DAYS;
      var londonToday =
        londonIsoDay(new Date().toISOString()) || portalFallbackToday();
      var from = addDaysIso(londonToday, -(n - 1));
      return this.fetchLateFeedbackInRange(from, londonToday);
    },

    fetchLateFeedbackForWeek: async function (mondayIso) {
      var londonToday =
        londonIsoDay(new Date().toISOString()) || portalFallbackToday();
      var monday = mondayOfWeekIso(mondayIso || londonToday);
      var days = weekDaysMonSun(monday);
      var res = await this.fetchLateFeedbackInRange(days[0], days[6]);
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          rows: [],
          days: days,
          counts: {},
          monday: monday,
        };
      }
      return {
        ok: true,
        rows: res.rows,
        groups: res.groups,
        days: days,
        monday: monday,
        counts: countsByCompletedDay(res.rows),
        londonToday: res.londonToday,
        rangeFrom: days[0],
        rangeTo: days[6],
      };
    },

    /** @deprecated prefer fetchLateFeedbackRecent */
    fetchLateFeedback: async function () {
      return this.fetchLateFeedbackRecent(RECENT_DAYS);
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

    renderLateFeedbackDetailRowsHtml: function (rows) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg" style="padding:8px 0">' +
          "<strong>No rows</strong></div>"
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
            ? '<span class="chip chip--ok">Released</span>'
            : '<button type="button" class="btn btn--pri btn--sm" data-late-release-pay="' +
              uid +
              '" data-late-release-date="' +
              sdate +
              '">Release day</button>';
          return (
            "<tr>" +
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
        '<div class="portal-late-fb-wrap portal-late-fb-wrap--detail">' +
        '<table class="tbl portal-late-fb-tbl portal-late-fb-tbl--detail">' +
        "<thead><tr>" +
        '<th scope="col">Service</th>' +
        '<th scope="col">Participant</th>' +
        '<th scope="col">Done</th>' +
        '<th scope="col">Pay</th>' +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></div>"
      );
    },

    /** @deprecated day view replaced by staff aggregation */
    renderLateFeedbackTableHtml: function (rows, selectedDay) {
      return this.renderLateFeedbackDetailRowsHtml(rows || []);
    },

    renderStaffPayQueueHtml: function (groups, expandedStaffId) {
      if (!groups || !groups.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No late feedback in this range</strong>" +
          "<p style=\"margin:8px 0 0\">Late = completed after the session London day, or same day after 21:00. Staff can submit late feedback without approval; use <strong>Release all</strong> here so those days become payable on the timesheet.</p></div>"
        );
      }
      var exp = String(expandedStaffId || "").trim();
      var cards = groups
        .map(function (g) {
          var uid = String(g.staff_user_id || "").trim();
          var uidAttr = _escAttr(uid);
          var isOpen = uid && uid === exp;
          var uncleared = g.unclearedCount || 0;
          var releaseBtn =
            uid && uncleared > 0
              ? '<button type="button" class="btn btn--pri btn--sm" data-late-release-all="' +
                uidAttr +
                '">Release all (' +
                _esc(String(uncleared)) +
                " day" +
                (uncleared === 1 ? "" : "s") +
                ")</button>"
              : '<span class="chip chip--ok">All released</span>';
          var detail = isOpen
            ? '<div class="portal-late-staff-card__detail">' +
              window.PortalAdminLateSubmissions.renderLateFeedbackDetailRowsHtml(
                g.rows
              ) +
              "</div>"
            : "";
          return (
            '<article class="portal-late-staff-card card card-pad' +
            (uncleared > 0 ? " portal-late-staff-card--pending" : "") +
            '" data-late-staff="' +
            uidAttr +
            '">' +
            '<div class="portal-late-staff-card__head">' +
            '<div class="portal-late-staff-card__who" style="min-width:0;flex:1">' +
            '<button type="button" class="portal-late-staff-card__toggle" data-late-staff-expand="' +
            uidAttr +
            '" aria-expanded="' +
            (isOpen ? "true" : "false") +
            '">' +
            '<span class="portal-late-staff-card__name">' +
            _esc(g.staff_name || "Staff") +
            "</span>" +
            '<span class="portal-late-staff-card__chev" aria-hidden="true">' +
            (isOpen ? "▾" : "▸") +
            "</span>" +
            "</button>" +
            '<p class="portal-late-staff-card__meta muted">' +
            _esc(String(g.lateRows || 0)) +
            " late feedback · " +
            _esc(String(uncleared)) +
            " day" +
            (uncleared === 1 ? "" : "s") +
            " waiting · " +
            _esc(String(g.clearedCount || 0)) +
            " already released</p>" +
            "</div>" +
            '<div class="portal-late-staff-card__actions">' +
            releaseBtn +
            "</div></div>" +
            detail +
            "</article>"
          );
        })
        .join("");
      return '<div class="portal-late-staff-queue">' + cards + "</div>";
    },

    releaseLateDayForPay: async function (staffUserId, sessionDate, note) {
      return this.releaseLateDaysForPay(
        staffUserId,
        [sessionDate],
        note
      );
    },

    releaseLateDaysForPay: async function (staffUserId, sessionDates, note) {
      var c = await waitForClient();
      if (!c) return { ok: false, error: "not_signed_in" };
      var uid = String(staffUserId || "").trim();
      if (!uid) return { ok: false, error: "bad_args" };
      var dates = [];
      var seen = Object.create(null);
      (sessionDates || []).forEach(function (d) {
        var sdate = String(d || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sdate) || seen[sdate]) return;
        seen[sdate] = true;
        dates.push(sdate);
      });
      if (!dates.length) return { ok: false, error: "no_dates" };
      var adminUid = authUid() || null;
      var noteVal = note ? String(note).slice(0, 500) : null;
      var payload = dates.map(function (sdate) {
        return {
          staff_user_id: uid,
          session_date: sdate,
          cleared_by_user_id: adminUid,
          note: noteVal,
        };
      });
      try {
        var res = await c
          .from(CLEAR_TABLE)
          .upsert(payload, { onConflict: "staff_user_id,session_date" });
        if (res.error) {
          return { ok: false, error: res.error.message || "upsert_failed" };
        }
        return { ok: true, count: dates.length };
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
      var rangeEl = document.getElementById("portalLateWeekRange");
      var refreshBtn = document.getElementById("portalLateAdminRefresh");
      var prevBtn = document.getElementById("portalLateWeekPrev");
      var nextBtn = document.getElementById("portalLateWeekNext");
      var thisBtn = document.getElementById("portalLateWeekThis");
      var recentBtn = document.getElementById("portalLateRecent60");
      var stripEl = document.getElementById("portalLateDayStrip");
      var approvalFilterEl = document.getElementById("portalLateApprovalFilter");
      var approvalList = document.getElementById("portalLateApprovalList");
      var self = window.PortalAdminLateSubmissions;

      function syncModeButtons() {
        var isRecent = _listState.mode !== "week";
        if (recentBtn) {
          recentBtn.classList.toggle("btn--sec", isRecent);
          recentBtn.classList.toggle("btn--ghost", !isRecent);
        }
        if (thisBtn) {
          thisBtn.classList.toggle("btn--sec", !isRecent);
          thisBtn.classList.toggle("btn--ghost", isRecent);
        }
        if (stripEl) stripEl.hidden = true;
      }

      function paintStaffView() {
        syncModeButtons();
        if (rangeEl) {
          if (_listState.mode === "week" && _listState.monday) {
            rangeEl.textContent =
              "Week " + weekRangeLabel(_listState.monday);
          } else if (_listState.rangeFrom && _listState.rangeTo) {
            rangeEl.textContent =
              "Last " +
              RECENT_DAYS +
              " days · " +
              formatDdMm(_listState.rangeFrom) +
              " – " +
              formatDdMm(_listState.rangeTo);
          } else {
            rangeEl.textContent = "Last " + RECENT_DAYS + " days";
          }
        }
        var groups = _listState.groups || [];
        var unclearedStaff = 0;
        var unclearedDays = 0;
        var lateTotal = 0;
        groups.forEach(function (g) {
          lateTotal += g.lateRows || 0;
          if ((g.unclearedCount || 0) > 0) {
            unclearedStaff += 1;
            unclearedDays += g.unclearedCount;
          }
        });
        var hint = roleHint();
        setStatus(
          (hint ? hint + " — " : "") +
            groups.length +
            " staff · " +
            lateTotal +
            " late feedback · " +
            unclearedDays +
            " day" +
            (unclearedDays === 1 ? "" : "s") +
            " waiting across " +
            unclearedStaff +
            " worker" +
            (unclearedStaff === 1 ? "" : "s"),
          false
        );
        root.innerHTML = self.renderStaffPayQueueHtml(
          groups,
          _listState.expandedStaffId
        );
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

      async function applyFetchResult(res, mode, monday) {
        if (!res.ok) {
          root.innerHTML =
            '<div class="portal-late-admin-msg is-error"><strong>Could not load</strong><p style="margin:8px 0 0">' +
            _esc(res.error || "error") +
            "</p></div>";
          setStatus(_esc(res.error || "error"), true);
          return;
        }
        _listState.mode = mode;
        _listState.monday = monday || res.monday || _listState.monday || "";
        _listState.rangeFrom = res.rangeFrom || "";
        _listState.rangeTo = res.rangeTo || "";
        _listState.rows = res.rows || [];
        _listState.groups = res.groups || aggregateStaffGroups(res.rows || []);
        paintStaffView();
        await reloadApprovals();
      }

      async function reloadRecent() {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        setStatus("Loading late feedback (last " + RECENT_DAYS + " days)…", false);
        var res = await self.fetchLateFeedbackRecent(RECENT_DAYS);
        await applyFetchResult(res, "recent60", "");
      }

      async function reloadWeek(mondayIso) {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        setStatus("Loading late feedback for week…", false);
        var res = await self.fetchLateFeedbackForWeek(mondayIso);
        await applyFetchResult(res, "week", res.monday || mondayIso);
      }

      async function reloadCurrent() {
        if (_listState.mode === "week") {
          var mon =
            _listState.monday ||
            mondayOfWeekIso(
              londonIsoDay(new Date().toISOString()) || portalFallbackToday()
            );
          return reloadWeek(mon);
        }
        return reloadRecent();
      }

      if (approvalFilterEl && !approvalFilterEl._portalLateBound) {
        approvalFilterEl._portalLateBound = true;
        approvalFilterEl.addEventListener("change", reloadApprovals);
      }
      if (refreshBtn && !refreshBtn._portalLateBound) {
        refreshBtn._portalLateBound = true;
        refreshBtn.addEventListener("click", function () {
          void reloadCurrent();
        });
      }
      if (recentBtn && !recentBtn._portalLateBound) {
        recentBtn._portalLateBound = true;
        recentBtn.addEventListener("click", function () {
          void reloadRecent();
        });
      }
      if (prevBtn && !prevBtn._portalLateBound) {
        prevBtn._portalLateBound = true;
        prevBtn.addEventListener("click", function () {
          var base =
            _listState.monday ||
            mondayOfWeekIso(
              londonIsoDay(new Date().toISOString()) || portalFallbackToday()
            );
          void reloadWeek(addDaysIso(base, -7));
        });
      }
      if (nextBtn && !nextBtn._portalLateBound) {
        nextBtn._portalLateBound = true;
        nextBtn.addEventListener("click", function () {
          var base =
            _listState.monday ||
            mondayOfWeekIso(
              londonIsoDay(new Date().toISOString()) || portalFallbackToday()
            );
          void reloadWeek(addDaysIso(base, 7));
        });
      }
      if (thisBtn && !thisBtn._portalLateBound) {
        thisBtn._portalLateBound = true;
        thisBtn.addEventListener("click", function () {
          var today =
            londonIsoDay(new Date().toISOString()) || portalFallbackToday();
          void reloadWeek(mondayOfWeekIso(today));
        });
      }

      var clickRoot =
        document.getElementById("portalLateAdminRoot") ||
        root.parentElement ||
        root;
      if (clickRoot && !clickRoot._portalLateClickBound) {
        clickRoot._portalLateClickBound = true;
        clickRoot.addEventListener("click", async function (ev) {
          var expandBtn = ev.target.closest("[data-late-staff-expand]");
          if (expandBtn && clickRoot.contains(expandBtn)) {
            var expandId = expandBtn.getAttribute("data-late-staff-expand") || "";
            _listState.expandedStaffId =
              _listState.expandedStaffId === expandId ? "" : expandId;
            paintStaffView();
            return;
          }
          var releaseAllBtn = ev.target.closest("[data-late-release-all]");
          if (releaseAllBtn && clickRoot.contains(releaseAllBtn)) {
            var allUid = releaseAllBtn.getAttribute("data-late-release-all");
            if (!allUid) return;
            var group = null;
            (_listState.groups || []).forEach(function (g) {
              if (String(g.staff_user_id || "") === allUid) group = g;
            });
            var dates = group ? group.unclearedSessionDays || [] : [];
            if (!dates.length) return;
            if (
              !window.confirm(
                "Release all late days for timesheet pay?\n\n" +
                  (group && group.staff_name ? group.staff_name + "\n" : "") +
                  dates.length +
                  " session day" +
                  (dates.length === 1 ? "" : "s") +
                  " will become payable.\n\nNo penalty is applied — this only clears the pay hold."
              )
            ) {
              return;
            }
            releaseAllBtn.disabled = true;
            var bulk = await self.releaseLateDaysForPay(allUid, dates, "");
            releaseAllBtn.disabled = false;
            if (!bulk.ok) {
              if (_toast) _toast("Could not release: " + (bulk.error || "error"));
              else if (window.alert)
                window.alert("Could not release: " + (bulk.error || "error"));
              return;
            }
            if (_toast) {
              _toast(
                "Released " +
                  (bulk.count || dates.length) +
                  " day(s) for pay."
              );
            }
            await reloadCurrent();
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
            var released = await self.releaseLateDayForPay(
              staffUid,
              sessDate,
              ""
            );
            releaseBtn.disabled = false;
            if (!released.ok) {
              if (_toast)
                _toast("Could not release: " + (released.error || "error"));
              else if (window.alert)
                window.alert(
                  "Could not release: " + (released.error || "error")
                );
              return;
            }
            if (_toast)
              _toast("Released for pay — timesheet can include that day.");
            await reloadCurrent();
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
          if (!window.confirm(verb + " this late incident request?")) return;
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
                ? "Approved — staff can submit the late incident."
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
        return reloadRecent();
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
