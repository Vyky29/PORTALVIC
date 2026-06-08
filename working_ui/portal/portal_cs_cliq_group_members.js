/**
 * CS Cliq group thread header — member name chips (WhatsApp-style).
 */
(function (global) {
  "use strict";

  var MEMBER_SLUGS = {
    session_leads: true,
    staff_leads_ops: true,
    all_ceos: true,
    ceo_liaison: true,
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
    if (user === "javi") return "Javi";
    if (user === "javier") return "Javier";
    return firstName((row && row.full_name) || (row && row.username) || "");
  }

  function chipFromProfile(row, fallback) {
    if (!row) return null;
    var full = String(row.full_name || row.username || fallback || "").trim();
    if (!full) return null;
    var label = profileChipLabel(row) || firstName(full) || full;
    return { label: label, title: full };
  }

  async function loadSessionLeadChips(supabase) {
    if (
      global.portalCsCliqAdminInbox &&
      typeof global.portalCsCliqAdminInbox.loadSessionLeads === "function"
    ) {
      var leads = await global.portalCsCliqAdminInbox.loadSessionLeads(supabase);
      return (leads || [])
        .map(function (row) {
          return chipFromProfile(row);
        })
        .filter(Boolean);
    }
    var res = await supabase
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .eq("app_role", "lead")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(20);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
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
        var c = chipFromProfile(row);
        if (c) chips.push(c);
      });
    }
    return chips;
  }

  async function loadMemberChips(groupSlug) {
    groupSlug = String(groupSlug || "").toLowerCase();
    if (!MEMBER_SLUGS[groupSlug]) return [];
    var supabase = client();
    if (!supabase) return [];
    if (groupSlug === "session_leads" || groupSlug === "staff_leads_ops") {
      return loadSessionLeadChips(supabase);
    }
    if (groupSlug === "all_ceos") return loadCeoChips(supabase);
    if (groupSlug === "ceo_liaison") return loadLiaisonChips(supabase);
    return [];
  }

  function slugShowsMembers(groupSlug) {
    return !!MEMBER_SLUGS[String(groupSlug || "").toLowerCase()];
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
    container.innerHTML = members
      .map(function (m) {
        return (
          '<span class="portal-cs-cliq-group-member-chip" title="' +
          esc(m.title || m.label) +
          '">' +
          esc(m.label) +
          "</span>"
        );
      })
      .join("");
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
    if (!slugShowsMembers(slug)) {
      hideChips(host);
      return;
    }
    var token = ++loadToken;
    hideChips(host);
    host.hidden = false;
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = '<span class="portal-cs-cliq-group-member-chip portal-cs-cliq-group-member-chip--loading">…</span>';
    var members = await loadMemberChips(slug);
    if (token !== loadToken) return;
    renderChips(host, members);
  }

  global.portalCsCliqGroupMembers = {
    loadMemberChips: loadMemberChips,
    slugShowsMembers: slugShowsMembers,
    syncGroupMemberChips: syncGroupMemberChips,
    renderChips: renderChips,
    profileChipLabel: profileChipLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
