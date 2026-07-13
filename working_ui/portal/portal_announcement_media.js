/**
 * Staff announcement photo attachments (multi-image).
 * Bucket: portal-announcement-media · table: portal_staff_announcement_media
 */
(function (global) {
  "use strict";

  var BUCKET = "portal-announcement-media";
  var MAX_FILES = 8;
  var MAX_BYTES = 10 * 1024 * 1024;

  function clientOf(box) {
    return (box && box.client) || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) || null;
  }

  function extForMime(mime, name) {
    var m = String(mime || "").toLowerCase();
    if (m.indexOf("png") !== -1) return "png";
    if (m.indexOf("webp") !== -1) return "webp";
    if (m.indexOf("gif") !== -1) return "gif";
    if (m.indexOf("heic") !== -1) return "heic";
    if (m.indexOf("heif") !== -1) return "heif";
    var fromName = String(name || "").split(".").pop();
    if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
    return "jpg";
  }

  function isImageFile(file) {
    if (!file) return false;
    var t = String(file.type || "").toLowerCase();
    if (t.indexOf("image/") === 0) return true;
    var n = String(file.name || "").toLowerCase();
    return /\.(jpe?g|png|webp|gif|heic|heif)$/.test(n);
  }

  /** Collect File objects from an <input type=file multiple>. */
  global.portalAnnouncementCollectPhotoFiles = function portalAnnouncementCollectPhotoFiles(inputEl) {
    var out = [];
    var list = inputEl && inputEl.files ? inputEl.files : null;
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length && out.length < MAX_FILES; i++) {
      var f = list[i];
      if (!isImageFile(f)) continue;
      if (f.size > MAX_BYTES) continue;
      out.push(f);
    }
    return out;
  };

  /**
   * Upload photos for one or more announcement ids (same files attached to each).
   * @returns {Promise<{ok:boolean, uploaded:number, message?:string}>}
   */
  global.portalAnnouncementUploadPhotosForIds = async function portalAnnouncementUploadPhotosForIds(
    client,
    announcementIds,
    files,
    createdBy
  ) {
    var ids = (announcementIds || []).map(function (x) {
      return String(x || "").trim();
    }).filter(Boolean);
    var photos = Array.isArray(files) ? files.filter(isImageFile) : [];
    if (!client || !ids.length || !photos.length) {
      return { ok: true, uploaded: 0 };
    }
    var uploaded = 0;
    for (var a = 0; a < ids.length; a++) {
      var annId = ids[a];
      for (var p = 0; p < photos.length; p++) {
        var file = photos[p];
        var ext = extForMime(file.type, file.name);
        var path =
          annId +
          "/" +
          (global.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + "-" + p) +
          "." +
          ext;
        var up = await client.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (up.error) {
          return {
            ok: false,
            uploaded: uploaded,
            message: String(up.error.message || up.error),
          };
        }
        var row = {
          announcement_id: annId,
          storage_path: path,
          mime_type: file.type || null,
          byte_size: typeof file.size === "number" ? file.size : null,
          sort_order: p,
        };
        if (createdBy) row.created_by = createdBy;
        var ins = await client.from("portal_staff_announcement_media").insert(row);
        if (ins.error) {
          return {
            ok: false,
            uploaded: uploaded,
            message: String(ins.error.message || ins.error),
          };
        }
        uploaded++;
      }
    }
    return { ok: true, uploaded: uploaded };
  };

  /**
   * Load media rows + signed URLs for a list of announcement ids.
   * @returns {Promise<Record<string, Array<{id,url,path}>>>}
   */
  global.portalAnnouncementLoadMediaByIds = async function portalAnnouncementLoadMediaByIds(
    client,
    announcementIds
  ) {
    var map = {};
    var ids = (announcementIds || []).map(function (x) {
      return String(x || "").trim();
    }).filter(Boolean);
    if (!client || !ids.length) return map;
    var res = await client
      .from("portal_staff_announcement_media")
      .select("id,announcement_id,storage_path,sort_order")
      .in("announcement_id", ids)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (res.error) {
      try {
        console.warn("[announcement-media] select failed", res.error.message || res.error);
      } catch (_) {}
      return map;
    }
    if (!Array.isArray(res.data) || !res.data.length) return map;
    var paths = [];
    var rows = res.data;
    for (var i = 0; i < rows.length; i++) {
      var sp = String(rows[i].storage_path || "").trim();
      if (sp) paths.push(sp);
    }
    var urlByPath = {};
    if (paths.length) {
      var signed = await client.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 12);
      if (signed.error) {
        try {
          console.warn("[announcement-media] signed urls failed", signed.error.message || signed.error);
        } catch (_) {}
      } else if (Array.isArray(signed.data)) {
        signed.data.forEach(function (s, idx) {
          if (!s) return;
          var url = String(s.signedUrl || s.signedURL || "").trim();
          if (!url) return;
          var p = String(s.path || paths[idx] || "").trim();
          if (p) urlByPath[p] = url;
          // Supabase sometimes returns path with/without bucket prefix.
          var slash = p.lastIndexOf("/");
          if (slash > 0) urlByPath[p.slice(slash + 1)] = url;
        });
      }
      // Per-file fallback when batch path keys do not match storage_path.
      for (var j = 0; j < paths.length; j++) {
        if (urlByPath[paths[j]]) continue;
        try {
          var one = await client.storage.from(BUCKET).createSignedUrl(paths[j], 60 * 60 * 12);
          var oneUrl = one && one.data && (one.data.signedUrl || one.data.signedURL);
          if (oneUrl) urlByPath[paths[j]] = String(oneUrl);
        } catch (_) {}
      }
    }
    rows.forEach(function (r) {
      var aid = String(r.announcement_id || "");
      var path = String(r.storage_path || "").trim();
      var url = urlByPath[path] || "";
      if (!url && path) {
        var base = path.slice(path.lastIndexOf("/") + 1);
        url = urlByPath[base] || "";
      }
      if (!aid || !url) return;
      if (!map[aid]) map[aid] = [];
      map[aid].push({ id: r.id, url: url, path: path });
    });
    return map;
  };

  /** HTML gallery for announcement body (escaped URLs). */
  global.portalAnnouncementPhotosHtml = function portalAnnouncementPhotosHtml(photos) {
    if (!Array.isArray(photos) || !photos.length) return "";
    var cells = photos
      .map(function (p) {
        var url = String((p && p.url) || "").trim();
        if (!url) return "";
        var safe = url
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");
        return (
          '<a class="announcement-photo-link" href="' +
          safe +
          '" target="_blank" rel="noopener">' +
          '<img class="announcement-photo" src="' +
          safe +
          '" alt="Announcement photo" loading="lazy" decoding="async" />' +
          "</a>"
        );
      })
      .filter(Boolean);
    if (!cells.length) return "";
    return '<div class="announcement-photo-grid" role="list">' + cells.join("") + "</div>";
  };

  global.PORTAL_ANNOUNCEMENT_MEDIA_BUCKET = BUCKET;
  global.PORTAL_ANNOUNCEMENT_MEDIA_MAX_FILES = MAX_FILES;
})(typeof window !== "undefined" ? window : globalThis);
