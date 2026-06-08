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

    /** Thread header: first name for workers; directors/admin keep display names. */
  function headerDisplayName(label, ui) {
    ui = ui || {};
    label = String(label || "").trim();
    if (!label) return "Conversation";
    if (ui.groupId) return label;
    var prof = ui.peerProf || null;
    if (prof && global.portalChatActorIdentity && typeof global.portalChatActorIdentity.inboxPeerLabel === "function") {
      var inboxNm = String(global.portalChatActorIdentity.inboxPeerLabel(prof) || "").trim();
      if (inboxNm) return inboxNm;
    }
    if (global.portalChatActorIdentity) {
      if (typeof global.portalChatActorIdentity.profileDisplayName === "function") {
        var fromProf = String(global.portalChatActorIdentity.profileDisplayName(prof) || "").trim();
        if (fromProf) return fromProf;
      }
      if (typeof global.portalChatActorIdentity.displayName === "function") {
        var fromActor = String(global.portalChatActorIdentity.displayName(prof) || "").trim();
        if (fromActor) return fromActor;
      }
    }
    if (prof) {
      var raw = String(prof.full_name || prof.username || "").trim();
      if (raw) {
        var nameParts = raw.split(/\s+/).filter(Boolean);
        if (nameParts.length) return nameParts[0];
      }
    }
    var labelParts = label.split(/\s+/).filter(Boolean);
    return labelParts[0] || label;
  }

  function syncAvatarEl(avatarEl, label, ui) {
    if (!avatarEl) return;
    ui = ui || {};
    label = String(label || "").trim() || "Conversation";
    var prof = ui.peerProf || null;
    var username = prof && prof.username ? String(prof.username).trim() : "";
    var headerClass = "portal-cs-cliq-thread-header__avatar";
    function applyMarkup(markupHtml) {
      var tmp = document.createElement("div");
      tmp.innerHTML = markupHtml;
      var inner = tmp.firstElementChild;
      if (inner) {
        avatarEl.className = headerClass + " " + String(inner.className || "").trim();
        avatarEl.innerHTML = inner.innerHTML;
        return true;
      }
      return false;
    }
    var item = {
      kind: ui.groupId ? "group" : "dm",
      label: label,
      peerProfile: prof,
      username: username,
      isTeamChat: !!ui.isTeamChat,
    };
    if (global.portalDmThreadAvatar && typeof global.portalDmThreadAvatar.innerHtml === "function") {
      if (
        applyMarkup(
          global.portalDmThreadAvatar.innerHtml(item, esc, ui.groupId ? "ceo_exec" : "staff_lead")
        )
      ) {
        return;
      }
    }
    if (global.portalStaffAvatarInnerHtml) {
      var photoKey = username || String(label).trim().split(/\s+/)[0] || label;
      if (
        applyMarkup(
          global.portalStaffAvatarInnerHtml(photoKey, {
            esc: esc,
            displayName: label,
            username: username,
            className: headerClass + " portal-dm-thread-avatar portal-dm-thread-avatar--staff",
            imgClass: "portal-dm-thread-avatar__img",
          })
        )
      ) {
        return;
      }
    }
    avatarEl.className = headerClass;
    avatarEl.textContent = initials(label);
  }

  function sync(ui) {
    ui = ui || global.__PORTAL_ADMIN_DM_UI || {};
    var header = document.getElementById("csCliqThreadHeader");
    if (!header) return;
    var inThread = String(ui.panel || "") === "thread";
    header.classList.toggle("is-open", inThread);
    header.setAttribute("aria-hidden", inThread ? "false" : "true");
    if (!inThread) return;
    var label = headerDisplayName(String(ui.peerLabel || "").trim() || "Conversation", ui);
    var nameEl = document.getElementById("csCliqThreadName");
    var roleEl = document.getElementById("csCliqThreadRole");
    var statusEl = document.getElementById("csCliqThreadStatus");
    var avatarEl = document.getElementById("csCliqThreadAvatar");
    if (nameEl) nameEl.textContent = label;
    syncAvatarEl(avatarEl, label, ui);
    if (roleEl) {
      if (ui.groupId && global.portalCsCliqGroupMembers && global.portalCsCliqGroupMembers.slugShowsMembers(ui.groupSlug)) {
        roleEl.textContent = "Members";
      } else if (ui.groupId) {
        roleEl.textContent = "Group";
      } else {
        var roleTxt = String(ui.peerRole || "").trim();
        if (!roleTxt) {
          var prof = ui.peerProf || null;
          var ar = prof ? String(prof.app_role || "").toLowerCase() : "";
          if (ar === "admin") roleTxt = "Admin";
          else if (ar === "ceo") roleTxt = "CEO";
          else if (ar === "lead") roleTxt = "Lead";
          else if (ar === "staff") roleTxt = "Staff";
        }
        roleEl.textContent = roleTxt || "Staff";
      }
    }
    if (statusEl) {
      var hideStatus =
        document.body.classList.contains("admin-view-cs-cliq") ||
        (global.portalCsCliqHubRoles &&
          typeof global.portalCsCliqHubRoles.getTier === "function" &&
          global.portalCsCliqHubRoles.getTier() === "management");
      if (hideStatus) {
        statusEl.hidden = true;
        statusEl.setAttribute("aria-hidden", "true");
      } else {
        statusEl.hidden = false;
        statusEl.setAttribute("aria-hidden", "false");
        try {
          var away = String(global.localStorage.getItem("portal_cs_cliq_workspace_status") || "at_work") === "away";
          statusEl.textContent = away ? "Away" : "Available";
        } catch (_s) {
          statusEl.textContent = "Available";
        }
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
    var filesBtnAdmin = document.getElementById("csCliqThreadFilesBtn");
    if (filesBtnAdmin) {
      filesBtnAdmin.hidden = true;
      filesBtnAdmin.setAttribute("aria-hidden", "true");
    }
    if (global.portalCsCliqGroupMembers && typeof global.portalCsCliqGroupMembers.syncGroupMemberChips === "function") {
      void global.portalCsCliqGroupMembers.syncGroupMemberChips(ui);
    }
  }

  function syncBackUnread(count) {
    var el = document.getElementById("internalChatThreadBackUnread");
    if (!el) return;
    var n = Math.max(0, parseInt(count, 10) || 0);
    if (n > 0) {
      el.textContent = n > 99 ? "99+" : String(n);
      el.hidden = false;
      el.setAttribute("aria-hidden", "false");
      el.setAttribute(
        "aria-label",
        n === 1 ? "1 unread message in other chats" : n + " unread messages in other chats"
      );
    } else {
      el.textContent = "";
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeAttribute("aria-label");
    }
  }

  function syncInternal(peerLabel, peerRole, peerProf) {
    var header = document.getElementById("internalChatThreadHeader");
    if (!header) return;
    var ui = { peerProf: peerProf || null };
    var label = headerDisplayName(String(peerLabel || "").trim() || "Conversation", ui);
    var nameEl = document.getElementById("internalChatThreadName");
    var roleEl = document.getElementById("internalChatThreadRole");
    var statusEl = document.getElementById("internalChatThreadStatus");
    var avatarEl = document.getElementById("internalChatThreadAvatar");
    if (nameEl) nameEl.textContent = label;
    syncAvatarEl(avatarEl, label, ui);
    var role = String(peerRole || "").trim() || "Staff";
    if (roleEl) roleEl.textContent = role;
    if (statusEl) {
      try {
        var away = String(global.localStorage.getItem("portal_cs_cliq_workspace_status") || "at_work") === "away";
        statusEl.textContent = away ? "Away" : "Available";
      } catch (_s) {
        statusEl.textContent = "Available";
      }
    }
    var restricted =
      global.portalInternalChatOfficeRestricted &&
      typeof global.portalInternalChatOfficeRestricted === "function" &&
      global.portalInternalChatOfficeRestricted();
    var callBar = document.getElementById("internalChatCallBar");
    if (callBar) {
      callBar.hidden = false;
      callBar.setAttribute("aria-hidden", "false");
    }
    var filesBtn = document.getElementById("internalChatThreadFilesBtn");
    if (filesBtn) {
      filesBtn.hidden = true;
      filesBtn.setAttribute("aria-hidden", "true");
    }
    header.classList.add("is-open");
    header.classList.add("portal-cs-cliq-thread-header--chat");
    header.removeAttribute("hidden");
    header.setAttribute("aria-hidden", "false");
    if (global.portalCsCliqThreadFiles && typeof global.portalCsCliqThreadFiles.onThreadChange === "function") {
      global.portalCsCliqThreadFiles.onThreadChange();
    }
  }

  global.portalCsCliqThreadHeader = {
    sync: sync,
    syncInternal: syncInternal,
    syncBackUnread: syncBackUnread,
    initials: initials,
    headerDisplayName: headerDisplayName,
    esc: esc,
  };
})(typeof window !== "undefined" ? window : globalThis);
