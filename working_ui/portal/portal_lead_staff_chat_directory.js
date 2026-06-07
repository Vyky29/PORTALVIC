/**
 * Lead dashboard ? staff directory in internal chat (WhatsApp-style contact list).
 */
(function (global) {
  "use strict";

  var CACHE_KEY_STAFF = "__PORTAL_LEAD_STAFF_DIRECTORY_ROWS__";
  var CACHE_KEY_LEADS = "__PORTAL_STAFF_LEADS_DIRECTORY_ROWS__";
  var CACHE_KEY_DIRECTORS = "__PORTAL_STAFF_DIRECTORS_DIRECTORY_ROWS__";

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

  function profileRow(prof) {
    return prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  /** Full messenger inbox (search, staff directory, calls) � lead, admin, CEO on any portal. */
  function portalStaffHasFullMessengerAccess(prof) {
    var row = profileRow(prof);
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "lead" || ar === "admin" || ar === "ceo") return true;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr === "lead_dashboard.html" || dr === "admin_dashboard.html" || dr === "ceo_dashboard.html") {
      return true;
    }
    try {
      var path = String((typeof location !== "undefined" && location.pathname) || "");
      if (/lead_dashboard\.html|admin_dashboard\.html|ceo_dashboard\.html/i.test(path)) {
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function portalStaffIsLeadUser(prof) {
    return portalStaffHasFullMessengerAccess(prof);
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
    return portalStaffIsLeadUser(prof) || portalStaffIsStaffUser(prof);
  }

  function staffInitiatePeer(row) {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmStaffInitiatePeer === "function") {
      return global.portalDmRoles.portalDmStaffInitiatePeer(row);
    }
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function getDirectoryMode(prof) {
    if (portalStaffIsLeadUser(prof)) return "staff";
    if (portalStaffIsStaffUser(prof)) return "directors";
    return "";
  }

  function directoryCacheKey(mode) {
    if (mode === "leads") return CACHE_KEY_LEADS;
    if (mode === "directors") return CACHE_KEY_DIRECTORS;
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
    return !!(sr && sr !== "manager" && sr !== "admin");
  }

  function peerLabelFromRow(row) {
    if (!row) return "";
    return String(row.full_name || row.username || "").trim();
  }

  function roleSubtitle(row) {
    if (!row) return "Staff";
    var ar = String(row.app_role || "").toLowerCase();
    var sr = String(row.staff_role || "").toLowerCase();
    if (ar === "ceo") return "CEO";
    if (ar === "admin") return "Admin";
    if (ar === "lead") return "Lead";
    if (sr === "manager") return "Manager";
    if (sr) return sr.charAt(0).toUpperCase() + sr.slice(1).replace(/_/g, " ");
    if (ar === "staff") return "Staff";
    return "Team";
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

  function staffDirectoryItemHtml(row) {
    return (
      '<span class="portal-dm-staff-directory-avatar" aria-hidden="true">' +
      esc(initialsFromLabel(row.label)) +
      "</span>" +
      '<span class="portal-dm-staff-directory-copy">' +
      '<span class="portal-dm-staff-directory-name">' +
      esc(row.label) +
      "</span>" +
      '<span class="portal-dm-staff-directory-role">' +
      esc(row.role) +
      "</span></span>"
    );
  }

  function appendStaffRows(host, rows) {
    if (!host) return;
    host.innerHTML = "";
    rows.forEach(function (r) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-dm-staff-directory-item";
      btn.setAttribute("role", "listitem");
      btn.setAttribute("data-staff-peer", r.id);
      btn.innerHTML = staffDirectoryItemHtml(r);
      btn.addEventListener("click", function () {
        void openPeerChat(r.id);
      });
      host.appendChild(btn);
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
        mode === "leads" ? "leads" : mode === "directors" ? "directors" : "staff";
    } else {
      global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "chats";
    }
  }

  function syncInboxChrome(opts) {
    opts = opts || {};
    var prof = profileRow(opts.profile);
    var hasDirectory =
      opts.hasDirectory != null ? !!opts.hasDirectory : portalStaffHasPeerDirectory(prof);
    var inThread = !!opts.inThread;
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    var nav = document.getElementById("internalChatLeadInboxNav");
    var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
    var suggestions = document.getElementById("internalChatLeadStaffSuggestions");
    var listWrap = document.getElementById("internalChatListWrap");
    var tab = getInboxTab();
    var query = getSearchQuery();
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
        else if (dirMode === "directors") dirBtn.textContent = "Directors";
        else if (dirMode === "staff") dirBtn.textContent = "Staff";
      }
      var search = getSearchInput();
      if (search) {
        if (dirMode === "leads") search.placeholder = "Search leads or chats...";
        else if (dirMode === "directors") search.placeholder = "Search directors or chats...";
        else search.placeholder = "Search staff or chats...";
      }
    }

    if (!hasDirectory || inThread) {
      if (staffWrap) {
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
    syncSearchClearBtn();

    if (listWrap) {
      listWrap.hidden = tab !== "chats";
      listWrap.setAttribute("aria-hidden", tab === "chats" ? "false" : "true");
    }
    if (staffWrap) {
      staffWrap.hidden = tab !== "directory";
      staffWrap.setAttribute("aria-hidden", tab === "directory" ? "false" : "true");
    }
    if (suggestions) {
      var showSuggestions = tab === "chats" && !!query;
      suggestions.hidden = !showSuggestions;
      suggestions.setAttribute("aria-hidden", showSuggestions ? "false" : "true");
    }

    if (hasDirectory && !inThread && dirMode) {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      var me = String(
        (box && box.staff_profile && box.staff_profile.id) ||
          (box && box.session && box.session.user && box.session.user.id) ||
          ""
      ).trim();
      void loadDirectoryRows(client, me, dirMode);
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
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    if (!chrome || chrome.dataset.portalLeadInboxBound) return;
    chrome.dataset.portalLeadInboxBound = "1";

    chrome.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-inbox-tab]");
      if (!btn) return;
      var tab = String(btn.getAttribute("data-inbox-tab") || "").toLowerCase();
      setInboxTab(isDirectoryTab(tab) ? "directory" : "chats");
      syncInboxChrome({ inThread: false });
      if (isDirectoryTab(tab)) {
        void renderPeerDirectory();
      } else if (typeof global.portalRenderInternalChatSheet === "function") {
        void global.portalRenderInternalChatSheet();
      }
    });

    var search = getSearchInput();
    if (search && !search.dataset.portalLeadSearchBound) {
      search.dataset.portalLeadSearchBound = "1";
      var deb;
      search.addEventListener("input", function () {
        if (deb) clearTimeout(deb);
        deb = setTimeout(function () {
          deb = null;
          onSearchInput();
        }, 160);
      });
      search.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") {
          search.value = "";
          onSearchInput();
        }
      });
    }

    var clearBtn = document.getElementById("internalChatLeadSearchClear");
    if (clearBtn && !clearBtn.dataset.portalLeadClearBound) {
      clearBtn.dataset.portalLeadClearBound = "1";
      clearBtn.addEventListener("click", function () {
        var searchEl = getSearchInput();
        if (searchEl) {
          searchEl.value = "";
          searchEl.focus();
        }
        onSearchInput();
      });
    }
  }

  function directoryEmptyMessage(query, mode) {
    mode = mode || "staff";
    if (query) {
      if (mode === "leads") return "No leads match your search.";
      if (mode === "directors") return "No directors or admin match your search.";
      return "No staff match your search.";
    }
    if (mode === "leads") {
      return (
        "No session leads found. " +
        "If you expected leads here, ask ops to apply the latest portal database update (staff?lead team chat)."
      );
    }
    if (mode === "directors") {
      return "No directors or admin found. Contact ops if you expected Raul, Javier, Victor, or admin here.";
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
    if (mode === "staff") return ar !== "lead" && ar !== "admin" && ar !== "ceo";
    return true;
  }

  async function loadDirectoryRows(client, me, mode, opts) {
    opts = opts || {};
    mode = mode === "leads" ? "leads" : mode === "directors" ? "directors" : "staff";
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
          var id = String(row.id || "").trim();
          if (!id || id.toLowerCase() === String(me).toLowerCase()) return;
          var label = peerLabelFromRow(row);
          if (!label) return;
          rows.push({
            id: id,
            label: label,
            role: roleSubtitle(row),
            sortKey: normKey(label),
          });
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
              var label = peerLabelFromRow(row);
              if (!label) return;
              rows.push({
                id: id,
                label: label,
                role: roleSubtitle(row),
                sortKey: normKey(label),
              });
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
      return normKey(r.label).indexOf(q) >= 0 || normKey(r.role).indexOf(q) >= 0;
    });
  }

  async function openPeerChat(peerId) {
    peerId = String(peerId || "").trim();
    if (!peerId) return;
    var box = global.__PORTAL_SUPABASE__;
    var me = String(
      (box && box.staff_profile && box.staff_profile.id) ||
        (box && box.session && box.session.user && box.session.user.id) ||
        ""
    ).trim();
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
    var me = String(
      (box && box.staff_profile && box.staff_profile.id) ||
        (box && box.session && box.session.user && box.session.user.id) ||
        ""
    ).trim();
    var mode = getDirectoryMode(box && box.staff_profile);

    if (!mode) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML =
      '<p class="portal-dm-lead-empty">Loading ' +
      (mode === "leads" ? "leads" : mode === "directors" ? "directors" : "team") +
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

      appendStaffRows(host, rows);
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
    var me = String(
      (box && box.staff_profile && box.staff_profile.id) ||
        (box && box.session && box.session.user && box.session.user.id) ||
        ""
    ).trim();

    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = '<p class="portal-dm-lead-empty">Searching team?</p>';

    try {
      var mode = getDirectoryMode(box && box.staff_profile) || "staff";
      var rows = filterStaffRows(await loadDirectoryRows(client, me, mode), q);
      host.innerHTML = "";
      if (!rows.length) {
        var noun = mode === "leads" ? "leads" : "staff";
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

  function initWorkerPeerInbox() {
    bindInboxNav();
    if (!portalStaffHasPeerDirectory()) return;
    try {
      delete global[CACHE_KEY_STAFF];
      delete global[CACHE_KEY_LEADS];
      delete global[CACHE_KEY_DIRECTORS];
    } catch (_cache) {}
    syncInboxChrome({ inThread: false });
    if (getInboxTab() === "directory") {
      void renderPeerDirectory();
    }
  }

  function initLeadInbox() {
    return initWorkerPeerInbox();
  }

  global.portalLeadStaffChatDirectory = {
    portalStaffHasFullMessengerAccess: portalStaffHasFullMessengerAccess,
    portalStaffIsLeadUser: portalStaffIsLeadUser,
    portalStaffIsStaffUser: portalStaffIsStaffUser,
    portalStaffHasPeerDirectory: portalStaffHasPeerDirectory,
    staffInitiatePeer: staffInitiatePeer,
    portalStaffIsRestrictedWorkerChat: portalStaffIsRestrictedWorkerChat,
    syncInboxChrome: syncInboxChrome,
    renderStaffDirectory: renderStaffDirectory,
    renderPeerDirectory: renderPeerDirectory,
    renderStaffSuggestions: renderStaffSuggestions,
    openPeerChat: openPeerChat,
    initLeadInbox: initLeadInbox,
    initWorkerPeerInbox: initWorkerPeerInbox,
    getInboxTab: getInboxTab,
    setInboxTab: setInboxTab,
    getSearchQuery: getSearchQuery,
    matchesSearchQuery: matchesSearchQuery,
    initialsFromLabel: initialsFromLabel,
    getDirectoryMode: getDirectoryMode,
    clearCache: function () {
      try {
        delete global[CACHE_KEY_STAFF];
        delete global[CACHE_KEY_LEADS];
        delete global[CACHE_KEY_DIRECTORS];
      } catch (_e) {}
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
