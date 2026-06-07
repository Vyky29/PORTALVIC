/**
 * CS Cliq Files hub ù recent chat attachments and portal documents.
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
    host.innerHTML = '<p class="portal-cs-cliq-files-loading muted">Loading recent attachmentsù</p>';
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
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">No chat attachments yet. Photos and documents shared in threads appear here.</p>';
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
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">No chat attachments yet. Share a photo or document in any thread to populate this gallery.</p>';
      return;
    }
    host.innerHTML = "";
    for (var i = 0; i < msgs.data.length; i++) {
      var m = msgs.data[i];
      if (!isAttachMsg(m)) continue;
      var card = document.createElement("a");
      card.className = "portal-cs-cliq-files-card";
      card.href = "#";
      card.setAttribute("data-cs-cliq-file-id", String(m.id || ""));
      var isImg = String(m.message_type || "").toLowerCase() === "image";
      var path = String(m.audio_storage_path || "");
      var url = path ? await signedUrl(c, path) : "";
      var thumb = document.createElement("div");
      thumb.className = "portal-cs-cliq-files-card__thumb" + (isImg ? " portal-cs-cliq-files-card__thumb--image" : "");
      if (isImg && url) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        thumb.appendChild(img);
      } else {
        thumb.innerHTML = '<span class="portal-cs-cliq-files-card__ext">' + esc(fileName(m).split(".").pop() || "DOC") + "</span>";
      }
      var meta = document.createElement("div");
      meta.className = "portal-cs-cliq-files-card__meta";
      meta.innerHTML =
        '<span class="portal-cs-cliq-files-card__name">' +
        esc(fileName(m)) +
        '</span><span class="portal-cs-cliq-files-card__when">' +
        esc(String(m.created_at || "").slice(0, 16).replace("T", " ")) +
        "</span>";
      card.appendChild(thumb);
      card.appendChild(meta);
      card.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (url) {
          try {
            global.open(url, "_blank", "noopener");
          } catch (_o) {}
        }
      });
      host.appendChild(card);
    }
    if (!host.children.length) {
      host.innerHTML = '<p class="portal-cs-cliq-files-empty muted">No chat attachments yet.</p>';
    }
  }

  global.portalCsCliqFilesHub = { refresh: refresh };
})(typeof window !== "undefined" ? window : globalThis);
