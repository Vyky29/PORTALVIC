/**
 * Lead dashboard ? staff directory in internal chat (WhatsApp-style contact list).
 */
(function (global) {
  "use strict";

  var CACHE_KEY_STAFF = "__PORTAL_LEAD_STAFF_DIRECTORY_ROWS__";
  var CACHE_KEY_CSTEAM = "__PORTAL_LEAD_CSTEAM_DIRECTORY_ROWS__";
  var CACHE_KEY_LEADS = "__PORTAL_STAFF_LEADS_DIRECTORY_ROWS__";
  var CACHE_KEY_DIRECTORS = "__PORTAL_STAFF_DIRECTORS_DIRECTORY_ROWS__";
  var CACHE_KEY_STAFFMGMT = "__PORTAL_STAFF_MGMT_DIRECTORY_ROWS__";
  var CACHE_KEY_CEO_EXEC = "__PORTAL_STAFF_CEO_EXEC_DIRECTORY_ROWS__";
  var STAFF_MGMT_GROUP_SLUG = "ceo_liaison";
  var STAFF_MGMT_GROUP_LABEL = "Directors (group)";
  var STAFF_POOL_GROUPS = [
    { slug: "swimming_instructors", label: "Swimming Instructors", appRole: "staff", staffRole: "swimming" },
    { slug: "climbing_instructors", label: "Climbing Instructors", appRole: "staff", staffRole: "climbing" },
    { slug: "support_staff", label: "Support Staff", appRole: "staff", staffRole: "support" },
    { slug: "pool_leads", label: "Leads", appRole: "lead" },
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function profileNameParts(row) {
    var parts = String((row && row.full_name) || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      username: normKey(row && row.username),
      first: normKey(parts[0] || ""),
      last: normKey(parts.length > 1 ? parts[parts.length - 1] : ""),
      full: normKey((row && row.full_name) || ""),
    };
  }

  function profileRow(prof) {
    return prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  /** staff_dashboard.html — workers use Admin-only chat, not the lead directory UI. */
  function portalStaffOnWorkerDashboard() {
    try {
      return /staff_dashboard\.html/i.test(String((typeof location !== "undefined" && location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  function portalStaffOnLeadDashboard() {
    try {
      return /lead_dashboard\.html/i.test(String((typeof location !== "undefined" && location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  /** Full messenger inbox (search, staff directory, calls) - lead, admin, CEO on any portal. */
  function portalStaffHasFullMessengerAccess(prof) {
    var row = profileRow(prof);
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "lead" || ar === "admin" || ar === "ceo") return true;
    try {
      var path = String((typeof location !== "undefined" && location.pathname) || "");
      if (/lead_dashboard\.html|admin_dashboard\.html|ceo_dashboard\.html/i.test(path)) {
        return true;
      }
    } catch (_e) {}
    // On staff_dashboard, only app_role lead gets lead inbox — ignore dashboard_route (avoids flash).
    if (portalStaffOnWorkerDashboard()) return false;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr === "lead_dashboard.html" || dr === "admin_dashboard.html" || dr === "ceo_dashboard.html") {
      return true;
    }
    return false;
  }

  function portalStaffIsLeadUser(prof) {
    return portalStaffHasFullMessengerAccess(prof);
  }

  /** Session lead (app_role lead, or non-mgmt user on lead dashboard). */
  function portalStaffIsSessionLead(prof) {
    var row = profileRow(prof);
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "lead") return true;
    if (ar === "admin" || ar === "ceo") return false;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr === "lead_dashboard.html") return true;
    return portalStaffOnLeadDashboard();
  }

  /** Admin / director CS Cliq (full inbox) — not session-lead simplified UI. */
  function portalStaffIsManagementMessenger(prof) {
    prof = profileRow(prof);
    if (global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.isManagementProfile === "function") {
      return global.portalCsCliqHubRoles.isManagementProfile(prof);
    }
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmUsesAdminCliq === "function") {
      return global.portalDmRoles.portalDmUsesAdminCliq(prof);
    }
    var ar = String(prof.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  /** Session leads: Admin + assigned groups + meetings only (UI). */
  function portalStaffHasLeadRestrictedInbox(prof) {
    if (
      global.portalAdminSurfaceMap &&
      typeof global.portalAdminSurfaceMap.shouldUseSimplifiedInbox === "function" &&
      !global.portalAdminSurfaceMap.shouldUseSimplifiedInbox(prof)
    ) {
      return false;
    }
    if (portalStaffIsManagementMessenger(prof)) return false;
    if (portalStaffIsCeoTrioOnWorkerDashboard(prof)) return false;
    return portalStaffIsSessionLead(prof);
  }

  var SIMPLIFIED_SUPPORT_MEETINGS_LABEL = "Support & meetings";

  var STAFF_SIMPLIFIED_TABS = [
    { id: "admin", label: "Admin", icon: "brand", theme: "admin" },
    { id: "support", label: SIMPLIFIED_SUPPORT_MEETINGS_LABEL, icon: "support", theme: "support" },
  ];

  var LEAD_SIMPLIFIED_TABS = [
    { id: "admin", label: "Admin", icon: "brand", theme: "admin" },
    { id: "groups", label: "My team", icon: "users", theme: "groups" },
    {
      id: "meetings",
      label: SIMPLIFIED_SUPPORT_MEETINGS_LABEL,
      icon: "support",
      theme: "support",
    },
  ];

  var SIMPLIFIED_SUPPORT_MEETINGS_HINT =
    "Not a separate chat — pick a request type here. Management replies in your <strong>Admin</strong> thread above.";

  var LEAD_SIMPLIFIED_SUPPORT_MEETINGS_HINT =
    SIMPLIFIED_SUPPORT_MEETINGS_HINT +
    " For someone on your programme team, use <strong>Support worker concern</strong> or <strong>Meeting about a support worker</strong>.";

  function leadSupportMeetingsSections() {
    return [
      {
        heading: "Support requests",
        items: [
          { type: "urgent_callback", label: "Urgent call back", icon: "phone" },
          { type: "participant_concern", label: "Participant concern", icon: "user" },
          { type: "safeguarding", label: "Safeguarding concern", icon: "shield" },
          {
            type: "staff_issue",
            label: "Support worker concern",
            requestLabel: "Support worker concern",
            icon: "users",
          },
          { type: "other", label: "Need help", icon: "support" },
        ],
      },
      {
        heading: "Meeting requests",
        items: [
          {
            type: "meeting_request",
            label: "Video meeting with Management",
            requestLabel: "Video meeting request",
            icon: "video",
          },
          {
            type: "meeting_request",
            label: "Voice call with Management",
            requestLabel: "Voice call request",
            icon: "phone",
          },
          {
            type: "meeting_request",
            label: "Meeting about a support worker",
            requestLabel: "Support worker meeting request",
            icon: "users",
          },
          {
            type: "other",
            label: "Follow-up or check-in",
            requestLabel: "Follow-up meeting request",
            icon: "calendar",
          },
        ],
      },
    ];
  }

  function simplifiedTabIconSvg(icon) {
    if (icon === "brand" || icon === "logo") {
      if (
        global.portalDmThreadAvatar &&
        typeof global.portalDmThreadAvatar.adminLaneBrandLogoImgHtml === "function"
      ) {
        return global.portalDmThreadAvatar.adminLaneBrandLogoImgHtml(esc);
      }
      var src =
        (global.PORTAL_BRAND_LOGO_SRC && String(global.PORTAL_BRAND_LOGO_SRC)) || "/portal/F-02-1.png";
      return (
        '<img class="portal-cs-cliq-inbox-acc__brand-logo" src="' +
        esc(src) +
        '" alt="" width="18" height="18" decoding="async" referrerpolicy="no-referrer-when-downgrade" onerror="typeof portalBrandLogoOnError===\'function\'?portalBrandLogoOnError(this):(this.onerror=null,this.src=\'/portal/portal_crest.svg\')" />'
      );
    }
    var svgOpen =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">';
    if (icon === "users") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>' +
        "</svg>"
      );
    }
    if (icon === "calendar") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14v11zM7 11h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"/>' +
        "</svg>"
      );
    }
    if (icon === "support") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>' +
        "</svg>"
      );
    }
    return (
      svgOpen +
      '<path fill="currentColor" d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5L12 2zm0 2.18 6 2.25V11.1c0 3.78-2.55 7.32-6 8.35-3.45-1.03-6-4.57-6-8.35V6.43l6-2.25z"/>' +
      "</svg>"
    );
  }

  function supportOptionIconClass(iconKey) {
    var key = String(iconKey || "support")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    if (!key) key = "support";
    return "portal-cs-cliq-support-opt__ico portal-cs-cliq-support-opt__ico--" + key;
  }

  function resolveSupportOptionIcon(item) {
    if (!item) return "support";
    if (item.icon) return String(item.icon);
    var type = String(item.type || "other");
    var label = String(item.label || "").toLowerCase();
    if (type === "urgent_callback") return "phone";
    if (type === "participant_concern") return "user";
    if (type === "safeguarding") return "shield";
    if (type === "staff_issue") return "users";
    if (type === "meeting_request") {
      if (label.indexOf("video") >= 0) return "video";
      if (label.indexOf("voice") >= 0) return "phone";
      return "calendar";
    }
    if (label.indexOf("support worker") >= 0) return "users";
    if (label.indexOf("follow") >= 0 || label.indexOf("check-in") >= 0) return "calendar";
    if (label.indexOf("briefing") >= 0) return "user";
    return "support";
  }

  function supportOptionIconSvg(iconKey) {
    var key = String(iconKey || "support");
    if (key === "shield" || key === "users" || key === "calendar" || key === "support") {
      return simplifiedTabIconSvg(key);
    }
    var svgOpen =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">';
    if (key === "phone") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>' +
        "</svg>"
      );
    }
    if (key === "user") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
        "</svg>"
      );
    }
    if (key === "video") {
      return (
        svgOpen +
        '<path fill="currentColor" d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>' +
        "</svg>"
      );
    }
    return simplifiedTabIconSvg("support");
  }

  function portalStaffIsStaffUser(prof) {
    var row = profileRow(prof);
    if (portalStaffIsLeadUser(row)) return false;
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "staff") return true;
    if (ar === "admin" || ar === "ceo") return false;
    var sr = String(row.staff_role || "").toLowerCase();
    return !!(sr && sr !== "manager" && sr !== "admin");
  }

  function portalStaffHasPeerDirectory(prof) {
    if (portalStaffHasLeadRestrictedInbox(prof)) return false;
    if (portalStaffOnWorkerDashboard()) return false;
    if (portalStaffIsCeoTrioOnWorkerDashboard(prof)) return true;
    if (portalStaffIsManagementMessenger(prof)) return true;
    return false;
  }

  function staffInitiatePeer(row) {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmStaffInitiatePeer === "function") {
      return global.portalDmRoles.portalDmStaffInitiatePeer(row);
    }
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function portalStaffIsCeoTrioOnWorkerDashboard(prof) {
    if (!portalStaffOnWorkerDashboard()) return false;
    prof = profileRow(prof);
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function"
    ) {
      return global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(prof);
    }
    return String(prof.app_role || "").toLowerCase() === "ceo";
  }

  function isExecutiveTrio(prof) {
    prof = profileRow(prof);
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function"
    ) {
      return global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(prof);
    }
    var ar = String(prof.app_role || "").toLowerCase();
    var u = normKey(prof.username);
    return ar === "ceo" && (u === "raul" || u === "victor" || u === "javi");
  }

  function getDirectoryMode(prof) {
    if (portalStaffHasLeadRestrictedInbox(prof)) return "";
    if (portalStaffOnLeadDashboard() && isExecutiveTrio(prof)) return "csteam";
    if (portalStaffIsCeoTrioOnWorkerDashboard(prof)) return "ceo_exec";
    if (portalStaffIsManagementMessenger(prof)) return "csteam";
    return "";
  }

  /** Staff worker inbox/DM peers: ops admin only (no director list). */
  function portalStaffWorkerMgmtPeerAllowed(row) {
    if (!row || row.is_active === false) return false;
    return String(row.app_role || "").toLowerCase() === "admin";
  }

  function directoryCacheKey(mode) {
    if (mode === "leads") return CACHE_KEY_LEADS;
    if (mode === "directors") return CACHE_KEY_DIRECTORS;
    if (mode === "staffmgmt") return CACHE_KEY_STAFFMGMT;
    if (mode === "ceo_exec") return CACHE_KEY_CEO_EXEC;
    if (mode === "csteam") return CACHE_KEY_CSTEAM;
    return CACHE_KEY_STAFF;
  }

  function isDirectoryTab(tab) {
    tab = String(tab || "").toLowerCase();
    return tab === "staff" || tab === "leads" || tab === "directors" || tab === "directory";
  }

  function portalStaffIsRestrictedWorkerChat(prof) {
    var row = profileRow(prof);
    if (portalStaffIsLeadUser(row)) return false;
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "staff") return true;
    if (ar === "admin" || ar === "ceo") return false;
    var sr = String(row.staff_role || "").toLowerCase();
    if (sr && sr !== "manager" && sr !== "admin") return true;
    // Profile not hydrated yet on staff dashboard → worker Admin chat (avoids lead inbox flash).
    if (!ar && !sr && portalStaffOnWorkerDashboard()) return true;
    return false;
  }

  function peerLabelFromRow(row) {
    if (!row) return "";
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.inboxPeerLabel === "function"
    ) {
      var inbox = global.portalChatActorIdentity.inboxPeerLabel(row);
      if (inbox) return inbox;
    }
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.profilePeerLabel === "function"
    ) {
      var label = global.portalChatActorIdentity.profilePeerLabel(row);
      if (label) return label;
    }
    return String(row.full_name || row.username || "").trim();
  }

  var CSTEAM_SECTIONS = [
    { key: "ceo", label: "CEO", icon: "crown" },
    { key: "admin", label: "Admin", icon: "brand" },
    { key: "lead", label: "Leads", icon: "users" },
    { key: "staff", label: "Staff", icon: "user" },
  ];

  var STAFF_MGMT_SECTIONS = [
    { key: "admin", label: "Admin" },
    { key: "ceo", label: "Directors" },
    { key: "group", label: "Group" },
  ];

  var STAFF_MGMT_CEO_SLOTS = [
    { slot: "raul", hint: "Raul" },
    { slot: "victor", hint: "Victor" },
    { slot: "javi", hint: "Javi" },
  ];

  var STAFF_CEO_EXEC_PEER_SLOTS = [
    { slot: "raul", hint: "Raul" },
    { slot: "javi", hint: "Javi" },
    { slot: "victor", hint: "Victor" },
  ];

  var STAFF_CEO_EXEC_GROUPS = [
    { slug: "all_ceos", label: "Raul & Javi" },
    { slug: "ceo_liaison", label: "Raul, Javi & Sevitha" },
  ];

  function normalizeStaffRoleKey(sr) {
    return String(sr || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function peerRoleChipLabel(row) {
    if (!row) return "Team";
    var ar = String(row.app_role || "").toLowerCase();
    var sr = normalizeStaffRoleKey(row.staff_role);
    if (ar === "ceo") return "CEO";
    if (ar === "admin") return "Admin";
    if (ar === "lead") return "Session Lead";
    if (sr === "manager") return "Manager";
    if (sr === "swimming") return "Swimming Instructor";
    if (sr === "climbing") return "Climbing Instructor";
    if (sr === "fitness") return "Fitness Instructor";
    if (sr === "support_lead" || sr === "supportlead") return "Support Worker (Lead)";
    if (sr === "support") return "Support Worker";
    if (sr === "admin") return "Admin";
    if (sr) {
      return sr
        .split("_")
        .filter(Boolean)
        .map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(" ");
    }
    if (ar === "staff") return "Staff";
    return "Team";
  }

  function directoryCategoryKey(row) {
    if (!row) return "staff";
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "ceo") return "ceo";
    if (ar === "admin") return "admin";
    if (ar === "lead") return "lead";
    return "staff";
  }

  function roleChipClassForProfile(row) {
    return "portal-dm-role-chip--" + staffRoleChipKeyFromProfile(row);
  }

  function staffRoleChipKeyFromProfile(row) {
    if (!row) return "staff";
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "ceo") return "ceo";
    if (ar === "admin") return "admin";
    if (ar === "lead") return "lead";
    var sr = normalizeStaffRoleKey(row.staff_role);
    if (sr === "manager") return "manager";
    if (sr === "swimming") return "swimming";
    if (sr === "climbing") return "climbing";
    if (sr === "fitness") return "fitness";
    if (sr === "support_lead" || sr === "supportlead") return "support_lead";
    if (sr === "support") return "support";
    return "staff";
  }

  function normalizeStaffAvatarUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) {
      if (typeof global.portalSanitizeRemoteAvatarUrl === "function") {
        return global.portalSanitizeRemoteAvatarUrl(u);
      }
      return u;
    }
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    if (typeof global.portalSanitizeRemoteAvatarUrl === "function") {
      return global.portalSanitizeRemoteAvatarUrl(u);
    }
    return u;
  }

  function directoryRowFromProfile(row, me) {
    var id = String(row.id || "").trim();
    if (!id || id.toLowerCase() === String(me).toLowerCase()) return null;
    var label = peerLabelFromRow(row);
    if (!label) return null;
    return {
      id: id,
      label: label,
      username: String(row.username || "").trim(),
      avatarUrl: normalizeStaffAvatarUrl(row.avatar_url),
      role: peerRoleChipLabel(row),
      staffRoleKey: staffRoleChipKeyFromProfile(row),
      category: directoryCategoryKey(row),
      sortKey: normKey(label),
    };
  }

  function roleSubtitle(row) {
    return peerRoleChipLabel(row);
  }

  function initialsFromLabel(label) {
    var parts = String(label || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getSearchInput() {
    return document.getElementById("internalChatLeadSearch");
  }

  function getSearchQuery() {
    var search = getSearchInput();
    return String((search && search.value) || "").trim();
  }

  function matchesSearchQuery(label, query) {
    var q = normKey(query);
    if (!q) return true;
    return normKey(label).indexOf(q) >= 0;
  }

  function syncSearchClearBtn() {
    var search = getSearchInput();
    var clearBtn = document.getElementById("internalChatLeadSearchClear");
    if (!clearBtn) return;
    var has = !!(search && String(search.value || "").trim());
    clearBtn.hidden = !has;
    clearBtn.setAttribute("aria-hidden", has ? "false" : "true");
  }

  function roleChipHtml(label, category, staffRoleKey) {
    var chipKey = staffRoleKey || category || "staff";
    return (
      '<span class="portal-dm-role-chip portal-dm-role-chip--' +
      esc(chipKey) +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function staffDirectoryAvatarHtml(row) {
    var label = String((row && row.label) || "").trim();
    var avatarUrl = normalizeStaffAvatarUrl(row && row.avatarUrl);
    if (avatarUrl) {
      var initials = esc(initialsFromLabel(label));
      return (
        '<span class="portal-dm-staff-directory-avatar portal-dm-staff-directory-avatar--photo" aria-hidden="true">' +
        initials +
        '<img class="portal-dm-staff-directory-avatar__img" src="' +
        esc(avatarUrl) +
        '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.remove();var p=this.parentElement;if(p)p.classList.remove(\'portal-dm-staff-directory-avatar--photo\');" />' +
        "</span>"
      );
    }
    if (global.portalStaffAvatarInnerHtml) {
      return global.portalStaffAvatarInnerHtml((row && row.username) || label, {
        esc: esc,
        displayName: label,
        className: "portal-dm-staff-directory-avatar",
        imgClass: "portal-dm-staff-directory-avatar__img",
      });
    }
    return (
      '<span class="portal-dm-staff-directory-avatar" aria-hidden="true">' +
      esc(initialsFromLabel(label)) +
      "</span>"
    );
  }

  function csteamSectionIconHtml(iconName) {
    if (iconName === "brand" || iconName === "logo") {
      if (
        global.portalDmThreadAvatar &&
        typeof global.portalDmThreadAvatar.adminLaneBrandLogoImgHtml === "function"
      ) {
        return global.portalDmThreadAvatar.adminLaneBrandLogoImgHtml(
          esc,
          "portal-dm-csteam-accordion__brand-logo"
        );
      }
      return simplifiedTabIconSvg("brand");
    }
    if (global.portalDmIcons && typeof global.portalDmIcons.svg === "function") {
      return global.portalDmIcons.svg(iconName || "user", "portal-dm-csteam-accordion__ico-svg");
    }
    return "";
  }

  function csteamAccordionSummaryHtml(section, sectionRows) {
    return (
      '<span class="portal-dm-csteam-accordion__icon portal-dm-csteam-accordion__icon--' +
      esc(section.key || "staff") +
      '" aria-hidden="true">' +
      csteamSectionIconHtml(section.icon) +
      '</span><span class="portal-dm-csteam-accordion__label">' +
      esc(section.label) +
      '</span><span class="portal-dm-csteam-accordion__count">' +
      esc(String(sectionRows.length)) +
      '</span><span class="portal-dm-csteam-accordion__chev" aria-hidden="true"></span>'
    );
  }

  function staffDirectoryItemHtml(row) {
    var chips = roleChipHtml(row.role, row.category, row.staffRoleKey);
    if (row.attachAdmin) {
      chips += '<span class="portal-dm-role-chip portal-dm-role-chip--admin">+ Admin</span>';
    }
    return (
      staffDirectoryAvatarHtml(row) +
      '<span class="portal-dm-staff-directory-copy">' +
      '<span class="portal-dm-staff-directory-name">' +
      esc(row.label) +
      "</span>" +
      chips +
      "</span>"
    );
  }

  function appendStaffRowsToList(host, rows) {
    if (!host) return;
    rows.forEach(function (r) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-dm-staff-directory-item";
      btn.setAttribute("role", "listitem");
      if (r.kind === "group") {
        btn.setAttribute("data-staff-group", String(r.groupSlug || r.groupId || ""));
        btn.innerHTML = staffDirectoryItemHtml(r);
        btn.addEventListener("click", function () {
          void openGroupChat(r);
        });
      } else {
        btn.setAttribute("data-staff-peer", r.id);
        btn.innerHTML = staffDirectoryItemHtml(r);
        btn.addEventListener("click", function () {
          void openPeerChat(r.id);
        });
      }
      host.appendChild(btn);
    });
  }

  function appendStaffRows(host, rows) {
    if (!host) return;
    host.innerHTML = "";
    appendStaffRowsToList(host, rows);
  }

  function groupRowsByCategory(rows) {
    var groups = { ceo: [], admin: [], lead: [], staff: [], group: [] };
    rows.forEach(function (r) {
      var k = r.category || "staff";
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    return groups;
  }

  function appendCsteamAccordion(host, rows) {
    if (!host) return;
    host.innerHTML = "";
    var groups = groupRowsByCategory(rows);
    var firstKey = "";
    CSTEAM_SECTIONS.some(function (section) {
      if ((groups[section.key] || []).length) {
        firstKey = section.key;
        return true;
      }
      return false;
    });
    CSTEAM_SECTIONS.forEach(function (section) {
      var sectionRows = groups[section.key] || [];
      if (!sectionRows.length) return;
      var details = document.createElement("details");
      details.className = "portal-dm-csteam-accordion";
      if (section.key === firstKey) details.open = true;
      var summary = document.createElement("summary");
      summary.className = "portal-dm-csteam-accordion__head";
      summary.innerHTML = csteamAccordionSummaryHtml(section, sectionRows);
      details.appendChild(summary);
      var list = document.createElement("div");
      list.className = "portal-dm-csteam-accordion__list";
      list.setAttribute("role", "list");
      appendStaffRowsToList(list, sectionRows);
      details.appendChild(list);
      host.appendChild(details);
    });
  }

  function appendStaffMgmtAccordion(host, rows) {
    if (!host) return;
    host.innerHTML = "";
    var groups = groupRowsByCategory(rows);
    var firstKey = "";
    STAFF_MGMT_SECTIONS.some(function (section) {
      if ((groups[section.key] || []).length) {
        firstKey = section.key;
        return true;
      }
      return false;
    });
    STAFF_MGMT_SECTIONS.forEach(function (section) {
      var sectionRows = groups[section.key] || [];
      if (!sectionRows.length) return;
      var details = document.createElement("details");
      details.className = "portal-dm-csteam-accordion";
      if (section.key === firstKey) details.open = true;
      var summary = document.createElement("summary");
      summary.className = "portal-dm-csteam-accordion__head";
      summary.innerHTML = csteamAccordionSummaryHtml(section, sectionRows);
      details.appendChild(summary);
      var list = document.createElement("div");
      list.className = "portal-dm-csteam-accordion__list";
      list.setAttribute("role", "list");
      appendStaffRowsToList(list, sectionRows);
      details.appendChild(list);
      host.appendChild(details);
    });
  }

  function resolvePortalChatShell(prof, inThread) {
    prof = profileRow(prof);
    inThread = !!inThread;
    if (portalStaffHasSimplifiedInboxTabs(prof) && !inThread) {
      return "simplified";
    }
    if (inThread && (portalStaffIsRestrictedWorkerChat(prof) || portalStaffHasLeadRestrictedInbox(prof))) {
      return "worker";
    }
    if (portalStaffHasPeerDirectory(prof)) return "lead";
    return "standard";
  }

  function ensureSimplifiedInboxStyles() {
    if (document.getElementById("portalCsCliqSimplifiedInboxStyles")) return;
    var st = document.createElement("style");
    st.id = "portalCsCliqSimplifiedInboxStyles";
    st.textContent =
      "#internalChatSheet[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox .portal-dm-sheet-head{" +
      "display:flex!important;flex-shrink:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatLeadInboxChrome," +
      "#internalChatSheet[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatLeadInboxChrome{" +
      "display:none!important;visibility:hidden!important;pointer-events:none!important}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatListWrap{" +
      "display:block!important;visibility:visible!important;pointer-events:auto!important;" +
      "flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatThreadWrap{" +
      "display:none!important}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatInboxBrand," +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatTitle," +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox .portal-dm-inbox-brand__tagline{" +
      "display:block!important;visibility:visible!important}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox .portal-dm-sheet-body{" +
      "display:flex!important;flex-direction:column;min-height:0;flex:1 1 auto;background:#fff}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"].sheet--portal-chat-inbox #internalChatLeadInboxNav{" +
      "display:none!important}" +
      "#internalChatSheet[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-accordion{" +
      "display:flex;flex-direction:column;gap:8px;padding:8px 10px 12px;min-width:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc{" +
      "border:1px solid rgba(45,132,179,.16);border-radius:14px;background:#fff;overflow:hidden;min-width:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc.is-open{" +
      "border-color:rgba(45,132,179,.32);box-shadow:0 2px 10px rgba(23,50,71,.06)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__head{" +
      "display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:0;background:transparent;" +
      "font:inherit;text-align:left;cursor:pointer;min-width:0;color:var(--portal-chat-ink,#173247)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__head:hover{" +
      "background:rgba(45,132,179,.05)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc.is-open .portal-cs-cliq-inbox-acc__head{" +
      "background:rgba(45,132,179,.07)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__ico{" +
      "flex-shrink:0;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(45,132,179,.12);color:#2d84b3}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__ico svg{" +
      "width:18px;height:18px;display:block}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__label{" +
      "flex:1 1 auto;min-width:0;font-size:15px;font-weight:800;overflow-wrap:break-word;line-height:1.25}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__chev{" +
      "flex-shrink:0;width:8px;height:8px;border-right:2px solid rgba(23,50,71,.45);border-bottom:2px solid rgba(23,50,71,.45);" +
      "transform:rotate(45deg);transition:transform .18s ease;margin-right:4px}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc.is-open .portal-cs-cliq-inbox-acc__chev{" +
      "transform:rotate(-135deg)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__body{" +
      "padding:0 10px 10px;min-width:0;border-top:1px solid rgba(45,132,179,.1)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__body[hidden]{" +
      "display:none!important}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__body .portal-dm-thread-item{" +
      "margin-top:8px}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__hint{" +
      "margin:8px 4px 6px;font-size:12px;line-height:1.45;color:var(--portal-chat-muted,#5a7184);overflow-wrap:break-word}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__section-label{" +
      "margin:12px 4px 6px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;" +
      "color:var(--portal-chat-muted,#5a7184);overflow-wrap:break-word;line-height:1.3}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-acc__section-label:first-of-type{" +
      "margin-top:4px}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-simplified-pane__actions--section + .portal-cs-cliq-inbox-acc__section-label{" +
      "margin-top:14px}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-opt{" +
      "display:flex;align-items:center;gap:10px;min-width:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-opt__ico{" +
      "flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:var(--portal-chat-blue,#2d84b3)}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-opt__label{" +
      "min-width:0;flex:1 1 auto;overflow-wrap:break-word;text-align:left}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-confirm{" +
      "padding:8px 4px 4px;min-width:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-confirm h3{" +
      "margin:0 0 8px;font-size:15px;font-weight:800;color:var(--portal-chat-ink,#173247);overflow-wrap:break-word}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-support-confirm p{" +
      "margin:0 0 12px;font-size:13px;line-height:1.45;color:var(--portal-chat-muted,#5a7184);overflow-wrap:break-word}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-groups-create{" +
      "margin-top:10px;padding:10px 12px;border-radius:12px;border:1px dashed rgba(45,132,179,.28);" +
      "background:rgba(45,132,179,.04);min-width:0}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-groups-create__hint{" +
      "margin:0 0 10px;font-size:12px;line-height:1.45;color:var(--portal-chat-muted,#5a7184);overflow-wrap:break-word}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-groups-create__btn{" +
      "display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-width:0;padding:11px 14px;" +
      "border-radius:12px;border:1px solid rgba(45,132,179,.35);background:#fff;color:#1d6f96;font:inherit;" +
      "font-size:14px;font-weight:800;cursor:pointer}" +
      "#internalChatSheet.open[data-portal-chat-shell=\"simplified\"] .portal-cs-cliq-inbox-groups-create__btn svg{" +
      "width:18px;height:18px;flex-shrink:0;display:block}";
    document.head.appendChild(st);
  }

  function applyPortalChatShell(prof, inThread) {
    ensureSimplifiedInboxStyles();
    var chatSheet = document.getElementById("internalChatSheet");
    if (!chatSheet) return;
    try {
      chatSheet.setAttribute("data-portal-chat-shell", resolvePortalChatShell(prof, inThread));
    } catch (_sh) {}
  }

  function portalStaffHasWorkerInboxTabs(prof) {
    if (!portalStaffOnWorkerDashboard()) return false;
    prof = profileRow(prof);
    if (portalStaffIsManagementMessenger(prof)) return false;
    if (portalStaffIsSessionLead(prof)) return false;
    return true;
  }

  function portalStaffHasSimplifiedInboxTabs(prof) {
    if (portalStaffHasWorkerInboxTabs(prof)) return true;
    if (portalStaffHasLeadRestrictedInbox(prof)) return true;
    // Lead portal: session leads get accordion inbox (not flat DM list), including before profile hydrates.
    if (portalStaffOnLeadDashboard() && !portalStaffIsManagementMessenger(prof)) {
      var ar = String(profileRow(prof).app_role || "").toLowerCase();
      if (ar !== "admin" && ar !== "ceo") return true;
    }
    return false;
  }

  function simplifiedInboxTabDefs(prof) {
    return portalStaffHasLeadRestrictedInbox(prof) ? LEAD_SIMPLIFIED_TABS : STAFF_SIMPLIFIED_TABS;
  }

  function getWorkerInboxTab(prof) {
    prof = profileRow(prof);
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var t = String(ui.workerInboxTab || "admin").toLowerCase();
    if (portalStaffHasLeadRestrictedInbox(prof)) {
      if (t === "groups" || t === "group") return "groups";
      if (t === "meetings" || t === "meeting") return "meetings";
      return "admin";
    }
    if (t === "support") return "support";
    if (t === "group" || t === "groups") return "group";
    return "admin";
  }

  function setWorkerInboxTab(tab, prof) {
    prof = profileRow(prof);
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    tab = String(tab || "admin").toLowerCase();
    if (portalStaffHasLeadRestrictedInbox(prof)) {
      if (tab === "groups" || tab === "group") tab = "groups";
      else if (tab === "meetings" || tab === "meeting") tab = "meetings";
      else tab = "admin";
    } else {
      if (tab === "support") tab = "support";
      else if (tab === "group" || tab === "groups") tab = "group";
      else tab = "admin";
    }
    global.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab = tab;
  }

  function workerGroupTabLabel(prof) {
    var def = matchStaffPoolGroupDef(profileRow(prof));
    if (!def || !def.label) return "Group";
    var short = String(def.label).trim().split(/\s+/)[0];
    return short || "Group";
  }

  function hideSimplifiedLegacyInboxNav(nav) {
    if (!nav) return;
    var chatsBtn = document.getElementById("internalChatInboxTabChats");
    var dirBtn =
      document.getElementById("internalChatInboxTabDirectors") ||
      document.getElementById("internalChatInboxTabLeads") ||
      document.getElementById("internalChatInboxTabStaff");
    var legacyAdmin = document.getElementById("internalChatInboxTabAdmin");
    var legacyGroup = document.getElementById("internalChatInboxTabGroup");
    if (chatsBtn) {
      chatsBtn.hidden = true;
      chatsBtn.setAttribute("tabindex", "-1");
    }
    if (dirBtn) {
      dirBtn.hidden = true;
      dirBtn.setAttribute("tabindex", "-1");
    }
    if (legacyAdmin) legacyAdmin.hidden = true;
    if (legacyGroup) legacyGroup.hidden = true;
    nav.querySelectorAll("[data-simplified-inbox-tab]").forEach(function (el) {
      el.parentNode.removeChild(el);
    });
  }

  function forceHideLegacyInboxChrome(prof, inThread) {
    if (inThread || !portalStaffHasSimplifiedInboxTabs(prof)) return;
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    if (!chrome) return;
    blurFocusWithin(chrome);
    chrome.hidden = true;
    chrome.setAttribute("aria-hidden", "true");
    chrome.style.display = "none";
    if ("inert" in chrome) {
      try {
        chrome.inert = true;
      } catch (_inert) {}
    }
    hideSimplifiedLegacyInboxNav(document.getElementById("internalChatLeadInboxNav"));
  }

  function buildSimplifiedInboxAccordion(tabDefs, activeTab) {
    var acc = document.createElement("div");
    acc.className = "portal-cs-cliq-inbox-accordion";
    tabDefs.forEach(function (def) {
      var open = activeTab === def.id;
      var theme = String(def.theme || def.id || "admin")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
      if (!theme) theme = "admin";
      var section = document.createElement("section");
      section.className =
        "portal-cs-cliq-inbox-acc portal-cs-cliq-inbox-acc--" +
        theme +
        (open ? " is-open" : "");
      section.setAttribute("data-simplified-acc", def.id);

      var head = document.createElement("button");
      head.type = "button";
      head.className = "portal-cs-cliq-inbox-acc__head";
      head.setAttribute("aria-expanded", open ? "true" : "false");
      head.setAttribute("data-simplified-acc-toggle", def.id);
      head.innerHTML =
        '<span class="portal-cs-cliq-inbox-acc__ico">' +
        simplifiedTabIconSvg(def.icon) +
        "</span>" +
        '<span class="portal-cs-cliq-inbox-acc__label">' +
        esc(def.label) +
        '</span><span class="portal-cs-cliq-inbox-acc__chev" aria-hidden="true"></span>';

      var body = document.createElement("div");
      body.className = "portal-cs-cliq-inbox-acc__body";
      body.setAttribute("data-simplified-acc-body", def.id);
      if (!open) body.hidden = true;

      section.appendChild(head);
      section.appendChild(body);
      acc.appendChild(section);
    });
    return acc;
  }

  async function renderAccordionSectionBody(bodyEl, tabId, client, me, prof) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    prof = profileRow(prof);
    tabId = String(tabId || "admin").toLowerCase();

    if (tabId === "support") {
      renderSupportAccordionBody(bodyEl);
      return;
    }
    if (tabId === "meetings") {
      renderMeetingsAccordionBody(bodyEl);
      return;
    }
    if (tabId === "groups" && portalStaffHasLeadRestrictedInbox(prof)) {
      await renderLeadGroupsPane(client, me, bodyEl);
      return;
    }
    bodyEl.innerHTML =
      '<p class="portal-dm-inbox-empty portal-dm-inbox-loading" style="min-width:0">Loading…</p>';
    bodyEl.innerHTML = "";
    await renderAdminInboxRow(client, me, bodyEl);
  }

  function bindSimplifiedInboxAccordion(listHost) {
    if (!listHost || listHost.dataset.simplifiedAccBound) return;
    listHost.dataset.simplifiedAccBound = "1";
    listHost.addEventListener("click", function (ev) {
      var head =
        ev.target && ev.target.closest && ev.target.closest("[data-simplified-acc-toggle]");
      if (!head) return;
      ev.preventDefault();
      var tab = String(head.getAttribute("data-simplified-acc-toggle") || "").toLowerCase();
      var prof = profileRow();
      var section = head.closest(".portal-cs-cliq-inbox-acc");
      var wasOpen = !!(section && section.classList.contains("is-open"));

      setWorkerInboxTab(tab, prof);
      global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
      global.__PORTAL_INTERNAL_CHAT_UI.openAdminChat = false;
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;

      var acc = listHost.querySelector(".portal-cs-cliq-inbox-accordion");
      if (!acc) return;

      acc.querySelectorAll(".portal-cs-cliq-inbox-acc").forEach(function (sec) {
        var secTab = String(sec.getAttribute("data-simplified-acc") || "");
        var open = secTab === tab && !wasOpen;
        sec.classList.toggle("is-open", open);
        var h = sec.querySelector(".portal-cs-cliq-inbox-acc__head");
        var b = sec.querySelector(".portal-cs-cliq-inbox-acc__body");
        if (h) h.setAttribute("aria-expanded", open ? "true" : "false");
        if (!b) return;
        if (open) {
          b.hidden = false;
          var box = global.__PORTAL_SUPABASE__ || {};
          void renderAccordionSectionBody(b, secTab, box.client, chatMeId(box), prof);
        } else {
          b.hidden = true;
          b.innerHTML = "";
        }
      });

      if (typeof global.portalStaffDmSyncUnreadChrome === "function") {
        void global.portalStaffDmSyncUnreadChrome();
      }
    });
  }

  function ensureSimplifiedInboxTabButtons(nav, tabDefs, activeTab) {
    hideSimplifiedLegacyInboxNav(nav);
  }

  function syncSearchChromeForSimplifiedInbox(prof, inThread) {
    var search = getSearchInput();
    var clearBtn = document.getElementById("internalChatLeadSearchClear");
    var hide = portalStaffHasSimplifiedInboxTabs(prof) && !inThread;
    if (search) {
      search.hidden = hide;
      search.setAttribute("aria-hidden", hide ? "true" : "false");
      if (hide) search.value = "";
    }
    if (clearBtn) {
      clearBtn.hidden = true;
      clearBtn.setAttribute("aria-hidden", "true");
    }
  }

  function syncWorkerInboxNav(prof, inThread) {
    prof = profileRow(prof);
    var simplified = portalStaffHasSimplifiedInboxTabs(prof);
    var workerTabs = portalStaffHasWorkerInboxTabs(prof);
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    var nav = document.getElementById("internalChatLeadInboxNav");

    syncSearchChromeForSimplifiedInbox(prof, inThread);

    if (simplified && !inThread) {
      forceHideLegacyInboxChrome(prof, inThread);
      return;
    }

    if (chrome) {
      chrome.hidden = !simplified || inThread;
      chrome.setAttribute("aria-hidden", chrome.hidden ? "true" : "false");
      if (!chrome.hidden) {
        chrome.style.removeProperty("display");
        if ("inert" in chrome) {
          try {
            chrome.inert = false;
          } catch (_inertOff) {}
        }
      }
    }

    if (!simplified || inThread || !nav) return;

    hideSimplifiedLegacyInboxNav(nav);

    if (!workerTabs) return;

    var chatsBtn = document.getElementById("internalChatInboxTabChats");
    var dirBtn =
      document.getElementById("internalChatInboxTabDirectors") ||
      document.getElementById("internalChatInboxTabLeads") ||
      document.getElementById("internalChatInboxTabStaff");
    if (chatsBtn) chatsBtn.hidden = true;
    if (dirBtn) dirBtn.hidden = true;
  }

  function getInboxTab() {
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    return isDirectoryTab(ui.inboxTab) ? "directory" : "chats";
  }

  function setInboxTab(tab) {
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    if (tab === "directory") {
      var mode = getDirectoryMode();
      global.__PORTAL_INTERNAL_CHAT_UI.inboxTab =
        mode === "leads"
          ? "leads"
          : mode === "directors" || mode === "staffmgmt" || mode === "ceo_exec"
            ? "directors"
            : "staff";
    } else {
      global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "chats";
    }
  }

  function syncInboxChrome(opts) {
    opts = opts || {};
    var prof = profileRow(opts.profile);
    var simplifiedTabs =
      opts.workerInboxTabs != null ? !!opts.workerInboxTabs : portalStaffHasSimplifiedInboxTabs(prof);
    var hasDirectory =
      opts.hasDirectory != null ? !!opts.hasDirectory : portalStaffHasPeerDirectory(prof);
    if (simplifiedTabs) {
      hasDirectory = false;
    } else if (portalStaffOnWorkerDashboard() && portalStaffIsRestrictedWorkerChat(prof)) {
      hasDirectory = false;
    }
    var inThread = !!opts.inThread;
    syncWorkerInboxNav(prof, inThread);
    if (simplifiedTabs) {
      applyPortalChatShell(prof, inThread);
      forceHideLegacyInboxChrome(prof, inThread);
      var listWrap = document.getElementById("internalChatListWrap");
      var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
      var suggestions = document.getElementById("internalChatLeadStaffSuggestions");
      var chatSheet = document.getElementById("internalChatSheet");
      var threadWrap = document.getElementById("internalChatThreadWrap");
      if (chatSheet && !inThread) {
        chatSheet.setAttribute("data-inbox-pane", "chats");
      }
      if (listWrap) {
        if (inThread) {
          blurFocusWithin(listWrap);
          if (typeof global.portalDmPrepareHidePanel === "function") {
            global.portalDmPrepareHidePanel(listWrap, { fallbackFocusId: "internalChatInput" });
          }
          listWrap.hidden = true;
          listWrap.setAttribute("aria-hidden", "true");
        } else {
          if (typeof global.portalDmPrepareShowPanel === "function") {
            global.portalDmPrepareShowPanel(listWrap);
          }
          listWrap.hidden = false;
          listWrap.setAttribute("aria-hidden", "false");
        }
      }
      if (threadWrap && inThread) {
        threadWrap.hidden = false;
        threadWrap.setAttribute("aria-hidden", "false");
      }
      if (staffWrap) {
        staffWrap.hidden = true;
        staffWrap.setAttribute("aria-hidden", "true");
      }
      if (suggestions) {
        suggestions.hidden = true;
        suggestions.setAttribute("aria-hidden", "true");
      }
      bindInboxNav();
      bindSimplifiedInboxAccordion(listWrap);
      return;
    }
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    var nav = document.getElementById("internalChatLeadInboxNav");
    var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
    var suggestions = document.getElementById("internalChatLeadStaffSuggestions");
    var listWrap = document.getElementById("internalChatListWrap");
    var tab = getInboxTab();
    var dirMode = getDirectoryMode(prof);

    if (chrome) {
      if (!hasDirectory || inThread) blurFocusWithin(chrome);
      chrome.hidden = !hasDirectory || inThread;
      chrome.setAttribute("aria-hidden", !hasDirectory || inThread ? "true" : "false");
    }
    if (nav && hasDirectory && !inThread) {
      var chatsBtn = document.getElementById("internalChatInboxTabChats");
      var dirBtn =
        document.getElementById("internalChatInboxTabDirectors") ||
        document.getElementById("internalChatInboxTabLeads") ||
        document.getElementById("internalChatInboxTabStaff");
      if (chatsBtn) chatsBtn.classList.toggle("is-active", tab === "chats");
      if (dirBtn) {
        dirBtn.classList.toggle("is-active", tab === "directory");
        if (dirMode === "leads") dirBtn.textContent = "Leads";
        else if (dirMode === "directors" || dirMode === "staffmgmt" || dirMode === "ceo_exec") {
          dirBtn.textContent = "Directors";
        }
        else if (dirMode === "csteam") dirBtn.textContent = "CS Team";
        else if (dirMode === "staff") dirBtn.textContent = "Staff";
      }
    }

    if (!hasDirectory || inThread) {
      if (staffWrap) {
        blurFocusWithin(staffWrap);
        staffWrap.hidden = true;
        staffWrap.setAttribute("aria-hidden", "true");
      }
      if (suggestions) {
        suggestions.hidden = true;
        suggestions.setAttribute("aria-hidden", "true");
      }
      if (listWrap && inThread) {
        blurFocusWithin(listWrap);
        listWrap.hidden = true;
        listWrap.setAttribute("aria-hidden", "true");
      }
      return;
    }

    bindInboxNav();

    if (listWrap) {
      if (tab !== "chats") blurFocusWithin(listWrap);
      listWrap.hidden = tab !== "chats";
      listWrap.setAttribute("aria-hidden", tab === "chats" ? "false" : "true");
    }
    if (staffWrap) {
      staffWrap.hidden = tab !== "directory";
      staffWrap.setAttribute("aria-hidden", tab === "directory" ? "false" : "true");
    }
    if (suggestions) {
      suggestions.hidden = true;
      suggestions.setAttribute("aria-hidden", "true");
      suggestions.innerHTML = "";
    }

    var chatSheet = document.getElementById("internalChatSheet");
    if (chatSheet) {
      if (!hasDirectory || inThread) {
        chatSheet.removeAttribute("data-inbox-pane");
      } else {
        chatSheet.setAttribute("data-inbox-pane", tab === "directory" ? "staff" : "chats");
      }
    }

    if (hasDirectory && !inThread && dirMode) {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      void loadDirectoryRows(client, chatMeId(box), dirMode);
    }
  }

  function onSearchInput() {
    syncSearchClearBtn();
    syncInboxChrome({ inThread: false });
    var tab = getInboxTab();
    if (tab === "directory") {
      void renderPeerDirectory();
      return;
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      void global.portalRenderInternalChatSheet();
    }
  }

  function bindInboxNav() {
    var nav = document.getElementById("internalChatLeadInboxNav");
    if (!nav || nav.dataset.portalLeadInboxBound) return;
    nav.dataset.portalLeadInboxBound = "1";

    nav.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-inbox-tab]");
      if (!btn) return;
      ev.preventDefault();
      var tab = String(btn.getAttribute("data-inbox-tab") || "").toLowerCase();
      var prof = profileRow();
      if (portalStaffHasSimplifiedInboxTabs(prof)) {
        if (tab === "chats" || tab === "directors" || isDirectoryTab(tab)) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      }
      if (
        tab === "admin" ||
        tab === "group" ||
        tab === "groups" ||
        tab === "support" ||
        tab === "meetings" ||
        tab === "meeting"
      ) {
        setWorkerInboxTab(tab, prof);
        global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
        global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
        global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
        syncInboxChrome({ inThread: false, profile: prof });
        if (typeof global.portalRenderInternalChatSheet === "function") {
          void global.portalRenderInternalChatSheet();
        }
        return;
      }
      setInboxTab(isDirectoryTab(tab) ? "directory" : "chats");
      syncInboxChrome({ inThread: false });
      if (isDirectoryTab(tab)) {
        void renderPeerDirectory();
      } else if (typeof global.portalRenderInternalChatSheet === "function") {
        void global.portalRenderInternalChatSheet();
      }
    });
  }

  function directoryEmptyMessage(query, mode) {
    mode = mode || "staff";
    if (query) {
      if (mode === "leads") return "No leads match your search.";
      if (mode === "directors") return "No directors or admin match your search.";
      if (mode === "staffmgmt") return "No management contacts match your search.";
      if (mode === "ceo_exec") return "No directors match your search.";
      if (mode === "csteam") return "No CS Team members match your search.";
      return "No staff match your search.";
    }
    if (mode === "leads") {
      return (
        "No session leads found. " +
        "If you expected leads here, ask ops to apply the latest portal database update (staff?lead team chat)."
      );
    }
    if (mode === "directors") {
      return "No directors or admin found. Contact ops if you expected Raul, Javi, Victor, or admin here.";
    }
    if (mode === "staffmgmt") {
      return (
        "Management contacts are not available yet. " +
        "Ask ops to apply the latest portal database update (staff management chat)."
      );
    }
    if (mode === "ceo_exec") {
      return "Director chats are not available yet. Ask ops to check CEO profiles and group setup.";
    }
    if (mode === "csteam") {
      return (
        "No CS Team members found. " +
        "If you expected colleagues, admin, or management here, ask ops to check your portal access."
      );
    }
    return (
      "No colleagues found in the team directory. " +
      "If you expected staff here, ask ops to apply the latest portal database update (lead team chat)."
    );
  }

  function directoryRowMatchesMode(row, mode) {
    if (!row) return false;
    var ar = String(row.app_role || "").toLowerCase();
    if (mode === "leads") return ar === "lead";
    if (mode === "directors") return staffInitiatePeer(row);
    if (mode === "csteam") return true;
    if (mode === "staff") return ar !== "lead" && ar !== "admin" && ar !== "ceo";
    return true;
  }

  function matchStaffMgmtCeoSlot(row) {
    if (
      !global.portalDmRoles ||
      typeof global.portalDmRoles.portalDmIsDirectorProfile !== "function" ||
      !global.portalDmRoles.portalDmIsDirectorProfile(row)
    ) {
      return "";
    }
    var p = profileNameParts(row);
    if (p.first === "raul" || p.username === "raul") return "raul";
    if (p.first === "victor" || p.username === "victor") return "victor";
    if (p.username === "javi" || p.first === "javi") return "javi";
    return "";
  }

  async function resolveStaffMgmtAdminId(client) {
    if (
      global.portalCsCliqSupportRoute &&
      typeof global.portalCsCliqSupportRoute.resolveOpsAdminId === "function"
    ) {
      return String((await global.portalCsCliqSupportRoute.resolveOpsAdminId(client)) || "").trim();
    }
    if (!client) return "";
    var q = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .eq("app_role", "admin")
      .order("full_name", { ascending: true })
      .limit(40);
    if (q.error || !Array.isArray(q.data)) return "";
    var row = q.data.find(function (r) {
      return r && r.is_active !== false;
    });
    return row && row.id ? String(row.id) : "";
  }

  async function resolveStaffMgmtGroupId(client) {
    if (!client) return "";
    var g = await client
      .from("portal_ceo_group")
      .select("id,title,slug,updated_at")
      .eq("slug", STAFF_MGMT_GROUP_SLUG)
      .maybeSingle();
    if (g.error || !g.data || !g.data.id) return "";
    return String(g.data.id);
  }

  function matchStaffPoolGroupDef(prof) {
    if (!prof || prof.is_active === false) return null;
    var ar = String(prof.app_role || "staff").toLowerCase();
    var sr = String(prof.staff_role || "").toLowerCase();
    for (var i = 0; i < STAFF_POOL_GROUPS.length; i++) {
      var def = STAFF_POOL_GROUPS[i];
      if (def.appRole === "lead" && ar === "lead") return def;
      if (def.appRole === "staff" && ar === "staff" && sr === def.staffRole) return def;
    }
    return null;
  }

  async function resolveStaffPoolGroupEntry(client, prof) {
    var def = matchStaffPoolGroupDef(prof);
    if (!def || !client) return null;
    var g = await client
      .from("portal_ceo_group")
      .select("id,title,slug,updated_at")
      .eq("slug", def.slug)
      .maybeSingle();
    if (g.error || !g.data || !g.data.id) return null;
    return {
      kind: "group",
      groupId: String(g.data.id),
      groupSlug: def.slug,
      label: def.label,
      role: "Group",
      category: "pool",
      attachAdminChip: true,
      sortKey: "8",
    };
  }

  async function appendWorkerPoolGroupInboxRow(client, me, prof, listHost, helpers) {
    if (!client || !me || !listHost || typeof helpers !== "object") return false;
    var htmlFn = helpers.threadListItemHtml;
    var previewFn = helpers.previewFromMessage;
    if (typeof htmlFn !== "function" || typeof previewFn !== "function") return false;
    try {
      var entry = await resolveStaffPoolGroupEntry(client, prof);
      if (!entry || !entry.groupId) return false;
      var gWhen = "";
      var gPrev = { sender: "", preview: "" };
      var gUnread = 0;
      var gmsgRes = await client
        .from("portal_ceo_group_message")
        .select("author_id,body,created_at,message_type")
        .eq("group_id", entry.groupId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!gmsgRes.error && Array.isArray(gmsgRes.data) && gmsgRes.data[0]) {
        var gLast = gmsgRes.data[0];
        try {
          if (gLast.created_at) {
            gWhen = new Date(gLast.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        } catch (_gw) {}
        var gAuthors = {};
        if (gLast.author_id) {
          var gAp = await client
            .from("staff_profiles")
            .select("id,full_name,username,app_role,staff_role,is_active")
            .eq("id", gLast.author_id)
            .maybeSingle();
          if (!gAp.error && gAp.data) gAuthors[String(gLast.author_id)] = gAp.data;
        }
        gPrev = previewFn(gLast, gAuthors, me);
      }
      var gActive =
        String((global.__PORTAL_INTERNAL_CHAT_UI && global.__PORTAL_INTERNAL_CHAT_UI.groupId) || "") ===
        String(entry.groupId);
      var gBtn = document.createElement("button");
      gBtn.type = "button";
      gBtn.className = "portal-dm-thread-item" + (gActive ? " portal-dm-thread-item--active" : "");
      gBtn.setAttribute("data-dm-group", String(entry.groupId));
      gBtn.innerHTML = htmlFn(entry.label, gWhen, gUnread, {
        lastSender: gPrev.sender,
        lastPreview: gPrev.preview,
        roleChip: "Group",
        roleChipClass: "portal-dm-role-chip--group",
        attachAdminChip: true,
      });
      gBtn.addEventListener("click", function () {
        void openGroupChat({ groupId: entry.groupId, label: entry.label });
      });
      listHost.appendChild(gBtn);
      return true;
    } catch (_poolRow) {
      return false;
    }
  }

  async function loadStaffMgmtDirectoryRows(client, me, opts) {
    opts = opts || {};
    if (!client || !me) return [];
    if (!opts.force && global[CACHE_KEY_STAFFMGMT] && Array.isArray(global[CACHE_KEY_STAFFMGMT])) {
      return global[CACHE_KEY_STAFFMGMT];
    }

    var selectCols = "id,full_name,username,app_role,staff_role,is_active";
    var adminId = await resolveStaffMgmtAdminId(client);
    var groupId = await resolveStaffMgmtGroupId(client);
    var profRes = await client
      .from("staff_profiles")
      .select(selectCols)
      .or("is_active.is.null,is_active.eq.true");
    if (profRes.error) throw profRes.error;

    var adminRow = null;
    var ceoBySlot = {};
    (profRes.data || []).forEach(function (row) {
      if (!row || !row.id) return;
      var id = String(row.id).trim();
      if (id.toLowerCase() === String(me).toLowerCase()) return;
      if (adminId && id === adminId) adminRow = row;
      var slot = matchStaffMgmtCeoSlot(row);
      if (slot && !ceoBySlot[slot]) ceoBySlot[slot] = row;
    });

    var rows = [];
    if (adminRow) {
      rows.push({
        kind: "dm",
        id: String(adminRow.id),
        label: peerLabelFromRow(adminRow) || "Admin",
        role: peerRoleChipLabel(adminRow),
        category: "admin",
        attachAdmin: false,
        sortKey: "0",
      });
    }

    STAFF_MGMT_CEO_SLOTS.forEach(function (slotDef, idx) {
      var ceo = ceoBySlot[slotDef.slot];
      if (!ceo) return;
      rows.push({
        kind: "dm",
        id: String(ceo.id),
        label: peerLabelFromRow(ceo) || slotDef.hint,
        role: peerRoleChipLabel(ceo),
        category: "ceo",
        attachAdmin: true,
        sortKey: String(idx + 1),
      });
    });

    if (groupId) {
      rows.push({
        kind: "group",
        groupId: groupId,
        groupSlug: STAFF_MGMT_GROUP_SLUG,
        label: STAFF_MGMT_GROUP_LABEL,
        role: "Group",
        category: "group",
        attachAdmin: true,
        sortKey: "9",
      });
    }

    global[CACHE_KEY_STAFFMGMT] = rows;
    return rows;
  }

  async function resolveCeoExecGroupId(client, slug) {
    if (!client || !slug) return "";
    var g = await client
      .from("portal_ceo_group")
      .select("id,title,slug,updated_at")
      .eq("slug", String(slug))
      .maybeSingle();
    if (g.error || !g.data || !g.data.id) return "";
    return String(g.data.id);
  }

  async function loadCeoExecDirectoryRows(client, me, opts) {
    opts = opts || {};
    if (!client || !me) return [];
    if (!opts.force && global[CACHE_KEY_CEO_EXEC] && Array.isArray(global[CACHE_KEY_CEO_EXEC])) {
      return global[CACHE_KEY_CEO_EXEC];
    }

    var selectCols = "id,full_name,username,app_role,staff_role,is_active";
    var profRes = await client
      .from("staff_profiles")
      .select(selectCols)
      .or("is_active.is.null,is_active.eq.true");
    if (profRes.error) throw profRes.error;

    var selfSlot = "";
    (profRes.data || []).forEach(function (row) {
      if (!row || !row.id) return;
      if (String(row.id).trim().toLowerCase() === String(me).trim().toLowerCase()) {
        selfSlot = matchStaffMgmtCeoSlot(row);
      }
    });

    var ceoBySlot = {};
    (profRes.data || []).forEach(function (row) {
      if (!row || !row.id) return;
      var id = String(row.id).trim();
      if (id.toLowerCase() === String(me).toLowerCase()) return;
      var slot = matchStaffMgmtCeoSlot(row);
      if (slot && !ceoBySlot[slot]) ceoBySlot[slot] = row;
    });

    var rows = [];
    STAFF_CEO_EXEC_PEER_SLOTS.forEach(function (slotDef, idx) {
      if (slotDef.slot === selfSlot) return;
      var ceo = ceoBySlot[slotDef.slot];
      if (!ceo) return;
      rows.push({
        kind: "dm",
        id: String(ceo.id),
        label: peerLabelFromRow(ceo) || slotDef.hint,
        role: peerRoleChipLabel(ceo),
        category: "ceo",
        sortKey: String(idx + 1),
      });
    });

    var groupSort = rows.length + 1;
    var gi;
    for (gi = 0; gi < STAFF_CEO_EXEC_GROUPS.length; gi++) {
      var groupDef = STAFF_CEO_EXEC_GROUPS[gi];
      var groupId = await resolveCeoExecGroupId(client, groupDef.slug);
      if (!groupId) continue;
      rows.push({
        kind: "group",
        groupId: groupId,
        groupSlug: groupDef.slug,
        label: groupDef.label,
        role: "Group",
        category: "group",
        sortKey: String(groupSort + gi),
      });
    }

    global[CACHE_KEY_CEO_EXEC] = rows;
    return rows;
  }

  async function loadDirectoryRows(client, me, mode, opts) {
    opts = opts || {};
    mode =
      mode === "leads"
        ? "leads"
        : mode === "directors"
          ? "directors"
          : mode === "staffmgmt"
            ? "staffmgmt"
            : mode === "ceo_exec"
              ? "ceo_exec"
              : mode === "csteam"
                ? "csteam"
                : "staff";
    if (mode === "staffmgmt") {
      return loadStaffMgmtDirectoryRows(client, me, opts);
    }
    if (mode === "ceo_exec") {
      return loadCeoExecDirectoryRows(client, me, opts);
    }
    if (!client || !me) return [];
    var cacheKey = directoryCacheKey(mode);
    if (!opts.force && global[cacheKey] && Array.isArray(global[cacheKey])) {
      return global[cacheKey];
    }

    var selectCols = "id,full_name,username,app_role,staff_role,dashboard_route,is_active";
    var rows = [];
    var from = 0;
    var chunk = 800;

    function pullPage() {
      var to = from + chunk - 1;
      var q = client.from("staff_profiles").select(selectCols).order("full_name", { ascending: true });
      if (mode === "leads") {
        q = q.eq("app_role", "lead");
      } else if (mode === "directors") {
        q = q.in("app_role", ["admin", "ceo"]);
      }
      return q.range(from, to).then(function (res) {
        if (res.error) {
          var errMsg = String(res.error.message || res.error || "Load failed");
          if (selectCols.indexOf("dashboard_route") !== -1 && /dashboard_route/i.test(errMsg)) {
            selectCols = "id,full_name,username,app_role,staff_role,is_active";
            from = 0;
            rows = [];
            return pullPage();
          }
          throw res.error;
        }
        var batch = res.data || [];
        batch.forEach(function (row) {
          if (!row || row.is_active === false) return;
          if (!directoryRowMatchesMode(row, mode)) return;
          var mapped = directoryRowFromProfile(row, me);
          if (mapped) rows.push(mapped);
        });
        if (batch.length < chunk) {
          if (mode === "directors") {
            return pullDirectorNameMatches().then(function () {
              rows.sort(function (a, b) {
                return String(a.label || "").localeCompare(String(b.label || ""), "en", {
                  sensitivity: "base",
                });
              });
              global[cacheKey] = rows;
              return rows;
            });
          }
          rows.sort(function (a, b) {
            return String(a.label || "").localeCompare(String(b.label || ""), "en", {
              sensitivity: "base",
            });
          });
          global[cacheKey] = rows;
          return rows;
        }
        from += chunk;
        return pullPage();
      });
    }

    function pullDirectorNameMatches() {
      var seen = {};
      rows.forEach(function (r) {
        if (r && r.id) seen[String(r.id)] = true;
      });
      var fromDir = 0;
      function pullNamed() {
        var to = fromDir + chunk - 1;
        return client
          .from("staff_profiles")
          .select(selectCols)
          .order("full_name", { ascending: true })
          .range(fromDir, to)
          .then(function (res) {
            if (res.error) return rows;
            var batch = res.data || [];
            batch.forEach(function (row) {
              if (!row || row.is_active === false) return;
              if (!staffInitiatePeer(row)) return;
              var id = String(row.id || "").trim();
              if (!id || id.toLowerCase() === String(me).toLowerCase() || seen[id]) return;
              seen[id] = true;
              var mapped = directoryRowFromProfile(row, me);
              if (mapped) rows.push(mapped);
            });
            if (batch.length < chunk) return rows;
            fromDir += chunk;
            return pullNamed();
          });
      }
      return pullNamed();
    }

    return pullPage();
  }

  async function loadStaffRows(client, me, opts) {
    return loadDirectoryRows(client, me, "staff", opts);
  }

  function filterStaffRows(rows, query) {
    var q = normKey(query);
    if (!q) return rows;
    return rows.filter(function (r) {
      return (
        normKey(r.label).indexOf(q) >= 0 ||
        normKey(r.role).indexOf(q) >= 0 ||
        normKey(r.category).indexOf(q) >= 0
      );
    });
  }

  function threadListItemHtml(label, when, unreadCount, opts) {
    opts = opts || {};
    if (typeof global.portalStaffDmThreadListItemHtml === "function") {
      return global.portalStaffDmThreadListItemHtml(label, when, unreadCount, opts);
    }
    var memberRow = groupMemberChipsHtml(opts.memberChips);
    return (
      '<span class="portal-dm-thread-item__label">' +
      esc(label) +
      "</span>" +
      memberRow +
      (when ? '<span class="portal-dm-thread-item__when">' + esc(when) + "</span>" : "")
    );
  }

  function previewFromMessage(msg, profBy, me) {
    if (typeof global.portalStaffDmPreviewFromMessage === "function") {
      return global.portalStaffDmPreviewFromMessage(msg, profBy, me);
    }
    return { sender: "", preview: msg && msg.body ? String(msg.body).slice(0, 80) : "" };
  }

  function renderSimplifiedPaneCard(listHost, title, bodyHtml, actionsHtml) {
    listHost.innerHTML =
      '<div class="portal-cs-cliq-simplified-pane" style="min-width:0;padding:12px 14px">' +
      '<h4 class="portal-cs-cliq-simplified-pane__title" style="margin:0 0 8px;font-size:15px;font-weight:800;overflow-wrap:break-word">' +
      esc(title) +
      "</h4>" +
      '<div class="portal-cs-cliq-simplified-pane__body" style="min-width:0;overflow-wrap:break-word">' +
      bodyHtml +
      "</div>" +
      (actionsHtml
        ? '<div class="portal-cs-cliq-simplified-pane__actions" style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' +
          actionsHtml +
          "</div>"
        : "") +
      "</div>";
  }

  function supportOptionButtonsHtml(types) {
    return (types || [])
      .map(function (item) {
        var iconKey = resolveSupportOptionIcon(item);
        return (
          '<button type="button" class="portal-dm-btn portal-dm-btn--ghost portal-cs-cliq-support-opt" data-cs-cliq-support-type="' +
          esc(item.type) +
          '" data-cs-cliq-support-label="' +
          esc(item.requestLabel || item.label) +
          '">' +
          '<span class="' +
          supportOptionIconClass(iconKey) +
          '">' +
          supportOptionIconSvg(iconKey) +
          '</span><span class="portal-cs-cliq-support-opt__label">' +
          esc(item.label) +
          "</span></button>"
        );
      })
      .join("");
  }

  function bindAccordionSupportActionClicks(bodyEl, restoreFn) {
    if (!bodyEl) return;
    bodyEl.querySelectorAll("[data-cs-cliq-support-type]").forEach(function (btn) {
      if (btn.dataset.supportBound === "1") return;
      btn.dataset.supportBound = "1";
      btn.addEventListener("click", function () {
        var type = String(btn.getAttribute("data-cs-cliq-support-type") || "other");
        var label = String(btn.getAttribute("data-cs-cliq-support-label") || "").trim();
        if (global.portalCsCliqSupport && typeof global.portalCsCliqSupport.submit === "function") {
          global.portalCsCliqSupport.submit(type, {
            confirmHost: bodyEl,
            label: label || undefined,
            onRestore: restoreFn,
          });
        }
      });
    });
  }

  function bindAccordionSupportActions(bodyEl, types, hintHtml, restoreFn) {
    if (!bodyEl) return;
    bodyEl.innerHTML =
      (hintHtml || "") +
      '<div class="portal-cs-cliq-simplified-pane__actions" style="display:flex;flex-direction:column;gap:8px;min-width:0">' +
      supportOptionButtonsHtml(types) +
      "</div>";
    bindAccordionSupportActionClicks(bodyEl, restoreFn);
  }

  function bindAccordionSupportGrouped(bodyEl, sections, hintHtml, restoreFn) {
    if (!bodyEl) return;
    var blocks = (sections || [])
      .map(function (section) {
        var heading = String((section && section.heading) || "").trim();
        var items = (section && section.items) || [];
        if (!items.length) return "";
        var headHtml = heading
          ? '<p class="portal-cs-cliq-inbox-acc__section-label">' + esc(heading) + "</p>"
          : "";
        return (
          headHtml +
          '<div class="portal-cs-cliq-simplified-pane__actions portal-cs-cliq-simplified-pane__actions--section" style="display:flex;flex-direction:column;gap:8px;min-width:0">' +
          supportOptionButtonsHtml(items) +
          "</div>"
        );
      })
      .join("");
    bodyEl.innerHTML = (hintHtml || "") + blocks;
    bindAccordionSupportActionClicks(bodyEl, restoreFn);
  }

  function renderSupportAccordionBody(bodyEl) {
    bindAccordionSupportActions(
      bodyEl,
      [
        { type: "urgent_callback", label: "Urgent call back", icon: "phone" },
        { type: "participant_concern", label: "Participant concern", icon: "user" },
        { type: "safeguarding", label: "Safeguarding concern", icon: "shield" },
        { type: "staff_issue", label: "Staff issue", icon: "users" },
        { type: "other", label: "Need help", icon: "support" },
      ],
      '<p class="portal-cs-cliq-inbox-acc__hint">' + SIMPLIFIED_SUPPORT_MEETINGS_HINT + "</p>",
      function () {
        renderSupportAccordionBody(bodyEl);
      }
    );
  }

  function renderLeadSupportMeetingsAccordionBody(bodyEl) {
    bindAccordionSupportGrouped(
      bodyEl,
      leadSupportMeetingsSections(),
      '<p class="portal-cs-cliq-inbox-acc__hint">' + LEAD_SIMPLIFIED_SUPPORT_MEETINGS_HINT + "</p>",
      function () {
        renderLeadSupportMeetingsAccordionBody(bodyEl);
      }
    );
  }

  function renderMeetingsAccordionBody(bodyEl) {
    renderLeadSupportMeetingsAccordionBody(bodyEl);
  }

  function renderSupportPane(listHost) {
    var supportTypes = [
      { type: "urgent_callback", label: "Urgent call back" },
      { type: "participant_concern", label: "Participant concern" },
      { type: "safeguarding", label: "Safeguarding concern" },
      { type: "staff_issue", label: "Staff issue" },
      { type: "meeting_request", label: "Meeting request" },
      { type: "other", label: "Need help" },
    ];
    var btns = supportTypes
      .map(function (item) {
        var iconKey = resolveSupportOptionIcon(item);
        return (
          '<button type="button" class="portal-dm-btn portal-dm-btn--ghost portal-cs-cliq-support-opt" data-cs-cliq-support-type="' +
          esc(item.type) +
          '">' +
          '<span class="' +
          supportOptionIconClass(iconKey) +
          '">' +
          supportOptionIconSvg(iconKey) +
          '</span><span class="portal-cs-cliq-support-opt__label">' +
          esc(item.label) +
          "</span></button>"
        );
      })
      .join("");
    renderSimplifiedPaneCard(
      listHost,
      SIMPLIFIED_SUPPORT_MEETINGS_LABEL,
      '<p class="muted" style="margin:0">' + SIMPLIFIED_SUPPORT_MEETINGS_HINT + "</p>",
      btns
    );
    listHost.querySelectorAll("[data-cs-cliq-support-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var type = String(btn.getAttribute("data-cs-cliq-support-type") || "other");
        if (global.portalCsCliqSupport && typeof global.portalCsCliqSupport.submit === "function") {
          global.portalCsCliqSupport.submit(type, { confirmHost: listHost });
        }
      });
    });
  }

  function renderMeetingsPane(listHost) {
    renderMeetingsAccordionBody(listHost);
  }

  function csCliqCanCreateGroups() {
    if (portalStaffHasLeadRestrictedInbox(profileRow())) return false;
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.canManageChannels === "function") {
      return global.portalCsCliqWorkspace.canManageChannels();
    }
    var prof = profileRow();
    var ar = String(prof.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function appendCsCliqGroupCreateAction(host, opts) {
    if (!host || !csCliqCanCreateGroups()) return;
    opts = opts || {};
    var variant = String(opts.variant || "admin").toLowerCase();
    var wrap = document.createElement("div");
    wrap.className = "portal-cs-cliq-inbox-groups-create";
    var hint =
      variant === "groups"
        ? "Create a programme group chat for your team. It appears here once saved."
        : "Programme group chats (CS Cliq). Create a shared channel for leads and staff on a programme.";
    wrap.innerHTML =
      '<p class="portal-cs-cliq-inbox-groups-create__hint">' +
      esc(hint) +
      '</p><button type="button" class="portal-cs-cliq-inbox-groups-create__btn" data-portal-cs-cliq-new-group="1">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">' +
      '<path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>' +
      "<span>New group</span></button>";
    var btn = wrap.querySelector("[data-portal-cs-cliq-new-group]");
    if (btn) {
      btn.addEventListener("click", function () {
        if (global.portalCsCliqTeams && typeof global.portalCsCliqTeams.openCreateModal === "function") {
          global.portalCsCliqTeams.openCreateModal();
        }
      });
    }
    host.appendChild(wrap);
  }

  async function resolveLeadAdminThreadId(client, me) {
    if (!client || !me) return "";
    if (
      global.portalCsCliqSupportRoute &&
      typeof global.portalCsCliqSupportRoute.resolveStaffOfficeThreadId === "function"
    ) {
      var viaRoute = String(
        (await global.portalCsCliqSupportRoute.resolveStaffOfficeThreadId(client, me)) || ""
      ).trim();
      if (viaRoute) return viaRoute;
    }
    if (typeof global.portalStaffResolveOfficeThreadForQuickOpen === "function") {
      return String((await global.portalStaffResolveOfficeThreadForQuickOpen()) || "").trim();
    }
    return "";
  }

  async function openLeadAdminChat(opts) {
    opts = opts || {};
    try {
      var ae = document.activeElement;
      if (ae && typeof ae.blur === "function") ae.blur();
    } catch (_blurAdmin) {}
    var box = global.__PORTAL_SUPABASE__ || {};
    var client = box.client;
    var me = chatMeId(box);
    var errTop = document.getElementById("internalChatTopErr");
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab = "admin";
    global.__PORTAL_INTERNAL_CHAT_UI.openAdminChat = true;
    global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
    global.__PORTAL_INTERNAL_CHAT_UI.managementOpsPeer = true;
    markThreadReturnContext({ pane: "simplified", workerInboxTab: "admin" });
    if (errTop && !opts.silent) {
      errTop.textContent = "";
      errTop.hidden = true;
    }
    try {
      var tid = await resolveLeadAdminThreadId(client, me);
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = tid || null;
      if (!tid && errTop && !opts.silent) {
        errTop.textContent =
          "Admin chat is not set up yet. Type a message below — we will connect you when you send.";
        errTop.hidden = false;
      }
    } catch (e) {
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
      if (errTop) {
        errTop.textContent = String(
          (e && e.message) || e || "Could not open Admin chat. Try again or contact ops."
        );
        errTop.hidden = false;
      }
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      void global.portalRenderInternalChatSheet();
    }
  }

  async function renderAdminInboxRow(client, me, listHost) {
    var route = global.portalCsCliqSupportRoute || {};
    var mgmtLabel = route.MANAGEMENT_INBOX_LABEL || "Admin";
    var adminTid = "";
    adminTid = String((await resolveLeadAdminThreadId(client, me)) || "").trim();
    var when = "";
    var unreadCount = 0;
    var prev = { sender: "", preview: "" };
    if (adminTid && client) {
      var msgRes = await client
        .from("portal_staff_dm_messages")
        .select("thread_id,author_id,created_at,body,message_type")
        .eq("thread_id", adminTid)
        .order("created_at", { ascending: false })
        .limit(40);
      var msgsByThread =
        typeof global.portalStaffDmMsgsByThread === "function"
          ? global.portalStaffDmMsgsByThread(!msgRes.error && Array.isArray(msgRes.data) ? msgRes.data : [])
          : {};
      var lastAuthorProfBy = {};
      var authorIds = [];
      (msgRes.data || []).forEach(function (m) {
        var aid = m && m.author_id ? String(m.author_id) : "";
        if (aid && authorIds.indexOf(aid) === -1) authorIds.push(aid);
      });
      if (authorIds.length) {
        var lap = await client
          .from("staff_profiles")
          .select("id,full_name,username,app_role,staff_role,is_active")
          .in("id", authorIds);
        if (!lap.error && Array.isArray(lap.data)) {
          lap.data.forEach(function (p) {
            if (p && p.id) lastAuthorProfBy[String(p.id)] = p;
          });
        }
      }
      if (typeof global.portalStaffDmCountUnreadInThread === "function") {
        unreadCount = global.portalStaffDmCountUnreadInThread(adminTid, msgsByThread, lastAuthorProfBy, me);
      }
      var lastMsg =
        msgsByThread[adminTid] && msgsByThread[adminTid][0] ? msgsByThread[adminTid][0] : null;
      prev = previewFromMessage(lastMsg, lastAuthorProfBy, me);
      try {
        if (lastMsg && lastMsg.created_at) {
          when = new Date(lastMsg.created_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch (_wh) {}
    }
    var adminBtn = document.createElement("button");
    adminBtn.type = "button";
    adminBtn.className =
      "portal-dm-thread-item" +
      (unreadCount > 0 ? " portal-dm-thread-item--unread" : "") +
      (String((global.__PORTAL_INTERNAL_CHAT_UI && global.__PORTAL_INTERNAL_CHAT_UI.threadId) || "") ===
      adminTid && adminTid
        ? " portal-dm-thread-item--active"
        : "");
    if (adminTid) adminBtn.setAttribute("data-dm-thread", adminTid);
    if (unreadCount > 0) adminBtn.setAttribute("data-dm-unread-count", String(unreadCount));
    adminBtn.innerHTML = threadListItemHtml(mgmtLabel, when, unreadCount, {
      lastSender: prev.sender,
      lastPreview: prev.preview || (adminTid ? "" : "Tap to message Admin"),
      useAdminLaneAvatar: true,
    });
    adminBtn.addEventListener("click", function () {
      try {
        if (typeof adminBtn.blur === "function") adminBtn.blur();
      } catch (_blurBtn) {}
      void openLeadAdminChat();
    });
    listHost.appendChild(adminBtn);
    appendCsCliqGroupCreateAction(listHost, { variant: "admin" });
  }

  async function loadLeadAssignedGroupEntries(client) {
    if (
      global.portalLeadTeamGroups &&
      typeof global.portalLeadTeamGroups.entriesForLead === "function"
    ) {
      return global.portalLeadTeamGroups.entriesForLead(client, profileRow());
    }
    if (!client) return [];
    var res = await client
      .from("portal_ceo_group")
      .select("id,title,slug,updated_at")
      .order("title", { ascending: true })
      .limit(40);
    if (res.error || !Array.isArray(res.data)) return [];
    var out = [];
    res.data.forEach(function (row) {
      if (!row || !row.id) return;
      var slug = String(row.slug || "").toLowerCase();
      if (
        global.portalLeadTeamGroups &&
        typeof global.portalLeadTeamGroups.isHiddenLeadInboxSlug === "function" &&
        global.portalLeadTeamGroups.isHiddenLeadInboxSlug(slug)
      ) {
        return;
      }
      if (slug === "all_ceos" || slug === "ceo_liaison") return;
      var label = String(row.title || row.slug || "Group").trim();
      if (
        global.portalCsCliqAnnouncementInbox &&
        typeof global.portalCsCliqAnnouncementInbox.simplifyGroupLabel === "function"
      ) {
        label = global.portalCsCliqAnnouncementInbox.simplifyGroupLabel(slug, label) || label;
      }
      out.push({
        kind: "group",
        groupId: String(row.id),
        groupSlug: slug,
        label: label,
      });
    });
    return out;
  }

  function groupMemberChipsHtml(members) {
    if (
      !members ||
      !members.length ||
      !global.portalCsCliqGroupMembers ||
      typeof global.portalCsCliqGroupMembers.chipsHtml !== "function"
    ) {
      return "";
    }
    var inner = global.portalCsCliqGroupMembers.chipsHtml(members, {});
    if (!inner) return "";
    return (
      '<div class="portal-dm-thread-item__member-chips" aria-label="Members">' + inner + "</div>"
    );
  }

  async function loadGroupEntryMemberChips(client, entry) {
    if (
      !entry ||
      !global.portalCsCliqGroupMembers ||
      typeof global.portalCsCliqGroupMembers.loadMemberChips !== "function"
    ) {
      return [];
    }
    try {
      var chips = await global.portalCsCliqGroupMembers.loadMemberChips(
        String(entry.groupSlug || ""),
        String(entry.groupId || "")
      );
      return Array.isArray(chips) ? chips : [];
    } catch (_chipErr) {
      return [];
    }
  }

  async function renderLeadGroupsPane(client, me, listHost) {
    listHost.innerHTML =
      '<p class="portal-dm-inbox-empty portal-dm-inbox-loading" style="min-width:0">Loading your groups…</p>';
    try {
      var groups = await loadLeadAssignedGroupEntries(client);
      listHost.innerHTML = "";
      if (!groups.length) {
        var empty = document.createElement("p");
        empty.className = "portal-dm-inbox-empty";
        empty.style.minWidth = "0";
        empty.style.overflowWrap = "break-word";
        empty.textContent =
          "Your programme team chat is not set up yet. Ask Management to create it in Admin CS Cliq.";
        listHost.appendChild(empty);
        return;
      }
      for (var i = 0; i < groups.length; i++) {
        var entry = groups[i];
        var gActive =
          String((global.__PORTAL_INTERNAL_CHAT_UI && global.__PORTAL_INTERNAL_CHAT_UI.groupId) || "") ===
          String(entry.groupId);
        var gBtn = document.createElement("button");
        gBtn.type = "button";
        gBtn.className = "portal-dm-thread-item" + (gActive ? " portal-dm-thread-item--active" : "");
        gBtn.setAttribute("data-dm-group", String(entry.groupId));
        gBtn.innerHTML = threadListItemHtml(entry.label, "", 0, {
          lastSender: "",
          lastPreview:
            entry.memberChips && entry.memberChips.length
              ? ""
              : entry.groupId
                ? "Tap to open team chat"
                : "Waiting for Admin to link this team chat",
          memberChips: entry.memberChips || [],
        });
        gBtn.addEventListener(
          "click",
          (function (entryCopy) {
            return function () {
              if (!entryCopy.groupId) {
                var errSetup = document.getElementById("internalChatTopErr");
                if (errSetup) {
                  errSetup.textContent =
                    "Team chat not linked yet. Ask Management to create " +
                    String(entryCopy.groupSlug || "lead_team") +
                    " in Admin CS Cliq.";
                  errSetup.hidden = false;
                }
                return;
              }
              global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
              global.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab = "groups";
              global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
              global.__PORTAL_INTERNAL_CHAT_UI.groupId = String(entryCopy.groupId);
              global.__PORTAL_INTERNAL_CHAT_UI.groupSlug = String(entryCopy.groupSlug || "");
              global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = entryCopy.label;
              markThreadReturnContext({ pane: "simplified", workerInboxTab: "groups" });
              if (typeof global.portalRenderInternalChatSheet === "function") {
                void global.portalRenderInternalChatSheet();
              }
            };
          })(entry)
        );
        listHost.appendChild(gBtn);
      }
    } catch (e) {
      listHost.innerHTML =
        '<p class="portal-dm-inbox-empty portal-dm-inbox-empty--err" style="min-width:0;overflow-wrap:break-word">' +
        esc(String((e && e.message) || e || "Could not load groups")) +
        "</p>";
    }
  }

  function ensureSimplifiedInboxSheetChrome(prof, inThread) {
    prof = profileRow(prof);
    inThread = !!inThread;
    var chatSheet = document.getElementById("internalChatSheet");
    if (!chatSheet) return;
    ensureSimplifiedInboxStyles();
    applyPortalChatShell(prof, inThread);
    if (inThread) return;
    chatSheet.classList.add("sheet--portal-chat-inbox");
    chatSheet.classList.remove("sheet--portal-chat-thread");
    chatSheet.removeAttribute("data-portal-chat-booting");
    chatSheet.setAttribute("data-inbox-pane", "chats");
    var listHost = document.getElementById("internalChatListWrap");
    var threadWrap = document.getElementById("internalChatThreadWrap");
    if (listHost) {
      listHost.hidden = false;
      listHost.setAttribute("aria-hidden", "false");
    }
    if (threadWrap) {
      threadWrap.hidden = true;
      threadWrap.setAttribute("aria-hidden", "true");
    }
    syncInboxChrome({ profile: prof, workerInboxTabs: true, inThread: false });
  }

  async function renderSimplifiedInboxList() {
    var box = global.__PORTAL_SUPABASE__ || {};
    var client = box.client;
    var prof = profileRow();
    var me = chatMeId(box);
    var listHost = document.getElementById("internalChatListWrap");
    var errTop = document.getElementById("internalChatTopErr");
    if (!listHost) return false;

    ensureSimplifiedInboxSheetChrome(prof, false);

    if (typeof global.portalSyncInternalChatSheetView === "function") {
      global.portalSyncInternalChatSheetView(false);
    }

    if (!client || !me) {
      listHost.innerHTML =
        '<p class="portal-dm-inbox-empty" style="min-width:0;overflow-wrap:break-word">Sign in to use chat.</p>';
      return true;
    }

    listHost.innerHTML = "";

    var tabDefs = simplifiedInboxTabDefs(prof);
    var activeTab = getWorkerInboxTab(prof);
    var tabIds = tabDefs.map(function (d) {
      return d.id;
    });
    if (tabIds.indexOf(activeTab) === -1) activeTab = tabIds[0] || "admin";
    applyPortalChatShell(prof, false);
    forceHideLegacyInboxChrome(prof, false);
    var acc = buildSimplifiedInboxAccordion(tabDefs, activeTab);
    listHost.appendChild(acc);
    bindSimplifiedInboxAccordion(listHost);

    try {
      var openBody = acc.querySelector(
        '.portal-cs-cliq-inbox-acc.is-open [data-simplified-acc-body="' + activeTab + '"]'
      );
      if (openBody) {
        await renderAccordionSectionBody(openBody, activeTab, client, me, prof);
      }
      if (errTop) {
        errTop.textContent = "";
        errTop.hidden = true;
      }
    } catch (e) {
      listHost.innerHTML =
        '<p class="portal-dm-inbox-empty portal-dm-inbox-empty--err" style="min-width:0;overflow-wrap:break-word">' +
        esc(String((e && e.message) || e || "Could not load chat")) +
        "</p>";
    }

    ensureSimplifiedInboxSheetChrome(prof, false);

    if (typeof global.portalStaffDmSyncUnreadChrome === "function") {
      void global.portalStaffDmSyncUnreadChrome();
    }
    return true;
  }

  function clearInternalChatBooting() {
    var chatSheet = document.getElementById("internalChatSheet");
    if (chatSheet) chatSheet.removeAttribute("data-portal-chat-booting");
    var prof = profileRow();
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var inThread = !!(String(ui.threadId || "").trim() || String(ui.groupId || "").trim());
    applyPortalChatShell(prof, inThread);
  }

  function simplifiedInboxRenderWrap(orig) {
    return async function portalRenderInternalChatSheetSimplifiedWrap() {
      var box = global.__PORTAL_SUPABASE__ || {};
      var prof = profileRow(box.staff_profile);
      var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
      var tid = ui.threadId ? String(ui.threadId).trim() : "";
      var gid = ui.groupId ? String(ui.groupId).trim() : "";
      var openAdmin = !!ui.openAdminChat;
      if (!tid && !gid && !openAdmin && portalStaffHasSimplifiedInboxTabs(prof)) {
        try {
          var ok = await renderSimplifiedInboxList();
          if (ok) return;
        } catch (_simpErr) {
          console.warn("[cs-cliq] simplified inbox render", _simpErr);
        }
      }
      return orig.apply(this, arguments);
    };
  }

  function installSimplifiedInboxRenderHook() {
    global.__PORTAL_CS_CLIQ_SIMPLIFIED_INBOX_HOOK__ = true;
    var attempts = 0;
    function tryHook() {
      if (typeof global.portalRenderInternalChatSheet !== "function") {
        if (++attempts < 240) setTimeout(tryHook, 50);
        return;
      }
      var current = global.portalRenderInternalChatSheet;
      if (current.__portalSimplifiedInboxWrap) return;
      var orig = current;
      if (current.__portalSimplifiedInboxOrig) {
        orig = current.__portalSimplifiedInboxOrig;
      } else if (!global.__PORTAL_RENDER_INTERNAL_CHAT_BASE__) {
        global.__PORTAL_RENDER_INTERNAL_CHAT_BASE__ = current;
        orig = current;
      } else if (global.__PORTAL_RENDER_INTERNAL_CHAT_BASE__) {
        orig = global.__PORTAL_RENDER_INTERNAL_CHAT_BASE__;
      }
      var wrapped = simplifiedInboxRenderWrap(orig);
      wrapped.__portalSimplifiedInboxWrap = true;
      wrapped.__portalSimplifiedInboxOrig = orig;
      if (current.__threadFilesBound) wrapped.__threadFilesBound = current.__threadFilesBound;
      global.portalRenderInternalChatSheet = wrapped;
    }
    tryHook();
  }

  function reinstallSimplifiedInboxRenderHook() {
    var base = global.__PORTAL_RENDER_INTERNAL_CHAT_BASE__;
    if (typeof base === "function") {
      global.portalRenderInternalChatSheet = base;
    }
    installSimplifiedInboxRenderHook();
    if (global.portalCsCliqThreadFiles && typeof global.portalCsCliqThreadFiles.bind === "function") {
      global.portalCsCliqThreadFiles.bind();
    }
  }

  function markThreadReturnContext(opts) {
    opts = opts || {};
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    if (opts.pane) global.__PORTAL_INTERNAL_CHAT_UI.returnPane = String(opts.pane);
    if (opts.workerInboxTab) {
      global.__PORTAL_INTERNAL_CHAT_UI.returnWorkerInboxTab = String(opts.workerInboxTab);
    }
  }

  function backFromInternalThread() {
    var prof = profileRow();
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var returnPane = String(ui.returnPane || "").trim();
    var returnTab = String(ui.returnWorkerInboxTab || ui.workerInboxTab || "").trim();

    global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
    global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
    global.__PORTAL_INTERNAL_CHAT_UI.openAdminChat = false;
    global.__PORTAL_INTERNAL_CHAT_UI.returnPane = "";

    if (portalStaffHasSimplifiedInboxTabs(prof) && returnTab) {
      setWorkerInboxTab(returnTab, prof);
    }

    var inp = document.getElementById("internalChatInput");
    if (inp) inp.value = "";

    if (returnPane === "directory") {
      global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "directory";
      syncInboxChrome({ inThread: false, profile: prof });
      void renderPeerDirectory();
      return;
    }

    syncInboxChrome({ inThread: false, profile: prof });
    if (typeof global.portalRenderInternalChatSheet === "function") {
      void global.portalRenderInternalChatSheet();
    }
  }

  async function openPeerChat(peerId) {
    peerId = String(peerId || "").trim();
    if (!peerId) return;
    if (portalStaffHasLeadRestrictedInbox() || portalStaffIsRestrictedWorkerChat()) {
      var box0 = global.__PORTAL_SUPABASE__ || {};
      var client0 = box0.client;
      if (client0) {
        var pr = await client0
          .from("staff_profiles")
          .select("id,app_role,staff_role,is_active")
          .eq("id", peerId)
          .maybeSingle();
        var peerRow = !pr.error && pr.data ? pr.data : null;
        if (!portalStaffWorkerMgmtPeerAllowed(peerRow)) {
          var errBlock = document.getElementById("internalChatTopErr");
          if (errBlock) {
            errBlock.textContent =
              "You can message Admin from the Admin tab. Programme groups are under My groups.";
            errBlock.hidden = false;
          }
          return;
        }
      }
    }
    var box = global.__PORTAL_SUPABASE__;
    var me = chatMeId(box);
    if (!me || peerId.toLowerCase() === me.toLowerCase()) return;

    var errTop = document.getElementById("internalChatTopErr");
    if (errTop) {
      errTop.textContent = "";
      errTop.hidden = true;
    }

    var threadId = "";
    try {
      var route = global.portalCsCliqSupportRoute || {};
      var profOpen = profileRow();
      var peerRow = null;
      if (box && box.client) {
        var pr0 = await box.client
          .from("staff_profiles")
          .select("id,app_role,staff_role,dashboard_route,is_active,full_name,username")
          .eq("id", peerId)
          .maybeSingle();
        peerRow = !pr0.error && pr0.data ? pr0.data : null;
      }
      if (
        portalStaffIsManagementMessenger(profOpen) &&
        peerRow &&
        ((route.isWorkerRecipient && route.isWorkerRecipient(peerRow)) ||
          (typeof global.portalInternalDmIsWorkerRecipient === "function" &&
            global.portalInternalDmIsWorkerRecipient(peerRow)))
      ) {
        if (typeof route.resolveManagementOpenWorkerThread === "function") {
          threadId = String(
            (await route.resolveManagementOpenWorkerThread(box.client, peerId)) || ""
          ).trim();
        }
      }
      if (!threadId && typeof global.portalStaffEnsureDmThreadBetween === "function") {
        threadId = String((await global.portalStaffEnsureDmThreadBetween(me, peerId)) || "").trim();
      }
    } catch (e) {
      if (errTop) {
        errTop.textContent =
          "Could not start chat: " +
          String((e && e.message) || e || "permission denied") +
          ". Leads need the team directory database update if this persists.";
        errTop.hidden = false;
      }
      return;
    }
    if (!threadId) {
      if (errTop) {
        errTop.textContent =
          "Could not open chat. Your account may not have permission to message this colleague yet.";
        errTop.hidden = false;
      }
      return;
    }

    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.threadId = threadId;
    global.__PORTAL_INTERNAL_CHAT_UI.groupId = "";
    if (
      portalStaffIsManagementMessenger(profOpen) &&
      peerRow &&
      global.portalCsCliqSupportRoute &&
      ((global.portalCsCliqSupportRoute.isWorkerRecipient &&
        global.portalCsCliqSupportRoute.isWorkerRecipient(peerRow)) ||
        (typeof global.portalInternalDmIsWorkerRecipient === "function" &&
          global.portalInternalDmIsWorkerRecipient(peerRow)))
    ) {
      global.__PORTAL_INTERNAL_CHAT_UI.managementWorkerId = peerId;
      global.__PORTAL_INTERNAL_CHAT_UI.workerId = peerId;
      global.__PORTAL_INTERNAL_CHAT_UI.inboxLane = "ops";
    } else {
      global.__PORTAL_INTERNAL_CHAT_UI.managementWorkerId = "";
      global.__PORTAL_INTERNAL_CHAT_UI.workerId = "";
      global.__PORTAL_INTERNAL_CHAT_UI.inboxLane = "";
    }
    if (isDirectoryTab(getInboxTab())) {
      markThreadReturnContext({ pane: "directory" });
    } else if (portalStaffHasSimplifiedInboxTabs(profOpen)) {
      markThreadReturnContext({
        pane: "simplified",
        workerInboxTab: getWorkerInboxTab(profOpen),
      });
    } else {
      markThreadReturnContext({ pane: "chats" });
    }
    global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "chats";
    var search = getSearchInput();
    if (search) search.value = "";
    syncSearchClearBtn();
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  async function openGroupChat(entry) {
    entry = entry || {};
    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var gid = String(entry.groupId || "").trim();
    if (!gid && entry.groupSlug && client) {
      var g = await client
        .from("portal_ceo_group")
        .select("id")
        .eq("slug", String(entry.groupSlug))
        .maybeSingle();
      if (!g.error && g.data && g.data.id) gid = String(g.data.id);
    }
    if (!gid) {
      var errTop = document.getElementById("internalChatTopErr");
      if (errTop) {
        errTop.textContent =
          "Directors group is not set up yet. Ask ops to apply the portal database update.";
        errTop.hidden = false;
      }
      return;
    }

    var errTopG = document.getElementById("internalChatTopErr");
    if (errTopG) {
      errTopG.textContent = "";
      errTopG.hidden = true;
    }

    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
    global.__PORTAL_INTERNAL_CHAT_UI.groupId = gid;
    global.__PORTAL_INTERNAL_CHAT_UI.groupSlug = String(entry.groupSlug || "").trim();
    global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = String(entry.label || STAFF_MGMT_GROUP_LABEL);
    setWorkerInboxTab("groups", profileRow());
    markThreadReturnContext({ pane: "simplified", workerInboxTab: "groups" });
    global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "chats";
    var search = getSearchInput();
    if (search) search.value = "";
    syncSearchClearBtn();
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  async function renderPeerDirectory(query) {
    bindInboxNav();
    var host = document.getElementById("internalChatStaffDirectoryList");
    if (!host) return;

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var me = chatMeId(box);
    var mode = getDirectoryMode(box && box.staff_profile);

    if (!mode) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML =
      '<p class="portal-dm-lead-empty">Loading ' +
      (mode === "leads"
        ? "leads"
        : mode === "directors"
          ? "directors"
          : mode === "staffmgmt"
            ? "management contacts"
            : mode === "ceo_exec"
              ? "directors"
              : mode === "csteam"
                ? "CS Team"
                : "team") +
      "...</p>";

    try {
      var rows = await loadDirectoryRows(client, me, mode);
      var q = typeof query === "string" ? query : getSearchQuery();
      rows = filterStaffRows(rows, q);

      host.innerHTML = "";
      if (!rows.length) {
        host.innerHTML =
          '<p class="portal-dm-lead-empty">' + directoryEmptyMessage(q, mode) + "</p>";
        return;
      }

      if (mode === "csteam") {
        appendCsteamAccordion(host, rows);
      } else if (mode === "staffmgmt") {
        appendStaffMgmtAccordion(host, rows);
      } else {
        appendStaffRows(host, rows);
      }
    } catch (e) {
      host.innerHTML =
        '<p class="portal-dm-lead-empty portal-dm-lead-empty--err">' +
        esc(String((e && e.message) || e || "Could not load directory")) +
        "</p>";
    }
  }

  async function renderStaffDirectory(query) {
    return renderPeerDirectory(query);
  }

  async function renderStaffSuggestions(query) {
    bindInboxNav();
    var host = document.getElementById("internalChatLeadStaffSuggestions");
    var prof = profileRow();
    if (
      !host ||
      portalStaffHasSimplifiedInboxTabs(prof) ||
      !portalStaffHasPeerDirectory(prof) ||
      getInboxTab() !== "chats"
    ) {
      if (host) {
        host.hidden = true;
        host.innerHTML = "";
      }
      return;
    }

    var q = typeof query === "string" ? query : getSearchQuery();
    if (!q) {
      host.hidden = true;
      host.innerHTML = "";
      host.setAttribute("aria-hidden", "true");
      return;
    }

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var me = chatMeId(box);
    var mode = getDirectoryMode(box && box.staff_profile);

    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = '<p class="portal-dm-lead-empty">Searching team?</p>';

    try {
      var mode = getDirectoryMode(box && box.staff_profile) || "staff";
      var rows = filterStaffRows(await loadDirectoryRows(client, me, mode), q);
      host.innerHTML = "";
      if (!rows.length) {
        var noun =
          mode === "leads"
            ? "leads"
            : mode === "staffmgmt"
              ? "management contacts"
              : mode === "csteam"
                ? "CS Team members"
                : "staff";
        host.innerHTML =
          '<p class="portal-dm-lead-empty">No ' + esc(noun) + " match ?" + esc(q) + "?.</p>";
        return;
      }

      var heading = document.createElement("p");
      heading.className = "portal-dm-lead-suggestions-title";
      heading.textContent =
        mode === "leads"
          ? rows.length === 1
            ? "Message a lead"
            : "Message a session lead"
          : mode === "directors"
            ? rows.length === 1
              ? "Message a director or admin"
              : "Message a director or admin"
            : mode === "staffmgmt"
              ? rows.length === 1
                ? "Message management"
                : "Message management"
            : mode === "csteam"
              ? rows.length === 1
                ? "Message someone on CS Team"
                : "Message someone on CS Team"
              : rows.length === 1
                ? "Message someone"
                : "Message someone on the team";
      host.appendChild(heading);

      var list = document.createElement("div");
      list.className = "portal-dm-lead-suggestions-list";
      appendStaffRows(list, rows.slice(0, 12));
      host.appendChild(list);
    } catch (e) {
      host.innerHTML =
        '<p class="portal-dm-lead-empty portal-dm-lead-empty--err">' +
        esc(String((e && e.message) || e || "Could not search staff")) +
        "</p>";
    }
  }

  function portalStaffChatProfilePending(prof) {
    if (!portalStaffOnWorkerDashboard()) return false;
    return !String(profileRow(prof).app_role || "").trim();
  }

  /** Synchronous shell before async render — avoids lead inbox flash on staff_dashboard. */
  function portalPrimeInternalChatShell() {
    var chatSheet = document.getElementById("internalChatSheet");
    if (!chatSheet || !chatSheet.classList.contains("open")) return;
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var tid = ui.threadId ? String(ui.threadId).trim() : "";
    var gid = ui.groupId ? String(ui.groupId).trim() : "";
    var inThread = !!(tid || gid);
    var prof = profileRow();
    var restricted = portalStaffIsRestrictedWorkerChat(prof);
    var leadRestricted = portalStaffHasLeadRestrictedInbox(prof);
    var hasDirectory = portalStaffHasPeerDirectory(prof);

    syncInboxChrome({
      profile: prof,
      hasDirectory: restricted || leadRestricted ? false : hasDirectory,
      workerInboxTabs: restricted || leadRestricted ? true : undefined,
      inThread: inThread,
    });

    if ((restricted || leadRestricted) && !inThread) {
      applyPortalChatShell(prof, false);
      forceHideLegacyInboxChrome(prof, false);
    }

    var listHost = document.getElementById("internalChatListWrap");
    var threadWrap = document.getElementById("internalChatThreadWrap");

    if (inThread) {
      if (listHost) {
        listHost.hidden = true;
        listHost.setAttribute("aria-hidden", "true");
      }
      if (threadWrap) {
        threadWrap.hidden = false;
        threadWrap.setAttribute("aria-hidden", "false");
      }
      chatSheet.classList.add("sheet--portal-chat-thread");
      chatSheet.classList.remove("sheet--portal-chat-inbox");
      var msgsBox = document.getElementById("internalChatMessages");
      if (msgsBox && !msgsBox.querySelector(".portal-dm-msg-row")) {
        msgsBox.innerHTML = '<p class="muted portal-dm-inbox-loading" style="margin:0">Loading…</p>';
      }
    } else if (restricted || leadRestricted || portalStaffChatProfilePending(prof)) {
      if (threadWrap) {
        threadWrap.hidden = true;
        threadWrap.setAttribute("aria-hidden", "true");
      }
      if (listHost) {
        listHost.hidden = false;
        listHost.setAttribute("aria-hidden", "false");
        chatSheet.classList.add("sheet--portal-chat-inbox");
        chatSheet.classList.remove("sheet--portal-chat-thread");
        listHost.innerHTML =
          '<p class="alerts-sheet-placeholder muted portal-dm-inbox-loading" style="min-width:0;overflow-wrap:break-word">Loading chat…</p>';
      } else {
        chatSheet.classList.add("sheet--portal-chat-inbox");
        chatSheet.classList.remove("sheet--portal-chat-thread");
      }
    }

    applyPortalChatShell(prof, inThread);
    if (
      inThread &&
      global.portalCsCliqThreadHeader &&
      typeof global.portalCsCliqThreadHeader.syncThreadBackChrome === "function"
    ) {
      global.portalCsCliqThreadHeader.syncThreadBackChrome(true);
    }
  }

  function initWorkerPeerInbox() {
    bindInboxNav();
    installSimplifiedInboxRenderHook();
    var prof = profileRow();
    if (portalStaffHasSimplifiedInboxTabs(prof)) {
      syncInboxChrome({ profile: prof, workerInboxTabs: true, inThread: false });
      return;
    }
    syncInboxChrome({ profile: prof, inThread: false });
    if (!portalStaffHasPeerDirectory(prof)) return;
    try {
      delete global[CACHE_KEY_STAFF];
      delete global[CACHE_KEY_CSTEAM];
      delete global[CACHE_KEY_LEADS];
      delete global[CACHE_KEY_DIRECTORS];
      delete global[CACHE_KEY_STAFFMGMT];
      delete global[CACHE_KEY_CEO_EXEC];
    } catch (_cache) {}
    if (getInboxTab() === "directory") {
      void renderPeerDirectory();
    }
  }

  function initLeadInbox() {
    return initWorkerPeerInbox();
  }

  function profileRowFromDirectoryEntry(entry) {
    if (!entry || !entry.id) return null;
    var cat = String(entry.category || "").toLowerCase();
    var appRole = cat === "ceo" ? "ceo" : cat === "admin" ? "admin" : cat === "lead" ? "lead" : "staff";
    return {
      id: String(entry.id),
      full_name: String(entry.label || "").trim(),
      username: String(entry.username || "").trim(),
      app_role: appRole,
      staff_role: String(entry.staffRoleKey || "").replace(/_/g, " "),
      avatar_url: String(entry.avatarUrl || "").trim(),
    };
  }

  function chatMeId(box) {
    box = box || global.__PORTAL_SUPABASE__ || {};
    if (global.portalChatActorIdentity && typeof global.portalChatActorIdentity.actorId === "function") {
      return global.portalChatActorIdentity.actorId();
    }
    return String(
      (box.session && box.session.user && box.session.user.id) ||
        (box.staff_profile && box.staff_profile.id) ||
        ""
    ).trim();
  }

  function blurFocusWithin(el) {
    if (!el) return;
    try {
      var active = document.activeElement;
      if (active && el.contains(active) && typeof active.blur === "function") active.blur();
    } catch (_blur) {}
  }

  async function loadProfilesForDmThreads(client, rows, me) {
    me = String(me || chatMeId()).trim();
    rows = Array.isArray(rows) ? rows : [];
    var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var ids = [];
    rows.forEach(function (r) {
      if (!r) return;
      if (r.participant_a) ids.push(String(r.participant_a));
      if (r.participant_b) ids.push(String(r.participant_b));
    });
    ids = ids.filter(function (id, idx, arr) {
      return id && uuidRe.test(id) && id.toLowerCase() !== me.toLowerCase() && arr.indexOf(id) === idx;
    });

    var profBy = {};
    if (!client || !ids.length) return profBy;

    var selectCols = "id,full_name,username,app_role,staff_role";
    var res = await client.from("staff_profiles").select(selectCols).in("id", ids);
    if (!res.error && Array.isArray(res.data)) {
      res.data.forEach(function (p) {
        if (p && p.id) profBy[String(p.id)] = p;
      });
    }

    var missing = ids.filter(function (id) {
      return !profBy[id];
    });
    if (missing.length) {
      try {
        var dirRows = await loadDirectoryRows(client, me, "csteam", { force: false });
        dirRows.forEach(function (dr) {
          if (!dr || !dr.id) return;
          var id = String(dr.id);
          if (!profBy[id]) profBy[id] = profileRowFromDirectoryEntry(dr);
        });
      } catch (_dir) {}
    }

    return profBy;
  }

  function threadInboxDisplayLabel(me, row, profBy) {
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.threadDisplayLabel === "function"
    ) {
      return global.portalChatActorIdentity.threadDisplayLabel(me, row, profBy);
    }
    profBy = profBy || {};
    me = String(me || "").trim();
    if (!row) return "Conversation";
    var a = String(row.participant_a || "");
    var b = String(row.participant_b || "");
    var pa = profBy[a] || {};
    var pb = profBy[b] || {};
    function nameFrom(prof, id) {
      return peerLabelFromRow(prof) || (id ? id.slice(0, 8) : "");
    }
    if (portalStaffIsSessionLead(pa) && portalStaffIsSessionLead(pb) && a && b && a !== b) {
      return nameFrom(pa, a) + " \u2194 " + nameFrom(pb, b);
    }
    if (a && b && a !== b && me && a !== me && b !== me) {
      return nameFrom(pa, a) + " \u2194 " + nameFrom(pb, b);
    }
    var peer = a === me ? b : b === me ? a : b || a;
    return nameFrom(profBy[peer] || {}, peer) || "Colleague";
  }

  global.portalLeadStaffChatDirectory = {
    portalStaffOnWorkerDashboard: portalStaffOnWorkerDashboard,
    portalStaffOnLeadDashboard: portalStaffOnLeadDashboard,
    portalStaffHasFullMessengerAccess: portalStaffHasFullMessengerAccess,
    portalStaffChatProfilePending: portalStaffChatProfilePending,
    portalPrimeInternalChatShell: portalPrimeInternalChatShell,
    portalStaffIsLeadUser: portalStaffIsLeadUser,
    portalStaffIsSessionLead: portalStaffIsSessionLead,
    portalStaffIsManagementMessenger: portalStaffIsManagementMessenger,
    portalStaffHasLeadRestrictedInbox: portalStaffHasLeadRestrictedInbox,
    portalStaffHasSimplifiedInboxTabs: portalStaffHasSimplifiedInboxTabs,
    renderSimplifiedInboxList: renderSimplifiedInboxList,
    portalStaffIsStaffUser: portalStaffIsStaffUser,
    portalStaffHasPeerDirectory: portalStaffHasPeerDirectory,
    staffInitiatePeer: staffInitiatePeer,
    portalStaffIsRestrictedWorkerChat: portalStaffIsRestrictedWorkerChat,
    portalStaffWorkerMgmtPeerAllowed: portalStaffWorkerMgmtPeerAllowed,
    staffRoleChipKeyFromProfile: staffRoleChipKeyFromProfile,
    peerRoleChipLabel: peerRoleChipLabel,
    roleChipClassForProfile: roleChipClassForProfile,
    directoryCategoryKey: directoryCategoryKey,
    syncInboxChrome: syncInboxChrome,
    forceHideLegacyInboxChrome: forceHideLegacyInboxChrome,
    renderStaffDirectory: renderStaffDirectory,
    renderPeerDirectory: renderPeerDirectory,
    renderStaffSuggestions: renderStaffSuggestions,
    openPeerChat: openPeerChat,
    openGroupChat: openGroupChat,
    backFromInternalThread: backFromInternalThread,
    markThreadReturnContext: markThreadReturnContext,
    resolveLeadAdminThreadId: resolveLeadAdminThreadId,
    openLeadAdminChat: openLeadAdminChat,
    loadStaffMgmtDirectoryRows: loadStaffMgmtDirectoryRows,
    loadCeoExecDirectoryRows: loadCeoExecDirectoryRows,
    portalStaffIsCeoTrioOnWorkerDashboard: portalStaffIsCeoTrioOnWorkerDashboard,
    resolveStaffPoolGroupEntry: resolveStaffPoolGroupEntry,
    appendWorkerPoolGroupInboxRow: appendWorkerPoolGroupInboxRow,
    STAFF_MGMT_GROUP_SLUG: STAFF_MGMT_GROUP_SLUG,
    STAFF_MGMT_GROUP_LABEL: STAFF_MGMT_GROUP_LABEL,
    initLeadInbox: initLeadInbox,
    initWorkerPeerInbox: initWorkerPeerInbox,
    ensureSimplifiedInboxSheetChrome: ensureSimplifiedInboxSheetChrome,
    applyPortalChatShell: applyPortalChatShell,
    renderSimplifiedInboxList: renderSimplifiedInboxList,
    reinstallSimplifiedInboxRenderHook: reinstallSimplifiedInboxRenderHook,
    getInboxTab: getInboxTab,
    setInboxTab: setInboxTab,
    getWorkerInboxTab: getWorkerInboxTab,
    setWorkerInboxTab: setWorkerInboxTab,
    portalStaffHasWorkerInboxTabs: portalStaffHasWorkerInboxTabs,
    workerGroupTabLabel: workerGroupTabLabel,
    getSearchQuery: getSearchQuery,
    matchesSearchQuery: matchesSearchQuery,
    initialsFromLabel: initialsFromLabel,
    getDirectoryMode: getDirectoryMode,
    loadProfilesForDmThreads: loadProfilesForDmThreads,
    threadInboxDisplayLabel: threadInboxDisplayLabel,
    clearCache: function () {
      try {
        delete global[CACHE_KEY_STAFF];
        delete global[CACHE_KEY_CSTEAM];
        delete global[CACHE_KEY_LEADS];
        delete global[CACHE_KEY_DIRECTORS];
        delete global[CACHE_KEY_STAFFMGMT];
        delete global[CACHE_KEY_CEO_EXEC];
      } catch (_e) {}
    },
  };

  installSimplifiedInboxRenderHook();
  ensureSimplifiedInboxStyles();
})(typeof window !== "undefined" ? window : globalThis);
