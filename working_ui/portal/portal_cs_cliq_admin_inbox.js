/**
 * Admin CS Cliq inbox — Leads / Staff / CEOs category tabs + filtered thread lists.
 */
(function (global) {
  "use strict";

  var CAT_STORAGE_KEY = "portal_admin_cs_cliq_cat";
  var CATEGORIES = [
    { id: "leads", label: "Leads", sub: "Session leads" },
    { id: "staff", label: "Staff", sub: "Pool staff" },
    { id: "ceos", label: "CEOs", sub: "Directors" },
  ];

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
    return document.getElementById("csCliqInboxCategoryBar");
  }

  function syncCategoryChrome(show) {
    var bar = categoryBarEl();
    if (bar) {
      bar.hidden = !show;
      bar.setAttribute("aria-hidden", show ? "false" : "true");
    }
    var quick = document.getElementById("csCliqCeoQuickWrap");
    if (quick) quick.hidden = !!show;
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

  function renderLeadGhostButton(lead, esc) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "portal-dm-thread-item portal-cs-cliq-inbox-ghost-btn";
    btn.setAttribute("data-cs-cliq-lead-ghost", String(lead.id || ""));
    var label = String(lead.full_name || lead.username || "Lead").trim() || "Lead";
    var avatarItem = {
      kind: "dm",
      label: label,
      roleTone: "lead",
      peerProfile: lead,
      username: lead.username,
      avatar_url: lead.avatar_url,
    };
    var avatarHtml = "";
    if (global.portalDmThreadAvatar && typeof global.portalDmThreadAvatar.html === "function") {
      avatarHtml = global.portalDmThreadAvatar.html(avatarItem, esc, "staff_lead");
    }
    btn.innerHTML =
      avatarHtml +
      '<div class="portal-dm-thread-item__body">' +
      '<div class="portal-dm-thread-item__head">' +
      '<span class="portal-dm-thread-peer">' +
      esc(label) +
      '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--lead">Lead</span></span>' +
      '<span class="portal-dm-thread-when">Ghost view</span>' +
      "</div>" +
      '<div class="portal-dm-thread-preview portal-cs-cliq-inbox-ghost-btn__hint">Read-only — their inbox on mobile</div>' +
      "</div>";
    btn.addEventListener("click", function () {
      void openLeadGhostView(String(lead.id || ""), btn);
    });
    return btn;
  }

  function buildCategories(ctx) {
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

    if (splitSections && Array.isArray(splitSections.mineItems)) {
      splitSections.mineItems.forEach(function (item) {
        if (item && item.isTeamChat) return;
        var prof = item.peerProf || {};
        if (isSessionLeadProfile(prof)) return;
        if (isCeoExecPeer(prof)) push(ceoItems, item);
        else if (isStaffWorkerProfile(prof)) push(staffItems, item);
      });
      if (splitSections.showOpsLane && Array.isArray(splitSections.opsItems)) {
        splitSections.opsItems.forEach(function (item) {
          push(staffItems, item);
        });
      }
    }

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
      if (item.isTeamChat) return;
      if (splitSections && Array.isArray(splitSections.mineItems) && splitSections.mineItems.length) {
        return;
      }
      var prof = item.peerProf || {};
      if (isSessionLeadProfile(prof)) return;
      if (isCeoExecPeer(prof)) push(ceoItems, item);
      else if (isStaffWorkerProfile(prof)) push(staffItems, item);
    });

    var ceoGroups = ceoItems.filter(function (i) {
      return i.kind === "group";
    });
    var ceoDms = ceoItems.filter(function (i) {
      return i.kind !== "group";
    });
    if (typeof orderFixedGroups === "function") {
      ceoGroups = orderFixedGroups(ceoGroups);
    }
    ceoItems = ceoGroups.concat(ceoDms);

    return { leadItems: leadItems, staffItems: staffItems, ceoItems: ceoItems };
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

  function renderCategoryPanel(host, cat, ctx, cats, leads, esc) {
    host.innerHTML = "";
    var renderItem = ctx.renderItem;

    if (cat === "leads") {
      appendSectionLabel(host, "View as lead (read-only)");
      if (!leads.length) {
        appendSectionEmpty(host, "No session leads found.");
      } else {
        leads.forEach(function (lead) {
          host.appendChild(renderLeadGhostButton(lead, esc));
        });
      }
      var leadThreads = cats.leadItems || [];
      if (leadThreads.length) {
        appendSectionLabel(host, "Lead conversations");
        leadThreads.forEach(function (item) {
          host.appendChild(renderItem(item));
        });
      } else {
        appendSectionLabel(host, "Lead conversations");
        appendSectionEmpty(
          host,
          "No lead-only group or lead-to-lead threads yet. Use ghost view above to inspect each lead inbox."
        );
      }
      return;
    }

    if (cat === "staff") {
      appendSectionLabel(host, "Staff chats");
      var staffItems = cats.staffItems || [];
      if (!staffItems.length) {
        appendSectionEmpty(host, "No staff conversations yet.");
      } else {
        staffItems.forEach(function (item) {
          host.appendChild(renderItem(item));
        });
      }
      return;
    }

    if (cat === "ceos") {
      appendSectionLabel(host, "CEO groups & messages");
      if (ctx.isSevitha) {
        var note = document.createElement("p");
        note.className = "portal-cs-cliq-inbox-section__hint muted";
        note.textContent =
          "Internal CEO ring is hidden. Use CEOs & Admin or message directors individually.";
        host.appendChild(note);
      }
      var ceoItems = cats.ceoItems || [];
      if (!ceoItems.length) {
        appendSectionEmpty(host, "No CEO conversations yet.");
      } else {
        ceoItems.forEach(function (item) {
          host.appendChild(renderItem(item));
        });
      }
    }
  }

  var lastCtx = null;
  var lastLeads = [];

  function paintInbox(host, cat, ctx, leads) {
    var esc =
      ctx.esc ||
      function (s) {
        return String(s == null ? "" : s);
      };
    var cats = buildCategories(ctx);
    renderCategoryBar(cat, esc, function (nextCat) {
      if (lastCtx && host) paintInbox(host, nextCat, lastCtx, lastLeads);
    });
    renderCategoryPanel(host, cat, ctx, cats, leads, esc);
  }

  async function renderAdminInbox(host, ctx) {
    if (!host || !ctx) return;
    lastCtx = ctx;
    syncCategoryChrome(true);
    var cat = getStoredCategory();
    var leads = await loadSessionLeads(ctx.client);
    lastLeads = leads;
    paintInbox(host, cat, ctx, leads);
  }

  function hideCategoryChrome() {
    syncCategoryChrome(false);
    lastCtx = null;
    lastLeads = [];
  }

  global.portalCsCliqAdminInbox = {
    shouldUseCategorizedInbox: shouldUseCategorizedInbox,
    loadSessionLeads: loadSessionLeads,
    openLeadGhostView: openLeadGhostView,
    renderAdminInbox: renderAdminInbox,
    hideCategoryChrome: hideCategoryChrome,
    getStoredCategory: getStoredCategory,
  };
})(typeof window !== "undefined" ? window : globalThis);
