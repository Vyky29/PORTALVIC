/**
 * CS Cliq group thread header + channel cards — member name chips (WhatsApp-style).
 */
(function (global) {
  "use strict";

  var MEMBER_SLUGS = {
    session_leads: true,
    staff_leads_ops: true,
    all_ceos: true,
    ceo_liaison: true,
    swimming_instructors: true,
    climbing_instructors: true,
    support_staff: true,
    pool_leads: true,
    lead_team_john: true,
    lead_team_john_bespoke: true,
    lead_team_john_sunday_ma: true,
    lead_team_berta: true,
    lead_team_berta_ma: true,
    lead_team_michelle: true,
  };

  var KNOWN_LEAD_KEYS = {
    john: true,
    berta: true,
    michelle: true,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function client() {
    var box = global.__PORTAL_SUPABASE__ || {};
    return box.client || null;
  }

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function firstName(full) {
    full = String(full || "").trim();
    if (!full) return "";
    return full.split(/\s+/)[0] || full;
  }

  /** Javi (CEO) and Javier Marquez (staff) share similar names — prefer portal username. */
  function profileChipLabel(row) {
    var user = String((row && row.username) || "")
      .trim()
      .toLowerCase();
    if (user === "sevitha" || user === "info") return "Sev";
    if (user === "javi") return "Javi";
    if (user === "javier") return "Javier";
    if (user === "raul" || user === "raúl") return "Raúl";
    if (user === "victor") return "Victor";
    return firstName((row && row.full_name) || (row && row.username) || "");
  }

  function chipFromProfile(row, fallback) {
    if (!row) return null;
    var full = String(row.full_name || row.username || fallback || "").trim();
    if (!full) return null;
    var label = profileChipLabel(row) || firstName(full) || full;
    return { label: label, title: full };
  }

  function isSessionLeadProfile(row) {
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "admin" || ar === "ceo") return false;
    if (ar === "lead") return true;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr.indexOf("lead_dashboard") >= 0) return true;
    var u = normKey(row.username);
    var first = normKey(String(row.full_name || "").split(/\s+/).filter(Boolean)[0] || "");
    if (KNOWN_LEAD_KEYS[u] || KNOWN_LEAD_KEYS[first]) return true;
    return false;
  }

  function isExecutiveCeoProfile(row) {
    if (!row || row.is_active === false) return false;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function"
    ) {
      return global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(row);
    }
    var u = normKey(row.username);
    var first = normKey(String(row.full_name || "").split(/\s+/).filter(Boolean)[0] || "");
    return u === "victor" || u === "raul" || u === "javi" || first === "victor" || first === "raul" || first === "javi";
  }

  function mergeChips(primary, extra) {
    var out = [];
    var seen = Object.create(null);
    function push(list) {
      (list || []).forEach(function (c) {
        if (!c || !c.label) return;
        var k = normKey(c.label);
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(c);
      });
    }
    push(primary);
    push(extra);
    return out;
  }

  async function loadSessionLeadChips(supabase) {
    if (
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.loadSessionLeads === "function"
    ) {
      var leads = await global.portalCsCliqAdminInbox.loadSessionLeads(supabase);
      var fromHelper = (leads || [])
        .map(function (row) {
          return chipFromProfile(row);
        })
        .filter(Boolean);
      if (fromHelper.length) return fromHelper;
    }
    var res = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,dashboard_route,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(80);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .filter(isSessionLeadProfile)
      .map(function (row) {
        return chipFromProfile(row);
      })
      .filter(Boolean);
  }

  async function loadCeoChips(supabase) {
    var res = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .eq("app_role", "ceo")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(10);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .filter(isExecutiveCeoProfile)
      .map(function (row) {
        return chipFromProfile(row);
      })
      .filter(Boolean);
  }

  async function loadLiaisonChips(supabase) {
    var chips = await loadCeoChips(supabase);
    var adminRes = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .eq("app_role", "admin")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(5);
    if (!adminRes.error && Array.isArray(adminRes.data)) {
      adminRes.data.forEach(function (row) {
        var u = normKey(row.username);
        if (u !== "sevitha" && u !== "info") return;
        var c = chipFromProfile(row);
        if (c) chips.push(c);
      });
    }
    return chips;
  }

  async function loadGroupAuthorChips(supabase, groupId) {
    groupId = String(groupId || "").trim();
    if (!supabase || !groupId) return [];
    var msgRes = await supabase
      .from("portal_ceo_group_message")
      .select("author_id")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(160);
    if (msgRes.error || !Array.isArray(msgRes.data)) return [];
    var ids = [];
    msgRes.data.forEach(function (m) {
      var id = String((m && m.author_id) || "").trim();
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length) return [];
    var profRes = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .in("id", ids);
    if (profRes.error || !Array.isArray(profRes.data)) return [];
    return profRes.data
      .filter(function (row) {
        return row && row.is_active !== false;
      })
      .map(function (row) {
        return chipFromProfile(row);
      })
      .filter(Boolean);
  }

  async function loadActiveStaffChips(supabase, limit) {
    limit = Math.max(1, parseInt(limit, 10) || 24);
    var res = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .eq("app_role", "staff")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(limit);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .map(function (row) {
        return chipFromProfile(row);
      })
      .filter(Boolean);
  }

  async function loadStaffRoleChips(supabase, staffRole, appRole) {
    staffRole = String(staffRole || "").toLowerCase();
    appRole = String(appRole || "staff").toLowerCase();
    var q = supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,staff_role,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(40);
    if (appRole === "lead") {
      q = q.eq("app_role", "lead");
    } else {
      q = q.eq("app_role", "staff").eq("staff_role", staffRole);
    }
    var res = await q;
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .map(function (row) {
        return chipFromProfile(row);
      })
      .filter(Boolean);
  }

  async function loadMemberChips(groupSlug, groupId) {
    groupSlug = String(groupSlug || "").toLowerCase();
    groupId = String(groupId || "").trim();
    if (
      global.portalLeadTeamGroups &&
      typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function" &&
      (groupSlug.indexOf("lead_team_") === 0 || groupSlug === "session_leads")
    ) {
      var leadChips = await global.portalLeadTeamGroups.loadMemberChipsForSlug(groupSlug, groupId);
      if (leadChips != null) return leadChips;
    }
    if (!MEMBER_SLUGS[groupSlug] && !groupId) return [];
    var supabase = client();
    if (!supabase) return [];
    var primary = [];
    if (groupSlug === "pool_leads") {
      primary = await loadSessionLeadChips(supabase);
    } else if (groupSlug === "staff_leads_ops") {
      var opsLeads = await loadSessionLeadChips(supabase);
      var opsStaff = await loadActiveStaffChips(supabase, 24);
      primary = mergeChips(opsLeads, opsStaff);
    } else if (groupSlug === "all_ceos") {
      primary = await loadCeoChips(supabase);
    } else if (groupSlug === "ceo_liaison") {
      primary = await loadLiaisonChips(supabase);
    } else if (groupSlug === "swimming_instructors") {
      primary = await loadStaffRoleChips(supabase, "swimming", "staff");
    } else if (groupSlug === "climbing_instructors") {
      primary = await loadStaffRoleChips(supabase, "climbing", "staff");
    } else if (groupSlug === "support_staff") {
      primary = await loadStaffRoleChips(supabase, "support", "staff");
    } else if (groupSlug === "pool_leads") {
      primary = await loadStaffRoleChips(supabase, "", "lead");
    } else if (groupSlug === "lead_team_john_bespoke") {
      if (global.portalLeadTeamGroups && typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function") {
        primary = (await global.portalLeadTeamGroups.loadMemberChipsForSlug(groupSlug, groupId, supabase)) || [];
      }
    } else if (groupSlug === "lead_team_john_sunday_ma") {
      if (global.portalLeadTeamGroups && typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function") {
        primary = (await global.portalLeadTeamGroups.loadMemberChipsForSlug(groupSlug, groupId, supabase)) || [];
      }
    } else if (groupSlug === "lead_team_berta_ma" || groupSlug === "lead_team_berta") {
      if (global.portalLeadTeamGroups && typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function") {
        primary =
          (await global.portalLeadTeamGroups.loadMemberChipsForSlug("lead_team_berta_ma", groupId, supabase)) || [];
      }
    } else if (groupSlug === "lead_team_michelle") {
      if (global.portalLeadTeamGroups && typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function") {
        primary = (await global.portalLeadTeamGroups.loadMemberChipsForSlug(groupSlug, groupId, supabase)) || [];
      }
    } else if (groupSlug === "session_leads") {
      if (global.portalLeadTeamGroups && typeof global.portalLeadTeamGroups.loadMemberChipsForSlug === "function") {
        primary = (await global.portalLeadTeamGroups.loadMemberChipsForSlug(groupSlug, groupId, supabase)) || [];
      }
    }
    var extra = groupId ? await loadGroupAuthorChips(supabase, groupId) : [];
    return mergeChips(primary, extra);
  }

  function slugShowsMembers(groupSlug) {
    return !!MEMBER_SLUGS[String(groupSlug || "").toLowerCase()];
  }

  function chipsHtml(members, opts) {
    opts = opts || {};
    members = Array.isArray(members) ? members : [];
    if (!members.length) {
      return opts.emptyHtml != null ? String(opts.emptyHtml) : "";
    }
    var tone = String(opts.tone || "").trim();
    return members
      .map(function (m) {
        var chipTone = String(m.tone || tone || "").trim();
        var toneClass = chipTone ? " portal-cs-cliq-group-member-chip--" + chipTone : "";
        return (
          '<span class="portal-cs-cliq-group-member-chip' +
          toneClass +
          '" title="' +
          esc(m.title || m.label) +
          '">' +
          esc(m.label) +
          "</span>"
        );
      })
      .join("");
  }

  function renderChips(container, members) {
    if (!container) return;
    members = Array.isArray(members) ? members : [];
    if (!members.length) {
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      container.innerHTML = "";
      return;
    }
    container.hidden = false;
    container.setAttribute("aria-hidden", "false");
    container.innerHTML = chipsHtml(members);
  }

  function hideChips(container) {
    if (!container) return;
    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    container.innerHTML = "";
  }

  var loadToken = 0;

  async function syncGroupMemberChips(ui) {
    var host = document.getElementById("csCliqThreadMembers");
    if (!host) return;
    ui = ui || global.__PORTAL_ADMIN_DM_UI || {};
    if (!ui.groupId || String(ui.panel || "") !== "thread") {
      hideChips(host);
      return;
    }
    var slug = String(ui.groupSlug || "").toLowerCase();
    var token = ++loadToken;
    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    host.innerHTML =
      '<span class="portal-cs-cliq-group-member-chip portal-cs-cliq-group-member-chip--loading">…</span>';
    var members = await loadMemberChips(slug, ui.groupId);
    if (token !== loadToken) return;
    if (!members.length && !slugShowsMembers(slug)) {
      hideChips(host);
      return;
    }
    renderChips(host, members);
  }

  global.portalCsCliqGroupMembers = {
    loadMemberChips: loadMemberChips,
    slugShowsMembers: slugShowsMembers,
    syncGroupMemberChips: syncGroupMemberChips,
    renderChips: renderChips,
    chipsHtml: chipsHtml,
    profileChipLabel: profileChipLabel,
    chipFromProfile: chipFromProfile,
  };
})(typeof window !== "undefined" ? window : globalThis);
