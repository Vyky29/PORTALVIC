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

  function resolveStaffPhotoCandidates(nameOrKey) {
    var urls = [];
    function push(raw) {
      var u = normalizePhotoUrl(raw);
      if (u && urls.indexOf(u) < 0) urls.push(u);
    }
    var key = canonicalStaffKey(nameOrKey);
    if (!key) {
      var first = String(nameOrKey || "")
        .trim()
        .split(/\s+/)[0];
      key = canonicalStaffKey(first);
    }
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

  function portalStaffPhotoUrl(nameOrKey) {
    var candidates = resolveStaffPhotoCandidates(nameOrKey);
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

  function portalStaffAvatarInnerHtml(nameOrKey, opts) {
    opts = opts || {};
    var esc = typeof opts.esc === "function" ? opts.esc : defaultEsc;
    var displayName = String(opts.displayName || nameOrKey || "").trim();
    var url = portalStaffPhotoUrl(nameOrKey);
    var initials = esc(portalStaffInitials(displayName || nameOrKey));
    var wrapClass = String(opts.className || "portal-roster-avatar portal-roster-avatar--staff").trim();
    if (!url) {
      return '<span class="' + esc(wrapClass) + '" aria-hidden="true">' + initials + "</span>";
    }
    var imgClass = String(opts.imgClass || "portal-roster-avatar__img").trim();
    return (
      '<span class="' +
      esc(wrapClass) +
      ' portal-roster-avatar--has-photo" aria-hidden="true">' +
      initials +
      '<img class="' +
      esc(imgClass) +
      '" src="' +
      esc(url) +
      '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-roster-avatar--has-photo\');" />' +
      "</span>"
    );
  }

  global.portalStaffPhotoUrl = portalStaffPhotoUrl;
  global.portalStaffInitials = portalStaffInitials;
  global.portalStaffAvatarInnerHtml = portalStaffAvatarInnerHtml;
  global.portalResolveStaffPhotoCandidates = resolveStaffPhotoCandidates;
})(
  typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this
);
