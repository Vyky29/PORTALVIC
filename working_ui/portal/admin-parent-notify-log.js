/**
 * Admin — outbound parent/carer messages (portal_parent_notify_log).
 */
(function (global) {
  "use strict";

  var META_INBOX_URL = "https://business.facebook.com/latest/inbox/all";
  var FETCH_LIMIT = 200;

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var state = {
    rows: [],
    loading: false,
    query: "",
    channel: "all",
    outcome: "all",
  };

  var KIND_LABELS = {
    payment_due: "Payment reminder",
    instructor_change: "Instructor change",
    instructor_reassign: "Instructor change",
    absence_announced: "Absence",
    makeup_scheduled: "Make up session",
    trial_scheduled: "Trial session",
    session_cancelled: "Session cancelled",
    booking_confirmation: "Booking confirmation",
    whatsapp_test: "WhatsApp test",
    smtp_test: "Email test",
    custom: "Custom message",
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function kindLabel(kind) {
    var k = String(kind || "").trim().toLowerCase();
    return KIND_LABELS[k] || k.replace(/_/g, " ") || "Message";
  }

  function formatLondon(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function channelLabel(ch) {
    var c = String(ch || "").toLowerCase();
    if (c === "email") return "Email";
    if (c === "whatsapp") return "WhatsApp";
    if (c === "both") return "Email + WhatsApp";
    return c || "—";
  }

  function statusChip(status, channel) {
    var s = String(status || "").toLowerCase();
    var label = s;
    if (s === "sent" || s === "sent_sms") label = s === "sent_sms" ? "SMS sent" : "Sent";
    else if (s === "failed") label = "Failed";
    else if (s === "skipped") label = "Skipped";
    else if (s === "pending") label = "Pending";
    else label = s || "—";
    var cls = "portal-pnlog-chip";
    if (s === "sent" || s === "sent_sms") cls += " portal-pnlog-chip--ok";
    else if (s === "failed") cls += " portal-pnlog-chip--bad";
    else cls += " portal-pnlog-chip--muted";
    return (
      '<span class="' +
      cls +
      '" title="' +
      esc(channel || "") +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function deliverySummary(row) {
    var parts = [];
    var ch = String(row.channel || "").toLowerCase();
    if (ch === "email" || ch === "both") {
      parts.push("Email " + String(row.email_status || "—"));
    }
    if (ch === "whatsapp" || ch === "both") {
      parts.push("WhatsApp " + String(row.whatsapp_status || "—"));
    }
    return parts.join(" · ");
  }

  function rowFailed(row) {
    var ch = String(row.channel || "").toLowerCase();
    if (ch === "email" && row.email_status === "failed") return true;
    if (ch === "whatsapp" && row.whatsapp_status === "failed") return true;
    if (ch === "both") {
      return row.email_status === "failed" && row.whatsapp_status === "failed";
    }
    return false;
  }

  function rowSent(row) {
    var ch = String(row.channel || "").toLowerCase();
    if (ch === "email") return row.email_status === "sent";
    if (ch === "whatsapp") {
      return row.whatsapp_status === "sent" || row.whatsapp_status === "sent_sms";
    }
    if (ch === "both") {
      return row.email_status === "sent" || row.whatsapp_status === "sent" ||
        row.whatsapp_status === "sent_sms";
    }
    return false;
  }

  function filterRows(rows) {
    var q = String(state.query || "")
      .trim()
      .toLowerCase();
    var ch = String(state.channel || "all").toLowerCase();
    var outcome = String(state.outcome || "all").toLowerCase();
    return (rows || []).filter(function (row) {
      if (ch !== "all" && String(row.channel || "").toLowerCase() !== ch) return false;
      if (outcome === "sent" && !rowSent(row)) return false;
      if (outcome === "failed" && !rowFailed(row)) return false;
      if (!q) return true;
      var blob = [
        row.client_display,
        row.parent_name,
        row.parent_email,
        row.parent_phone,
        row.subject,
        row.body_text,
        row.sent_by_email,
        row.kind,
        row.venue,
      ]
        .join(" ")
        .toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function bodyPreview(text) {
    var t = String(text || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (t.length <= 120) return t;
    return t.slice(0, 117) + "…";
  }

  function renderDetail(row) {
    if (!row) return "";
    var ch = String(row.channel || "").toLowerCase();
    var statusHtml = "";
    if (ch === "email" || ch === "both") {
      statusHtml +=
        '<p class="portal-pnlog-detail__meta"><strong>Email:</strong> ' +
        statusChip(row.email_status, "email") +
        (row.parent_email ? " · " + esc(row.parent_email) : "") +
        "</p>";
    }
    if (ch === "whatsapp" || ch === "both") {
      statusHtml +=
        '<p class="portal-pnlog-detail__meta"><strong>WhatsApp:</strong> ' +
        statusChip(row.whatsapp_status, "whatsapp") +
        (row.parent_phone ? " · +" + esc(String(row.parent_phone).replace(/\D/g, "")) : "") +
        "</p>";
    }
    if (row.error_detail) {
      statusHtml +=
        '<p class="portal-pnlog-detail__error submission-state is-error">' +
        esc(row.error_detail) +
        "</p>";
    }
    return (
      '<div class="portal-pnlog-detail">' +
      '<p class="portal-pnlog-detail__meta"><strong>When:</strong> ' +
      esc(formatLondon(row.created_at)) +
      " · <strong>By:</strong> " +
      esc(row.sent_by_email || "—") +
      "</p>" +
      '<p class="portal-pnlog-detail__meta"><strong>Kind:</strong> ' +
      esc(kindLabel(row.kind)) +
      " · <strong>Channel:</strong> " +
      esc(channelLabel(row.channel)) +
      "</p>" +
      (row.client_display
        ? '<p class="portal-pnlog-detail__meta"><strong>Participant:</strong> ' +
          esc(row.client_display) +
          "</p>"
        : "") +
      (row.parent_name
        ? '<p class="portal-pnlog-detail__meta"><strong>Parent / carer:</strong> ' +
          esc(row.parent_name) +
          "</p>"
        : "") +
      (row.session_date || row.venue
        ? '<p class="portal-pnlog-detail__meta"><strong>Session:</strong> ' +
          esc(row.session_date || "—") +
          (row.venue ? " · " + esc(row.venue) : "") +
          "</p>"
        : "") +
      statusHtml +
      (row.subject
        ? '<p class="portal-pnlog-detail__subject"><strong>Subject:</strong> ' +
          esc(row.subject) +
          "</p>"
        : "") +
      '<pre class="portal-pnlog-detail__body">' +
      esc(String(row.body_text || "")) +
      "</pre>" +
      '<div class="portal-pnlog-detail__actions">' +
      (row.parent_phone &&
      (ch === "whatsapp" || ch === "both") &&
      (row.whatsapp_status === "sent" || row.whatsapp_status === "sent_sms")
        ? '<a class="btn btn--sec btn--sm" href="' +
          esc(META_INBOX_URL) +
          '" target="_blank" rel="noopener noreferrer">Open Meta inbox (replies)</a> '
        : "") +
      (row.parent_phone
        ? '<a class="btn btn--ghost btn--sm" href="https://wa.me/' +
          esc(String(row.parent_phone).replace(/\D/g, "")) +
          '" target="_blank" rel="noopener noreferrer">Open WhatsApp app</a>'
        : "") +
      "</div></div>"
    );
  }

  function renderList(rows) {
    var host = document.getElementById("portalParentNotifyLogList");
    var countEl = document.getElementById("portalParentNotifyLogCount");
    if (!host) return;
    var filtered = filterRows(rows);
    if (countEl) {
      countEl.textContent =
        filtered.length +
        " message" +
        (filtered.length === 1 ? "" : "s") +
        (filtered.length !== rows.length ? " (filtered from " + rows.length + ")" : "") +
        " · newest first";
    }
    if (!filtered.length) {
      host.innerHTML =
        '<p class="muted portal-pnlog-empty">No sent messages match your filters. Use <strong>Send now</strong> from Scheduling or Bookings — each send is logged here.</p>';
      return;
    }
    host.innerHTML = filtered
      .map(function (row, idx) {
        var who = esc(row.client_display || row.parent_name || "—");
        var sub = esc(bodyPreview(row.body_text));
        var when = esc(formatLondon(row.created_at));
        var by = esc(row.sent_by_email || "");
        var chips =
          statusChip(
            row.channel === "email" ? row.email_status : row.whatsapp_status,
            row.channel
          ) +
          ' <span class="portal-pnlog-chip portal-pnlog-chip--muted">' +
          esc(channelLabel(row.channel)) +
          "</span>";
        if (row.channel === "both") {
          chips =
            statusChip(row.email_status, "email") +
            " " +
            statusChip(row.whatsapp_status, "whatsapp");
        }
        return (
          '<details class="portal-pnlog-row" data-pnlog-idx="' +
          idx +
          '">' +
          '<summary class="portal-pnlog-row__head">' +
          '<span class="portal-pnlog-row__main">' +
          '<span class="portal-pnlog-row__who">' +
          who +
          "</span>" +
          '<span class="portal-pnlog-row__kind muted">' +
          esc(kindLabel(row.kind)) +
          "</span>" +
          '<span class="portal-pnlog-row__preview muted">' +
          sub +
          "</span>" +
          "</span>" +
          '<span class="portal-pnlog-row__side">' +
          '<span class="portal-pnlog-row__chips">' +
          chips +
          "</span>" +
          '<span class="portal-pnlog-row__when muted">' +
          when +
          "</span>" +
          (by ? '<span class="portal-pnlog-row__by muted">' + by + "</span>" : "") +
          "</span></summary>" +
          '<div class="portal-pnlog-row__body">' +
          renderDetail(row) +
          "</div></details>"
        );
      })
      .join("");
  }

  function bindFilters() {
    var search = document.getElementById("portalParentNotifyLogSearch");
    var channel = document.getElementById("portalParentNotifyLogChannel");
    var outcome = document.getElementById("portalParentNotifyLogOutcome");
    var refresh = document.getElementById("portalParentNotifyLogRefresh");
    function apply() {
      state.query = search ? search.value : "";
      state.channel = channel ? channel.value : "all";
      state.outcome = outcome ? outcome.value : "all";
      renderList(state.rows);
    }
    if (search && !search.getAttribute("data-bound")) {
      search.setAttribute("data-bound", "1");
      search.addEventListener("input", apply);
    }
    if (channel && !channel.getAttribute("data-bound")) {
      channel.setAttribute("data-bound", "1");
      channel.addEventListener("change", apply);
    }
    if (outcome && !outcome.getAttribute("data-bound")) {
      outcome.setAttribute("data-bound", "1");
      outcome.addEventListener("change", apply);
    }
    if (refresh && !refresh.getAttribute("data-bound")) {
      refresh.setAttribute("data-bound", "1");
      refresh.addEventListener("click", function () {
        void loadRows(true);
      });
    }
  }

  async function loadRows(force) {
    if (state.loading && !force) return;
    var client = cfg.getClient();
    var statusEl = document.getElementById("portalParentNotifyLogStatus");
    var listEl = document.getElementById("portalParentNotifyLogList");
    if (!client) {
      if (statusEl) {
        statusEl.textContent = "Sign in required to load family messages.";
        statusEl.className = "portal-forms-status is-error";
      }
      if (listEl) listEl.innerHTML = "";
      return;
    }
    state.loading = true;
    if (statusEl) {
      statusEl.textContent = "Loading…";
      statusEl.className = "portal-forms-status";
    }
    try {
      var res = await client
        .from("portal_parent_notify_log")
        .select(
          "id, created_at, sent_by_email, kind, channel, client_display, parent_name, parent_email, parent_phone, session_date, venue, subject, body_text, email_status, whatsapp_status, error_detail"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (res.error) throw res.error;
      state.rows = res.data || [];
      if (statusEl) {
        statusEl.textContent =
          state.rows.length >= FETCH_LIMIT
            ? "Showing latest " + FETCH_LIMIT + " messages."
            : "";
        statusEl.className = "portal-forms-status";
      }
      renderList(state.rows);
    } catch (e) {
      console.error("[parent-notify-log]", e);
      state.rows = [];
      if (statusEl) {
        statusEl.textContent =
          (e && e.message) ||
          "Could not load messages — check you are signed in as admin.";
        statusEl.className = "portal-forms-status is-error";
      }
      if (listEl) {
        listEl.innerHTML =
          '<p class="muted portal-pnlog-empty">Could not load the message log.</p>';
      }
    } finally {
      state.loading = false;
    }
  }

  function viewHtml() {
    return (
      '<div id="portalParentNotifyLogRoot" class="portal-day-ops-embed portal-pnlog-root">' +
      '<h1 class="page-title">Family messages</h1>' +
      '<p class="page-intro">Every <strong>Send now</strong> from Scheduling, Bookings, or Ops orders — email and WhatsApp API. Replies to the API number are in <a href="' +
      esc(META_INBOX_URL) +
      '" target="_blank" rel="noopener noreferrer">Meta Business inbox</a>, not here yet.</p>' +
      '<div class="portal-pnlog-toolbar">' +
      '<input type="search" id="portalParentNotifyLogSearch" class="inp portal-pnlog-toolbar__search" placeholder="Search participant, phone, text…" autocomplete="off" />' +
      '<select id="portalParentNotifyLogChannel" class="sel portal-pnlog-toolbar__sel" aria-label="Channel filter">' +
      '<option value="all">All channels</option>' +
      '<option value="whatsapp">WhatsApp</option>' +
      '<option value="email">Email</option>' +
      '<option value="both">Both</option>' +
      "</select>" +
      '<select id="portalParentNotifyLogOutcome" class="sel portal-pnlog-toolbar__sel" aria-label="Outcome filter">' +
      '<option value="all">All outcomes</option>' +
      '<option value="sent">Sent OK</option>' +
      '<option value="failed">Failed</option>' +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentNotifyLogRefresh">Refresh</button>' +
      '<a class="btn btn--ghost btn--sm" href="' +
      esc(META_INBOX_URL) +
      '" target="_blank" rel="noopener noreferrer">Meta inbox</a>' +
      "</div>" +
      '<div id="portalParentNotifyLogStatus" class="portal-forms-status" role="status"></div>' +
      '<p id="portalParentNotifyLogCount" class="muted portal-pnlog-count"></p>' +
      '<div id="portalParentNotifyLogList" class="portal-pnlog-list"></div>' +
      "</div>"
    );
  }

  function bindModule() {
    var root = document.getElementById("portalParentNotifyLogRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    bindFilters();
    void loadRows(false);
  }

  global.PortalParentNotifyLog = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: function () {
      return loadRows(true);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
