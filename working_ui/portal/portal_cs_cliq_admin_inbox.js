/**
 * Admin CS Cliq inbox — flat 1:1 DMs (WhatsApp-style). Groups live in Channels.
 */
(function (global) {
  "use strict";

  function profileRow() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function isSessionLeadProfile(row) {
    return String((row && row.app_role) || "").toLowerCase() === "lead";
  }

  function isStaffWorkerProfile(row) {
    if (global.portalInternalDmIsWorkerRecipient && typeof global.portalInternalDmIsWorkerRecipient === "function") {
      if (!global.portalInternalDmIsWorkerRecipient(row)) return false;
    } else if (!row || row.is_active === false) {
      return false;
    }
    return !isSessionLeadProfile(row);
  }

  function isCeoExecPeer(row) {
    if (!row) return false;
    var ar = String(row.app_role || "").toLowerCase();
    return ar === "ceo" || ar === "admin";
  }

  function isLeadOnlyTeamChat(item, profBy) {
    if (!item || !item.isTeamChat || !item.threadRow) return false;
    profBy = profBy || {};
    var a = String(item.threadRow.participant_a || "");
    var b = String(item.threadRow.participant_b || "");
    return isSessionLeadProfile(profBy[a] || {}) && isSessionLeadProfile(profBy[b] || {});
  }

  function shouldUseCategorizedInbox() {
    if (!global.__PORTAL_CS_CLIQ_ACTIVE) return false;
    try {
      if (!/admin_dashboard\.html/i.test(String(global.location.pathname || ""))) return false;
    } catch (_e) {
      return false;
    }
    if (global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.isManagementProfile === "function") {
      return global.portalCsCliqHubRoles.isManagementProfile();
    }
    var app = String(profileRow().app_role || "").toLowerCase();
    return app === "admin" || app === "ceo";
  }

  function syncInboxChrome() {
    var quick = document.getElementById("csCliqCeoQuickWrap");
    if (quick) quick.hidden = true;
    var nav = document.getElementById("csCliqChannelNav");
    if (nav) {
      nav.hidden = true;
      nav.setAttribute("aria-hidden", "true");
    }
    var newBtn = document.getElementById("csCliqBtnNew");
    if (newBtn) {
      newBtn.hidden = true;
      newBtn.setAttribute("aria-hidden", "true");
    }
    if (!managementSharedWorkerOpsInbox()) {
      var bar = document.getElementById("csCliqInboxCategoryBar");
      if (bar) {
        bar.hidden = true;
        bar.setAttribute("aria-hidden", "true");
        bar.innerHTML = "";
        bar.className = "portal-cs-cliq-inbox-categories";
      }
    }
  }

  function getCeoInboxCategory() {
    var ui = global.__PORTAL_ADMIN_DM_UI || {};
    var cat = String(ui.inboxCategory || "direct").toLowerCase();
    return cat === "ops" ? "ops" : "direct";
  }

  function setCeoInboxCategory(cat) {
    global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
    global.__PORTAL_ADMIN_DM_UI.inboxCategory = String(cat || "direct").toLowerCase() === "ops" ? "ops" : "direct";
  }

  function sortDmItems(items) {
    items = Array.isArray(items) ? items.slice() : [];
    items.sort(function (a, b) {
      var ta = 0;
      var tb = 0;
      try {
        if (a.when) ta = new Date(a.when).getTime();
      } catch (_e) {}
      try {
        if (b.when) tb = new Date(b.when).getTime();
      } catch (_e2) {}
      if (ta > 0 && tb > 0) return tb - ta;
      if (ta > 0) return -1;
      if (tb > 0) return 1;
      return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
    });
    return items;
  }

  function countUnread(items) {
    return (items || []).reduce(function (n, it) {
      return n + Math.max(0, Number(it && it.unreadCount) || 0);
    }, 0);
  }

  async function loadSessionLeads(client) {
    if (!client) return [];
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,dashboard_route,is_active")
      .eq("app_role", "lead")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(20);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data.filter(function (r) {
      return r && r.id;
    });
  }

  async function openLeadGhostView(leadId, btn) {
    leadId = String(leadId || "").trim();
    if (!leadId) return;
    if (global.PortalGhostTeleport && typeof global.PortalGhostTeleport.openForUserId === "function") {
      await global.PortalGhostTeleport.openForUserId(leadId, "lead", btn || null);
      return;
    }
    if (typeof global.portalAdminToast === "function") {
      global.portalAdminToast("Ghost view is not available.", "error");
    }
  }

  function buildChannelCategories(ctx) {
    var merged = ctx.merged || [];
    var splitSections = ctx.splitSections;
    var teamDmItems = ctx.teamDmItems || [];
    var profBy = ctx.profBy || {};
    var seesSlug =
      typeof ctx.viewerSeesCeoGroupSlug === "function"
        ? ctx.viewerSeesCeoGroupSlug
        : function () {
            return true;
          };
    var orderFixedGroups = ctx.orderFixedGroups;

    var leadItems = [];
    var staffItems = [];
    var ceoItems = [];
    var seen = Object.create(null);

    function canonicalSlug(item) {
      if (!item || item.kind !== "group") return "";
      if (item.canonicalSlug) return String(item.canonicalSlug).toLowerCase();
      if (
        global.portalCsCliqAnnouncementInbox &&
        typeof global.portalCsCliqAnnouncementInbox.canonicalGroupSlug === "function"
      ) {
        return global.portalCsCliqAnnouncementInbox.canonicalGroupSlug(item.slug || "", item.label || "");
      }
      return String(item.slug || "").toLowerCase();
    }

    function isStaffPoolChannelSlug(slug) {
      if (
        global.portalCsCliqAnnouncementInbox &&
        typeof global.portalCsCliqAnnouncementInbox.isStaffPoolChannelSlug === "function"
      ) {
        return global.portalCsCliqAnnouncementInbox.isStaffPoolChannelSlug(slug);
      }
      slug = String(slug || "").toLowerCase();
      return (
        slug === "swimming_instructors" ||
        slug === "climbing_instructors" ||
        slug === "support_staff" ||
        slug === "pool_leads"
      );
    }

    function labelDedupeKey(item) {
      if (!item || item.kind !== "group") return "";
      var lbl = String(item.label || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
      return lbl ? "l:" + lbl : "";
    }

    function key(item) {
      if (!item) return "";
      if (item.kind === "group") {
        var slug = canonicalSlug(item);
        if (slug) return "g:" + slug;
        return "g:" + String(item.id || "");
      }
      return "d:" + String(item.id || item.workerId || item.label || "");
    }

    function push(bucket, item) {
      if (!item) return;
      var k = key(item);
      var lk = labelDedupeKey(item);
      if (k && seen[k]) return;
      if (lk && seen[lk]) return;
      if (k) seen[k] = true;
      if (lk) seen[lk] = true;
      bucket.push(item);
    }

    teamDmItems.forEach(function (item) {
      if (isLeadOnlyTeamChat(item, profBy)) push(leadItems, item);
      else push(staffItems, item);
    });

    merged.forEach(function (item) {
      if (!item) return;
      if (item.kind === "group") {
        var slug = String(item.slug || "").toLowerCase();
        if (slug === "session_leads" || slug === "staff_leads_ops") {
          push(leadItems, item);
          return;
        }
        if (isStaffPoolChannelSlug(slug)) {
          push(staffItems, item);
          return;
        }
        if (isDirectorDirectGroup(item) && managementSharedWorkerOpsInbox()) return;
        if (!seesSlug(slug)) return;
        push(ceoItems, item);
        return;
      }
      if (item.isTeamChat) {
        if (isLeadOnlyTeamChat(item, profBy)) push(leadItems, item);
        else push(staffItems, item);
      }
    });

    if (splitSections && Array.isArray(splitSections.opsItems)) {
      splitSections.opsItems.forEach(function (item) {
        if (item) push(staffItems, item);
      });
    }

    var ceoGroups = ceoItems.filter(function (i) {
      return i.kind === "group";
    });
    var ceoTeams = ceoItems.filter(function (i) {
      return i.kind !== "group";
    });
    if (typeof orderFixedGroups === "function") {
      ceoGroups = orderFixedGroups(ceoGroups);
    }
    ceoItems = ceoGroups.concat(ceoTeams);

    if (typeof orderFixedGroups === "function") {
      leadItems = orderFixedGroups(
        leadItems.filter(function (i) {
          return i.kind === "group";
        })
      ).concat(
        leadItems.filter(function (i) {
          return i.kind !== "group";
        })
      );
    }

    var staffPoolOrder =
      global.portalCsCliqAnnouncementInbox &&
      typeof global.portalCsCliqAnnouncementInbox.staffPoolChannelSlugOrder === "function"
        ? global.portalCsCliqAnnouncementInbox.staffPoolChannelSlugOrder()
        : ["swimming_instructors", "climbing_instructors", "support_staff", "pool_leads"];
    var staffGroups = staffItems.filter(function (i) {
      return i.kind === "group";
    });
    var staffTeams = staffItems.filter(function (i) {
      return i.kind !== "group";
    });
    staffGroups.sort(function (a, b) {
      var as = canonicalSlug(a);
      var bs = canonicalSlug(b);
      var ai = staffPoolOrder.indexOf(as);
      var bi = staffPoolOrder.indexOf(bs);
      if (ai < 0) ai = 999;
      if (bi < 0) bi = 999;
      if (ai !== bi) return ai - bi;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
    staffItems = staffGroups.concat(staffTeams);

    function dedupeBucket(items) {
      var out = [];
      var seenKeys = Object.create(null);
      (items || []).forEach(function (item) {
        if (!item) return;
        var k = key(item);
        var lk = labelDedupeKey(item);
        if ((k && seenKeys[k]) || (lk && seenKeys[lk])) return;
        if (k) seenKeys[k] = true;
        if (lk) seenKeys[lk] = true;
        out.push(item);
      });
      return out;
    }

    leadItems = dedupeBucket(leadItems);
    staffItems = dedupeBucket(staffItems);
    ceoItems = dedupeBucket(ceoItems);

    return { leadItems: leadItems, staffItems: staffItems, ceoItems: ceoItems };
  }

  function isWorkerPeerItem(item) {
    if (!item || item.kind !== "dm") return false;
    var prof = item.peerProf || {};
    if (global.portalInternalDmIsWorkerRecipient && typeof global.portalInternalDmIsWorkerRecipient === "function") {
      return global.portalInternalDmIsWorkerRecipient(prof);
    }
    var ar = String(prof.app_role || "").toLowerCase();
    return ar === "staff" || ar === "lead";
  }

  function managementInboxFullStaffRoster() {
    return shouldUseCategorizedInbox();
  }

  function managementSharedWorkerOpsInbox() {
    if (!shouldUseCategorizedInbox()) return false;
    if (
      global.portalCsCliqManagementInbox &&
      typeof global.portalCsCliqManagementInbox.isCeoViewer === "function" &&
      global.portalCsCliqManagementInbox.isCeoViewer(profileRow())
    ) {
      return true;
    }
    return false;
  }

  var DIRECTOR_DIRECT_GROUP_SLUGS = { all_ceos: true, ceo_liaison: true };

  function groupSlugKey(item) {
    if (!item || item.kind !== "group") return "";
    var slug = String(item.canonicalSlug || item.slug || "").toLowerCase();
    if (slug.indexOf("id:") === 0) slug = String(item.slug || "").toLowerCase();
    return slug;
  }

  function isDirectorDirectGroup(item) {
    return !!DIRECTOR_DIRECT_GROUP_SLUGS[groupSlugKey(item)];
  }

  function appendDirectorDirectGroups(merged, directItems, directSeen) {
    if (!managementSharedWorkerOpsInbox()) return;
    (merged || []).forEach(function (item) {
      if (!item || item.kind !== "group" || !isDirectorDirectGroup(item)) return;
      var gid = String(item.id || "").trim();
      if (!gid || directSeen["g:" + gid]) return;
      directSeen["g:" + gid] = true;
      directItems.push(item);
    });
  }

  function splitDmInbox(merged, splitSections, teamDmItems) {
    var directItems = [];
    var opsItems = [];
    var directSeen = Object.create(null);
    var opsSeen = Object.create(null);
    var sharedWorkerOps = managementSharedWorkerOpsInbox();

    function shouldShowPersonalDm(item) {
      if (!item) return false;
      if (Number(item.unreadCount) > 0) return true;
      if (String(item.lastPreview || "").trim()) return true;
      if (String(item.id || "").trim()) return true;
      if (item.when) return true;
      return false;
    }

    function pushDirect(item) {
      if (!item || item.kind !== "dm" || item.isTeamChat) return;
      if (item.inboxLane === "ops") return;
      if (sharedWorkerOps && isWorkerPeerItem(item)) return;
      if (!shouldShowPersonalDm(item)) return;
      var tid = String(item.id || "").trim();
      var wk = String(item.workerId || item.peerId || "").trim();
      if (tid) {
        if (directSeen["t:" + tid]) return;
        directSeen["t:" + tid] = true;
        if (wk) directSeen["w:" + wk] = true;
        directItems.push(item);
        return;
      }
      if (!wk || directSeen["w:" + wk]) return;
      directSeen["w:" + wk] = true;
      directItems.push(item);
    }

    function pushOps(item) {
      if (!item || item.kind !== "dm" || item.isTeamChat) return;
      if (!isWorkerPeerItem(item)) return;
      var wk = String(item.workerId || item.peerId || "").trim();
      if (!wk || opsSeen["w:" + wk]) return;
      opsSeen["w:" + wk] = true;
      var tid = String(item.id || "").trim();
      if (tid) opsSeen["t:" + tid] = true;
      opsItems.push(item);
    }

    (merged || []).forEach(function (item) {
      if (item && item.inboxLane === "personal") pushDirect(item);
      else if (!sharedWorkerOps) pushDirect(item);
      else if (item && item.inboxLane !== "ops" && !isWorkerPeerItem(item)) pushDirect(item);
    });

    if (splitSections && managementInboxFullStaffRoster()) {
      if (sharedWorkerOps && Array.isArray(splitSections.opsItems)) {
        splitSections.opsItems.forEach(pushOps);
      } else if (Array.isArray(splitSections.mineItems)) {
        splitSections.mineItems.forEach(pushDirect);
      }
    }

    (teamDmItems || []).forEach(function (item) {
      if (item && !item.isTeamChat) pushDirect(item);
    });

    appendDirectorDirectGroups(merged, directItems, directSeen);

    return {
      directItems: sortDmItems(directItems),
      opsItems: sortDmItems(opsItems),
    };
  }

  function flattenDmInbox(merged, splitSections, teamDmItems) {
    var split = splitDmInbox(merged, splitSections, teamDmItems);
    if (managementSharedWorkerOpsInbox()) {
      return getCeoInboxCategory() === "ops" ? split.opsItems : split.directItems;
    }
    return split.directItems.concat(split.opsItems);
  }

  var lastInboxCtx = null;

  function renderCeoInboxNav(activeCat, split) {
    var bar = document.getElementById("csCliqInboxCategoryBar");
    if (!bar) return;
    activeCat = activeCat === "ops" ? "ops" : "direct";
    split = split || { directItems: [], opsItems: [] };
    bar.hidden = false;
    bar.setAttribute("aria-hidden", "false");
    bar.className = "portal-dm-inbox-nav portal-cs-cliq-inbox-lane-nav";
    var directUnread = countUnread(split.directItems);
    var opsUnread = countUnread(split.opsItems);
    var directLabel = "Direct" + (directUnread > 0 ? " (" + directUnread + ")" : "");
    var opsLabel = "Staff ops" + (opsUnread > 0 ? " (" + opsUnread + ")" : "");
    bar.innerHTML =
      '<button type="button" class="portal-dm-inbox-nav-btn' +
      (activeCat === "direct" ? " is-active" : "") +
      '" data-cs-cliq-inbox-cat="direct">' +
      directLabel +
      "</button>" +
      '<button type="button" class="portal-dm-inbox-nav-btn' +
      (activeCat === "ops" ? " is-active" : "") +
      '" data-cs-cliq-inbox-cat="ops">' +
      opsLabel +
      "</button>";
    if (!bar.dataset.portalCeoInboxNavBound) {
      bar.dataset.portalCeoInboxNavBound = "1";
      bar.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("[data-cs-cliq-inbox-cat]");
        if (!btn || !bar.contains(btn)) return;
        ev.preventDefault();
        setCeoInboxCategory(btn.getAttribute("data-cs-cliq-inbox-cat"));
        rerenderAdminInbox();
      });
    }
  }

  function rerenderAdminInbox() {
    var host = document.getElementById("csCliqListWrap");
    if (host && lastInboxCtx) {
      void renderAdminInbox(host, lastInboxCtx);
      return;
    }
    if (typeof global.portalAdminDmRenderList === "function") {
      void global.portalAdminDmRenderList();
    }
  }

  function emptyInboxMessage(activeCat) {
    if (activeCat === "ops") {
      return (
        "No staff ops threads here yet. " +
        "This tab is the shared Sevitha\u2194worker line \u2014 Roberto, instructors, support, etc."
      );
    }
    return (
      "No direct chats here yet. " +
      "Directors, CEO groups (Ra\u00fal \u00b7 Victor \u00b7 Javi, CEOs & Sevitha), and Admin live in this tab."
    );
  }

  async function renderAdminInbox(host, ctx) {
    if (!host || !ctx) return;
    lastInboxCtx = ctx;
    syncInboxChrome();
    var renderItem = ctx.renderItem;
    var me = ctx.me;
    var ch = ctx.ch;
    var sharedWorkerOps = managementSharedWorkerOpsInbox();
    var split = splitDmInbox(ctx.merged, ctx.splitSections, ctx.teamDmItems);
    var activeCat = sharedWorkerOps ? getCeoInboxCategory() : "direct";
    if (sharedWorkerOps) {
      renderCeoInboxNav(activeCat, split);
    }
    var dmItems = sharedWorkerOps
      ? activeCat === "ops"
        ? split.opsItems
        : split.directItems
      : flattenDmInbox(ctx.merged, ctx.splitSections, ctx.teamDmItems);
    host.innerHTML = "";
    if (!dmItems.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">' +
        (sharedWorkerOps
          ? emptyInboxMessage(activeCat)
          : "No conversations here yet. Staff names appear in this list as soon as profiles are loaded \u2014 tap anyone to message.") +
        "</p>";
      return;
    }
    var rendered = 0;
    dmItems.forEach(function (item) {
      if (typeof renderItem !== "function") return;
      try {
        var el = renderItem.length > 1 ? renderItem(item, me, ch) : renderItem(item);
        if (el) {
          host.appendChild(el);
          rendered += 1;
        }
      } catch (_renderErr) {}
    });
    if (!rendered) {
      host.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">' +
        "Could not render conversations. Try <strong>Channels</strong> or reload the page.</p>";
    }
  }

  function hideCategoryChrome() {
    syncInboxChrome();
  }

  global.portalCsCliqAdminInbox = {
    shouldUseCategorizedInbox: shouldUseCategorizedInbox,
    managementInboxFullStaffRoster: managementInboxFullStaffRoster,
    managementSharedWorkerOpsInbox: managementSharedWorkerOpsInbox,
    loadSessionLeads: loadSessionLeads,
    openLeadGhostView: openLeadGhostView,
    renderAdminInbox: renderAdminInbox,
    rerenderAdminInbox: rerenderAdminInbox,
    hideCategoryChrome: hideCategoryChrome,
    buildChannelCategories: buildChannelCategories,
    getCeoInboxCategory: getCeoInboxCategory,
    setCeoInboxCategory: setCeoInboxCategory,
    isDirectorDirectGroup: isDirectorDirectGroup,
  };
})(typeof window !== "undefined" ? window : globalThis);
