/**
 * CS Cliq hub role tiers: Staff, Lead, Management (Admin + CEO unified).
 */
(function (global) {
  "use strict";

  var RAIL_SVGS = {
    inbox:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    announcements:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    meetings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    files:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    support:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  function profileRow() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function portalPath() {
    try {
      return String((global.location && global.location.pathname) || "").toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function isLeadProfile(prof) {
    prof = prof || profileRow();
    if (global.portalLeadStaffChatDirectory && typeof global.portalLeadStaffChatDirectory.portalStaffIsLeadUser === "function") {
      return global.portalLeadStaffChatDirectory.portalStaffIsLeadUser(prof);
    }
    var app = String(prof.app_role || "").toLowerCase();
    var sr = String(prof.staff_role || "").toLowerCase();
    return app === "lead" || sr === "manager";
  }

  function isManagementProfile(prof) {
    prof = prof || profileRow();
    if (/admin_dashboard\.html/.test(portalPath())) return true;
    if (global.portalDmRoles) {
      if (typeof global.portalDmRoles.portalDmUsesAdminCliq === "function" && global.portalDmRoles.portalDmUsesAdminCliq(prof)) {
        return true;
      }
      if (typeof global.portalDmRoles.portalDmIsAdminProfile === "function" && global.portalDmRoles.portalDmIsAdminProfile(prof)) {
        return true;
      }
      if (typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" && global.portalDmRoles.portalDmIsDirectorProfile(prof)) {
        return true;
      }
    }
    var app = String(prof.app_role || "").toLowerCase();
    return app === "admin" || app === "ceo";
  }

  function getTier() {
    if (isManagementProfile()) return "management";
    if (isLeadProfile() || /lead_dashboard\.html/.test(portalPath())) return "lead";
    return "staff";
  }

  function railConfig(tier) {
    tier = tier || getTier();
    if (tier === "management") {
      return [
        { id: "chats", label: "Inbox", icon: "inbox" },
        { id: "announcements", label: "Announcements", icon: "announcements" },
        { id: "calendar", label: "Meetings", icon: "meetings" },
        { id: "files", label: "Files", icon: "files" },
      ];
    }
    if (tier === "lead") {
      return [
        { id: "chats", label: "Inbox", icon: "inbox" },
        { id: "calendar", label: "Meetings", icon: "meetings" },
        { id: "files", label: "Files", icon: "files" },
      ];
    }
    return [
      { id: "chats", label: "Inbox", icon: "inbox" },
      { id: "files", label: "Files", icon: "files" },
      { id: "support", label: "Support", icon: "support" },
    ];
  }

  function canManageAnnouncements() {
    return getTier() === "management";
  }

  function canComposeBroadcasts() {
    return canManageAnnouncements();
  }

  function canCreateConversations() {
    return getTier() !== "staff";
  }

  function canUseTeams() {
    return false;
  }

  function canScheduleMeetings() {
    return getTier() === "management" || getTier() === "lead";
  }

  function meetingButtonLabel() {
    return canScheduleMeetings() ? "Meeting" : "Request meeting";
  }

  function buildRailHtml(tier) {
    tier = tier || getTier();
    return railConfig(tier)
      .map(function (item) {
        var svg = RAIL_SVGS[item.icon] || "";
        return (
          '<button type="button" class="portal-cs-cliq__rail-btn" data-cs-cliq-rail="' +
          item.id +
          '" title="' +
          item.label +
          '">' +
          '<span class="portal-cs-cliq__rail-btn__ico" aria-hidden="true">' +
          svg +
          "</span>" +
          '<span class="portal-cs-cliq__rail-label">' +
          item.label +
          "</span></button>"
        );
      })
      .join("");
  }

  function applyRootChrome() {
    var root = document.getElementById("csCliqRoot");
    if (!root) return;
    var tier = getTier();
    root.classList.remove("portal-cs-cliq--tier-staff", "portal-cs-cliq--tier-lead", "portal-cs-cliq--tier-management");
    root.classList.add("portal-cs-cliq--tier-" + tier);
    root.setAttribute("data-cs-cliq-tier", tier);
    var rail = root.querySelector(".portal-cs-cliq__rail");
    if (rail) rail.innerHTML = buildRailHtml(tier);
    var newBtn = document.getElementById("csCliqBtnNew");
    if (newBtn) newBtn.hidden = !canCreateConversations();
    var channelNav = document.getElementById("csCliqChannelNav");
    if (channelNav) channelNav.hidden = true;
    var meetBtn = document.getElementById("csCliqHeadMeetingBtn");
    if (meetBtn) {
      var lbl = meetingButtonLabel();
      meetBtn.title = lbl;
      meetBtn.setAttribute("aria-label", lbl);
    }
  }

  global.portalCsCliqHubRoles = {
    getTier: getTier,
    railConfig: railConfig,
    buildRailHtml: buildRailHtml,
    applyRootChrome: applyRootChrome,
    canManageAnnouncements: canManageAnnouncements,
    canComposeBroadcasts: canComposeBroadcasts,
    canCreateConversations: canCreateConversations,
    canUseTeams: canUseTeams,
    canScheduleMeetings: canScheduleMeetings,
    meetingButtonLabel: meetingButtonLabel,
    isManagementProfile: isManagementProfile,
  };
})(typeof window !== "undefined" ? window : globalThis);
