/**
 * Shared files panel for the open DM or group thread (CS Cliq + internal chat).
 */
(function (global) {
  "use strict";

  var bound = false;

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

  function meId() {
    var box = global.__PORTAL_SUPABASE__ || {};
    return String((box.staff_profile && box.staff_profile.id) || (box.session && box.session.user && box.session.user.id) || "").trim();
  }

  function threadContext() {
    var adminUi = global.__PORTAL_ADMIN_DM_UI || {};
    var internalUi = global.__PORTAL_INTERNAL_CHAT_UI || {};
    return {
      threadId: String(adminUi.threadId || internalUi.threadId || "").trim(),
      groupId: String(adminUi.groupId || "").trim(),
      label: String(adminUi.peerLabel || internalUi.peerLabel || "").trim() || "Conversation",
    };
  }

  function isAttachMsg(m) {
    var t = String((m && m.message_type) || "text").toLowerCase();
    return t === "image" || t === "file";
  }

  function fileName(m) {
    var cap = String((m && m.body) || "").trim();
    if (cap) return cap;
    var path = String((m && m.audio_storage_path) || "");
    var bits = path.split("/");
    return bits[bits.length - 1] || "Attachment";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (_e) {
      return String(iso).slice(0, 16).replace("T", " ");
    }
  }

  async function signedUrl(c, path) {
    if (!c || !path) return "";
    var res = await c.storage.from("portal-dm-media").createSignedUrl(path, 3600);
    if (res.error || !res.data || !res.data.signedUrl) return "";
    return res.data.signedUrl;
  }

  async function fetchFiles(ctx) {
    var c = client();
    if (!c) return [];
    if (ctx.groupId) {
      var gres = await c
        .from("portal_ceo_group_message")
        .select("id,message_type,body,audio_storage_path,created_at,author_id")
        .eq("group_id", ctx.groupId)
        .in("message_type", ["image", "file"])
        .order("created_at", { ascending: false })
        .limit(40);
      return gres.error || !Array.isArray(gres.data) ? [] : gres.data;
    }
    if (!ctx.threadId) return [];
    var res = await c
      .from("portal_staff_dm_messages")
      .select("id,message_type,body,audio_storage_path,created_at,author_id")
      .eq("thread_id", ctx.threadId)
      .in("message_type", ["image", "file"])
      .order("created_at", { ascending: false })
      .limit(40);
    return res.error || !Array.isArray(res.data) ? [] : res.data;
  }

  async function renderPanel(panel, ctx) {
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = '<p class="portal-cs-cliq-thread-files-panel__loading muted">Loading files…</p>';
    var rows = await fetchFiles(ctx);
    if (!rows.length) {
      panel.innerHTML = '<p class="portal-cs-cliq-thread-files-panel__empty">No files shared in this conversation yet.</p>';
      return;
    }
    var c = client();
    var html = '<div class="portal-cs-cliq-thread-files-panel__head"><strong>Shared files</strong><span>' + esc(ctx.label) + "</span></div>";
    html += '<div class="portal-cs-cliq-thread-files-list">';
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      var isImg = String(m.message_type || "").toLowerCase() === "image";
      var path = String(m.audio_storage_path || "");
      var url = path ? await signedUrl(c, path) : "";
      var name = fileName(m);
      html +=
        '<button type="button" class="portal-cs-cliq-thread-files-item" data-file-url="' +
        esc(url) +
        '"' +
        (url ? "" : " disabled") +
        ">" +
        '<span class="portal-cs-cliq-thread-files-item__type">' +
        esc(isImg ? "Photo" : "File") +
        "</span>" +
        '<span class="portal-cs-cliq-thread-files-item__meta"><span class="portal-cs-cliq-thread-files-item__name">' +
        esc(name) +
        '</span><span class="portal-cs-cliq-thread-files-item__when">' +
        esc(formatWhen(m.created_at)) +
        "</span></span></button>";
    }
    html += "</div>";
    panel.innerHTML = html;
    panel.querySelectorAll("[data-file-url]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var u = String(btn.getAttribute("data-file-url") || "").trim();
        if (!u) return;
        try {
          global.open(u, "_blank", "noopener");
        } catch (_o) {}
      });
    });
  }

  function togglePanel(panelId, btnId) {
    var panel = document.getElementById(panelId);
    var btn = document.getElementById(btnId);
    if (!panel) return;
    var open = panel.hidden;
    if (!open) {
      panel.hidden = true;
      if (btn) btn.classList.remove("is-active");
      return;
    }
    void renderPanel(panel, threadContext());
    if (btn) btn.classList.add("is-active");
  }

  function ensureInternalChrome() {
    var wrap = document.getElementById("internalChatThreadWrap");
    if (!wrap || document.getElementById("internalChatThreadFilesBtn") || document.getElementById("internalChatThreadFilesBar")) return;
    var bar = document.createElement("div");
    bar.id = "internalChatThreadFilesBar";
    bar.className = "portal-cs-cliq-thread-files-bar";
    bar.innerHTML =
      '<button type="button" class="portal-cs-cliq-thread-header__files" id="internalChatThreadFilesBtn">Files</button>' +
      '<div id="internalChatThreadFilesPanel" class="portal-cs-cliq-thread-files-panel" hidden></div>';
    var messages = document.getElementById("internalChatMessages");
    if (messages) wrap.insertBefore(bar, messages);
  }

  function onThreadChange() {
    ["csCliqThreadFilesPanel", "internalChatThreadFilesPanel"].forEach(function (id) {
      var panel = document.getElementById(id);
      if (panel) {
        panel.hidden = true;
        panel.innerHTML = "";
      }
    });
    ["csCliqThreadFilesBtn", "internalChatThreadFilesBtn"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.classList.remove("is-active");
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    ensureInternalChrome();
    var csBtn = document.getElementById("csCliqThreadFilesBtn");
    if (csBtn) {
      csBtn.addEventListener("click", function () {
        togglePanel("csCliqThreadFilesPanel", "csCliqThreadFilesBtn");
      });
    }
    var intBtn = document.getElementById("internalChatThreadFilesBtn");
    if (intBtn) {
      intBtn.addEventListener("click", function () {
        togglePanel("internalChatThreadFilesPanel", "internalChatThreadFilesBtn");
      });
    }
    if (global.portalRenderInternalChatSheet && !global.portalRenderInternalChatSheet.__threadFilesBound) {
      var orig = global.portalRenderInternalChatSheet;
      global.portalRenderInternalChatSheet = async function () {
        await orig.apply(this, arguments);
        ensureInternalChrome();
        onThreadChange();
      };
      global.portalRenderInternalChatSheet.__threadFilesBound = true;
    }
  }

  global.portalCsCliqThreadFiles = {
    bind: bind,
    onThreadChange: onThreadChange,
    refreshOpenPanel: function () {
      var ctx = threadContext();
      var csPanel = document.getElementById("csCliqThreadFilesPanel");
      if (csPanel && !csPanel.hidden) void renderPanel(csPanel, ctx);
      var intPanel = document.getElementById("internalChatThreadFilesPanel");
      if (intPanel && !intPanel.hidden) void renderPanel(intPanel, ctx);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
