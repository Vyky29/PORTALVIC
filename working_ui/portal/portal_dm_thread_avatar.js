/**
 * Premium avatars for CS Cliq and DM thread lists (initials + staff photos).
 */
(function (global) {
  "use strict";

  function initials(label) {
    var parts = String(label || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function normalizeAvatarUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  function toneFromItem(item, ch) {
    if (!item) return "default";
    if (item.kind === "group") return "group";
    if (item.isTeamChat) return "team";
    if (ch === "ceo_exec") return "exec";
    var rt = String(item.roleTone || "").toLowerCase();
    if (rt === "lead") return "lead";
    if (rt === "staff") return "staff";
    if (rt === "exec") return "exec";
    var prof = item.peerProfile || item.profile || null;
    if (prof) {
      var ar = String(prof.app_role || "").toLowerCase();
      if (ar === "lead") return "lead";
      if (ar === "admin" || ar === "ceo") return "exec";
      if (ar) return "staff";
    }
    return "default";
  }

  function roleToneFromProfile(prof) {
    if (!prof) return "default";
    var ar = String(prof.app_role || "").toLowerCase();
    if (ar === "lead") return "lead";
    if (ar === "admin" || ar === "ceo") return "exec";
    if (ar) return "staff";
    return "default";
  }

  function innerAvatarHtml(item, escFn, tone) {
    var label = item && item.label ? item.label : "";
    var username = String((item && item.username) || "").trim();
    var prof = item && (item.peerProfile || item.profile);
    if (!username && prof && prof.username) username = String(prof.username || "").trim();
    var avatarUrl = normalizeAvatarUrl(
      (item && (item.avatarUrl || item.avatar_url)) ||
        (prof && prof.avatar_url)
    );

    if (avatarUrl) {
      return (
        '<span class="portal-dm-thread-avatar portal-dm-thread-avatar--' +
        escFn(tone) +
        ' portal-dm-thread-avatar--photo" aria-hidden="true">' +
        escFn(initials(label)) +
        '<img class="portal-dm-thread-avatar__img" src="' +
        escFn(avatarUrl) +
        '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-dm-thread-avatar--photo\');" />' +
        "</span>"
      );
    }

    if (global.portalStaffAvatarInnerHtml) {
      return global.portalStaffAvatarInnerHtml(username || label, {
        esc: escFn,
        displayName: label,
        className: "portal-dm-thread-avatar portal-dm-thread-avatar--" + tone,
        imgClass: "portal-dm-thread-avatar__img",
      });
    }

    return (
      '<span class="portal-dm-thread-avatar portal-dm-thread-avatar--' +
      escFn(tone) +
      '">' +
      escFn(initials(label)) +
      "</span>"
    );
  }

  function html(item, escFn, ch) {
    escFn =
      escFn ||
      function (s) {
        return String(s == null ? "" : s);
      };
    var label = item && item.label ? item.label : "";
    var tone = toneFromItem(item, ch);
    var unread = Math.max(0, Number(item && item.unreadCount) || 0);
    var ring = unread > 0 ? " portal-dm-thread-avatar-wrap--unread" : "";
    return (
      '<span class="portal-dm-thread-avatar-wrap' +
      ring +
      '" aria-hidden="true">' +
      innerAvatarHtml(item, escFn, tone) +
      "</span>"
    );
  }

  global.portalDmThreadAvatar = {
    initials: initials,
    toneFromItem: toneFromItem,
    roleToneFromProfile: roleToneFromProfile,
    html: html,
  };
})(typeof window !== "undefined" ? window : globalThis);
