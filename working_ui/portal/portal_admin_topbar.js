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

  function inferStaffKey(profile, authEmail) {
    if (typeof global.portalInferStaffKey === "function") {
      return canonicalStaffKey(global.portalInferStaffKey(profile, authEmail));
    }
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

  function resolvePhotoCandidates(profile, authEmail) {
    var urls = [];
    function push(raw) {
      var u = normalizePhotoUrl(raw);
      if (u && urls.indexOf(u) < 0) urls.push(u);
    }
    try {
      var meta =
        profile &&
        profile.user_metadata &&
        typeof profile.user_metadata === "object"
          ? profile.user_metadata
          : {};
      if (meta.avatar_url) push(meta.avatar_url);
      if (profile && profile.avatar_url) push(profile.avatar_url);
    } catch (_) {}
    var key = inferStaffKey(profile, authEmail);
    try {
      var src = global.STAFF_DASHBOARD_SOURCE;
      if (key && src && src.staffProfiles && src.staffProfiles[key]) {
        var af = src.staffProfiles[key].avatarFile;
        if (af) {
          push(af);
          push(swapPhotoExt(af, "png"));
          push(swapPhotoExt(af, "jpg"));
        }
      }
      if (key) {
        var base = staffPhotosBase();
        if (base.charAt(base.length - 1) !== "/") base += "/";
        push(base + key + ".png");
        push(base + key + ".jpg");
        push(base + key + ".jpeg");
        push(base + key + ".webp");
      }
    } catch (_) {}
    return urls;
  }

  function photoInitials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function showInitials(initialsEl, avWrap, letter) {
    if (initialsEl) {
      initialsEl.textContent = letter || "?";
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

  global.portalSyncAdminTopbarProfile = function portalSyncAdminTopbarProfile(opts) {
    opts = opts || {};
    var ctx = global.__PORTAL_SUPABASE__ || {};
    var profile = opts.profile || ctx.staff_profile || null;
    var email = String(
      opts.email ||
        (ctx.session && ctx.session.user && ctx.session.user.email) ||
        "",
    ).trim();
    var displayName = String(
      opts.displayName ||
        (profile && (profile.full_name || profile.username)) ||
        "",
    ).trim();

    var nameEl = document.getElementById("miniName");
    if (nameEl && displayName) nameEl.textContent = displayName;

    var img = document.getElementById("miniAvImg");
    var initialsEl = document.getElementById("miniAvInitials");
    var avWrap = document.getElementById("miniAv");
    if (!img && !initialsEl) return;

    var candidates = resolvePhotoCandidates(profile, email);
    if (!candidates.length) {
      showInitials(initialsEl, avWrap, photoInitials(displayName));
      return;
    }
    applyPhoto(img, initialsEl, avWrap, candidates, 0, displayName);
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
        mode: "staff",
        label: "Staff portal",
        title: "Open staff dashboard",
        url: publishedUrl("staff_dashboard.html", "PORTAL_STAFF_DASHBOARD_URL"),
      },
      {
        mode: "lead",
        label: "Lead portal",
        title: "Open lead dashboard",
        url: publishedUrl("lead_dashboard.html", "PORTAL_LEAD_DASHBOARD_URL"),
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
})(typeof window !== "undefined" ? window : globalThis);
