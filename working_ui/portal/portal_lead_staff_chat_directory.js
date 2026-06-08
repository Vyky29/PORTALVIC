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

  /** Session lead (app_role lead) - not admin/CEO on another shell. */
  function portalStaffIsSessionLead(prof) {
    var row = profileRow(prof);
    return String(row.app_role || "").toLowerCase() === "lead";
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
    if (portalStaffIsCeoTrioOnWorkerDashboard(prof)) return true;
    if (portalStaffOnWorkerDashboard() && !portalStaffIsSessionLead(prof)) return false;
    return portalStaffIsLeadUser(prof);
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

  function getDirectoryMode(prof) {
    if (portalStaffIsSessionLead(prof)) return "csteam";
    if (portalStaffIsCeoTrioOnWorkerDashboard(prof)) return "ceo_exec";
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
    { key: "admin", label: "Admin", icon: "shield" },
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
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
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
    var hasDirectory =
      opts.hasDirectory != null ? !!opts.hasDirectory : portalStaffHasPeerDirectory(prof);
    if (portalStaffOnWorkerDashboard() && portalStaffIsRestrictedWorkerChat(prof)) {
      hasDirectory = false;
    }
    var inThread = !!opts.inThread;
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    var nav = document.getElementById("internalChatLeadInboxNav");
    var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
    var suggestions = document.getElementById("internalChatLeadStaffSuggestions");
    var listWrap = document.getElementById("internalChatListWrap");
    var tab = getInboxTab();
    var dirMode = getDirectoryMode(prof);

    if (chrome) {
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
        listWrap.hidden = true;
      }
      return;
    }

    bindInboxNav();

    if (listWrap) {
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
        global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
        global.__PORTAL_INTERNAL_CHAT_UI.groupId = String(entry.groupId);
        global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = entry.label;
        void global.portalRenderInternalChatSheet();
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

  async function openPeerChat(peerId) {
    peerId = String(peerId || "").trim();
    if (!peerId) return;
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
      if (typeof global.portalStaffEnsureDmThreadBetween === "function") {
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
    global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = String(entry.label || STAFF_MGMT_GROUP_LABEL);
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
    if (!host || !portalStaffHasPeerDirectory() || getInboxTab() !== "chats") {
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
    var hasDirectory = portalStaffHasPeerDirectory(prof);

    syncInboxChrome({ profile: prof, hasDirectory: hasDirectory, inThread: inThread });

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
    } else if (restricted || portalStaffChatProfilePending(prof)) {
      if (threadWrap) {
        threadWrap.hidden = true;
        threadWrap.setAttribute("aria-hidden", "true");
      }
      if (listHost) {
        listHost.hidden = false;
        listHost.setAttribute("aria-hidden", "false");
        listHost.innerHTML =
          '<p class="alerts-sheet-placeholder muted portal-dm-inbox-loading" style="min-width:0;overflow-wrap:break-word">Loading chat…</p>';
      }
      chatSheet.classList.add("sheet--portal-chat-inbox");
      chatSheet.classList.remove("sheet--portal-chat-thread");
    }

    try {
      chatSheet.setAttribute(
        "data-portal-chat-shell",
        restricted ? "worker" : hasDirectory ? "lead" : "standard"
      );
    } catch (_attr) {}
  }

  function initWorkerPeerInbox() {
    bindInboxNav();
    var prof = profileRow();
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
    renderStaffDirectory: renderStaffDirectory,
    renderPeerDirectory: renderPeerDirectory,
    renderStaffSuggestions: renderStaffSuggestions,
    openPeerChat: openPeerChat,
    openGroupChat: openGroupChat,
    loadStaffMgmtDirectoryRows: loadStaffMgmtDirectoryRows,
    loadCeoExecDirectoryRows: loadCeoExecDirectoryRows,
    portalStaffIsCeoTrioOnWorkerDashboard: portalStaffIsCeoTrioOnWorkerDashboard,
    resolveStaffPoolGroupEntry: resolveStaffPoolGroupEntry,
    appendWorkerPoolGroupInboxRow: appendWorkerPoolGroupInboxRow,
    STAFF_MGMT_GROUP_SLUG: STAFF_MGMT_GROUP_SLUG,
    STAFF_MGMT_GROUP_LABEL: STAFF_MGMT_GROUP_LABEL,
    initLeadInbox: initLeadInbox,
    initWorkerPeerInbox: initWorkerPeerInbox,
    getInboxTab: getInboxTab,
    setInboxTab: setInboxTab,
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
})(typeof window !== "undefined" ? window : globalThis);
