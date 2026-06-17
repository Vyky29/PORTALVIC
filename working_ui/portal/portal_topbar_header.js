/**
 * Topbar worker photo + shortcut grid (staff 2×N, lead 2×3).
 */
(function (global) {
  "use strict";

  /** Programme leads — 6-icon grid on staff or lead shell (not CEOs on staff). */
  var PROGRAMME_LEAD_TOPBAR_KEYS = { berta: true, john: true, michelle: true };

  var LEAD_TOPBAR_CELL_IDS = [
    "topbarToolCellLeadReport",
    "topbarToolCellSessionsOverview",
  ];
  var LEAD_TOPBAR_BTN_IDS = [
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
    var urls = [];
    function push(raw) {
      var u = normalizeStaffPhotoUrl(raw);
      if (u && urls.indexOf(u) < 0) urls.push(u);
    }
    function pushRemote(raw) {
      var u = raw;
      try {
        if (typeof global.portalSanitizeRemoteAvatarUrl === "function") {
          u = global.portalSanitizeRemoteAvatarUrl(raw);
        }
      } catch (_) {}
      push(u);
    }
    try {
      if (global.__PORTAL_STAFF_SELF_AVATAR_URL__) pushRemote(global.__PORTAL_STAFF_SELF_AVATAR_URL__);
      var box = global.__PORTAL_SUPABASE__ || {};
      var user = box.session && box.session.user;
      var meta = user && user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      if (meta.avatar_url) pushRemote(meta.avatar_url);
    } catch (_) {}
    try {
      var dd = global.dashboardData;
      if (dd && dd.avatarFile && !isRemoteStaffPhotoUrl(dd.avatarFile)) {
        push(dd.avatarFile);
        push(swapStaffPhotoExtension(dd.avatarFile, "png"));
        push(swapStaffPhotoExtension(dd.avatarFile, "jpg"));
      }
      var key = resolveTopbarStaffKey();
      var src = global.STAFF_DASHBOARD_SOURCE;
      if (key && src && src.staffProfiles && src.staffProfiles[key]) {
        var af = src.staffProfiles[key].avatarFile;
        if (af) {
          push(af);
          push(swapStaffPhotoExtension(af, "png"));
          push(swapStaffPhotoExtension(af, "jpg"));
        }
      }
      if (
        key &&
        (!global.portalStaffPhotoKeyAllowed || global.portalStaffPhotoKeyAllowed(key))
      ) {
        var base = staffPhotosBaseFromSource();
        if (base.charAt(base.length - 1) !== "/") base += "/";
        push(base + key + ".png");
        push(base + key + ".jpg");
        push(base + key + ".jpeg");
        push(base + key + ".webp");
      }
    } catch (_) {}
    return urls;
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
    if (!card) return;
    card.setAttribute("data-gender", resolveTopbarStaffGender());
    var key = resolveTopbarStaffKey();
    if (key) card.setAttribute("data-staff-key", key);
    else card.removeAttribute("data-staff-key");
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

  function countVisibleTopbarToolCells() {
    var grid = document.getElementById("topbarToolsGrid");
    if (!grid) return 0;
    var cells = grid.querySelectorAll(".topbar-tool-cell");
    var n = 0;
    for (var i = 0; i < cells.length; i++) {
      if (!cells[i].hidden) n++;
    }
    return n;
  }

  function canonicalTopbarStaffKey(value) {
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
      if (typeof global.portalInferStaffKey === "function") {
        return canonicalTopbarStaffKey(
          global.portalInferStaffKey(profile, user && user.email),
        );
      }
      if (profile && profile.username) {
        return canonicalTopbarStaffKey(profile.username);
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
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = (box.session && box.session.user && box.session.user.email) || "";
      if (typeof global.portalCanAccessCeoDashboard === "function") {
        return !!global.portalCanAccessCeoDashboard(profile, email);
      }
      if (typeof global.__portalCanAccessCeoDashboard === "function") {
        return !!global.__portalCanAccessCeoDashboard(profile, email);
      }
      var key = "";
      if (typeof global.portalInferStaffKey === "function") {
        key = String(global.portalInferStaffKey(profile, email) || "")
          .trim()
          .toLowerCase();
      }
      return key === "victor" || key === "javi" || key === "raul";
    } catch (_) {
      return false;
    }
  }

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
      global.location.href = u;
      return true;
    } catch (_) {
      return false;
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

  /** Programme leads + Victor/Raúl/Javi — lead-style session photos (Inbox, org-wide picker). */
  global.portalStaffHasLeadPhotoInboxAccess = function portalStaffHasLeadPhotoInboxAccess() {
    if (portalStaffIsProgrammeLeadTopbar()) return true;
    return portalStaffIsCeoTopbarFullAccess();
  };

  global.portalStaffHasLeadFieldToolsOnStaffShell = portalStaffHasLeadFieldToolsOnStaffShell;

  /**
   * Lead shell or programme lead (Berta/John) or exec on staff shell: 6 tools in 2×3.
   * CEOs on staff shell = same lead extras as programme leads.
   */
  global.portalSyncTopbarRoleTools = function portalSyncTopbarRoleTools(opts) {
    opts = opts || {};
    var isLeadShell = !!opts.isLead;
    global.__PORTAL_TOPBAR_IS_LEAD__ = isLeadShell;

    var isProgrammeLead = !isLeadShell && portalStaffHasLeadFieldToolsOnStaffShell();
    var swimmingSixGrid =
      !isLeadShell && !isProgrammeLead && !!global.__PORTAL_TOPBAR_SIX_ICON_GRID__;
    var showLeadExtras =
      isLeadShell ||
      isProgrammeLead ||
      (swimmingSixGrid && !!global.__PORTAL_TOPBAR_LEAD_EXTRAS__);

    LEAD_TOPBAR_CELL_IDS.forEach(function (id) {
      setElementVisible(id, showLeadExtras);
    });
    LEAD_TOPBAR_BTN_IDS.forEach(function (id) {
      setElementVisible(id, showLeadExtras);
    });

    var visibleToolCount = countVisibleTopbarToolCells();
    var useEightGrid = visibleToolCount >= 7;
    var useSixGrid = !useEightGrid && (showLeadExtras || visibleToolCount > 3);

    var grid = document.getElementById("topbarToolsGrid");
    if (grid) {
      grid.classList.toggle("topbar-tools-grid--eight", useEightGrid);
      grid.classList.toggle("topbar-tools-grid--lead", useSixGrid);
      grid.classList.remove("topbar-tools-grid--ceo-full");
    }
    var leadRow = document.querySelector(".topbar-lead");
    if (leadRow) {
      leadRow.classList.toggle("topbar-lead--tools-8", useEightGrid);
      leadRow.classList.toggle("topbar-lead--tools-6", useSixGrid);
      leadRow.classList.toggle("topbar-lead--tools-4", !useSixGrid && !useEightGrid);
    }

    var isCeo = portalStaffIsCeoTopbarFullAccess();
    if (isCeo && !isLeadShell && !isProgrammeLead && typeof global.portalSyncCeoFullTopbarTools === "function") {
      global.portalSyncCeoFullTopbarTools();
    }
  };

  global.portalStaffIsProgrammeLeadTopbar = portalStaffIsProgrammeLeadTopbar;
  global.portalSyncTopbarProfileCard = portalSyncTopbarProfileCard;

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

        var toolBtn = e.target.closest ? e.target.closest("[id^='topbarTool']") : null;
        if (!toolBtn || !toolBtn.id) return;
        e.preventDefault();
        e.stopPropagation();

        if (toolBtn.id === "topbarToolSessionPlanner") {
          if (typeof global.portalOpenRoutinesPlanner === "function") {
            void global.portalOpenRoutinesPlanner();
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      global.portalSyncTopbarStaffPhoto();
      global.portalInitTopbarStaffPhotoChange();
    });
  } else {
    global.portalSyncTopbarStaffPhoto();
    global.portalInitTopbarStaffPhotoChange();
  }
})(typeof window !== "undefined" ? window : globalThis);
