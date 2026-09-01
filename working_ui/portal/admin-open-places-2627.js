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
    bandHint: "",
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

  function stylesHtml() {
    return (
      '<style id="op2627Styles">' +
      ".op2627{min-width:0}" +
      ".op2627-embed{margin-top:28px;padding-top:20px;border-top:1px solid var(--line,#d8dee8)}" +
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
      ".op2627-band-hint{margin:0 0 10px;font-size:13px;min-width:0;overflow-wrap:break-word}" +
      "</style>"
    );
  }

  /**
   * @param {{ embedded?: boolean }} [opts]
   * embedded: section under Services (no standalone page chrome).
   */
  function viewHtml(opts) {
    var embedded = !!(opts && opts.embedded);
    var head = embedded
      ? '<div id="op2627Anchor" class="op2627-embed" style="margin-top:28px;min-width:0;scroll-margin-top:14px;border-top:1px solid var(--line,#e5e7eb);padding-top:16px">' +
        '<h2 class="page-title" style="font-size:1.15rem;margin:0 0 6px;min-width:0;overflow-wrap:break-word">3 · Live open places (Booking Portal)</h2>' +
        '<p class="page-intro" style="max-width:52rem;margin:0 0 12px;min-width:0;overflow-wrap:break-word">' +
        "Public seats still free (capacity / taken / free — no names). Same source as the Booking Portal. " +
        "Use <strong>Place existing</strong> or <strong>Place new</strong> on a free band. Filters follow Services above." +
        "</p>"
      : '<div class="page-head" style="min-width:0">' +
        '<h2 class="page-title" style="min-width:0;overflow-wrap:break-word">Open places 2026/27</h2>' +
        '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
        "This board now lives under <strong>Services</strong> (section 3). Opening this shortcut takes you there." +
        "</p></div>";
    var close = embedded ? "</div>" : "";
    return (
      stylesHtml() +
      head +
      '<div id="op2627Root" class="op2627" style="min-width:0">' +
      '<p class="muted" style="margin:0">Loading live places…</p>' +
      "</div>" +
      close
    );
  }

  function titleCaseDay(day) {
    var s = String(day || "").trim();
    if (!s) return "";
    var lower = s.toLowerCase();
    var map = {
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    };
    if (map[lower]) return map[lower];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function resolveServiceId(nameOrId) {
    var raw = String(nameOrId || "").trim();
    if (!raw) return "";
    if (state.servicesById[raw]) return raw;
    var want = raw.toLowerCase().replace(/\s+/g, " ");
    var ids = Object.keys(state.servicesById);
    var i;
    for (i = 0; i < ids.length; i++) {
      var n = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (n === want) return ids[i];
    }
    for (i = 0; i < ids.length; i++) {
      var n2 = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (n2.indexOf(want) >= 0 || want.indexOf(n2) >= 0) return ids[i];
    }
    var first = want.split(" ")[0];
    if (first.length >= 4) {
      for (i = 0; i < ids.length; i++) {
        var n3 = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "").toLowerCase();
        if (n3.indexOf(first) >= 0) return ids[i];
      }
    }
    return "";
  }

  /**
   * Filter open-places board to a Services band and scroll into view.
   * @param {{ day?: string, venue?: string, serviceId?: string, serviceName?: string, programme?: string, openOnly?: boolean }} band
   */
  function applyBandFilter(band) {
    band = band || {};
    var day = titleCaseDay(band.day || "");
    var venue = String(band.venue || "").trim();
    var svc =
      String(band.serviceId || "").trim() ||
      resolveServiceId(band.serviceName || band.programme || "");
    state.filters.day = day;
    state.filters.venue = venue;
    state.filters.service = svc;
    if (band.openOnly === false) state.filters.openOnly = false;
    else state.filters.openOnly = true;
    state.bandHint = [day, venue, svc ? serviceName(svc) : String(band.programme || band.serviceName || "").trim()]
      .filter(Boolean)
      .join(" · ");
    render();
    var anchor = $("op2627Anchor") || $("op2627Root");
    if (anchor && typeof anchor.scrollIntoView === "function") {
      try {
        anchor.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (_e) {
        try {
          anchor.scrollIntoView(true);
        } catch (_e2) {
          /* ignore */
        }
      }
    }
  }

  /** Sync day/venue from Services filter bar (shared filters). */
  function syncFromServicesFilters(filt) {
    filt = filt || {};
    var day = titleCaseDay(filt.day || "");
    var venue = String(filt.venue || "").trim();
    var programme = String(filt.class || filt.programme || "").trim();
    var changed = false;
    if (state.filters.day !== day) {
      state.filters.day = day;
      changed = true;
    }
    if (state.filters.venue !== venue) {
      state.filters.venue = venue;
      changed = true;
    }
    if (programme) {
      var sid = resolveServiceId(programme);
      if (sid && state.filters.service !== sid) {
        state.filters.service = sid;
        changed = true;
      }
    } else if (!programme && filt.clearService) {
      if (state.filters.service) {
        state.filters.service = "";
        changed = true;
      }
    }
    if (changed) {
      state.bandHint = "";
      render();
    }
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
      instructors: Array.isArray(slot.instructors) ? slot.instructors.slice() : [],
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
              '">Place existing</button>' +
              '<button type="button" class="btn btn--sec btn--sm" data-op2627-place="new" data-op2627-slot="' +
              esc(payload) +
              '">Place new</button>' +
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
      (state.bandHint
        ? '<button type="button" class="btn btn--ghost btn--sm" data-op2627-clear-band>Clear band filter</button>'
        : "") +
      "</div>" +
      (state.bandHint
        ? '<p class="op2627-band-hint muted">Showing band from Services: <strong>' +
          esc(state.bandHint) +
          "</strong></p>"
        : "") +
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
    if (t.closest("[data-op2627-clear-band]")) {
      state.bandHint = "";
      state.filters.day = "";
      state.filters.venue = "";
      state.filters.service = "";
      state.filters.openOnly = true;
      render();
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
      state.bandHint = "";
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
    applyBandFilter: applyBandFilter,
    syncFromServicesFilters: syncFromServicesFilters,
    resolveServiceId: resolveServiceId,
  };
})(typeof window !== "undefined" ? window : globalThis);
