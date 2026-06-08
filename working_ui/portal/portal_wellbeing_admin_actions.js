/**
 * Admin � pending wellbeing support requests (1-to-1 actions).
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

  var state = { rows: [], loading: false, error: "" };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function statusLabel(status) {
    if (global.portalWellbeingReviewSimple && global.portalWellbeingReviewSimple.statusLabel) {
      return global.portalWellbeingReviewSimple.statusLabel(status);
    }
    var map = {
      all_clear: "All good",
      needs_1to1: "Awaiting 1 to 1",
      awaiting_1to1: "Awaiting 1 to 1",
      in_progress: "In progress",
      completed: "Completed",
      monitoring: "Monitoring",
    };
    return map[String(status || "").toLowerCase()] || String(status || "").replace(/_/g, " ");
  }

  function statusChipClass(status) {
    var st = String(status || "").toLowerCase();
    if (st === "awaiting_1to1" || st === "needs_1to1") return "chip--warn";
    if (st === "in_progress") return "chip--info";
    if (st === "monitoring") return "chip--muted";
    if (st === "completed") return "chip--ok";
    return "chip--muted";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function openReview(checkinId) {
    var id = String(checkinId || "").trim();
    if (!id) return;
    window.open("staff_wellbeing_review.html?checkin=" + encodeURIComponent(id), "_blank", "noopener");
  }

  function renderList(root) {
    if (!root) return;
    if (state.loading) {
      root.innerHTML = '<p class="muted" style="margin:0">Loading wellbeing actions�</p>';
      return;
    }
    if (state.error) {
      root.innerHTML = '<p class="muted" style="margin:0;color:var(--danger,#b42318)">' + esc(state.error) + "</p>";
      return;
    }
    var pending = (state.rows || []).filter(function (r) {
      var st = String(r.status || "").toLowerCase();
      return st !== "all_clear" && st !== "completed";
    });
    if (!pending.length) {
      root.innerHTML =
        '<p class="muted" style="margin:0">No pending wellbeing conversations. Support requests appear here when staff ask for help in their check-in.</p>';
      return;
    }
    root.innerHTML =
      '<div class="portal-wb-admin-actions">' +
      pending
        .map(function (row) {
          var st = String(row.status || "").toLowerCase();
          return (
            '<button type="button" class="portal-wb-admin-action" data-wb-checkin="' +
            esc(row.id) +
            '">' +
            '<div class="portal-wb-admin-action__main">' +
            "<strong>" +
            esc(row.staff_name || "Staff member") +
            "</strong>" +
            '<span class="muted">' +
            esc(formatWhen(row.created_at)) +
            (row.term_key ? " � " + esc(row.term_key) : "") +
            "</span>" +
            "</div>" +
            '<span class="chip ' +
            statusChipClass(st) +
            '">' +
            esc(statusLabel(st)) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>";
    root.querySelectorAll("[data-wb-checkin]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openReview(btn.getAttribute("data-wb-checkin"));
      });
    });
  }

  function fetchRows() {
    var client = cfg.getClient();
    var root = document.getElementById("portalWellbeingActionsRoot");
    if (!client || typeof client.from !== "function") {
      state.loading = false;
      state.error = "";
      state.rows = [];
      renderList(root);
      return Promise.resolve();
    }
    state.loading = true;
    state.error = "";
    renderList(root);
    return client
      .from("portal_staff_wellbeing_checkins")
      .select("id,created_at,staff_name,status,term_key,has_concerns")
      .eq("has_concerns", true)
      .in("status", ["needs_1to1", "awaiting_1to1", "in_progress", "monitoring"])
      .order("created_at", { ascending: false })
      .limit(40)
      .then(function (res) {
        state.loading = false;
        if (res.error) {
          state.error = res.error.message || "Could not load wellbeing actions.";
          state.rows = [];
        } else {
          state.rows = res.data || [];
          state.error = "";
        }
        renderList(root);
      })
      .catch(function (err) {
        state.loading = false;
        state.error = String((err && err.message) || err || "Could not load wellbeing actions.");
        state.rows = [];
        renderList(root);
      });
  }

  function viewHtml() {
    return (
      '<section class="card card--premium" id="portalWellbeingActionsCard" style="margin-bottom:16px">' +
      '<div class="card-h"><h2 style="margin:0;font-size:16px">Wellbeing conversations</h2></div>' +
      '<div class="card-b" id="portalWellbeingActionsRoot"><p class="muted" style="margin:0">Loading�</p></div>' +
      "</section>"
    );
  }

  function bindModule() {
    var root = document.getElementById("portalWellbeingActionsRoot");
    if (!root) return;
    void fetchRows();
    if (global.__portalWellbeingActionsRtBound) return;
    var client = cfg.getClient();
    if (!client || typeof client.channel !== "function") return;
    try {
      global.__portalWellbeingActionsRtBound = true;
      client
        .channel("portal-wellbeing-admin-actions")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "portal_staff_wellbeing_checkins" },
          function () {
            void fetchRows();
          }
        )
        .subscribe();
    } catch (_) {}
  }

  global.PortalWellbeingAdminActions = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: fetchRows,
  };
})(typeof window !== "undefined" ? window : globalThis);
