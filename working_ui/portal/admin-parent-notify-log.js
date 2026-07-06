/**
 * Admin — parent/carer messages: outbound log + inbound WhatsApp replies (V3).
 */
(function (global) {
  "use strict";

  var FETCH_LIMIT = 200;
  var MEDIA_BUCKET = "wa-inbound-media";
  var MEDIA_SIGNED_TTL = 3600;
  var signedMediaCache = Object.create(null);

  // The media bucket is private: mint short-lived signed URLs for the admin's
  // authenticated session (RLS lets portal admins read the objects). Cache by
  // path so the 15s auto-refresh does not re-sign and flicker every image.
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
      } catch (_e) {
        // Media just won't render this cycle; text/placeholder still shows.
      }
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
    inboundAvailable: true,
    loading: false,
    query: "",
    channel: "all",
    outcome: "all",
    pollTimer: null,
    realtimeChannel: null,
    openKeys: Object.create(null),
  };

  // Admin-side read tracking (no DB column): remember, per WhatsApp thread, the
  // timestamp of the latest inbound the admin has already opened. A thread is
  // "unread" while its newest reply is more recent than what was last seen.
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
      }
    } catch (_e) {
      // localStorage unavailable — unread flag just won't persist.
    }
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
    if (t.length <= 120) return t;
    return t.slice(0, 117) + "…";
  }

  function threadContextForPhone(phone) {
    var digits = phoneDigits(phone);
    var ctx = {
      parentName: "",
      parentWhatsapp: digits,
      parentEmail: "",
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
      if (row.parent_email && !ctx.parentEmail) ctx.parentEmail = String(row.parent_email).trim();
      if (row.session_date && !ctx.sessionDate) ctx.sessionDate = String(row.session_date).trim();
      if (row.venue && !ctx.venue) ctx.venue = String(row.venue).trim();
    });
    return ctx;
  }

  function replySubject(clientDisplay, parentName) {
    var label = String(clientDisplay || parentName || "Family").trim();
    return "Message · " + (label || "Family");
  }

  function replyDraftBody(parentName, inboundText) {
    var greet = String(parentName || "").trim();
    var head = greet ? "Hi " + greet + ",\n\n" : "Hi,\n\n";
    var quote = String(inboundText || "").trim();
    var quoteBlock = quote
      ? "\n\n(Re their message: “" + quote.replace(/[\r\n\t]+/g, " ").slice(0, 280) + "”)\n\n"
      : "\n\n";
    return head + "This is ClubSENsational." + quoteBlock + "\n\nThank you,\nClubSENsational";
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

  function openReplyModal(inRow) {
    if (!inRow) return;
    if (typeof cfg.openModal !== "function" || typeof cfg.closeModal !== "function") {
      cfg.toast("Reply unavailable — refresh the page.", "err");
      return;
    }
    if (!ensureParentNotifySendConfigured()) {
      cfg.toast("Send module not loaded — refresh the page.", "err");
      return;
    }
    var ctx = threadContextForPhone(inRow.from_phone);
    if (inRow.contact_name && !ctx.parentName) ctx.parentName = String(inRow.contact_name).trim();
    var subj = replySubject(ctx.clientDisplay, ctx.parentName);
    var body = replyDraftBody(ctx.parentName, inRow.body_text);
    var defaultChannel = ctx.parentEmail ? "whatsapp" : "whatsapp";

    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Reply to parent</h2></div><div class="modal-b">' +
        '<p class="muted" style="margin-top:0;min-width:0;overflow-wrap:anywhere">Send via the portal WhatsApp API — same thread as this family reply. Logged in Family messages.</p>' +
        '<div class="grid-2" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px">' +
        '<div><label class="muted" for="pnlogParentName">Parent / carer name</label><input id="pnlogParentName" class="inp" style="max-width:100%" value="' +
        esc(ctx.parentName) +
        '" /></div>' +
        (ctx.clientDisplay
          ? '<div><label class="muted">Participant</label><p class="muted" style="margin:6px 0 0;overflow-wrap:anywhere">' +
            esc(ctx.clientDisplay) +
            "</p></div>"
          : "") +
        '<div style="grid-column:1/-1"><label class="muted" for="pnlogParentWa">WhatsApp (digits, incl. country code)</label><input id="pnlogParentWa" class="inp" style="max-width:100%" value="' +
        esc(ctx.parentWhatsapp) +
        '" autocomplete="off" /></div>' +
        (ctx.parentEmail
          ? '<div style="grid-column:1/-1"><label class="muted" for="pnlogParentEmail">Email (optional)</label><input id="pnlogParentEmail" class="inp" type="email" style="max-width:100%" value="' +
            esc(ctx.parentEmail) +
            '" autocomplete="off" /></div>'
          : "") +
        "</div>" +
        '<fieldset style="margin:12px 0 0;padding:0;border:0;min-width:0"><legend class="muted" style="margin-bottom:6px">Send channel</legend>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;min-width:0">' +
        '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="pnlogChannel" value="whatsapp"' +
        (defaultChannel === "whatsapp" ? " checked" : "") +
        ' /> <span>WhatsApp</span></label>' +
        (ctx.parentEmail
          ? '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="pnlogChannel" value="email" /> <span>Email</span></label>' +
            '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="pnlogChannel" value="both" /> <span>Both</span></label>'
          : "") +
        "</div></fieldset>" +
        '<label class="muted" for="pnlogBody" style="display:block;margin-top:12px">Message</label>' +
        '<textarea class="txa" id="pnlogBody" style="min-height:200px;max-width:100%">' +
        esc(body) +
        "</textarea>" +
        '<p class="muted" id="pnlogSendStatus" style="margin:8px 0 0;min-width:0;overflow-wrap:anywhere;display:none" role="status"></p>' +
        "</div>" +
        '<div class="modal-f" style="flex-wrap:wrap;gap:8px">' +
        '<button type="button" class="btn btn--ghost" id="pnlogClose">Close</button>' +
        '<button type="button" class="btn btn--pri" id="pnlogSend" style="background:#15803d;border-color:#15803d">Send now</button>' +
        "</div>"
    );

    function $(id) {
      return document.getElementById(id);
    }
    function selectedChannel() {
      var r = document.querySelector('input[name="pnlogChannel"]:checked');
      return r && r.value ? String(r.value) : "whatsapp";
    }
    function updateSendButton() {
      var ch = selectedChannel();
      var wa = phoneDigits(($("pnlogParentWa") && $("pnlogParentWa").value) || "");
      var em = (($("pnlogParentEmail") && $("pnlogParentEmail").value) || "").trim();
      var btn = $("pnlogSend");
      if (!btn) return;
      var needEm = ch === "email" || ch === "both";
      var needWa = ch === "whatsapp" || ch === "both";
      btn.disabled = !((!needEm || em) && (!needWa || wa));
    }
    $("pnlogClose").onclick = function () {
      cfg.closeModal();
    };
    ["pnlogBody", "pnlogParentWa", "pnlogParentEmail", "pnlogParentName"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", updateSendButton);
    });
    document.querySelectorAll('input[name="pnlogChannel"]').forEach(function (el) {
      el.addEventListener("change", updateSendButton);
    });
    updateSendButton();
    $("pnlogSend").onclick = function () {
      var ch = selectedChannel();
      var msgBody = (($("pnlogBody") && $("pnlogBody").value) || "").trim();
      var em = (($("pnlogParentEmail") && $("pnlogParentEmail").value) || "").trim();
      var wa = phoneDigits(($("pnlogParentWa") && $("pnlogParentWa").value) || "");
      if (!msgBody) {
        cfg.toast("Message is empty", "err");
        return;
      }
      if ((ch === "email" || ch === "both") && !em) {
        cfg.toast("Enter an email address", "err");
        return;
      }
      if ((ch === "whatsapp" || ch === "both") && !wa) {
        cfg.toast("Enter a WhatsApp number", "err");
        return;
      }
      var btn = $("pnlogSend");
      var statusEl = $("pnlogSendStatus");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending…";
      }
      if (statusEl) {
        statusEl.style.display = "none";
        statusEl.textContent = "";
      }
      void global.PortalParentNotifySend.send({
        kind: "custom",
        channel: ch,
        parentName: (($("pnlogParentName") && $("pnlogParentName").value) || "").trim(),
        parentEmail: em,
        parentWhatsapp: wa,
        subject: subj,
        body: msgBody,
        clientDisplay: ctx.clientDisplay || null,
        sessionDate: ctx.sessionDate || null,
        venue: ctx.venue || null,
        contextWaId: String(inRow.context_wa_id || "").trim() || null,
      }).then(function (res) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Send now";
        }
        updateSendButton();
        if (!res || !res.ok) {
          var err = formatSendError(res && res.error, res && res.data);
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = err;
          } else {
            cfg.toast(err, "err");
          }
          return;
        }
        var msg =
          global.PortalParentNotifySend && typeof global.PortalParentNotifySend.formatSendResult === "function"
            ? global.PortalParentNotifySend.formatSendResult(res.data)
            : "Sent.";
        cfg.toast(msg, "ok");
        cfg.closeModal();
        void loadRows(true);
      }).catch(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Send now";
        }
        updateSendButton();
        if (statusEl) {
          statusEl.style.display = "block";
          statusEl.textContent = "Send failed — check your connection.";
        } else {
          cfg.toast("Send failed", "err");
        }
      });
    };
    var backdrop = document.getElementById("modalBackdrop");
    if (backdrop) {
      backdrop.onclick = function (e) {
        if (e.target === backdrop) cfg.closeModal();
      };
    }
  }

  function normEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  // Group the flat timeline into per-family conversation threads, split by
  // channel so admin sees a WhatsApp column and an Email column.
  function buildThreads(items) {
    var wa = {};
    var em = {};
    function waThread(key) {
      if (!wa[key]) {
        wa[key] = {
          key: key, channel: "whatsapp", name: "", client: "",
          phone: key, email: "", events: [], lastAt: "",
          hasInbound: false, hasFailed: false, hasSent: false, lastInboundId: "",
          lastInboundAt: "",
        };
      }
      return wa[key];
    }
    function emThread(key) {
      if (!em[key]) {
        em[key] = {
          key: key, channel: "email", name: "", client: "",
          phone: "", email: key, events: [], lastAt: "",
          hasInbound: false, hasFailed: false, hasSent: false, lastInboundId: "",
        };
      }
      return em[key];
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
          dir: "in", when: row.created_at, body: row.body_text,
          channel: "whatsapp", fromApp: fromApp, inboundId: row.id, row: row,
          messageType: String(row.message_type || "").toLowerCase(),
          mediaUrl: row.media_url || "", mediaMime: String(row.media_mime || ""),
        });
        t.hasInbound = true;
        t.lastInboundId = String(row.id || "");
        var inAt = String(row.created_at || "");
        if (inAt > t.lastInboundAt) t.lastInboundAt = inAt;
        if (row.contact_name && !t.name) t.name = String(row.contact_name).trim();
        return;
      }
      var ch = String(row.channel || "").toLowerCase();
      if (ch === "whatsapp" || ch === "both") {
        var wkey = phoneDigits(row.parent_phone);
        if (wkey) {
          var wt = waThread(wkey);
          wt.events.push({
            dir: "out", when: row.created_at, body: row.body_text, kind: row.kind,
            subject: row.subject, sentBy: row.sent_by_email, status: row.whatsapp_status,
            channel: "whatsapp", row: row,
          });
          if (!wt.name) wt.name = String(row.parent_name || row.client_display || "").trim();
          if (row.client_display && !wt.client) wt.client = String(row.client_display).trim();
          if (String(row.whatsapp_status || "").toLowerCase() === "failed") wt.hasFailed = true;
          else wt.hasSent = true;
        }
      }
      if (ch === "email" || ch === "both") {
        var ekey = normEmail(row.parent_email);
        if (ekey) {
          var et = emThread(ekey);
          et.events.push({
            dir: "out", when: row.created_at, body: row.body_text, kind: row.kind,
            subject: row.subject, sentBy: row.sent_by_email, status: row.email_status,
            channel: "email", row: row,
          });
          if (!et.name) et.name = String(row.parent_name || row.client_display || "").trim();
          if (row.client_display && !et.client) et.client = String(row.client_display).trim();
          if (String(row.email_status || "").toLowerCase() === "failed") et.hasFailed = true;
          else if (String(row.email_status || "").toLowerCase() === "sent") et.hasSent = true;
        }
      }
    });
    function finalize(map) {
      return Object.keys(map)
        .map(function (k) {
          var t = map[k];
          t.events.sort(function (a, b) {
            return String(a.when || "").localeCompare(String(b.when || ""));
          });
          t.lastAt = t.events.length ? t.events[t.events.length - 1].when : "";
          if (!t.name) t.name = t.channel === "whatsapp" ? "+" + t.phone : t.email;
          return t;
        })
        .sort(function (a, b) {
          return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
        });
    }
    return { whatsapp: finalize(wa), email: finalize(em) };
  }

  function threadMatches(t) {
    var q = String(state.query || "").trim().toLowerCase();
    var outcome = String(state.outcome || "all").toLowerCase();
    if (outcome === "replies" && !t.hasInbound) return false;
    if (outcome === "failed" && !t.hasFailed) return false;
    if (outcome === "sent" && !t.hasSent) return false;
    if (!q) return true;
    var parts = [t.name, t.phone, t.email, t.client];
    t.events.forEach(function (e) {
      parts.push(e.body || "");
      parts.push(e.subject || "");
      parts.push(e.sentBy || "");
    });
    return parts.join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function renderMedia(ev) {
    if (!ev || !ev.mediaUrl) return "";
    var url = esc(ev.mediaUrl);
    var mime = String(ev.mediaMime || "").toLowerCase();
    if (mime.indexOf("image") === 0) {
      return '<a href="' + url + '" target="_blank" rel="noopener"><img class="portal-pnlog-bubble__img" src="' +
        url + '" alt="' + esc(ev.messageType || "image") + '" loading="lazy" /></a>';
    }
    if (mime.indexOf("video") === 0) {
      return '<video class="portal-pnlog-bubble__img" src="' + url + '" controls playsinline></video>';
    }
    if (mime.indexOf("audio") === 0) {
      return '<audio class="portal-pnlog-bubble__audio" src="' + url + '" controls></audio>';
    }
    return '<a class="portal-pnlog-bubble__file" href="' + url + '" target="_blank" rel="noopener">Open attachment</a>';
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
    var subjectLine =
      ev.channel === "email" && ev.subject
        ? '<div class="portal-pnlog-bubble__subject">' + esc(ev.subject) + "</div>"
        : "";
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
      '<div class="portal-pnlog-bubble portal-pnlog-bubble--' + side + '">' +
      subjectLine +
      mediaHtml +
      contentHtml +
      '<div class="portal-pnlog-bubble__meta">' + metaBits.join(" ") + "</div>" +
      "</div>"
    );
  }

  function renderThreadCard(t) {
    var who = esc(t.name);
    var sub = t.events.length ? esc(bodyPreview(t.events[t.events.length - 1].body)) : "";
    var when = esc(formatLondon(t.lastAt));
    var subline =
      t.channel === "whatsapp"
        ? "+" + esc(t.phone) + (t.client ? " · " + esc(t.client) : "")
        : esc(t.email) + (t.client ? " · " + esc(t.client) : "");
    var count = t.events.length;
    var unread = isThreadUnread(t);
    var isOpen = !!state.openKeys[t.key];
    var chips =
      '<span class="portal-pnlog-chip portal-pnlog-chip--muted">' +
      count + (count === 1 ? " msg" : " msgs") +
      "</span>";
    if (unread) {
      chips =
        '<span class="portal-pnlog-chip portal-pnlog-chip--unread">● Unread</span> ' + chips;
    } else if (t.hasInbound) {
      chips = statusChip("reply", "whatsapp") + " " + chips;
    }
    if (t.hasFailed) {
      chips += ' <span class="portal-pnlog-chip portal-pnlog-chip--bad">Failed</span>';
    }
    var replyBtn =
      t.channel === "whatsapp"
        ? '<button type="button" class="btn btn--pri btn--sm portal-pnlog-reply-btn portal-pnlog-reply-btn--head" ' +
          (t.lastInboundId
            ? 'data-inbound-id="' + esc(t.lastInboundId) + '"'
            : 'data-thread-phone="' + esc(t.phone) + '"') +
          ">Reply</button>"
        : "";
    // Unread threads start collapsed (photo 2 + alert); admin opens to read
    // (photo 3). Manually-opened threads stay open across the 15s auto-refresh.
    var openAttr = isOpen ? " open" : "";
    return (
      '<details class="portal-pnlog-row portal-pnlog-row--' +
      (t.channel === "whatsapp" ? "in" : "out") +
      (unread ? " portal-pnlog-row--unread" : "") +
      '"' + openAttr +
      ' data-thread-key="' + esc(t.key) + '"' +
      ' data-last-inbound-at="' + esc(t.lastInboundAt || "") + '">' +
      '<summary class="portal-pnlog-row__head">' +
      '<span class="portal-pnlog-row__main">' +
      '<span class="portal-pnlog-row__who">' + who + "</span>" +
      '<span class="portal-pnlog-row__kind muted">' + subline + "</span>" +
      '<span class="portal-pnlog-row__preview muted">' + sub + "</span>" +
      "</span>" +
      '<span class="portal-pnlog-row__side">' +
      '<span class="portal-pnlog-row__chips">' + chips + "</span>" +
      '<span class="portal-pnlog-row__when muted">' + when + "</span>" +
      replyBtn +
      "</span></summary>" +
      '<div class="portal-pnlog-row__body">' +
      '<div class="portal-pnlog-thread">' +
      t.events.map(renderBubble).join("") +
      "</div></div></details>"
    );
  }

  function renderColumn(title, channel, threads) {
    var cards = threads.length
      ? threads.map(renderThreadCard).join("")
      : '<p class="muted portal-pnlog-empty">No ' +
        (channel === "whatsapp" ? "WhatsApp" : "email") +
        " conversations match your filters.</p>";
    return (
      '<section class="portal-pnlog-col portal-pnlog-col--' + channel + '">' +
      '<h2 class="portal-pnlog-col__title">' + esc(title) +
      ' <span class="portal-pnlog-col__count">' + threads.length + "</span></h2>" +
      '<div class="portal-pnlog-col__list">' + cards + "</div>" +
      "</section>"
    );
  }

  function renderList(items) {
    var host = document.getElementById("portalParentNotifyLogList");
    var countEl = document.getElementById("portalParentNotifyLogCount");
    if (!host) return;
    var grouped = buildThreads(items);
    var ch = String(state.channel || "all").toLowerCase();
    var showWa = ch === "all" || ch === "both" || ch === "whatsapp";
    var showEm = ch === "all" || ch === "both" || ch === "email";
    var waThreads = grouped.whatsapp.filter(threadMatches);
    var emThreads = grouped.email.filter(threadMatches);
    var unreadCount = 0;
    if (showWa) {
      waThreads.forEach(function (t) {
        if (isThreadUnread(t)) unreadCount += 1;
      });
    }
    if (countEl) {
      var parts = [];
      if (showWa) parts.push(waThreads.length + " WhatsApp");
      if (showEm) parts.push(emThreads.length + " email");
      countEl.textContent =
        parts.join(" · ") + " conversation" +
        ((showWa ? waThreads.length : 0) + (showEm ? emThreads.length : 0) === 1 ? "" : "s") +
        (unreadCount ? " · " + unreadCount + " unread" : "") +
        " · grouped by family, newest first";
      countEl.classList.toggle("portal-pnlog-count--has-unread", unreadCount > 0);
    }
    if ((!showWa || !waThreads.length) && (!showEm || !emThreads.length)) {
      host.innerHTML =
        '<p class="muted portal-pnlog-empty">No conversations match your filters. Outbound sends appear after <strong>Send now</strong>. WhatsApp replies appear here once the Meta webhook is connected.</p>';
      return;
    }
    var cols = "";
    if (showWa) cols += renderColumn("WhatsApp", "whatsapp", waThreads);
    if (showEm) cols += renderColumn("Email", "email", emThreads);
    host.innerHTML = '<div class="portal-pnlog-cols">' + cols + "</div>";
    bindReplyActions();
    bindThreadToggles(host);
  }

  // <details> "toggle" events do not bubble, so bind each freshly-rendered row.
  // Opening a thread marks it read (clears the unread alert) and keeps it open
  // across the auto-refresh; closing forgets the open state.
  function bindThreadToggles(host) {
    var rows = host.querySelectorAll("details.portal-pnlog-row[data-thread-key]");
    rows.forEach(function (row) {
      row.addEventListener("toggle", function () {
        var key = row.getAttribute("data-thread-key") || "";
        if (!key) return;
        if (row.open) {
          state.openKeys[key] = true;
          markThreadSeen(key, row.getAttribute("data-last-inbound-at") || "");
          if (row.classList.contains("portal-pnlog-row--unread")) {
            row.classList.remove("portal-pnlog-row--unread");
            var chip = row.querySelector(".portal-pnlog-chip--unread");
            if (chip) chip.remove();
          }
        } else {
          delete state.openKeys[key];
        }
      });
    });
  }

  function findInboundRow(id) {
    var want = String(id || "").trim();
    if (!want) return null;
    for (var i = 0; i < (state.timeline || []).length; i++) {
      var item = state.timeline[i];
      if (item.direction !== "in") continue;
      if (String(item.row.id || "") === want) return item.row;
    }
    return null;
  }

  function bindReplyActions() {
    var list = document.getElementById("portalParentNotifyLogList");
    if (!list || list.getAttribute("data-reply-bound") === "1") return;
    list.setAttribute("data-reply-bound", "1");
    list.addEventListener("mousedown", function (e) {
      if (e.target.closest(".portal-pnlog-reply-btn")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".portal-pnlog-reply-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var ownerRow = btn.closest("details.portal-pnlog-row[data-thread-key]");
      if (ownerRow) {
        var okey = ownerRow.getAttribute("data-thread-key") || "";
        markThreadSeen(okey, ownerRow.getAttribute("data-last-inbound-at") || "");
        ownerRow.classList.remove("portal-pnlog-row--unread");
      }
      var id = btn.getAttribute("data-inbound-id");
      if (id) {
        var row = findInboundRow(id);
        if (row) {
          openReplyModal(row);
          return;
        }
      }
      var phone = btn.getAttribute("data-thread-phone");
      if (phone) {
        openReplyModal({ from_phone: phone, contact_name: "", body_text: "", context_wa_id: null });
      }
    });
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
      '<p class="page-intro">Conversations grouped by family — <strong>WhatsApp</strong> on the left, <strong>Email</strong> on the right. Each card is the full thread (our sends + their replies) with delivery ticks (Sent → Delivered → Read). Use <strong>Reply</strong> to respond in the same thread. Refreshes automatically every 15s.</p>' +
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

  global.PortalParentNotifyLog = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: function () {
      return loadRows(true);
    },
    stopLiveRefresh: stopInboundLiveRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
