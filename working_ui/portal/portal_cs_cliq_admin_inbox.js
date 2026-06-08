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
    var bar = document.getElementById("csCliqInboxCategoryBar");
    if (bar) {
      bar.hidden = true;
      bar.setAttribute("aria-hidden", "true");
    }
    var quick = document.getElementById("csCliqCeoQuickWrap");
    if (quick) quick.hidden = true;
    var nav = document.getElementById("csCliqChannelNav");
    if (nav) {
      nav.hidden = true;
      nav.setAttribute("aria-hidden", "true");
    }
  }

  async function loadSessionLeads(client) {
    if (!client) return [];
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,dashboard_route,is_active,avatar_url")
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

    function key(item) {
      if (!item) return "";
      if (item.kind === "group") return "g:" + String(item.id || item.slug || "");
      return "d:" + String(item.id || item.workerId || item.label || "");
    }

    function push(bucket, item) {
      if (!item) return;
      var k = key(item);
      if (k && seen[k]) return;
      if (k) seen[k] = true;
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
        if (item && item.isTeamChat) push(staffItems, item);
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

    return { leadItems: leadItems, staffItems: staffItems, ceoItems: ceoItems };
  }

  function flattenDmInbox(merged, splitSections, teamDmItems) {
    var items = [];
    var seen = Object.create(null);
    var opsByWorker = Object.create(null);
    if (splitSections && Array.isArray(splitSections.opsItems)) {
      splitSections.opsItems.forEach(function (opsItem) {
        var wk = String((opsItem && opsItem.workerId) || "").trim();
        if (wk && opsItem) opsByWorker[wk] = opsItem;
      });
    }
    function push(item) {
      if (!item || item.kind !== "dm" || item.isTeamChat) return;
      // Flat inbox = viewer's own 1:1 DMs. Ops lane (Sevitha ↔ worker) lives in Channels split view only.
      if (item.inboxLane === "ops") return;
      var tid = String(item.id || "").trim();
      var wk = String(item.workerId || item.peerId || "").trim();
      if (tid) {
        if (seen["t:" + tid]) return;
        seen["t:" + tid] = true;
        if (wk) seen["w:" + wk] = true;
        items.push(item);
        return;
      }
      // Worker slot without a thread yet — hide unless it has list preview activity.
      if (item.synthetic && !item.lastPreview && !item.when) {
        var fb = wk && opsByWorker[wk];
        if (!fb || (!fb.lastPreview && !fb.when)) return;
        item = Object.assign({}, item, {
          lastPreview: fb.lastPreview,
          lastSender: fb.lastSender,
          when: fb.when,
          unreadCount: fb.unreadCount || 0,
        });
      }
      if (!wk || seen["w:" + wk]) return;
      seen["w:" + wk] = true;
      items.push(item);
    }
    (merged || []).forEach(push);
    if (splitSections) {
      (splitSections.mineItems || []).forEach(push);
    }
    (teamDmItems || []).forEach(function (item) {
      if (item && !item.isTeamChat) push(item);
    });
    items.sort(function (a, b) {
      var ta = 0;
      var tb = 0;
      try {
        if (a.when) ta = new Date(a.when).getTime();
      } catch (_e) {}
      try {
        if (b.when) tb = new Date(b.when).getTime();
      } catch (_e2) {}
      return tb - ta;
    });
    return items;
  }

  async function renderAdminInbox(host, ctx) {
    if (!host || !ctx) return;
    syncInboxChrome();
    var renderItem = ctx.renderItem;
    var me = ctx.me;
    var ch = ctx.ch;
    var dmItems = flattenDmInbox(ctx.merged, ctx.splitSections, ctx.teamDmItems);
    host.innerHTML = "";
    if (!dmItems.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">' +
        "No 1:1 direct messages here. " +
        "<strong>Channels</strong> (left rail) has group chats and staff team threads. " +
        "Use <strong>New</strong> to start a direct chat.</p>";
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
    loadSessionLeads: loadSessionLeads,
    openLeadGhostView: openLeadGhostView,
    renderAdminInbox: renderAdminInbox,
    hideCategoryChrome: hideCategoryChrome,
    buildChannelCategories: buildChannelCategories,
  };
})(typeof window !== "undefined" ? window : globalThis);
