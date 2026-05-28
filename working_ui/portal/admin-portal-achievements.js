/**
 * Admin — participant achievement photos (all staff, grouped by participant).
 */
(function (global) {
  "use strict";

  var ICON_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var viewerState = { photos: [], index: -1 };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function normalizeClientId(id) {
    return String(id || "")
      .trim()
      .toLowerCase();
  }

  function londonTodayIso() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      var y = "";
      var m = "";
      var d = "";
      parts.forEach(function (p) {
        if (p.type === "year") y = p.value;
        if (p.type === "month") m = p.value;
        if (p.type === "day") d = p.value;
      });
      if (y && m && d) return y + "-" + m + "-" + d;
    } catch (_e) {}
    return new Date().toISOString().slice(0, 10);
  }

  function statusLabel(status) {
    if (status === "attached") return "In feedback";
    if (status === "draft") return "Draft";
    return "Unused";
  }

  function statusChipClass(status) {
    if (status === "attached") return "ok";
    if (status === "draft") return "warn";
    return "info";
  }

  async function signedUrl(client, path) {
    var res = await client.storage.from("participant-achievements").createSignedUrl(path, 3600);
    return res.data && res.data.signedUrl ? res.data.signedUrl : "";
  }

  async function fetchPhotosForDay(client, day) {
    var res = await client.rpc("portal_admin_list_achievement_photos_for_day", {
      p_session_date: day,
    });
    if (!res.error) return res.data || [];
    var fallback = await client
      .from("portal_participant_achievement_photos")
      .select(
        "id, staff_user_id, staff_display_name, client_name, client_id, status, storage_path, session_feedback_id, created_at, portal_session_key"
      )
      .eq("session_date", day)
      .in("status", ["draft", "attached", "archived_unused"])
      .order("client_name", { ascending: true })
      .order("created_at", { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
  }

  function groupByParticipant(rows) {
    var map = Object.create(null);
    var order = [];
    rows.forEach(function (row) {
      var key = normalizeClientId(row.client_id) || String(row.client_name || "").trim().toLowerCase();
      if (!key) key = "unknown";
      if (!map[key]) {
        map[key] = {
          key: key,
          clientName: String(row.client_name || row.client_id || key).trim(),
          photos: [],
        };
        order.push(key);
      }
      map[key].photos.push(row);
    });
    order.sort(function (a, b) {
      return map[a].clientName.localeCompare(map[b].clientName, "en", { sensitivity: "base" });
    });
    return order.map(function (k) {
      return map[k];
    });
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
    if (img) img.removeAttribute("src");
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
    var img = document.getElementById("portalAdminAchievementsViewerImg");
    if (img) img.src = url;
    var viewer = document.getElementById("portalAdminAchievementsViewer");
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

  async function renderGroup(client, group) {
    var card = document.createElement("details");
    card.className = "portal-admin-achievement-card";
    var staffList = uniqueStaffNames(group.photos);
    var draftCount = group.photos.filter(function (p) {
      return p.status === "draft";
    }).length;
    card.innerHTML =
      '<summary><strong>' +
      esc(group.clientName) +
      "</strong>" +
      '<span class="portal-admin-achievement-card__meta">' +
      esc(group.photos.length) +
      " photo" +
      (group.photos.length === 1 ? "" : "s") +
      (staffList.length ? " · " + esc(staffList.join(", ")) : "") +
      (draftCount ? ' · <span class="muted">' + draftCount + " draft</span>" : "") +
      "</span></summary>" +
      '<div class="portal-admin-achievement-card__body">' +
      '<div class="portal-admin-achievement-gallery portal-achievement-protected"></div>' +
      "</div>";
    var grid = card.querySelector(".portal-admin-achievement-gallery");
    for (var i = 0; i < group.photos.length; i++) {
      (function (row, photoIndex) {
        var urlP = signedUrl(client, row.storage_path);
        urlP.then(function (url) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "portal-admin-achievement-thumb";
          btn.setAttribute(
            "aria-label",
            esc(group.clientName) + " — " + esc(row.staff_display_name || "Staff") + " — " + statusLabel(row.status)
          );
          btn.innerHTML =
            (url
              ? '<img src="' + esc(url) + '" alt="" draggable="false" class="portal-achievement-protected" />'
              : '<span class="portal-admin-achievement-thumb__empty muted">No preview</span>') +
            '<span class="portal-admin-achievement-thumb__cap">' +
            '<span class="chip chip--' +
            statusChipClass(row.status) +
            '">' +
            esc(statusLabel(row.status)) +
            "</span>" +
            '<span class="portal-admin-achievement-thumb__who">' +
            esc(row.staff_display_name || "Staff") +
            "</span></span>";
          btn.addEventListener("dblclick", function (e) {
            e.preventDefault();
            void openViewer(group.photos, photoIndex);
          });
          grid.appendChild(btn);
        });
      })(group.photos[i], i);
    }
    return card;
  }

  async function refresh() {
    var client = cfg.getClient();
    var dayEl = document.getElementById("portalAdminAchievementsDay");
    var host = document.getElementById("portalAdminAchievementsList");
    var status = document.getElementById("portalAdminAchievementsStatus");
    if (!client || !host) return;
    var day = dayEl && dayEl.value ? dayEl.value : londonTodayIso();
    if (dayEl && !dayEl.value) dayEl.value = day;
    closeViewer();
    if (status) status.textContent = "Loading…";
    try {
      var rows = await fetchPhotosForDay(client, day);
      var groups = groupByParticipant(rows);
      if (status) {
        status.textContent =
          rows.length +
          " photo(s) · " +
          groups.length +
          " participant" +
          (groups.length === 1 ? "" : "s") +
          " on " +
          day +
          ". Double-click a photo to view full screen.";
        status.className = "portal-forms-status";
      }
      if (!rows.length) {
        host.innerHTML = '<p class="muted">No achievement photos for this day.</p>';
        return;
      }
      host.innerHTML = "";
      for (var g = 0; g < groups.length; g++) {
        host.appendChild(await renderGroup(client, groups[g]));
      }
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
    var dayEl = document.getElementById("portalAdminAchievementsDay");
    if (dayEl && !dayEl.value) dayEl.value = londonTodayIso();
    var btn = document.getElementById("portalAdminAchievementsRefresh");
    if (btn) {
      btn.addEventListener("click", function () {
        void refresh();
      });
    }
    if (dayEl) {
      dayEl.addEventListener("change", function () {
        void refresh();
      });
    }
    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalAdminAchievementsRoot" class="portal-day-ops-embed">' +
      '<h1 class="page-title">Participant achievements</h1>' +
      '<p class="page-intro">All in-app photos for this day, grouped by participant. Staff who share the same session see each other&apos;s shots in their gallery.</p>' +
      '<div class="portal-activity-toolbar">' +
      '<label><span class="muted">Day</span> <input type="date" class="inp" id="portalAdminAchievementsDay" /></label>' +
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
