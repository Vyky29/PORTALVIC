/**
 * Admin — Family messages: WhatsApp API threads (list + chat pane).
 * Outbound log + inbound WhatsApp replies. Email is not shown here.
 */
(function (global) {
  "use strict";

  var FETCH_LIMIT = 200;
  var MEDIA_BUCKET = "wa-inbound-media";
  var MEDIA_SIGNED_TTL = 3600;
  var signedMediaCache = Object.create(null);

  async function resolveMediaSignedUrls(client, rows) {
    if (!client || !client.storage || !rows || !rows.length) return;
    var now = Date.now();
    var need = [];
    rows.forEach(function (r) {
      var path = r && r.media_path ? String(r.media_path) : "";
      if (!path) return;
      var cached = signedMediaCache[path];
      if (cached && cached.exp - now > 300000) {
        r.media_url = cached.url;
      } else if (need.indexOf(path) < 0) {
        need.push(path);
      }
    });
    if (need.length) {
      try {
        var res = await client.storage.from(MEDIA_BUCKET).createSignedUrls(need, MEDIA_SIGNED_TTL);
        if (res && res.data) {
          res.data.forEach(function (item) {
            if (item && item.path && item.signedUrl && !item.error) {
              signedMediaCache[item.path] = {
                url: item.signedUrl,
                exp: now + MEDIA_SIGNED_TTL * 1000,
              };
            }
          });
        }
      } catch (_e) {}
    }
    rows.forEach(function (r) {
      var path = r && r.media_path ? String(r.media_path) : "";
      if (path && signedMediaCache[path]) r.media_url = signedMediaCache[path].url;
    });
  }

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    toast: function () {},
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    openModal: null,
    closeModal: null,
  };

  var state = {
    timeline: [],
    threads: [],
    inboundAvailable: true,
    loading: false,
    query: "",
    outcome: "all",
    pollTimer: null,
    realtimeChannel: null,
    selectedKey: "",
    draftByKey: Object.create(null),
    sending: false,
    mobileShowThread: false,
    stickToBottom: true,
  };

  var SEEN_STORE_KEY = "portal_pnlog_seen_v1";

  function readSeenMap() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(SEEN_STORE_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : {};
    } catch (_e) {
      return {};
    }
  }

  function markThreadSeen(key, iso) {
    if (!key) return;
    try {
      var map = readSeenMap();
      var prev = map[key] || "";
      var next = String(iso || "");
      if (!next || next > prev) {
        map[key] = next || prev || new Date().toISOString();
        if (global.localStorage) {
          global.localStorage.setItem(SEEN_STORE_KEY, JSON.stringify(map));
        }
        try {
          global.dispatchEvent(new CustomEvent("portal:family-msg-seen"));
        } catch (_ev) {}
      }
    } catch (_e) {}
  }

  function isThreadUnread(t) {
    if (!t || t.channel !== "whatsapp" || !t.hasInbound || !t.lastInboundAt) return false;
    var seen = readSeenMap()[t.key] || "";
    return String(t.lastInboundAt) > seen;
  }

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
    if (options.toast) cfg.toast = options.toast;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.openModal) cfg.openModal = options.openModal;
    if (options.closeModal) cfg.closeModal = options.closeModal;
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

  function formatLondonShort(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      var now = new Date();
      var sameDay =
        d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) ===
        now.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
      if (sameDay) {
        return d.toLocaleTimeString("en-GB", {
          timeZone: "Europe/London",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return d.toLocaleDateString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function phoneDigits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function statusChip(status, channel) {
    var s = String(status || "").toLowerCase();
    var label = s;
    if (s === "sent" || s === "sent_sms") label = s === "sent_sms" ? "SMS sent" : "Sent";
    else if (s === "delivered") label = "Delivered ✓✓";
    else if (s === "read") label = "Read ✓✓";
    else if (s === "failed") label = "Failed";
    else if (s === "skipped") label = "Skipped";
    else if (s === "pending") label = "Pending";
    else if (s === "reply") label = "Reply";
    else label = s || "—";
    var cls = "portal-pnlog-chip";
    if (s === "read") cls += " portal-pnlog-chip--read";
    else if (s === "delivered") cls += " portal-pnlog-chip--in";
    else if (s === "sent" || s === "sent_sms") cls += " portal-pnlog-chip--ok";
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

  function bodyPreview(text) {
    var t = String(text || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (t.length <= 90) return t;
    return t.slice(0, 87) + "…";
  }

  function threadContextForPhone(phone) {
    var digits = phoneDigits(phone);
    var ctx = {
      parentName: "",
      parentWhatsapp: digits,
      clientDisplay: "",
      sessionDate: "",
      venue: "",
    };
    if (!digits) return ctx;
    (state.timeline || []).forEach(function (item) {
      if (item.direction !== "out") return;
      var row = item.row;
      if (phoneDigits(row.parent_phone) !== digits) return;
      if (row.client_display && !ctx.clientDisplay) ctx.clientDisplay = String(row.client_display).trim();
      if (row.parent_name && !ctx.parentName) ctx.parentName = String(row.parent_name).trim();
      if (row.session_date && !ctx.sessionDate) ctx.sessionDate = String(row.session_date).trim();
      if (row.venue && !ctx.venue) ctx.venue = String(row.venue).trim();
    });
    return ctx;
  }

  function replySubject(clientDisplay, parentName) {
    var label = String(clientDisplay || parentName || "Family").trim();
    return "Message · " + (label || "Family");
  }

  function ensureParentNotifySendConfigured() {
    if (!global.PortalParentNotifySend) return false;
    global.PortalParentNotifySend.configure({
      esc: cfg.esc,
      toast: cfg.toast,
      getClient: cfg.getClient,
      getSupabaseUrl: cfg.getSupabaseUrl,
      getAnonKey: cfg.getAnonKey,
    });
    return true;
  }

  function formatSendError(err, data) {
    if (global.PortalParentNotifySend && typeof global.PortalParentNotifySend.formatNotifyError === "function") {
      return global.PortalParentNotifySend.formatNotifyError(err, data);
    }
    return String(err || "send_failed").replace(/_/g, " ");
  }

  /** WhatsApp threads only (email stays in DB / other screens). */
  function buildWhatsAppThreads(items) {
    var wa = {};
    function waThread(key) {
      if (!wa[key]) {
        wa[key] = {
          key: key,
          channel: "whatsapp",
          name: "",
          client: "",
          phone: key,
          events: [],
          lastAt: "",
          hasInbound: false,
          hasFailed: false,
          hasSent: false,
          lastInboundId: "",
          lastInboundAt: "",
          lastInboundWaId: "",
        };
      }
      return wa[key];
    }
    (items || []).forEach(function (item) {
      var row = item.row;
      if (item.direction === "in") {
        var pkey = phoneDigits(row.from_phone);
        if (!pkey) return;
        var t = waThread(pkey);
        var meta = row.meta && typeof row.meta === "object" ? row.meta : {};
        var fromApp =
          meta.source === "parent_portal" ||
          String(row.wa_message_id || "").indexOf("app:") === 0;
        t.events.push({
          dir: "in",
          when: row.created_at,
          body: row.body_text,
          channel: "whatsapp",
          fromApp: fromApp,
          inboundId: row.id,
          row: row,
          messageType: String(row.message_type || "").toLowerCase(),
          mediaUrl: row.media_url || "",
          mediaMime: String(row.media_mime || ""),
        });
        t.hasInbound = true;
        t.lastInboundId = String(row.id || "");
        t.lastInboundWaId = String(row.wa_message_id || row.context_wa_id || "").trim();
        var inAt = String(row.created_at || "");
        if (inAt > t.lastInboundAt) t.lastInboundAt = inAt;
        if (row.contact_name && !t.name) t.name = String(row.contact_name).trim();
        return;
      }
      var ch = String(row.channel || "").toLowerCase();
      if (ch !== "whatsapp" && ch !== "both") return;
      var wkey = phoneDigits(row.parent_phone);
      if (!wkey) return;
      var wt = waThread(wkey);
      wt.events.push({
        dir: "out",
        when: row.created_at,
        body: row.body_text,
        kind: row.kind,
        subject: row.subject,
        sentBy: row.sent_by_email,
        status: row.whatsapp_status,
        channel: "whatsapp",
        row: row,
      });
      if (!wt.name) wt.name = String(row.parent_name || row.client_display || "").trim();
      if (row.client_display && !wt.client) wt.client = String(row.client_display).trim();
      if (String(row.whatsapp_status || "").toLowerCase() === "failed") wt.hasFailed = true;
      else wt.hasSent = true;
    });
    return Object.keys(wa)
      .map(function (k) {
        var t = wa[k];
        t.events.sort(function (a, b) {
          return String(a.when || "").localeCompare(String(b.when || ""));
        });
        t.lastAt = t.events.length ? t.events[t.events.length - 1].when : "";
        if (!t.name) t.name = "+" + t.phone;
        return t;
      })
      .sort(function (a, b) {
        return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
      });
  }

  function threadMatches(t) {
    var q = String(state.query || "").trim().toLowerCase();
    var outcome = String(state.outcome || "all").toLowerCase();
    if (outcome === "replies" && !t.hasInbound) return false;
    if (outcome === "failed" && !t.hasFailed) return false;
    if (outcome === "sent" && !t.hasSent) return false;
    if (outcome === "unread" && !isThreadUnread(t)) return false;
    if (!q) return true;
    var parts = [t.name, t.phone, t.client];
    t.events.forEach(function (e) {
      parts.push(e.body || "");
      parts.push(e.subject || "");
      parts.push(e.sentBy || "");
    });
    return parts.join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function findThread(key) {
    var want = String(key || "");
    for (var i = 0; i < (state.threads || []).length; i++) {
      if (state.threads[i].key === want) return state.threads[i];
    }
    return null;
  }

  function renderMedia(ev) {
    if (!ev || !ev.mediaUrl) return "";
    var url = esc(ev.mediaUrl);
    var mime = String(ev.mediaMime || "").toLowerCase();
    if (mime.indexOf("image") === 0) {
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener"><img class="portal-pnlog-bubble__img" src="' +
        url +
        '" alt="' +
        esc(ev.messageType || "image") +
        '" loading="lazy" /></a>'
      );
    }
    if (mime.indexOf("video") === 0) {
      return '<video class="portal-pnlog-bubble__img" src="' + url + '" controls playsinline></video>';
    }
    if (mime.indexOf("audio") === 0) {
      return '<audio class="portal-pnlog-bubble__audio" src="' + url + '" controls></audio>';
    }
    return (
      '<a class="portal-pnlog-bubble__file" href="' +
      url +
      '" target="_blank" rel="noopener">Open attachment</a>'
    );
  }

  function renderBubble(ev) {
    var side = ev.dir === "in" ? "in" : "out";
    var metaBits = [];
    if (ev.dir === "out") {
      if (ev.kind) metaBits.push(esc(kindLabel(ev.kind)));
      metaBits.push(statusChip(ev.status, ev.channel));
      if (ev.sentBy) metaBits.push(esc(ev.sentBy));
    } else if (ev.fromApp) {
      metaBits.push('<span class="portal-pnlog-chip portal-pnlog-chip--muted">Parent app</span>');
    }
    metaBits.push('<span class="portal-pnlog-bubble__time">' + esc(formatLondon(ev.when)) + "</span>");
    var mediaHtml = ev.dir === "in" ? renderMedia(ev) : "";
    var bodyStr = String(ev.body || "");
    var isReaction = ev.messageType === "reaction";
    var isMediaPlaceholder =
      ev.mediaUrl && /^\[(sticker|image|video|audio|document)\]$/i.test(bodyStr.trim());
    var contentHtml = "";
    if (isReaction) {
      contentHtml = '<div class="portal-pnlog-bubble__reaction">' + esc(bodyStr) + "</div>";
    } else if (bodyStr && !isMediaPlaceholder) {
      contentHtml = '<div class="portal-pnlog-bubble__text">' + esc(bodyStr) + "</div>";
    }
    return (
      '<div class="portal-pnlog-bubble portal-pnlog-bubble--' +
      side +
      '">' +
      mediaHtml +
      contentHtml +
      '<div class="portal-pnlog-bubble__meta">' +
      metaBits.join(" ") +
      "</div></div>"
    );
  }

  function captureComposerDraft() {
    var ta = document.getElementById("portalPnlogComposerInput");
    if (!ta || !state.selectedKey) return;
    state.draftByKey[state.selectedKey] = ta.value;
  }

  function isNearBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scrollThreadToBottom(force) {
    var el = document.getElementById("portalPnlogThreadScroll");
    if (!el) return;
    if (!force && !state.stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }

  function selectThread(key, opts) {
    opts = opts || {};
    captureComposerDraft();
    var next = String(key || "");
    state.selectedKey = next;
    if (next) {
      state.mobileShowThread = true;
      var t = findThread(next);
      if (t) markThreadSeen(next, t.lastInboundAt || "");
      state.stickToBottom = true;
    } else {
      state.mobileShowThread = false;
    }
    renderChat(opts.fromRefresh);
    if (next) {
      global.requestAnimationFrame(function () {
        scrollThreadToBottom(true);
        var ta = document.getElementById("portalPnlogComposerInput");
        if (ta && !opts.fromRefresh) {
          try {
            ta.focus();
          } catch (_f) {}
        }
      });
    }
  }

  function renderConvListItem(t) {
    var unread = isThreadUnread(t);
    var sel = t.key === state.selectedKey ? " is-selected" : "";
    var sub = t.events.length ? bodyPreview(t.events[t.events.length - 1].body) : "";
    var subline = "+" + t.phone + (t.client ? " · " + t.client : "");
    return (
      '<button type="button" class="portal-pnlog-conv' +
      sel +
      (unread ? " portal-pnlog-conv--unread" : "") +
      '" data-thread-key="' +
      esc(t.key) +
      '">' +
      '<span class="portal-pnlog-conv__top">' +
      '<span class="portal-pnlog-conv__who">' +
      esc(t.name) +
      "</span>" +
      '<span class="portal-pnlog-conv__when muted">' +
      esc(formatLondonShort(t.lastAt)) +
      "</span></span>" +
      '<span class="portal-pnlog-conv__sub muted">' +
      esc(subline) +
      "</span>" +
      '<span class="portal-pnlog-conv__preview muted">' +
      esc(sub) +
      "</span>" +
      (unread ? '<span class="portal-pnlog-chip portal-pnlog-chip--unread">Unread</span>' : "") +
      "</button>"
    );
  }

  function renderPaneEmpty() {
    return (
      '<div class="portal-pnlog-pane-empty">' +
      "<p><strong>Select a conversation</strong></p>" +
      '<p class="muted">WhatsApp threads with families appear on the left. Replies send via the Business API number.</p>' +
      "</div>"
    );
  }

  function renderComposer(t) {
    if (!t || !t.phone) {
      return (
        '<div class="portal-pnlog-composer portal-pnlog-composer--disabled">' +
        '<p class="muted" style="margin:0">No WhatsApp number for this thread.</p></div>'
      );
    }
    var draft = state.draftByKey[t.key] != null ? state.draftByKey[t.key] : "";
    var disabled = state.sending ? " disabled" : "";
    return (
      '<div class="portal-pnlog-composer">' +
      '<textarea id="portalPnlogComposerInput" class="portal-pnlog-composer__input" rows="2" placeholder="Type a WhatsApp reply…" maxlength="4000"' +
      disabled +
      ">" +
      esc(draft) +
      "</textarea>" +
      '<div class="portal-pnlog-composer__bar">' +
      '<p id="portalPnlogComposerStatus" class="portal-pnlog-composer__status muted" role="status"></p>' +
      '<button type="button" class="btn btn--pri portal-pnlog-composer__send" id="portalPnlogComposerSend" style="background:#15803d;border-color:#15803d"' +
      disabled +
      ">" +
      (state.sending ? "Sending…" : "Send") +
      "</button></div></div>"
    );
  }

  function renderThreadPane(t) {
    if (!t) return renderPaneEmpty();
    var subline = "+" + t.phone + (t.client ? " · " + t.client : "");
    return (
      '<div class="portal-pnlog-pane-head">' +
      '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-pane-back" id="portalPnlogBack">← Back</button>' +
      '<div class="portal-pnlog-pane-head__text">' +
      '<div class="portal-pnlog-pane-head__who">' +
      esc(t.name) +
      "</div>" +
      '<div class="portal-pnlog-pane-head__sub muted">' +
      esc(subline) +
      "</div></div></div>" +
      '<div class="portal-pnlog-thread-scroll" id="portalPnlogThreadScroll">' +
      '<div class="portal-pnlog-thread">' +
      (t.events.length
        ? t.events.map(renderBubble).join("")
        : '<p class="muted portal-pnlog-empty">No messages in this thread yet.</p>') +
      "</div></div>" +
      renderComposer(t)
    );
  }

  function renderChat(fromRefresh) {
    var host = document.getElementById("portalParentNotifyLogList");
    var countEl = document.getElementById("portalParentNotifyLogCount");
    if (!host) return;

    var prevScroll = document.getElementById("portalPnlogThreadScroll");
    if (fromRefresh && prevScroll) {
      state.stickToBottom = isNearBottom(prevScroll);
    }
    if (!fromRefresh) captureComposerDraft();

    var threads = (state.threads || []).filter(threadMatches);
    var unreadCount = 0;
    threads.forEach(function (t) {
      if (isThreadUnread(t)) unreadCount += 1;
    });

    if (countEl) {
      countEl.textContent =
        threads.length +
        " WhatsApp conversation" +
        (threads.length === 1 ? "" : "s") +
        (unreadCount ? " · " + unreadCount + " unread" : "") +
        " · newest first";
      countEl.classList.toggle("portal-pnlog-count--has-unread", unreadCount > 0);
    }

    if (state.selectedKey && !findThread(state.selectedKey)) {
      // Keep selection if filtered out of list but still in full threads.
      var still = null;
      for (var i = 0; i < (state.threads || []).length; i++) {
        if (state.threads[i].key === state.selectedKey) {
          still = state.threads[i];
          break;
        }
      }
      if (!still) {
        state.selectedKey = "";
        state.mobileShowThread = false;
      }
    }

    var selected = state.selectedKey ? findThread(state.selectedKey) : null;
    var listHtml = threads.length
      ? threads.map(renderConvListItem).join("")
      : '<p class="muted portal-pnlog-empty">No WhatsApp conversations match your filters. Outbound sends and inbound replies to the API number appear here.</p>';

    var shellCls =
      "portal-pnlog-chat" +
      (state.mobileShowThread && state.selectedKey ? " portal-pnlog-chat--thread" : "");

    host.innerHTML =
      '<div class="' +
      shellCls +
      '">' +
      '<aside class="portal-pnlog-chat__list" aria-label="Conversations">' +
      '<div class="portal-pnlog-chat__list-inner">' +
      listHtml +
      "</div></aside>" +
      '<section class="portal-pnlog-chat__pane" aria-label="Thread">' +
      renderThreadPane(selected) +
      "</section></div>";

    bindChatInteractions();
    if (selected) {
      global.requestAnimationFrame(function () {
        scrollThreadToBottom(!!fromRefresh ? state.stickToBottom : true);
      });
    }
  }

  function sendComposerReply() {
    if (state.sending) return;
    var t = findThread(state.selectedKey);
    if (!t || !t.phone) return;
    var ta = document.getElementById("portalPnlogComposerInput");
    var statusEl = document.getElementById("portalPnlogComposerStatus");
    var btn = document.getElementById("portalPnlogComposerSend");
    var msgBody = ta ? String(ta.value || "").trim() : "";
    if (!msgBody) {
      if (statusEl) statusEl.textContent = "Message is empty.";
      return;
    }
    if (!ensureParentNotifySendConfigured()) {
      if (statusEl) statusEl.textContent = "Send module not loaded — refresh the page.";
      return;
    }
    var ctx = threadContextForPhone(t.phone);
    var contextWaId = "";
    if (t.lastInboundId) {
      for (var i = t.events.length - 1; i >= 0; i--) {
        if (t.events[i].dir === "in" && t.events[i].row) {
          contextWaId = String(
            t.events[i].row.wa_message_id || t.events[i].row.context_wa_id || ""
          ).trim();
          break;
        }
      }
    }
    state.sending = true;
    state.draftByKey[t.key] = msgBody;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending…";
    }
    if (ta) ta.disabled = true;
    if (statusEl) statusEl.textContent = "";

    void global.PortalParentNotifySend.send({
      kind: "custom",
      channel: "whatsapp",
      parentName: ctx.parentName || t.name || "",
      parentWhatsapp: t.phone,
      subject: replySubject(ctx.clientDisplay || t.client, ctx.parentName || t.name),
      body: msgBody,
      clientDisplay: ctx.clientDisplay || t.client || null,
      sessionDate: ctx.sessionDate || null,
      venue: ctx.venue || null,
      contextWaId: contextWaId || null,
    })
      .then(function (res) {
        state.sending = false;
        if (!res || !res.ok) {
          var err = formatSendError(res && res.error, res && res.data);
          if (statusEl) statusEl.textContent = err;
          else cfg.toast(err, "err");
          renderChat(true);
          return;
        }
        state.draftByKey[t.key] = "";
        var msg =
          global.PortalParentNotifySend && typeof global.PortalParentNotifySend.formatSendResult === "function"
            ? global.PortalParentNotifySend.formatSendResult(res.data)
            : "Sent.";
        cfg.toast(msg, "ok");
        state.stickToBottom = true;
        void loadRows(true);
      })
      .catch(function () {
        state.sending = false;
        if (statusEl) statusEl.textContent = "Send failed — check your connection.";
        else cfg.toast("Send failed", "err");
        renderChat(true);
      });
  }

  function bindChatInteractions() {
    var host = document.getElementById("portalParentNotifyLogList");
    if (!host || host.getAttribute("data-chat-bound") === "1") return;
    host.setAttribute("data-chat-bound", "1");

    host.addEventListener("click", function (e) {
      var back = e.target.closest("#portalPnlogBack");
      if (back) {
        e.preventDefault();
        state.mobileShowThread = false;
        captureComposerDraft();
        renderChat(false);
        return;
      }
      var sendBtn = e.target.closest("#portalPnlogComposerSend");
      if (sendBtn) {
        e.preventDefault();
        sendComposerReply();
        return;
      }
      var conv = e.target.closest(".portal-pnlog-conv[data-thread-key]");
      if (conv) {
        e.preventDefault();
        selectThread(conv.getAttribute("data-thread-key") || "");
      }
    });

    host.addEventListener("input", function (e) {
      if (e.target && e.target.id === "portalPnlogComposerInput" && state.selectedKey) {
        state.draftByKey[state.selectedKey] = e.target.value;
        var statusEl = document.getElementById("portalPnlogComposerStatus");
        if (statusEl) statusEl.textContent = "";
      }
    });

    host.addEventListener("keydown", function (e) {
      if (!e.target || e.target.id !== "portalPnlogComposerInput") return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendComposerReply();
      }
    });

    host.addEventListener(
      "scroll",
      function (e) {
        if (e.target && e.target.id === "portalPnlogThreadScroll") {
          state.stickToBottom = isNearBottom(e.target);
        }
      },
      true
    );
  }

  function bindFilters() {
    var search = document.getElementById("portalParentNotifyLogSearch");
    var outcome = document.getElementById("portalParentNotifyLogOutcome");
    var refresh = document.getElementById("portalParentNotifyLogRefresh");
    function apply() {
      captureComposerDraft();
      state.query = search ? search.value : "";
      state.outcome = outcome ? outcome.value : "all";
      renderChat(false);
    }
    if (search && !search.getAttribute("data-bound")) {
      search.setAttribute("data-bound", "1");
      search.addEventListener("input", apply);
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
    if (statusEl && !force) {
      statusEl.textContent = "Loading…";
      statusEl.className = "portal-forms-status";
    }
    try {
      var outboundRes = await client
        .from("portal_parent_notify_log")
        .select(
          "id, created_at, sent_by_email, kind, channel, client_display, parent_name, parent_email, parent_phone, session_date, venue, subject, body_text, email_status, whatsapp_status, whatsapp_delivered_at, whatsapp_read_at, error_detail"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (outboundRes.error) throw outboundRes.error;

      var inbound = [];
      state.inboundAvailable = true;
      var inboundRes = await client
        .from("portal_parent_whatsapp_inbound")
        .select(
          "id, created_at, from_phone, contact_name, message_type, body_text, context_wa_id, wa_message_id, media_url, media_path, media_mime, meta"
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
        await resolveMediaSignedUrls(client, inbound);
      }

      state.timeline = mergeTimeline(outboundRes.data || [], inbound);
      state.threads = buildWhatsAppThreads(state.timeline);
      if (statusEl) {
        var note = state.timeline.length >= FETCH_LIMIT ? "Showing latest " + FETCH_LIMIT + " messages." : "";
        if (!state.inboundAvailable) {
          note =
            (note ? note + " " : "") +
            "Inbound replies not available yet — apply DB migration and connect Meta webhook.";
        }
        statusEl.textContent = note;
        statusEl.className = "portal-forms-status";
      }
      renderChat(true);
    } catch (e) {
      console.error("[parent-notify-log]", e);
      state.timeline = [];
      state.threads = [];
      if (statusEl) {
        statusEl.textContent =
          (e && e.message) || "Could not load messages — check you are signed in as admin.";
        statusEl.className = "portal-forms-status is-error";
      }
      if (listEl) {
        listEl.innerHTML = '<p class="muted portal-pnlog-empty">Could not load the message log.</p>';
      }
    } finally {
      state.loading = false;
    }
  }

  function viewHtml() {
    return (
      '<div id="portalParentNotifyLogRoot" class="portal-day-ops-embed portal-pnlog-root">' +
      '<h1 class="page-title">Family messages</h1>' +
      '<p class="page-intro">WhatsApp conversations via the Business API — pick a family on the left, read the thread, and reply in the box below (no email on this screen). Delivery ticks: Sent → Delivered → Read. Refreshes every 15s.</p>' +
      '<div class="portal-pnlog-toolbar">' +
      '<input type="search" id="portalParentNotifyLogSearch" class="inp portal-pnlog-toolbar__search" placeholder="Search participant, phone, text…" autocomplete="off" />' +
      '<select id="portalParentNotifyLogOutcome" class="sel portal-pnlog-toolbar__sel" aria-label="Filter">' +
      '<option value="all">All</option>' +
      '<option value="unread">Unread</option>' +
      '<option value="replies">Has replies</option>' +
      '<option value="sent">Sent OK</option>' +
      '<option value="failed">Failed</option>' +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentNotifyLogRefresh">Refresh</button>' +
      "</div>" +
      '<div id="portalParentNotifyLogStatus" class="portal-forms-status" role="status"></div>' +
      '<p id="portalParentNotifyLogCount" class="muted portal-pnlog-count"></p>' +
      '<div id="portalParentNotifyLogList" class="portal-pnlog-list"></div>' +
      "</div>"
    );
  }

  function stopInboundLiveRefresh() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.realtimeChannel) {
      try {
        var client = cfg.getClient();
        if (client && typeof client.removeChannel === "function") {
          void client.removeChannel(state.realtimeChannel);
        }
      } catch (_rt) {}
      state.realtimeChannel = null;
    }
  }

  function startInboundLiveRefresh() {
    stopInboundLiveRefresh();
    state.pollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      void loadRows(true);
    }, 15000);
    var client = cfg.getClient();
    if (!client || typeof client.channel !== "function") return;
    try {
      state.realtimeChannel = client
        .channel("portal_parent_whatsapp_inbound_admin")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "portal_parent_whatsapp_inbound" },
          function () {
            void loadRows(true);
          }
        )
        .subscribe();
    } catch (_sub) {}
    if (!document.__portalParentNotifyLogVisBound) {
      document.__portalParentNotifyLogVisBound = true;
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") void loadRows(true);
      });
    }
  }

  function bindModule() {
    var root = document.getElementById("portalParentNotifyLogRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    bindFilters();
    startInboundLiveRefresh();
    void loadRows(false);
  }

  async function fetchUnreadCount(client) {
    client = client || (cfg.getClient && cfg.getClient());
    if (!client || typeof client.from !== "function") return 0;
    try {
      var res = await client
        .from("portal_parent_whatsapp_inbound")
        .select("id, from_phone, created_at")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (res.error) return 0;
      var lastByPhone = {};
      (res.data || []).forEach(function (r) {
        var pk = phoneDigits(r && r.from_phone);
        if (!pk) return;
        var at = String((r && r.created_at) || "");
        if (!lastByPhone[pk] || at > lastByPhone[pk]) lastByPhone[pk] = at;
      });
      var seen = readSeenMap();
      var n = 0;
      Object.keys(lastByPhone).forEach(function (pk) {
        if (String(lastByPhone[pk]) > String(seen[pk] || "")) n += 1;
      });
      return n;
    } catch (_e) {
      return 0;
    }
  }

  global.PortalParentNotifyLog = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    unreadCount: fetchUnreadCount,
    refresh: function () {
      return loadRows(true);
    },
    stopLiveRefresh: stopInboundLiveRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
