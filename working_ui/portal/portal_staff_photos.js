/**
 * Staff roster PNG lookup (static files under portal/staff_photos/).
 * Used by admin HR tables and other staff-directory UIs.
 */
(function (global) {
  "use strict";

  function normalizePhotoUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  function canonicalStaffKey(value) {
    var k = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
    if (!k) return "";
    if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
    if (k === "yousef" || k === "yousseff" || k === "yusef") return "youssef";
    if (k === "stf006") return "john";
    if (k === "stf012") return "berta";
    return k;
  }

  /** Full-name keys that incorrectly concat words → roster file stem. */
  var FULL_NAME_PHOTO_ALIASES = {
    michelleemmacaleb: "michelle",
    johnkyeifram: "john",
    danclarke: "dan",
    angelfalceto: "angel",
    robertoreali: "roberto",
    carlosherrero: "carlos",
    bertatraperocasado: "berta",
    javiermarquez: "javier",
    auroragarcia: "aurora",
    giuseppemorelli: "giuseppe",
    bismarkgyan: "bismark",
    godswayyatofo: "godsway",
    simongriffiths: "simon",
    andresborrego: "andres",
    youssefmoustafa: "youssef",
    aidalulia: "lulia",
  };

  function photoLookupKeys(nameOrKey, opts) {
    opts = opts || {};
    var keys = [];
    function add(v) {
      var k = canonicalStaffKey(v);
      if (!k) return;
      if (FULL_NAME_PHOTO_ALIASES[k] && keys.indexOf(FULL_NAME_PHOTO_ALIASES[k]) < 0) {
        keys.push(FULL_NAME_PHOTO_ALIASES[k]);
      }
      if (keys.indexOf(k) < 0) keys.push(k);
    }
    if (opts.username) add(opts.username);
    var raw = String(nameOrKey || "").trim();
    if (!raw) return keys;
    var parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      add(parts[0]);
      return keys;
    }
    add(raw);
    return keys;
  }

  function staffPhotosBase() {
    try {
      var src = global.STAFF_DASHBOARD_SOURCE || {};
      var base = String(src.staffPhotosBaseUrl || "portal/staff_photos/").trim();
      return normalizePhotoUrl(base || "/portal/staff_photos/");
    } catch (_) {
      return "/portal/staff_photos/";
    }
  }

  function swapPhotoExt(url, ext) {
    var u = String(url || "").trim();
    if (!u) return "";
    return u.replace(/\.(png|jpe?g|webp)$/i, "." + ext);
  }

  function pushCandidate(urls, raw) {
    var u = normalizePhotoUrl(raw);
    if (u && urls.indexOf(u) < 0) urls.push(u);
  }

  /** No static file on disk — use initials only (avoids console 404 spam). */
  var NO_STATIC_PHOTO = {};

  function resolveStaffPhotoCandidates(nameOrKey, opts) {
    opts = opts || {};
    var urls = [];
    var keys = photoLookupKeys(nameOrKey, opts);
    var base = staffPhotosBase();
    if (base.charAt(base.length - 1) !== "/") base += "/";

    keys.forEach(function (key) {
      if (NO_STATIC_PHOTO[key]) return;
      var hadProfileFile = false;
      try {
        var src = global.STAFF_DASHBOARD_SOURCE;
        if (key && src && src.staffProfiles && src.staffProfiles[key]) {
          var af = String(src.staffProfiles[key].avatarFile || "").trim();
          if (af) {
            hadProfileFile = true;
            pushCandidate(urls, swapPhotoExt(af, "png"));
            pushCandidate(urls, af);
          }
        }
      } catch (_) {}
      if (hadProfileFile) return;
      if (!key) return;
      if (key === "lulia") {
        pushCandidate(urls, base + "luliya.png");
      }
      pushCandidate(urls, base + key + ".png");
      pushCandidate(urls, base + key + ".jpg");
    });
    return urls;
  }

  function portalStaffPhotoUrl(nameOrKey, opts) {
    var candidates = resolveStaffPhotoCandidates(nameOrKey, opts);
    return candidates.length ? candidates[0] : "";
  }

  function portalStaffInitials(name) {
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

  function portalStaffPhotoImgError(img) {
    if (!img) return;
    var raw = img.getAttribute("data-portal-photo-candidates") || "[]";
    var list = [];
    try {
      list = JSON.parse(raw);
    } catch (_p) {
      list = [];
    }
    var idx = Number(img.getAttribute("data-portal-photo-idx") || "0") + 1;
    if (!Array.isArray(list) || idx >= list.length) {
      img.remove();
      var p = img.parentElement;
      if (p) p.classList.remove("portal-roster-avatar--has-photo");
      return;
    }
    img.setAttribute("data-portal-photo-idx", String(idx));
    img.src = String(list[idx] || "");
  }

  function portalStaffAvatarInnerHtml(nameOrKey, opts) {
    opts = opts || {};
    var esc = typeof opts.esc === "function" ? opts.esc : defaultEsc;
    var displayName = String(opts.displayName || nameOrKey || "").trim();
    var candidates = resolveStaffPhotoCandidates(nameOrKey, {
      username: opts.username,
    });
    var url = candidates.length ? candidates[0] : "";
    var initials = esc(portalStaffInitials(displayName || nameOrKey));
    var wrapClass = String(opts.className || "portal-roster-avatar portal-roster-avatar--staff").trim();
    if (!url) {
      return '<span class="' + esc(wrapClass) + '" aria-hidden="true">' + initials + "</span>";
    }
    var imgClass = String(opts.imgClass || "portal-roster-avatar__img").trim();
    var candJson = esc(JSON.stringify(candidates));
    return (
      '<span class="' +
      esc(wrapClass) +
      ' portal-roster-avatar--has-photo" aria-hidden="true">' +
      initials +
      '<img class="' +
      esc(imgClass) +
      '" src="' +
      esc(url) +
      '" alt="" loading="lazy" decoding="async" draggable="false" data-portal-photo-idx="0" data-portal-photo-candidates="' +
      candJson +
      '" onerror="if(window.portalStaffPhotoImgError){window.portalStaffPhotoImgError(this);}else{this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-roster-avatar--has-photo\');}" />' +
      "</span>"
    );
  }

  global.portalStaffPhotoUrl = portalStaffPhotoUrl;
  global.portalStaffInitials = portalStaffInitials;
  global.portalStaffAvatarInnerHtml = portalStaffAvatarInnerHtml;
  global.portalStaffPhotoImgError = portalStaffPhotoImgError;
  global.portalResolveStaffPhotoCandidates = resolveStaffPhotoCandidates;
  global.portalStaffPhotoLookupKeys = photoLookupKeys;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
