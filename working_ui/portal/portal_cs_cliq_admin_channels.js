/**
 * Admin CS Cliq Channels — Leads / Staff / CEOs tabs + 4-line group cards.
 */
(function (global) {
  "use strict";

  var CAT_STORAGE_KEY = "portal_admin_cs_cliq_channels_cat";
  var CATEGORIES = [
    {
      id: "leads",
      label: "Leads",
      sub: "Session leads",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    },
    {
      id: "staff",
      label: "Staff",
      sub: "Groups & teams",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    },
    {
      id: "ceos",
      label: "CEOs",
      sub: "Directors",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.4 4.8L20 8l-3.6 3.5.9 5.2L12 14.8 6.7 16.7l.9-5.2L4 8l5.6-1.2L12 2z"/></svg>',
    },
  ];

  function shouldUseAdminChannels() {
    if (
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.shouldUseCategorizedInbox === "function"
    ) {
      return global.portalCsCliqAdminInbox.shouldUseCategorizedInbox();
    }
    return false;
  }

  function getStoredCategory() {
    try {
      var v = String(sessionStorage.getItem(CAT_STORAGE_KEY) || "").trim();
      return CATEGORIES.some(function (c) {
        return c.id === v;
      })
        ? v
        : "leads";
    } catch (_s) {
      return "leads";
    }
  }

  function setStoredCategory(cat) {
    try {
      sessionStorage.setItem(CAT_STORAGE_KEY, String(cat || "leads"));
    } catch (_w) {}
  }

  function categoryBarEl() {
    return document.getElementById("csCliqChannelsCategoryBar");
  }

  function listHostEl() {
    return document.getElementById("csCliqTeamsList");
  }

  function syncCategoryChrome(show) {
    var bar = categoryBarEl();
    if (bar) {
      bar.hidden = !show;
      bar.setAttribute("aria-hidden", show ? "false" : "true");
    }
  }

  function memberSubtitle(item, chips) {
    chips = Array.isArray(chips) ? chips : [];
    if (chips.length) return "";
    if (item && item.isTeamChat) return "Team chat";
    return "Group";
  }

  function renderMemberChipsRow(chips, esc) {
    chips = Array.isArray(chips) ? chips : [];
    if (!chips.length) {
      return '<span class="portal-cs-cliq-channel-card__members portal-cs-cliq-channel-card__members--empty">Group</span>';
    }
    var inner =
      global.portalCsCliqGroupMembers &&
      typeof global.portalCsCliqGroupMembers.chipsHtml === "function"
        ? global.portalCsCliqGroupMembers.chipsHtml(chips)
        : esc(
            chips
              .map(function (c) {
                return String((c && c.label) || "").trim();
              })
              .filter(Boolean)
              .join(", ")
          );
    return (
      '<span class="portal-cs-cliq-channel-card__member-chips" aria-label="Members">' + inner + "</span>"
    );
  }

  function memberChipsCacheKey(item) {
    if (!item) return "";
    if (item.kind === "group") {
      return "g:" + String(item.slug || "") + ":" + String(item.id || "");
    }
    if (item.isTeamChat) return "t:" + String(item.id || "");
    return "";
  }

  async function loadMemberChipsForItem(item, chipCache) {
    if (!item) return [];
    chipCache = chipCache || null;
    var cacheKey = memberChipsCacheKey(item);
    if (cacheKey && chipCache && chipCache[cacheKey]) {
      return chipCache[cacheKey];
    }
    var chips = [];
    if (
      global.portalCsCliqGroupMembers &&
      typeof global.portalCsCliqGroupMembers.loadMemberChips === "function" &&
      item.kind === "group"
    ) {
      chips = await global.portalCsCliqGroupMembers.loadMemberChips(item.slug || "", item.id || "");
    } else if (item.isTeamChat && item.threadRow) {
      var profBy = (lastCtx && lastCtx.profBy) || {};
      var a = String(item.threadRow.participant_a || "");
      var b = String(item.threadRow.participant_b || "");
      [a, b].forEach(function (id) {
        var p = profBy[id] || {};
        var full = String(p.full_name || p.username || "").trim();
        if (!full) return;
        var label =
          global.portalCsCliqGroupMembers &&
          typeof global.portalCsCliqGroupMembers.profileChipLabel === "function"
            ? global.portalCsCliqGroupMembers.profileChipLabel(p)
            : full.split(/\s+/)[0] || full;
        chips.push({ label: label, title: full });
      });
    }
    if (cacheKey && chipCache) chipCache[cacheKey] = chips;
    return chips;
  }

  function renderChannelCard(item, esc, when, chips) {
    var unread = Number(item.unreadCount) || 0;
    var ui = global.__PORTAL_ADMIN_DM_UI || {};
    var activeGroupIds = [String(item.id || "")];
    if (Array.isArray(item.aliasGroupIds)) {
      item.aliasGroupIds.forEach(function (aid) {
        aid = String(aid || "").trim();
        if (aid && activeGroupIds.indexOf(aid) < 0) activeGroupIds.push(aid);
      });
    }
    var active =
      item.kind === "group" &&
      activeGroupIds.indexOf(String(ui.groupId || "")) >= 0 &&
      String(ui.panel || "") === "thread";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "portal-cs-cliq-channel-card" +
      (unread > 0 ? " portal-cs-cliq-channel-card--unread" : "") +
      (active ? " is-active" : "");
    if (item.kind === "group") {
      btn.setAttribute("data-cs-cliq-group-id", String(item.id || ""));
    } else if (item.id) {
      btn.setAttribute("data-cs-cliq-channel-dm", String(item.id || ""));
    }
    var membersLine = chips.length ? "" : esc(memberSubtitle(item, chips));
    var memberChipsHtml = renderMemberChipsRow(chips, esc);
    var sender = esc(String(item.lastSender || "").trim());
    var prev = esc(String(item.lastPreview || "").trim());
    var previewLine =
      sender || prev
        ? sender + (sender && prev ? ": " : "") + prev
        : "No messages yet";
    btn.innerHTML =
      '<span class="portal-cs-cliq-channel-card__title">' +
      esc(item.label || "Channel") +
      "</span>" +
      memberChipsHtml +
      (membersLine
        ? '<span class="portal-cs-cliq-channel-card__members">' + membersLine + "</span>"
        : "") +
      '<span class="portal-cs-cliq-channel-card__when">' +
      esc(when || "") +
      "</span>" +
      '<span class="portal-cs-cliq-channel-card__preview' +
      (previewLine === "No messages yet" ? " portal-cs-cliq-channel-card__preview--empty" : "") +
      '">' +
      esc(previewLine) +
      "</span>" +
      (unread > 0
        ? '<span class="portal-cs-cliq-channel-card__badge" aria-label="' +
          esc(String(unread) + " unread") +
          '">' +
          esc(unread > 99 ? "99+" : String(unread)) +
          "</span>"
        : "");
    return btn;
  }

  function bindChannelCards(host) {
    if (!host) return;
    host.querySelectorAll("[data-cs-cliq-group-id]").forEach(function (btn) {
      if (btn.dataset.channelBound === "1") return;
      btn.dataset.channelBound = "1";
      btn.addEventListener("click", function () {
        var gid = String(btn.getAttribute("data-cs-cliq-group-id") || "").trim();
        if (!gid) return;
        global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
        global.__PORTAL_ADMIN_DM_UI.hubPane = "channels";
        if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("channels");
        }
        if (typeof global.portalAdminDmOpenGroupThread === "function") {
          void global.portalAdminDmOpenGroupThread(gid);
        }
      });
    });
    host.querySelectorAll("[data-cs-cliq-channel-dm]").forEach(function (btn) {
      if (btn.dataset.channelBound === "1") return;
      btn.dataset.channelBound = "1";
      btn.addEventListener("click", function () {
        var tid = String(btn.getAttribute("data-cs-cliq-channel-dm") || "").trim();
        if (!tid) return;
        global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
        global.__PORTAL_ADMIN_DM_UI.hubPane = "channels";
        global.__PORTAL_ADMIN_DM_UI.inboxLane = btn.getAttribute("data-inbox-lane") || "mine";
        if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("channels");
        }
        if (typeof global.portalAdminDmOpenThread === "function") {
          void global.portalAdminDmOpenThread(tid);
        }
      });
    });
  }

  function appendSectionLabel(host, text) {
    var el = document.createElement("p");
    el.className = "portal-cs-cliq-inbox-section__label";
    el.textContent = text;
    host.appendChild(el);
  }

  function appendSectionEmpty(host, text) {
    var el = document.createElement("p");
    el.className = "muted portal-cs-cliq-inbox-section__empty";
    el.textContent = text;
    host.appendChild(el);
  }

  function renderLeadGhostButton(lead, esc) {
    if (
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.openLeadGhostView === "function"
    ) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-cs-cliq-channel-card portal-cs-cliq-channel-card--ghost";
      btn.setAttribute("data-cs-cliq-lead-ghost", String(lead.id || ""));
      var label =
        global.portalChatActorIdentity && typeof global.portalChatActorIdentity.inboxPeerLabel === "function"
          ? String(global.portalChatActorIdentity.inboxPeerLabel(lead) || "").trim()
          : String(lead.full_name || lead.username || "Lead").trim();
      label = label || "Lead";
      btn.innerHTML =
        '<span class="portal-cs-cliq-channel-card__title">' +
        esc(label) +
        '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--lead">Lead</span></span>' +
        '<span class="portal-cs-cliq-channel-card__members">Ghost view</span>' +
        '<span class="portal-cs-cliq-channel-card__when">Read-only</span>' +
        '<span class="portal-cs-cliq-channel-card__preview portal-cs-cliq-channel-card__preview--empty">Their mobile inbox</span>';
      btn.addEventListener("click", function () {
        void global.portalCsCliqAdminInbox.openLeadGhostView(String(lead.id || ""), btn);
      });
      return btn;
    }
    return null;
  }

  function renderCategoryBar(activeCat, esc, rerender) {
    var bar = categoryBarEl();
    if (!bar) return;
    bar.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "portal-cs-cliq-inbox-cat-btn" + (activeCat === cat.id ? " is-active" : "");
      btn.setAttribute("data-cs-cliq-inbox-cat", cat.id);
      btn.innerHTML =
        '<span class="portal-cs-cliq-inbox-cat-btn__icon">' +
        (cat.icon || "") +
        "</span>" +
        '<span class="portal-cs-cliq-inbox-cat-btn__label">' +
        esc(cat.label) +
        "</span>" +
        '<span class="portal-cs-cliq-inbox-cat-btn__sub">' +
        esc(cat.sub) +
        "</span>";
      btn.addEventListener("click", function () {
        setStoredCategory(cat.id);
        rerender(cat.id);
      });
      bar.appendChild(btn);
    });
  }

  var lastCtx = null;
  var lastLeads = [];
  var renderSeq = 0;

  async function renderCategoryPanel(host, cat, ctx, cats, leads, esc, seq) {
    host.innerHTML = "";
    var chipCache = {};
    var formatWhen =
      typeof ctx.formatWhen === "function"
        ? ctx.formatWhen
        : function (iso) {
            return String(iso || "");
          };

    if (cat === "leads") {
      appendSectionLabel(host, "View as lead (read-only)");
      if (!leads.length) {
        appendSectionEmpty(host, "No session leads found.");
      } else {
        leads.forEach(function (lead) {
          var ghost = renderLeadGhostButton(lead, esc);
          if (ghost) host.appendChild(ghost);
        });
      }
      var leadThreads = cats.leadItems || [];
      if (leadThreads.length) {
        appendSectionLabel(host, "Lead channels");
        for (var i = 0; i < leadThreads.length; i++) {
          if (seq !== renderSeq) return;
          var item = leadThreads[i];
          var chips = await loadMemberChipsForItem(item, chipCache);
          host.appendChild(renderChannelCard(item, esc, formatWhen(item.when), chips));
        }
      } else {
        appendSectionLabel(host, "Lead channels");
        appendSectionEmpty(host, "No lead group channels yet.");
      }
      bindChannelCards(host);
      return;
    }

    if (cat === "staff") {
      var sharedWorkerOps =
        global.portalCsCliqAdminInbox &&
        typeof global.portalCsCliqAdminInbox.managementSharedWorkerOpsInbox === "function" &&
        global.portalCsCliqAdminInbox.managementSharedWorkerOpsInbox();
      appendSectionLabel(host, "Staff channels");
      var staffItems = cats.staffItems || [];
      if (!staffItems.length) {
        appendSectionEmpty(
          host,
          sharedWorkerOps
            ? "No staff group channels yet. Individual staff chats are in Inbox."
            : "No staff group channels yet."
        );
      } else {
        for (var s = 0; s < staffItems.length; s++) {
          if (seq !== renderSeq) return;
          var sItem = staffItems[s];
          var sChips = await loadMemberChipsForItem(sItem, chipCache);
          host.appendChild(renderChannelCard(sItem, esc, formatWhen(sItem.when), sChips));
        }
      }
      bindChannelCards(host);
      return;
    }

    if (cat === "ceos") {
      appendSectionLabel(host, "CEO groups");
      if (ctx.isSevitha) {
        var note = document.createElement("p");
        note.className = "portal-cs-cliq-inbox-section__hint muted";
        note.textContent =
          "Internal CEO ring is hidden. Use CEOs & Admin or message directors individually in Inbox.";
        host.appendChild(note);
      }
      var ceoItems = cats.ceoItems || [];
      if (!ceoItems.length) {
        appendSectionEmpty(host, "No CEO group channels yet.");
      } else {
        for (var c = 0; c < ceoItems.length; c++) {
          if (seq !== renderSeq) return;
          var cItem = ceoItems[c];
          var cChips = await loadMemberChipsForItem(cItem, chipCache);
          host.appendChild(renderChannelCard(cItem, esc, formatWhen(cItem.when), cChips));
        }
      }
      bindChannelCards(host);
    }
  }

  async function paintChannels(host, cat, ctx, leads, seq) {
    var esc =
      ctx.esc ||
      function (s) {
        return String(s == null ? "" : s);
      };
    var buildCategories =
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.buildChannelCategories === "function"
        ? global.portalCsCliqAdminInbox.buildChannelCategories
        : function () {
            return { leadItems: [], staffItems: [], ceoItems: [] };
          };
    var cats = buildCategories(ctx);
    if (seq !== renderSeq) return;
    renderCategoryBar(cat, esc, function (nextCat) {
      if (lastCtx && host) void paintChannels(host, nextCat, lastCtx, lastLeads, renderSeq);
    });
    await renderCategoryPanel(host, cat, ctx, cats, leads, esc, seq);
  }

  async function renderAdminChannels(host, ctx) {
    if (!host || !ctx) return;
    var seq = ++renderSeq;
    lastCtx = ctx;
    syncCategoryChrome(true);
    var cat = getStoredCategory();
    var leads = [];
    if (
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.loadSessionLeads === "function" &&
      ctx.client
    ) {
      leads = await global.portalCsCliqAdminInbox.loadSessionLeads(ctx.client);
    }
    if (seq !== renderSeq) return;
    lastLeads = leads;
    await paintChannels(host, cat, ctx, leads, seq);
  }

  function refreshFromContext() {
    if (String(global.__PORTAL_CS_CLIQ_RAIL_PANE || "chats") !== "channels") return;
    var ctx = global.__PORTAL_ADMIN_DM_CHANNEL_CTX;
    var host = listHostEl();
    if (!ctx || !host || !shouldUseAdminChannels()) return;
    if (global.__PORTAL_CS_CLIQ_CHANNELS_REFRESH_DEB) {
      clearTimeout(global.__PORTAL_CS_CLIQ_CHANNELS_REFRESH_DEB);
    }
    global.__PORTAL_CS_CLIQ_CHANNELS_REFRESH_DEB = setTimeout(function () {
      global.__PORTAL_CS_CLIQ_CHANNELS_REFRESH_DEB = null;
      void renderAdminChannels(host, ctx);
    }, 800);
  }

  async function refresh() {
    if (!shouldUseAdminChannels()) {
      if (global.portalCsCliqTeamsLegacyRefresh) {
        return global.portalCsCliqTeamsLegacyRefresh();
      }
      return;
    }
    var ctx = global.__PORTAL_ADMIN_DM_CHANNEL_CTX;
    var host = listHostEl();
    if (!ctx || !host) {
      if (host) {
        host.innerHTML =
          '<p class="muted portal-cs-cliq-teams-empty">Open Inbox first to load channels.</p>';
      }
      return;
    }
    await renderAdminChannels(host, ctx);
  }

  global.portalCsCliqAdminChannels = {
    shouldUseAdminChannels: shouldUseAdminChannels,
    renderAdminChannels: renderAdminChannels,
    refreshFromContext: refreshFromContext,
    refresh: refresh,
    getStoredCategory: getStoredCategory,
  };
})(typeof window !== "undefined" ? window : globalThis);
