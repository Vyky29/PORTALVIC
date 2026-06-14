/**
 * Hide all user-facing chat/messaging UI until messaging ships again.
 */
(function (global) {
  "use strict";

  global.__PORTAL_HIDE_CHAT_UI__ = true;

  if (typeof global.portalAdminBellResolveChatHints === "function") {
    global.portalAdminBellResolveChatHints = function () {
      return [];
    };
  }

  var style = global.document && global.document.createElement("style");
  if (style) {
    style.id = "portal-hide-chat-ui";
    style.textContent =
      "#internalChatSheet," +
      ".admin-topbar-chat-wrap," +
      ".portal-admin-floating-chat-wrap," +
      ".portal-floating-chat-wrap," +
      ".portal-topbar-chat-btn," +
      ".admin-nav-group[data-group-id=\"g_new_chat\"]," +
      "[data-open=\"internalChatSheet\"]," +
      ".menu-btn--internal-chat," +
      "#portalFloatingChatBtn:not([data-portal-lead-exec-admin=\"1\"])," +
      "#portalFloatingChatOrbitWrap:not([data-portal-lead-exec-admin-wrap=\"1\"])" +
      "{display:none!important;visibility:hidden!important;pointer-events:none!important}";
    (global.document.head || global.document.documentElement).appendChild(style);
  }
})(typeof window !== "undefined" ? window : globalThis);
