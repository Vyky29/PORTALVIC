/**
 * Admin — Open places 2026/27 (Autumn).
 * Live seats from portal-booking-offer (same source as the public Booking Portal).
 * No participant PII — capacity / taken / free only.
 */
(function (global) {
  "use strict";

  var DAY_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function () {},
    openView: function () {},
    placeNew: function () {},
    placeExisting: function () {},
  };

  var state = {
    loading: false,
    error: null,
    termLabel: "",
    termRange: "",
    termBadge: "",
    madreUpdatedAt: null,
    servicesById: {},
    slots: [],
    filters: {
      day: "",
      service: "",
      venue: "",
      openOnly: true,
    },
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
    if (options.openView) cfg.openView = options.openView;
    if (options.placeNew) cfg.placeNew = options.placeNew;
    if (options.placeExisting) cfg.placeExisting = options.placeExisting;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function freeOf(slot) {
    return Math.max(0, Number(slot.capacity || 0) - Number(slot.taken || 0));
  }

  function serviceName(id) {
    var s = state.servicesById[id];
    return (s && s.name) || id || "—";
  }

  function supabaseBase() {
    return String(
      cfg.getSupabaseUrl() ||
        global.SUPABASE_URL ||
        "https://cklpnwhlqsulpmkipmqb.supabase.co"
    ).replace(/\/$/, "");
  }

  function anonKey() {
    return String(cfg.getAnonKey() || global.SUPABASE_ANON_KEY || "").trim();
  }

  function viewHtml() {
    return (
      '<style id="op2627Styles">' +
      ".op2627{min-width:0}" +
      ".op2627-tbl-wrap{overflow-x:auto;min-width:0;width:100%}" +
      ".op2627-tbl{table-layout:fixed;width:100%;min-width:0}" +
      ".op2627-tbl th.op2627-th,.op2627-tbl td.op2627-td{" +
      "text-align:center;vertical-align:middle;min-width:0;" +
      "overflow-wrap:break-word;word-break:break-word}" +
      ".op2627-tbl .op2627-td--svc{width:22%}" +
      ".op2627-tbl .op2627-td--venue{width:12%}" +
      ".op2627-tbl .op2627-td--time{width:16%}" +
      ".op2627-tbl .op2627-td--num{width:8%}" +
      ".op2627-tbl .op2627-td--free{width:12%}" +
      ".op2627-tbl .op2627-td--place{width:22%}" +
      ".op2627-tbl .op2627-td--free .chip{justify-content:center;margin:0 auto}" +
      ".op2627-place{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;min-width:0}" +
      ".op2627-place .btn{white-space:nowrap}" +
      "</style>" +
      '<div class="page-head" style="min-width:0">' +
      "<h2 class=\"page-title\" style=\"min-width:0;overflow-wrap:break-word\">Open places 2026/27</h2>" +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      "Live Autumn Term places for families who call or email — same data as the Booking Portal. " +
      "Use <strong>Existing</strong> / <strong>New</strong> on a free band to place someone via Edit term slot or New participant." +
      "</p></div>" +
      '<div id="op2627Root" class="op2627" style="min-width:0">' +
      '<p class="muted" style="margin:0">Loading live places…</p>' +
      "</div>"
    );
  }

  function uniqueSorted(values) {
    var map = {};
    (values || []).forEach(function (v) {
      var t = String(v || "").trim();
      if (t) map[t] = 1;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function filteredSlots() {
    var f = state.filters;
    return state.slots.filter(function (slot) {
      if (f.day && slot.day !== f.day) return false;
      if (f.service && slot.serviceId !== f.service) return false;
      if (f.venue && slot.venue !== f.venue) return false;
      if (f.openOnly && freeOf(slot) <= 0) return false;
      return true;
    });
  }

  function optionHtml(values, selected, allLabel) {
    var html = '<option value="">' + esc(allLabel) + "</option>";
    values.forEach(function (v) {
      html +=
        '<option value="' +
        esc(v) +
        '"' +
        (v === selected ? " selected" : "") +
        ">" +
        esc(v) +
        "</option>";
    });
    return html;
  }

  function serviceOptionHtml(selected) {
    var html = '<option value="">All services</option>';
    var ids = Object.keys(state.servicesById).sort(function (a, b) {
      return serviceName(a).localeCompare(serviceName(b));
    });
    ids.forEach(function (id) {
      html +=
        '<option value="' +
        esc(id) +
        '"' +
        (id === selected ? " selected" : "") +
        ">" +
        esc(serviceName(id)) +
        "</option>";
    });
    return html;
  }

  function kpiHtml(slots) {
    var openBands = 0;
    var freeSeats = 0;
    var fullBands = 0;
    slots.forEach(function (s) {
      var free = freeOf(s);
      if (free > 0) {
        openBands += 1;
        freeSeats += free;
      } else {
        fullBands += 1;
      }
    });
    return (
      '<div class="grid-kpi grid-kpi--4" style="margin:12px 0 16px">' +
      '<div class="kpi card--premium"><div class="kpi-l">Open bands</div><div class="kpi-v">' +
      esc(String(openBands)) +
      '</div><div class="kpi-s muted">with at least 1 free</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Free seats</div><div class="kpi-v">' +
      esc(String(freeSeats)) +
      '</div><div class="kpi-s muted">across filtered list</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Full bands</div><div class="kpi-v">' +
      esc(String(fullBands)) +
      '</div><div class="kpi-s muted">shown only if toggle off</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Total rows</div><div class="kpi-v">' +
      esc(String(slots.length)) +
      '</div><div class="kpi-s muted">after filters</div></div>' +
      "</div>"
    );
  }

  function slotPayload(slot) {
    return {
      id: slot.id || "",
      serviceId: slot.serviceId || "",
      serviceName: serviceName(slot.serviceId),
      venue: slot.venue || "",
      day: slot.day || "",
      timeLabel: slot.timeLabel || "",
      sortTime: slot.sortTime || "",
      capacity: Number(slot.capacity || 0),
      taken: Number(slot.taken || 0),
      free: freeOf(slot),
    };
  }

  function encodeSlotAttr(slot) {
    try {
      return encodeURIComponent(JSON.stringify(slotPayload(slot)));
    } catch (_e) {
      return "";
    }
  }

  function decodeSlotAttr(raw) {
    try {
      return JSON.parse(decodeURIComponent(String(raw || "")));
    } catch (_e) {
      return null;
    }
  }

  function daySectionHtml(day, rows) {
    if (!rows.length) return "";
    var body = rows
      .map(function (slot) {
        var free = freeOf(slot);
        var tone = free > 0 ? "ok" : "warn";
        var payload = encodeSlotAttr(slot);
        var placeBtns =
          free > 0
            ? '<div class="op2627-place">' +
              '<button type="button" class="btn btn--pri btn--sm" data-op2627-place="existing" data-op2627-slot="' +
              esc(payload) +
              '">Existing</button>' +
              '<button type="button" class="btn btn--sec btn--sm" data-op2627-place="new" data-op2627-slot="' +
              esc(payload) +
              '">New</button>' +
              "</div>"
            : '<span class="muted">—</span>';
        return (
          "<tr>" +
          '<td class="op2627-td op2627-td--svc">' +
          esc(serviceName(slot.serviceId)) +
          "</td>" +
          '<td class="op2627-td op2627-td--venue">' +
          esc(slot.venue || "—") +
          "</td>" +
          '<td class="op2627-td op2627-td--time">' +
          esc(slot.timeLabel || "—") +
          "</td>" +
          '<td class="op2627-td op2627-td--num">' +
          esc(String(slot.capacity || 0)) +
          "</td>" +
          '<td class="op2627-td op2627-td--num">' +
          esc(String(slot.taken || 0)) +
          "</td>" +
          '<td class="op2627-td op2627-td--free"><span class="chip chip--' +
          tone +
          '">' +
          esc(String(free)) +
          " free</span></td>" +
          '<td class="op2627-td op2627-td--place">' +
          placeBtns +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="card" style="margin-bottom:14px;min-width:0">' +
      '<div class="card-pad" style="min-width:0">' +
      "<h3 style=\"margin:0 0 10px;font-size:1.05rem;min-width:0;overflow-wrap:break-word\">" +
      esc(day) +
      " · " +
      esc(String(rows.length)) +
      " band" +
      (rows.length === 1 ? "" : "s") +
      "</h3>" +
      '<div class="op2627-tbl-wrap">' +
      '<table class="tbl tbl--center op2627-tbl">' +
      "<thead><tr>" +
      '<th class="op2627-th op2627-td--svc">Service</th>' +
      '<th class="op2627-th op2627-td--venue">Venue</th>' +
      '<th class="op2627-th op2627-td--time">Time</th>' +
      '<th class="op2627-th op2627-td--num">Cap</th>' +
      '<th class="op2627-th op2627-td--num">Taken</th>' +
      '<th class="op2627-th op2627-td--free">Free</th>' +
      '<th class="op2627-th op2627-td--place">Place</th>' +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div></div></div>"
    );
  }

  function render() {
    var root = $("op2627Root");
    if (!root) return;

    if (state.loading) {
      root.innerHTML = '<p class="muted" style="margin:0">Loading live places…</p>';
      return;
    }

    if (state.error) {
      root.innerHTML =
        '<div class="card card-pad" style="min-width:0">' +
        '<p style="margin:0 0 8px;min-width:0;overflow-wrap:break-word"><strong>Could not load places.</strong> ' +
        esc(state.error) +
        "</p>" +
        '<button type="button" class="btn btn--pri btn--sm" data-op2627-refresh>Retry</button>' +
        "</div>";
      return;
    }

    var slots = filteredSlots();
    var byDay = {};
    DAY_ORDER.forEach(function (d) {
      byDay[d] = [];
    });
    slots.forEach(function (slot) {
      var day = slot.day || "Monday";
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(slot);
    });
    DAY_ORDER.forEach(function (d) {
      byDay[d].sort(function (a, b) {
        var va = String(a.venue || "").localeCompare(String(b.venue || ""));
        if (va) return va;
        return String(a.sortTime || a.timeLabel || "").localeCompare(
          String(b.sortTime || b.timeLabel || "")
        );
      });
    });

    var venues = uniqueSorted(
      state.slots.map(function (s) {
        return s.venue;
      })
    );
    var daysPresent = uniqueSorted(
      state.slots.map(function (s) {
        return s.day;
      })
    ).sort(function (a, b) {
      return DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b);
    });

    var metaBits = [];
    if (state.termLabel) metaBits.push(state.termLabel);
    if (state.termRange) metaBits.push(state.termRange);
    if (state.madreUpdatedAt) {
      try {
        metaBits.push(
          "Roster updated " + new Date(state.madreUpdatedAt).toLocaleString("en-GB")
        );
      } catch (_e) {
        /* ignore */
      }
    }

    var sections = DAY_ORDER.map(function (d) {
      return daySectionHtml(d, byDay[d] || []);
    }).join("");

    if (!slots.length) {
      sections =
        '<div class="card card-pad"><p class="muted" style="margin:0;min-width:0;overflow-wrap:break-word">' +
        (state.filters.openOnly
          ? "No open places match these filters. Turn off “Open places only” to see full bands."
          : "No bands match these filters.") +
        "</p></div>";
    }

    root.innerHTML =
      '<div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:10px;min-width:0">' +
      '<button type="button" class="btn btn--pri btn--sm" data-op2627-refresh>Refresh</button>' +
      '<a class="btn btn--ghost btn--sm" href="/bookingportal" target="_blank" rel="noopener">Open Booking Portal</a>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-op2627-waitlist>Waiting list</button>' +
      "</div>" +
      (metaBits.length
        ? '<p class="muted" style="margin:0 0 10px;max-width:52rem;min-width:0;overflow-wrap:break-word">' +
          esc(metaBits.join(" · ")) +
          (state.termBadge ? " · " + esc(state.termBadge) : "") +
          "</p>"
        : "") +
      '<div class="card card-pad" style="margin-bottom:12px;min-width:0">' +
      '<div class="toolbar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;min-width:0">' +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Day</span>" +
      '<select id="op2627Day" class="inp" style="min-width:8rem">' +
      optionHtml(daysPresent, state.filters.day, "All days") +
      "</select></label>" +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Service</span>" +
      '<select id="op2627Service" class="inp" style="min-width:10rem">' +
      serviceOptionHtml(state.filters.service) +
      "</select></label>" +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Venue</span>" +
      '<select id="op2627Venue" class="inp" style="min-width:8rem">' +
      optionHtml(venues, state.filters.venue, "All venues") +
      "</select></label>" +
      '<label class="muted" style="display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:13px">' +
      '<input type="checkbox" id="op2627OpenOnly"' +
      (state.filters.openOnly ? " checked" : "") +
      " /> Open places only</label>" +
      "</div></div>" +
      kpiHtml(slots) +
      sections;
  }

  function applyFiltersFromDom() {
    var dayEl = $("op2627Day");
    var svcEl = $("op2627Service");
    var venueEl = $("op2627Venue");
    var openEl = $("op2627OpenOnly");
    state.filters.day = dayEl ? String(dayEl.value || "") : "";
    state.filters.service = svcEl ? String(svcEl.value || "") : "";
    state.filters.venue = venueEl ? String(venueEl.value || "") : "";
    state.filters.openOnly = openEl ? !!openEl.checked : true;
  }

  function onRootClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-op2627-refresh]")) {
      void load({ toastOnSuccess: true });
      return;
    }
    if (t.closest("[data-op2627-waitlist]")) {
      try {
        cfg.openView("c4k_waitlist");
      } catch (_e) {
        /* ignore */
      }
      return;
    }
    var placeBtn = t.closest("[data-op2627-place]");
    if (placeBtn) {
      var mode = placeBtn.getAttribute("data-op2627-place") || "";
      var slot = decodeSlotAttr(placeBtn.getAttribute("data-op2627-slot"));
      if (!slot) return;
      try {
        if (mode === "new") cfg.placeNew(slot);
        else cfg.placeExisting(slot);
      } catch (_e2) {
        /* ignore */
      }
    }
  }

  function onRootChange(ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    if (
      t.id === "op2627Day" ||
      t.id === "op2627Service" ||
      t.id === "op2627Venue" ||
      t.id === "op2627OpenOnly"
    ) {
      applyFiltersFromDom();
      render();
    }
  }

  function applyPayload(data) {
    state.error = null;
    state.termLabel = data.TERM_LABEL || (data.term && data.term.label) || "Autumn Term 2026";
    state.termRange = data.TERM_RANGE || (data.term && data.term.range) || "";
    state.termBadge = data.TERM_BADGE || (data.term && data.term.badge) || "";
    state.madreUpdatedAt = data.madre_updated_at || null;
    state.servicesById = {};
    (data.SERVICES || []).forEach(function (svc) {
      if (svc && svc.id) state.servicesById[svc.id] = svc;
    });
    state.slots = Array.isArray(data.MOCK_SLOTS) ? data.MOCK_SLOTS.slice() : [];
  }

  function load(opts) {
    var options = opts || {};
    state.loading = true;
    state.error = null;
    render();
    var key = anonKey();
    if (!key) {
      state.loading = false;
      state.error = "missing_anon_key";
      render();
      return Promise.resolve();
    }
    var url = supabaseBase() + "/functions/v1/portal-booking-offer";
    return fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + key,
        apikey: key,
        Accept: "application/json",
      },
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body || body.ok === false) {
            throw new Error((body && body.error) || "offer_http_" + res.status);
          }
          applyPayload(body);
          state.loading = false;
          render();
          if (options.toastOnSuccess) {
            try {
              cfg.toast("Open places updated", "ok");
            } catch (_e) {
              /* ignore */
            }
          }
        });
      })
      .catch(function (err) {
        state.loading = false;
        state.error = (err && err.message) || "offer_load_failed";
        render();
      });
  }

  function bindModule() {
    var root = $("op2627Root");
    if (!root) return;
    if (!root._op2627Bound) {
      root._op2627Bound = true;
      root.addEventListener("click", onRootClick);
      root.addEventListener("change", onRootChange);
    }
    void load({ toastOnSuccess: false });
  }

  global.PortalAdminOpenPlaces2627 = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    load: load,
  };
})(typeof window !== "undefined" ? window : globalThis);
