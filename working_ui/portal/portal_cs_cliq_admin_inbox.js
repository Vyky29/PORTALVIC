/**
 * Admin CS Cliq inbox — categorized sections: session leads (ghost), staff, CEOs.
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

  function shouldUseCategorizedInbox() {
    if (!global.__PORTAL_CS_CLIQ_ACTIVE) return false;
    return String(profileRow().app_role || "").toLowerCase() === "admin";
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
      '<div class="portal-dm-thread-preview portal-cs-cliq-inbox-ghost-btn__hint">Read-only — their mobile inbox</div>' +
      "</div>";
    btn.addEventListener("click", function () {
      void openLeadGhostView(String(lead.id || ""), btn);
    });
    return btn;
  }

  function categorizeItems(merged, splitSections, orderFixedGroups) {
    var staffItems = [];
    var ceoItems = [];

    function pushStaff(item) {
      if (!item) return;
      staffItems.push(item);
    }

    function pushCeo(item) {
      if (!item) return;
      ceoItems.push(item);
    }

    if (splitSections && Array.isArray(splitSections.mineItems)) {
      splitSections.mineItems.forEach(function (item) {
        if (item && item.isTeamChat) return;
        var prof = item.peerProf || {};
        if (isSessionLeadProfile(prof)) return;
        if (isCeoExecPeer(prof)) pushCeo(item);
        else if (isStaffWorkerProfile(prof)) pushStaff(item);
      });
      if (splitSections.showOpsLane && Array.isArray(splitSections.opsItems)) {
        splitSections.opsItems.forEach(pushStaff);
      }
    }

    (merged || []).forEach(function (item) {
      if (!item) return;
      if (item.kind === "group") {
        var slug = String(item.slug || "").toLowerCase();
        if (slug === "session_leads" || slug === "staff_leads_ops") return;
        pushCeo(item);
        return;
      }
      if (item.isTeamChat) return;
      if (splitSections && Array.isArray(splitSections.mineItems) && splitSections.mineItems.length) {
        return;
      }
      var prof = item.peerProf || {};
      if (isSessionLeadProfile(prof)) return;
      if (isCeoExecPeer(prof)) pushCeo(item);
      else if (isStaffWorkerProfile(prof)) pushStaff(item);
    });

    var groups = ceoItems.filter(function (i) {
      return i.kind === "group";
    });
    var dms = ceoItems.filter(function (i) {
      return i.kind !== "group";
    });
    if (typeof orderFixedGroups === "function") {
      groups = orderFixedGroups(groups);
    }
    ceoItems = groups.concat(dms);

    return { staffItems: staffItems, ceoItems: ceoItems };
  }

  function renderCategorizedInbox(host, opts) {
    opts = opts || {};
    var esc =
      opts.esc ||
      function (s) {
        return String(s == null ? "" : s);
      };
    var renderItem = opts.renderItem;
    var leads = opts.sessionLeads || [];
    var cats = opts.categories || {};

    host.innerHTML = "";

    appendSectionLabel(host, "Session leads");
    if (!leads.length) {
      appendSectionEmpty(host, "No session leads found.");
    } else {
      leads.forEach(function (lead) {
        host.appendChild(renderLeadGhostButton(lead, esc));
      });
    }

    appendSectionLabel(host, "Staff");
    var staffItems = cats.staffItems || [];
    if (!staffItems.length) {
      appendSectionEmpty(host, "No staff conversations yet.");
    } else {
      staffItems.forEach(function (item) {
        host.appendChild(renderItem(item));
      });
    }

    appendSectionLabel(host, "CEOs");
    var ceoItems = cats.ceoItems || [];
    if (!ceoItems.length) {
      appendSectionEmpty(host, "No CEO conversations yet.");
    } else {
      ceoItems.forEach(function (item) {
        host.appendChild(renderItem(item));
      });
    }
  }

  async function renderAdminInbox(host, ctx) {
    if (!host || !ctx) return;
    var leads = await loadSessionLeads(ctx.client);
    var cats = categorizeItems(ctx.merged, ctx.splitSections, ctx.orderFixedGroups);
    renderCategorizedInbox(host, {
      esc: ctx.esc,
      renderItem: function (item) {
        return ctx.renderItem(item, ctx.me, ctx.ch);
      },
      sessionLeads: leads,
      categories: cats,
    });
  }

  global.portalCsCliqAdminInbox = {
    shouldUseCategorizedInbox: shouldUseCategorizedInbox,
    loadSessionLeads: loadSessionLeads,
    openLeadGhostView: openLeadGhostView,
    renderAdminInbox: renderAdminInbox,
  };
})(typeof window !== "undefined" ? window : globalThis);
