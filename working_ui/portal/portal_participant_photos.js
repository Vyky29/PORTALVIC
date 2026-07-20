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
    haneef: "portal/participants/haneef.png",
    haneff: "portal/participants/haneef.png",
    "amaar ah": "portal/participants/amaar-ah.png",
    "aydaan ah": "portal/participants/aydaan-ah.png",
    "aydan ah": "portal/participants/aydaan-ah.png",
    "ayden w": "portal/participants/ayden-w.png",
    "ayden walker": "portal/participants/ayden-w.png",
    "adaam ah": "portal/participants/adaam-ah.png",
    "aadam ah": "portal/participants/adaam-ah.png",
    "aadam ahmed": "portal/participants/adaam-ah.png",
    "amaar ahmed": "portal/participants/amaar-ah.png",
    "aydaan ahmed": "portal/participants/aydaan-ah.png",
    amir: "portal/participants/amir.png",
    anas: "portal/participants/anas.png",
    "anas ismail": "portal/participants/anas.png",
    serine: "portal/participants/serine.png",
    fadi: "portal/participants/fadi.png",
    scott: "portal/participants/scott.png",
    stephanie: "portal/participants/stephanie.png",
    timi: "portal/participants/timi.png?v=20260628-timi-smile",
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
    emanuel: "portal/participants/emanuel.png?v=20260628-emanuel-smile",
    hazem: "portal/participants/hazem.png",
    samer: "portal/participants/samer.png",
    kate: "portal/participants/kate.png",
    kamy: "portal/participants/kamy.png",
    cyrus: "portal/participants/cyrus.png",
    erik: "portal/participants/erik.png",
    gabriel: "portal/participants/gabriel.png",
    yoan: "portal/participants/yoan.png",
    zakariya: "portal/participants/zakariya.png",
    "zakariya warsame": "portal/participants/zakariya.png",
  };

  /** Files actually shipped under working_ui/portal/participants/ — avoids 404 on slug guesses. */
  var PARTICIPANT_PHOTO_FILES_ON_DISK = {
    "/portal/participants/adaam-ah.png": true,
    "/portal/participants/adam-ab.png": true,
    "/portal/participants/amaar-ah.png": true,
    "/portal/participants/amir.png": true,
    "/portal/participants/anas.png": true,
    "/portal/participants/arthur-manners.png": true,
    "/portal/participants/arthur-mo.png": true,
    "/portal/participants/ayaan.png": true,
    "/portal/participants/aydaan-ah.png": true,
    "/portal/participants/ayden-w.png": true,
    "/portal/participants/cyrus.png": true,
    "/portal/participants/eiji.png": true,
    "/portal/participants/emanuel.png": true,
    "/portal/participants/erik.png": true,
    "/portal/participants/fadi.png": true,
    "/portal/participants/faris.png": true,
    "/portal/participants/gabriel.png": true,
    "/portal/participants/haneef.png": true,
    "/portal/participants/hazem.png": true,
    "/portal/participants/ikram.png": true,
    "/portal/participants/jack-s.png": true,
    "/portal/participants/jack-w.jpg": true,
    "/portal/participants/kamy.png": true,
    "/portal/participants/kate.png": true,
    "/portal/participants/rayaan-fi.png": true,
    "/portal/participants/rodin.png": true,
    "/portal/participants/samer.png": true,
    "/portal/participants/scott.png": true,
    "/portal/participants/serine.png": true,
    "/portal/participants/stephanie.png": true,
    "/portal/participants/timi.png": true,
    "/portal/participants/tinashe.png": true,
    "/portal/participants/yassir.png": true,
    "/portal/participants/yusef-ah.png": true,
    "/portal/participants/zaid.png": true,
    "/portal/participants/zakariya.png": true,
  };

  /** Supabase Storage / remote URLs keyed by contact_id and normalized display name. */
  var PARTICIPANT_STORAGE_AVATARS = { byId: {}, byName: {} };

  function storageAvatarKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function portalRegisterParticipantStorageAvatar(contactId, displayName, url) {
    url = normalizePhotoUrl(String(url || "").trim());
    if (!url || !/^https?:\/\//i.test(url)) return;
    var id = String(contactId || "").trim();
    if (id) PARTICIPANT_STORAGE_AVATARS.byId[id] = url;
    var nk = storageAvatarKey(displayName);
    if (nk) PARTICIPANT_STORAGE_AVATARS.byName[nk] = url;
  }

  function portalParticipantStorageAvatarUrl(contactId, displayName) {
    var id = String(contactId || "").trim();
    if (id && PARTICIPANT_STORAGE_AVATARS.byId[id]) return PARTICIPANT_STORAGE_AVATARS.byId[id];
    var nk = storageAvatarKey(displayName);
    if (nk && PARTICIPANT_STORAGE_AVATARS.byName[nk]) return PARTICIPANT_STORAGE_AVATARS.byName[nk];
    return "";
  }

  function photoKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  /** Lookup keys for roster PNGs — full name, cleaned tokens, first name (Eiji/Hazem style). */
  function rosterPhotoLookupKeys(name) {
    var key = photoKey(name);
    var keys = [];
    function add(k) {
      k = String(k || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!k) return;
      if (keys.indexOf(k) === -1) keys.push(k);
      var compact = k.replace(/\s+/g, " ");
      if (compact && keys.indexOf(compact) === -1) keys.push(compact);
      var slug = k.replace(/\s+/g, "_");
      if (slug && keys.indexOf(slug) === -1) keys.push(slug);
      var hyphen = k.replace(/\s+/g, "-");
      if (hyphen && keys.indexOf(hyphen) === -1) keys.push(hyphen);
    }
    add(key);
    var cleaned = key.replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
    add(cleaned);
    var parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length) {
      add(parts[0]);
      if (parts.length > 1) add(parts[0] + " " + parts[1].slice(0, 2));
      if (/^eiji/.test(parts[0])) add("eiji");
      if (/^hazem/.test(parts[0])) add("hazem");
      if (/^elia/.test(parts[0])) add("elia");
      if (/^fadi/.test(parts[0])) add("fadi");
    }
    return keys;
  }

  function mappedRosterPhotoRelative(name) {
    var keys = rosterPhotoLookupKeys(name);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Object.prototype.hasOwnProperty.call(PARTICIPANT_PHOTOS, k)) {
        return PARTICIPANT_PHOTOS[k];
      }
    }
    return "";
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
    var qi = p.indexOf("?");
    var path = qi >= 0 ? p.slice(0, qi) : p;
    return p && PARTICIPANT_PHOTO_FILES_ON_DISK[path] ? p : "";
  }

  function participantPhotoPathCandidates(name, avatarOverride, contactId) {
    var key = photoKey(name);
    var out = [];
    function add(raw) {
      var p = normalizePhotoUrl(String(raw || "").trim());
      if (p && out.indexOf(p) === -1) out.push(p);
    }
    function addRemote(raw) {
      var u = normalizePhotoUrl(String(raw || "").trim());
      if (/^https?:\/\//i.test(u) && out.indexOf(u) === -1) out.unshift(u);
    }
    function addIfOnDisk(raw) {
      var p = participantPhotoPathOnDisk(raw);
      if (p) add(p);
    }
    function addStaticRoster() {
      var mapped = mappedRosterPhotoRelative(name);
      if (mapped) addIfOnDisk(mapped);
      var keys = rosterPhotoLookupKeys(name);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var hyphenSlug = k.replace(/\s+/g, "-").replace(/_/g, "-");
        addIfOnDisk("portal/participants/" + hyphenSlug + ".png");
        addIfOnDisk("portal/participants/" + hyphenSlug + ".jpg");
      }
    }

    /* Always resolve roster PNGs (first-name aware). Parent/storage URL still wins via unshift. */
    addStaticRoster();

    var storageUrl = portalParticipantStorageAvatarUrl(contactId, name);
    if (storageUrl) addRemote(storageUrl);

    if (avatarOverride) {
      var remote = String(avatarOverride || "").trim();
      if (/^https?:\/\//i.test(remote)) {
        if (
          typeof global.portalSanitizeRemoteAvatarUrl !== "function" ||
          global.portalSanitizeRemoteAvatarUrl(remote)
        ) {
          addRemote(remote);
        }
      } else if (
        !(
          typeof global.portalSanitizeRemoteAvatarUrl === "function" &&
          !global.portalSanitizeRemoteAvatarUrl(avatarOverride)
        )
      ) {
        addIfOnDisk(avatarOverride);
      }
    }

    /* Extra hyphen guesses for unmapped names */
    if (key && !mappedRosterPhotoRelative(name)) {
      var hyphenSlug = key.replace(/\s+/g, "-");
      addIfOnDisk("portal/participants/" + hyphenSlug + ".png");
      addIfOnDisk("portal/participants/" + hyphenSlug + ".jpg");
    }
    return out;
  }

  function portalParticipantPhotoUrl(name, avatarOverride, contactId) {
    var candidates = participantPhotoPathCandidates(name, avatarOverride, contactId);
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
      try {
        var wrap =
          img.closest &&
          img.closest(".pp-child-photo, .pp-pax-photo, .pp-team-photo, .client-photo, .portal-roster-avatar");
        if (wrap) {
          img.remove();
          wrap.classList.remove(
            "pp-child-photo--has-img",
            "pp-pax-photo--img",
            "pp-team-photo--img",
          );
          return;
        }
      } catch (_) {}
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
    var candidates = participantPhotoPathCandidates(name, opts.avatarFile, clientId);
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
  function portalParticipantCalendarAvatarHtml(name, photoUrl, esc, clientId) {
    esc = typeof esc === "function" ? esc : defaultEsc;
    name = String(name || "").trim();
    var candidates = participantPhotoPathCandidates(name, photoUrl, clientId);
    photoUrl = candidates.length ? candidates[0] : "";
    var photoFallbacks = candidates.slice(1).join("|");
    var nameAttr = ' data-participant-name="' + esc(name) + '"';
    var cid = String(clientId || "").trim();
    var clientAttr = cid ? ' data-participant-client-id="' + esc(cid) + '"' : "";
    if (photoUrl) {
      var loadAttr = photoLoadAttr();
      return (
        '<div class="calendar-day-avatar calendar-day-avatar--photo"' +
        nameAttr +
        clientAttr +
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
    return '<div class="' + esc(cls.trim()) + '"' + nameAttr + clientAttr + ">" + esc(portalParticipantInitials(name)) + "</div>";
  }

  function resolveDashboardParticipantPhotoUrl(name, clientId, ctx) {
    ctx = ctx || {};
    if (typeof ctx.resolvePhotoUrl === "function") {
      return normalizePhotoUrl(ctx.resolvePhotoUrl(name, clientId)) || "";
    }
    return portalParticipantPhotoUrl(name) || "";
  }

  /** Repair participant photos after roster hydrate or when list re-render was skipped. */
  global.portalRefreshDashboardParticipantPhotos = function portalRefreshDashboardParticipantPhotos(root, ctx) {
    root = root || document;
    ctx = ctx || {};
    var esc = typeof ctx.escapeHtml === "function" ? ctx.escapeHtml : defaultEsc;

    root.querySelectorAll(".calendar-day-avatar[data-participant-name]").forEach(function (wrap) {
      var name = String(wrap.getAttribute("data-participant-name") || "").trim();
      if (!name) return;
      var clientId = String(wrap.getAttribute("data-participant-client-id") || "").trim();
      if (!clientId) {
        var rowBtn = wrap.closest("[data-next-session-client]");
        if (rowBtn) clientId = String(rowBtn.getAttribute("data-next-session-client") || "").trim();
      }
      var url = resolveDashboardParticipantPhotoUrl(name, clientId, ctx);
      var img = wrap.querySelector("img.portal-screenshot-protected");
      if (wrap.classList.contains("calendar-day-avatar--initials")) {
        if (!url) return;
        wrap.outerHTML = portalParticipantCalendarAvatarHtml(name, url, esc, clientId);
        return;
      }
      if (!url) return;
      if (!img) {
        wrap.outerHTML = portalParticipantCalendarAvatarHtml(name, url, esc, clientId);
        return;
      }
      var norm = normalizePhotoUrl(img.getAttribute("src") || img.src || "");
      if (norm !== url) {
        img.setAttribute("src", url);
        return;
      }
      if (img.complete && img.naturalWidth > 0) return;
      if (img.getAttribute("data-photo-fallbacks")) {
        portalParticipantPhotoTryFallback(img);
        return;
      }
      var retry = img.src;
      img.src = "";
      img.src = retry;
    });

    root.querySelectorAll(".clients-grid-card[data-client-id]").forEach(function (card) {
      var clientId = String(card.getAttribute("data-client-id") || "").trim();
      var av = card.querySelector(".clients-grid-avatar");
      if (!av) return;
      var img = av.querySelector("img.clients-grid-avatar-img");
      if (img && img.complete && img.naturalWidth > 0) return;
      var nameEl = card.querySelector(".clients-grid-name");
      var name = nameEl ? String(nameEl.textContent || "").trim() : "";
      var url = resolveDashboardParticipantPhotoUrl(name, clientId, ctx);
      if (!url) return;
      if (!img) {
        var loadAttr = photoLoadAttr();
        av.innerHTML =
          esc(portalParticipantInitials(name)) +
          '<img class="clients-grid-avatar-img portal-screenshot-protected" src="' +
          esc(url) +
          '" alt=""' +
          loadAttr +
          ' decoding="async" draggable="false" onerror="this.remove()">';
        return;
      }
      if (normalizePhotoUrl(img.getAttribute("src") || img.src || "") !== url) {
        img.setAttribute("src", url);
      } else if (!img.complete || !img.naturalWidth) {
        var retrySrc = img.src;
        img.src = "";
        img.src = retrySrc;
      }
    });
  };

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
  global.PARTICIPANT_STORAGE_AVATARS = PARTICIPANT_STORAGE_AVATARS;
  global.portalRegisterParticipantStorageAvatar = portalRegisterParticipantStorageAvatar;
  global.portalParticipantStorageAvatarUrl = portalParticipantStorageAvatarUrl;
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
