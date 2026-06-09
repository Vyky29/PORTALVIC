/**
 * Programme-lead team groups — service teams per lead + session-leads ring (Hub/resources).
 * Members from roster scopes; CEOs only on Michelle Day Centre cover list.
 */
(function (global) {
  "use strict";

  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /** CEOs / ops — excluded from programme staff chips unless allowExecCover on the team. */
  var EXEC_COVER_ROSTER_KEYS = {
    victor: true,
    raul: true,
    javi: true,
    sevitha: true,
  };

  var JOHN_BESPOKE_SCOPE = {
    weekdays: ["Monday", "Wednesday", "Friday"],
    serviceKeys: ["bespoke"],
    venues: ["swimfarm"],
  };

  var JOHN_SUNDAY_MA_SCOPE = {
    weekdays: ["Sunday"],
    serviceKeys: ["multi"],
    venues: ["swimfarm"],
    programmeWide: true,
  };

  var BERTA_MA_SCOPES = [
    { weekdays: ["Wednesday"], serviceKeys: ["multi"], venues: ["acton"], programmeWide: true },
    { weekdays: ["Sunday"], serviceKeys: ["multi"], venues: ["swimfarm"], programmeWide: true },
  ];

  var MICHELLE_DC_SCOPES = [
    { weekdays: DOW.slice(), serviceKeys: ["daycentre"], venues: [], programmeWide: true },
  ];

  /** Programme teams per lead (admin slug lead_team_* in portal_ceo_group). */
  var PROGRAMME_TEAMS_BY_LEAD = {
    john: [
      {
        slug: "lead_team_john_bespoke",
        label: "Bespoke programme",
        scopes: [JOHN_BESPOKE_SCOPE],
        leadRosterKeys: ["john"],
      },
      {
        slug: "lead_team_john_sunday_ma",
        label: "Sunday Multi-Activity",
        scopes: [JOHN_SUNDAY_MA_SCOPE],
        leadRosterKeys: ["john"],
      },
    ],
    berta: [
      {
        slug: "lead_team_berta_ma",
        label: "Multi-Activity team",
        scopes: BERTA_MA_SCOPES,
        leadRosterKeys: ["berta"],
      },
    ],
    michelle: [
      {
        slug: "lead_team_michelle",
        label: "Day Centre team",
        scopes: MICHELLE_DC_SCOPES,
        leadRosterKeys: ["michelle"],
        /** Support + CEO cover on Day Centre sessions only. */
        staticRosterKeys: ["roberto", "lulia", "luliya", "youssef", "victor", "raul"],
        allowExecCover: true,
      },
    ],
  };

  /** Inter-lead ring: John, Berta, Michelle — Hub Room / shared resources (not staff). */
  var SESSION_LEADS_RING = {
    slug: "session_leads",
    label: "Session leads · Hub & resources",
    memberRosterKeys: ["john", "berta", "michelle"],
  };

  /** Slugs hidden when scanning portal_ceo_group (legacy pools, CEO, ops ring). */
  var LEAD_INBOX_HIDDEN_GROUP_SLUGS = {
    all_ceos: true,
    ceo_liaison: true,
    pool_leads: true,
    staff_leads_ops: true,
    swimming_instructors: true,
    climbing_instructors: true,
    support_staff: true,
    staff_worker_mgmt: true,
    lead_team_john: true,
    lead_team_berta: true,
  };

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function normService(v) {
    var s = normKey(v);
    if (s.indexOf("daycentre") >= 0 || s.indexOf("daycenter") >= 0) return "daycentre";
    if (s.indexOf("bespoke") >= 0) return "bespoke";
    if (s.indexOf("multi") >= 0) return "multi";
    return s;
  }

  function normVenue(v) {
    return normKey(v).replace(/[^a-z]/g, "");
  }

  function weekdayFromIso(iso) {
    var s = String(iso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var d = new Date(s + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return DOW[d.getDay()] || "";
  }

  function resolveProgrammeLeadKey(prof) {
    prof = prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
    var ar = String(prof.app_role || "").toLowerCase();
    if (ar === "admin" || ar === "ceo") return "";
    var u = normKey(prof.username);
    var first = normKey(String(prof.full_name || "").split(/\s+/).filter(Boolean)[0] || "");
    if (u === "john" || first === "john") return "john";
    if (u === "berta" || first === "berta") return "berta";
    if (u === "michelle" || first === "michelle") return "michelle";
    if (global.portalStaffRosterResolve && typeof global.portalStaffRosterResolve.profileRosterKey === "function") {
      var rk = normKey(global.portalStaffRosterResolve.profileRosterKey(prof.username || prof.full_name));
      if (rk === "john" || rk === "berta" || rk === "michelle") return rk;
    }
    return "";
  }

  function parseInstructorKeys(raw) {
    var out = [];
    var add = function (n) {
      var k = normKey(n);
      if (k === "luliya") k = "lulia";
      if (k && out.indexOf(k) < 0) out.push(k);
    };
    if (Array.isArray(raw)) {
      raw.forEach(add);
      return out;
    }
    String(raw || "")
      .split(/,|\/|&|\band\b/gi)
      .forEach(add);
    return out;
  }

  function rowMatchesScope(row, scope) {
    var wd = String(row.day || "").trim() || weekdayFromIso(row.session_date || row.date);
    if (scope.weekdays.indexOf(wd) < 0) return false;
    var sk = normService(row.service);
    if (scope.serviceKeys.indexOf("daycentre") >= 0 && sk === "daycentre") {
      /* ok */
    } else if (scope.serviceKeys.indexOf(sk) < 0) return false;
    if (scope.venues && scope.venues.length) {
      var v = normVenue(row.venue);
      if (
        !scope.venues.some(function (want) {
          return v.indexOf(normVenue(want)) >= 0;
        })
      ) {
        return false;
      }
    }
    return true;
  }

  function shouldIncludeRosterKey(k, teamDef) {
    k = normKey(k);
    if (k === "luliya") k = "lulia";
    if (!k) return false;
    if (EXEC_COVER_ROSTER_KEYS[k] && !(teamDef && teamDef.allowExecCover)) return false;
    return true;
  }

  function collectRosterKeysForTeamDef(teamDef) {
    teamDef = teamDef || {};
    var scopes = teamDef.scopes || [];
    var keys = [];
    var add = function (k) {
      k = normKey(k);
      if (k === "luliya") k = "lulia";
      if (!shouldIncludeRosterKey(k, teamDef)) return;
      if (!k || keys.indexOf(k) >= 0) return;
      keys.push(k);
    };
    if (teamDef.leadRosterKeys) teamDef.leadRosterKeys.forEach(add);
    if (teamDef.staticRosterKeys) teamDef.staticRosterKeys.forEach(add);

    var src = global.STAFF_DASHBOARD_SOURCE || {};
    var rows = Array.isArray(src.rows) ? src.rows : [];
    rows.forEach(function (row) {
      if (!row) return;
      var sk = normService(row.service);
      if (sk === "climbing" || sk === "aquatic") return;
      var matched = false;
      for (var i = 0; i < scopes.length; i++) {
        if (rowMatchesScope(row, scopes[i])) {
          matched = true;
          break;
        }
      }
      if (!matched) return;
      parseInstructorKeys(row.instructors).forEach(add);
    });
    return keys;
  }

  function rosterKeyToDisplayLabel(key) {
    key = normKey(key);
    if (key === "lulia" || key === "luliya") return "Luliya";
    if (key === "john") return "John";
    if (key === "berta") return "Berta";
    if (key === "michelle") return "Michelle";
    if (key === "roberto") return "Roberto";
    if (key === "youssef") return "Youssef";
    if (key === "victor") return "Victor";
    if (key === "raul") return "Raúl";
    if (key === "javi") return "Javi";
    if (key === "bismark") return "Bismark";
    if (key === "godsway") return "Godsway";
    if (key === "giuseppe") return "Giuseppe";
    if (key === "javier") return "Javier";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  var SESSION_LEAD_KEYS = { john: true, berta: true, michelle: true };

  function chipToneForMember(rosterKey, ctx, profileRow) {
    rosterKey = normKey(rosterKey);
    if (rosterKey === "luliya") rosterKey = "lulia";
    ctx = ctx || {};
    if (ctx.sessionLeadsRing) return "lead";
    if (SESSION_LEAD_KEYS[rosterKey]) {
      var teamLeads = ctx.teamLeadKeys || [];
      for (var i = 0; i < teamLeads.length; i++) {
        if (normKey(teamLeads[i]) === rosterKey) return "team";
      }
      if (profileRow && String(profileRow.app_role || "").toLowerCase() === "lead") return "team";
    }
    return "staff";
  }

  async function profilesForRosterKeys(client, rosterKeys, ctx) {
    ctx = ctx || {};
    rosterKeys = Array.isArray(rosterKeys) ? rosterKeys : [];
    if (!rosterKeys.length) return [];
    var res = null;
    if (client) {
      res = await client
        .from("staff_profiles")
        .select("id,full_name,username,app_role,staff_role,is_active")
        .or("is_active.is.null,is_active.eq.true")
        .order("full_name", { ascending: true })
        .limit(120);
    }
    var chips = [];
    var seen = Object.create(null);
    rosterKeys.forEach(function (rk) {
      var want = normKey(rk);
      if (want === "luliya") want = "lulia";
      var row = null;
      if (res && !res.error && Array.isArray(res.data)) {
        for (var i = 0; i < res.data.length; i++) {
          var p = res.data[i];
          if (!p) continue;
          var pu = normKey(p.username);
          var pf = normKey(String(p.full_name || "").split(/\s+/).filter(Boolean)[0]);
          var pfull = normKey(p.full_name);
          if (
            pu === want ||
            pf === want ||
            pfull.indexOf(want) >= 0 ||
            (global.portalStaffRosterResolve &&
              normKey(global.portalStaffRosterResolve.profileRosterKey(p.username || p.full_name)) === want)
          ) {
            row = p;
            break;
          }
        }
      }
      var label = "";
      var title = "";
      if (
        row &&
        global.portalCsCliqGroupMembers &&
        typeof global.portalCsCliqGroupMembers.chipFromProfile === "function"
      ) {
        var chip = global.portalCsCliqGroupMembers.chipFromProfile(row);
        if (chip) {
          label = chip.label;
          title = chip.title;
        }
      }
      if (!label) {
        label = rosterKeyToDisplayLabel(want);
        title = label;
      }
      var lk = normKey(label);
      if (seen[lk]) return;
      seen[lk] = true;
      chips.push({ label: label, title: title, tone: chipToneForMember(want, ctx, row) });
    });
    return chips;
  }

  async function memberChipsForTeamDef(client, teamDef) {
    teamDef = teamDef || {};
    return profilesForRosterKeys(client, collectRosterKeysForTeamDef(teamDef), {
      teamLeadKeys: teamDef.leadRosterKeys || [],
    });
  }

  async function resolveGroupRow(client, slug, fallbackLabel) {
    var groupId = "";
    var title = fallbackLabel;
    if (client && slug) {
      var g = await client.from("portal_ceo_group").select("id,title,slug").eq("slug", slug).maybeSingle();
      if (!g.error && g.data && g.data.id) {
        groupId = String(g.data.id);
        title = String(g.data.title || fallbackLabel).trim() || fallbackLabel;
      }
    }
    return { groupId: groupId, title: title };
  }

  async function buildTeamEntry(client, teamDef) {
    var resolved = await resolveGroupRow(client, teamDef.slug, teamDef.label);
    var memberChips = await memberChipsForTeamDef(client, teamDef);
    return {
      kind: "group",
      groupId: resolved.groupId,
      groupSlug: teamDef.slug,
      label: resolved.title,
      memberChips: memberChips,
    };
  }

  async function buildSessionLeadsRingEntry(client) {
    var ring = SESSION_LEADS_RING;
    var resolved = await resolveGroupRow(client, ring.slug, ring.label);
    var memberChips = await profilesForRosterKeys(client, ring.memberRosterKeys, { sessionLeadsRing: true });
    return {
      kind: "group",
      groupId: resolved.groupId,
      groupSlug: ring.slug,
      label: resolved.title,
      memberChips: memberChips,
      sessionLeadsRing: true,
    };
  }

  async function entriesForLead(client, prof) {
    prof = prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
    var leadKey = resolveProgrammeLeadKey(prof);
    if (!leadKey || !PROGRAMME_TEAMS_BY_LEAD[leadKey]) return [];

    var teams = PROGRAMME_TEAMS_BY_LEAD[leadKey];
    var out = [];
    for (var i = 0; i < teams.length; i++) {
      out.push(await buildTeamEntry(client, teams[i]));
    }
    out.push(await buildSessionLeadsRingEntry(client));
    return out;
  }

  function findTeamDefBySlug(groupSlug) {
    groupSlug = String(groupSlug || "").toLowerCase();
    if (groupSlug === SESSION_LEADS_RING.slug) return SESSION_LEADS_RING;
    var keys = Object.keys(PROGRAMME_TEAMS_BY_LEAD);
    for (var i = 0; i < keys.length; i++) {
      var list = PROGRAMME_TEAMS_BY_LEAD[keys[i]] || [];
      for (var j = 0; j < list.length; j++) {
        if (list[j].slug === groupSlug) return list[j];
      }
    }
    return null;
  }

  async function loadMemberChipsForSlug(groupSlug, groupId, client) {
    groupSlug = String(groupSlug || "").toLowerCase();
    client = client || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client);
    if (groupSlug === SESSION_LEADS_RING.slug) {
      return profilesForRosterKeys(client, SESSION_LEADS_RING.memberRosterKeys, { sessionLeadsRing: true });
    }
    if (groupSlug.indexOf("lead_team_") === 0) {
      var teamDef = findTeamDefBySlug(groupSlug);
      if (teamDef) return memberChipsForTeamDef(client, teamDef);
    }
    return null;
  }

  function isHiddenLeadInboxSlug(slug) {
    slug = String(slug || "").toLowerCase();
    if (LEAD_INBOX_HIDDEN_GROUP_SLUGS[slug]) return true;
    if (slug === SESSION_LEADS_RING.slug) return false;
    if (findTeamDefBySlug(slug)) return false;
    if (
      slug === "all_ceos" ||
      slug === "ceo_liaison" ||
      slug.indexOf("swimming") >= 0 ||
      slug.indexOf("climbing") >= 0 ||
      slug.indexOf("support") >= 0
    ) {
      return true;
    }
    if (
      global.portalCsCliqWorkspace &&
      typeof global.portalCsCliqWorkspace.isSystemGroupSlug === "function" &&
      !global.portalCsCliqWorkspace.isSystemGroupSlug(slug)
    ) {
      return true;
    }
    return false;
  }

  global.portalLeadTeamGroups = {
    PROGRAMME_TEAMS_BY_LEAD: PROGRAMME_TEAMS_BY_LEAD,
    SESSION_LEADS_RING: SESSION_LEADS_RING,
    LEAD_INBOX_HIDDEN_GROUP_SLUGS: LEAD_INBOX_HIDDEN_GROUP_SLUGS,
    resolveProgrammeLeadKey: resolveProgrammeLeadKey,
    collectRosterKeysForTeamDef: collectRosterKeysForTeamDef,
    entriesForLead: entriesForLead,
    loadMemberChipsForSlug: loadMemberChipsForSlug,
    isHiddenLeadInboxSlug: isHiddenLeadInboxSlug,
  };
})(typeof window !== "undefined" ? window : globalThis);
