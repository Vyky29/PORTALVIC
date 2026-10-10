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
    "jack stratton": "portal/participants/jack-s.png",
    "arthur ma": "portal/participants/arthur-manners.png",
    "arthur mo": "portal/participants/arthur-mo.png",
    "arthur manners": "portal/participants/arthur-manners.png",
    ayaan: "portal/participants/ayaan.png",
    "ayaan imam": "portal/participants/ayaan.png",
    "adam ab": "portal/participants/adam-ab.png",
    haneef: "portal/participants/haneef.png",
    haneff: "portal/participants/haneef.png",
    ibrahim: "portal/participants/ibrahim.png",
    "ibrahim amir": "portal/participants/ibrahim.png",
    "ibrahim a": "portal/participants/ibrahim.png",
    "haneef yusuf": "portal/participants/haneef.png",
    "amaar ah": "portal/participants/amaar-ah.png",
    "aydaan ah": "portal/participants/aydaan-ah.png",
    "aydan ah": "portal/participants/aydaan-ah.png",
    "ayden w": "portal/participants/ayden-w.png",
    "ayden walker": "portal/participants/ayden-w.png",
    "ayden wong": "portal/participants/ayden-w.png",
    "adaam ah": "portal/participants/adaam-ah.png",
    "aadam ah": "portal/participants/adaam-ah.png",
    "aadam ahmed": "portal/participants/adaam-ah.png",
    "amaar ahmed": "portal/participants/amaar-ah.png",
    "aydaan ahmed": "portal/participants/aydaan-ah.png",
    amir: "portal/participants/amir.png",
    "amir kais": "portal/participants/amir.png",
    anas: "portal/participants/anas.png",
    "anas ismail": "portal/participants/anas.png",
    serine: "portal/participants/serine.png",
    "serine hodroje": "portal/participants/serine.png",
    fadi: "portal/participants/fadi.png",
    "fadi abu daud": "portal/participants/fadi.png",
    scott: "portal/participants/scott.png",
    "scott de wolff": "portal/participants/scott.png",
    stephanie: "portal/participants/stephanie.png",
    "stephanie ng": "portal/participants/stephanie.png",
    timi: "portal/participants/timi.png?v=20260628-timi-smile",
    "timi dairo": "portal/participants/timi.png?v=20260628-timi-smile",
    ikram: "portal/participants/ikram.png",
    emani: "portal/participants/emani.jpg?v=20261010-emani",
    "ikram omar": "portal/participants/ikram.png",
    rodin: "portal/participants/rodin.png",
    "rodin esmati": "portal/participants/rodin.png",
    zaid: "portal/participants/zaid.png",
    "zaid alfadhl": "portal/participants/zaid.png",
    "yusef ah": "portal/participants/yusef-ah.png",
    "yusuf ah": "portal/participants/yusef-ah.png",
    "yusuf ahmed": "portal/participants/yusef-ah.png",
    "rayyan fi": "portal/participants/rayaan-fi.png",
    "rayaan fi": "portal/participants/rayaan-fi.png",
    "rayyan f": "portal/participants/rayaan-fi.png",
    "rayaan f": "portal/participants/rayaan-fi.png",
    tinashe: "portal/participants/tinashe.png",
    "tinashe nekati": "portal/participants/tinashe.png",
    yassir: "portal/participants/yassir.png",
    "yassir boujettif": "portal/participants/yassir.png",
    faris: "portal/participants/faris.png",
    "faris lobinet": "portal/participants/faris.png",
    eiji: "portal/participants/eiji.png",
    "kacem eiji belhadj": "portal/participants/eiji.png",
    "hazem kei belhadj": "portal/participants/hazem.png",
    emanuel: "portal/participants/emanuel.png?v=20260628-emanuel-smile",
    "emanuel dodson": "portal/participants/emanuel.png?v=20260628-emanuel-smile",
    hazem: "portal/participants/hazem.png",
    samer: "portal/participants/samer.png",
    "samer bakhiet": "portal/participants/samer.png",
    kate: "portal/participants/kate.png",
    "kate fordham": "portal/participants/kate.png",
    kamy: "portal/participants/kamy.png",
    "kamy akhavan": "portal/participants/kamy.png",
    cyrus: "portal/participants/cyrus.png",
    "cyrus mahdavi": "portal/participants/cyrus.png",
    erik: "portal/participants/erik.png",
    "erik ndregjoni": "portal/participants/erik.png",
    gabriel: "portal/participants/gabriel.png",
    "gabriel chapplow": "portal/participants/gabriel.png",
    yoan: "portal/participants/yoan.png",
    "yoan bekele": "portal/participants/yoan.png",
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
    "/portal/participants/emani.jpg": true,
    "/portal/participants/emanuel.png": true,
    "/portal/participants/erik.png": true,
    "/portal/participants/fadi.png": true,
    "/portal/participants/faris.png": true,
    "/portal/participants/gabriel.png": true,
    "/portal/participants/haneef.png": true,
    "/portal/participants/ibrahim.png": true,
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

  /** Admin pan/zoom for a parent upload. x/y are percent shift from centre. zoom 1 = whole photo. */
  var PARTICIPANT_PHOTO_FRAMES = { byId: {}, byName: {} };

  function clampNum(n, lo, hi, fallback) {
    n = Number(n);
    if (!isFinite(n)) return fallback;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function normalizePhotoFrame(frame) {
    if (!frame || typeof frame !== "object") return null;
    return {
      x: Math.round(clampNum(frame.x, -80, 80, 0) * 10) / 10,
      y: Math.round(clampNum(frame.y, -80, 80, 0) * 10) / 10,
      zoom: Math.round(clampNum(frame.zoom, 1, 3, 1) * 100) / 100,
    };
  }

  function frameContactKey(contactId) {
    return String(contactId || "")
      .trim()
      .replace(/^pp-/i, "");
  }

  function portalRegisterParticipantPhotoFrame(contactId, displayName, frame) {
    var f = normalizePhotoFrame(frame);
    if (!f) return;
    var id = frameContactKey(contactId);
    if (id) PARTICIPANT_PHOTO_FRAMES.byId[id] = f;
    var nk = storageAvatarKey(displayName);
    if (nk) PARTICIPANT_PHOTO_FRAMES.byName[nk] = f;
  }

  function photoFrameSurfaceOn() {
    try {
      var p = String((global.location && global.location.pathname) || "").toLowerCase();
      if (p.indexOf("parent") >= 0 || p.indexOf("booking") >= 0) return false;
    } catch (_) {}
    return true;
  }

  /** Roster cards say "Yusuf Ah". The saved frame is on "Yusuf Ahmed". */
  function photoFrameNameMatches(cardKey, storedKey) {
    if (!cardKey || !storedKey) return false;
    if (cardKey === storedKey) return true;
    if (storedKey.indexOf(cardKey + " ") === 0 || cardKey.indexOf(storedKey + " ") === 0) return true;
    var a = cardKey.split(" ");
    var b = storedKey.split(" ");
    if (!a.length || !b.length || a[0] !== b[0]) return false;
    var short = a.length <= b.length ? a : b;
    var long = a.length <= b.length ? b : a;
    var i;
    for (i = 1; i < short.length; i++) {
      var s = short[i];
      var l = long[i] || "";
      if (l.indexOf(s) !== 0 && s.indexOf(l) !== 0) return false;
    }
    return true;
  }

  function lookupPhotoFrame(contactId, displayName) {
    var id = frameContactKey(contactId);
    if (id && PARTICIPANT_PHOTO_FRAMES.byId[id]) return PARTICIPANT_PHOTO_FRAMES.byId[id];
    var nk = storageAvatarKey(displayName);
    if (!nk) return null;
    if (PARTICIPANT_PHOTO_FRAMES.byName[nk]) return PARTICIPANT_PHOTO_FRAMES.byName[nk];
    var hit = null;
    var keys = Object.keys(PARTICIPANT_PHOTO_FRAMES.byName);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!photoFrameNameMatches(nk, keys[i])) continue;
      var frame = PARTICIPANT_PHOTO_FRAMES.byName[keys[i]];
      if (hit && hit !== frame) return null;
      hit = frame;
    }
    return hit;
  }

  function isParentUploadedPhotoUrl(url) {
    return /participant-avatars/i.test(String(url || ""));
  }

  function ensurePhotoFrameCss() {
    if (typeof document === "undefined") return;
    if (document.getElementById("portal-photo-frame-css")) return;
    var s = document.createElement("style");
    s.id = "portal-photo-frame-css";
    s.textContent =
      'img[data-photo-frame="1"]{object-fit:contain !important;object-position:center center !important;transform:translate(var(--photo-x,0%),var(--photo-y,0%)) scale(var(--photo-zoom,1));transform-origin:center center;}' +
      "[data-photo-adjust]{cursor:pointer;}" +
      ".portal-roster-avatar,.pax-contacts-avatar,.session-name-photo,.calendar-day-avatar--photo,.clients-grid-avatar,.today-participant-chip__avatar,.client-photo-slot--has-photo{overflow:hidden;}";
    (document.head || document.documentElement).appendChild(s);
  }

  function photoFrameForUrl(name, clientId, url) {
    if (!photoFrameSurfaceOn()) return null;
    var saved = lookupPhotoFrame(clientId, name);
    if (!saved && !isParentUploadedPhotoUrl(url)) return null;
    return saved || { x: 0, y: 0, zoom: 1 };
  }

  function portalParticipantPhotoFrameAttr(name, clientId, url) {
    ensurePhotoFrameCss();
    var f = photoFrameForUrl(name, clientId, url);
    if (!f) return "";
    return (
      ' data-photo-frame="1" style="--photo-x:' +
      f.x +
      "%;--photo-y:" +
      f.y +
      "%;--photo-zoom:" +
      f.zoom +
      '"'
    );
  }

  function applyPhotoFrameToImg(img, name, clientId, url) {
    if (!img) return;
    ensurePhotoFrameCss();
    var f = photoFrameForUrl(name, clientId, url || img.getAttribute("src") || "");
    if (!f) {
      img.removeAttribute("data-photo-frame");
      img.style.removeProperty("--photo-x");
      img.style.removeProperty("--photo-y");
      img.style.removeProperty("--photo-zoom");
      return;
    }
    img.setAttribute("data-photo-frame", "1");
    img.style.setProperty("--photo-x", f.x + "%");
    img.style.setProperty("--photo-y", f.y + "%");
    img.style.setProperty("--photo-zoom", String(f.zoom));
  }

  function storageAvatarKey(name) {
    return String(name || "")
      .replace(/\(\s*trial[^)]*\)/gi, " ")
      .replace(/\s+trial\s*$/i, " ")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Index a storage photo on this child's own ids only.
   * Do not copy it onto a roster spelling alias (yusuf -> yusuf_ah) or a bare
   * first name. That showed Yusuf Harzi on Yusuf Ah, and Ayaan Towle on Ayaan.
   */
  function portalRegisterParticipantStorageAvatar(contactId, displayName, url) {
    url = normalizePhotoUrl(String(url || "").trim());
    if (!url || !/^https?:\/\//i.test(url)) return;
    var id = String(contactId || "").trim();
    if (id) PARTICIPANT_STORAGE_AVATARS.byId[id] = url;
    var nk = storageAvatarKey(displayName);
    if (nk) PARTICIPANT_STORAGE_AVATARS.byName[nk] = url;
    var rawSlug = nk ? nk.replace(/\s+/g, "_") : "";
    if (rawSlug) PARTICIPANT_STORAGE_AVATARS.byId[rawSlug] = url;
    var parts = nk ? nk.split(/\s+/).filter(Boolean) : [];
    if (parts.length >= 2) {
      var short2 = parts[0] + " " + parts[1].slice(0, 2);
      if (short2 !== nk) PARTICIPANT_STORAGE_AVATARS.byName[short2] = url;
    }
  }

  /** Bare first name is free only when one child has it, and the roster does not already give that word to someone else. */
  function bareFirstNameIsSafe(displayName, first, firstCount) {
    if (!first || !firstCount || firstCount[first] !== 1) return false;
    var idn = global.PortalParticipantIdentity;
    if (!idn || typeof idn.canonicalClientId !== "function") return true;
    var claimed = String(idn.canonicalClientId(first) || "").trim();
    var own = String(idn.canonicalClientId(displayName) || "").trim();
    if (!claimed || claimed === first || claimed === own) return true;
    return false;
  }

  function participantAvatarPublicUrl(storagePath) {
    var path = String(storagePath || "").trim();
    if (!path) return "";
    var base = String(global.SUPABASE_URL || "").replace(/\/$/, "");
    if (!base) return "";
    return (
      base +
      "/storage/v1/object/public/participant-avatars/" +
      path
        .split("/")
        .map(function (part) {
          return encodeURIComponent(part);
        })
        .join("/")
    );
  }

  function refreshOpenParticipantPhotos() {
    try {
      if (typeof global.portalRefreshDashboardParticipantPhotos === "function") {
        global.portalRefreshDashboardParticipantPhotos(document);
      }
    } catch (_) {}
    try {
      var slot = document.getElementById("clientPhotoSlot");
      var nm = slot && slot.getAttribute("data-participant-name");
      if (nm && typeof global.syncClientPhotoSlot === "function") {
        global.syncClientPhotoSlot(nm, slot.getAttribute("data-participant-client-id") || "");
      }
    } catch (_) {}
  }

  /** Parents upload to participant-avatars. Instructors only had the old static PNGs. */
  function portalHydrateParticipantAvatars() {
    var box = global.__PORTAL_SUPABASE__;
    var sb = box && box.client;
    if (!sb || typeof sb.from !== "function") return Promise.resolve(false);
    function pull(withFrame) {
      var cols = withFrame
        ? "contact_id, display_name, avatar_storage_path, avatar_frame"
        : "contact_id, display_name, avatar_storage_path";
      return sb.from("portal_participants").select(cols).limit(2000);
    }
    return pull(true)
      .then(function (res) {
        var msg = res && res.error ? String(res.error.message || res.error.code || "") : "";
        if (res && res.error && /avatar_frame/i.test(msg)) return pull(false);
        return res;
      })
      .then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return false;
        var firstCount = Object.create(null);
        res.data.forEach(function (r) {
          if (!r || !r.display_name) return;
          var first = storageAvatarKey(r.display_name).split(" ")[0];
          if (first) firstCount[first] = (firstCount[first] || 0) + 1;
        });
        res.data.forEach(function (r) {
          if (!r || !r.display_name) return;
          if (r.avatar_frame) portalRegisterParticipantPhotoFrame(r.contact_id, r.display_name, r.avatar_frame);
          if (!r.avatar_storage_path) return;
          var url = participantAvatarPublicUrl(r.avatar_storage_path);
          if (!url) return;
          portalRegisterParticipantStorageAvatar(r.contact_id, r.display_name, url);
          var nk = storageAvatarKey(r.display_name);
          var parts = nk.split(" ").filter(Boolean);
          if (parts.length >= 2 && bareFirstNameIsSafe(r.display_name, parts[0], firstCount)) {
            PARTICIPANT_STORAGE_AVATARS.byName[parts[0]] = url;
            PARTICIPANT_STORAGE_AVATARS.byId[parts[0]] = url;
          }
        });
        refreshOpenParticipantPhotos();
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function bindParticipantAvatarHydrate() {
    global.addEventListener("portal:supabase-ready", function () {
      void portalHydrateParticipantAvatars();
    });
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      void portalHydrateParticipantAvatars();
    }
  }

  function portalParticipantStorageAvatarUrl(contactId, displayName) {
    var id = String(contactId || "").trim();
    if (id && PARTICIPANT_STORAGE_AVATARS.byId[id]) return PARTICIPANT_STORAGE_AVATARS.byId[id];
    var nk = storageAvatarKey(displayName);
    if (nk && PARTICIPANT_STORAGE_AVATARS.byName[nk]) return PARTICIPANT_STORAGE_AVATARS.byName[nk];
    var rawSlug = nk ? nk.replace(/\s+/g, "_") : "";
    if (rawSlug && PARTICIPANT_STORAGE_AVATARS.byId[rawSlug]) {
      return PARTICIPANT_STORAGE_AVATARS.byId[rawSlug];
    }
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
      /* Bare first name only for a one-word roster label. "Ayaan Towle" must not pick Ayaan Imam's file. */
      if (parts.length === 1) add(parts[0]);
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
      if (!p) return;
      /* Office recognition photo. Parents keep an empty circle until they upload. */
      if (!photoFrameSurfaceOn() && /\/participants\/emani\.jpe?g(?:$|\?)/i.test(p)) return;
      add(p);
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
    var frameAttr = portalParticipantPhotoFrameAttr(name, opts.contactId || clientId, url);
    var adjustAttr = "";
    var hiddenAttr = ' aria-hidden="true"';
    if (opts.adjustable) {
      var cid = frameContactKey(opts.contactId || clientId);
      adjustAttr =
        ' data-photo-adjust="1" role="button" tabindex="0" data-photo-contact="' +
        esc(cid) +
        '" data-photo-name="' +
        esc(name) +
        '" title="Adjust photo"';
      hiddenAttr = "";
    }
    return (
      '<span class="' +
      esc(wrapClass) +
      ' portal-roster-avatar--has-photo"' +
      adjustAttr +
      hiddenAttr +
      ">" +
      initials +
      '<img class="' +
      esc(imgClass) +
      '" src="' +
      esc(url) +
      '" alt=""' +
      loadAttr +
      ' decoding="async" draggable="false"' +
      frameAttr +
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
        portalParticipantPhotoFrameAttr(name, clientId, photoUrl) +
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

    root.querySelectorAll("[data-photo-name] img, img[data-photo-frame]").forEach(function (img) {
      var wrap = img.closest("[data-photo-name]");
      var name = wrap ? wrap.getAttribute("data-photo-name") || "" : "";
      var cid = wrap ? wrap.getAttribute("data-photo-contact") || "" : "";
      applyPhotoFrameToImg(img, name, cid, img.getAttribute("src") || "");
    });

    if (typeof global.portalRefreshTodayNextParticipantPhotos === "function") {
      global.portalRefreshTodayNextParticipantPhotos(root);
    }
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
  global.portalHydrateParticipantAvatars = portalHydrateParticipantAvatars;
  bindParticipantAvatarHydrate();
  global.portalParticipantStorageAvatarUrl = portalParticipantStorageAvatarUrl;
  global.portalParticipantPhotoUrl = portalParticipantPhotoUrl;
  global.portalParticipantPhotoPathCandidates = participantPhotoPathCandidates;
  global.portalParticipantPhotoTryFallback = portalParticipantPhotoTryFallback;
  global.portalParticipantGender = portalParticipantGender;
  global.portalParticipantGenderClass = portalParticipantGenderClass;
  global.portalParticipantInitials = portalParticipantInitials;
  global.portalParticipantAvatarInnerHtml = portalParticipantAvatarInnerHtml;
  global.portalParticipantPhotoFrameAttr = portalParticipantPhotoFrameAttr;
  global.portalRegisterParticipantPhotoFrame = portalRegisterParticipantPhotoFrame;
  global.portalLookupParticipantPhotoFrame = lookupPhotoFrame;
  global.portalApplyParticipantPhotoFrame = applyPhotoFrameToImg;
  global.portalParticipantCalendarAvatarHtml = portalParticipantCalendarAvatarHtml;
  global.portalNormalizeParticipantPhotoUrl = normalizePhotoUrl;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
