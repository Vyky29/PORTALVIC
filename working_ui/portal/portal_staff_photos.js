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
    javiarranzescorial: "javi",
    javiarranz: "javi",
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

  /** Role/category labels — not roster photo stems (avoids /staff_photos/leads.jpg 404 spam). */
  var NO_STATIC_PHOTO = {
    leads: true,
    lead: true,
    staff: true,
    admin: true,
    ceo: true,
    ceos: true,
    directors: true,
    director: true,
    group: true,
    team: true,
    ops: true,
    inbox: true,
    directory: true,
    staffmgmt: true,
    ceoexec: true,
    csteam: true,
    conversation: true,
    session: true,
    weekly: true,
    handover: true,
    meeting: true,
    meetings: true,
    schedule: true,
    video: true,
    voice: true,
  };

  function looksLikeOpaquePhotoKey(k) {
    k = String(k || "").trim().toLowerCase();
    if (!k) return true;
    if (/^[0-9a-f-]{32,36}$/.test(k)) return true;
    if (/^[0-9a-f]{8,}$/.test(k)) return true;
    return false;
  }

  function portalStaffPhotoKeyAllowed(nameOrKey, opts) {
    var keys = photoLookupKeys(nameOrKey, opts);
    if (!keys.length) return false;
    return keys.some(function (k) {
      return k && !NO_STATIC_PHOTO[k] && !looksLikeOpaquePhotoKey(k);
    });
  }

  function resolveStaffPhotoCandidates(nameOrKey, opts) {
    opts = opts || {};
    var urls = [];
    var keys = photoLookupKeys(nameOrKey, opts);
    var base = staffPhotosBase();
    if (base.charAt(base.length - 1) !== "/") base += "/";

    keys.forEach(function (key) {
      if (NO_STATIC_PHOTO[key] || looksLikeOpaquePhotoKey(key)) return;
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

  /** Drop stale Supabase avatar paths and broken storage keys (spaces → 400). */
  function portalSanitizeRemoteAvatarUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (u.indexOf("/portal/staff_photos/") >= 0) return "";
    if (/storage\/v1\/object\/public\/avatars\//i.test(u)) return "";
    if (/^avatars\//i.test(u) && (/%20|\s/.test(u) || /adam[\s%20]+ab/i.test(u))) return "";
    return u;
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

  function portalNetworkIsOffline() {
    try {
      return typeof navigator !== "undefined" && navigator.onLine === false;
    } catch (_) {
      return false;
    }
  }

  function portalWarnUnlessOffline(label, status, err) {
    if (portalNetworkIsOffline()) return;
    try {
      if (!global.__PORTAL_WARN_LOG__) global.__PORTAL_WARN_LOG__ = Object.create(null);
      var key = String(label || "warn").trim();
      var now = Date.now();
      var prev = Number(global.__PORTAL_WARN_LOG__[key]) || 0;
      if (now - prev < 60000) {
        console.debug(label, status, err || "");
        return;
      }
      global.__PORTAL_WARN_LOG__[key] = now;
    } catch (_) {}
    console.warn(label, status, err || "");
  }

  /** Avoid F12 spam when Realtime reconnects in a loop (warn once per label / minute). */
  function portalRealtimeLogChannelIssue(label, status, err) {
    if (portalNetworkIsOffline()) return;
    try {
      if (!global.__PORTAL_RT_ERR_LOG__) global.__PORTAL_RT_ERR_LOG__ = Object.create(null);
      const key = String(label || "realtime").trim();
      const now = Date.now();
      const prev = Number(global.__PORTAL_RT_ERR_LOG__[key]) || 0;
      if (now - prev < 60000) {
        console.debug(label, status, err || "");
        return;
      }
      global.__PORTAL_RT_ERR_LOG__[key] = now;
    } catch (_) {}
    try {
      console.debug(label, status, err || "");
    } catch (_) {}
  }

  function portalRealtimeMarkSubscribed(label) {
    try {
      const key = String(label || "").trim();
      if (key && global.__PORTAL_RT_ERR_LOG__) delete global.__PORTAL_RT_ERR_LOG__[key];
    } catch (_) {}
  }

  /** Drop a stale Supabase Realtime channel so init can run again. */
  function portalRealtimePrepareInit(chKey, readyKey) {
    try {
      if (global[chKey] && global[readyKey]) return false;
      if (global[chKey] && !global[readyKey]) {
        try {
          var stale = global[chKey];
          if (stale && typeof stale.unsubscribe === "function") stale.unsubscribe();
        } catch (_) {}
        global[chKey] = null;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function portalRealtimeOnChannelError(chKey, readyKey, initFn, label, status, err) {
    try {
      global[readyKey] = false;
      var ch = global[chKey];
      if (ch && typeof ch.unsubscribe === "function") ch.unsubscribe();
    } catch (_) {}
    global[chKey] = null;
    portalRealtimeLogChannelIssue(label, status, err);
    if (portalNetworkIsOffline() || typeof initFn !== "function") return;
    try {
      if (!global.__PORTAL_RT_RETRY__) global.__PORTAL_RT_RETRY__ = Object.create(null);
      var rk = String(label || chKey || "rt").trim();
      var n = Number(global.__PORTAL_RT_RETRY__[rk]) || 0;
      if (n >= 2) return;
      global.__PORTAL_RT_RETRY__[rk] = n + 1;
    } catch (_) {}
    setTimeout(initFn, 2500);
  }

  function bindPortalRealtimeOnlineReconnect() {
    if (bindPortalRealtimeOnlineReconnect._bound) return;
    bindPortalRealtimeOnlineReconnect._bound = true;
    try {
      global.addEventListener("online", function () {
        [
          global.portalInitScheduleOverrideRealtimeForStaff,
          global.portalInitStaffAnnouncementsRealtime,
          global.portalInitStaffDmRealtime,
        ].forEach(function (fn) {
          if (typeof fn === "function") {
            try {
              fn();
            } catch (_) {}
          }
        });
      });
    } catch (_) {}
  }
  bindPortalRealtimeOnlineReconnect();

  global.portalSanitizeRemoteAvatarUrl = portalSanitizeRemoteAvatarUrl;
  global.portalStaffPhotoUrl = portalStaffPhotoUrl;
  global.portalStaffInitials = portalStaffInitials;
  global.portalStaffAvatarInnerHtml = portalStaffAvatarInnerHtml;
  global.portalStaffPhotoImgError = portalStaffPhotoImgError;
  global.portalResolveStaffPhotoCandidates = resolveStaffPhotoCandidates;
  global.portalStaffPhotoLookupKeys = photoLookupKeys;
  global.portalStaffPhotoKeyAllowed = portalStaffPhotoKeyAllowed;
  global.portalNetworkIsOffline = portalNetworkIsOffline;
  global.portalWarnUnlessOffline = portalWarnUnlessOffline;
  global.portalRealtimeLogChannelIssue = portalRealtimeLogChannelIssue;
  global.portalRealtimeMarkSubscribed = portalRealtimeMarkSubscribed;
  global.portalRealtimePrepareInit = portalRealtimePrepareInit;
  global.portalRealtimeOnChannelError = portalRealtimeOnChannelError;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
