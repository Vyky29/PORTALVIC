/**
 * Admin — participant achievement photos (all staff, grouped by participant).
 */
(function (global) {
  "use strict";

  var ICON_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

  var ACH_BUCKET = "participant-achievements";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var viewerState = { photos: [], index: -1 };
  var directoryState = { groups: [], byKey: Object.create(null), activeKey: "" };

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
    var res = await client.storage.from("participant-achievements").createSignedUrl(path, 3600);
    return res.data && res.data.signedUrl ? res.data.signedUrl : "";
  }

  async function fetchAllPhotos(client) {
    var res = await client.rpc("portal_admin_list_achievement_photos_all");
    if (!res.error) return res.data || [];
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

  async function assignInboxPhoto(photoId, clientId, clientName) {
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    var res = await client.rpc("portal_admin_assign_achievement_photo", {
      p_photo_id: photoId,
      p_client_id: clientId,
      p_client_name: clientName,
    });
    if (res.error) throw res.error;
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
    viewerState.index = -1;
    viewerState.photos = [];
  }

  function updateViewerNav() {
    var prev = document.getElementById("portalAdminAchievementsViewerPrev");
    var next = document.getElementById("portalAdminAchievementsViewerNext");
    if (prev) prev.disabled = viewerState.index <= 0;
    if (next) next.disabled = viewerState.index >= viewerState.photos.length - 1;
  }

  async function openViewer(photos, index) {
    if (!photos.length) return;
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
        if (img) img.hidden = true;
        vid.hidden = false;
        vid.src = url;
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
    var detail = document.createElement("div");
    detail.className = "portal-ach-detail";
    detail.innerHTML =
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
        ? ". Assign each photo to a participant folder below, or delete ones that are not usable."
        : ". Double-click a photo to view full screen. Delete any photo that should not be kept.") +
      "</p></div></div></div></div>" +
      '<div class="portal-admin-achievement-gallery portal-ach-detail__gallery portal-achievement-protected"></div>';
    host.innerHTML = "";
    host.appendChild(detail);
    var grid = detail.querySelector(".portal-admin-achievement-gallery");
    for (var i = 0; i < group.photos.length; i++) {
      (function (row, photoIndex) {
        signedUrl(client, row.storage_path).then(function (url) {
          var caption = photoCaption(row);
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "portal-admin-achievement-thumb";
          var detail = photoStatusDetail(row);
          btn.setAttribute(
            "aria-label",
            esc(group.clientName) + " — " + esc(statusLabel(row.status)) + " — " + esc(caption)
          );
          var wrap = document.createElement("div");
          wrap.className = "portal-admin-achievement-thumb-wrap";
          btn.innerHTML =
            adminThumbInnerHtml(url, row) +
            '<span class="portal-admin-achievement-thumb__cap">' +
            '<span class="chip chip--' +
            statusChipClass(row.status) +
            '">' +
            esc(statusLabel(row.status)) +
            "</span>" +
            '<span class="portal-admin-achievement-thumb__who">' +
            esc(detail) +
            "</span>" +
            '<span class="portal-admin-achievement-thumb__title">' +
            esc(caption) +
            "</span></span>";
          btn.addEventListener("dblclick", function (e) {
            e.preventDefault();
            void openViewer(group.photos, photoIndex);
          });
          wrap.appendChild(btn);
          var actionBar = document.createElement("div");
          actionBar.className = "portal-ach-admin-photo-actions";
          if (isInbox && row.status === "draft" && assignTargets.length) {
            var assignBar = document.createElement("div");
            assignBar.className = "portal-ach-inbox-assign";
            var select = document.createElement("select");
            select.className = "portal-ach-inbox-assign__select";
            select.setAttribute("aria-label", "Assign to participant");
            assignTargets.forEach(function (t) {
              var opt = document.createElement("option");
              opt.value = t.key;
              opt.textContent = t.clientName;
              select.appendChild(opt);
            });
            var assignBtn = document.createElement("button");
            assignBtn.type = "button";
            assignBtn.className = "btn btn--sec btn--sm portal-ach-inbox-assign__btn";
            assignBtn.textContent = "Assign";
            assignBtn.addEventListener("click", function () {
              var target = assignTargets.find(function (t) {
                return t.key === select.value;
              });
              if (!target) return;
              assignBtn.disabled = true;
              void assignInboxPhoto(row.id, target.key, target.clientName)
                .then(function () {
                  void refresh({ stayOnKey: key });
                })
                .catch(function (err) {
                  console.error(err);
                  assignBtn.disabled = false;
                  if (statusEl) {
                    statusEl.textContent = (err && err.message) || "Could not assign photo.";
                    statusEl.className = "portal-forms-status is-error";
                  }
                });
            });
            assignBar.appendChild(select);
            assignBar.appendChild(assignBtn);
            actionBar.appendChild(assignBar);
          }
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
          wrap.appendChild(actionBar);
          grid.appendChild(wrap);
        });
      })(group.photos[i], i);
    }
  }

  async function refresh(opts) {
    opts = opts || {};
    var stayOnKey = opts.stayOnKey != null ? String(opts.stayOnKey).trim() : "";
    var client = cfg.getClient();
    var host = document.getElementById("portalAdminAchievementsList");
    var status = document.getElementById("portalAdminAchievementsStatus");
    if (!client || !host) return;
    closeViewer();
    if (status && !stayOnKey) status.textContent = "Loading…";
    try {
      var rows = await fetchAllPhotos(client);
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
        await renderParticipantDetail(stayOnKey);
        return;
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
    } catch (e) {
      console.error(e);
      if (status) {
        status.textContent = e.message || "Error loading photos.";
        status.className = "portal-forms-status is-error";
      }
      host.innerHTML = "";
    }
  }

  function bindViewer() {
    var closeBtn = document.getElementById("portalAdminAchievementsViewerClose");
    if (closeBtn) closeBtn.addEventListener("click", closeViewer);
    var prev = document.getElementById("portalAdminAchievementsViewerPrev");
    if (prev) prev.addEventListener("click", function () {
      navigateViewer(-1);
    });
    var next = document.getElementById("portalAdminAchievementsViewerNext");
    if (next) next.addEventListener("click", function () {
      navigateViewer(1);
    });
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
      '<div id="portalAdminAchievementsViewer" class="portal-achievements-viewer" hidden aria-hidden="true">' +
      '<button type="button" class="portal-achievements-viewer__close" id="portalAdminAchievementsViewerClose" aria-label="Close">×</button>' +
      '<div class="portal-achievements-viewer__stage portal-achievement-protected">' +
      '<img id="portalAdminAchievementsViewerImg" alt="" draggable="false" class="portal-achievements-viewer__img" />' +
      "</div>" +
      '<div class="portal-achievements-viewer__nav" role="group" aria-label="Photo navigation">' +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAdminAchievementsViewerPrev" aria-label="Previous photo">' +
      ICON_PREV +
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
