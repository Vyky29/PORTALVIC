/**
 * CFK — ClassForKids parent-facing application (weekly services, booking surface).
 *
 * `c4k_services` is the primary CFK screen: programme grid, filters, registers.
 * Admin mounts it today; the same module will power the dedicated parent portal.
 *
 * Heavy roster rendering stays on the admin host until fully decoupled — this file
 * owns CFK product identity, view shell, filters, and partial refresh.
 */
(function (global) {
  "use strict";

  var VIEW_ID = "c4k_services";
  var PRODUCT_NAME = "CFK";
  var PAGE_TITLE = "Services";
  var PAGE_INTRO =
    "Programmes and time bands for this week — filter, open registers, and spot spare capacity.";

  var deps = {
    $: function (id) {
      return document.getElementById(id);
    },
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    isoDateLocal: function (d) {
      return String(d || "").slice(0, 10);
    },
    getState: function () {
      return {};
    },
    renderRosterHtml: function () {
      return '<p class="muted">Roster renderer not configured.</p>';
    },
    spreadsheetAvailable: function () {
      return false;
    },
    mergeSessions: function () {
      return { slots: [] };
    },
    programmeVenueBlocks: function () {
      return [];
    },
    collectVenues: function () {
      return [];
    },
    collectCoaches: function () {
      return [];
    },
  };

  function configure(options) {
    if (!options) return;
    Object.keys(options).forEach(function (k) {
      if (options[k] != null) deps[k] = options[k];
    });
  }

  function readFiltersFromDom() {
    var dayEl = deps.$("c4kSvcFilterDay");
    var classEl = deps.$("c4kSvcFilterClass");
    var venueEl = deps.$("c4kSvcFilterVenue");
    var coachEl = deps.$("c4kSvcFilterInstructor");
    var spaceEl = deps.$("c4kSvcFilterSpace");
    var waitEl = deps.$("c4kSvcFilterWait");
    return {
      day: dayEl ? String(dayEl.value || "").trim().toLowerCase() : "",
      class: classEl ? String(classEl.value || "").trim() : "",
      venue: venueEl ? String(venueEl.value || "").trim() : "",
      coach: coachEl ? String(coachEl.value || "").trim().toLowerCase() : "",
      spaceOnly: !!(spaceEl && spaceEl.checked),
      waitOnly: !!(waitEl && waitEl.checked),
    };
  }

  function fillFilterSelects() {
    var classEl = deps.$("c4kSvcFilterClass");
    var venueEl = deps.$("c4kSvcFilterVenue");
    var coachEl = deps.$("c4kSvcFilterInstructor");
    if (!classEl || !venueEl || !coachEl) return;
    if (!deps.spreadsheetAvailable()) {
      classEl.innerHTML = '<option value="">Any class</option>';
      venueEl.innerHTML = '<option value="">Any venue</option>';
      coachEl.innerHTML = '<option value="">Any instructor</option>';
      return;
    }
    var pack = deps.mergeSessions();
    var grouped = deps.programmeVenueBlocks(pack);
    var progVals = grouped.map(function (b) {
      return b.programme;
    });
    var venues = deps.collectVenues(pack);
    var coaches = deps.collectCoaches(pack);
    var cVal = classEl.value;
    var vVal = venueEl.value;
    var coVal = coachEl.value;
    classEl.innerHTML =
      '<option value="">Any class</option>' +
      progVals
        .map(function (p) {
          return (
            '<option value="' +
            deps.esc(p) +
            '">' +
            deps.esc(p) +
            "</option>"
          );
        })
        .join("");
    classEl.value = cVal && progVals.indexOf(cVal) >= 0 ? cVal : "";
    venueEl.innerHTML =
      '<option value="">Any venue</option>' +
      venues
        .map(function (v) {
          return (
            '<option value="' +
            deps.esc(v) +
            '">' +
            deps.esc(v) +
            "</option>"
          );
        })
        .join("");
    venueEl.value = vVal && venues.indexOf(vVal) >= 0 ? vVal : "";
    coachEl.innerHTML =
      '<option value="">Any instructor</option>' +
      coaches
        .map(function (c) {
          return (
            '<option value="' +
            deps.esc(c.id) +
            '">' +
            deps.esc(c.name) +
            "</option>"
          );
        })
        .join("");
    coachEl.value =
      coVal && coaches.some(function (c) {
        return c.id === coVal;
      })
        ? coVal
        : "";
  }

  function ensureFiltersDelegated() {
    if (global.__c4kSvcFiltersDelegated) return;
    global.__c4kSvcFiltersDelegated = true;
    var ids = {
      c4kSvcFilterDay: 1,
      c4kSvcFilterClass: 1,
      c4kSvcFilterVenue: 1,
      c4kSvcFilterInstructor: 1,
      c4kSvcFilterSpace: 1,
      c4kSvcFilterWait: 1,
    };
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.id || !ids[t.id]) return;
      var st = deps.getState();
      if (st && st.view === VIEW_ID) refreshPartial();
    });
  }

  function refreshPartial() {
    var a = deps.isoDateLocal(new Date());
    var root = deps.$("c4kServicesRosterRoot");
    var filt = readFiltersFromDom();
    if (root) root.innerHTML = deps.renderRosterHtml(a, a, filt);
  }

  function viewHtml() {
    ensureFiltersDelegated();
    var anchorIso = deps.isoDateLocal(new Date());
    var rosterPart = deps.renderRosterHtml(anchorIso, anchorIso, {});
    return (
      '<h1 class="page-title">' +
      deps.esc(PAGE_TITLE) +
      "</h1>" +
      '<p class="page-intro cfk-app-intro" style="margin-top:0;max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      deps.esc(PAGE_INTRO) +
      ' <span class="chip chip--info" style="vertical-align:middle;margin-left:4px">' +
      deps.esc(PRODUCT_NAME) +
      "</span></p>" +
      '<div class="c4k-svc-jumpbar" style="margin:0 0 12px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="c4kServicesJumpCapacity" title="Jump to the Services &amp; capacity board lower on this page">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><path fill="currentColor" d="M12 16l-6-6 1.41-1.41L12 13.17l4.59-4.58L18 10z"/></svg>' +
      "Go to Services &amp; capacity</button></div>" +
      '<div id="c4kServicesRegisterHost" class="c4k-services-register-host" hidden></div>' +
      '<details class="c4k-svc-filters" id="c4kServicesFiltersPanel" open>' +
      '<summary class="c4k-svc-filters__sum"><span class="c4k-svc-filters__chev" aria-hidden="true"></span> Filter by day, time, venue, class or instructor</summary>' +
      '<div class="c4k-svc-filters__body">' +
      '<div class="c4k-svc-filters__grid">' +
      '<div class="c4k-svc-filters__field"><label class="c4k-svc-filters__lbl" for="c4kSvcFilterDay">Day</label>' +
      '<select class="sel c4k-svc-filters__sel" id="c4kSvcFilterDay" aria-label="Filter by weekday">' +
      '<option value="">Any day</option>' +
      '<option value="monday">Monday</option><option value="tuesday">Tuesday</option><option value="wednesday">Wednesday</option>' +
      '<option value="thursday">Thursday</option><option value="friday">Friday</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option>' +
      "</select></div>" +
      '<div class="c4k-svc-filters__field"><label class="c4k-svc-filters__lbl" for="c4kSvcFilterClass">Class</label>' +
      '<select class="sel c4k-svc-filters__sel" id="c4kSvcFilterClass" aria-label="Filter by programme"><option value="">Any class</option></select></div>' +
      '<div class="c4k-svc-filters__field"><label class="c4k-svc-filters__lbl" for="c4kSvcFilterVenue">Venue</label>' +
      '<select class="sel c4k-svc-filters__sel" id="c4kSvcFilterVenue" aria-label="Filter by venue"><option value="">Any venue</option></select></div>' +
      '<div class="c4k-svc-filters__field"><label class="c4k-svc-filters__lbl" for="c4kSvcFilterInstructor">Instructor</label>' +
      '<select class="sel c4k-svc-filters__sel" id="c4kSvcFilterInstructor" aria-label="Filter by instructor"><option value="">Any instructor</option></select></div>' +
      "</div>" +
      '<div class="c4k-svc-filters__row2">' +
      '<button type="button" class="btn btn--sec btn--sm" id="c4kServicesRefreshBtn">Refresh</button>' +
      '<label class="c4k-svc-filters__check" for="c4kSvcFilterSpace"><span>Space available</span> <input type="checkbox" id="c4kSvcFilterSpace" /></label>' +
      '<label class="c4k-svc-filters__check" for="c4kSvcFilterWait"><span>Participants on waiting list</span> <input type="checkbox" id="c4kSvcFilterWait" /></label>' +
      "</div></div></details>" +
      '<div id="c4kServicesRosterRoot" style="min-width:0;margin-top:4px">' +
      rosterPart +
      "</div>"
    );
  }

  function onBindView() {
    fillFilterSelects();
    refreshPartial();
  }

  global.PortalCfkApp = {
    productName: PRODUCT_NAME,
    viewId: VIEW_ID,
    pageTitle: PAGE_TITLE,
    configure: configure,
    viewHtml: viewHtml,
    refreshPartial: refreshPartial,
    fillFilterSelects: fillFilterSelects,
    readFiltersFromDom: readFiltersFromDom,
    ensureFiltersDelegated: ensureFiltersDelegated,
    onBindView: onBindView,
  };
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : this
);
