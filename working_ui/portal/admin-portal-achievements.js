/**
 * Admin — participant achievement photos (attached + unused archive).
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
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

  async function signedUrl(client, path) {
    var res = await client.storage.from("participant-achievements").createSignedUrl(path, 3600);
    return res.data && res.data.signedUrl ? res.data.signedUrl : "";
  }

  async function refresh() {
    var client = cfg.getClient();
    var dayEl = document.getElementById("portalAdminAchievementsDay");
    var host = document.getElementById("portalAdminAchievementsList");
    var status = document.getElementById("portalAdminAchievementsStatus");
    if (!client || !host) return;
    var day = dayEl && dayEl.value ? dayEl.value : londonTodayIso();
    if (dayEl && !dayEl.value) dayEl.value = day;
    if (status) status.textContent = "Loading…";
    var res = await client
      .from("portal_participant_achievement_photos")
      .select(
        "id, staff_display_name, client_name, client_id, status, storage_path, session_feedback_id, created_at"
      )
      .eq("session_date", day)
      .in("status", ["attached", "archived_unused"])
      .order("created_at", { ascending: false });
    if (res.error) {
      if (status) {
        status.textContent = res.error.message || "Error loading photos.";
        status.className = "portal-forms-status is-error";
      }
      host.innerHTML = "";
      return;
    }
    var rows = res.data || [];
    if (status) {
      status.textContent = rows.length + " photo(s) on " + day + " (staff no longer see these).";
      status.className = "portal-forms-status";
    }
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No archived or attached achievement photos for this day.</p>';
      return;
    }
    host.innerHTML = "";
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var url = await signedUrl(client, row.storage_path);
      var card = document.createElement("details");
      card.className = "portal-admin-achievement-card";
      card.innerHTML =
        '<summary><strong>' +
        esc(row.client_name || row.client_id) +
        "</strong> · " +
        esc(row.staff_display_name || "Staff") +
        ' <span class="chip chip--' +
        (row.status === "attached" ? "ok" : "info") +
        '">' +
        esc(row.status === "attached" ? "In feedback" : "Unused") +
        "</span></summary>" +
        '<div class="portal-admin-achievement-card__body">' +
        (url
          ? '<img src="' + esc(url) + '" alt="" class="portal-achievement-protected" draggable="false" />'
          : "<p class=\"muted\">Preview unavailable</p>") +
        "</div>";
      host.appendChild(card);
    }
  }

  function bindModule() {
    var root = document.getElementById("portalAdminAchievementsRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var dayEl = document.getElementById("portalAdminAchievementsDay");
    if (dayEl && !dayEl.value) dayEl.value = londonTodayIso();
    var btn = document.getElementById("portalAdminAchievementsRefresh");
    if (btn) btn.addEventListener("click", function () {
      void refresh();
    });
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
      '<p class="page-intro">Photos staff took in-app. After feedback submit, unused shots are archived here; attached shots link to session feedback.</p>' +
      '<div class="portal-activity-toolbar">' +
      '<label><span class="muted">Day</span> <input type="date" class="inp" id="portalAdminAchievementsDay" /></label>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalAdminAchievementsRefresh">Refresh</button>' +
      "</div>" +
      '<div id="portalAdminAchievementsStatus" class="portal-forms-status" role="status"></div>' +
      '<div id="portalAdminAchievementsList" class="portal-admin-achievements-list"></div>' +
      "</div>"
    );
  }

  global.PortalAdminAchievements = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
