/**
 * Admin dashboard topbar: signed-in photo + Staff / Lead / Admin portal switch.
 */
(function (global) {
  "use strict";

  var ICONS = {
    staff:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    lead:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',
    admin:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  };

  function normalizePhotoUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  function swapPhotoExt(url, ext) {
    var u = String(url || "").trim();
    if (!u) return "";
    return u.replace(/\.(png|jpe?g|webp)$/i, "." + ext);
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

  var EXEC_DISPLAY_NAMES = { victor: "Victor", raul: "Raúl", javi: "Javi", sevitha: "Sevitha" };

  function isGenericDisplayName(name) {
    var n = String(name || "")
      .trim()
      .toLowerCase();
    return !n || n === "admin" || n === "staff" || n === "user" || n === "member" || n === "guest";
  }
  var CORPORATE_AUTH_EMAIL_TO_KEY = {
    "victor@clubsensational.org": "victor",
    "raul@clubsensational.org": "raul",
    "javi@clubsensational.org": "javi",
    "javier@clubsensational.org": "javi",
    "sevitha@clubsensational.org": "sevitha",
    "info@clubsensational.org": "sevitha",
  };

  function staffKeyFromEmail(authEmail) {
    var e = String(authEmail || "")
      .trim()
      .toLowerCase();
    if (!e) return "";
    if (CORPORATE_AUTH_EMAIL_TO_KEY[e]) return CORPORATE_AUTH_EMAIL_TO_KEY[e];
    var local = e.split("@")[0] || "";
    if (CORPORATE_AUTH_EMAIL_TO_KEY[local]) return CORPORATE_AUTH_EMAIL_TO_KEY[local];
    return canonicalStaffKey(local);
  }

  function inferStaffKey(profile, authEmail) {
    if (typeof global.portalInferStaffKey === "function") {
      var inferred = canonicalStaffKey(global.portalInferStaffKey(profile, authEmail));
      if (inferred) return inferred;
    }
    var fromEmail = staffKeyFromEmail(authEmail);
    if (fromEmail) return fromEmail;
    if (profile && profile.username) return canonicalStaffKey(profile.username);
    return "";
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

  function resolvePhotoCandidates(profile, authEmail, session) {
    var rosterUrls = [];
    var remoteUrls = [];
    function pushRoster(raw) {
      var u = normalizePhotoUrl(raw);
      if (u && rosterUrls.indexOf(u) < 0) rosterUrls.push(u);
    }
    function pushRemote(raw) {
      var u = normalizePhotoUrl(raw);
      if (
        global.portalSanitizeRemoteAvatarUrl &&
        typeof global.portalSanitizeRemoteAvatarUrl === "function"
      ) {
        u = global.portalSanitizeRemoteAvatarUrl(u) || u;
      }
      if (u && remoteUrls.indexOf(u) < 0) remoteUrls.push(u);
    }
    var key = inferStaffKey(profile, authEmail);
    var displayName = resolveDisplayName(profile, authEmail, session);
    if (
      global.portalResolveStaffPhotoCandidates &&
      typeof global.portalResolveStaffPhotoCandidates === "function"
    ) {
      try {
        (global.portalResolveStaffPhotoCandidates(key || displayName, {
          username: (profile && profile.username) || key || "",
        }) || []).forEach(pushRoster);
      } catch (_) {}
    }
    try {
      var src = global.STAFF_DASHBOARD_SOURCE;
      if (key && src && src.staffProfiles && src.staffProfiles[key]) {
        var af = src.staffProfiles[key].avatarFile;
        if (af) {
          pushRoster(af);
          pushRoster(swapPhotoExt(af, "png"));
          pushRoster(swapPhotoExt(af, "jpg"));
        }
      }
      if (key) {
        var base = staffPhotosBase();
        if (base.charAt(base.length - 1) !== "/") base += "/";
        pushRoster(base + key + ".png");
        pushRoster(base + key + ".jpg");
        pushRoster(base + key + ".jpeg");
        pushRoster(base + key + ".webp");
      }
    } catch (_) {}
    try {
      var user = session && session.user ? session.user : null;
      var authMeta =
        user && user.user_metadata && typeof user.user_metadata === "object"
          ? user.user_metadata
          : {};
      if (authMeta.avatar_url) pushRemote(authMeta.avatar_url);
    } catch (_) {}
    try {
      var meta =
        profile &&
        profile.user_metadata &&
        typeof profile.user_metadata === "object"
          ? profile.user_metadata
          : {};
      if (meta.avatar_url) pushRemote(meta.avatar_url);
      if (profile && profile.avatar_url) pushRemote(profile.avatar_url);
    } catch (_) {}
    return rosterUrls.concat(remoteUrls);
  }

  function photoInitials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function showInitials(initialsEl, avWrap, letter) {
    var img = document.getElementById("miniAvImg");
    if (img) {
      img.removeAttribute("src");
      img.hidden = true;
      img.onerror = null;
      img.onload = null;
    }
    if (initialsEl) {
      initialsEl.textContent = letter || "·";
      initialsEl.hidden = false;
    }
    if (avWrap) avWrap.classList.remove("admin-av--photo");
  }

  function applyPhoto(img, initialsEl, avWrap, candidates, idx, name) {
    if (!img || !candidates.length) {
      showInitials(initialsEl, avWrap, photoInitials(name));
      return;
    }
    var url = candidates[idx];
    if (!url) {
      showInitials(initialsEl, avWrap, photoInitials(name));
      return;
    }
    img.onerror = function () {
      applyPhoto(img, initialsEl, avWrap, candidates, idx + 1, name);
    };
    img.onload = function () {
      if (initialsEl) initialsEl.hidden = true;
      img.hidden = false;
      img.alt = name ? name + " profile photo" : "Profile photo";
      if (avWrap) avWrap.classList.add("admin-av--photo");
    };
    img.src = url;
  }

  function publishedUrl(filename, overrideKey) {
    if (typeof global !== "undefined") {
      var w = String(global[overrideKey] || "").trim();
      if (w) return w;
      try {
        return new URL(filename, global.location.href).href;
      } catch (_) {}
    }
    return filename;
  }

  function resolveDisplayName(profile, email, session) {
    if (email) {
      var emailKey = staffKeyFromEmail(email);
      if (emailKey && EXEC_DISPLAY_NAMES[emailKey]) return EXEC_DISPLAY_NAMES[emailKey];
    }
    try {
      var user = session && session.user ? session.user : null;
      var authMeta =
        user && user.user_metadata && typeof user.user_metadata === "object"
          ? user.user_metadata
          : {};
      var metaName = String(authMeta.full_name || authMeta.name || "").trim();
      if (metaName && !isGenericDisplayName(metaName)) return metaName;
    } catch (_) {}
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.displayName === "function"
    ) {
      var chatNm = String(global.portalChatActorIdentity.displayName(profile) || "").trim();
      if (chatNm && !isGenericDisplayName(chatNm)) return chatNm;
    }
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.profileDisplayName === "function" &&
      profile
    ) {
      var profNm = String(global.portalChatActorIdentity.profileDisplayName(profile) || "").trim();
      if (profNm && !isGenericDisplayName(profNm)) return profNm;
    }
    var fromProfile = String((profile && (profile.full_name || profile.username)) || "").trim();
    if (fromProfile && !isGenericDisplayName(fromProfile)) return fromProfile;
    var key = inferStaffKey(profile, email);
    if (key && EXEC_DISPLAY_NAMES[key]) return EXEC_DISPLAY_NAMES[key];
    if (key) return key.charAt(0).toUpperCase() + key.slice(1);
    if (email) {
      var mapped = staffKeyFromEmail(email);
      if (mapped && EXEC_DISPLAY_NAMES[mapped]) return EXEC_DISPLAY_NAMES[mapped];
      var local = String(email).split("@")[0].replace(/[._+-]+/g, " ").trim();
      var word = local.split(/\s+/).filter(Boolean)[0] || "";
      if (word) {
        if (EXEC_DISPLAY_NAMES[word.toLowerCase()]) return EXEC_DISPLAY_NAMES[word.toLowerCase()];
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
    }
    return "";
  }

  function topbarSyncOptsFromCtx(extra) {
    extra = extra || {};
    var ctx = global.__PORTAL_SUPABASE__ || {};
    return {
      client: extra.client || ctx.client || null,
      session: extra.session || ctx.session || null,
      profile: extra.profile || ctx.staff_profile || null,
      email: String(
        extra.email ||
          (extra.session && extra.session.user && extra.session.user.email) ||
          (ctx.session && ctx.session.user && ctx.session.user.email) ||
          "",
      ).trim(),
      displayName: extra.displayName,
    };
  }

  global.portalSyncAdminTopbarProfile = function portalSyncAdminTopbarProfile(opts) {
    opts = opts || {};
    var ctx = global.__PORTAL_SUPABASE__ || {};
    var session = opts.session || ctx.session || null;
    var profile = opts.profile || ctx.staff_profile || null;
    var email = String(
      opts.email ||
        (session && session.user && session.user.email) ||
        "",
    ).trim();
    var displayName = String(opts.displayName || resolveDisplayName(profile, email, session) || "").trim();
    if (!displayName && email) {
      displayName = resolveDisplayName(null, email, session);
    }

    var nameEl = document.getElementById("miniName");
    if (nameEl && displayName) nameEl.textContent = displayName;

    var img = document.getElementById("miniAvImg");
    var initialsEl = document.getElementById("miniAvInitials");
    var avWrap = document.getElementById("miniAv");
    if (!img && !initialsEl) return;

    var candidates = resolvePhotoCandidates(profile, email, session);
    if (!candidates.length) {
      showInitials(initialsEl, avWrap, photoInitials(displayName));
      return;
    }
    applyPhoto(img, initialsEl, avWrap, candidates, 0, displayName);
  };

  global.portalSyncAdminTopbarProfileAsync = async function portalSyncAdminTopbarProfileAsync(opts) {
    opts = topbarSyncOptsFromCtx(opts || {});
    var client = opts.client;
    var session = opts.session;
    var profile = opts.profile;
    var email = opts.email;
    if (client && !session) {
      try {
        var sessRes = await client.auth.getSession();
        session = (sessRes && sessRes.data && sessRes.data.session) || session;
      } catch (_) {}
    }
    if (!email && session && session.user && session.user.email) {
      email = String(session.user.email).trim();
    }
    if (
      client &&
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.ensureSessionProfile === "function"
    ) {
      profile = (await global.portalChatActorIdentity.ensureSessionProfile(client)) || profile;
    }
    global.portalSyncAdminTopbarProfile({
      profile: profile,
      email: email,
      displayName: opts.displayName,
      session: session,
    });
  };

  var EXEC_PORTAL_SWITCH_KEYS = { victor: 1, raul: 1, javi: 1 };

  function canUseAdminPortalSwitch(profile, authEmail) {
    var key = inferStaffKey(profile, authEmail);
    return !!EXEC_PORTAL_SWITCH_KEYS[key];
  }

  global.portalCanUseAdminPortalSwitch = canUseAdminPortalSwitch;

  global.portalMountAdminPortalSwitch = function portalMountAdminPortalSwitch() {
    var host = document.getElementById("adminPortalSwitch");
    if (!host) return;
    host.textContent = "";

    var ctx = global.__PORTAL_SUPABASE__ || {};
    var profile = ctx.staff_profile || null;
    var email = String((ctx.session && ctx.session.user && ctx.session.user.email) || "").trim();
    if (!profile && !email) {
      host.hidden = true;
      host.setAttribute("aria-hidden", "true");
      return;
    }

    if (!canUseAdminPortalSwitch(profile, email)) {
      host.hidden = true;
      host.setAttribute("aria-hidden", "true");
      return;
    }

    var targets = [
      {
        mode: "lead",
        label: "Lead portal",
        title: "Open lead dashboard",
        url: publishedUrl("staff_dashboard.html", "PORTAL_LEAD_DASHBOARD_URL"),
      },
      {
        mode: "admin",
        label: "Admin portal",
        title: "You are here — admin dashboard",
        url: "",
      },
    ];

    targets.forEach(function (t) {
      var btn;
      if (t.mode === "admin") {
        btn = document.createElement("span");
        btn.className = "admin-portal-switch__btn is-active";
        btn.setAttribute("aria-current", "page");
      } else {
        btn = document.createElement("a");
        btn.className = "admin-portal-switch__btn";
        btn.href = t.url;
        btn.setAttribute("aria-label", t.title);
      }
      btn.title = t.title;
      btn.innerHTML = ICONS[t.mode] || "";
      host.appendChild(btn);
    });

    host.hidden = false;
    host.removeAttribute("aria-hidden");
  };

  function syncFromPortalSession() {
    var syncOpts = topbarSyncOptsFromCtx();
    if (!syncOpts.session && !syncOpts.profile && !syncOpts.email) return;
    var run = function () {
      global.portalMountAdminPortalSwitch();
    };
    if (typeof global.portalSyncAdminTopbarProfileAsync === "function") {
      void global.portalSyncAdminTopbarProfileAsync(syncOpts).then(run).catch(function () {
        global.portalSyncAdminTopbarProfile(syncOpts);
        run();
      });
      return;
    }
    global.portalSyncAdminTopbarProfile(syncOpts);
    run();
  }

  global.addEventListener("portal:supabase-ready", syncFromPortalSession);
  if (global.__PORTAL_SUPABASE__ && (global.__PORTAL_SUPABASE__.session || global.__PORTAL_SUPABASE__.staff_profile)) {
    syncFromPortalSession();
  }
})(typeof window !== "undefined" ? window : globalThis);
