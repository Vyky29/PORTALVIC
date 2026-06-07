/**
 * CS Cliq Teams pane — group chats for Lead and Management.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function client() {
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client ? box.client : null;
  }

  var STATIC_TEAMS = [
    { slug: "staff-groups", title: "Staff groups", sub: "Department and session staff threads" },
    { slug: "lead-groups", title: "Lead groups", sub: "Session and area lead coordination" },
    { slug: "operations", title: "Operations group", sub: "Management operations channel" },
    { slug: "session-leads", title: "Session leads group", sub: "All session leads channel" },
  ];

  async function refresh() {
    var host = document.getElementById("csCliqTeamsList");
    if (!host) return;
    host.innerHTML = '<p class="muted portal-cs-cliq-teams-loading">Loading teams…</p>';
    var c = client();
    var items = STATIC_TEAMS.slice();
    if (c) {
      var res = await c.from("portal_ceo_group").select("id,title,slug,updated_at").order("title", { ascending: true }).limit(20);
      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach(function (g) {
          if (!g || !g.id) return;
          items.push({
            id: String(g.id),
            title: String(g.title || g.slug || "Group"),
            sub: "Group chat · " + String(g.slug || "team"),
            groupId: String(g.id),
          });
        });
      }
    }
    host.innerHTML = items
      .map(function (item, idx) {
        return (
          '<button type="button" class="portal-cs-cliq-team-card" data-cs-cliq-team-index="' +
          idx +
          '" data-cs-cliq-group-id="' +
          esc(item.groupId || "") +
          '">' +
          '<span class="portal-cs-cliq-team-card__avatar" aria-hidden="true">' +
          esc((item.title || "T").slice(0, 2).toUpperCase()) +
          '</span><span class="portal-cs-cliq-team-card__meta"><span class="portal-cs-cliq-team-card__title">' +
          esc(item.title) +
          '</span><span class="portal-cs-cliq-team-card__sub">' +
          esc(item.sub) +
          "</span></span></button>"
        );
      })
      .join("");
    host.querySelectorAll("[data-cs-cliq-group-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var gid = String(btn.getAttribute("data-cs-cliq-group-id") || "").trim();
        if (!gid) return;
        if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("chats");
        }
        if (typeof global.portalAdminDmOpenGroupThread === "function") {
          void global.portalAdminDmOpenGroupThread(gid);
        }
      });
    });
  }

  global.portalCsCliqTeams = { refresh: refresh };
})(typeof window !== "undefined" ? window : globalThis);
