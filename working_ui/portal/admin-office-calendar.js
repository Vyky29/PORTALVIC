/**
 * Admin Office Calendar — shared meetings, notes and events for portal admins.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
  };

  var TYPE_META = {
    meeting: { label: "Meeting", color: "#1d4ed8", bg: "#dbeafe" },
    note: { label: "Note", color: "#b45309", bg: "#ffedd5" },
    event: { label: "Event", color: "#15803d", bg: "#dcfce7" },
  };

  var state = {
    year: 0,
    month: 0, // 0-11
    selectedIso: "",
    entries: [],
    loading: false,
    error: "",
    editingId: "",
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function accessToken() {
    var client = cfg.getClient && cfg.getClient();
    if (client && client.auth && typeof client.auth.getSession === "function") {
      var sessResp = await client.auth.getSession();
      var session = sessResp && sessResp.data && sessResp.data.session;
      if (session && session.access_token) return session.access_token;
    }
    return null;
  }

  async function edgePost(body) {
    var token = await accessToken();
    if (!token) return { error: "session_expired" };
    var res = await fetch(supabaseBase() + "/functions/v1/portal-admin-office-calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey() || "",
      },
      body: JSON.stringify(body || {}),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && (j.error || j.message)) || res.statusText || "request_failed" };
    }
    return { data: j };
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoFromYmd(y, m0, d) {
    return y + "-" + pad2(m0 + 1) + "-" + pad2(d);
  }

  function todayIso() {
    var n = new Date();
    return isoFromYmd(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function ensureMonth() {
    if (!state.year) {
      var n = new Date();
      state.year = n.getFullYear();
      state.month = n.getMonth();
    }
    if (!state.selectedIso) state.selectedIso = todayIso();
  }

  function monthLabel() {
    ensureMonth();
    try {
      return new Date(state.year, state.month, 1).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
    } catch (_e) {
      return state.year + "-" + pad2(state.month + 1);
    }
  }

  function monthRange() {
    ensureMonth();
    var from = isoFromYmd(state.year, state.month, 1);
    var last = new Date(state.year, state.month + 1, 0).getDate();
    var to = isoFromYmd(state.year, state.month, last);
    return { from: from, to: to };
  }

  function entriesForIso(iso) {
    return (state.entries || []).filter(function (e) {
      return String(e.entry_date || "").slice(0, 10) === iso;
    });
  }

  function formatTime(t) {
    var s = String(t || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s.slice(0, 5);
    return pad2(Number(m[1])) + ":" + m[2];
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalOfficeCalStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  async function loadMonth() {
    ensureMonth();
    var range = monthRange();
    state.loading = true;
    state.error = "";
    setStatus("<strong>Loading…</strong> Office calendar.");
    try {
      var res = await edgePost({ action: "list", from: range.from, to: range.to });
      if (res.error) throw new Error(res.error);
      state.entries = (res.data && res.data.entries) || [];
      setStatus("");
      renderAll();
    } catch (err) {
      state.error = err.message || String(err);
      setStatus("<strong>Error</strong> " + esc(state.error), true);
      renderAll();
    } finally {
      state.loading = false;
    }
  }

  function shiftMonth(delta) {
    ensureMonth();
    var d = new Date(state.year, state.month + delta, 1);
    state.year = d.getFullYear();
    state.month = d.getMonth();
    var sel = new Date(state.selectedIso + "T12:00:00");
    if (sel.getFullYear() !== state.year || sel.getMonth() !== state.month) {
      state.selectedIso = isoFromYmd(state.year, state.month, 1);
    }
    void loadMonth();
  }

  function buildMonthGridHtml() {
    ensureMonth();
    var first = new Date(state.year, state.month, 1);
    var startDow = (first.getDay() + 6) % 7; // Mon=0
    var daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    var today = todayIso();
    var cells = [];
    var i;
    for (i = 0; i < startDow; i++) {
      cells.push('<div class="poc-cell poc-cell--empty" aria-hidden="true"></div>');
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var iso = isoFromYmd(state.year, state.month, day);
      var list = entriesForIso(iso);
      var isSel = iso === state.selectedIso;
      var isToday = iso === today;
      var chips = list
        .slice(0, 3)
        .map(function (e) {
          var meta = TYPE_META[e.entry_type] || TYPE_META.note;
          return (
            '<span class="poc-chip" style="background:' +
            meta.bg +
            ";color:" +
            meta.color +
            '" title="' +
            esc(e.title) +
            '">' +
            esc(String(e.title || "").slice(0, 18)) +
            "</span>"
          );
        })
        .join("");
      if (list.length > 3) {
        chips += '<span class="poc-chip poc-chip--more">+' + (list.length - 3) + "</span>";
      }
      cells.push(
        '<button type="button" class="poc-cell' +
          (isSel ? " is-selected" : "") +
          (isToday ? " is-today" : "") +
          (list.length ? " has-items" : "") +
          '" data-poc-day="' +
          esc(iso) +
          '" aria-pressed="' +
          (isSel ? "true" : "false") +
          '">' +
          '<span class="poc-cell__num">' +
          day +
          "</span>" +
          '<span class="poc-cell__chips">' +
          chips +
          "</span>" +
          "</button>"
      );
    }
    return (
      '<div class="poc-weekdays" aria-hidden="true">' +
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        .map(function (d) {
          return '<span class="poc-weekday">' + d + "</span>";
        })
        .join("") +
      "</div>" +
      '<div class="poc-grid">' +
      cells.join("") +
      "</div>"
    );
  }

  function selectedDayLabel() {
    try {
      var d = new Date(state.selectedIso + "T12:00:00");
      return d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (_e) {
      return state.selectedIso;
    }
  }

  function entryCardHtml(e) {
    var meta = TYPE_META[e.entry_type] || TYPE_META.note;
    var when = e.all_day
      ? "All day"
      : [formatTime(e.start_time), formatTime(e.end_time)].filter(Boolean).join(" – ") || "Timed";
    var by = e.created_by_name ? " · " + esc(e.created_by_name) : "";
    return (
      '<article class="poc-entry" data-entry-id="' +
      esc(e.id) +
      '">' +
      '<div class="poc-entry__head">' +
      '<span class="poc-type" style="background:' +
      meta.bg +
      ";color:" +
      meta.color +
      '">' +
      esc(meta.label) +
      "</span>" +
      '<span class="poc-entry__when muted">' +
      esc(when) +
      by +
      "</span>" +
      "</div>" +
      "<h3 class=\"poc-entry__title\">" +
      esc(e.title) +
      "</h3>" +
      (e.body
        ? '<p class="poc-entry__body">' + esc(e.body).replace(/\n/g, "<br>") + "</p>"
        : "") +
      '<div class="poc-entry__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-poc-edit="' +
      esc(e.id) +
      '">Edit</button>' +
      '<button type="button" class="btn btn--ghost btn--sm poc-del" data-poc-del="' +
      esc(e.id) +
      '">Delete</button>' +
      "</div>" +
      "</article>"
    );
  }

  function formHtml(prefill) {
    var p = prefill || {};
    var type = String(p.entry_type || "meeting");
    var allDay = p.all_day !== false && !p.start_time;
    var typeOpts = ["meeting", "note", "event"]
      .map(function (k) {
        return (
          '<option value="' +
          k +
          '"' +
          (type === k ? " selected" : "") +
          ">" +
          (TYPE_META[k].label) +
          "</option>"
        );
      })
      .join("");
    return (
      '<form id="portalOfficeCalForm" class="poc-form" data-edit-id="' +
      esc(p.id || "") +
      '">' +
      "<h3 style=\"margin:0 0 10px;font-size:15px\">" +
      (p.id ? "Edit entry" : "Add to this day") +
      "</h3>" +
      '<div class="poc-form-grid">' +
      '<label>Type<select class="inp" id="pocType" required>' +
      typeOpts +
      "</select></label>" +
      '<label>Title<input class="inp" id="pocTitle" type="text" maxlength="200" required value="' +
      esc(p.title || "") +
      '" placeholder="e.g. Call with Ealing LA" /></label>' +
      '<label class="poc-form-span"><span>Details</span><textarea class="inp" id="pocBody" rows="3" maxlength="8000" placeholder="Optional notes…">' +
      esc(p.body || "") +
      "</textarea></label>" +
      '<label class="poc-check"><input type="checkbox" id="pocAllDay"' +
      (allDay ? " checked" : "") +
      " /> All day</label>" +
      '<label>Start<input class="inp" id="pocStart" type="time" value="' +
      esc(formatTime(p.start_time)) +
      '" /></label>' +
      '<label>End<input class="inp" id="pocEnd" type="time" value="' +
      esc(formatTime(p.end_time)) +
      '" /></label>' +
      "</div>" +
      '<div class="poc-form-actions">' +
      '<button type="submit" class="btn btn--pri" id="pocSaveBtn">' +
      (p.id ? "Save changes" : "Add entry") +
      "</button>" +
      (p.id
        ? '<button type="button" class="btn btn--sec btn--sm" id="pocCancelEdit">Cancel</button>'
        : "") +
      "</div>" +
      "</form>"
    );
  }

  function dayPanelHtml() {
    var list = entriesForIso(state.selectedIso);
    var editing = null;
    if (state.editingId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === state.editingId) {
          editing = list[i];
          break;
        }
      }
    }
    return (
      '<aside class="poc-day" aria-label="Selected day">' +
      '<div class="poc-day__head">' +
      "<h2>" +
      esc(selectedDayLabel()) +
      "</h2>" +
      '<span class="muted">' +
      list.length +
      " item" +
      (list.length === 1 ? "" : "s") +
      "</span>" +
      "</div>" +
      '<div class="poc-day__list">' +
      (list.length
        ? list.map(entryCardHtml).join("")
        : '<p class="muted" style="margin:0;padding:8px 0">Nothing on this day yet.</p>') +
      "</div>" +
      formHtml(editing || { entry_date: state.selectedIso, entry_type: "meeting", all_day: true }) +
      "</aside>"
    );
  }

  function styleHtml() {
    return (
      "<style>" +
      "#portalOfficeCalRoot{min-width:0}" +
      "#portalOfficeCalRoot .poc-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px;min-width:0}" +
      "#portalOfficeCalRoot .poc-toolbar__nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}" +
      "#portalOfficeCalRoot .poc-toolbar h2{margin:0;font-size:18px;min-width:0;overflow-wrap:break-word;flex:0 1 auto}" +
      "#portalOfficeCalRoot .poc-legend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}" +
      "#portalOfficeCalRoot .poc-legend span{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted,#64748b)}" +
      "#portalOfficeCalRoot .poc-dot{width:10px;height:10px;border-radius:999px;flex:0 0 auto}" +
      "#portalOfficeCalRoot .poc-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,0.9fr);gap:16px;align-items:start;min-width:0}" +
      "#portalOfficeCalRoot .poc-cal{background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:12px;min-width:0}" +
      "#portalOfficeCalRoot .poc-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:0 0 6px}" +
      "#portalOfficeCalRoot .poc-weekday{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b);text-align:center;padding:4px}" +
      "#portalOfficeCalRoot .poc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}" +
      "#portalOfficeCalRoot .poc-cell{min-width:0;min-height:84px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff;padding:6px;display:flex;flex-direction:column;gap:4px;align-items:stretch;text-align:left;cursor:pointer;font:inherit}" +
      "#portalOfficeCalRoot .poc-cell--empty{visibility:hidden;pointer:0;min-height:0}" +
      "#portalOfficeCalRoot .poc-cell:hover{border-color:#93c5fd;background:#f8fbff}" +
      "#portalOfficeCalRoot .poc-cell.is-selected{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.18)}" +
      "#portalOfficeCalRoot .poc-cell.is-today .poc-cell__num{background:#0f172a;color:#fff;border-radius:999px;width:1.6em;height:1.6em;display:inline-flex;align-items:center;justify-content:center}" +
      "#portalOfficeCalRoot .poc-cell__num{font-size:12px;font-weight:800;color:var(--ink,#0f172a)}" +
      "#portalOfficeCalRoot .poc-cell__chips{display:flex;flex-direction:column;gap:2px;min-width:0}" +
      "#portalOfficeCalRoot .poc-chip{display:block;font-size:10px;font-weight:700;padding:2px 5px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}" +
      "#portalOfficeCalRoot .poc-chip--more{background:#f1f5f9;color:#475569}" +
      "#portalOfficeCalRoot .poc-day{background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:14px;min-width:0}" +
      "#portalOfficeCalRoot .poc-day__head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between;margin:0 0 12px}" +
      "#portalOfficeCalRoot .poc-day__head h2{margin:0;font-size:16px;min-width:0;overflow-wrap:break-word}" +
      "#portalOfficeCalRoot .poc-day__list{display:flex;flex-direction:column;gap:10px;margin:0 0 16px;max-height:min(42vh,360px);overflow:auto;min-width:0}" +
      "#portalOfficeCalRoot .poc-entry{border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:10px 12px;min-width:0}" +
      "#portalOfficeCalRoot .poc-entry__head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 6px}" +
      "#portalOfficeCalRoot .poc-type{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 7px;border-radius:999px}" +
      "#portalOfficeCalRoot .poc-entry__title{margin:0 0 4px;font-size:14px;overflow-wrap:break-word}" +
      "#portalOfficeCalRoot .poc-entry__body{margin:0;font-size:13px;color:#334155;overflow-wrap:break-word;white-space:pre-wrap}" +
      "#portalOfficeCalRoot .poc-entry__actions{display:flex;gap:8px;margin-top:8px}" +
      "#portalOfficeCalRoot .poc-del{color:#b91c1c}" +
      "#portalOfficeCalRoot .poc-form{border-top:1px solid var(--line,#e5e7eb);padding-top:14px;min-width:0}" +
      "#portalOfficeCalRoot .poc-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:0}" +
      "#portalOfficeCalRoot .poc-form-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.03em;min-width:0}" +
      "#portalOfficeCalRoot .poc-form-span{grid-column:1/-1}" +
      "#portalOfficeCalRoot .poc-check{flex-direction:row!important;align-items:center;text-transform:none;letter-spacing:0;font-weight:600;color:var(--ink,#0f172a)}" +
      "#portalOfficeCalRoot .poc-form-grid .inp, #portalOfficeCalRoot .poc-form-grid select, #portalOfficeCalRoot .poc-form-grid textarea{width:100%;min-width:0;box-sizing:border-box;font:inherit;padding:9px 11px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff;color:var(--ink,#0f172a);text-transform:none;letter-spacing:0;font-weight:500}" +
      "#portalOfficeCalRoot .poc-form-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}" +
      "@media(max-width:900px){#portalOfficeCalRoot .poc-layout{grid-template-columns:1fr}#portalOfficeCalRoot .poc-cell{min-height:68px}}" +
      "</style>"
    );
  }

  function renderAll() {
    var host = document.getElementById("portalOfficeCalHost");
    if (!host) return;
    ensureMonth();
    host.innerHTML =
      '<div class="poc-toolbar">' +
      '<div class="poc-toolbar__nav" role="group" aria-label="Month navigation">' +
      '<button type="button" class="btn btn--sec btn--sm" id="pocPrev" aria-label="Previous month">←</button>' +
      "<h2>" +
      esc(monthLabel()) +
      "</h2>" +
      '<button type="button" class="btn btn--sec btn--sm" id="pocNext" aria-label="Next month">→</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="pocToday">Today</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pocRefresh">Refresh</button>' +
      "</div>" +
      "</div>" +
      '<div class="poc-legend">' +
      '<span><i class="poc-dot" style="background:#1d4ed8"></i> Meeting</span>' +
      '<span><i class="poc-dot" style="background:#b45309"></i> Note</span>' +
      '<span><i class="poc-dot" style="background:#15803d"></i> Event</span>' +
      "</div>" +
      '<div class="poc-layout">' +
      '<div class="poc-cal">' +
      buildMonthGridHtml() +
      "</div>" +
      dayPanelHtml() +
      "</div>";
    bindHostEvents();
  }

  function syncAllDayFields() {
    var allDay = document.getElementById("pocAllDay");
    var start = document.getElementById("pocStart");
    var end = document.getElementById("pocEnd");
    var on = !!(allDay && allDay.checked);
    if (start) start.disabled = on;
    if (end) end.disabled = on;
  }

  function bindHostEvents() {
    var prev = document.getElementById("pocPrev");
    var next = document.getElementById("pocNext");
    var today = document.getElementById("pocToday");
    var refresh = document.getElementById("pocRefresh");
    if (prev) prev.onclick = function () { shiftMonth(-1); };
    if (next) next.onclick = function () { shiftMonth(1); };
    if (today) {
      today.onclick = function () {
        var n = new Date();
        state.year = n.getFullYear();
        state.month = n.getMonth();
        state.selectedIso = todayIso();
        state.editingId = "";
        void loadMonth();
      };
    }
    if (refresh) refresh.onclick = function () { void loadMonth(); };

    document.querySelectorAll("[data-poc-day]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.selectedIso = btn.getAttribute("data-poc-day") || state.selectedIso;
        state.editingId = "";
        renderAll();
      });
    });

    document.querySelectorAll("[data-poc-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.editingId = btn.getAttribute("data-poc-edit") || "";
        renderAll();
      });
    });

    document.querySelectorAll("[data-poc-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-poc-del");
        if (!id) return;
        if (!window.confirm("Delete this calendar entry?")) return;
        void (async function () {
          setStatus("<strong>Deleting…</strong>");
          var res = await edgePost({ action: "delete", id: id });
          if (res.error) {
            setStatus("<strong>Delete failed</strong> " + esc(res.error), true);
            return;
          }
          cfg.toast("Calendar entry deleted");
          state.editingId = "";
          await loadMonth();
        })();
      });
    });

    var cancel = document.getElementById("pocCancelEdit");
    if (cancel) {
      cancel.onclick = function () {
        state.editingId = "";
        renderAll();
      };
    }

    var allDay = document.getElementById("pocAllDay");
    if (allDay) {
      allDay.addEventListener("change", syncAllDayFields);
      syncAllDayFields();
    }

    var form = document.getElementById("portalOfficeCalForm");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        void saveForm(form);
      });
    }
  }

  async function saveForm(form) {
    var editId = form.getAttribute("data-edit-id") || "";
    var typeEl = document.getElementById("pocType");
    var titleEl = document.getElementById("pocTitle");
    var bodyEl = document.getElementById("pocBody");
    var allDayEl = document.getElementById("pocAllDay");
    var startEl = document.getElementById("pocStart");
    var endEl = document.getElementById("pocEnd");
    var title = titleEl ? String(titleEl.value || "").trim() : "";
    var allDay = !!(allDayEl && allDayEl.checked);
    if (!title) {
      setStatus("<strong>Title required</strong>", true);
      return;
    }
    var payload = {
      action: "upsert",
      id: editId || undefined,
      entry_date: state.selectedIso,
      entry_type: typeEl ? typeEl.value : "note",
      title: title,
      body: bodyEl ? bodyEl.value : "",
      all_day: allDay,
      start_time: allDay ? "" : startEl ? startEl.value : "",
      end_time: allDay ? "" : endEl ? endEl.value : "",
    };
    var btn = document.getElementById("pocSaveBtn");
    if (btn) btn.disabled = true;
    setStatus("<strong>Saving…</strong>");
    try {
      var res = await edgePost(payload);
      if (res.error) throw new Error(res.error);
      cfg.toast(editId ? "Calendar entry updated" : "Calendar entry added");
      state.editingId = "";
      await loadMonth();
      setStatus("<strong>Saved.</strong>");
    } catch (err) {
      setStatus("<strong>Save failed</strong> " + esc(err.message || String(err)), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function viewHtml() {
    return (
      '<div id="portalOfficeCalRoot" class="portal-office-cal-embed" data-bound="0">' +
      styleHtml() +
      '<h1 class="page-title">Office calendar</h1>' +
      '<p class="page-intro">Shared calendar for the office — meetings, notes and events. What Sevitha (or any portal admin) adds here is visible to you, and vice versa.</p>' +
      '<div id="portalOfficeCalStatus" class="portal-forms-status" role="status"></div>' +
      '<div id="portalOfficeCalHost"></div>' +
      "</div>"
    );
  }

  function bindModule() {
    var root = document.getElementById("portalOfficeCalRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    ensureMonth();
    renderAll();
    void loadMonth();
  }

  global.PortalOfficeCalendar = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: loadMonth,
  };
})(typeof window !== "undefined" ? window : globalThis);
