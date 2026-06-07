/**
 * CS Cliq inbox helpers â€” group label simplification only.
 * Staff announcements use the logo halo / announcements sheet, not chat inbox.
 */
(function (global) {
  "use strict";

  function simplifyGroupLabel(slug, title) {
    slug = String(slug || "").toLowerCase();
    title = String(title || "").trim();
    if (slug === "all_ceos" || /all\s*ceos/i.test(title) || /ceos.*raul.*victor.*javier/i.test(title)) {
      return "CEOs — Raúl · Victor · Javier";
    }
    if (slug === "ceo_liaison" || /ceo\s*liaison/i.test(title) || /ceos.*sevitha/i.test(title)) {
      return "CEOs & Admin";
    }
    if (slug === "staff_leads_ops" || /operations\s*group/i.test(title)) return "Leads coordination";
    if (slug === "session_leads") return "Session leads";
    return title || "Group";
  }

  global.portalCsCliqAnnouncementInbox = {
    simplifyGroupLabel: simplifyGroupLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
