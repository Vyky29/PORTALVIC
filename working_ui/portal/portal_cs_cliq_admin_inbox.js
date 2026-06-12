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

  function groupsBelongInChannelsOnly() {
    if (!shouldUseCategorizedInbox()) return false;
    if (global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.getTier === "function") {
      return global.portalCsCliqHubRoles.getTier() === "management";
    }
    return false;
  }

  function portalCsCliqPageActive() {
    try {
      var path = String(global.location.pathname || "").toLowerCase();
      return /admin_dashboard\.html|cs_cliq\.html/i.test(path);
    } catch (_e) {
      return false;
    }
  }

  function shouldUseCategorizedInbox() {
    if (!global.__PORTAL_CS_CLIQ_ACTIVE) return false;
    if (global.__PORTAL_CS_CLIQ_STANDALONE) {
      var prof = profileRow();
      if (
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
        global.portalDmRoles.portalDmIsDirectorProfile(prof)
      ) {
        return true;
      }
      if (
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsAdminProfile === "function" &&
        global.portalDmRoles.portalDmIsAdminProfile(prof)
      ) {
        return true;
      }
      if (
        global.portalCsCliqHubRoles &&
        typeof global.portalCsCliqHubRoles.isManagementProfile === "function"
      ) {
        return global.portalCsCliqHubRoles.isManagementProfile(prof);
      }
      if (
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmUsesAdminCliq === "function"
      ) {
        return global.portalDmRoles.portalDmUsesAdminCliq(prof);
      }
      var app = String(prof.app_role || "").toLowerCase();
      return app === "admin" || app === "ceo";
    }
    if (!portalCsCliqPageActive()) return false;
    if (global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.isManagementProfile === "function") {
      return global.portalCsCliqHubRoles.isManagementProfile();
    }
    var app = String(profileRow().app_role || "").toLowerCase();
    return app === "admin" || app === "ceo";
  }

  function usesDirectorLaneNav() {
    return (
      managementSharedWorkerOpsInbox() &&
      String(global.__PORTAL_ADMIN_DM_CHANNEL || "").trim() === "ceo_exec"
    );
  }

  function syncInboxChrome() {
    var quick = document.getElementById("csCliqCeoQuickWrap");
    var groupRow = document.getElementById("csCliqCeoGroupRow");
    var laneNav = usesDirectorLaneNav();
    if (quick) {
      quick.hidden =
        (laneNav && !global.__PORTAL_CS_CLIQ_STANDALONE) ||
        String(global.__PORTAL_ADMIN_DM_CHANNEL || "").trim() !== "ceo_exec";
      quick.setAttribute("aria-hidden", quick.hidden ? "true" : "false");
    }
    if (groupRow) {
      groupRow.hidden = laneNav;
      groupRow.setAttribute("aria-hidden", laneNav ? "true" : "false");
    }
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
      renderCeoInboxLaneHint("direct", false);
    }
  }

  function ceoInboxLaneHintText(activeCat) {
    if (activeCat === "ops") {
      return "Shared staff line (Sevitha \u2194 workers). You can read and reply as yourself.";
    }
    return "1:1 with Ra\u00fal, Javi or Sevitha. Group chats (All CEOs, Sev + CEOs) are in Channels.";
  }

  function renderCeoInboxLaneHint(activeCat, show) {
    var hint = document.getElementById("csCliqInboxLaneHint");
    if (!hint) return;
    if (!show) {
      hint.hidden = true;
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = "";
      return;
    }
    activeCat = activeCat === "ops" ? "ops" : "direct";
    hint.hidden = false;
    hint.setAttribute("aria-hidden", "false");
    hint.textContent = ceoInboxLaneHintText(activeCat);
    hint.setAttribute("data-cs-cliq-inbox-lane-hint", activeCat);
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
        if (isDirectorDirectGroup(item)) {
          push(ceoItems, item);
          return;
        }
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
    if (global.__PORTAL_CS_CLIQ_STANDALONE) return false;
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
  var LIAISON_GROUP_SLUG = "ceo_liaison";

  function groupSlugKey(item) {
    if (!item || item.kind !== "group") return "";
    var slug = String(item.canonicalSlug || item.slug || "").toLowerCase();
    if (slug.indexOf("id:") === 0) slug = String(item.slug || "").toLowerCase();
    return slug;
  }

  function isDirectorDirectGroup(item) {
    return !!DIRECTOR_DIRECT_GROUP_SLUGS[groupSlugKey(item)];
  }

  function isLiaisonGroup(item) {
    return item && item.kind === "group" && groupSlugKey(item) === LIAISON_GROUP_SLUG;
  }

  function findLiaisonGroup(merged) {
    return (merged || []).find(isLiaisonGroup) || null;
  }

  function pinLiaisonFirst(items, merged) {
    var liaison = findLiaisonGroup(merged);
    if (!liaison) return Array.isArray(items) ? items.slice() : [];
    var rest = (items || []).filter(function (item) {
      return !isLiaisonGroup(item);
    });
    return [liaison].concat(rest);
  }

  function buildVisibleInboxItems(merged, splitSections, teamDmItems, activeCat) {
    var sharedWorkerOps = managementSharedWorkerOpsInbox();
    var split = splitDmInbox(merged, splitSections, teamDmItems);
    if (sharedWorkerOps) {
      var laneItems = activeCat === "ops" ? split.opsItems : split.directItems;
      return activeCat === "ops" ? laneItems : pinLiaisonFirst(laneItems, merged);
    }
    return pinLiaisonFirst(flattenDmInbox(merged, splitSections, teamDmItems), merged);
  }

  function appendDirectorDirectGroups(merged, directItems, directSeen) {
    if (groupsBelongInChannelsOnly()) return;
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
      if (item.synthetic && String(item.peerId || item.workerId || "").trim()) {
        var synWk = String(item.peerId || item.workerId || "").trim();
        if (directSeen["w:" + synWk]) return;
        directSeen["w:" + synWk] = true;
        directItems.push(item);
        return;
      }
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

  var LANE_SVGS = {
    direct:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    ops:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  };

  function renderCeoInboxNav(activeCat, split) {
    var bar = document.getElementById("csCliqInboxCategoryBar");
    if (!bar) return;
    activeCat = activeCat === "ops" ? "ops" : "direct";
    split = split || { directItems: [], opsItems: [] };
    bar.hidden = false;
    bar.setAttribute("aria-hidden", "false");
    bar.className = "portal-cs-cliq-inbox-categories portal-cs-cliq-inbox-lane-nav";
    var directUnread = countUnread(split.directItems);
    var opsUnread = countUnread(split.opsItems);
    var directLabel = "Direct" + (directUnread > 0 ? " (" + directUnread + ")" : "");
    var opsLabel = "Ops" + (opsUnread > 0 ? " (" + opsUnread + ")" : "");
    bar.innerHTML =
      '<button type="button" class="portal-cs-cliq-inbox-cat-btn portal-cs-cliq-inbox-lane-btn' +
      (activeCat === "direct" ? " is-active" : "") +
      '" data-cs-cliq-inbox-cat="direct" aria-label="Direct leadership inbox">' +
      '<span class="portal-cs-cliq-inbox-cat-btn__icon">' +
      (LANE_SVGS.direct || "") +
      "</span>" +
      '<span class="portal-cs-cliq-inbox-cat-btn__label">' +
      directLabel +
      "</span>" +
      '<span class="portal-cs-cliq-inbox-cat-btn__sub">1:1</span>' +
      "</button>" +
      '<button type="button" class="portal-cs-cliq-inbox-cat-btn portal-cs-cliq-inbox-lane-btn' +
      (activeCat === "ops" ? " is-active" : "") +
      '" data-cs-cliq-inbox-cat="ops" aria-label="Shared staff ops inbox">' +
      '<span class="portal-cs-cliq-inbox-cat-btn__icon">' +
      (LANE_SVGS.ops || "") +
      "</span>" +
      '<span class="portal-cs-cliq-inbox-cat-btn__label">' +
      opsLabel +
      "</span>" +
      '<span class="portal-cs-cliq-inbox-cat-btn__sub">Staff line</span>' +
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
    var renderList =
      typeof global.portalAdminDmRenderList === "function"
        ? global.portalAdminDmRenderList
        : typeof global.portalExecutiveDmRenderList === "function"
          ? global.portalExecutiveDmRenderList
          : null;
    if (renderList) {
      void renderList();
      return;
    }
    var host = document.getElementById("csCliqListWrap");
    if (host && lastInboxCtx) {
      void renderAdminInbox(host, lastInboxCtx);
    }
  }

  function emptyInboxMessage(activeCat) {
    if (activeCat === "ops") {
      return "No staff threads yet. The roster loads here when staff message the shared line.";
    }
    return "No 1:1 chats yet. Tap a director in the list to start.";
  }

  function directorPeerLabel(row) {
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.inboxPeerLabel === "function"
    ) {
      var label = String(global.portalChatActorIdentity.inboxPeerLabel(row) || "").trim();
      if (label) return label;
    }
    return String(row.full_name || row.username || "").trim() || "Contact";
  }

  function isSelfStaffId(staffId) {
    staffId = String(staffId || "").trim();
    if (!staffId) return false;
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.isSelfUserId === "function"
    ) {
      return global.portalChatActorIdentity.isSelfUserId(staffId);
    }
    var me = String((profileRow() && profileRow().id) || "").trim();
    return !!(me && me === staffId);
  }

  async function loadDirectorDirectPeerItems(client, me, existingItems) {
    if (!client) return [];
    if (!managementSharedWorkerOpsInbox() && !global.__PORTAL_CS_CLIQ_STANDALONE) return [];
    me = String(me || "").trim();
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.actorId === "function"
    ) {
      me = String(global.portalChatActorIdentity.actorId() || me).trim();
    }
    var seen = Object.create(null);
    (existingItems || []).forEach(function (item) {
      if (!item || item.kind !== "dm") return;
      var pid = String(item.peerId || item.workerId || "").trim();
      if (pid) seen[pid] = true;
    });
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(200);
    if (res.error || !Array.isArray(res.data)) return [];
    var items = [];
    res.data.forEach(function (row) {
      if (!row || !row.id) return;
      var id0 = String(row.id);
      if (isSelfStaffId(id0) || seen[id0]) return;
      var isDirector =
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
        global.portalDmRoles.portalDmIsDirectorProfile(row);
      var isAdmin =
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsAdminProfile === "function" &&
        global.portalDmRoles.portalDmIsAdminProfile(row);
      if (!isDirector && !isAdmin) return;
      items.push({
        kind: "dm",
        id: "",
        label: directorPeerLabel(row),
        when: null,
        peerId: id0,
        peerProf: row,
        isTeamChat: false,
        synthetic: true,
        inboxLane: "personal",
      });
    });
    return items;
  }

  async function fillDirectPeerPicks(host) {
    if (!host) return;
    host.innerHTML = "";
    var box = global.__PORTAL_SUPABASE__ || {};
    var client = box.client;
    var me = String((box.staff_profile && box.staff_profile.id) || "").trim();
    if (!client || !me) return;
    if (typeof global.portalAdminDmEnsureDmThreadAndOpen !== "function") return;
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(200);
    if (res.error || !Array.isArray(res.data)) return;
    var added = 0;
    res.data.forEach(function (row) {
      if (!row || !row.id) return;
      var id0 = String(row.id);
      if (id0 === me) return;
      var isDirector =
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
        global.portalDmRoles.portalDmIsDirectorProfile(row);
      var isAdmin =
        global.portalDmRoles &&
        typeof global.portalDmRoles.portalDmIsAdminProfile === "function" &&
        global.portalDmRoles.portalDmIsAdminProfile(row);
      if (!isDirector && !isAdmin) return;
      var lab =
        ((row.full_name || row.username || "").trim() || id0.slice(0, 8)).split(/\s+/)[0] ||
        "Contact";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-cs-cliq-channel-btn portal-cs-cliq-channel-btn--peer";
      btn.textContent = lab;
      btn.addEventListener("click", function () {
        void global.portalAdminDmEnsureDmThreadAndOpen(id0);
      });
      host.appendChild(btn);
      added += 1;
    });
    if (!added) {
      host.innerHTML =
        '<p class="muted portal-cs-cliq-inbox-lane-empty" style="margin:0;font-size:13px">Director contacts could not load.</p>';
    }
  }

  async function renderAdminInbox(host, ctx) {
    if (!host || !ctx) return;
    lastInboxCtx = ctx;
    syncInboxChrome();
    var renderItem = ctx.renderItem;
    var me = ctx.me;
    var ch = ctx.ch;
    var inboxClient =
      ctx.client || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) || null;
    if (
      inboxClient &&
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.ensureSessionProfile === "function"
    ) {
      await global.portalChatActorIdentity.ensureSessionProfile(inboxClient);
      me =
        (global.portalChatActorIdentity &&
          typeof global.portalChatActorIdentity.actorId === "function" &&
          global.portalChatActorIdentity.actorId()) ||
        me;
    }
    var sharedWorkerOps = managementSharedWorkerOpsInbox();
    var split = splitDmInbox(ctx.merged, ctx.splitSections, ctx.teamDmItems);
    var activeCat = sharedWorkerOps ? getCeoInboxCategory() : "direct";
    if (sharedWorkerOps) {
      renderCeoInboxNav(activeCat, split);
      renderCeoInboxLaneHint(activeCat, true);
    } else {
      renderCeoInboxLaneHint("direct", false);
    }
    var dmItems = buildVisibleInboxItems(ctx.merged, ctx.splitSections, ctx.teamDmItems, activeCat);
    if (groupsBelongInChannelsOnly()) {
      dmItems = dmItems.filter(function (item) {
        return !item || item.kind !== "group";
      });
    }
    if (activeCat === "direct" && inboxClient) {
      var directorExtras = await loadDirectorDirectPeerItems(inboxClient, me, dmItems);
      if (directorExtras.length) {
        dmItems = sortDmItems(dmItems.concat(directorExtras));
      }
    } else if (global.__PORTAL_CS_CLIQ_STANDALONE && inboxClient) {
      var standPeers = await loadDirectorDirectPeerItems(inboxClient, me, dmItems);
      if (standPeers.length) {
        dmItems = sortDmItems(dmItems.concat(standPeers));
      }
    }
    host.innerHTML = "";
    if (!dmItems.length) {
      if (global.__PORTAL_CS_CLIQ_STANDALONE && inboxClient) {
        host.innerHTML =
          '<p class="muted portal-cs-cliq-inbox-lane-empty" style="margin:0 0 10px;font-size:13px;min-width:0;overflow-wrap:break-word">Tap a contact to start chatting.</p>' +
          '<div class="portal-cs-cliq-inbox-direct-peers" id="csCliqStandalonePeerPicks"></div>';
        await fillDirectPeerPicks(document.getElementById("csCliqStandalonePeerPicks"));
        if (document.getElementById("csCliqStandalonePeerPicks").children.length) return;
      }
      host.innerHTML =
        '<p class="muted portal-cs-cliq-inbox-lane-empty" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">' +
        (sharedWorkerOps ? emptyInboxMessage(activeCat) : "No conversations here yet.") +
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

  function sumVisibleInboxUnread(merged, splitSections, teamDmItems) {
    var sharedWorkerOps = managementSharedWorkerOpsInbox();
    var activeCat = sharedWorkerOps ? getCeoInboxCategory() : "direct";
    return countUnread(buildVisibleInboxItems(merged, splitSections, teamDmItems, activeCat));
  }

  global.portalCsCliqAdminInbox = {
    groupsBelongInChannelsOnly: groupsBelongInChannelsOnly,
    shouldUseCategorizedInbox: shouldUseCategorizedInbox,
    usesDirectorLaneNav: usesDirectorLaneNav,
    loadDirectorDirectPeerItems: loadDirectorDirectPeerItems,
    fillDirectPeerPicks: fillDirectPeerPicks,
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
    isLiaisonGroup: isLiaisonGroup,
    pinLiaisonFirst: pinLiaisonFirst,
    buildVisibleInboxItems: buildVisibleInboxItems,
    countUnread: countUnread,
    flattenDmInbox: flattenDmInbox,
    sumVisibleInboxUnread: sumVisibleInboxUnread,
  };
})(typeof window !== "undefined" ? window : globalThis);
