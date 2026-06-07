/**
 * CS Cliq Calendar / meetings hub — schedule with staff from open chats.
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

  function activeChatLabel() {
    var ui = global.__PORTAL_ADMIN_DM_UI || global.__PORTAL_INTERNAL_CHAT_UI || {};
    return String(ui.peerLabel || "").trim();
  }

  function hasActiveChat() {
    var ui = global.__PORTAL_ADMIN_DM_UI || global.__PORTAL_INTERNAL_CHAT_UI || {};
    return !!(String(ui.threadId || "").trim() || String(ui.groupId || "").trim());
  }

  function refresh() {
    var host = document.getElementById("csCliqMeetingsHub");
    var status = document.getElementById("csCliqMeetingsActivePeer");
    var hint = document.getElementById("csCliqMeetingsHint");
    var label = activeChatLabel();
    var active = hasActiveChat();
    if (status) status.textContent = active && label ? label : "No active chat selected";
    if (hint) {
      hint.textContent = active
        ? "Schedule a video meeting — " + label + " will get a join button in the thread."
        : "Open a staff or lead chat from Chats, then return here to schedule a meeting with them.";
    }
    if (!host) return;
    var items = [];
    if (active && label) {
      items.push({
        title: "1:1 with " + label,
        sub: "Video meeting invite in the open thread",
        action: "meeting",
      });
    }
    items.push({ title: "Staff term calendar", sub: "Sessions, roster, and term dates", action: "scheduling" });
    items.push({ title: "Open Chats", sub: "Pick someone to meet with", action: "chats" });
    host.innerHTML = items
      .map(function (item, idx) {
        return (
          '<button type="button" class="portal-cs-cliq-meeting-card" data-cs-cliq-meeting-action="' +
          esc(item.action) +
          '">' +
          '<span class="portal-cs-cliq-meeting-card__title">' +
          esc(item.title) +
          "</span>" +
          '<span class="portal-cs-cliq-meeting-card__sub">' +
          esc(item.sub) +
          "</span></button>"
        );
      })
      .join("");
    host.querySelectorAll("[data-cs-cliq-meeting-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-cs-cliq-meeting-action");
        if (act === "meeting") {
          if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.openMeetingPanel === "function") {
            global.portalStaffChatCalls.openMeetingPanel();
          }
          return;
        }
        if (act === "scheduling") {
          if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.openView === "function") {
            global.portalCsCliqWorkspace.openView("scheduling");
          }
          return;
        }
        if (act === "chats" && global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("chats");
        }
      });
    });
  }

  global.portalCsCliqMeetingsHub = { refresh: refresh };
})(typeof window !== "undefined" ? window : globalThis);
