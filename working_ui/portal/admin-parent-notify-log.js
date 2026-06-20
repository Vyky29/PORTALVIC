/**
 * Admin — parent/carer messages: outbound log + inbound WhatsApp replies (V3).
 */
(function (global) {
  "use strict";

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
    timeline: [],
    inboundAvailable: true,
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

  function phoneDigits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function statusChip(status, channel) {
    var s = String(status || "").toLowerCase();
    var label = s;
    if (s === "sent" || s === "sent_sms") label = s === "sent_sms" ? "SMS sent" : "Sent";
    else if (s === "failed") label = "Failed";
    else if (s === "skipped") label = "Skipped";
    else if (s === "pending") label = "Pending";
    else if (s === "reply") label = "Reply";
    else label = s || "—";
    var cls = "portal-pnlog-chip";
    if (s === "sent" || s === "sent_sms") cls += " portal-pnlog-chip--ok";
    else if (s === "reply") cls += " portal-pnlog-chip--in";
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

  function outboundFailed(row) {
    var ch = String(row.channel || "").toLowerCase();
    if (ch === "email" && row.email_status === "failed") return true;
    if (ch === "whatsapp" && row.whatsapp_status === "failed") return true;
    if (ch === "both") {
      return row.email_status === "failed" && row.whatsapp_status === "failed";
    }
    return false;
  }

  function outboundSent(row) {
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

  function mergeTimeline(outbound, inbound) {
    var items = [];
    (outbound || []).forEach(function (row) {
      items.push({ direction: "out", created_at: row.created_at, row: row });
    });
    (inbound || []).forEach(function (row) {
      items.push({ direction: "in", created_at: row.created_at, row: row });
    });
    items.sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    return items.slice(0, FETCH_LIMIT);
  }

  function filterTimeline(items) {
    var q = String(state.query || "")
      .trim()
      .toLowerCase();
    var ch = String(state.channel || "all").toLowerCase();
    var outcome = String(state.outcome || "all").toLowerCase();
    return (items || []).filter(function (item) {
      if (item.direction === "in") {
        if (ch === "email" || ch === "both") return false;
        if (outcome === "sent" || outcome === "failed") return false;
        if (outcome === "replies" || outcome === "all" || ch === "whatsapp" || ch === "all") {
          // continue
        } else {
          return false;
        }
      } else {
        if (outcome === "replies") return false;
        var row = item.row;
        if (ch !== "all" && String(row.channel || "").toLowerCase() !== ch) return false;
        if (outcome === "sent" && !outboundSent(row)) return false;
        if (outcome === "failed" && !outboundFailed(row)) return false;
      }
      if (!q) return true;
      var row = item.row;
      var blob;
      if (item.direction === "in") {
        blob = [
          row.contact_name,
          row.from_phone,
          row.body_text,
          row.message_type,
        ].join(" ");
      } else {
        blob = [
          row.client_display,
          row.parent_name,
          row.parent_email,
          row.parent_phone,
          row.subject,
          row.body_text,
          row.sent_by_email,
          row.kind,
          row.venue,
        ].join(" ");
      }
      return blob.toLowerCase().indexOf(q) >= 0;
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

  function renderOutboundDetail(row) {
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
        (row.parent_phone ? " · +" + esc(phoneDigits(row.parent_phone)) : "") +
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
      "</pre></div>"
    );
  }

  function renderInboundDetail(row) {
    if (!row) return "";
    var digits = phoneDigits(row.from_phone);
    return (
      '<div class="portal-pnlog-detail portal-pnlog-detail--in">' +
      '<p class="portal-pnlog-detail__meta"><strong>When:</strong> ' +
      esc(formatLondon(row.created_at)) +
      " · <strong>From:</strong> " +
      esc(row.contact_name || "Parent / carer") +
      (digits ? " · +" + esc(digits) : "") +
      "</p>" +
      '<p class="portal-pnlog-detail__meta"><strong>Channel:</strong> WhatsApp reply</p>' +
      (row.message_type && row.message_type !== "text"
        ? '<p class="portal-pnlog-detail__meta"><strong>Type:</strong> ' +
          esc(row.message_type) +
          "</p>"
        : "") +
      '<pre class="portal-pnlog-detail__body">' +
      esc(String(row.body_text || "")) +
      "</pre>" +
      '<p class="muted portal-pnlog-reply-hint">To reply, use <strong>Send now</strong> from Scheduling or Bookings with this parent’s WhatsApp number.</p>' +
      "</div>"
    );
  }

  function renderList(items) {
    var host = document.getElementById("portalParentNotifyLogList");
    var countEl = document.getElementById("portalParentNotifyLogCount");
    if (!host) return;
    var filtered = filterTimeline(items);
    if (countEl) {
      countEl.textContent =
        filtered.length +
        " message" +
        (filtered.length === 1 ? "" : "s") +
        (filtered.length !== items.length ? " (filtered from " + items.length + ")" : "") +
        " · newest first";
    }
    if (!filtered.length) {
      host.innerHTML =
        '<p class="muted portal-pnlog-empty">No messages match your filters. Outbound sends appear after <strong>Send now</strong>. Replies appear here once the Meta webhook is connected.</p>';
      return;
    }
    host.innerHTML = filtered
      .map(function (item, idx) {
        if (item.direction === "in") {
          var inRow = item.row;
          var inWho = esc(inRow.contact_name || "+" + phoneDigits(inRow.from_phone) || "Reply");
          var inSub = esc(bodyPreview(inRow.body_text));
          var inWhen = esc(formatLondon(inRow.created_at));
          var inChips =
            statusChip("reply", "whatsapp") +
            ' <span class="portal-pnlog-chip portal-pnlog-chip--muted">WhatsApp</span>';
          return (
            '<details class="portal-pnlog-row portal-pnlog-row--in" data-pnlog-idx="' +
            idx +
            '">' +
            '<summary class="portal-pnlog-row__head">' +
            '<span class="portal-pnlog-row__main">' +
            '<span class="portal-pnlog-row__who">' +
            inWho +
            "</span>" +
            '<span class="portal-pnlog-row__kind muted">Family reply</span>' +
            '<span class="portal-pnlog-row__preview muted">' +
            inSub +
            "</span>" +
            "</span>" +
            '<span class="portal-pnlog-row__side">' +
            '<span class="portal-pnlog-row__chips">' +
            inChips +
            "</span>" +
            '<span class="portal-pnlog-row__when muted">' +
            inWhen +
            "</span>" +
            "</span></summary>" +
            '<div class="portal-pnlog-row__body">' +
            renderInboundDetail(inRow) +
            "</div></details>"
          );
        }
        var row = item.row;
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
          '<details class="portal-pnlog-row portal-pnlog-row--out" data-pnlog-idx="' +
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
          renderOutboundDetail(row) +
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
      renderList(state.timeline);
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
      var outboundRes = await client
        .from("portal_parent_notify_log")
        .select(
          "id, created_at, sent_by_email, kind, channel, client_display, parent_name, parent_email, parent_phone, session_date, venue, subject, body_text, email_status, whatsapp_status, error_detail"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (outboundRes.error) throw outboundRes.error;

      var inbound = [];
      state.inboundAvailable = true;
      var inboundRes = await client
        .from("portal_parent_whatsapp_inbound")
        .select(
          "id, created_at, from_phone, contact_name, message_type, body_text, context_wa_id"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (inboundRes.error) {
        var msg = String(inboundRes.error.message || "").toLowerCase();
        if (msg.indexOf("portal_parent_whatsapp_inbound") >= 0 || msg.indexOf("does not exist") >= 0) {
          state.inboundAvailable = false;
        } else {
          throw inboundRes.error;
        }
      } else {
        inbound = inboundRes.data || [];
      }

      state.timeline = mergeTimeline(outboundRes.data || [], inbound);
      if (statusEl) {
        var note = state.timeline.length >= FETCH_LIMIT
          ? "Showing latest " + FETCH_LIMIT + " messages."
          : "";
        if (!state.inboundAvailable) {
          note = (note ? note + " " : "") +
            "Inbound replies not available yet — apply DB migration and connect Meta webhook.";
        }
        statusEl.textContent = note;
        statusEl.className = "portal-forms-status";
      }
      renderList(state.timeline);
    } catch (e) {
      console.error("[parent-notify-log]", e);
      state.timeline = [];
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
      '<p class="page-intro">Outbound <strong>Send now</strong> from Scheduling, Bookings, or Ops — plus inbound <strong>WhatsApp replies</strong> to the API number. Read replies here; respond with <strong>Send now</strong> on the same parent number.</p>' +
      '<div class="portal-pnlog-toolbar">' +
      '<input type="search" id="portalParentNotifyLogSearch" class="inp portal-pnlog-toolbar__search" placeholder="Search participant, phone, text…" autocomplete="off" />' +
      '<select id="portalParentNotifyLogChannel" class="sel portal-pnlog-toolbar__sel" aria-label="Channel filter">' +
      '<option value="all">All channels</option>' +
      '<option value="whatsapp">WhatsApp</option>' +
      '<option value="email">Email</option>' +
      '<option value="both">Both</option>' +
      "</select>" +
      '<select id="portalParentNotifyLogOutcome" class="sel portal-pnlog-toolbar__sel" aria-label="Outcome filter">' +
      '<option value="all">All</option>' +
      '<option value="sent">Sent OK</option>' +
      '<option value="failed">Failed</option>' +
      '<option value="replies">Replies only</option>' +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentNotifyLogRefresh">Refresh</button>' +
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
