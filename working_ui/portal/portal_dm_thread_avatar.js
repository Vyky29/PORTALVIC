/**
 * Premium initials avatars for CS Cliq and DM thread lists.
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

  function toneFromItem(item, ch) {
    if (!item) return "default";
    if (item.kind === "group") return "group";
    if (item.isTeamChat) return "team";
    if (ch === "ceo_exec") return "exec";
    var rt = String(item.roleTone || "").toLowerCase();
    if (rt === "lead") return "lead";
    if (rt === "staff") return "staff";
    return "default";
  }

  function html(item, escFn, ch) {
    escFn =
      escFn ||
      function (s) {
        return String(s == null ? "" : s);
      };
    var label = item && item.label ? item.label : "";
    var ini = initials(label);
    var tone = toneFromItem(item, ch);
    var unread = Math.max(0, Number(item && item.unreadCount) || 0);
    var ring = unread > 0 ? " portal-dm-thread-avatar-wrap--unread" : "";
    return (
      '<span class="portal-dm-thread-avatar-wrap' +
      ring +
      '" aria-hidden="true">' +
      '<span class="portal-dm-thread-avatar portal-dm-thread-avatar--' +
      escFn(tone) +
      '">' +
      escFn(ini) +
      "</span></span>"
    );
  }

  global.portalDmThreadAvatar = {
    initials: initials,
    toneFromItem: toneFromItem,
    html: html,
  };
})(typeof window !== "undefined" ? window : globalThis);
