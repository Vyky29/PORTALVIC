/**
 * CS Cliq Files hub — recent chat attachments and portal documents.
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

  function meId() {
    var box = global.__PORTAL_SUPABASE__ || {};
    return String((box.staff_profile && box.staff_profile.id) || (box.session && box.session.user && box.session.user.id) || "").trim();
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

  async function signedUrl(c, path) {
    if (!c || !path) return "";
    var res = await c.storage.from("portal-dm-media").createSignedUrl(path, 3600);
    if (res.error || !res.data || !res.data.signedUrl) return "";
    return res.data.signedUrl;
  }

  async function refresh() {
    var host = document.getElementById("csCliqFilesGallery");
    if (!host) return;
    var c = client();
    var me = meId();
    host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Loading recent attachments……</p>';
    if (!c || !me) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Sign in to see chat files.</p>';
      return;
    }
    var prof = (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
    var sharedInbox =
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmUsesAdminCliq === "function" &&
      global.portalDmRoles.portalDmUsesAdminCliq(prof);
    var threads = sharedInbox
      ? await c
          .from("portal_staff_dm_threads")
          .select("id")
          .order("updated_at", { ascending: false })
          .limit(60)
      : await c
          .from("portal_staff_dm_threads")
          .select("id")
          .or("participant_a.eq." + me + ",participant_b.eq." + me)
          .order("updated_at", { ascending: false })
          .limit(40);
    if (threads.error || !Array.isArray(threads.data) || !threads.data.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Shared files will appear here when photos or documents are sent in chat.</p>';
      return;
    }
    var ids = threads.data.map(function (r) {
      return String(r.id);
    });
    var msgs = await c
      .from("portal_staff_dm_messages")
      .select("id,thread_id,message_type,body,audio_storage_path,created_at,author_id")
      .in("thread_id", ids)
      .in("message_type", ["image", "file"])
      .order("created_at", { ascending: false })
      .limit(24);
    if (msgs.error || !Array.isArray(msgs.data) || !msgs.data.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Shared files will appear here when photos or documents are sent in chat.</p>';
      return;
    }
    host.innerHTML = "";
    host.dataset.allFiles = JSON.stringify(msgs.data);
    for (var i = 0; i < msgs.data.length; i++) {
      var row = await buildRow(msgs.data[i], c);
      if (row) host.appendChild(row);
    }
    if (!host.children.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Shared files will appear here when photos or documents are sent in chat.</p>';
    }
    bindSearch(host);
  }

  async function buildRow(m, c) {
    if (!isAttachMsg(m)) return null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "portal-cs-cliq-file-row";
    btn.setAttribute("data-cs-cliq-file-name", fileName(m).toLowerCase());
    var isImg = String(m.message_type || "").toLowerCase() === "image";
    var path = String(m.audio_storage_path || "");
    var url = path ? await signedUrl(c, path) : "";
    var icon = document.createElement("span");
    icon.className = "portal-cs-cliq-file-row__icon";
    if (isImg && url) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.textContent = (fileName(m).split(".").pop() || "DOC").slice(0, 4).toUpperCase();
    }
    var meta = document.createElement("span");
    meta.className = "portal-cs-cliq-file-row__meta";
    meta.innerHTML =
      '<span class="portal-cs-cliq-file-row__name">' +
      esc(fileName(m)) +
      '</span><span class="portal-cs-cliq-file-row__sub">' +
      esc((isImg ? "Photo" : "Document") + " · " + String(m.created_at || "").slice(0, 16).replace("T", " ")) +
      "</span>";
    var open = document.createElement("span");
    open.className = "portal-cs-cliq-file-row__open";
    open.textContent = "Open";
    btn.appendChild(icon);
    btn.appendChild(meta);
    btn.appendChild(open);
    btn.addEventListener("click", function () {
      if (url) {
        try {
          global.open(url, "_blank", "noopener");
        } catch (_o) {}
      }
    });
    return btn;
  }

  function bindSearch(host) {
    var input = document.getElementById("csCliqFilesSearch");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("input", function () {
      var q = String(input.value || "").trim().toLowerCase();
      host.querySelectorAll(".portal-cs-cliq-file-row").forEach(function (row) {
        var name = String(row.getAttribute("data-cs-cliq-file-name") || "");
        row.hidden = !!(q && name.indexOf(q) < 0);
      });
    });
  }

  global.portalCsCliqFilesHub = { refresh: refresh };
})(typeof window !== "undefined" ? window : globalThis);
