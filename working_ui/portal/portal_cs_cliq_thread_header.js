/**
 * Premium open-conversation header for CS Cliq.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(label) {
    var parts = String(label || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function sync(ui) {
    ui = ui || global.__PORTAL_ADMIN_DM_UI || {};
    var header = document.getElementById("csCliqThreadHeader");
    if (!header) return;
    var inThread = String(ui.panel || "") === "thread";
    header.hidden = !inThread;
    header.setAttribute("aria-hidden", inThread ? "false" : "true");
    if (!inThread) return;
    var label = String(ui.peerLabel || "").trim() || "Conversation";
    var nameEl = document.getElementById("csCliqThreadName");
    var roleEl = document.getElementById("csCliqThreadRole");
    var statusEl = document.getElementById("csCliqThreadStatus");
    var avatarEl = document.getElementById("csCliqThreadAvatar");
    if (nameEl) nameEl.textContent = label;
    if (avatarEl) avatarEl.textContent = initials(label);
    var role = ui.groupId ? "Group" : ui.peerRole || "Staff";
    if (roleEl) roleEl.textContent = role;
    if (statusEl) {
      try {
        var away = String(global.localStorage.getItem("portal_cs_cliq_workspace_status") || "at_work") === "away";
        statusEl.textContent = away ? "Away" : "Available";
      } catch (_s) {
        statusEl.textContent = "Available";
      }
    }
    var tier = global.portalCsCliqHubRoles && global.portalCsCliqHubRoles.getTier ? global.portalCsCliqHubRoles.getTier() : "management";
    var canCall = tier !== "staff" || ui.peerIsLeadOrManagement;
    var callBar = document.getElementById("csCliqHeadCallBar");
    if (callBar) {
      callBar.hidden = !canCall;
      callBar.setAttribute("aria-hidden", canCall ? "false" : "true");
    }
    var meetBtn = document.getElementById("csCliqHeadMeetingBtn");
    if (meetBtn && global.portalCsCliqHubRoles) {
      var ml = global.portalCsCliqHubRoles.meetingButtonLabel();
      meetBtn.title = ml;
      meetBtn.setAttribute("aria-label", ml);
    }
    if (global.portalCsCliqThreadFiles && typeof global.portalCsCliqThreadFiles.onThreadChange === "function") {
      global.portalCsCliqThreadFiles.onThreadChange();
    }
  }

  function syncInternal(peerLabel, peerRole) {
    var header = document.getElementById("internalChatThreadHeader");
    if (!header) return;
    var label = String(peerLabel || "").trim() || "Conversation";
    var nameEl = document.getElementById("internalChatThreadName");
    var roleEl = document.getElementById("internalChatThreadRole");
    var statusEl = document.getElementById("internalChatThreadStatus");
    var avatarEl = document.getElementById("internalChatThreadAvatar");
    if (nameEl) nameEl.textContent = label;
    if (avatarEl) avatarEl.textContent = initials(label);
    var role = String(peerRole || "").trim() || "Staff";
    if (roleEl) roleEl.textContent = role;
    if (statusEl) statusEl.textContent = "Available";
    header.hidden = false;
    header.setAttribute("aria-hidden", "false");
    if (global.portalCsCliqThreadFiles && typeof global.portalCsCliqThreadFiles.onThreadChange === "function") {
      global.portalCsCliqThreadFiles.onThreadChange();
    }
  }

  global.portalCsCliqThreadHeader = { sync: sync, syncInternal: syncInternal, initials: initials, esc: esc };
})(typeof window !== "undefined" ? window : globalThis);
