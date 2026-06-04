/**
 * Lead dashboard ù staff directory in internal chat (WhatsApp-style contact list).
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "__PORTAL_LEAD_STAFF_DIRECTORY_ROWS__";

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

  function portalStaffIsLeadUser(prof) {
    var row = profileRow(prof);
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "lead") return true;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr === "lead_dashboard.html") return true;
    try {
      if (typeof location !== "undefined" && /lead_dashboard\.html/i.test(String(location.pathname || ""))) {
        return true;
      }
    } catch (_e) {}
    return false;
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
    return String(ui.inboxTab || "chats").toLowerCase() === "staff" ? "staff" : "chats";
  }

  function setInboxTab(tab) {
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = tab === "staff" ? "staff" : "chats";
  }

  function syncInboxChrome(opts) {
    opts = opts || {};
    var isLead = !!opts.isLead;
    var inThread = !!opts.inThread;
    var chrome = document.getElementById("internalChatLeadInboxChrome");
    var nav = document.getElementById("internalChatLeadInboxNav");
    var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
    var suggestions = document.getElementById("internalChatLeadStaffSuggestions");
    var listWrap = document.getElementById("internalChatListWrap");
    var tab = getInboxTab();
    var query = getSearchQuery();

    if (chrome) {
      chrome.hidden = !isLead || inThread;
      chrome.setAttribute("aria-hidden", !isLead || inThread ? "true" : "false");
    }
    if (nav && isLead && !inThread) {
      var chatsBtn = document.getElementById("internalChatInboxTabChats");
      var staffBtn = document.getElementById("internalChatInboxTabStaff");
      if (chatsBtn) chatsBtn.classList.toggle("is-active", tab === "chats");
      if (staffBtn) staffBtn.classList.toggle("is-active", tab === "staff");
    }

    if (!isLead || inThread) {
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
      staffWrap.hidden = tab !== "staff";
      staffWrap.setAttribute("aria-hidden", tab === "staff" ? "false" : "true");
    }
    if (suggestions) {
      var showSuggestions = tab === "chats" && !!query;
      suggestions.hidden = !showSuggestions;
      suggestions.setAttribute("aria-hidden", showSuggestions ? "false" : "true");
    }

    if (isLead && !inThread) {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      var me = String(
        (box && box.staff_profile && box.staff_profile.id) ||
          (box && box.session && box.session.user && box.session.user.id) ||
          ""
      ).trim();
      void loadStaffRows(client, me);
    }
  }

  function onSearchInput() {
    syncSearchClearBtn();
    syncInboxChrome({ isLead: true, inThread: false });
    var tab = getInboxTab();
    if (tab === "staff") {
      void renderStaffDirectory();
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
      setInboxTab(tab === "staff" ? "staff" : "chats");
      syncInboxChrome({ isLead: true, inThread: false });
      if (tab === "staff") {
        void renderStaffDirectory();
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

  function directoryEmptyMessage(query) {
    if (query) {
      return "No staff match your search.";
    }
    return (
      "No colleagues found in the team directory. " +
      "If you expected staff here, ask ops to apply the latest portal database update (lead team chat)."
    );
  }

  async function loadStaffRows(client, me, opts) {
    opts = opts || {};
    if (!client || !me) return [];
    if (!opts.force && global[CACHE_KEY] && Array.isArray(global[CACHE_KEY])) {
      return global[CACHE_KEY];
    }

    var selectCols = "id,full_name,username,app_role,staff_role,dashboard_route,is_active";
    var rows = [];
    var from = 0;
    var chunk = 800;

    function pullPage() {
      var to = from + chunk - 1;
      return client
        .from("staff_profiles")
        .select(selectCols)
        .order("full_name", { ascending: true })
        .range(from, to)
        .then(function (res) {
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
            rows.sort(function (a, b) {
              return String(a.label || "").localeCompare(String(b.label || ""), "en", {
                sensitivity: "base",
              });
            });
            global[CACHE_KEY] = rows;
            return rows;
          }
          from += chunk;
          return pullPage();
        });
    }

    return pullPage();
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

  async function renderStaffDirectory(query) {
    bindInboxNav();
    var host = document.getElementById("internalChatStaffDirectoryList");
    var search = getSearchInput();
    if (!host) return;

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var me = String(
      (box && box.staff_profile && box.staff_profile.id) ||
        (box && box.session && box.session.user && box.session.user.id) ||
        ""
    ).trim();

    if (!portalStaffIsLeadUser()) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML = '<p class="portal-dm-lead-empty">Loading teamù</p>';

    try {
      var rows = await loadStaffRows(client, me);
      var q = typeof query === "string" ? query : getSearchQuery();
      rows = filterStaffRows(rows, q);

      host.innerHTML = "";
      if (!rows.length) {
        host.innerHTML = '<p class="portal-dm-lead-empty">' + directoryEmptyMessage(q) + "</p>";
        return;
      }

      appendStaffRows(host, rows);
    } catch (e) {
      host.innerHTML =
        '<p class="portal-dm-lead-empty portal-dm-lead-empty--err">' +
        esc(String((e && e.message) || e || "Could not load staff")) +
        "</p>";
    }
  }

  async function renderStaffSuggestions(query) {
    bindInboxNav();
    var host = document.getElementById("internalChatLeadStaffSuggestions");
    if (!host || !portalStaffIsLeadUser() || getInboxTab() !== "chats") {
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
    host.innerHTML = '<p class="portal-dm-lead-empty">Searching teamù</p>';

    try {
      var rows = filterStaffRows(await loadStaffRows(client, me), q);
      host.innerHTML = "";
      if (!rows.length) {
        host.innerHTML = '<p class="portal-dm-lead-empty">No staff match ù' + esc(q) + "ù.</p>";
        return;
      }

      var heading = document.createElement("p");
      heading.className = "portal-dm-lead-suggestions-title";
      heading.textContent = rows.length === 1 ? "Message someone" : "Message someone on the team";
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

  function initLeadInbox() {
    bindInboxNav();
    if (!portalStaffIsLeadUser()) return;
    try {
      delete global[CACHE_KEY];
    } catch (_cache) {}
    syncInboxChrome({ isLead: true, inThread: false });
    if (getInboxTab() === "staff") {
      void renderStaffDirectory();
    }
  }

  global.portalLeadStaffChatDirectory = {
    portalStaffIsLeadUser: portalStaffIsLeadUser,
    portalStaffIsRestrictedWorkerChat: portalStaffIsRestrictedWorkerChat,
    syncInboxChrome: syncInboxChrome,
    renderStaffDirectory: renderStaffDirectory,
    renderStaffSuggestions: renderStaffSuggestions,
    openPeerChat: openPeerChat,
    initLeadInbox: initLeadInbox,
    getInboxTab: getInboxTab,
    setInboxTab: setInboxTab,
    getSearchQuery: getSearchQuery,
    matchesSearchQuery: matchesSearchQuery,
    initialsFromLabel: initialsFromLabel,
    clearCache: function () {
      try {
        delete global[CACHE_KEY];
      } catch (_e) {}
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
