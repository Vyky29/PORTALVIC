/**
 * Participant roster PNG lookup (static files under portal/participants/).
 * Shared by staff/lead dashboards, achievements pickers, and admin HR views.
 */
(function (global) {
  "use strict";

  var PARTICIPANT_PHOTOS = {
    "jack w": "portal/participants/jack-w.jpg",
    "jack walker": "portal/participants/jack-w.jpg",
    "jack s": "portal/participants/jack-s.png",
    "arthur ma": "portal/participants/arthur-manners.png",
    "arthur mo": "portal/participants/arthur-mo.png",
    "arthur manners": "portal/participants/arthur-manners.png",
    ayaan: "portal/participants/ayaan.png",
    "adam ab": "portal/participants/adam-ab.png",
    "adam a": "portal/participants/adam-ab.png",
    haneef: "portal/participants/haneef.png",
    haneff: "portal/participants/haneef.png",
    "amaar ah": "portal/participants/amaar-ah.png",
    "aydaan ah": "portal/participants/aydaan-ah.png",
    "aydan ah": "portal/participants/aydaan-ah.png",
    "ayden w": "portal/participants/ayden-w.png",
    "ayden walker": "portal/participants/ayden-w.png",
    "adaam ah": "portal/participants/adaam-ah.png",
    "aadam ah": "portal/participants/adaam-ah.png",
    amir: "portal/participants/amir.png",
    serine: "portal/participants/serine.png",
    fadi: "portal/participants/fadi.png",
    scott: "portal/participants/scott.png",
    stephanie: "portal/participants/stephanie.png",
    timi: "portal/participants/timi.png",
    ikram: "portal/participants/ikram.png",
    rodin: "portal/participants/rodin.png",
    zaid: "portal/participants/zaid.png",
    "yusef ah": "portal/participants/yusef-ah.png",
    "yusuf ah": "portal/participants/yusef-ah.png",
    "rayyan fi": "portal/participants/rayaan-fi.png",
    "rayaan fi": "portal/participants/rayaan-fi.png",
    "rayyan f": "portal/participants/rayaan-fi.png",
    "rayaan f": "portal/participants/rayaan-fi.png",
    tinashe: "portal/participants/tinashe.png",
    yassir: "portal/participants/yassir.png",
    faris: "portal/participants/faris.png",
    eiji: "portal/participants/eiji.png",
    hazem: "portal/participants/hazem.png",
    samer: "portal/participants/samer.png",
    kate: "portal/participants/kate.png",
    kamy: "portal/participants/kamy.png",
    cyrus: "portal/participants/cyrus.png?v=20260606-cyrus",
    erik: "portal/participants/erik.png",
    gabriel: "portal/participants/gabriel.png",
    yoan: "portal/participants/yoan.png",
    gemma: "portal/participants/gemma.png?v=20260609-pilot",
    kirushy: "portal/participants/kirushy.png?v=20260609-pilot",
    zayana: "portal/participants/zayana.png?v=20260609-pilot",
    eddie: "portal/participants/eddie.png?v=20260609-pilot",
    joel: "portal/participants/joel.png?v=20260609-pilot",
  };

  /** AI illustration placeholders — replace with real photos when available. */
  var PARTICIPANT_PHOTO_PLACEHOLDERS = {
    gemma: true,
    kirushy: true,
    zayana: true,
    eddie: true,
    joel: true,
  };

  function photoKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function normalizePhotoUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  function portalParticipantPhotoIsPlaceholder(name) {
    var key = photoKey(name);
    return !!PARTICIPANT_PHOTO_PLACEHOLDERS[key];
  }

  function portalParticipantPhotoUrl(name, avatarOverride) {
    var override = String(avatarOverride || "").trim();
    if (override) return override;
    var key = photoKey(name);
    return Object.prototype.hasOwnProperty.call(PARTICIPANT_PHOTOS, key) ? PARTICIPANT_PHOTOS[key] : "";
  }

  function portalParticipantInitials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function defaultEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Avatar inner HTML: initials + optional photo overlay (matches clients-grid pattern).
   * @param {string} name
   * @param {string} [clientId]
   * @param {{ esc?: function, avatarFile?: string, className?: string, imgClass?: string }} [opts]
   */
  function portalParticipantAvatarInnerHtml(name, clientId, opts) {
    opts = opts || {};
    var esc = typeof opts.esc === "function" ? opts.esc : defaultEsc;
    var url = portalParticipantPhotoUrl(name, opts.avatarFile);
    var initials = esc(portalParticipantInitials(name));
    var wrapClass = String(opts.className || "portal-roster-avatar").trim() || "portal-roster-avatar";
    if (portalParticipantPhotoIsPlaceholder(name)) {
      wrapClass += " portal-roster-avatar--placeholder";
    }
    if (!url) {
      return '<span class="' + esc(wrapClass) + '" aria-hidden="true">' + initials + "</span>";
    }
    var loadAttr =
      typeof global.portalParticipantPhotoLoadingAttr === "function"
        ? global.portalParticipantPhotoLoadingAttr()
        : ' loading="eager" fetchpriority="low"';
    var imgClass = String(opts.imgClass || "portal-roster-avatar__img portal-screenshot-protected").trim();
    return (
      '<span class="' +
      esc(wrapClass) +
      ' portal-roster-avatar--has-photo" aria-hidden="true">' +
      initials +
      '<img class="' +
      esc(imgClass) +
      '" src="' +
      esc(url) +
      '" alt=""' +
      loadAttr +
      ' decoding="async" draggable="false" onerror="this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-roster-avatar--has-photo\');" />' +
      "</span>"
    );
  }

  global.PARTICIPANT_PHOTOS = PARTICIPANT_PHOTOS;
  global.PARTICIPANT_PHOTO_PLACEHOLDERS = PARTICIPANT_PHOTO_PLACEHOLDERS;
  global.portalParticipantPhotoUrl = portalParticipantPhotoUrl;
  global.portalParticipantPhotoIsPlaceholder = portalParticipantPhotoIsPlaceholder;
  global.portalParticipantInitials = portalParticipantInitials;
  global.portalParticipantAvatarInnerHtml = portalParticipantAvatarInnerHtml;
  global.portalNormalizeParticipantPhotoUrl = normalizePhotoUrl;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
