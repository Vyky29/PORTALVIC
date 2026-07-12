/**
 * Admin UI: late session feedback log + approve/reject past-session cancel/incident requests.
 * Feedback is self-serve; this screen lists submissions where London completion day > session_date.
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

  function daysBackFromFilter(filter) {
    var f = String(filter || "7d").toLowerCase();
    if (f === "today") return 0;
    if (f === "30d") return 30;
    if (f === "90d") return 90;
    return 7;
  }

  function createdAtFloorIso(daysBack) {
    var now = new Date();
    var londonToday = londonIsoDay(now.toISOString()) || portalFallbackToday();
    var parts = londonToday.split("-").map(Number);
    var start = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0));
    // Pull a bit earlier than London midnight to cover UTC offset
    start.setUTCDate(start.getUTCDate() - Math.max(0, daysBack) - 1);
    return start.toISOString();
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
    var doneDay = londonIsoDay(row.created_at);
    if (!doneDay) return false;
    return doneDay > String(row.session_date).slice(0, 10);
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
          .neq("submission_type", "feedback");
        if (res.error) {
          // Fallback if neq unsupported / older schema
          var res2 = await c
            .from(TABLE)
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");
          if (res2.error) return 0;
          return typeof res2.count === "number" ? res2.count : 0;
        }
        return typeof res.count === "number" ? res.count : 0;
      } catch (_) {
        return 0;
      }
    },

    fetchLateFeedback: async function (rangeFilter) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            'Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh.',
          rows: [],
        };
      }
      var daysBack = daysBackFromFilter(rangeFilter);
      var floor = createdAtFloorIso(daysBack);
      var londonToday = londonIsoDay(new Date().toISOString()) || portalFallbackToday();
      try {
        var res = await c
          .from(FEEDBACK_TABLE)
          .select(
            "id,created_at,session_date,session_time,client_name,service,completed_by_name,submitted_by_user_id,portal_session_key,attendance"
          )
          .gte("created_at", floor)
          .order("created_at", { ascending: false })
          .limit(800);
        if (res.error) {
          return {
            ok: false,
            error: res.error.message || "fetch_failed",
            rows: [],
          };
        }
        var rows = (res.data || []).filter(isLateFeedbackRow);
        if (daysBack === 0) {
          rows = rows.filter(function (r) {
            return londonIsoDay(r.created_at) === londonToday;
          });
        } else {
          var windowStart = new Date(londonToday + "T12:00:00Z");
          windowStart.setUTCDate(windowStart.getUTCDate() - daysBack);
          var windowStartIso = windowStart.toISOString().slice(0, 10);
          rows = rows.filter(function (r) {
            var day = londonIsoDay(r.created_at);
            return day >= windowStartIso && day <= londonToday;
          });
        }
        rows.forEach(function (r) {
          r._completed_day = londonIsoDay(r.created_at);
          r._completed_when = formatWhen(r.created_at);
          r._session_time = timeFromKeyOrField(
            r.session_time,
            r.portal_session_key
          );
          r._staff_name = String(r.completed_by_name || "").trim() || "Staff";
        });
        return { ok: true, rows: rows, londonToday: londonToday };
      } catch (e) {
        return {
          ok: false,
          error: String(e && e.message ? e.message : e),
          rows: [],
        };
      }
    },

    fetchRequests: async function (statusFilter) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            'Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh.',
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
          .neq("submission_type", "feedback")
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

    renderLateFeedbackTableHtml: function (rows) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No late feedback in this range</strong>" +
          "<p style=\"margin:8px 0 0\">Late = completed on a London calendar day <em>after</em> the session date (e.g. Sunday submitting Friday/Saturday). Try a wider Show range.</p></div>"
        );
      }
      var body = rows
        .map(function (r) {
          var svc = _esc(r.service || "—");
          var dateLine = _esc(formatSessionDate(r.session_date));
          var timeLine = _esc(r._session_time || "—");
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
            "</tr>"
          );
        })
        .join("");
      return (
        '<div class="portal-late-fb-wrap">' +
        '<table class="tbl portal-late-fb-tbl">' +
        "<thead><tr>" +
        "<th scope=\"col\">Staff</th>" +
        "<th scope=\"col\">Service / Date / Time</th>" +
        "<th scope=\"col\">Participant</th>" +
        "<th scope=\"col\">Completed feedback</th>" +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></div>"
      );
    },

    renderRowsHtml: function (rows) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No cancel / incident requests in this filter</strong>" +
          '<p style="margin:8px 0 0">Session feedback no longer needs approval here — it appears in the late feedback table above when submitted after the session day.</p></div>'
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
      var filterEl = document.getElementById("portalLateAdminFilter");
      var refreshBtn = document.getElementById("portalLateAdminRefresh");
      var approvalFilterEl = document.getElementById("portalLateApprovalFilter");
      var approvalList = document.getElementById("portalLateApprovalList");
      var self = window.PortalAdminLateSubmissions;

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

      async function reload() {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        setStatus("Loading late feedback…", false);
        var filter = filterEl ? filterEl.value : "7d";
        var res = await self.fetchLateFeedback(filter);
        if (!res.ok) {
          root.innerHTML =
            '<div class="portal-late-admin-msg is-error"><strong>Could not load</strong><p style="margin:8px 0 0">' +
            _esc(res.error || "error") +
            "</p></div>";
          setStatus(_esc(res.error || "error"), true);
          return;
        }
        var n = (res.rows && res.rows.length) || 0;
        var hint = roleHint();
        var staffSet = {};
        (res.rows || []).forEach(function (r) {
          var nm = String(r._staff_name || "").trim();
          if (nm) staffSet[nm] = true;
        });
        var staffN = Object.keys(staffSet).length;
        setStatus(
          (hint ? hint + " — " : "") +
            n +
            " late feedback" +
            (n === 1 ? "" : "s") +
            " from " +
            staffN +
            " staff (range: " +
            filter +
            "). Same-day submissions after the session are not listed here — only next-day or later.",
          false
        );
        root.innerHTML = self.renderLateFeedbackTableHtml(res.rows);
        await reloadApprovals();
      }

      if (filterEl && !filterEl._portalLateBound) {
        filterEl._portalLateBound = true;
        filterEl.addEventListener("change", reload);
      }
      if (approvalFilterEl && !approvalFilterEl._portalLateBound) {
        approvalFilterEl._portalLateBound = true;
        approvalFilterEl.addEventListener("change", reloadApprovals);
      }
      if (refreshBtn && !refreshBtn._portalLateBound) {
        refreshBtn._portalLateBound = true;
        refreshBtn.addEventListener("click", reload);
      }
      var clickRoot = document.getElementById("portalLateAdminRoot") || root.parentElement || root;
      if (clickRoot && !clickRoot._portalLateClickBound) {
        clickRoot._portalLateClickBound = true;
        clickRoot.addEventListener("click", async function (ev) {
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
        return reload();
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
