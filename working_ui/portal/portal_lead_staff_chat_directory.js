/**
 * Lead dashboard — staff directory in internal chat (WhatsApp-style contact list).
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
    return String(profileRow(prof).app_role || "").toLowerCase() === "lead";
  }

  function portalStaffIsRestrictedWorkerChat(prof) {
    var row = profileRow(prof);
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "lead") return false;
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

  function injectStyles() {
    if (document.getElementById("portal-lead-staff-directory-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-lead-staff-directory-styles";
    st.textContent =
      ".portal-dm-inbox-nav{display:flex;gap:8px;width:100%;min-width:0;padding:0 2px 10px;box-sizing:border-box}" +
      ".portal-dm-inbox-nav-btn{flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:1px solid rgba(45,132,179,.22);background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
      ".portal-dm-inbox-nav-btn.is-active{background:linear-gradient(180deg,#eaf5fb,#ddeef8);border-color:rgba(45,132,179,.45);color:var(--blue);box-shadow:0 2px 8px rgba(45,132,179,.12)}" +
      ".portal-dm-inbox-nav-btn:focus-visible{outline:2px solid var(--blue);outline-offset:2px}" +
      ".portal-dm-staff-directory{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;flex:1}" +
      ".portal-dm-staff-search{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(45,132,179,.25);font:inherit;font-size:15px;min-width:0}" +
      ".portal-dm-staff-directory-list{display:flex;flex-direction:column;gap:6px;min-width:0;overflow:auto;flex:1;padding-bottom:4px}" +
      ".portal-dm-staff-directory-item{display:flex;align-items:center;gap:12px;width:100%;min-width:0;padding:10px 12px;border-radius:14px;border:1px solid rgba(0,0,0,.08);background:var(--surface,#fff);cursor:pointer;font:inherit;text-align:left;-webkit-tap-highlight-color:transparent}" +
      ".portal-dm-staff-directory-item:hover{border-color:rgba(45,132,179,.32);background:linear-gradient(180deg,#fafdff,#f0f7fc)}" +
      ".portal-dm-staff-directory-item:active{opacity:.92}" +
      ".portal-dm-staff-directory-item:focus-visible{outline:2px solid var(--blue);outline-offset:2px}" +
      ".portal-dm-staff-directory-avatar{flex-shrink:0;width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#eaf5fb,#d4e8f4);color:var(--blue);font-size:13px;font-weight:800;border:1px solid rgba(45,132,179,.2)}" +
      ".portal-dm-staff-directory-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" +
      ".portal-dm-staff-directory-name{font-weight:700;font-size:15px;line-height:1.25;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".portal-dm-staff-directory-role{font-size:12px;line-height:1.3;color:var(--muted,#64748b)}";
    document.head.appendChild(st);
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
    injectStyles();
    var isLead = !!opts.isLead;
    var inThread = !!opts.inThread;
    var nav = document.getElementById("internalChatLeadInboxNav");
    var staffWrap = document.getElementById("internalChatStaffDirectoryWrap");
    var listWrap = document.getElementById("internalChatListWrap");
    var tab = getInboxTab();

    if (nav) {
      nav.hidden = !isLead || inThread;
      nav.setAttribute("aria-hidden", !isLead || inThread ? "true" : "false");
    }
    if (!isLead || inThread) {
      if (staffWrap) {
        staffWrap.hidden = true;
        staffWrap.setAttribute("aria-hidden", "true");
      }
      if (listWrap && inThread) {
        listWrap.hidden = true;
      }
      return;
    }

    var chatsBtn = document.getElementById("internalChatInboxTabChats");
    var staffBtn = document.getElementById("internalChatInboxTabStaff");
    if (chatsBtn) chatsBtn.classList.toggle("is-active", tab === "chats");
    if (staffBtn) staffBtn.classList.toggle("is-active", tab === "staff");

    if (listWrap) {
      listWrap.hidden = tab !== "chats";
      listWrap.setAttribute("aria-hidden", tab === "chats" ? "false" : "true");
    }
    if (staffWrap) {
      staffWrap.hidden = tab !== "staff";
      staffWrap.setAttribute("aria-hidden", tab === "staff" ? "false" : "true");
    }
  }

  function bindInboxNav() {
    var nav = document.getElementById("internalChatLeadInboxNav");
    if (!nav || nav.dataset.portalLeadInboxBound) return;
    nav.dataset.portalLeadInboxBound = "1";

    nav.addEventListener("click", function (ev) {
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

    var search = document.getElementById("internalChatStaffSearch");
    if (search && !search.dataset.portalLeadSearchBound) {
      search.dataset.portalLeadSearchBound = "1";
      var deb;
      search.addEventListener("input", function () {
        if (deb) clearTimeout(deb);
        deb = setTimeout(function () {
          deb = null;
          void renderStaffDirectory(String(search.value || "").trim());
        }, 180);
      });
    }
  }

  async function loadStaffRows(client, me) {
    if (!client || !me) return [];
    if (global[CACHE_KEY] && Array.isArray(global[CACHE_KEY])) return global[CACHE_KEY];

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
    if (typeof global.portalStaffEnsureDmThreadBetween === "function") {
      threadId = String((await global.portalStaffEnsureDmThreadBetween(me, peerId)) || "").trim();
    }
    if (!threadId) {
      if (errTop) {
        errTop.textContent = "Could not open chat.";
        errTop.hidden = false;
      }
      return;
    }

    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.threadId = threadId;
    global.__PORTAL_INTERNAL_CHAT_UI.inboxTab = "chats";
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  async function renderStaffDirectory(query) {
    injectStyles();
    bindInboxNav();
    var host = document.getElementById("internalChatStaffDirectoryList");
    var search = document.getElementById("internalChatStaffSearch");
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

    host.innerHTML = '<p class="muted" style="margin:0;font-size:13px">Loading staff…</p>';

    try {
      var rows = await loadStaffRows(client, me);
      var q = normKey(typeof query === "string" ? query : search ? search.value : "");
      if (q) {
        rows = rows.filter(function (r) {
          return normKey(r.label).indexOf(q) >= 0 || normKey(r.role).indexOf(q) >= 0;
        });
      }

      host.innerHTML = "";
      if (!rows.length) {
        host.innerHTML =
          '<p class="alerts-sheet-placeholder" style="min-width:0;overflow-wrap:break-word">' +
          (q ? "No staff match your search." : "No staff found in the directory.") +
          "</p>";
        return;
      }

      rows.forEach(function (r) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "portal-dm-staff-directory-item";
        btn.setAttribute("role", "listitem");
        btn.setAttribute("data-staff-peer", r.id);
        btn.innerHTML =
          '<span class="portal-dm-staff-directory-avatar" aria-hidden="true">' +
          esc(initialsFromLabel(r.label)) +
          "</span>" +
          '<span class="portal-dm-staff-directory-copy">' +
          '<span class="portal-dm-staff-directory-name">' +
          esc(r.label) +
          "</span>" +
          '<span class="portal-dm-staff-directory-role">' +
          esc(r.role) +
          "</span></span>";
        btn.addEventListener("click", function () {
          void openPeerChat(r.id);
        });
        host.appendChild(btn);
      });
    } catch (e) {
      host.innerHTML =
        '<p class="muted" style="margin:0;color:var(--danger);font-size:13px;overflow-wrap:break-word">' +
        esc(String((e && e.message) || e || "Could not load staff")) +
        "</p>";
    }
  }

  function initLeadInbox() {
    injectStyles();
    bindInboxNav();
    if (!portalStaffIsLeadUser()) return;
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
    openPeerChat: openPeerChat,
    initLeadInbox: initLeadInbox,
    getInboxTab: getInboxTab,
    setInboxTab: setInboxTab,
    clearCache: function () {
      try {
        delete global[CACHE_KEY];
      } catch (_e) {}
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
