/**
 * Admin UI: approve / reject portal_late_submission_requests (past-session forms).
 */
(function () {
  "use strict";

  var TABLE = "portal_late_submission_requests";
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
        window.addEventListener("portal:supabase-ready", tryFinish, { once: true });
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
      return d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return _esc(iso);
    }
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
          .eq("status", "pending");
        if (res.error) return 0;
        return typeof res.count === "number" ? res.count : 0;
      } catch (_) {
        return 0;
      }
    },

    fetchRequests: async function (statusFilter) {
      var c = await waitForClient();
      if (!c) {
        return {
          ok: false,
          error:
            'Not signed in to Portal. Open login.html, sign in as admin, open Admin again, then tap Refresh. (Or check the browser console for "[portal]" errors.)',
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

    renderRowsHtml: function (rows) {
      if (!rows || !rows.length) {
        return (
          '<div class="portal-late-admin-msg">' +
          "<strong>No requests in this filter</strong>" +
          '<p style="margin:8px 0 0">Change <strong>Show</strong> to <em>All</em>, or confirm rows exist in Supabase → <code>portal_late_submission_requests</code>.</p></div>'
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
            '<p class="muted" style="margin:0;font-size:12px;overflow-wrap:anywhere">Key: <code style="font-size:11px">' +
            _esc(r.portal_session_key || "") +
            "</code></p>" +
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
      var self = window.PortalAdminLateSubmissions;

      async function reload() {
        root.innerHTML =
          '<div class="portal-late-admin-msg"><strong>Loading…</strong></div>';
        setStatus("Loading requests…", false);
        var filter = filterEl ? filterEl.value : "pending";
        var res = await self.fetchRequests(filter);
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
        setStatus(
          (hint ? hint + " — " : "") +
            n +
            " request" +
            (n === 1 ? "" : "s") +
            ' (filter: "' +
            filter +
            '"). Try Show → All if you expect older rows.',
          false
        );
        root.innerHTML = self.renderRowsHtml(res.rows);
        if (typeof opts.onLoaded === "function") {
          try {
            opts.onLoaded(res.rows);
          } catch (_) {}
        }
      }

      if (filterEl && !filterEl._portalLateBound) {
        filterEl._portalLateBound = true;
        filterEl.addEventListener("change", reload);
      }
      if (refreshBtn && !refreshBtn._portalLateBound) {
        refreshBtn._portalLateBound = true;
        refreshBtn.addEventListener("click", reload);
      }
      if (!root._portalLateClickBound) {
        root._portalLateClickBound = true;
        root.addEventListener("click", async function (ev) {
          var approveBtn = ev.target.closest("[data-late-approve]");
          var rejectBtn = ev.target.closest("[data-late-reject]");
          var btn = approveBtn || rejectBtn;
          if (!btn || !root.contains(btn)) return;
          var id = btn.getAttribute(approveBtn ? "data-late-approve" : "data-late-reject");
          if (!id) return;
          var noteEl = root.querySelector('[data-late-note="' + id + '"]');
          var note = noteEl ? noteEl.value : "";
          var status = approveBtn ? "approved" : "rejected";
          var verb = approveBtn ? "Approve" : "Reject";
          if (!window.confirm(verb + " this late submission request?")) return;
          btn.disabled = true;
          var out = await self.reviewRequest(id, status, note);
          btn.disabled = false;
          if (!out.ok) {
            if (_toast) _toast("Could not save: " + (out.error || "error"));
            else if (window.alert) window.alert("Could not save: " + (out.error || "error"));
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
              opts.onReviewed();
            } catch (_) {}
          }
          await reload();
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
