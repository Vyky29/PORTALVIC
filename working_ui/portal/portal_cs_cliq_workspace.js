/**
 * CS Cliq workspace bridge ? announcements, files, meetings, and portal routing.
 */
(function (global) {
  "use strict";

  var CHANNEL_ICONS = {
    announcements:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    reminders:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/><path d="M6.38 18.7L4 21"/><path d="M17.64 18.7L20 21"/></svg>',
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function portalKind() {
    try {
      var p = String((global.location && global.location.pathname) || "").toLowerCase();
      if (/admin_dashboard\.html/.test(p)) return "admin";
      if (/ceo_dashboard\.html/.test(p)) return "ceo";
      if (/lead_dashboard\.html/.test(p)) return "lead";
      if (/staff_dashboard\.html/.test(p)) return "staff";
    } catch (_e) {}
    return "staff";
  }

  function onAdminPortal() {
    return portalKind() === "admin";
  }

  function profileRow() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function canManageChannels() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmUsesAdminCliq === "function") {
      return global.portalDmRoles.portalDmUsesAdminCliq(profileRow());
    }
    var p = profileRow();
    var app = String(p.app_role || "").toLowerCase();
    if (app === "admin" || app === "ceo") return true;
    if (app === "lead" && (portalKind() === "lead" || portalKind() === "staff")) return true;
    return false;
  }

  function defaultNavIconHtml(name) {
    var svg = CHANNEL_ICONS[name] || "";
    return svg ? '<span class="portal-cs-cliq-channel-ico" aria-hidden="true">' + svg + "</span>" : "";
  }

  function openSheet(id) {
    if (typeof global.openSheet === "function") {
      global.openSheet(id);
      return true;
    }
    return false;
  }

  /** Staff / lead CS Cliq simplified inbox ? view portal announcements (UI only). */
  function openAnnouncementsSheet() {
    if (openSheet("announcementsSheet", { bypassAnnouncementLock: true })) return true;
    try {
      global.location.assign("/staff_dashboard.html");
    } catch (_a) {}
    return false;
  }

  /** Staff CS Cliq simplified inbox ? meeting request entry (UI only). */
  function openMeetingRequestEntry() {
    if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.openMeetingPanel === "function") {
      global.portalStaffChatCalls.openMeetingPanel({ contextual: false });
      return true;
    }
    if (global.portalCsCliqSupport && typeof global.portalCsCliqSupport.openMeetingRequest === "function") {
      global.portalCsCliqSupport.openMeetingRequest();
      return true;
    }
    return false;
  }

  function openView(viewId) {
    viewId = String(viewId || "").trim();
    if (!viewId) return false;
    if (onAdminPortal() && typeof global.setView === "function") {
      global.setView(viewId);
      return true;
    }
    if (viewId === "portal_documents" || viewId === "documents") {
      try {
        global.location.assign("/policies_portal.html");
      } catch (_d) {}
      return true;
    }
    if (viewId === "scheduling") {
      if (openSheet("termSheet")) return true;
      if (portalKind() === "ceo") {
        try {
          global.location.assign("/staff_dashboard.html");
        } catch (_c) {}
        return true;
      }
    }
    return false;
  }

  function delegateAdmin(fnName) {
    if (typeof global[fnName] === "function") {
      global[fnName]();
      return true;
    }
    return false;
  }

  function channelActions() {
    return {
      composeAnnouncement: function () {
        if (typeof global.openComposeModalAnnouncementOrReminder === "function") {
          global.openComposeModalAnnouncementOrReminder(false);
          return;
        }
        if (global.portalCsCliqComposeSheet && typeof global.portalCsCliqComposeSheet.open === "function") {
          global.portalCsCliqComposeSheet.open("announcement");
        }
      },
      composeReminder: function () {
        if (typeof global.openComposeModalAnnouncementOrReminder === "function") {
          global.openComposeModalAnnouncementOrReminder(true);
          return;
        }
        if (global.portalCsCliqComposeSheet && typeof global.portalCsCliqComposeSheet.open === "function") {
          global.portalCsCliqComposeSheet.open("reminder");
        }
      },
      signedLog: function () {
        if (delegateAdmin("openPortalAdminAnnouncementSignedModal")) return;
        if (openSheet("announcementsSheet")) return;
        try {
          global.location.assign("/admin_dashboard.html?portal_open=cs_cliq&portal_cliq_pane=channels");
        } catch (_s) {}
      },
      reminderAck: function () {
        if (delegateAdmin("openPortalAdminReminderAckModal")) return;
        if (openSheet("setupReminderSheet")) return;
        if (openSheet("announcementsSheet")) return;
      },
      manage: function () {
        if (delegateAdmin("openPortalAdminMessagesManageModal")) return;
        if (global.portalCsCliqComposeSheet && typeof global.portalCsCliqComposeSheet.openManage === "function") {
          global.portalCsCliqComposeSheet.openManage();
        }
      },
    };
  }

  function onPaneOpen(pane) {
    pane = String(pane || "").trim();
    if (pane === "files" && global.portalCsCliqFilesHub && typeof global.portalCsCliqFilesHub.refresh === "function") {
      void global.portalCsCliqFilesHub.refresh();
    }
    if (pane === "calendar" && global.portalCsCliqMeetingsHub && typeof global.portalCsCliqMeetingsHub.refresh === "function") {
      void global.portalCsCliqMeetingsHub.refresh();
    }
    if (pane === "announcements" && global.portalCsCliqAnnouncementsHub && typeof global.portalCsCliqAnnouncementsHub.refresh === "function") {
      global.portalCsCliqAnnouncementsHub.refresh();
    }
    if (pane === "support" && global.portalCsCliqSupport && typeof global.portalCsCliqSupport.refresh === "function") {
      global.portalCsCliqSupport.refresh();
    }
    if (pane === "channels" && global.portalCsCliqTeams && typeof global.portalCsCliqTeams.refresh === "function") {
      global.portalCsCliqTeams.refresh();
    }
  }

  function syncChannelsChrome() {
    return;
  }

  function buildConfigureOptions(overrides) {
    overrides = overrides || {};
    return {
      esc: overrides.esc || esc,
      adminNavIconHtml: overrides.adminNavIconHtml || defaultNavIconHtml,
      initChat: overrides.initChat || function () {},
      openAdminView: overrides.openAdminView || openView,
      focusChats: overrides.focusChats || function () {
        if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("chats");
        }
      },
      onPaneOpen: onPaneOpen,
      channels: overrides.channels || channelActions(),
    };
  }

  var configuredIconHtml = defaultNavIconHtml;

  function iconHtml(id) {
    return configuredIconHtml(id);
  }

  function runChannelAction(name) {
    var acts = channelActions();
    if (acts && typeof acts[name] === "function") acts[name]();
  }

  function applyConfigure(overrides) {
    overrides = overrides || {};
    if (overrides.adminNavIconHtml) configuredIconHtml = overrides.adminNavIconHtml;
    if (!global.PortalAdminCsCliq || typeof global.PortalAdminCsCliq.configure !== "function") return;
    global.PortalAdminCsCliq.configure(buildConfigureOptions(overrides));
  }

  global.portalCsCliqWorkspace = {
    esc: esc,
    portalKind: portalKind,
    onAdminPortal: onAdminPortal,
    canManageChannels: canManageChannels,
    openView: openView,
    openAnnouncementsSheet: openAnnouncementsSheet,
    openMeetingRequestEntry: openMeetingRequestEntry,
    channelActions: channelActions,
    runChannelAction: runChannelAction,
    onPaneOpen: onPaneOpen,
    syncChannelsChrome: syncChannelsChrome,
    buildConfigureOptions: buildConfigureOptions,
    applyConfigure: applyConfigure,
    defaultNavIconHtml: defaultNavIconHtml,
    iconHtml: iconHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
