/**
 * CS Cliq inbox helpers — group label simplification + canonical slug dedupe.
 * Staff announcements use the logo halo / announcements sheet, not chat inbox.
 */
(function (global) {
  "use strict";

  var STAFF_POOL_CHANNEL_SLUGS = [
    "swimming_instructors",
    "climbing_instructors",
    "support_staff",
    "pool_leads",
  ];

  function normalizeTitleText(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[·•—–-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalGroupSlug(slug, title) {
    slug = String(slug || "").toLowerCase().trim();
    var nt = normalizeTitleText(title);
    var ns = normalizeTitleText(slug);
    var combo = (ns + " " + nt).trim();

    if (
      slug === "all_ceos" ||
      ns === "all_ceos" ||
      /all\s*ceos/.test(nt) ||
      /ceos.*raul.*victor.*javi/.test(combo)
    ) {
      return "all_ceos";
    }
    if (
      slug === "ceo_liaison" ||
      ns === "ceo_liaison" ||
      /ceo\s*liaison/.test(nt) ||
      /ceos.*sevitha/.test(combo)
    ) {
      return "ceo_liaison";
    }
    if (slug === "staff_leads_ops" || /operations\s*group/.test(nt)) return "staff_leads_ops";
    if (slug === "session_leads") return "session_leads";
    if (slug === "swimming_instructors" || /swimming\s*instructors?/.test(nt)) {
      return "swimming_instructors";
    }
    if (slug === "climbing_instructors" || /climbing\s*instructors?/.test(nt)) {
      return "climbing_instructors";
    }
    if (slug === "support_staff" || /support\s*staff/.test(nt)) return "support_staff";
    if (slug === "pool_leads" || (nt === "leads" && slug !== "session_leads")) return "pool_leads";
    var simp = simplifyGroupLabel(slug, title);
    if (simp && simp !== String(title || "").trim()) {
      var fromSimp = canonicalGroupSlug("", simp);
      if (fromSimp && fromSimp !== slug) return fromSimp;
    }
    return slug;
  }

  function isStaffPoolChannelSlug(slug) {
    return STAFF_POOL_CHANNEL_SLUGS.indexOf(String(slug || "").toLowerCase()) >= 0;
  }

  function staffPoolChannelSlugOrder() {
    return STAFF_POOL_CHANNEL_SLUGS.slice();
  }

  function simplifyGroupLabel(slug, title) {
    slug = String(slug || "").toLowerCase();
    title = String(title || "").trim();
    if (slug === "all_ceos" || /all\s*ceos/i.test(title) || /ceos.*raul.*victor.*javi/i.test(title)) {
      return "All CEOs";
    }
    if (slug === "ceo_liaison" || /ceo\s*liaison/i.test(title) || /ceos.*sevitha/i.test(title)) {
      return "Sev + CEOs";
    }
    if (slug === "staff_leads_ops" || /operations\s*group/i.test(title)) return "Leads coordination";
    if (slug === "session_leads") return "Session leads";
    if (slug === "swimming_instructors") return "Swimming Instructors";
    if (slug === "climbing_instructors") return "Climbing Instructors";
    if (slug === "support_staff") return "Support Staff";
    if (slug === "pool_leads") return "Leads";
    return title || "Group";
  }

  global.portalCsCliqAnnouncementInbox = {
    canonicalGroupSlug: canonicalGroupSlug,
    simplifyGroupLabel: simplifyGroupLabel,
    isStaffPoolChannelSlug: isStaffPoolChannelSlug,
    staffPoolChannelSlugOrder: staffPoolChannelSlugOrder,
    normalizeTitleText: normalizeTitleText,
  };
})(typeof window !== "undefined" ? window : globalThis);
