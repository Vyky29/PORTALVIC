/**
 * Ops admin chat helpers — CEOs can write on Sevitha's worker threads as Admin (ops lane / ?portalGodAdmin=1).
 * Victor, Raúl and Javi use admin_dashboard.html for day-to-day ops; CEO portal is mainly insights.
 */
(function (global) {
  "use strict";

  function queryFlag() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      return q.get("portalGodAdmin") === "1" || q.get("portalGodAdmin") === "true";
    } catch (_q) {
      return false;
    }
  }

  function profile() {
    var box = global.__PORTAL_SUPABASE__ || {};
    return box.staff_profile || null;
  }

  function isCeoTrio(prof) {
    prof = prof || profile();
    return !!(
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function" &&
      global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(prof)
    );
  }

  function isOpsAdminUser(prof) {
    prof = prof || profile();
    if (
      global.portalOpsAdminDisplay &&
      typeof global.portalOpsAdminDisplay.isOpsAdminProfile === "function"
    ) {
      return global.portalOpsAdminDisplay.isOpsAdminProfile(prof);
    }
    return false;
  }

  function isActive() {
    return !!(global.__PORTAL_CEO_GOD_MODE_ADMIN__ || queryFlag());
  }

  function activate() {
    global.__PORTAL_CEO_GOD_MODE_ADMIN__ = true;
    global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
    global.__PORTAL_ADMIN_DM_UI.inboxLane = "ops";
    global.__PORTAL_ADMIN_DM_UI.godModeAdmin = true;
  }

  function shouldRedirectCeoFromFullAdmin() {
    return false;
  }

  function godModeAdminUrl() {
    try {
      var base = new URL("admin_dashboard.html", global.location.href);
      base.searchParams.set("portalGodAdmin", "1");
      base.hash = "view=cs_cliq";
      return base.href;
    } catch (_u) {
      return "admin_dashboard.html?portalGodAdmin=1#view=cs_cliq";
    }
  }

  async function resolveOpsAuthorId(client) {
    if (
      global.portalCsCliqManagementInbox &&
      typeof global.portalCsCliqManagementInbox.resolveSevithaStaffId === "function"
    ) {
      return String((await global.portalCsCliqManagementInbox.resolveSevithaStaffId(client)) || "").trim();
    }
    if (!client) return "";
    try {
      var rpc = await client.rpc("portal_staff_dm_resolve_ops_admin_id");
      if (!rpc.error && rpc.data) return String(rpc.data);
    } catch (_rpc) {}
    return "";
  }

  function shouldSendAsOpsAdmin(ui) {
    ui = ui || global.__PORTAL_ADMIN_DM_UI || {};
    if (isOpsAdminUser()) return false;
    if (!isCeoTrio() && !isActive()) return false;
    if (String(ui.inboxLane || "") === "ops") return true;
    if (isActive() && String(ui.channel || "") !== "ceo_exec") return true;
    return !!ui.godModeAdmin;
  }

  async function insertDmMessage(client, threadId, body, messageType) {
    threadId = String(threadId || "").trim();
    body = String(body || "").trim();
    messageType = String(messageType || "text").trim() || "text";
    if (!client || !threadId || !body) throw new Error("Not available.");

    if (shouldSendAsOpsAdmin()) {
      try {
        var opsIns = await client.rpc("portal_staff_dm_insert_ops_admin_message", {
          p_thread_id: threadId,
          p_body: body,
          p_message_type: messageType,
        });
        if (!opsIns.error && opsIns.data) return opsIns.data;
        if (opsIns.error) throw opsIns.error;
      } catch (_ops) {}
    }

    var ins = await client.rpc("portal_staff_dm_insert_message", {
      p_thread_id: threadId,
      p_body: body,
      p_message_type: messageType,
    });
    if (ins.error) {
      ins = await client
        .from("portal_staff_dm_messages")
        .insert([
          {
            thread_id: threadId,
            author_id:
              (global.__PORTAL_SUPABASE__ &&
                global.__PORTAL_SUPABASE__.session &&
                global.__PORTAL_SUPABASE__.session.user &&
                global.__PORTAL_SUPABASE__.session.user.id) ||
              null,
            body: body,
            message_type: messageType,
          },
        ])
        .select("id");
    }
    if (ins.error) throw ins.error;
    return ins.data;
  }

  function mountBanner() {
    if (!isActive() || isOpsAdminUser()) return;
    if (global.document.getElementById("portalCeoGodModeBanner")) return;
    var bar = global.document.createElement("div");
    bar.id = "portalCeoGodModeBanner";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:sticky;top:0;z-index:1200;padding:10px 14px;background:#0f172a;color:#e2e8f0;font-size:13px;font-weight:600;text-align:center;border-bottom:1px solid rgba(56,189,248,.35);min-width:0;overflow-wrap:break-word";
    var label =
      global.portalOpsAdminDisplay && global.portalOpsAdminDisplay.label
        ? global.portalOpsAdminDisplay.label
        : "Sevitha (Admin)";
    bar.textContent =
      "Ops admin chat — writing as " +
      label +
      " (staff see Admin). Use CEO portal chat for director-only threads.";
    var shell = global.document.querySelector(".admin-shell") || global.document.body;
    if (shell.firstChild) shell.insertBefore(bar, shell.firstChild);
    else shell.appendChild(bar);
  }

  function applyAfterBootstrap() {
    if (queryFlag()) activate();
    if (isActive()) {
      mountBanner();
      try {
        if (typeof global.setView === "function") global.setView("cs_cliq");
      } catch (_v) {}
    }
    return false;
  }

  global.portalCeoGodModeAdmin = {
    isActive: isActive,
    activate: activate,
    isCeoTrio: isCeoTrio,
    isOpsAdminUser: isOpsAdminUser,
    shouldRedirectCeoFromFullAdmin: shouldRedirectCeoFromFullAdmin,
    godModeAdminUrl: godModeAdminUrl,
    resolveOpsAuthorId: resolveOpsAuthorId,
    shouldSendAsOpsAdmin: shouldSendAsOpsAdmin,
    insertDmMessage: insertDmMessage,
    mountBanner: mountBanner,
    applyAfterBootstrap: applyAfterBootstrap,
  };
})(typeof window !== "undefined" ? window : globalThis);
