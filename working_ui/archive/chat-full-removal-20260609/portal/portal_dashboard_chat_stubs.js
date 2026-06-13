/**
 * No-op stubs after embedded portal chat removal (staff/lead/admin).
 * Keeps legacy inline hooks from throwing when internalChatSheet is absent.
 */
(function (global) {
  "use strict";

  global.portalRenderInternalChatSheet = async function () {};
  global.portalInitFloatingInternalChat = function () {};
  global.portalStaffDmSyncUnreadChrome = async function () {};
  global.portalStaffDmOnRealtimeInsert = async function () {
    return false;
  };
  global.portalSyncInternalChatSheetView = function () {};
  global.portalSyncInternalChatMobileViewport = function () {};
})(typeof window !== "undefined" ? window : globalThis);
