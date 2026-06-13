/**
 * Canonical chat/call actor identity — always tied to Supabase Auth session (auth.uid).
 * Prevents wrong caller names, avatars, and thread peers when staff_profile.id is stale.
 */
(function (global) {
  "use strict";

  var DM_OPERATOR_TAG_RE = /^\s*\[\[portal-dm-operator:([0-9a-f-]{36})\]\]/i;

  function parseDmOperatorTag(body) {
    var raw = String(body || "");
    var m = raw.match(DM_OPERATOR_TAG_RE);
    if (!m) return { operatorId: "", body: raw };
    return { operatorId: String(m[1] || "").trim(), body: raw.slice(m[0].length) };
  }

  function parseDmOperatorId(body) {
    return parseDmOperatorTag(body).operatorId;
  }

  function stripDmOperatorTag(body) {
    return parseDmOperatorTag(body).body;
  }

  function embedDmOperatorTag(body, operatorId) {
    var op = String(operatorId || "").trim();
    var text = String(body || "");
    if (!op) return text;
    if (DM_OPERATOR_TAG_RE.test(text)) return text;
    return "[[portal-dm-operator:" + op + "]]" + text;
  }

  function collectDmOperatorIdsFromMessages(rows) {
    var out = [];
    (rows || []).forEach(function (m) {
      var op = parseDmOperatorId(m && m.body);
      if (op && out.indexOf(op) < 0) out.push(op);
    });
    return out;
  }

  function resolveDmOperatorProf(body, authorProf, authorBy) {
    authorProf = authorProf || {};
    authorBy = authorBy || {};
    var opId = parseDmOperatorId(body);
    if (!opId) return null;
    if (!isOpsAdminAuthor(authorProf) && String(authorProf.app_role || "").toLowerCase() !== "admin") {
      return null;
    }
    return authorBy[opId] || { id: opId };
  }

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
    if (
      !sid &&
      client.auth &&
      typeof client.auth.getSession === "function"
    ) {
      try {
        var sessRes = await client.auth.getSession();
        if (sessRes && sessRes.data && sessRes.data.session) {
          box().session = sessRes.data.session;
          sid = sessionUserId();
        }
      } catch (_gs) {}
    }
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

  function portalChatSelfIdentityIds() {
    var ids = [];
    var sid = sessionUserId();
    if (sid) ids.push(String(sid).trim().toLowerCase());
    var p = profileRow();
    if (p && p.id) {
      var pid = String(p.id).trim().toLowerCase();
      if (ids.indexOf(pid) < 0) ids.push(pid);
    }
    return ids;
  }

  function portalChatIsSelfUserId(userId) {
    userId = String(userId || "").trim().toLowerCase();
    if (!userId) return false;
    return portalChatSelfIdentityIds().indexOf(userId) >= 0;
  }

  function portalDmPeerIdForThread(me, row) {
    me = String(me || "").trim();
    var a = String(row && row.participant_a || "").trim();
    var b = String(row && row.participant_b || "").trim();
    if (portalChatIsSelfUserId(a)) return b;
    if (portalChatIsSelfUserId(b)) return a;
    if (me && a === me) return b;
    if (me && b === me) return a;
    return b || a;
  }

  function nameFromProfile(prof, id) {
    var label = profileInboxLabel(prof);
    if (label) return label;
    return id ? String(id).slice(0, 8) : "";
  }

  function isWorkerInboxPeer(prof) {
    if (!prof || prof.is_active === false) return false;
    if (
      global.portalInternalDmIsWorkerRecipient &&
      typeof global.portalInternalDmIsWorkerRecipient === "function"
    ) {
      return global.portalInternalDmIsWorkerRecipient(prof);
    }
    var ar = String(prof.app_role || "").toLowerCase();
    return ar === "staff" || ar === "lead";
  }

  /** Inbox / thread list: workers & leads = first name only; ops admin = Sevitha (Admin); directors keep familiar labels. */
  function profileInboxLabel(prof) {
    prof = prof || {};
    if (isOpsAdminAuthor(prof)) {
      if (global.portalOpsAdminDisplay && typeof global.portalOpsAdminDisplay.managementLabel === "function") {
        return global.portalOpsAdminDisplay.managementLabel(prof);
      }
      return "Sevitha (Admin)";
    }
    if (isWorkerInboxPeer(prof)) {
      return shortName(prof.full_name || prof.username || "") || profileDisplayName(prof) || "";
    }
    var label = profilePeerLabel(prof);
    if (label) return label;
    return shortName(prof.full_name || prof.username || "") || "";
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

  /** Worker-facing labels: never expose director/ops names — ignore is_active gate. */
  function isManagementAuthorForWorkerDisplay(row) {
    if (!row) return false;
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

  /** Staff / lead inbox: unified Admin label — never attribute a named director to workers. */
  function workerFacingAuthorChip(authorProf) {
    authorProf = authorProf || {};
    if (isManagementAuthor(authorProf)) return "Admin";
    return profileDisplayName(authorProf) || "Team";
  }

  /** Admin board (Sevitha / directors): show who actually sent, not generic Admin. */
  function managementFacingAuthorChip(authorProf) {
    authorProf = authorProf || {};
    if (isDirectorAuthor(authorProf)) {
      return (profileDisplayName(authorProf) || "Director") + " (Director)";
    }
    if (isOpsAdminAuthor(authorProf)) {
      if (global.portalOpsAdminDisplay && typeof global.portalOpsAdminDisplay.managementLabel === "function") {
        return global.portalOpsAdminDisplay.managementLabel(authorProf);
      }
      return "Sevitha (Admin)";
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
   * Staff/lead: Admin (unified) | Team
   * Management board: Victor (Director) | Admin | …
   */
  function portalChatManagementMsgAuthorChip(opts) {
    opts = opts || {};
    if (opts.mine) return "";
    var author = opts.authorProf || opts.authorRow || {};
    // Workers/leads on staff dashboard: always unified Admin — never Victor/Sevitha from operator tag.
    if (opts.audience === "worker") {
      if (parseDmOperatorId(opts.messageBody || "")) return "Admin";
      if (isManagementAuthorForWorkerDisplay(author)) return workerFacingAuthorChip(author);
      return profileDisplayName(author) || shortName(author.full_name || author.username) || "Team";
    }
    var opProf = resolveDmOperatorProf(opts.messageBody, author, opts.authorBy);
    if (opProf) {
      return managementFacingAuthorChip(opProf);
    }
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
      if (isOpsAdminAuthor(author)) {
        if (global.portalOpsAdminDisplay && typeof global.portalOpsAdminDisplay.managementLabel === "function") {
          return global.portalOpsAdminDisplay.managementLabel(author);
        }
        return "Sevitha (Admin)";
      }
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
    if (opts.audience === "worker") {
      return portalChatWorkerPreviewSender(authorProf, opts);
    }
    var opProf = resolveDmOperatorProf(opts.messageBody, authorProf, opts.authorBy);
    if (opProf) {
      return managementFacingAuthorChip(opProf);
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

  function portalChatWorkerPreviewSender(authorProf, opts) {
    opts = opts || {};
    if (!authorProf) return "";
    if (opts.mine) return portalChatActorDisplayName(authorProf) || "You";
    if (parseDmOperatorId(opts.messageBody || "")) return "Admin";
    if (isManagementAuthorForWorkerDisplay(authorProf)) {
      return workerFacingAuthorChip(authorProf);
    }
    return (
      profileDisplayName(authorProf) ||
      profilePeerLabel(authorProf) ||
      shortName(authorProf.full_name || authorProf.username) ||
      ""
    );
  }

  function portalDmThreadDisplayLabel(me, row, profBy) {
    profBy = profBy || {};
    me = String(me || "").trim();
    if (!row) return "Conversation";
    var a = String(row.participant_a || "").trim();
    var b = String(row.participant_b || "").trim();
    if (a && b && a !== b) {
      if (portalChatIsSelfUserId(a)) {
        return nameFromProfile(profBy[b] || {}, b) || "Colleague";
      }
      if (portalChatIsSelfUserId(b)) {
        return nameFromProfile(profBy[a] || {}, a) || "Colleague";
      }
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
    profileInboxLabel: profileInboxLabel,
    inboxPeerLabel: profileInboxLabel,
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
    workerPreviewSender: portalChatWorkerPreviewSender,
    isManagementAuthor: isManagementAuthor,
    isOpsAdminAuthor: isOpsAdminAuthor,
    isOpsAdminInboxPeer: isOpsAdminAuthor,
    isDirectorAuthor: isDirectorAuthor,
    parseDmOperatorTag: parseDmOperatorTag,
    parseDmOperatorId: parseDmOperatorId,
    stripDmOperatorTag: stripDmOperatorTag,
    embedDmOperatorTag: embedDmOperatorTag,
    collectDmOperatorIdsFromMessages: collectDmOperatorIdsFromMessages,
  };
})(typeof window !== "undefined" ? window : globalThis);
