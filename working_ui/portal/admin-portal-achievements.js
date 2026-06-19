/**
 * Admin — participant achievement photos (all staff, grouped by participant).
 */
(function (global) {
  "use strict";

  var ICON_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  var ICON_TRASH =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var ICON_ROTATE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';

  var ACH_BUCKET = "participant-achievements";
  var SELECT_ONE_LABEL = "Select one";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var viewerState = { photos: [], index: -1, busy: false };
  var directoryState = { groups: [], byKey: Object.create(null), activeKey: "" };
  var inboxSelection = Object.create(null);

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function participantAvatarHtml(name, clientId) {
    if (typeof global.portalParticipantAvatarInnerHtml === "function") {
      return global.portalParticipantAvatarInnerHtml(name, clientId, { esc: esc });
    }
    var label = esc(String(name || "").trim() || "?");
    return '<span class="portal-roster-avatar" aria-hidden="true">' + label.slice(0, 2) + "</span>";
  }

  function normalizeClientId(id) {
    return String(id || "")
      .trim()
      .toLowerCase();
  }

  function statusLabel(status) {
    if (status === "attached") return "In feedback";
    if (status === "draft") return "Draft";
    if (status === "archived_unused") return "Not used";
    return "Not used";
  }

  function formatSessionDate(iso) {
    var s = String(iso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    try {
      var d = new Date(s + "T12:00:00");
      if (isNaN(d.getTime())) return s;
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return s;
    }
  }

  /** Second line under the status chip (feedback day, not-used hint). */
  function photoStatusDetail(row) {
    if (row.status === "attached") {
      var day = formatSessionDate(row.session_date);
      return day ? "Used in feedback · " + day : "Used in feedback";
    }
    if (row.status === "archived_unused") return "Not used in feedback";
    if (row.status === "draft") return "Draft — not in feedback yet";
    return "Not used in feedback";
  }

  function statusChipClass(status) {
    if (status === "attached") return "ok";
    if (status === "draft") return "warn";
    return "info";
  }

  function rowMediaType(row) {
    if (row && String(row.media_type || "").toLowerCase() === "video") return "video";
    var path = String((row && row.storage_path) || "");
    if (/\.(webm|mp4|mov|m4v)$/i.test(path)) return "video";
    return "photo";
  }

  function adminThumbInnerHtml(url, row) {
    if (rowMediaType(row) === "video") {
      return (
        (url
          ? '<video src="' +
            esc(url) +
            '" muted playsinline preload="metadata" draggable="false" class="portal-achievement-protected"></video>' +
            '<span class="portal-admin-achievement-thumb__video-badge" aria-hidden="true">Video</span>'
          : '<span class="portal-admin-achievement-thumb__empty muted">No preview</span>')
      );
    }
    return url
      ? '<img src="' + esc(url) + '" alt="" draggable="false" class="portal-achievement-protected" />'
      : '<span class="portal-admin-achievement-thumb__empty muted">No preview</span>';
  }

  async function signedUrl(client, path) {
    path = String(path || "").trim();
    if (!path) return "";
    if (!(await storageObjectExists(client, path))) return "";
    var res = await client.storage.from("participant-achievements").createSignedUrl(path, 3600);
    if (res.error || !res.data) return "";
    return String(res.data.signedUrl || res.data.signedURL || "").trim();
  }

  function inboxAssignNewPath(storagePath, clientId) {
    var cid = normalizeClientId(clientId);
    var from = String(storagePath || "").trim();
    if (!from || !cid || cid === INBOX_CLIENT_ID) {
      throw new Error("Invalid assign destination.");
    }
    if (from.indexOf("/_inbox/") === -1) {
      throw new Error("Photo is not in the lead inbox folder.");
    }
    var to = from.replace("/_inbox/", "/" + cid + "/");
    if (to === from) throw new Error("Could not compute destination path.");
    return to;
  }

  function inboxAlternatePathForAssignedRow(row) {
    var path = String((row && row.storage_path) || "").trim();
    var cid = normalizeClientId(row && row.client_id);
    if (!path || !cid || cid === INBOX_CLIENT_ID || path.indexOf("/_inbox/") >= 0) return "";
    return path.replace("/" + cid + "/", "/_inbox/");
  }

  async function storageObjectExists(client, path) {
    path = String(path || "").trim();
    if (!path) return false;
    var res = await client.storage.from(ACH_BUCKET).download(path);
    return !res.error && !!(res.data && res.data.size);
  }

  async function moveAchievementStorage(client, fromPath, toPath) {
    fromPath = String(fromPath || "").trim();
    toPath = String(toPath || "").trim();
    if (!fromPath || !toPath || fromPath === toPath) {
      throw new Error("Missing storage path for move.");
    }
    if (typeof client.storage.from(ACH_BUCKET).move === "function") {
      var mv = await client.storage.from(ACH_BUCKET).move(fromPath, toPath);
      if (!mv.error) return;
    }
    var dl = await client.storage.from(ACH_BUCKET).download(fromPath);
    if (dl.error) throw dl.error;
    var blob = dl.data;
    var contentType = "image/jpeg";
    if (/\.webm$/i.test(toPath)) contentType = "video/webm";
    else if (/\.mp4$/i.test(toPath)) contentType = "video/mp4";
    var up = await client.storage.from(ACH_BUCKET).upload(toPath, blob, {
      contentType: contentType,
      upsert: false,
    });
    if (up.error) throw up.error;
    var rm = await client.storage.from(ACH_BUCKET).remove([fromPath]);
    if (rm.error && !/not found|object not found/i.test(String(rm.error.message || ""))) {
      console.warn("[achievements] storage remove after copy", rm.error);
    }
  }

  async function repairBrokenAssignedPhotoPaths(client, rows) {
    if (!client || !Array.isArray(rows)) return 0;
    var repaired = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || normalizeClientId(row.client_id) === INBOX_CLIENT_ID) continue;
      var path = String(row.storage_path || "").trim();
      var alt = inboxAlternatePathForAssignedRow(row);
      if (!path || !alt) continue;
      if (await storageObjectExists(client, path)) continue;
      if (!(await storageObjectExists(client, alt))) continue;
      try {
        await moveAchievementStorage(client, alt, path);
        repaired += 1;
      } catch (e) {
        console.warn("[achievements] repair assigned photo", row.id, e);
      }
    }
    return repaired;
  }

  function appendThumbMedia(parent, url, row) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    if (!url) {
      var empty = document.createElement("span");
      empty.className = "portal-admin-achievement-thumb__empty muted";
      empty.textContent = "No preview";
      parent.appendChild(empty);
      return;
    }
    if (rowMediaType(row) === "video") {
      var video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      video.draggable = false;
      video.className = "portal-achievement-protected";
      video.addEventListener("error", function () {
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        var miss = document.createElement("span");
        miss.className = "portal-admin-achievement-thumb__empty muted";
        miss.textContent = "Video unavailable";
        parent.appendChild(miss);
      });
      parent.appendChild(video);
      var badge = document.createElement("span");
      badge.className = "portal-admin-achievement-thumb__video-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "Video";
      parent.appendChild(badge);
      return;
    }
    var img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.draggable = false;
    img.className = "portal-achievement-protected";
    img.addEventListener("error", function () {
      while (parent.firstChild) parent.removeChild(parent.firstChild);
      var miss = document.createElement("span");
      miss.className = "portal-admin-achievement-thumb__empty muted";
      miss.textContent = "File missing";
      parent.appendChild(miss);
    });
    parent.appendChild(img);
  }

  async function fetchAllPhotos(client) {
    var res = await client.rpc("portal_admin_list_achievement_photos_all");
    if (!res.error) return res.data || [];
    console.warn("[achievements] list RPC failed, using table fallback", res.error);
    var fallback = await client
      .from("portal_participant_achievement_photos")
      .select(
        "id, staff_user_id, staff_display_name, client_name, client_id, status, storage_path, session_feedback_id, created_at, session_date, portal_session_key"
      )
      .in("status", ["draft", "attached", "archived_unused"])
      .order("client_name", { ascending: true })
      .order("created_at", { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
  }

  function applyPhotoRows(rows, status, stayOnKey) {
    var groups = groupByParticipant(rows);
    directoryState.groups = groups;
    directoryState.byKey = Object.create(null);
    groups.forEach(function (g) {
      directoryState.byKey[g.key] = g;
    });
    if (stayOnKey && directoryState.byKey[stayOnKey]) {
      directoryState.activeKey = stayOnKey;
      if (status) {
        status.textContent = "";
        status.className = "portal-forms-status";
      }
      return renderParticipantDetail(stayOnKey);
    }
    directoryState.activeKey = "";
    if (status) {
      status.textContent =
        rows.length +
        " photo(s) · " +
        groups.length +
        " participant" +
        (groups.length === 1 ? "" : "s") +
        ". Tap a participant to see their photos.";
      status.className = "portal-forms-status";
    }
    renderDirectory();
    return Promise.resolve();
  }

  /** Two-digit pad. */
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** Europe/London date+time parts for a timestamp. */
  function londonParts(value) {
    var d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return null;
    try {
      var fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      var out = {};
      fmt.formatToParts(d).forEach(function (p) {
        if (p.type !== "literal") out[p.type] = p.value;
      });
      if (out.year && out.month && out.day) return out;
    } catch (_e) {}
    return {
      year: String(d.getFullYear()),
      month: pad2(d.getMonth() + 1),
      day: pad2(d.getDate()),
      hour: pad2(d.getHours()),
      minute: pad2(d.getMinutes()),
    };
  }

  /** Photo caption: DD/MM/YYYY-Photographer-HH:MM (e.g. 29/05/2026-Victor-09:31). */
  function photoCaption(row) {
    var who = String(row.staff_display_name || "Staff").trim() || "Staff";
    var firstName = who.split(/\s+/)[0] || who;
    var p = londonParts(row.created_at);
    if (!p) return firstName;
    return p.day + "/" + p.month + "/" + p.year + "-" + firstName + "-" + p.hour + ":" + p.minute;
  }

  /** Bucket participant groups by first letter (A–Z, else #); only letters present. */
  function letterBuckets(groups) {
    var map = Object.create(null);
    groups.forEach(function (g) {
      var ch = String(g.clientName || "").trim().charAt(0).toUpperCase();
      if (!/[A-Z]/.test(ch)) ch = "#";
      if (!map[ch]) map[ch] = [];
      map[ch].push(g);
    });
    return Object.keys(map)
      .sort(function (a, b) {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b, "en");
      })
      .map(function (letter) {
        return { letter: letter, participants: map[letter] };
      });
  }

  var INBOX_CLIENT_ID = "_inbox";
  var INBOX_CLIENT_NAME = "Inbox (unassigned)";

  function isInboxGroupKey(key) {
    return normalizeClientId(key) === INBOX_CLIENT_ID;
  }

  function groupByParticipant(rows) {
    var map = Object.create(null);
    var order = [];
    rows.forEach(function (row) {
      var key = normalizeClientId(row.client_id) || String(row.client_name || "").trim().toLowerCase();
      if (!key) key = "unknown";
      if (!map[key]) {
        var displayName = String(row.client_name || row.client_id || key).trim();
        if (key === INBOX_CLIENT_ID) displayName = INBOX_CLIENT_NAME;
        map[key] = {
          key: key,
          clientName: displayName,
          photos: [],
        };
        order.push(key);
      }
      map[key].photos.push(row);
    });
    order.sort(function (a, b) {
      if (a === INBOX_CLIENT_ID) return -1;
      if (b === INBOX_CLIENT_ID) return 1;
      return map[a].clientName.localeCompare(map[b].clientName, "en", { sensitivity: "base" });
    });
    return order.map(function (k) {
      return map[k];
    });
  }

  function participantAssignOptions(excludeKey) {
    return directoryState.groups.filter(function (g) {
      return g.key !== excludeKey && !isInboxGroupKey(g.key);
    });
  }

  function populateParticipantSelect(select, targets) {
    while (select.firstChild) select.removeChild(select.firstChild);
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = SELECT_ONE_LABEL;
    placeholder.selected = true;
    select.appendChild(placeholder);
    (targets || []).forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.clientName;
      select.appendChild(opt);
    });
  }

  function clearInboxSelection() {
    inboxSelection = Object.create(null);
  }

  function inboxSelectedIds() {
    return Object.keys(inboxSelection).filter(function (k) {
      return inboxSelection[k];
    });
  }

  function updateInboxBulkUi(detailRoot, draftRows) {
    if (!detailRoot || !detailRoot.querySelector) return;
    var countEl = detailRoot.querySelector("#portalAchInboxSelCount");
    var assignBtn = detailRoot.querySelector("#portalAchInboxBulkAssignBtn");
    var deleteBtn = detailRoot.querySelector("#portalAchInboxBulkDeleteBtn");
    var selectAll = detailRoot.querySelector("#portalAchInboxSelectAll");
    var bulkSelect = detailRoot.querySelector("#portalAchInboxBulkAssign");
    var ids = inboxSelectedIds();
    var participantPicked = !!(bulkSelect && String(bulkSelect.value || "").trim());
    if (countEl) {
      countEl.textContent =
        ids.length + " selected · " + (draftRows ? draftRows.length : 0) + " draft photo(s)";
    }
    if (assignBtn) assignBtn.disabled = !ids.length || !participantPicked;
    if (deleteBtn) deleteBtn.disabled = !ids.length;
    if (selectAll && draftRows && draftRows.length) {
      selectAll.checked = ids.length > 0 && ids.length === draftRows.length;
      selectAll.indeterminate = ids.length > 0 && ids.length < draftRows.length;
    }
  }

  async function assignInboxPhoto(photoId, clientId, clientName, storagePath) {
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    photoId = String(photoId || "").trim();
    storagePath = String(storagePath || "").trim();
    if (!photoId) throw new Error("Missing photo id.");
    if (!storagePath) {
      var rowRes = await client
        .from("portal_participant_achievement_photos")
        .select("storage_path, client_id, status")
        .eq("id", photoId)
        .maybeSingle();
      if (rowRes.error) throw rowRes.error;
      if (!rowRes.data) throw new Error("Photo not found.");
      if (normalizeClientId(rowRes.data.client_id) !== INBOX_CLIENT_ID) {
        throw new Error("Photo is no longer in the inbox.");
      }
      storagePath = String(rowRes.data.storage_path || "").trim();
    }
    var newPath = inboxAssignNewPath(storagePath, clientId);
    await moveAchievementStorage(client, storagePath, newPath);
    if (!(await storageObjectExists(client, newPath))) {
      throw new Error("Photo file did not copy to the participant folder. Nothing was assigned.");
    }
    var res = await client.rpc("portal_admin_assign_achievement_photo", {
      p_photo_id: photoId,
      p_client_id: clientId,
      p_client_name: clientName,
      p_new_storage_path: newPath,
    });
    if (res.error) {
      try {
        if (await storageObjectExists(client, newPath)) {
          await client.storage.from(ACH_BUCKET).remove([newPath]);
        }
      } catch (_rollback) {}
      throw res.error;
    }
    return res.data;
  }

  async function deletePhoto(photoId, storagePath) {
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    photoId = String(photoId || "").trim();
    storagePath = String(storagePath || "").trim();
    if (!photoId) throw new Error("Missing photo id.");

    if (storagePath) {
      var rm = await client.storage.from(ACH_BUCKET).remove([storagePath]);
      if (rm.error && !/not found|object not found/i.test(String(rm.error.message || ""))) {
        console.warn("[achievements] storage remove", rm.error);
      }
    }

    var res = await client.rpc("portal_admin_delete_achievement_photo", {
      p_photo_id: photoId,
    });
    if (
      res.error &&
      /direct deletion from storage|storage tables is not allowed/i.test(
        String(res.error.message || "")
      )
    ) {
      var del = await client
        .from("portal_participant_achievement_photos")
        .delete()
        .eq("id", photoId);
      if (del.error) throw del.error;
      return { id: photoId, storage_path: storagePath, storage_deleted: !!storagePath };
    }
    if (res.error) throw res.error;
    return res.data;
  }

  function loadImageElement(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load image."));
      };
      img.src = url;
    });
  }

  function canvasFromRotatedImage(img, degrees) {
    degrees = ((degrees % 360) + 360) % 360;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    if (degrees === 90 || degrees === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return canvas;
  }

  async function rotatePhoto(row, degrees) {
    if (rowMediaType(row) === "video") throw new Error("Videos cannot be rotated.");
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    var url = await signedUrl(client, row.storage_path);
    var img = await loadImageElement(url);
    var canvas = canvasFromRotatedImage(img, degrees || 90);
    var blob = await new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (b) {
          if (b) resolve(b);
          else reject(new Error("Could not encode rotated image."));
        },
        "image/jpeg",
        0.92
      );
    });
    var up = await client.storage.from(ACH_BUCKET).upload(row.storage_path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (up.error) throw up.error;
    var upd = await client
      .from("portal_participant_achievement_photos")
      .update({
        width: canvas.width,
        height: canvas.height,
        byte_size: blob.size,
      })
      .eq("id", row.id);
    if (upd.error) throw upd.error;
    return { width: canvas.width, height: canvas.height };
  }

  function ensureViewerOnBody() {
    var viewer = document.getElementById("portalAdminAchievementsViewer");
    if (!viewer || viewer.parentNode === document.body) return;
    document.body.appendChild(viewer);
  }

  function showViewerToast(message, isError) {
    var viewer = document.getElementById("portalAdminAchievementsViewer");
    if (!viewer) return;
    var el = viewer.querySelector(".portal-achievements-viewer__toast");
    if (!el) {
      el = document.createElement("p");
      el.className = "portal-achievements-viewer__toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      viewer.appendChild(el);
    }
    var msg = String(message || "").trim();
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    el.hidden = !msg;
  }

  function setViewerBusy(busy) {
    viewerState.busy = !!busy;
    [
      "portalAdminAchievementsViewerPrev",
      "portalAdminAchievementsViewerNext",
      "portalAdminAchievementsViewerDelete",
      "portalAdminAchievementsViewerRotate",
      "portalAdminAchievementsViewerClose",
      "portalAdminAchievementsViewerBack",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!busy;
    });
    updateViewerNav();
  }

  async function deleteViewerPhoto() {
    if (viewerState.index < 0 || !viewerState.photos.length || viewerState.busy) return;
    var row = viewerState.photos[viewerState.index];
    if (!global.confirm("Delete this photo permanently? This cannot be undone.")) return;
    var stayKey = directoryState.activeKey;
    var removedIdx = viewerState.index;
    setViewerBusy(true);
    try {
      await deletePhoto(row.id, row.storage_path);
      closeViewer();
      await refresh({ stayOnKey: stayKey });
      var statusEl = document.getElementById("portalAdminAchievementsStatus");
      if (statusEl) {
        statusEl.textContent = "Photo deleted.";
        statusEl.className = "portal-forms-status";
      }
      void removedIdx;
    } catch (err) {
      console.error(err);
      showViewerToast((err && err.message) || "Could not delete photo.", true);
      var statusEl2 = document.getElementById("portalAdminAchievementsStatus");
      if (statusEl2) {
        statusEl2.textContent = (err && err.message) || "Could not delete photo.";
        statusEl2.className = "portal-forms-status is-error";
      }
    } finally {
      setViewerBusy(false);
    }
  }

  async function rotateViewerPhoto() {
    if (viewerState.index < 0 || !viewerState.photos.length || viewerState.busy) return;
    var row = viewerState.photos[viewerState.index];
    if (rowMediaType(row) === "video") return;
    setViewerBusy(true);
    try {
      await rotatePhoto(row, 90);
      showViewerToast("Photo rotated.", false);
      await openViewer(viewerState.photos, viewerState.index);
      var statusEl = document.getElementById("portalAdminAchievementsStatus");
      if (statusEl) {
        statusEl.textContent = "Photo rotated.";
        statusEl.className = "portal-forms-status";
      }
    } catch (err) {
      console.error(err);
      showViewerToast((err && err.message) || "Could not rotate photo.", true);
      var statusEl2 = document.getElementById("portalAdminAchievementsStatus");
      if (statusEl2) {
        statusEl2.textContent = (err && err.message) || "Could not rotate photo.";
        statusEl2.className = "portal-forms-status is-error";
      }
    } finally {
      setViewerBusy(false);
    }
  }

  function uniqueStaffNames(photos) {
    var seen = Object.create(null);
    var names = [];
    photos.forEach(function (p) {
      var n = String(p.staff_display_name || "").trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      names.push(n);
    });
    return names.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  }

  function closeViewer() {
    var viewer = document.getElementById("portalAdminAchievementsViewer");
    if (viewer) {
      viewer.hidden = true;
      viewer.setAttribute("aria-hidden", "true");
    }
    var img = document.getElementById("portalAdminAchievementsViewerImg");
    if (img) {
      img.hidden = false;
      img.removeAttribute("src");
    }
    var stage = viewer && viewer.querySelector(".portal-achievements-viewer__stage");
    if (stage) {
      var vid = stage.querySelector("video.portal-admin-achievements-viewer__video");
      if (vid) {
        try {
          vid.pause();
        } catch (_p) {}
        vid.removeAttribute("src");
        vid.hidden = true;
      }
    }
    document.body.classList.remove("portal-achievements-viewer-open");
    showViewerToast("", false);
    viewerState.index = -1;
    viewerState.photos = [];
    viewerState.busy = false;
  }

  function updateViewerNav() {
    var prev = document.getElementById("portalAdminAchievementsViewerPrev");
    var next = document.getElementById("portalAdminAchievementsViewerNext");
    var rotate = document.getElementById("portalAdminAchievementsViewerRotate");
    var del = document.getElementById("portalAdminAchievementsViewerDelete");
    var row = viewerState.photos[viewerState.index];
    var busy = viewerState.busy;
    var isVideo = row && rowMediaType(row) === "video";
    if (prev) prev.disabled = busy || viewerState.index <= 0;
    if (next) next.disabled = busy || viewerState.index >= viewerState.photos.length - 1;
    if (rotate) rotate.disabled = busy || isVideo;
    if (del) del.disabled = busy;
  }

  async function openViewer(photos, index) {
    if (!photos.length) return;
    ensureViewerOnBody();
    bindViewer();
    var idx = Math.max(0, Math.min(index, photos.length - 1));
    viewerState.photos = photos;
    viewerState.index = idx;
    var row = photos[idx];
    var client = cfg.getClient();
    var url = client ? await signedUrl(client, row.storage_path) : "";
    var viewer = document.getElementById("portalAdminAchievementsViewer");
    var stage = viewer && viewer.querySelector(".portal-achievements-viewer__stage");
    var img = document.getElementById("portalAdminAchievementsViewerImg");
    var isVideo = rowMediaType(row) === "video";
    if (stage) {
      var vid = stage.querySelector("video.portal-admin-achievements-viewer__video");
      if (isVideo) {
        if (!vid) {
          vid = document.createElement("video");
          vid.className = "portal-admin-achievements-viewer__video portal-achievement-protected";
          vid.controls = true;
          vid.playsInline = true;
          vid.setAttribute("playsinline", "");
          stage.appendChild(vid);
        }
        if (img) {
          img.hidden = true;
          img.removeAttribute("src");
        }
        vid.hidden = false;
        vid.src = url;
        try {
          vid.load();
        } catch (_ld) {}
      } else {
        if (vid) {
          try {
            vid.pause();
          } catch (_p) {}
          vid.hidden = true;
          vid.removeAttribute("src");
        }
        if (img) {
          img.hidden = false;
          img.src = url;
        }
      }
    } else if (img) {
      img.src = url;
    }
    if (viewer) {
      viewer.hidden = false;
      viewer.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("portal-achievements-viewer-open");
    updateViewerNav();
  }

  function navigateViewer(delta) {
    if (viewerState.index < 0 || !viewerState.photos.length) return;
    var next = viewerState.index + delta;
    if (next < 0 || next >= viewerState.photos.length) return;
    void openViewer(viewerState.photos, next);
  }

  /** Alphabetical directory: letter boxes, each with small participant buttons (max 6 per row). */
  function renderDirectory() {
    var host = document.getElementById("portalAdminAchievementsList");
    if (!host) return;
    var buckets = letterBuckets(directoryState.groups);
    if (!buckets.length) {
      host.innerHTML = '<p class="muted">No achievement photos yet.</p>';
      return;
    }
    var html = '<div class="portal-ach-dir">';
    buckets.forEach(function (bucket) {
      html += '<section class="portal-ach-letter">';
      html += '<h2 class="portal-ach-letter__title">' + esc(bucket.letter) + "</h2>";
      html += '<div class="portal-ach-letter__grid">';
      bucket.participants.forEach(function (g) {
        var n = g.photos.length;
        html +=
          '<button type="button" class="portal-ach-person" data-participant-key="' +
          esc(g.key) +
          '">' +
          participantAvatarHtml(g.clientName, g.key) +
          '<span class="portal-ach-person__text">' +
          '<span class="portal-ach-person__name">' +
          esc(g.clientName) +
          "</span>" +
          '<span class="portal-ach-person__count">' +
          n +
          " photo" +
          (n === 1 ? "" : "s") +
          "</span></span></button>";
      });
      html += "</div></section>";
    });
    html += "</div>";
    host.innerHTML = html;
  }

  /** Drill-down: one participant's photos with caption DD/MM/YYYY-Photographer-HH:MM. */
  async function renderParticipantDetail(key) {
    key = String(key || "").trim();
    directoryState.activeKey = key;
    var client = cfg.getClient();
    var host = document.getElementById("portalAdminAchievementsList");
    var statusEl = document.getElementById("portalAdminAchievementsStatus");
    var group = directoryState.byKey[key];
    if (!host || !group) {
      renderDirectory();
      return;
    }
    var staffList = uniqueStaffNames(group.photos);
    var isInbox = isInboxGroupKey(key);
    var assignTargets = isInbox ? participantAssignOptions(key) : [];
    var draftPhotos = isInbox
      ? group.photos.filter(function (row) {
          return row.status === "draft";
        })
      : [];
    if (isInbox) clearInboxSelection();
    var detailRoot = document.createElement("div");
    detailRoot.className = "portal-ach-detail";
    var bulkBarHtml = isInbox
      ? '<div class="portal-ach-inbox-bulk" id="portalAchInboxBulkBar">' +
        '<label class="portal-ach-inbox-bulk__select-all">' +
        '<input type="checkbox" id="portalAchInboxSelectAll" aria-label="Select all draft photos" />' +
        "<span>Select all</span></label>" +
        '<span class="portal-ach-inbox-bulk__count muted" id="portalAchInboxSelCount">0 selected</span>' +
        '<select class="portal-ach-inbox-assign__select portal-ach-inbox-bulk__select" id="portalAchInboxBulkAssign" aria-label="Assign selected to participant"></select>' +
        '<button type="button" class="btn btn--sec btn--sm portal-ach-inbox-assign__btn" id="portalAchInboxBulkAssignBtn" disabled>Assign selected</button>' +
        '<button type="button" class="btn btn--ghost btn--sm portal-ach-admin-delete__btn" id="portalAchInboxBulkDeleteBtn" disabled>Delete selected</button>' +
        "</div>"
      : "";
    detailRoot.innerHTML =
      '<div class="portal-ach-detail__head">' +
      '<button type="button" class="btn btn--sec btn--sm" data-ach-back="1">&larr; All participants</button>' +
      '<div class="portal-ach-detail__titles">' +
      '<div class="portal-ach-detail__identity">' +
      participantAvatarHtml(group.clientName, group.key) +
      '<div class="portal-ach-detail__identity-text">' +
      '<h2 class="portal-ach-detail__name">' +
      esc(group.clientName) +
      "</h2>" +
      '<p class="portal-ach-detail__meta muted">' +
      esc(group.photos.length) +
      " photo" +
      (group.photos.length === 1 ? "" : "s") +
      (staffList.length ? " · " + esc(staffList.join(", ")) : "") +
      (isInbox
        ? ". Tick photos, pick a participant above, then Assign selected. Double-click a photo to view full screen."
        : ". Double-click a photo to view full screen. Delete any photo that should not be kept.") +
      "</p></div></div></div></div>" +
      bulkBarHtml +
      '<div class="portal-admin-achievement-gallery portal-ach-detail__gallery portal-achievement-protected"></div>';
    host.innerHTML = "";
    host.appendChild(detailRoot);
    if (isInbox && assignTargets.length) {
      var bulkSelect = detailRoot.querySelector("#portalAchInboxBulkAssign");
      if (bulkSelect) populateParticipantSelect(bulkSelect, assignTargets);
      var bulkAssignBtn = detailRoot.querySelector("#portalAchInboxBulkAssignBtn");
      var bulkDeleteBtn = detailRoot.querySelector("#portalAchInboxBulkDeleteBtn");
      var selectAll = detailRoot.querySelector("#portalAchInboxSelectAll");
      if (bulkSelect) {
        bulkSelect.addEventListener("change", function () {
          updateInboxBulkUi(detailRoot, draftPhotos);
        });
      }
      if (selectAll) {
        selectAll.addEventListener("change", function () {
          clearInboxSelection();
          if (selectAll.checked) {
            draftPhotos.forEach(function (row) {
              inboxSelection[String(row.id)] = true;
            });
          }
          detailRoot.querySelectorAll("[data-ach-select-id]").forEach(function (cb) {
            cb.checked = !!selectAll.checked;
          });
          updateInboxBulkUi(detailRoot, draftPhotos);
        });
      }
      if (bulkAssignBtn && bulkSelect) {
        bulkAssignBtn.addEventListener("click", function () {
          var target = assignTargets.find(function (t) {
            return t.key === bulkSelect.value;
          });
          var ids = inboxSelectedIds();
          if (!ids.length) return;
          if (!target) {
            if (statusEl) {
              statusEl.textContent = "Choose a participant first.";
              statusEl.className = "portal-forms-status is-error";
            }
            return;
          }
          bulkAssignBtn.disabled = true;
          var rowsById = Object.create(null);
          draftPhotos.forEach(function (row) {
            rowsById[String(row.id)] = row;
          });
          var chain = Promise.resolve();
          ids.forEach(function (pid) {
            chain = chain.then(function () {
              var row = rowsById[pid];
              return assignInboxPhoto(
                pid,
                target.key,
                target.clientName,
                row && row.storage_path
              );
            });
          });
          void chain
            .then(function () {
              clearInboxSelection();
              void refresh({ stayOnKey: key });
            })
            .catch(function (err) {
              console.error(err);
              bulkAssignBtn.disabled = false;
              if (statusEl) {
                statusEl.textContent = (err && err.message) || "Could not assign selected photos.";
                statusEl.className = "portal-forms-status is-error";
              }
            });
        });
      }
      if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener("click", function () {
          var ids = inboxSelectedIds();
          if (!ids.length) return;
          if (
            !global.confirm(
              "Delete " + ids.length + " photo(s) permanently? This cannot be undone."
            )
          ) {
            return;
          }
          bulkDeleteBtn.disabled = true;
          var rowsById = Object.create(null);
          draftPhotos.forEach(function (row) {
            rowsById[String(row.id)] = row;
          });
          var chain = Promise.resolve();
          ids.forEach(function (pid) {
            var row = rowsById[pid];
            if (!row) return;
            chain = chain.then(function () {
              return deletePhoto(row.id, row.storage_path);
            });
          });
          void chain
            .then(function () {
              clearInboxSelection();
              void refresh({ stayOnKey: key });
              if (statusEl) {
                statusEl.textContent = "Selected photos deleted.";
                statusEl.className = "portal-forms-status";
              }
            })
            .catch(function (err) {
              console.error(err);
              bulkDeleteBtn.disabled = false;
              if (statusEl) {
                statusEl.textContent = (err && err.message) || "Could not delete selected photos.";
                statusEl.className = "portal-forms-status is-error";
              }
            });
        });
      }
      updateInboxBulkUi(detailRoot, draftPhotos);
    }
    var grid = detailRoot.querySelector(".portal-admin-achievement-gallery");
    for (var i = 0; i < group.photos.length; i++) {
      (function (row, photoIndex) {
        signedUrl(client, row.storage_path)
          .then(function (url) {
          var caption = photoCaption(row);
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "portal-admin-achievement-thumb";
          var statusDetail = photoStatusDetail(row);
          btn.setAttribute(
            "aria-label",
            esc(group.clientName) + " — " + esc(statusLabel(row.status)) + " — " + esc(caption)
          );
          var wrap = document.createElement("div");
          wrap.className = "portal-admin-achievement-thumb-wrap";
          if (isInbox && row.status === "draft") {
            var pick = document.createElement("label");
            pick.className = "portal-ach-inbox-pick";
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "portal-ach-inbox-pick__input";
            checkbox.setAttribute("data-ach-select-id", String(row.id));
            checkbox.addEventListener("change", function () {
              if (checkbox.checked) inboxSelection[String(row.id)] = true;
              else delete inboxSelection[String(row.id)];
              updateInboxBulkUi(detailRoot, draftPhotos);
            });
            pick.appendChild(checkbox);
            pick.appendChild(document.createTextNode("Select"));
            wrap.appendChild(pick);
          }
          var mediaSlot = document.createElement("div");
          mediaSlot.className = "portal-admin-achievement-thumb__media";
          appendThumbMedia(mediaSlot, url, row);
          btn.appendChild(mediaSlot);
          var cap = document.createElement("span");
          cap.className = "portal-admin-achievement-thumb__cap";
          cap.innerHTML =
            '<span class="chip chip--' +
            statusChipClass(row.status) +
            '">' +
            esc(statusLabel(row.status)) +
            "</span>" +
            '<span class="portal-admin-achievement-thumb__who">' +
            esc(statusDetail) +
            "</span>" +
            '<span class="portal-admin-achievement-thumb__title">' +
            esc(caption) +
            "</span>";
          btn.appendChild(cap);
          btn.addEventListener("dblclick", function (e) {
            e.preventDefault();
            void openViewer(group.photos, photoIndex);
          });
          wrap.appendChild(btn);
          var actionBar = document.createElement("div");
          actionBar.className = "portal-ach-admin-photo-actions";
          if (!isInbox || row.status !== "draft") {
            var deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "btn btn--ghost btn--sm portal-ach-admin-delete__btn";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", function () {
              if (
                !global.confirm(
                  "Delete this photo permanently? This cannot be undone."
                )
              ) {
                return;
              }
              deleteBtn.disabled = true;
              void deletePhoto(row.id, row.storage_path)
                .then(function () {
                  void refresh({ stayOnKey: key });
                  if (statusEl) {
                    statusEl.textContent = "Photo deleted.";
                    statusEl.className = "portal-forms-status";
                  }
                })
                .catch(function (err) {
                  console.error(err);
                  deleteBtn.disabled = false;
                  if (statusEl) {
                    statusEl.textContent = (err && err.message) || "Could not delete photo.";
                    statusEl.className = "portal-forms-status is-error";
                  }
                });
            });
            actionBar.appendChild(deleteBtn);
          }
          if (actionBar.childNodes.length) wrap.appendChild(actionBar);
          grid.appendChild(wrap);
        })
          .catch(function (err) {
            console.warn("[achievements] thumb", err);
          });
      })(group.photos[i], i);
    }
  }

  async function refresh(opts) {
    opts = opts || {};
    var stayOnKey = opts.stayOnKey != null ? String(opts.stayOnKey).trim() : "";
    var skipRepair = !!opts.skipRepair;
    var client = cfg.getClient();
    var host = document.getElementById("portalAdminAchievementsList");
    var status = document.getElementById("portalAdminAchievementsStatus");
    if (!host) return;
    if (!client) {
      if (status) {
        status.textContent = "Sign in required to load achievement photos.";
        status.className = "portal-forms-status is-error";
      }
      host.innerHTML = "";
      return;
    }
    closeViewer();
    if (status && !stayOnKey) status.textContent = "Loading…";
    try {
      var rows = await fetchAllPhotos(client);
      await applyPhotoRows(rows, status, stayOnKey);
      if (!skipRepair) {
        void repairBrokenAssignedPhotoPaths(client, rows)
          .then(function (repaired) {
            if (!repaired) return;
            if (status) {
              status.textContent =
                "Repaired " + repaired + " photo(s) after inbox assign. Reloading…";
              status.className = "portal-forms-status";
            }
            return refresh({ stayOnKey: directoryState.activeKey, skipRepair: true });
          })
          .catch(function (err) {
            console.warn("[achievements] background repair", err);
          });
      }
    } catch (e) {
      console.error(e);
      if (status) {
        status.textContent = (e && e.message) || "Error loading photos.";
        status.className = "portal-forms-status is-error";
      }
      host.innerHTML = "";
    }
  }

  function bindViewer() {
    ensureViewerOnBody();
    var viewer = document.getElementById("portalAdminAchievementsViewer");
    var backBtn = document.getElementById("portalAdminAchievementsViewerBack");
    if (backBtn && !backBtn.getAttribute("data-bound")) {
      backBtn.setAttribute("data-bound", "1");
      backBtn.addEventListener("click", closeViewer);
    }
    var closeBtn = document.getElementById("portalAdminAchievementsViewerClose");
    if (closeBtn && !closeBtn.getAttribute("data-bound")) {
      closeBtn.setAttribute("data-bound", "1");
      closeBtn.addEventListener("click", closeViewer);
    }
    if (viewer && !viewer.getAttribute("data-bound")) {
      viewer.setAttribute("data-bound", "1");
      viewer.addEventListener("click", function (e) {
        if (e.target === viewer) closeViewer();
      });
    }
    if (!global.__portalAdminAchievementsViewerKeys) {
      global.__portalAdminAchievementsViewerKeys = true;
      document.addEventListener("keydown", function (e) {
        var viewerEl = document.getElementById("portalAdminAchievementsViewer");
        if (!viewerEl || viewerEl.hidden) return;
        if (e.key === "Escape") {
          e.preventDefault();
          closeViewer();
        }
      });
    }
    var prev = document.getElementById("portalAdminAchievementsViewerPrev");
    if (prev && !prev.getAttribute("data-bound")) {
      prev.setAttribute("data-bound", "1");
      prev.addEventListener("click", function () {
        navigateViewer(-1);
      });
    }
    var next = document.getElementById("portalAdminAchievementsViewerNext");
    if (next && !next.getAttribute("data-bound")) {
      next.setAttribute("data-bound", "1");
      next.addEventListener("click", function () {
        navigateViewer(1);
      });
    }
    var del = document.getElementById("portalAdminAchievementsViewerDelete");
    if (del && !del.getAttribute("data-bound")) {
      del.setAttribute("data-bound", "1");
      del.addEventListener("click", function () {
        void deleteViewerPhoto();
      });
    }
    var rotate = document.getElementById("portalAdminAchievementsViewerRotate");
    if (rotate && !rotate.getAttribute("data-bound")) {
      rotate.setAttribute("data-bound", "1");
      rotate.addEventListener("click", function () {
        void rotateViewerPhoto();
      });
    }
  }

  function bindModule() {
    var root = document.getElementById("portalAdminAchievementsRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    bindViewer();
    var btn = document.getElementById("portalAdminAchievementsRefresh");
    if (btn) {
      btn.addEventListener("click", function () {
        directoryState.activeKey = "";
        void refresh();
      });
    }
    var host = document.getElementById("portalAdminAchievementsList");
    if (host) {
      host.addEventListener("click", function (e) {
        var back = e.target && e.target.closest && e.target.closest("[data-ach-back]");
        if (back) {
          directoryState.activeKey = "";
          renderDirectory();
          return;
        }
        var person = e.target && e.target.closest && e.target.closest("[data-participant-key]");
        if (person) {
          void renderParticipantDetail(person.getAttribute("data-participant-key"));
        }
      });
    }
    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalAdminAchievementsRoot" class="portal-day-ops-embed">' +
      '<h1 class="page-title">Participant achievements</h1>' +
      '<p class="page-intro">All in-app photos, by participant (A–Z). Lead inbox photos appear under <strong>Inbox (unassigned)</strong> until you assign them to a participant.</p>' +
      '<div class="portal-activity-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalAdminAchievementsRefresh">Refresh</button>' +
      "</div>" +
      '<div id="portalAdminAchievementsStatus" class="portal-forms-status" role="status"></div>' +
      '<div id="portalAdminAchievementsList" class="portal-admin-achievements-list"></div>' +
      "</div>" +
      '<div id="portalAdminAchievementsViewer" class="portal-achievements-viewer portal-admin-achievements-viewer" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Photo viewer">' +
      '<div class="portal-achievements-viewer__topbar">' +
      '<button type="button" class="portal-achievements-viewer__back" id="portalAdminAchievementsViewerBack">&larr; Back to gallery</button>' +
      "</div>" +
      '<button type="button" class="portal-achievements-viewer__close" id="portalAdminAchievementsViewerClose" aria-label="Close">×</button>' +
      '<div class="portal-achievements-viewer__stage portal-achievement-protected">' +
      '<img id="portalAdminAchievementsViewerImg" alt="" draggable="false" class="portal-achievements-viewer__img" />' +
      "</div>" +
      '<div class="portal-achievements-viewer__nav" role="group" aria-label="Photo navigation">' +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAdminAchievementsViewerPrev" aria-label="Previous photo">' +
      ICON_PREV +
      "</button>" +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAdminAchievementsViewerRotate" aria-label="Rotate clockwise">' +
      ICON_ROTATE +
      "</button>" +
      '<button type="button" class="portal-achievements-viewer__nav-btn portal-achievements-viewer__nav-btn--delete" id="portalAdminAchievementsViewerDelete" aria-label="Delete photo">' +
      ICON_TRASH +
      "</button>" +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAdminAchievementsViewerNext" aria-label="Next photo">' +
      ICON_NEXT +
      "</button></div></div>"
    );
  }

  global.PortalAdminAchievements = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
