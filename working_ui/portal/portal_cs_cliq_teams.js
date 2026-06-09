/**
 * CS Cliq Channels pane — list and create group chats (portal_ceo_group).
 */
(function (global) {
  "use strict";

  var modalBound = false;

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

  function canManage() {
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.canManageChannels === "function") {
      return global.portalCsCliqWorkspace.canManageChannels();
    }
    return false;
  }

  function slugFromTitle(title) {
    var base = String(title || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return base || "group_" + Date.now().toString(36);
  }

  function groupSubtitle(row) {
    var slug = String((row && row.slug) || "").trim();
    if (slug === "session_leads") return "All session leads";
    if (slug === "staff_leads_ops") return "Staff & leads operations";
    if (slug === "swimming_instructors") return "Swimming instructors";
    if (slug === "climbing_instructors") return "Climbing instructors";
    if (slug === "support_staff") return "Support staff";
    if (slug === "pool_leads") return "Leads";
    if (slug === "ceo_liaison") return "CEO & ops liaison";
    if (slug === "all_ceos") return "All CEOs";
    return slug ? "Group · " + slug.replace(/_/g, " ") : "Group chat";
  }

  function bindGroupButtons(host) {
    if (!host) return;
    host.querySelectorAll("[data-cs-cliq-group-id]").forEach(function (btn) {
      if (btn.dataset.teamBound === "1") return;
      btn.dataset.teamBound = "1";
      btn.addEventListener("click", function () {
        var gid = String(btn.getAttribute("data-cs-cliq-group-id") || "").trim();
        if (!gid) return;
        global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
        global.__PORTAL_ADMIN_DM_UI.hubPane = "channels";
        if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
          global.PortalAdminCsCliq.setRailPane("channels");
        }
        if (typeof global.portalAdminDmOpenGroupThread === "function") {
          void global.portalAdminDmOpenGroupThread(gid);
        }
      });
    });
  }

  async function legacyRefresh() {
    var host = document.getElementById("csCliqTeamsList");
    if (!host) return;
    host.innerHTML = '<p class="muted portal-cs-cliq-teams-loading">Loading channels…</p>';
    var c = client();
    if (!c) {
      host.innerHTML = '<p class="muted portal-cs-cliq-teams-empty">Sign in to manage group channels.</p>';
      return;
    }
    var res = await c.from("portal_ceo_group").select("id,title,slug,updated_at").order("title", { ascending: true }).limit(80);
    if (res.error) {
      host.innerHTML =
        '<p class="muted portal-cs-cliq-teams-empty" style="color:var(--danger)">' +
        esc(res.error.message || res.error) +
        "</p>";
      return;
    }
    var rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted portal-cs-cliq-teams-empty">No group channels yet. Use <strong>New group</strong> to create one.</p>';
      return;
    }
    host.innerHTML = rows
      .map(function (row) {
        var title = String(row.title || row.slug || "Group").trim();
        var ini = esc(title.slice(0, 2).toUpperCase());
        return (
          '<button type="button" class="portal-cs-cliq-team-card" data-cs-cliq-group-id="' +
          esc(String(row.id || "")) +
          '">' +
          '<span class="portal-cs-cliq-team-card__avatar" aria-hidden="true">' +
          ini +
          '</span><span class="portal-cs-cliq-team-card__meta"><span class="portal-cs-cliq-team-card__title">' +
          esc(title) +
          '</span><span class="portal-cs-cliq-team-card__sub">' +
          esc(groupSubtitle(row)) +
          "</span></span></button>"
        );
      })
      .join("");
    bindGroupButtons(host);
  }

  async function refresh() {
    if (
      global.portalCsCliqAdminChannels &&
      typeof global.portalCsCliqAdminChannels.shouldUseAdminChannels === "function" &&
      global.portalCsCliqAdminChannels.shouldUseAdminChannels() &&
      typeof global.portalCsCliqAdminChannels.refresh === "function"
    ) {
      return global.portalCsCliqAdminChannels.refresh();
    }
    return legacyRefresh();
  }

  global.portalCsCliqTeamsLegacyRefresh = legacyRefresh;

  function ensureModal() {
    var existing = document.getElementById("portalCsCliqGroupModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "portalCsCliqGroupModal";
    modal.className = "portal-cs-cliq-group-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portalCsCliqGroupModalTitle");
    modal.innerHTML =
      '<div class="portal-cs-cliq-group-modal__card">' +
      '<h3 id="portalCsCliqGroupModalTitle">New group channel</h3>' +
      '<p class="muted portal-cs-cliq-group-modal__hint">Creates a shared group chat. Staff and leads see it when your Supabase policies allow access to that slug.</p>' +
      '<label class="portal-cs-cliq-group-modal__field"><span>Group name</span>' +
      '<input type="text" id="portalCsCliqGroupTitle" maxlength="120" placeholder="e.g. Northolt swimming leads" /></label>' +
      '<label class="portal-cs-cliq-group-modal__field"><span>Slug (optional)</span>' +
      '<input type="text" id="portalCsCliqGroupSlug" maxlength="48" placeholder="northolt_swim_leads" autocapitalize="off" spellcheck="false" /></label>' +
      '<p id="portalCsCliqGroupErr" class="portal-cs-cliq-group-modal__err" hidden></p>' +
      '<div class="portal-cs-cliq-group-modal__actions">' +
      '<button type="button" class="btn btn--ghost" data-cs-cliq-group-action="cancel">Cancel</button>' +
      '<button type="button" class="btn btn--pri" data-cs-cliq-group-action="create">Create group</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    if (!modalBound) {
      modalBound = true;
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal) closeCreateModal();
      });
      modal.querySelectorAll("[data-cs-cliq-group-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var act = btn.getAttribute("data-cs-cliq-group-action");
          if (act === "cancel") closeCreateModal();
          if (act === "create") void submitCreateGroup();
        });
      });
      var titleInput = document.getElementById("portalCsCliqGroupTitle");
      var slugInput = document.getElementById("portalCsCliqGroupSlug");
      if (titleInput && slugInput) {
        titleInput.addEventListener("input", function () {
          if (String(slugInput.dataset.manual || "") === "1") return;
          slugInput.value = slugFromTitle(titleInput.value);
        });
        slugInput.addEventListener("input", function () {
          slugInput.dataset.manual = slugInput.value.trim() ? "1" : "";
        });
      }
    }
    return modal;
  }

  function openCreateModal() {
    if (!canManage()) return;
    var modal = ensureModal();
    var title = document.getElementById("portalCsCliqGroupTitle");
    var slug = document.getElementById("portalCsCliqGroupSlug");
    var err = document.getElementById("portalCsCliqGroupErr");
    if (title) title.value = "";
    if (slug) {
      slug.value = "";
      delete slug.dataset.manual;
    }
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    modal.hidden = false;
    if (title) title.focus();
  }

  function closeCreateModal() {
    var modal = document.getElementById("portalCsCliqGroupModal");
    if (modal) modal.hidden = true;
  }

  async function openCreatedGroupOnPortal(gid) {
    gid = String(gid || "").trim();
    if (!gid) return;
    if (typeof global.portalAdminDmOpenGroupThread === "function") {
      global.__PORTAL_ADMIN_DM_UI = global.__PORTAL_ADMIN_DM_UI || {};
      global.__PORTAL_ADMIN_DM_UI.hubPane = "channels";
      if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.setRailPane === "function") {
        global.PortalAdminCsCliq.setRailPane("channels");
      }
      await global.portalAdminDmOpenGroupThread(gid);
      return;
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
      global.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab = "groups";
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = gid;
      global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = "";
      await global.portalRenderInternalChatSheet();
    }
  }

  async function submitCreateGroup() {
    var c = client();
    var err = document.getElementById("portalCsCliqGroupErr");
    var titleEl = document.getElementById("portalCsCliqGroupTitle");
    var slugEl = document.getElementById("portalCsCliqGroupSlug");
    var title = String((titleEl && titleEl.value) || "").trim();
    var slug = String((slugEl && slugEl.value) || "").trim() || slugFromTitle(title);
    slug = slugFromTitle(slug.replace(/\s+/g, "_"));
    if (!title) {
      if (err) {
        err.textContent = "Enter a group name.";
        err.hidden = false;
      }
      return;
    }
    if (!c) {
      if (err) {
        err.textContent = "Sign in to create groups.";
        err.hidden = false;
      }
      return;
    }
    try {
      var res = await c.from("portal_ceo_group").insert([{ slug: slug, title: title }]).select("id").maybeSingle();
      if (res.error) throw new Error(res.error.message || String(res.error));
      closeCreateModal();
      if (typeof global.portalAdminDmRenderList === "function") {
        await global.portalAdminDmRenderList();
      } else if (
        global.portalLeadStaffChatDirectory &&
        typeof global.portalLeadStaffChatDirectory.renderSimplifiedInboxList === "function"
      ) {
        await global.portalLeadStaffChatDirectory.renderSimplifiedInboxList();
      } else {
        await refresh();
      }
      var gid = res.data && res.data.id ? String(res.data.id) : "";
      if (gid) await openCreatedGroupOnPortal(gid);
    } catch (e) {
      if (err) {
        err.textContent = String((e && e.message) || e || "Could not create group.");
        err.hidden = false;
      }
    }
  }

  global.portalCsCliqTeams = {
    refresh: refresh,
    openCreateModal: openCreateModal,
    closeCreateModal: closeCreateModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
