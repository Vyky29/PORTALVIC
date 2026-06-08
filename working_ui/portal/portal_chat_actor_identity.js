/**
 * Canonical chat/call actor identity — always tied to Supabase Auth session (auth.uid).
 * Prevents wrong caller names, avatars, and thread peers when staff_profile.id is stale.
 */
(function (global) {
  "use strict";

  function box() {
    return global.__PORTAL_SUPABASE__ || {};
  }

  function sessionUserId() {
    var b = box();
    return String((b.session && b.session.user && b.session.user.id) || "").trim();
  }

  function profileRow() {
    return box().staff_profile || null;
  }

  function portalChatActorId() {
    var sid = sessionUserId();
    if (sid) return sid;
    var p = profileRow();
    return String((p && p.id) || "").trim();
  }

  function profilesMatchSession() {
    var sid = sessionUserId();
    var p = profileRow();
    if (!sid || !p || !p.id) return true;
    return String(p.id).trim() === sid;
  }

  async function portalChatEnsureSessionProfile(client) {
    client = client || box().client;
    if (!client) return profileRow();
    var sid = sessionUserId();
    if (!sid) return profileRow();
    if (profilesMatchSession() && profileRow()) return profileRow();
    try {
      var rpc = await client.rpc("portal_get_session_staff_profile");
      if (!rpc.error && rpc.data && typeof rpc.data === "object" && rpc.data.id) {
        box().staff_profile = rpc.data;
        return rpc.data;
      }
    } catch (_rpc) {}
    try {
      var selectCols =
        "id,full_name,username,app_role,staff_role,dashboard_route,is_active,auth_session_generation,nationality";
      var res = await client.from("staff_profiles").select(selectCols).eq("id", sid).maybeSingle();
      if (res.error && /dashboard_route|auth_session_generation|nationality/i.test(String(res.error.message || res.error))) {
        selectCols = "id,full_name,username,app_role,staff_role,is_active";
        res = await client.from("staff_profiles").select(selectCols).eq("id", sid).maybeSingle();
      }
      if (!res.error && res.data && res.data.id) {
        box().staff_profile = res.data;
        return res.data;
      }
    } catch (_q) {}
    return profileRow();
  }

  function shortName(value) {
    var t = String(value == null ? "" : value).trim();
    if (!t) return "";
    return t.split(/\s+/).filter(Boolean)[0] || t;
  }

  function profileDisplayName(prof) {
    if (!prof) return "";
    var user = String(prof.username || "").trim().toLowerCase();
    if (user === "javi") return "Javi";
    if (user === "javier") return "Javier";
    if (user === "victor") return "Victor";
    if (user === "raul" || user === "raúl") return "Raúl";
    return shortName(prof.full_name || prof.username || "");
  }

  function profilePeerLabel(prof) {
    if (!prof) return "";
    var user = String(prof.username || "").trim().toLowerCase();
    var full = String(prof.full_name || prof.username || "").trim();
    if (user === "javi") {
      return full.replace(/^Javier\b/i, "Javi") || "Javi";
    }
    if (user === "javier") return full || "Javier";
    return full;
  }

  function portalChatActorDisplayName(prof) {
    prof = prof || profileRow();
    var sid = sessionUserId();
    if (prof && sid && String(prof.id) === sid) {
      var nm = profileDisplayName(prof);
      if (nm) return nm;
    }
    var email = box().session && box().session.user && box().session.user.email;
    if (email) {
      var local = String(email).split("@")[0] || "";
      local = local.replace(/[._+-]+/g, " ").trim();
      nm = shortName(local);
      if (nm) return nm;
    }
    try {
      nm = shortName(global.dashboardData && global.dashboardData.staffName);
      if (nm) return nm;
    } catch (_d) {}
    return "Staff";
  }

  async function portalChatResolveCallerIdentity(client) {
    client = client || box().client;
    var uid = sessionUserId() || portalChatActorId();
    if (client) await portalChatEnsureSessionProfile(client);
    var name = portalChatActorDisplayName();
    if (client && uid) {
      try {
        var res = await client
          .from("staff_profiles")
          .select("full_name,username")
          .eq("id", uid)
          .maybeSingle();
        if (res.data) {
          name = profileDisplayName(res.data) || name;
        }
      } catch (_e) {}
    }
    return { id: uid, name: name || "Staff" };
  }

  function portalChatIsSelfUserId(userId) {
    userId = String(userId || "").trim().toLowerCase();
    if (!userId) return false;
    var sid = sessionUserId().toLowerCase();
    if (sid && sid === userId) return true;
    var p = profileRow();
    var pid = p && p.id ? String(p.id).trim().toLowerCase() : "";
    return !!(pid && pid === userId);
  }

  function portalDmPeerIdForThread(me, row) {
    me = String(me || "").trim();
    var a = String(row && row.participant_a || "").trim();
    var b = String(row && row.participant_b || "").trim();
    if (me && a === me) return b;
    if (me && b === me) return a;
    return b || a;
  }

  function nameFromProfile(prof, id) {
    var label = profilePeerLabel(prof);
    if (label) return label;
    return id ? String(id).slice(0, 8) : "";
  }

  function normKey(v) {
    if (global.portalDmRoles && typeof global.portalDmRoles.normKey === "function") {
      return global.portalDmRoles.normKey(v);
    }
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isDirectorAuthor(row) {
    return !!(
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsDirectorProfile === "function" &&
      global.portalDmRoles.portalDmIsDirectorProfile(row)
    );
  }

  function isOpsAdminAuthor(row) {
    return !!(
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsOperationsAdminProfile === "function" &&
      global.portalDmRoles.portalDmIsOperationsAdminProfile(row)
    );
  }

  function isManagementAuthor(row) {
    if (!row || row.is_active === false) return false;
    if (isDirectorAuthor(row) || isOpsAdminAuthor(row)) return true;
    var ar = String(row.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  function viewerUsesAdminCliq(viewer) {
    viewer = viewer || profileRow();
    return !!(
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmUsesAdminCliq === "function" &&
      global.portalDmRoles.portalDmUsesAdminCliq(viewer)
    );
  }

  /** Staff / lead inbox: director wrote or called on behalf of Admin. */
  function workerFacingAuthorChip(authorProf) {
    authorProf = authorProf || {};
    if (isDirectorAuthor(authorProf)) {
      var user = normKey(authorProf.username);
      var first = normKey(String(authorProf.full_name || "").split(/\s+/)[0] || "");
      if (user === "victor" || first === "victor") return "Admin (Victor Director)";
      if (user === "raul" || first === "raul") return "Admin (Ra\u00fal Director)";
      var nm = profileDisplayName(authorProf) || "Director";
      return nm + " (Admin)";
    }
    if (isOpsAdminAuthor(authorProf)) return "Admin";
    if (String(authorProf.app_role || "").toLowerCase() === "ceo" && !isDirectorAuthor(authorProf)) {
      return (profileDisplayName(authorProf) || "CEO") + " (Admin)";
    }
    return profileDisplayName(authorProf) || "Admin";
  }

  /** Admin board (Sevitha / directors): show who actually sent, not generic Admin. */
  function managementFacingAuthorChip(authorProf) {
    authorProf = authorProf || {};
    if (isDirectorAuthor(authorProf)) {
      return (profileDisplayName(authorProf) || "Director") + " (Director)";
    }
    if (isOpsAdminAuthor(authorProf)) {
      var nm = profileDisplayName(authorProf);
      if (normKey(authorProf.username) === "sevitha" || normKey(nm) === "sevitha") return "Admin (Sevitha)";
      return nm ? "Admin (" + nm + ")" : "Admin";
    }
    if (String(authorProf.app_role || "").toLowerCase() === "admin") {
      var label = profilePeerLabel(authorProf) || profileDisplayName(authorProf);
      return label ? label + " (Admin)" : "Admin";
    }
    if (String(authorProf.app_role || "").toLowerCase() === "ceo") {
      return (profileDisplayName(authorProf) || "CEO") + " (CEO)";
    }
    return profileDisplayName(authorProf) || profilePeerLabel(authorProf) || "";
  }

  /**
   * Line above a DM bubble — same thread, label depends on author + viewer + lane.
   * Staff/lead: Admin (Victor Director) | Admin | Javi (Admin)
   * Management board: Victor (Director) | Admin (Sevitha) | …
   */
  function portalChatManagementMsgAuthorChip(opts) {
    opts = opts || {};
    if (opts.mine) return "";
    var author = opts.authorProf || opts.authorRow || {};
    var viewer = opts.viewerProf || profileRow();
    var peerRole = String(opts.peerRole || "").toLowerCase();
    var ch = String(opts.channel || "").trim();
    var staffLane = ch === "staff_lead" && (peerRole === "staff" || peerRole === "lead");

    if (!isManagementAuthor(author)) {
      return profileDisplayName(author) || shortName(author.full_name || author.username) || "Team";
    }

    if (opts.audience === "worker") {
      return workerFacingAuthorChip(author);
    }

    if (staffLane && viewerUsesAdminCliq(viewer)) {
      return managementFacingAuthorChip(author);
    }

    if (staffLane || opts.audience === "worker") {
      return workerFacingAuthorChip(author);
    }

    if (ch === "ceo_exec") {
      if (isOpsAdminAuthor(author)) return "Admin";
      if (isDirectorAuthor(author)) return profileDisplayName(author) || "CEO";
      if (String(author.app_role || "").toLowerCase() === "ceo") {
        return profileDisplayName(author) || "CEO";
      }
    }

    if (viewerUsesAdminCliq(viewer)) {
      return managementFacingAuthorChip(author);
    }

    return workerFacingAuthorChip(author);
  }

  function portalChatManagementListSenderLabel(authorProf, opts) {
    opts = opts || {};
    if (!authorProf) return "Unknown sender";
    if (opts.mine) {
      return portalChatActorDisplayName(authorProf) || "You";
    }
    return portalChatManagementMsgAuthorChip(
      Object.assign({}, opts, { authorProf: authorProf, mine: false })
    );
  }

  function portalChatWorkerFacingCallerLabel(authorProf) {
    if (!authorProf) return "Admin";
    if (isManagementAuthor(authorProf)) return workerFacingAuthorChip(authorProf);
    return profileDisplayName(authorProf) || shortName(authorProf.full_name || authorProf.username) || "Team chat";
  }

  function portalDmThreadDisplayLabel(me, row, profBy) {
    profBy = profBy || {};
    me = String(me || "").trim();
    if (!row) return "Conversation";
    var a = String(row.participant_a || "").trim();
    var b = String(row.participant_b || "").trim();
    if (a && b && a !== b) {
      if (me && (a === me || b === me)) {
        var peer = a === me ? b : a;
        return nameFromProfile(profBy[peer] || {}, peer) || "Colleague";
      }
      var na = nameFromProfile(profBy[a] || {}, a);
      var nb = nameFromProfile(profBy[b] || {}, b);
      if (na && nb) return na + " \u2194 " + nb;
      return na || nb || "Conversation";
    }
    return nameFromProfile(profBy[a] || profBy[b] || {}, a || b) || "Conversation";
  }

  global.portalChatActorIdentity = {
    sessionUserId: sessionUserId,
    actorId: portalChatActorId,
    displayName: portalChatActorDisplayName,
    profileDisplayName: profileDisplayName,
    profilePeerLabel: profilePeerLabel,
    ensureSessionProfile: portalChatEnsureSessionProfile,
    resolveCallerIdentity: portalChatResolveCallerIdentity,
    isSelfUserId: portalChatIsSelfUserId,
    profilesMatchSession: profilesMatchSession,
    peerIdForThread: portalDmPeerIdForThread,
    threadDisplayLabel: portalDmThreadDisplayLabel,
    managementMsgAuthorChip: portalChatManagementMsgAuthorChip,
    managementListSenderLabel: portalChatManagementListSenderLabel,
    workerFacingAuthorChip: workerFacingAuthorChip,
    managementFacingAuthorChip: managementFacingAuthorChip,
    workerFacingCallerLabel: portalChatWorkerFacingCallerLabel,
    isManagementAuthor: isManagementAuthor,
    isDirectorAuthor: isDirectorAuthor,
    isOpsAdminAuthor: isOpsAdminAuthor,
  };
})(typeof window !== "undefined" ? window : globalThis);
