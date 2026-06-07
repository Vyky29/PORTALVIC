/**
 * Open unified admin CS Cliq from staff/lead portals (inline embed, not redirect).
 */
(function (global) {
  "use strict";

  function profileRow() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function usesAdminCliq() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmUsesAdminCliq === "function") {
      return global.portalDmRoles.portalDmUsesAdminCliq(profileRow());
    }
    return false;
  }

  function onAdminPortal() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmOnAdminPortal === "function") {
      return global.portalDmRoles.portalDmOnAdminPortal();
    }
    try {
      return /admin_dashboard\.html/i.test(String((global.location && global.location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  function tryOpenAdminCliq(channel) {
    if (!usesAdminCliq() || onAdminPortal()) return false;
    channel = String(channel || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
    if (global.portalCsCliqEmbed && typeof global.portalCsCliqEmbed.open === "function") {
      return global.portalCsCliqEmbed.open(channel);
    }
    return false;
  }

  /** Restricted staff/leads: internal chat sheet only (no full CS Cliq embed). */
  function openRestrictedWorkerInternalChat(channel) {
    if (onAdminPortal() || usesAdminCliq()) return false;
    var sheet = global.document && global.document.getElementById("internalChatSheet");
    if (!sheet) return false;
    channel = String(channel || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
    global.__PORTAL_ADMIN_DM_CHANNEL = channel;
    try {
      if (typeof global.closeSheet === "function") {
        global.closeSheet({ bypassAnnouncementLock: true });
      }
    } catch (_cl) {}
    try {
      delete global.__PORTAL_OFFICE_DM_PEER_CACHE;
    } catch (_c) {}
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
    global.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = false;
    global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = global.__PORTAL_INTERNAL_CHAT_UI.inboxTab || "chats";
    void (async function () {
      if (typeof global.portalStaffDmAckInboxOpened === "function") {
        await global.portalStaffDmAckInboxOpened();
      }
      if (typeof global.openSheet === "function") {
        global.openSheet("internalChatSheet");
      }
    })();
    return true;
  }

  /** Staff/lead portal chat entry: executives get CS Cliq embed; everyone else gets restricted inbox. */
  function openPortalWorkerChat(channel) {
    if (onAdminPortal()) return false;
    if (tryOpenAdminCliq(channel)) return true;
    return openRestrictedWorkerInternalChat(channel);
  }

  global.portalDmExecutiveCliq = {
    tryOpenAdminCliq: tryOpenAdminCliq,
    openRestrictedWorkerInternalChat: openRestrictedWorkerInternalChat,
    openPortalWorkerChat: openPortalWorkerChat,
  };
})(typeof window !== "undefined" ? window : globalThis);
