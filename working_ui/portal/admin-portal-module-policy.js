/**
 * Admin portal — module visibility and view routing policy.
 *
 * The live admin shell is still one HTML file, but feature flags and nav
 * filtering live here so we can retire surfaces without deleting shared
 * roster/finance helpers used by Scheduling and CFK Services.
 *
 * Backend (Supabase Edge Functions, SMTP, WhatsApp) stays separate under
 * supabase/functions/. This file is browser-only policy.
 */
(function (global) {
  "use strict";

  /** Bookings / Orders catalogue — retired; parent booking moves to a future parent portal. Use CFK Services. */
  var HIDE_BOOKINGS = true;
  var BOOKINGS_VIEW_IDS = ["bookings", "orders_all", "orders_outstanding"];
  var BOOKINGS_REPLACEMENT_VIEW =
    (typeof global !== "undefined" &&
      global.PortalCfkApp &&
      global.PortalCfkApp.viewId) ||
    "c4k_services";

  function bookingsHidden() {
    return HIDE_BOOKINGS;
  }

  function isBookingsView(id) {
    var v = String(id || "").trim();
    return BOOKINGS_VIEW_IDS.indexOf(v) >= 0;
  }

  function redirectView(id) {
    var v = String(id || "").trim();
    if (!bookingsHidden() || !isBookingsView(v)) return v;
    return BOOKINGS_REPLACEMENT_VIEW;
  }

  function navViewAllowed(id) {
    if (bookingsHidden() && isBookingsView(id)) return false;
    return true;
  }

  function filterNavGroupChildren(children) {
    if (!bookingsHidden() || !Array.isArray(children)) return children || [];
    var out = [];
    (children || []).forEach(function (cid) {
      var cs = String(cid);
      if (cs.indexOf("__h:") === 0) {
        if (cs === "__h:Orders") return;
        out.push(cid);
        return;
      }
      if (isBookingsView(cs)) return;
      out.push(cid);
    });
    return out;
  }

  function filterHubActionIds(ids) {
    if (!bookingsHidden() || !Array.isArray(ids)) return ids || [];
    return (ids || []).filter(function (id) {
      var key = id && typeof id === "object" ? id.id : id;
      return !isBookingsView(key);
    });
  }

  global.PortalAdminModulePolicy = {
    bookingsHidden: bookingsHidden,
    isBookingsView: isBookingsView,
    redirectView: redirectView,
    navViewAllowed: navViewAllowed,
    filterNavGroupChildren: filterNavGroupChildren,
    filterHubActionIds: filterHubActionIds,
    bookingsReplacementView: function () {
      return BOOKINGS_REPLACEMENT_VIEW;
    },
  };

  global.portalAdminBookingsHidden = bookingsHidden;
  global.portalAdminRedirectView = redirectView;
  global.portalAdminNavViewAllowed = navViewAllowed;
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : this
);
