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
    anas: "portal/participants/anas.png",
    "anas ismail": "portal/participants/anas.png",
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
    cyrus: "portal/participants/cyrus.png",
    erik: "portal/participants/erik.png",
    gabriel: "portal/participants/gabriel.png",
    yoan: "portal/participants/yoan.png",
  };

  /** Files actually shipped under working_ui/portal/participants/ — avoids 404 + empty avatars. */
  var PARTICIPANT_PHOTO_FILES_ON_DISK = {
    "/portal/participants/adaam-ah.png": true,
    "/portal/participants/amaar-ah.png": true,
    "/portal/participants/ayden-w.png": true,
    "/portal/participants/adam-ab.png": true,
    "/portal/participants/gabriel.png": true,
    "/portal/participants/anas.png": true,
    "/portal/participants/aydaan-ah.png": true,
    "/portal/participants/cyrus.png": true,
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
    var qi = u.indexOf("?");
    var path = qi >= 0 ? u.slice(0, qi) : u;
    var query = qi >= 0 ? u.slice(qi) : "";
    path = path
      .split("/")
      .map(function (seg) {
        if (!seg || seg.indexOf("%") >= 0) return seg;
        return encodeURIComponent(seg);
      })
      .join("/");
    return path + query;
  }

  function normGenderValue(v) {
    v = String(v || "").trim().toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  /** 'm', 'f', or '' — uses clients_gender_embed.js when loaded. */
  function portalParticipantGender(name) {
    try {
      var map = global.PORTAL_CLIENT_GENDER_OVERRIDES || {};
      var nameLower = photoKey(name);
      var firstName = nameLower.split(/\s+/)[0] || "";
      return (
        normGenderValue(map[nameLower]) ||
        normGenderValue(map[firstName]) ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function portalParticipantGenderClass(name, prefix) {
    prefix = String(prefix || "portal-roster-avatar--").trim();
    var g = portalParticipantGender(name);
    if (g === "m") return " " + prefix + "m";
    if (g === "f") return " " + prefix + "f";
    return "";
  }

  /** File names use hyphens (adam-ab.png), not spaces — see participantPhotoPathCandidates. */
  function participantPhotoPathOnDisk(relative) {
    var p = normalizePhotoUrl(String(relative || "").trim());
    return p && PARTICIPANT_PHOTO_FILES_ON_DISK[p] ? p : "";
  }

  function participantPhotoPathCandidates(name, avatarOverride) {
    var key = photoKey(name);
    var out = [];
    function add(raw) {
      var p = normalizePhotoUrl(String(raw || "").trim());
      if (p && out.indexOf(p) === -1) out.push(p);
    }
    function addIfOnDisk(raw) {
      var p = participantPhotoPathOnDisk(raw);
      if (p) add(p);
    }
    if (
      avatarOverride &&
      typeof global.portalSanitizeRemoteAvatarUrl === "function" &&
      !global.portalSanitizeRemoteAvatarUrl(avatarOverride)
    ) {
      avatarOverride = "";
    }
    addIfOnDisk(avatarOverride);
    var mapped = Object.prototype.hasOwnProperty.call(PARTICIPANT_PHOTOS, key)
      ? PARTICIPANT_PHOTOS[key]
      : "";
    if (mapped) {
      addIfOnDisk(mapped);
    }
    if (key) {
      var hyphenSlug = key.replace(/\s+/g, "-");
      addIfOnDisk("portal/participants/" + hyphenSlug + ".png");
      addIfOnDisk("portal/participants/" + hyphenSlug + ".jpg");
      if (key.indexOf(" ") >= 0) {
        addIfOnDisk("portal/participants/" + key.replace(/\s+/g, "-") + ".png");
        addIfOnDisk("portal/participants/" + key.replace(/\s+/g, "-") + ".jpg");
      }
      if (!mapped) {
        var parts = key.split(/\s+/).filter(Boolean);
        if (parts.length > 1 && Object.prototype.hasOwnProperty.call(PARTICIPANT_PHOTOS, parts[0])) {
          addIfOnDisk(PARTICIPANT_PHOTOS[parts[0]]);
        }
      }
    }
    return out;
  }

  function portalParticipantPhotoUrl(name, avatarOverride) {
    var candidates = participantPhotoPathCandidates(name, avatarOverride);
    return candidates.length ? candidates[0] : "";
  }

  function portalParticipantPhotoTryFallback(img) {
    if (!img) return;
    var rest = String(img.getAttribute("data-photo-fallbacks") || "")
      .split("|")
      .map(function (p) {
        return normalizePhotoUrl(p);
      })
      .filter(Boolean);
    if (!rest.length) {
      if (typeof global.portalParticipantCalendarAvatarFallback === "function") {
        global.portalParticipantCalendarAvatarFallback(img);
      } else if (typeof global.portalClientPhotoSlotFallback === "function") {
        global.portalClientPhotoSlotFallback(img);
      }
      return;
    }
    img.setAttribute("data-photo-fallbacks", rest.slice(1).join("|"));
    img.src = rest[0];
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

  function photoLoadAttr() {
    if (typeof global.portalParticipantPhotoLoadingAttr === "function") {
      return global.portalParticipantPhotoLoadingAttr();
    }
    return ' loading="eager" fetchpriority="low"';
  }

  /**
   * Avatar inner HTML: initials + optional photo overlay (matches clients-grid pattern).
   * @param {string} name
   * @param {string} [clientId]
   * @param {{ esc?: function, avatarFile?: string, className?: string, imgClass?: string, gender?: string }} [opts]
   */
  function portalParticipantAvatarInnerHtml(name, clientId, opts) {
    opts = opts || {};
    var esc = typeof opts.esc === "function" ? opts.esc : defaultEsc;
    var candidates = participantPhotoPathCandidates(name, opts.avatarFile);
    var url = candidates.length ? candidates[0] : "";
    var photoFallbacks = candidates.slice(1).join("|");
    var initials = esc(portalParticipantInitials(name));
    var wrapClass = String(opts.className || "portal-roster-avatar").trim() || "portal-roster-avatar";
    var isStaff = wrapClass.indexOf("portal-roster-avatar--staff") >= 0;
    if (!url && !isStaff) {
      var gOpt = normGenderValue(opts.gender);
      if (gOpt === "m") wrapClass += " portal-roster-avatar--m";
      else if (gOpt === "f") wrapClass += " portal-roster-avatar--f";
      else wrapClass += portalParticipantGenderClass(name, "portal-roster-avatar--");
    }
    if (!url) {
      return '<span class="' + esc(wrapClass) + '" aria-hidden="true">' + initials + "</span>";
    }
    var loadAttr = photoLoadAttr();
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
      ' decoding="async" draggable="false"' +
      (photoFallbacks ? ' data-photo-fallbacks="' + esc(photoFallbacks) + '"' : "") +
      ' onerror="if(window.portalParticipantPhotoTryFallback){window.portalParticipantPhotoTryFallback(this);}else{this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-roster-avatar--has-photo\');}" />' +
      "</span>"
    );
  }

  /** Term / tomorrow list avatar — photo or gender-coloured initials circle. */
  function portalParticipantCalendarAvatarHtml(name, photoUrl, esc) {
    esc = typeof esc === "function" ? esc : defaultEsc;
    name = String(name || "").trim();
    var candidates = participantPhotoPathCandidates(name, photoUrl);
    photoUrl = candidates.length ? candidates[0] : "";
    var photoFallbacks = candidates.slice(1).join("|");
    var nameAttr = ' data-participant-name="' + esc(name) + '"';
    if (photoUrl) {
      var loadAttr = photoLoadAttr();
      return (
        '<div class="calendar-day-avatar calendar-day-avatar--photo"' +
        nameAttr +
        ">" +
        '<img class="portal-screenshot-protected" src="' +
        esc(photoUrl) +
        '" alt=""' +
        loadAttr +
        ' decoding="async" draggable="false"' +
        (photoFallbacks ? ' data-photo-fallbacks="' + esc(photoFallbacks) + '"' : "") +
        ' onerror="if(window.portalParticipantPhotoTryFallback){window.portalParticipantPhotoTryFallback(this);}else if(window.portalParticipantCalendarAvatarFallback){window.portalParticipantCalendarAvatarFallback(this);}" />' +
        "</div>"
      );
    }
    var cls = "calendar-day-avatar calendar-day-avatar--initials" + portalParticipantGenderClass(name, "calendar-day-avatar--");
    return '<div class="' + esc(cls.trim()) + '"' + nameAttr + ">" + esc(portalParticipantInitials(name)) + "</div>";
  }

  global.portalParticipantCalendarAvatarFallback = function (img) {
    try {
      var wrap = img && img.closest && img.closest(".calendar-day-avatar");
      if (!wrap) return;
      var name = String(wrap.getAttribute("data-participant-name") || "").trim();
      wrap.outerHTML = portalParticipantCalendarAvatarHtml(name, "", defaultEsc);
    } catch (_) {}
  };

  global.PARTICIPANT_PHOTOS = PARTICIPANT_PHOTOS;
  global.PARTICIPANT_PHOTO_FILES_ON_DISK = PARTICIPANT_PHOTO_FILES_ON_DISK;
  global.portalParticipantPhotoUrl = portalParticipantPhotoUrl;
  global.portalParticipantPhotoPathCandidates = participantPhotoPathCandidates;
  global.portalParticipantPhotoTryFallback = portalParticipantPhotoTryFallback;
  global.portalParticipantGender = portalParticipantGender;
  global.portalParticipantGenderClass = portalParticipantGenderClass;
  global.portalParticipantInitials = portalParticipantInitials;
  global.portalParticipantAvatarInnerHtml = portalParticipantAvatarInnerHtml;
  global.portalParticipantCalendarAvatarHtml = portalParticipantCalendarAvatarHtml;
  global.portalNormalizeParticipantPhotoUrl = normalizePhotoUrl;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
