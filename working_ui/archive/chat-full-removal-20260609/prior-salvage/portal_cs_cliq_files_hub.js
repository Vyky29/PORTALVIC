/**
 * CS Cliq Files hub — per-user recent files and management-wide shared files.
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

  function isManagement() {
    return global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.canManageAnnouncements === "function" && global.portalCsCliqHubRoles.canManageAnnouncements();
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

  async function buildRow(m, c, subLabel) {
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
    var sub = subLabel || (isImg ? "Photo" : "Document") + " · " + formatWhen(m.created_at);
    meta.innerHTML =
      '<span class="portal-cs-cliq-file-row__name">' +
      esc(fileName(m)) +
      '</span><span class="portal-cs-cliq-file-row__sub">' +
      esc(sub) +
      "</span>";
    var open = document.createElement("span");
    open.className = "portal-cs-cliq-file-row__open";
    open.textContent = "Open";
    btn.appendChild(icon);
    btn.appendChild(meta);
    btn.appendChild(open);
    if (!url) btn.disabled = true;
    btn.addEventListener("click", function () {
      if (!url) return;
      try {
        global.open(url, "_blank", "noopener");
      } catch (_o) {}
    });
    return btn;
  }

  function bindSearch(host, inputId) {
    var input = document.getElementById(inputId || "csCliqFilesSearch");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("input", function () {
      var q = String(input.value || "").trim().toLowerCase();
      host.querySelectorAll(".portal-cs-cliq-file-row").forEach(function (row) {
        var name = String(row.getAttribute("data-cs-cliq-file-name") || "");
        var sub = String(row.textContent || "").toLowerCase();
        row.hidden = !!(q && name.indexOf(q) < 0 && sub.indexOf(q) < 0);
      });
    });
  }

  async function refreshRecent(host, c, me) {
    if (!host) return;
    host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Loading recent attachments…</p>';
    var prof = (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
    var sharedInbox =
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmUsesAdminCliq === "function" &&
      global.portalDmRoles.portalDmUsesAdminCliq(prof);
    var threads = sharedInbox
      ? await c.from("portal_staff_dm_threads").select("id").order("updated_at", { ascending: false }).limit(60)
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
    for (var i = 0; i < msgs.data.length; i++) {
      var row = await buildRow(msgs.data[i], c);
      if (row) host.appendChild(row);
    }
    if (!host.children.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Shared files will appear here when photos or documents are sent in chat.</p>';
    }
  }

  async function refreshAll(host, c) {
    if (!host) return;
    host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Loading all shared files…</p>';
    var dmMsgs = await c
      .from("portal_staff_dm_messages")
      .select("id,thread_id,message_type,body,audio_storage_path,created_at,author_id")
      .in("message_type", ["image", "file"])
      .order("created_at", { ascending: false })
      .limit(80);
    var groupMsgs = await c
      .from("portal_ceo_group_message")
      .select("id,group_id,message_type,body,audio_storage_path,created_at,author_id")
      .in("message_type", ["image", "file"])
      .order("created_at", { ascending: false })
      .limit(40);
    var items = [];
    if (!dmMsgs.error && Array.isArray(dmMsgs.data)) {
      dmMsgs.data.forEach(function (m) {
        items.push({ kind: "dm", row: m });
      });
    }
    if (!groupMsgs.error && Array.isArray(groupMsgs.data)) {
      groupMsgs.data.forEach(function (m) {
        items.push({ kind: "group", row: m });
      });
    }
    items.sort(function (a, b) {
      return String(b.row.created_at || "").localeCompare(String(a.row.created_at || ""));
    });
    if (!items.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">No shared files yet.</p>';
      return;
    }
    var threadIds = items
      .filter(function (it) {
        return it.kind === "dm";
      })
      .map(function (it) {
        return String(it.row.thread_id || "");
      })
      .filter(Boolean);
    var groupIds = items
      .filter(function (it) {
        return it.kind === "group";
      })
      .map(function (it) {
        return String(it.row.group_id || "");
      })
      .filter(Boolean);
    var threadLabels = {};
    var groupLabels = {};
    if (threadIds.length) {
      var tres = await c.from("portal_staff_dm_threads").select("id,participant_a,participant_b").in("id", threadIds.slice(0, 80));
      if (!tres.error && Array.isArray(tres.data)) {
        var peerIds = [];
        tres.data.forEach(function (t) {
          if (t.participant_a) peerIds.push(String(t.participant_a));
          if (t.participant_b) peerIds.push(String(t.participant_b));
        });
        peerIds = peerIds.filter(function (id, idx, arr) {
          return id && arr.indexOf(id) === idx;
        });
        var names = {};
        if (peerIds.length) {
          var pr = await c.from("staff_profiles").select("id,full_name,username").in("id", peerIds);
          if (!pr.error && Array.isArray(pr.data)) {
            pr.data.forEach(function (p) {
              names[String(p.id)] = String(p.full_name || p.username || "").trim() || "Chat";
            });
          }
        }
        var me = meId();
        tres.data.forEach(function (t) {
          var a = String(t.participant_a || "");
          var b = String(t.participant_b || "");
          var peer = a === me ? b : b === me ? a : a;
          threadLabels[String(t.id)] = names[peer] || "Direct message";
        });
      }
    }
    if (groupIds.length) {
      var gres = await c.from("portal_ceo_group").select("id,title,slug").in("id", groupIds.slice(0, 40));
      if (!gres.error && Array.isArray(gres.data)) {
        gres.data.forEach(function (g) {
          var slug = String(g.slug || "");
          var title = String(g.title || "Group");
          if (global.portalCsCliqAnnouncementInbox && typeof global.portalCsCliqAnnouncementInbox.simplifyGroupLabel === "function") {
            title = global.portalCsCliqAnnouncementInbox.simplifyGroupLabel(slug, title);
          }
          groupLabels[String(g.id)] = title;
        });
      }
    }
    host.innerHTML = "";
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var m = it.row;
      var conv =
        it.kind === "group"
          ? groupLabels[String(m.group_id || "")] || "Group"
          : threadLabels[String(m.thread_id || "")] || "Direct message";
      var sub = conv + " · " + formatWhen(m.created_at);
      var row = await buildRow(m, c, sub);
      if (row) host.appendChild(row);
    }
    if (!host.children.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">No shared files yet.</p>';
    }
  }

  async function refresh() {
    var recentHost = document.getElementById("csCliqFilesGallery");
    var allHost = document.getElementById("csCliqFilesAllGallery");
    var allSection = document.getElementById("csCliqFilesAllSection");
    var c = client();
    var me = meId();
    var mgmt = isManagement();
    if (allSection) allSection.hidden = !mgmt;
    if (!c || !me) {
      if (recentHost) recentHost.innerHTML = '<p class="portal-cs-cliq-files-empty muted">Sign in to see chat files.</p>';
      if (allHost) allHost.innerHTML = "";
      return;
    }
    await refreshRecent(recentHost, c, me);
    if (mgmt && allHost) await refreshAll(allHost, c);
    var searchHost = document.getElementById("csCliqFilesPane");
    if (searchHost) bindSearch(searchHost);
  }

  global.portalCsCliqFilesHub = { refresh: refresh };
})(typeof window !== "undefined" ? window : globalThis);
