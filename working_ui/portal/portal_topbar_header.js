/**
 * Topbar worker photo + shortcut grid (staff 2×N, lead 2×3).
 */
(function (global) {
  "use strict";

  /** Programme leads — 6-icon grid on staff or lead shell (not CEOs on staff). */
  var PROGRAMME_LEAD_TOPBAR_KEYS = { berta: true, john: true, michelle: true };

  /** Victor, Raúl, Javi/Palankas — full topbar on staff shell. */
  var CEO_TOPBAR_KEYS = { victor: true, raul: true, javi: true };

  /** Gallery upload from phone (not just in-app camera). */
  var GALLERY_UPLOAD_STAFF_KEYS = {
    victor: true,
    raul: true,
    javi: true,
    berta: true,
    john: true,
    michelle: true,
  };

  var CEO_INLINE_TOPBAR_IDS = [
    "topbarToolCellAchievements",
    "topbarToolAchievements",
    "topbarToolCellTermReview",
    "topbarToolTermReview",
    "topbarToolCellLeadTermReview",
    "topbarToolLeadTermReview",
    "topbarToolCellVenue",
    "topbarToolVenue",
    "topbarToolCellPickup",
    "topbarToolPickup",
    "topbarToolCellSessionPlanner",
    "topbarToolSessionPlanner",
    "topbarToolCellLeadReport",
    "topbarToolLeadReport",
    "topbarToolCellSessionsOverview",
    "topbarToolSessionsOverview",
  ];

  var LEAD_TOPBAR_CELL_IDS = [
    "topbarToolCellLeadTermReview",
    "topbarToolCellLeadReport",
    "topbarToolCellSessionsOverview",
  ];
  var LEAD_TOPBAR_BTN_IDS = [
    "topbarToolLeadTermReview",
    "topbarToolLeadReport",
    "topbarToolSessionsOverview",
  ];

  function normalizeStaffPhotoUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  function staffPhotosBaseFromSource() {
    try {
      var src = global.STAFF_DASHBOARD_SOURCE || {};
      var base = String(src.staffPhotosBaseUrl || "portal/staff_photos/").trim();
      if (!base) return "/portal/staff_photos/";
      return normalizeStaffPhotoUrl(base);
    } catch (_) {
      return "/portal/staff_photos/";
    }
  }

  function swapStaffPhotoExtension(url, ext) {
    var u = String(url || "").trim();
    if (!u) return "";
    return u.replace(/\.(png|jpe?g|webp)$/i, "." + ext);
  }

  function isRemoteStaffPhotoUrl(url) {
    var u = String(url || "").trim();
    return /^https?:\/\//i.test(u) || u.indexOf("data:") === 0;
  }

  /** Admin roster photo paths (spreadsheet boot / staffProfiles) — not user-uploaded auth metadata. */
  function resolveStaffPhotoCandidates() {
    var rosterUrls = [];
    var remoteUrls = [];
    function pushRoster(raw) {
      var u = normalizeStaffPhotoUrl(raw);
      if (u && rosterUrls.indexOf(u) < 0) rosterUrls.push(u);
    }
    function pushRemote(raw) {
      var u = raw;
      try {
        if (typeof global.portalSanitizeRemoteAvatarUrl === "function") {
          u = global.portalSanitizeRemoteAvatarUrl(raw);
        }
      } catch (_) {}
      u = normalizeStaffPhotoUrl(u);
      if (u && remoteUrls.indexOf(u) < 0) remoteUrls.push(u);
    }
    try {
      var dd = global.dashboardData;
      if (dd && dd.avatarFile && !isRemoteStaffPhotoUrl(dd.avatarFile)) {
        pushRoster(dd.avatarFile);
        pushRoster(swapStaffPhotoExtension(dd.avatarFile, "png"));
        pushRoster(swapStaffPhotoExtension(dd.avatarFile, "jpg"));
      }
      var key = resolveTopbarStaffKey();
      var src = global.STAFF_DASHBOARD_SOURCE;
      if (key && src && src.staffProfiles && src.staffProfiles[key]) {
        var af = src.staffProfiles[key].avatarFile;
        if (af) {
          pushRoster(af);
          pushRoster(swapStaffPhotoExtension(af, "png"));
          pushRoster(swapStaffPhotoExtension(af, "jpg"));
        }
      }
      if (
        key &&
        (!global.portalStaffPhotoKeyAllowed || global.portalStaffPhotoKeyAllowed(key))
      ) {
        var base = staffPhotosBaseFromSource();
        if (base.charAt(base.length - 1) !== "/") base += "/";
        pushRoster(base + key + ".png");
        pushRoster(base + key + ".jpg");
        pushRoster(base + key + ".jpeg");
        pushRoster(base + key + ".webp");
      }
    } catch (_) {}
    try {
      if (global.__PORTAL_STAFF_SELF_AVATAR_URL__) pushRemote(global.__PORTAL_STAFF_SELF_AVATAR_URL__);
      var box = global.__PORTAL_SUPABASE__ || {};
      var user = box.session && box.session.user;
      var meta = user && user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      if (meta.avatar_url) pushRemote(meta.avatar_url);
    } catch (_) {}
    return rosterUrls.concat(remoteUrls);
  }

  function showStaffPhotoInitials(img, ini, pending, name) {
    if (img) {
      img.removeAttribute("src");
      img.alt = "";
      img.hidden = true;
      img.style.display = "none";
      img.onerror = null;
      img.onload = null;
    }
    var avatar = document.getElementById("avatar");
    if (avatar) avatar.classList.remove("avatar--has-staff-photo");
    var brand = document.getElementById("topbarBrandLogo");
    if (brand) brand.hidden = false;
    var box = document.getElementById("topbarStaffPhoto");
    if (box) box.setAttribute("aria-hidden", "true");
    if (ini) {
      ini.textContent = pending ? "\u2026" : photoInitials(name);
      ini.hidden = false;
    }
  }

  function applyStaffPhotoUrl(img, ini, candidates, idx, name) {
    if (!img || !candidates.length) {
      showStaffPhotoInitials(img, ini, false, name);
      return;
    }
    var url = candidates[idx];
    if (!url) {
      showStaffPhotoInitials(img, ini, false, name);
      return;
    }
    img.onerror = function () {
      applyStaffPhotoUrl(img, ini, candidates, idx + 1, name);
    };
    img.onload = function () {
      if (ini) {
        ini.textContent = "";
        ini.hidden = true;
      }
      img.alt = name ? name + " profile photo" : "Profile photo";
      img.hidden = false;
      img.style.display = "";
      var avatar = document.getElementById("avatar");
      if (avatar) avatar.classList.add("avatar--has-staff-photo");
      var brand = document.getElementById("topbarBrandLogo");
      if (brand) brand.hidden = true;
      var box = document.getElementById("topbarStaffPhoto");
      if (box) box.setAttribute("aria-hidden", "false");
    };
    var current = String(img.getAttribute("src") || img.src || "");
    if (current && (current === url || current.endsWith(url) || url.endsWith(current.split("?")[0]))) {
      if (img.complete && img.naturalWidth > 0) {
        img.onload();
      }
      return;
    }
    img.src = url;
  }

  function normTopbarGender(value) {
    var v = String(value || "")
      .trim()
      .toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  function genderFromStaffMap(key, displayName) {
    try {
      var map = global.PORTAL_STAFF_GENDER_OVERRIDES || {};
      if (key && map[key]) {
        var fromKey = normTopbarGender(map[key]);
        if (fromKey) return fromKey;
      }
      var first = canonicalTopbarStaffKey(staffFirstName(displayName));
      if (first && map[first]) {
        var fromFirst = normTopbarGender(map[first]);
        if (fromFirst) return fromFirst;
      }
    } catch (_) {}
    return "";
  }

  function resolveTopbarStaffGender() {
    var key = resolveTopbarStaffKey();
    var displayName = "";
    try {
      var dd = global.dashboardData;
      if (dd && dd.staffName) displayName = String(dd.staffName).trim();
    } catch (_) {}
    if (!displayName) {
      try {
        var givenEl = global.document && global.document.getElementById("staffNameGiven");
        if (givenEl) displayName = String(givenEl.textContent || "").trim();
      } catch (_) {}
    }
    var fromMap = genderFromStaffMap(key, displayName);
    if (fromMap) return fromMap;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      if (profile) {
        var fromProfile = normTopbarGender(profile.gender || profile.sex);
        if (fromProfile) return fromProfile;
      }
    } catch (_) {}
    return "m";
  }

  function portalSyncTopbarProfileCard() {
    var card = document.getElementById("topbarProfileCard");
    var wrap = document.getElementById("avatarWrap");
    var gender = resolveTopbarStaffGender();
    if (card) card.setAttribute("data-gender", gender);
    if (wrap) wrap.setAttribute("data-gender", gender);
    var key = resolveTopbarStaffKey();
    if (card) {
      if (key) card.setAttribute("data-staff-key", key);
      else card.removeAttribute("data-staff-key");
    }
    if (wrap) {
      if (key) wrap.setAttribute("data-staff-key", key);
      else wrap.removeAttribute("data-staff-key");
    }
    try {
      if (typeof global.portalStaffWaSyncTopbar === "function") {
        global.portalStaffWaSyncTopbar(key || "");
      }
    } catch (_wa) {}
  }

  function staffFirstName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts[0] || "";
  }

  function photoInitials(name) {
    var n = staffFirstName(name);
    if (!n) return "?";
    return n.slice(0, 2).toUpperCase();
  }

  function setElementVisible(id, visible) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function isStaffWaToolCell(cell) {
    if (!cell) return false;
    if (cell.id === "topbarToolCellStaffWa") return true;
    return cell.classList.contains("topbar-tool-cell--staff-wa");
  }

  function topbarToolGridRoots() {
    var roots = [];
    var left = document.getElementById("topbarToolsGridLeft");
    var right = document.getElementById("topbarToolsGridRight");
    var legacy = document.getElementById("topbarToolsGrid");
    if (left) roots.push(left);
    if (right) roots.push(right);
    if (!left && !right && legacy) roots.push(legacy);
    return roots;
  }

  /** Session tools only — CS WhatsApp double-width cell is placement-only, not a session icon. */
  function countVisibleTopbarToolCells() {
    if (typeof global.portalCountSessionTopbarTools === "function") {
      try {
        return global.portalCountSessionTopbarTools();
      } catch (_e) {}
    }
    var n = 0;
    topbarToolGridRoots().forEach(function (grid) {
      var cells = grid.querySelectorAll(".topbar-tool-cell");
      for (var i = 0; i < cells.length; i++) {
        if (isStaffWaToolCell(cells[i])) continue;
        if (!cells[i].hidden) n++;
      }
    });
    return n;
  }

  /** Even counts → 2 columns; compact 6/8 grids never use row-1 solo (avoids John 7-icon overflow). */
  function portalSyncTopbarToolsGridLayout() {
    var roots = topbarToolGridRoots();
    if (!roots.length) return;
    roots.forEach(function (grid) {
      if (grid.classList.contains("topbar-tools-grid--flank")) {
        var cells = grid.querySelectorAll(".topbar-tool-cell");
        for (var i = 0; i < cells.length; i++) {
          cells[i].classList.remove("topbar-tool-cell--row1-solo", "topbar-tool-cell--row-last-solo");
        }
        return;
      }
      var n = 0;
      var cellsAll = grid.querySelectorAll(".topbar-tool-cell");
      for (var c = 0; c < cellsAll.length; c++) {
        if (isStaffWaToolCell(cellsAll[c])) continue;
        if (!cellsAll[c].hidden) n++;
      }
      var catalogGrid = grid.classList.contains("topbar-tools-grid--catalog");
      var strictTwoCol =
        catalogGrid ||
        grid.classList.contains("topbar-tools-grid--lead") ||
        grid.classList.contains("topbar-tools-grid--eight") ||
        grid.classList.contains("topbar-tools-grid--ceo-full");
      var achievements = document.getElementById("topbarToolCellAchievements");
      var useSoloFirstRow = !strictTwoCol && n === 1;
      if (achievements && achievements.parentNode === grid) {
        achievements.classList.toggle("topbar-tool-cell--row1-solo", useSoloFirstRow);
      }
      for (var i2 = 0; i2 < cellsAll.length; i2++) {
        cellsAll[i2].classList.remove("topbar-tool-cell--row-last-solo");
      }
      if (n > 1 && n % 2 === 1) {
        for (var j = cellsAll.length - 1; j >= 0; j--) {
          if (cellsAll[j].hidden || isStaffWaToolCell(cellsAll[j])) continue;
          cellsAll[j].classList.add("topbar-tool-cell--row-last-solo");
          break;
        }
      }
    });
  }

  function canonicalTopbarStaffKey(value) {
    var k = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
    if (!k) return "";
    // Prefer the authoritative resolver (auth-map.js) with the full staff-code
    // map (stf005 -> youssef, etc.) so topbar profiles resolve for every staff.
    try {
      if (typeof global.portalCanonicalStaffRosterKey === "function") {
        var canon = global.portalCanonicalStaffRosterKey(k);
        if (canon) return canon;
      }
    } catch (_) {}
    try {
      if (typeof global.portalProfileRosterKey === "function") {
        var fromRoster = global.portalProfileRosterKey(k);
        if (fromRoster) return fromRoster;
      }
    } catch (_) {}
    if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
    if (k === "yousef" || k === "yousseff" || k === "yusef" || k === "stf005") return "youssef";
    if (k.indexOf("youssef") === 0 || k.indexOf("yousef") === 0) return "youssef";
    if (k === "javiermarquez" || k === "stf010") return "javier";
    if (k === "stf017" || k === "palankas" || k === "palankasarranz" || k === "palankasarranzescorial") {
      return "javi";
    }
    if (k === "javiarranz" || k === "javiarranzescorial") return "javi";
    if (k === "stf001") return "sandra";
    if (k === "stf002") return "roberto";
    if (k === "stf003") return "dan";
    if (k === "stf004") return "angel";
    if (k === "stf006") return "john";
    if (k === "stf007") return "bismark";
    if (k === "stf008") return "giuseppe";
    if (k === "stf009") return "godsway";
    if (k === "stf011") return "aurora";
    if (k === "stf012") return "berta";
    if (k === "stf013") return "victor";
    if (k === "stf014") return "carlos";
    if (k === "stf015") return "alex";
    if (k === "stf016") return "simon";
    if (k === "stf018") return "raul";
    if (k === "stf019") return "sevitha";
    if (k === "stf020") return "teflon";
    if (k === "stf022") return "andres";
    return k;
  }

  function resolveTopbarStaffKey() {
    try {
      var sid = global.STAFF_DASHBOARD_ID;
      if (sid) {
        var fromDashId = canonicalTopbarStaffKey(sid);
        if (fromDashId) return fromDashId;
      }
    } catch (_) {}
    try {
      var dd = global.dashboardData;
      if (dd && dd.staffId) {
        var fromDash = canonicalTopbarStaffKey(dd.staffId);
        if (fromDash) return fromDash;
      }
    } catch (_) {}
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var user = box.session && box.session.user;
      var email = user && user.email ? String(user.email) : "";
      if (typeof global.portalRosterKeyFromAuthEmail === "function") {
        var fromEmail = canonicalTopbarStaffKey(global.portalRosterKeyFromAuthEmail(email));
        if (fromEmail) return fromEmail;
      }
      if (typeof global.portalInferStaffKey === "function") {
        var inferred = canonicalTopbarStaffKey(
          global.portalInferStaffKey(profile, email),
        );
        if (inferred) return inferred;
      }
    } catch (_) {}
    try {
      var box2 = global.__PORTAL_SUPABASE__ || {};
      var profile2 = box2.staff_profile;
      if (profile2 && profile2.username) {
        return canonicalTopbarStaffKey(profile2.username);
      }
    } catch (_) {}
    return "";
  }

  function portalStaffIsProgrammeLeadTopbar() {
    var key = resolveTopbarStaffKey();
    if (PROGRAMME_LEAD_TOPBAR_KEYS[key]) return true;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var em = String((box.session && box.session.user && box.session.user.email) || "")
        .trim()
        .toLowerCase();
      if (
        em === "b.traperocasado@gmail.com" ||
        em === "johnnyosti37@gmail.com" ||
        em === "michelle@youtimecounselling.com"
      ) {
        return true;
      }
      if (em.indexOf("traperocasado") >= 0) return true;
      if (em.indexOf("johnnyosti") >= 0 || em.indexOf("john.osti") >= 0) return true;
      if (em.indexOf("michelle@youtimecounselling") >= 0) return true;
    } catch (_) {}
    return false;
  }

  function portalStaffIsCeoTopbarFullAccess() {
    try {
      var key = resolveTopbarStaffKey();
      /* Swimming instructor Javier Marquez must never inherit CEO Javi tools. */
      if (key === "javier") return false;
      if (CEO_TOPBAR_KEYS[key]) return true;
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = (box.session && box.session.user && box.session.user.email) || "";
      if (typeof global.portalCanAccessCeoDashboard === "function") {
        if (global.portalCanAccessCeoDashboard(profile, email)) return true;
      } else if (typeof global.__portalCanAccessCeoDashboard === "function") {
        if (global.__portalCanAccessCeoDashboard(profile, email)) return true;
      }
      if (typeof global.portalInferStaffKey === "function") {
        key = canonicalTopbarStaffKey(global.portalInferStaffKey(profile, email));
        if (key === "javier") return false;
        if (CEO_TOPBAR_KEYS[key]) return true;
      }
      var em = String(email || "")
        .trim()
        .toLowerCase();
      if (em.indexOf("victor@") >= 0 || em.indexOf("raul@") >= 0) return true;
      /* Corporate CEO login only — not staff import emails / Javier Marquez. */
      if (em === "javier@clubsensational.org" || em === "javi@clubsensational.org" || em === "javier@clbusensational.org") {
        return true;
      }
    } catch (_) {}
    return false;
  }

  /** Victor, Raúl, Javi/Palankas, Berta, John, Michelle — upload from device gallery. */
  global.portalStaffCanUploadAchievementFromGallery = function portalStaffCanUploadAchievementFromGallery() {
    try {
      if (portalStaffIsAppRoleLead()) return true;
      var profile = (global.__PORTAL_SUPABASE__ || {}).staff_profile;
      var app = String((profile && profile.app_role) || "")
        .trim()
        .toLowerCase();
      if (app === "lead" || app === "ceo") return true;
      var key = resolveTopbarStaffKey();
      if (GALLERY_UPLOAD_STAFF_KEYS[key]) return true;
      if (portalStaffIsProgrammeLeadTopbar()) return true;
      if (portalStaffIsCeoTopbarFullAccess()) return true;
    } catch (_) {}
    return false;
  };

  function portalApplyInlineCeoTopbarTools() {
    if (typeof global.portalSyncCeoFullTopbarTools === "function") {
      try {
        global.portalSyncCeoFullTopbarTools();
      } catch (_) {}
    }
    global.__PORTAL_TOPBAR_SIX_ICON_GRID__ = false;
    global.__PORTAL_TOPBAR_LEAD_EXTRAS__ = true;
    var grid = document.getElementById("topbarToolsGrid");
    if (grid) {
      grid.classList.add("topbar-tools-grid--ceo-full");
      grid.classList.add("topbar-tools-grid--lead");
      grid.classList.remove("topbar-tools-grid--eight");
    }
    ["topbarToolsGridLeft", "topbarToolsGridRight"].forEach(function (id) {
      var g = document.getElementById(id);
      if (!g) return;
      g.classList.add("topbar-tools-grid--lead");
      g.classList.remove("topbar-tools-grid--eight", "topbar-tools-grid--ceo-full");
    });
    var leadRow = document.querySelector(".topbar-lead");
    if (leadRow) {
      leadRow.classList.add("topbar-lead--tools-6");
      leadRow.classList.remove("topbar-lead--tools-4", "topbar-lead--tools-8");
    }
    if (typeof global.portalEnableRoutinesPlannerUi === "function") {
      try {
        global.portalEnableRoutinesPlannerUi();
      } catch (_) {}
    }
  }

  global.portalStaffIsCeoTopbarFullAccess = portalStaffIsCeoTopbarFullAccess;

  global.portalSyncTopbarStaffPhoto = function portalSyncTopbarStaffPhoto() {
    portalSyncTopbarProfileCard();
    var img = document.getElementById("topbarStaffPhotoImg");
    var ini = document.getElementById("topbarStaffPhotoInitials");
    if (!img && !ini) return;
    var pending =
      global.dashboardData && global.dashboardData.portalIdentityResolved === false;
    var name = pending ? "" : staffFirstName((global.dashboardData && global.dashboardData.staffName) || "");
    var candidates = resolveStaffPhotoCandidates();
    if (!candidates.length) {
      showStaffPhotoInitials(img, ini, pending, name);
      return;
    }
    applyStaffPhotoUrl(img, ini, candidates, 0, name);
  };

  var TOPBAR_QUICK_MENU_REFS = {
    topbarToolAchievements: "quickMenuParticipantAchievements",
    topbarToolTermReview: "quickMenuStaffTermReview",
    topbarToolLeadTermReview: "quickMenuStaffLeadTermReview",
    topbarToolVenue: "quickMenuWorkVenue",
    topbarToolPickup: "quickMenuDropoffPickup",
    topbarToolLeadReport: "quickMenuLeadFeedbackReport",
  };

  function quickMenuIdForTopbarTool(toolId) {
    if (toolId === "topbarToolSessionsOverview") {
      return global.__PORTAL_TOPBAR_IS_LEAD__
        ? "quickMenuLeadSessionOverview"
        : "quickMenuStaffSessionsOverview";
    }
    return TOPBAR_QUICK_MENU_REFS[toolId] || "";
  }

  function openExternalUrl(url) {
    var u = String(url || "").trim();
    if (!u) return false;
    try {
      // Prefer in-app navigation so PWA / standalone keeps the signed-in session.
      // (window.open on iOS opens Safari with empty storage → login → admin for CEOs.)
      if (typeof global.portalQuickMenuNavigate === "function") {
        global.portalQuickMenuNavigate(u);
        return true;
      }
      global.location.href = new URL(u, global.location.href).href;
      return true;
    } catch (_) {
      try {
        global.location.href = u;
        return true;
      } catch (__ ) {
        return false;
      }
    }
  }

  function triggerQuickMenuButton(quickMenuId) {
    var btn = document.getElementById(quickMenuId);
    if (!btn) return false;
    btn.click();
    return true;
  }

  /** Programme leads + executives on staff shell (not lead_dashboard). */
  function portalStaffHasLeadFieldToolsOnStaffShell() {
    if (portalStaffIsProgrammeLeadTopbar()) return true;
    return portalStaffIsCeoTopbarFullAccess();
  }

  function portalStaffIsAppRoleLead() {
    try {
      if (global.__PORTAL_TOPBAR_IS_LEAD__) return true;
      var profile = (global.__PORTAL_SUPABASE__ || {}).staff_profile;
      return String((profile && profile.app_role) || "")
        .trim()
        .toLowerCase() === "lead";
    } catch (_) {
      return false;
    }
  }

  /** Any app_role lead + programme leads + Victor/Raúl/Javi — inbox photos without picking a participant. */
  global.portalStaffHasLeadPhotoInboxAccess = function portalStaffHasLeadPhotoInboxAccess() {
    if (portalStaffIsAppRoleLead()) return true;
    if (typeof global.portalStaffCanUploadAchievementFromGallery === "function") {
      try {
        if (global.portalStaffCanUploadAchievementFromGallery()) return true;
      } catch (_) {}
    }
    if (portalStaffIsProgrammeLeadTopbar()) return true;
    return portalStaffIsCeoTopbarFullAccess();
  };

  global.portalStaffHasLeadFieldToolsOnStaffShell = portalStaffHasLeadFieldToolsOnStaffShell;

  /**
   * Halo flanks layout:
   *  - 4 session icons: left 2×2; ADMIN right fills matching 2×2
   *  - 5 icons (plan+swim): left 2×2; right Plan (top 2) + ADMIN (bottom 2)
   *  - 6 lead: left Lead|PickUp / Stats|Venue; right Photo|Plan + ADMIN (bottom 2)
   */
  function portalSyncHaloFlankToolPlacement() {
    var left = document.getElementById("topbarToolsGridLeft");
    var right = document.getElementById("topbarToolsGridRight");
    var leadRow = document.querySelector(".topbar-lead--halo-flanks");
    if (!left || !right || !leadRow) return;

    function cell(id) {
      return document.getElementById(id);
    }
    function visible(el) {
      return !!(el && !el.hidden);
    }

    var photo = cell("topbarToolCellAchievements");
    var pickup = cell("topbarToolCellPickup");
    var plan = cell("topbarToolCellSessionPlanner");
    var stats = cell("topbarToolCellSessionsOverview");
    var venue = cell("topbarToolCellVenue");
    var swim = cell("topbarToolCellTermReview");
    var lead = cell("topbarToolCellLeadReport");
    var teamRev = cell("topbarToolCellLeadTermReview");
    var wa = cell("topbarToolCellStaffWa");

    var hasLead = visible(lead);
    var hasStats = visible(stats);
    var hasPlan = visible(plan);
    var hasSwim = visible(swim);
    var mode = "4";
    if (hasLead || hasStats) mode = "6";
    else if (hasPlan && hasSwim) mode = "5";

    leadRow.classList.remove(
      "topbar-lead--flank-4",
      "topbar-lead--flank-5",
      "topbar-lead--flank-6",
    );
    leadRow.classList.add("topbar-lead--flank-" + mode);

    /* Both flanks are always a 2-column tile grid matching the left 2×2. */
    left.classList.add("topbar-tools-grid--flank-2col");
    right.classList.add("topbar-tools-grid--flank-2col");
    right.classList.remove("topbar-tools-grid--flank-stack");
    left.classList.remove("topbar-tools-grid--flank-stack");

    var leftOrder;
    var rightOrder;
    if (mode === "6") {
      /* Swap: Photo+Plan sit above ADMIN; Lead+Stats take their left column. */
      leftOrder = [lead, pickup, stats, venue];
      rightOrder = [photo, plan, wa];
    } else if (mode === "5") {
      leftOrder = [photo, pickup, swim, venue];
      rightOrder = [plan, wa];
    } else if (hasSwim && !hasPlan) {
      leftOrder = [photo, pickup, swim, venue];
      rightOrder = [wa];
    } else {
      leftOrder = [photo, pickup, plan, venue];
      rightOrder = [wa];
    }

    leftOrder.forEach(function (el) {
      if (el) left.appendChild(el);
    });
    rightOrder.forEach(function (el) {
      if (el) right.appendChild(el);
    });
    [photo, pickup, plan, stats, venue, swim, lead, teamRev].forEach(function (el) {
      if (!el) return;
      if (leftOrder.indexOf(el) >= 0 || rightOrder.indexOf(el) >= 0) return;
      left.appendChild(el);
    });
    if (teamRev) left.appendChild(teamRev);
    if (wa) right.appendChild(wa);

    if (plan) {
      plan.classList.toggle("topbar-tool-cell--flank-span2w", mode === "5");
      plan.style.gridColumn = mode === "5" ? "1 / -1" : "";
      plan.style.gridRow = mode === "5" ? "1" : mode === "6" ? "1" : "";
    }
    if (photo) {
      photo.style.gridColumn = "";
      photo.style.gridRow = mode === "6" ? "1" : "";
    }
    if (lead) {
      lead.style.gridColumn = "";
      lead.style.gridRow = "";
    }
    if (stats) {
      stats.style.gridColumn = "";
      stats.style.gridRow = "";
    }
    if (wa) {
      wa.hidden = false;
      wa.setAttribute("aria-hidden", "false");
      wa.classList.add("topbar-tool-cell--staff-wa", "topbar-tool-cell--span2");
      wa.classList.toggle("topbar-tool-cell--flank-admin-4", mode === "4");
      wa.classList.toggle("topbar-tool-cell--flank-admin-2", mode === "5" || mode === "6");
      if (mode === "4") {
        wa.style.gridColumn = "1 / -1";
        wa.style.gridRow = "1 / span 2";
      } else {
        wa.style.gridColumn = "1 / -1";
        wa.style.gridRow = "2";
      }
    }
  }

  global.portalSyncHaloFlankToolPlacement = portalSyncHaloFlankToolPlacement;

  /**
   * Lead shell or programme lead (Berta/John) or exec on staff shell: 6 tools in 2×3.
   * CEOs on staff shell = same lead extras as programme leads.
   */
  global.portalSyncTopbarRoleTools = function portalSyncTopbarRoleTools(opts) {
    opts = opts || {};
    var isLeadShell = !!opts.isLead;
    global.__PORTAL_TOPBAR_IS_LEAD__ = isLeadShell;

    var isCeo = !isLeadShell && portalStaffIsCeoTopbarFullAccess();
    var isProgrammeLead = !isLeadShell && !isCeo && portalStaffIsProgrammeLeadTopbar();
    var swimmingSixGrid =
      !isLeadShell && !isProgrammeLead && !isCeo && !!global.__PORTAL_TOPBAR_SIX_ICON_GRID__;
    var showLeadExtras =
      isLeadShell ||
      isProgrammeLead ||
      isCeo ||
      (swimmingSixGrid && !!global.__PORTAL_TOPBAR_LEAD_EXTRAS__);

    if (isCeo) {
      portalApplyInlineCeoTopbarTools();
    }

    var grid = document.getElementById("topbarToolsGrid");
    var visibleToolCount = countVisibleTopbarToolCells();
    var flankMode = !!(
      document.getElementById("topbarToolsGridLeft") ||
      document.getElementById("topbarToolsGridRight")
    );
    var catalogGrid =
      flankMode ||
      (grid && grid.classList.contains("topbar-tools-grid--catalog"));
    var useEightGrid = !isCeo && !flankMode && visibleToolCount >= 7;
    var useSixGrid =
      !isCeo && !useEightGrid && (catalogGrid || showLeadExtras || visibleToolCount > 3 || flankMode);

    function applyGridMode(g) {
      if (!g) return;
      g.classList.toggle("topbar-tools-grid--eight", useEightGrid);
      g.classList.toggle("topbar-tools-grid--lead", useSixGrid || flankMode);
      g.classList.toggle(
        "topbar-tools-grid--dense",
        (useSixGrid || flankMode) && visibleToolCount >= 4
      );
      g.classList.remove("topbar-tools-grid--ceo-full");
    }

    if (!isCeo) {
      applyGridMode(grid);
      applyGridMode(document.getElementById("topbarToolsGridLeft"));
      applyGridMode(document.getElementById("topbarToolsGridRight"));
    }
    var leadRow = document.querySelector(".topbar-lead");
    if (leadRow && !isCeo) {
      leadRow.classList.toggle("topbar-lead--tools-8", useEightGrid);
      leadRow.classList.toggle("topbar-lead--tools-6", useSixGrid);
      leadRow.classList.toggle("topbar-lead--tools-4", !useSixGrid && !useEightGrid);
    }

    if (isCeo && typeof global.portalSyncCeoFullTopbarTools === "function") {
      global.portalSyncCeoFullTopbarTools();
    }
    portalSyncTopbarToolsGridLayout();
    try {
      portalSyncHaloFlankToolPlacement();
    } catch (_flank) {}
    try {
      if (typeof global.portalStaffWaSyncPlacement === "function") {
        global.portalStaffWaSyncPlacement();
      }
    } catch (_waPlace) {}
    try {
      portalSyncHaloFlankToolPlacement();
    } catch (_flank2) {}
  };

  global.portalStaffIsProgrammeLeadTopbar = portalStaffIsProgrammeLeadTopbar;
  global.portalSyncTopbarProfileCard = portalSyncTopbarProfileCard;
  global.resolveTopbarStaffKey = resolveTopbarStaffKey;

  var STAFF_PHOTO_CHANGE_MSG =
    "This photo is visible to participants and their families.\n\n" +
    "Choose a professional photo you are happy to share.\n\nContinue to select a new photo?";

  function setStaffPhotoEditBusy(busy) {
    var btn = document.getElementById("topbarStaffPhotoEdit");
    if (!btn) return;
    btn.classList.toggle("is-busy", !!busy);
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function applyUploadedStaffPhotoUrl(publicUrl) {
    var url = String(publicUrl || "").trim();
    if (!url) return;
    global.__PORTAL_STAFF_SELF_AVATAR_URL__ = url;
    try {
      if (typeof global.portalSyncTopbarStaffPhoto === "function") {
        global.portalSyncTopbarStaffPhoto();
      }
    } catch (_) {}
  }

  global.portalInitTopbarStaffPhotoChange = function portalInitTopbarStaffPhotoChange() {
    if (document.body.getAttribute("data-portal-topbar-photo-change-bound") === "1") return;
    var editBtn = document.getElementById("topbarStaffPhotoEdit");
    var fileInput = document.getElementById("topbarStaffPhotoInput");
    if (!editBtn || !fileInput) return;
    document.body.setAttribute("data-portal-topbar-photo-change-bound", "1");

    editBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!global.confirm(STAFF_PHOTO_CHANGE_MSG)) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (!String(file.type || "").startsWith("image/")) {
        global.alert("Please choose an image file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        global.alert("Photo must be 5 MB or smaller.");
        return;
      }
      setStaffPhotoEditBusy(true);
      import("/portal/auth-handler.js?v=20260614-avatar-uid")
        .then(function (mod) {
          if (!mod || typeof mod.uploadStaffAvatar !== "function") {
            throw new Error("Photo upload is not available.");
          }
          return mod.uploadStaffAvatar(file);
        })
        .then(function (result) {
          applyUploadedStaffPhotoUrl(result && result.publicUrl);
        })
        .catch(function (err) {
          var msg =
            err && err.message
              ? String(err.message)
              : "Could not upload photo. Try again or contact the office.";
          global.alert(msg);
        })
        .finally(function () {
          setStaffPhotoEditBusy(false);
        });
    });
  };

  global.portalInitTopbarToolsGrid = function portalInitTopbarToolsGrid(opts) {
    opts = opts || {};
    global.__PORTAL_TOPBAR_IS_LEAD__ = !!opts.isLead;
    if (document.body.getAttribute("data-portal-topbar-tools-bound") === "1") return;
    document.body.setAttribute("data-portal-topbar-tools-bound", "1");

    document.addEventListener(
      "click",
      function (e) {
        var participantsBtn = e.target.closest ? e.target.closest("#topbarToolParticipants") : null;
        if (participantsBtn) {
          e.preventDefault();
          if (typeof global.openSheet === "function") {
            global.openSheet("clientsSheet");
          }
          if (typeof global.setClientsSheetTab === "function") {
            global.setClientsSheetTab(opts.isLead ? "all" : "my");
          }
          return;
        }

        /* Only real tool <button>s — never cells. Matching #topbarToolCellStaffWa
           in capture phase was swallowing ADMIN clicks before its own listener. */
        if (
          e.target.closest &&
          (e.target.closest("#topbarStaffWaBtn") ||
            e.target.closest("#topbarToolCellStaffWa") ||
            e.target.closest(".topbar-tool-cell--staff-wa"))
        ) {
          return;
        }
        var toolBtn = e.target.closest ? e.target.closest("button[id^='topbarTool']") : null;
        if (!toolBtn || !toolBtn.id) return;
        if (
          toolBtn.disabled ||
          toolBtn.classList.contains("topbar-tool-btn--inactive") ||
          toolBtn.getAttribute("aria-disabled") === "true"
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();

        if (toolBtn.id === "topbarToolSessionPlanner") {
          if (typeof global.portalOpenRoutinesPlanner === "function") {
            void Promise.resolve(global.portalOpenRoutinesPlanner()).then(function (ok) {
              if (ok) return;
              var routinesUrl = String(global.ROUTINES_PLANNER_URL || "").trim();
              if (routinesUrl) openExternalUrl(routinesUrl);
            });
            return;
          }
          var routinesUrl = String(global.ROUTINES_PLANNER_URL || "").trim();
          if (routinesUrl) {
            openExternalUrl(routinesUrl);
            return;
          }
          if (typeof global.openSheet === "function") {
            global.openSheet(
              global.__PORTAL_TOPBAR_IS_LEAD__ ? "leadSessionPlanSheet" : "staffSessionPlanSheet",
            );
          }
          return;
        }

        var quickId = quickMenuIdForTopbarTool(toolBtn.id);
        if (quickId && triggerQuickMenuButton(quickId)) return;

        var ext = toolBtn.getAttribute("data-portal-external-url");
        if (ext) openExternalUrl(ext);
      },
      true
    );
  };

  function portalResyncTopbarAfterIdentity() {
    try {
      if (typeof global.portalResyncPlannerToolsAfterIdentity === "function") {
        global.portalResyncPlannerToolsAfterIdentity();
      }
    } catch (_) {}
    try {
      if (typeof global.portalSyncTopbarRoleTools === "function") {
        global.portalSyncTopbarRoleTools({ isLead: !!global.__PORTAL_TOPBAR_IS_LEAD__ });
      }
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      global.portalSyncTopbarStaffPhoto();
      global.portalInitTopbarStaffPhotoChange();
    });
  } else {
    global.portalSyncTopbarStaffPhoto();
    global.portalInitTopbarStaffPhotoChange();
  }

  global.addEventListener("portal:supabase-ready", portalResyncTopbarAfterIdentity);
  global.addEventListener("portal:staff-deferred-dashboard-ready", portalResyncTopbarAfterIdentity);
})(typeof window !== "undefined" ? window : globalThis);
