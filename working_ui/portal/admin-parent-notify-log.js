/**
 * Admin — Family messages: WhatsApp API threads (list + chat pane).
 * Outbound log + inbound WhatsApp replies. Email is not shown here.
 */
(function (global) {
  "use strict";

  var FETCH_LIMIT = 800;
  var MEDIA_BUCKET = "wa-inbound-media";
  var MEDIA_SIGNED_TTL = 3600;
  var MAX_ATTACH_BYTES = 4 * 1024 * 1024;
  var signedMediaCache = Object.create(null);

  /**
   * LA / day-centre coordinator mobiles (not family phones).
   * Force display labels so a mis-stamped outbound (e.g. Maire/Kate) cannot
   * re-label this WhatsApp thread as Jack Stratton / Veronica / Kate.
   */
  var KNOWN_WA_THREAD_OVERRIDES = {
    "7766364819": {
      parentName: "Jordan Smith",
      client: "ACAT (H&F day centre)",
      waContact: "Jordan Smith",
    },
  };

  function knownWaThreadOverride(phone) {
    var key = phoneMatchKey(phone);
    return (key && KNOWN_WA_THREAD_OVERRIDES[key]) || null;
  }

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

  var PHONE_REMAP_KEY = "portalAdminWaPhoneRemap_v1";

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
    /** Optional sync directory from Participants export + local overrides. */
    getContactDirectory: null,
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
    composerSig: "",
    mobileShowThread: false,
    stickToBottom: true,
    contactDirectory: [],
    threadRefresh: { sig: "", deferRefresh: false },
    attach: null,
    recording: false,
    mediaRecorder: null,
    recordChunks: [],
    /** When set, composer is correcting an outbound message. */
    editing: null,
    /** When set, next send quotes this WhatsApp message (Meta context.message_id). */
    replyTo: null,
  };

  var SEEN_STORE_KEY = "portal_pnlog_seen_v1";
  /** Meta cold template shell (portal_parent_update_v2 · en). Only {{1}} is editable. */
  var WA_COLD_TEMPLATE_NAME = "portal_parent_update_v2";
  var WA_COLD_TEMPLATE_PREFIX = "Hello, ";
  var WA_COLD_TEMPLATE_SUFFIX = " Thank you.";
  var WA_TEMPLATE_BODY_MAX = 700;

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || "");
        var comma = raw.indexOf(",");
        resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
      };
      reader.onerror = function () {
        reject(new Error("read_failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  function clearComposerAttach() {
    state.attach = null;
    var input = document.getElementById("portalPnlogComposerFile");
    if (input) input.value = "";
    var preview = document.getElementById("portalPnlogComposerAttachPreview");
    if (preview) preview.textContent = "";
    var clear = document.getElementById("portalPnlogComposerClearAttach");
    if (clear) clear.hidden = true;
  }

  function setComposerAttach(fileOrBlob, filename, mime) {
    if (!fileOrBlob) return;
    if ((fileOrBlob.size || 0) > MAX_ATTACH_BYTES) {
      cfg.toast("Attachment too large (max 4 MB)", "err");
      return;
    }
    var name = filename || fileOrBlob.name || "attachment";
    var type = mime || fileOrBlob.type || "application/octet-stream";
    void fileToBase64(fileOrBlob)
      .then(function (base64) {
        state.attach = { base64: base64, mime: type, filename: name };
        var preview = document.getElementById("portalPnlogComposerAttachPreview");
        if (preview) preview.textContent = "Attached: " + name;
        var clear = document.getElementById("portalPnlogComposerClearAttach");
        if (clear) clear.hidden = false;
      })
      .catch(function () {
        cfg.toast("Could not read attachment", "err");
      });
  }

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
    // Staff already messaged after the parent's last reply — not waiting on you.
    if (t.lastOutboundAt && String(t.lastOutboundAt) >= String(t.lastInboundAt)) return false;
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
    if (options.getContactDirectory) cfg.getContactDirectory = options.getContactDirectory;
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

  /** Fold accents so search "lea" matches "Léa", "jose" matches "José", etc. */
  function foldSearchText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  /** Canonical UK-ish WhatsApp digits (no +), mirroring server normalizeParentPhoneE164. */
  function canonicalPhoneDigits(phone) {
    var digits = phoneDigits(phone);
    if (!digits || digits.length < 8) return "";
    if (digits.indexOf("00") === 0) digits = digits.slice(2);
    if (digits.indexOf("44") === 0 && digits.length >= 12) {
      var national = digits.slice(2);
      if (national.charAt(0) === "0") national = national.slice(1);
      digits = "44" + national;
    } else if (digits.charAt(0) === "0" && digits.length >= 10) {
      digits = "44" + digits.slice(1);
    }
    if (!/^[1-9]/.test(digits)) return "";
    return digits;
  }

  function phoneMatchKey(phone) {
    var d = canonicalPhoneDigits(phone) || phoneDigits(phone);
    if (!d) return "";
    return d.length >= 10 ? d.slice(-10) : d;
  }

  function formatPhoneDisplay(phone) {
    var d = canonicalPhoneDigits(phone) || phoneDigits(phone);
    if (!d) return "";
    return "+" + d;
  }

  function loadPhoneRemap() {
    try {
      var raw = global.localStorage.getItem(PHONE_REMAP_KEY);
      var j = raw ? JSON.parse(raw) : {};
      return j && typeof j === "object" ? j : {};
    } catch (_e) {
      return {};
    }
  }

  function savePhoneRemap(map) {
    try {
      global.localStorage.setItem(PHONE_REMAP_KEY, JSON.stringify(map || {}));
    } catch (_e) {}
  }

  /** When profile phone changes, map old WhatsApp thread digits → new send digits. */
  function notePhoneChange(oldPhone, newPhone) {
    var oldD = canonicalPhoneDigits(oldPhone) || phoneDigits(oldPhone);
    var newD = canonicalPhoneDigits(newPhone) || phoneDigits(newPhone);
    if (!oldD || !newD || oldD === newD) return;
    var map = loadPhoneRemap();
    map[oldD] = newD;
    map[phoneDigits(oldPhone)] = newD;
    var oldKey = phoneMatchKey(oldPhone);
    if (oldKey) map[oldKey] = newD;
    savePhoneRemap(map);
  }

  function remappedPhoneDigits(phone) {
    var map = loadPhoneRemap();
    var canon = canonicalPhoneDigits(phone) || phoneDigits(phone);
    var raw = phoneDigits(phone);
    var key = phoneMatchKey(phone);
    var hit = (canon && map[canon]) || (raw && map[raw]) || (key && map[key]) || "";
    return hit ? String(hit) : "";
  }

  function normalizeDirContact(row) {
    if (!row) return null;
    var child = String(row.child_display || row.child || row.client || "").trim();
    var parent = String(row.parent_display || row.parent || "").trim();
    var mobile = String(row.mobile || row.phone || "").trim();
    var contactId = String(row.contact_id || row.contactId || "").trim();
    var parentPersonId = String(row.parent_person_id || row.parentPersonId || "").trim();
    if (!child && !mobile && !contactId) return null;
    return {
      contactId: contactId,
      parentPersonId: parentPersonId,
      child: child,
      parent: parent,
      mobile: mobile,
      matchKey: phoneMatchKey(mobile),
      sendDigits: canonicalPhoneDigits(mobile) || phoneDigits(mobile),
      childNorm: String(child || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    };
  }

  function directoryFromCfg() {
    if (typeof cfg.getContactDirectory !== "function") return [];
    try {
      var rows = cfg.getContactDirectory() || [];
      return (rows || []).map(normalizeDirContact).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  async function fetchLiveContactDirectory() {
    var token = await portalAuthToken();
    var base = String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
    var anon = String(cfg.getAnonKey() || "");
    if (!token || !base || !anon) return [];
    try {
      var res = await fetch(base + "/functions/v1/portal-admin-parent-contact-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anon,
        },
        body: JSON.stringify({ action: "directory" }),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (!res.ok || !j || !j.ok || !Array.isArray(j.contacts)) return [];
      return j.contacts.map(normalizeDirContact).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  function mergeContactDirectories(preferred, fallback) {
    var byPhone = Object.create(null);
    var byParentKey = Object.create(null);
    var out = [];
    function parentKey(c) {
      if (!c || !c.contactId || !c.parentPersonId) return "";
      return c.contactId + "\0" + c.parentPersonId;
    }
    function upsert(c, overwrite) {
      if (!c) return;
      var pkey = parentKey(c);
      // Never merge co-parents by child/contact alone — phones must stay distinct.
      var existing =
        (c.matchKey && byPhone[c.matchKey]) ||
        (pkey && byParentKey[pkey]) ||
        null;
      if (existing) {
        if (overwrite) {
          if (c.mobile) {
            existing.mobile = c.mobile;
            existing.matchKey = c.matchKey || existing.matchKey;
            existing.sendDigits = c.sendDigits || existing.sendDigits;
          }
          if (c.parent) existing.parent = c.parent;
          if (c.child) {
            existing.child = c.child;
            existing.childNorm = c.childNorm || existing.childNorm;
          }
          if (c.contactId && !existing.contactId) existing.contactId = c.contactId;
          if (c.parentPersonId && !existing.parentPersonId) {
            existing.parentPersonId = c.parentPersonId;
          }
        } else {
          if (!existing.mobile && c.mobile) {
            existing.mobile = c.mobile;
            existing.matchKey = c.matchKey || existing.matchKey;
            existing.sendDigits = c.sendDigits || existing.sendDigits;
          }
          if (!existing.parent && c.parent) existing.parent = c.parent;
          if (!existing.child && c.child) {
            existing.child = c.child;
            existing.childNorm = c.childNorm || existing.childNorm;
          }
          if (!existing.parentPersonId && c.parentPersonId) {
            existing.parentPersonId = c.parentPersonId;
          }
        }
        if (existing.matchKey) byPhone[existing.matchKey] = existing;
        var ek = parentKey(existing);
        if (ek) byParentKey[ek] = existing;
        return;
      }
      out.push(c);
      if (c.matchKey) byPhone[c.matchKey] = c;
      if (pkey) byParentKey[pkey] = c;
    }
    (fallback || []).forEach(function (c) {
      upsert(c, false);
    });
    (preferred || []).forEach(function (c) {
      upsert(c, true);
    });
    return out;
  }

  function findContactForThread(t, directory) {
    var list = directory || state.contactDirectory || [];
    if (!t || !list.length) return null;
    var i;
    /* Match by WhatsApp thread phone only — never by child (co-parents share a child). */
    var threadKey = phoneMatchKey(t.phone);
    if (threadKey) {
      for (i = 0; i < list.length; i++) {
        if (list[i].matchKey && list[i].matchKey === threadKey) return list[i];
      }
    }
    var threadDigits = canonicalPhoneDigits(t.phone) || phoneDigits(t.phone);
    if (threadDigits) {
      for (i = 0; i < list.length; i++) {
        if (list[i].sendDigits && list[i].sendDigits === threadDigits) return list[i];
      }
    }
    return null;
  }

  function enrichThreadsWithProfilePhones(threads) {
    var dir = state.contactDirectory || [];
    (threads || []).forEach(function (t) {
      if (!t) return;
      var contact = findContactForThread(t, dir);
      var threadDigits = canonicalPhoneDigits(t.phone) || phoneDigits(t.phone);
      // Always send to this WhatsApp thread's number (or an explicit remap of THAT number).
      // Never redirect to another co-parent's profile mobile.
      var remapped = remappedPhoneDigits(t.phone);
      t.sendPhone = remapped || threadDigits || t.phone;
      t.profilePhone = (contact && contact.sendDigits) || "";
      t.phoneFromProfile = !!(remapped && remapped !== threadDigits);
      if (contact && contact.parent) t.parentName = contact.parent;
      if (contact && contact.child) t.client = contact.child;
      /* Coordinator phones win over any mis-stamped outbound (Kate/Maire → Jordan). */
      var ov = knownWaThreadOverride(t.phone || t.sendPhone);
      if (ov) {
        t.parentName = ov.parentName;
        t.client = ov.client;
        t.waContact = ov.waContact || ov.parentName;
        t.coordinatorThread = true;
      }
      var parent = t.parentName;
      if (!parent || namesRoughlySame(parent, t.client)) {
        if (t.waContact && !namesRoughlySame(t.waContact, t.client)) parent = t.waContact;
        else if (!parent) parent = t.waContact || "";
      }
      t.name = parent || t.client || "+" + t.phone;
    });
    return threads;
  }

  function threadPhoneForUi(t) {
    if (!t) return "";
    // Show the WhatsApp thread number we actually message — never a redirected co-parent.
    return formatPhoneDisplay(t.phone || t.sendPhone);
  }

  function friendlyWaError(detail) {
    var d = String(detail || "").trim();
    if (!d) return "";
    if (/131047|re-engagement/i.test(d)) {
      return "Outside WhatsApp 24h window — cold message needs the approved template (portal will use it automatically on resend).";
    }
    if (/131026|undeliverable|not on whatsapp/i.test(d)) {
      return "Number may not be on WhatsApp or cannot receive messages.";
    }
    return d.length > 160 ? d.slice(0, 157) + "…" : d;
  }

  function statusChip(status, channel, errorDetail) {
    var s = String(status || "").toLowerCase();
    var label = s;
    var ticks = "";
    if (s === "sent" || s === "sent_sms") label = s === "sent_sms" ? "SMS sent" : "Sent";
    else if (s === "delivered") {
      label = "Delivered";
      ticks = '<span class="portal-pnlog-ticks" aria-hidden="true">✓✓</span>';
    } else if (s === "read") {
      label = "Read";
      ticks = '<span class="portal-pnlog-ticks" aria-hidden="true">✓✓</span>';
    } else if (s === "failed") label = "Failed";
    else if (s === "skipped") label = "Skipped";
    else if (s === "pending") label = "Pending";
    else if (s === "reply") label = "Reply";
    else label = s || "—";
    var cls = "portal-pnlog-chip";
    if (s === "read") cls += " portal-pnlog-chip--read";
    else if (s === "delivered") cls += " portal-pnlog-chip--delivered";
    else if (s === "sent" || s === "sent_sms") cls += " portal-pnlog-chip--sent";
    else if (s === "reply") cls += " portal-pnlog-chip--in";
    else if (s === "failed") cls += " portal-pnlog-chip--bad";
    else cls += " portal-pnlog-chip--muted";
    var tip = friendlyWaError(errorDetail) || channel || "";
    return (
      '<span class="' +
      cls +
      '" title="' +
      esc(tip) +
      '">' +
      esc(label) +
      (ticks ? " " + ticks : "") +
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
    var key = phoneMatchKey(phone);
    var digits = canonicalPhoneDigits(phone) || phoneDigits(phone);
    var ctx = {
      parentName: "",
      parentWhatsapp: digits,
      clientDisplay: "",
      sessionDate: "",
      venue: "",
    };
    if (!key && !digits) return ctx;
    (state.timeline || []).forEach(function (item) {
      if (item.direction !== "out") return;
      var row = item.row;
      var rowKey = phoneMatchKey(row.parent_phone);
      if (key && rowKey !== key) return;
      if (!key && phoneDigits(row.parent_phone) !== digits) return;
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

  function namesRoughlySame(a, b) {
    var na = String(a || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    var nb = String(b || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.indexOf(nb) === 0 || nb.indexOf(na) === 0) return true;
    return false;
  }

  var DAY_ORDER = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  function normalizeDayName(d) {
    var s = String(d || "").trim().toLowerCase();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatDayList(days) {
    var list = (days || []).slice();
    if (!list.length) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + " and " + list[1];
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  }

  function formatClockFromMinutes(totalMin) {
    var m = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    var mer = hh >= 12 ? "pm" : "am";
    if (mm === 0) return h12 + mer;
    var mmStr = mm < 10 ? "0" + mm : String(mm);
    return h12 + "." + mmStr + mer;
  }

  function formatTimeRangeFromMinutes(startMin, endMin) {
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return "";
    var a = formatClockFromMinutes(startMin).replace(/am$/i, "").replace(/pm$/i, "");
    var b = formatClockFromMinutes(endMin);
    // Prefer club style: "4.30 to 6pm"
    var aMer = startMin >= 12 * 60 ? "pm" : "am";
    var bMer = endMin >= 12 * 60 ? "pm" : "am";
    if (aMer === bMer) return a + " to " + b;
    return formatClockFromMinutes(startMin) + " to " + b;
  }

  function shortServiceLabel(service) {
    var s = String(service || "").trim();
    if (!s) return "";
    if (/^bespoke\b/i.test(s)) return "Bespoke";
    if (/multi[- ]?activity/i.test(s)) return "Multi-Activity";
    if (/^aquatic\b/i.test(s)) return "Aquatic";
    if (/day\s*centre/i.test(s)) return "Day centre";
    return s.replace(/\bProgramme\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  /** Over 90' → hours (120' → 2h, 150' → 2.5h); otherwise minutes with '. */
  function formatDurationLabel(mins) {
    var n = Number(mins) || 0;
    if (n <= 0) return "";
    if (n > 90) {
      var h = n / 60;
      var rounded = Math.round(h * 10) / 10;
      return (rounded % 1 === 0 ? String(rounded) : String(rounded)) + "h";
    }
    return n + "'";
  }

  /** Staffing ratio is product knowledge — not instructor count on the roster line. */
  var ENROLLED_RATIO_BY_CLIENT = {
    tinashe: 3,
    ikram: 2,
    fadi: 2,
    timi: 2,
  };

  function enrolledRatioForClient(clientName) {
    var key = String(clientName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)[0];
    return ENROLLED_RATIO_BY_CLIENT[key] || 1;
  }

  function serviceChipTone(service, venue) {
    var s = String(service || "").toLowerCase();
    var v = String(venue || "").toLowerCase();
    if (s.indexOf("multi") >= 0) {
      if (v.indexOf("swimfarm") >= 0 || v.indexOf("swim farm") >= 0) return "multi-swimfarm";
      if (v.indexOf("acton") >= 0) return "multi-acton";
      return "multi";
    }
    if (s.indexOf("bespoke") >= 0) return "bespoke";
    if (s.indexOf("aquatic") >= 0) return "aquatic";
    if (s.indexOf("day centre") >= 0 || s.indexOf("daycentre") >= 0) return "daycentre";
    if (s.indexOf("swim") >= 0) return "swim";
    return "other";
  }

  function parseSlotBounds(timeSlot) {
    // Roster typos like "12.30 to 1,30" → treat comma as minutes separator.
    var s = String(timeSlot || "").trim().replace(/,/g, ".");
    var m = s.match(/(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?\s*to\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;
    function toMin(h, mm, mer) {
      var hh = parseInt(h, 10) || 0;
      var mi = parseInt(mm || "0", 10) || 0;
      var merL = String(mer || "").toLowerCase();
      if (merL === "pm" && hh < 12) hh += 12;
      if (merL === "am" && hh === 12) hh = 0;
      if (!merL && hh < 7) hh += 12;
      return hh * 60 + mi;
    }
    var a = toMin(m[1], m[2], m[3]);
    var b = toMin(m[4], m[5], m[6] || m[3]);
    if (!(b > a)) return null;
    return { start: a, end: b, mins: b - a };
  }

  function rosterRowsForEnrolled() {
    try {
      var src = global.STAFF_DASHBOARD_SOURCE;
      if (src && Array.isArray(src.rows) && src.rows.length) return src.rows;
    } catch (_e) {}
    return [];
  }

  /** Feedback splits Multi into 45'+45'; merge abutting halves into the real 90' service. */
  function mergeAbuttingHalfSlots(slots) {
    var list = (slots || []).slice().sort(function (a, b) {
      var da = DAY_ORDER[String(a.day || "").toLowerCase()] || 99;
      var db = DAY_ORDER[String(b.day || "").toLowerCase()] || 99;
      if (da !== db) return da - db;
      if (a.venue !== b.venue) return String(a.venue).localeCompare(String(b.venue));
      if (a.serviceKey !== b.serviceKey) return String(a.serviceKey).localeCompare(String(b.serviceKey));
      return a.start - b.start;
    });
    var out = [];
    list.forEach(function (slot) {
      var prev = out.length ? out[out.length - 1] : null;
      var canMerge =
        prev &&
        prev.day === slot.day &&
        prev.venue === slot.venue &&
        prev.serviceKey === slot.serviceKey &&
        /multi/.test(prev.serviceKey) &&
        prev.end === slot.start &&
        prev.mins <= 50 &&
        slot.mins <= 50;
      if (canMerge) {
        prev.end = slot.end;
        prev.mins = prev.end - prev.start;
        Object.keys(slot.instructors || {}).forEach(function (k) {
          prev.instructors[k] = true;
        });
        return;
      }
      out.push({
        day: slot.day,
        venue: slot.venue,
        service: slot.service,
        serviceKey: slot.serviceKey,
        start: slot.start,
        end: slot.end,
        mins: slot.mins,
        instructors: Object.assign(Object.create(null), slot.instructors || {}),
      });
    });
    // Drop Multi fragments fully covered by a longer same-day/venue Multi block
    // (e.g. leftover 4–5.15 when 4.30–6 already merged).
    var kept = out.filter(function (slot, idx) {
      if (!/multi/.test(slot.serviceKey)) return true;
      for (var i = 0; i < out.length; i++) {
        if (i === idx) continue;
        var other = out[i];
        if (other.day !== slot.day || other.venue !== slot.venue) continue;
        if (!/multi/.test(other.serviceKey)) continue;
        if (other.start <= slot.start && other.end >= slot.end && other.mins > slot.mins) {
          return false;
        }
        // Overlapping feedback fragment vs real 90' booking (e.g. 4–5.15 vs 4.30–6).
        var overlap = Math.min(slot.end, other.end) - Math.max(slot.start, other.start);
        if (overlap > 0 && other.mins >= 80 && slot.mins < other.mins && overlap >= Math.min(slot.mins, 30)) {
          return false;
        }
      }
      return true;
    });
    return kept;
  }

  /** Day Centre roster is often split for feedback — collapse each day to the real span. */
  function collapseDayCentreDaySpans(slots) {
    var pass = [];
    var buckets = Object.create(null);
    (slots || []).forEach(function (slot) {
      if (!/day\s*centre/.test(String(slot.serviceKey || ""))) {
        pass.push(slot);
        return;
      }
      var bk = [slot.day, slot.serviceKey, slot.venue].join("|");
      if (!buckets[bk]) {
        buckets[bk] = {
          day: slot.day,
          venue: slot.venue,
          service: slot.service,
          serviceKey: slot.serviceKey,
          start: slot.start,
          end: slot.end,
          mins: slot.mins,
          instructors: Object.assign(Object.create(null), slot.instructors || {}),
        };
        return;
      }
      buckets[bk].start = Math.min(buckets[bk].start, slot.start);
      buckets[bk].end = Math.max(buckets[bk].end, slot.end);
      buckets[bk].mins = buckets[bk].end - buckets[bk].start;
      Object.keys(slot.instructors || {}).forEach(function (k) {
        buckets[bk].instructors[k] = true;
      });
    });
    return pass.concat(
      Object.keys(buckets).map(function (k) {
        return buckets[k];
      })
    );
  }

  /**
   * Enrolled service chips for the participant (hover = ratio / day / time / venue).
   * Multi-Activity halves and Day Centre fragments are merged to the real booking.
   */
  function enrolledChipsForClient(clientName) {
    var want = String(clientName || "").trim();
    if (!want) return "";
    var rows = rosterRowsForEnrolled();
    if (!rows.length) return "";
    var deduped = Object.create(null);
    rows.forEach(function (r) {
      var rowName = String(r.client_name || "").trim();
      if (!rowName) return;
      if (!namesRoughlySame(rowName, want) && rowName.toLowerCase() !== want.toLowerCase()) return;
      var day = normalizeDayName(r.day || r.weekday || "");
      var time = String(r.time_slot || "").trim();
      var service = String(r.service || "").trim();
      var venue = String(r.venue || "").trim();
      var bounds = parseSlotBounds(time);
      if (!day || !service || !bounds) return;
      var serviceKey = shortServiceLabel(service).toLowerCase() || service.toLowerCase();
      var dk = [day, serviceKey, venue, bounds.start, bounds.end].join("|");
      if (!deduped[dk]) {
        deduped[dk] = {
          day: day,
          venue: venue,
          service: service,
          serviceKey: serviceKey,
          start: bounds.start,
          end: bounds.end,
          mins: bounds.mins,
          instructors: Object.create(null),
        };
      }
      String(r.instructors || r.instructor || "")
        .split(/[,+/&|]/)
        .forEach(function (x) {
          var s = String(x || "").trim();
          if (s) deduped[dk].instructors[s.toUpperCase()] = true;
        });
    });
    var raw = Object.keys(deduped).map(function (k) {
      return deduped[k];
    });
    if (!raw.length) return "";
    var merged = collapseDayCentreDaySpans(mergeAbuttingHalfSlots(raw));
    var ratio = enrolledRatioForClient(want);
    var groups = Object.create(null);
    merged.forEach(function (slot) {
      var gk = [slot.serviceKey, slot.start, slot.end, slot.venue].join("|");
      if (!groups[gk]) {
        groups[gk] = {
          service: slot.service,
          serviceKey: slot.serviceKey,
          venue: slot.venue,
          start: slot.start,
          end: slot.end,
          mins: slot.mins,
          days: Object.create(null),
        };
      }
      groups[gk].days[slot.day] = true;
    });
    var chips = Object.keys(groups)
      .map(function (gk) {
        return groups[gk];
      })
      .sort(function (a, b) {
        var sa = shortServiceLabel(a.service) || a.service;
        var sb = shortServiceLabel(b.service) || b.service;
        if (sa !== sb) return sa.localeCompare(sb);
        var va = String(a.venue || "").localeCompare(String(b.venue || ""));
        if (va) return va;
        return a.start - b.start;
      })
      .map(function (g) {
        var days = Object.keys(g.days).sort(function (a, b) {
          return (DAY_ORDER[a.toLowerCase()] || 99) - (DAY_ORDER[b.toLowerCase()] || 99);
        });
        var bits = [];
        var dur = formatDurationLabel(g.mins);
        if (dur) bits.push(dur);
        bits.push(shortServiceLabel(g.service) || g.service);
        var tipBits = [];
        if (ratio > 1) tipBits.push(ratio + ":1");
        tipBits.push(formatDayList(days));
        tipBits.push(formatTimeRangeFromMinutes(g.start, g.end));
        tipBits.push(g.venue);
        var tip = tipBits.filter(Boolean).join(" / ");
        var tone = serviceChipTone(g.service, g.venue);
        return (
          '<span class="portal-pnlog-enrolled-chip portal-pnlog-enrolled-chip--' +
          esc(tone) +
          '" title="' +
          esc(tip) +
          '">' +
          esc(bits.join(" ")) +
          "</span>"
        );
      });
    return chips.length
      ? '<div class="portal-pnlog-pane-head__enrolled">' + chips.join("") + "</div>"
      : "";
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
          parentName: "",
          waContact: "",
          client: "",
          phone: key,
          events: [],
          lastAt: "",
          hasInbound: false,
          hasFailed: false,
          hasSent: false,
          lastInboundId: "",
          lastInboundAt: "",
          lastOutboundAt: "",
          lastInboundWaId: "",
        };
      }
      return wa[key];
    }
    (items || []).forEach(function (item) {
      var row = item.row;
      if (item.direction === "in") {
        var pkey = phoneMatchKey(row.from_phone) || phoneDigits(row.from_phone);
        if (!pkey) return;
        var t = waThread(pkey);
        if (!t.sendPhone) {
          t.sendPhone = formatPhoneDisplay(row.from_phone) || String(row.from_phone || "");
          t.phone = t.sendPhone;
        }
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
        var contact = String(row.contact_name || "").trim();
        if (contact && !t.waContact) t.waContact = contact;
        return;
      }
      var ch = String(row.channel || "").toLowerCase();
      if (ch !== "whatsapp" && ch !== "both") return;
      var wkey = phoneMatchKey(row.parent_phone) || phoneDigits(row.parent_phone);
      if (!wkey) return;
      var wt = waThread(wkey);
      if (!wt.sendPhone) {
        wt.sendPhone = formatPhoneDisplay(row.parent_phone) || String(row.parent_phone || "");
        wt.phone = wt.sendPhone;
      }
      wt.events.push({
        dir: "out",
        id: row.id,
        when: row.created_at,
        body: row.body_text,
        kind: row.kind,
        subject: row.subject,
        sentBy: row.sent_by_email,
        status: row.whatsapp_status,
        errorDetail: row.error_detail || "",
        channel: "whatsapp",
        row: row,
        messageType: String(row.message_type || "").toLowerCase(),
        mediaUrl: row.media_url || "",
        mediaMime: String(row.media_mime || ""),
      });
      var outAt = String(row.created_at || "");
      if (outAt > wt.lastOutboundAt) wt.lastOutboundAt = outAt;
      var pname = String(row.parent_name || "").trim();
      var cname = String(row.client_display || "").trim();
      var ovOut = knownWaThreadOverride(wkey);
      if (ovOut) {
        wt.parentName = ovOut.parentName;
        wt.client = ovOut.client;
        wt.waContact = ovOut.waContact || ovOut.parentName;
        wt.coordinatorThread = true;
      } else {
        // Prefer a parent_name that is not just a copy of the participant name.
        if (pname) {
          if (!wt.parentName) wt.parentName = pname;
          else if (
            namesRoughlySame(wt.parentName, wt.client || cname) &&
            !namesRoughlySame(pname, cname || wt.client)
          ) {
            wt.parentName = pname;
          }
        }
        if (cname && !wt.client) wt.client = cname;
      }
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
        // Title = carer/parent (foto 2: Alvar / Frankie). Never prefer the
        // participant alone when we have a distinct WhatsApp contact or parent.
        var parent = t.parentName;
        if (!parent || namesRoughlySame(parent, t.client)) {
          if (t.waContact && !namesRoughlySame(t.waContact, t.client)) {
            parent = t.waContact;
          } else if (!parent) {
            parent = t.waContact || "";
          }
        }
        t.name = parent || t.client || "+" + t.phone;
        return t;
      })
      .sort(compareAdminWaThreads);
  }

  /** Latest message (either direction) — whoever wrote last floats to the top. */
  function adminWaThreadLatestAt(t) {
    if (!t) return "";
    var inn = String(t.lastInboundAt || "");
    var out = String(t.lastOutboundAt || "");
    var latest = inn > out ? inn : out;
    return latest || String(t.lastAt || "");
  }

  function adminWaThreadListWhen(t) {
    return adminWaThreadLatestAt(t);
  }

  function compareAdminWaThreads(a, b) {
    var q = foldSearchText(state.query || "").trim();
    if (q) {
      var ra = searchRankForThread(a, q);
      var rb = searchRankForThread(b, q);
      if (rb !== ra) return rb - ra;
    }
    return String(adminWaThreadLatestAt(b) || "").localeCompare(
      String(adminWaThreadLatestAt(a) || "")
    );
  }

  /** Identity fields only — never staff sender email (would match every thread Victor sent). */
  function threadIdentityHay(t) {
    var phoneKey = phoneMatchKey(t.phone || t.sendPhone || "");
    return foldSearchText(
      [
        t.name,
        t.parentName,
        t.waContact,
        t.phone,
        t.sendPhone,
        t.client,
        t.profilePhone,
        phoneKey,
        t.fromDirectory ? "directory" : "",
        t.coordinatorThread ? "jordan acat h&f" : "",
      ].join(" ")
    );
  }

  function threadBodyHay(t) {
    var parts = [];
    (t.events || []).forEach(function (e) {
      parts.push(e.body || "");
      parts.push(e.subject || "");
    });
    return foldSearchText(parts.join(" "));
  }

  function hayMatchesQuery(hay, q) {
    if (!q) return true;
    if (hay.indexOf(q) >= 0) return true;
    var tokens = q.split(/[^a-z0-9]+/).filter(function (x) { return x.length >= 2; });
    if (!tokens.length) return false;
    return tokens.every(function (tok) { return hay.indexOf(tok) >= 0; });
  }

  /** True when query looks like a phone and matches the thread/contact number (07… ↔ +447…). */
  function phoneQueryMatches(phone, qRaw) {
    var qDigits = phoneDigits(qRaw);
    if (qDigits.length < 7) return false;
    var qCanon = canonicalPhoneDigits(qRaw) || qDigits;
    var pCanon = canonicalPhoneDigits(phone) || phoneDigits(phone);
    if (!pCanon) return false;
    if (pCanon === qCanon || pCanon === qDigits) return true;
    if (pCanon.indexOf(qDigits) >= 0 || qDigits.indexOf(pCanon) >= 0) return true;
    /* Last 9–10 national digits: 7715444979 */
    var qTail = qDigits.replace(/^44/, "").replace(/^0/, "");
    var pTail = pCanon.replace(/^44/, "").replace(/^0/, "");
    if (qTail.length >= 7 && (pTail === qTail || pTail.slice(-qTail.length) === qTail)) return true;
    return false;
  }

  function threadPhoneMatchesQuery(t, qRaw) {
    return (
      phoneQueryMatches(t.phone, qRaw) ||
      phoneQueryMatches(t.sendPhone, qRaw) ||
      phoneQueryMatches(t.profilePhone, qRaw)
    );
  }

  /** Higher = better when a search query is active (name hits before body-only). */
  function searchRankForThread(t, q) {
    if (!q) return 0;
    var qRaw = String(state.query || "").trim();
    if (threadPhoneMatchesQuery(t, qRaw)) return t.fromDirectory ? 320 : 280;
    var idHay = threadIdentityHay(t);
    if (hayMatchesQuery(idHay, q)) {
      if (t.fromDirectory) return 300;
      return 200;
    }
    if (hayMatchesQuery(threadBodyHay(t), q)) return 50;
    return 0;
  }

  function threadMatches(t) {
    var qRaw = String(state.query || "").trim();
    var q = foldSearchText(qRaw);
    var outcome = String(state.outcome || "all").toLowerCase();
    if (outcome === "replies" && !t.hasInbound) return false;
    if (outcome === "failed" && !t.hasFailed) return false;
    if (outcome === "sent" && !t.hasSent) return false;
    if (outcome === "unread" && !isThreadUnread(t)) return false;
    if (!q) return true;
    if (threadPhoneMatchesQuery(t, qRaw)) return true;
    if (hayMatchesQuery(threadIdentityHay(t), q)) return true;
    /* Message text only — do not match sentBy (staff email), or "victor" lists every outbound. */
    return hayMatchesQuery(threadBodyHay(t), q);
  }

  /** When searching, include enrolled families from Contacts even with no WhatsApp history yet. */
  function directoryThreadsMatchingQuery() {
    var qRaw = String(state.query || "").trim();
    var q = foldSearchText(qRaw);
    if (q.length < 2) return [];
    var outcome = String(state.outcome || "all").toLowerCase();
    if (outcome && outcome !== "all") return [];
    var existing = Object.create(null);
    (state.threads || []).forEach(function (t) {
      var d = phoneDigits(t.phone || t.sendPhone || "");
      if (d) existing[d] = true;
      var key = phoneMatchKey(t.phone || t.sendPhone || "");
      if (key) existing[key] = true;
    });
    var out = [];
    (state.contactDirectory || []).forEach(function (c) {
      if (!c || !c.mobile) return;
      var digits = c.sendDigits || canonicalPhoneDigits(c.mobile) || phoneDigits(c.mobile);
      if (!digits || existing[digits] || existing[c.matchKey]) return;
      var hay = foldSearchText(
        [c.parent, c.child, c.mobile, digits, c.contactId].join(" ")
      );
      if (!phoneQueryMatches(c.mobile, qRaw) && !phoneQueryMatches(digits, qRaw) && !hayMatchesQuery(hay, q)) {
        return;
      }
      out.push({
        key: digits,
        channel: "whatsapp",
        name: c.parent || c.child || ("+" + digits),
        parentName: c.parent || "",
        waContact: c.parent || "",
        client: c.child || "",
        phone: digits,
        sendPhone: digits,
        profilePhone: digits,
        phoneFromProfile: true,
        events: [],
        lastAt: "",
        hasInbound: false,
        hasFailed: false,
        hasSent: false,
        lastInboundId: "",
        lastInboundAt: "",
        lastOutboundAt: "",
        lastInboundWaId: "",
        fromDirectory: true,
      });
      existing[digits] = true;
    });
    return out;
  }

  function findThread(key) {
    var want = String(key || "");
    for (var i = 0; i < (state.threads || []).length; i++) {
      if (state.threads[i].key === want) return state.threads[i];
    }
    var dir = directoryThreadsMatchingQuery();
    for (var j = 0; j < dir.length; j++) {
      if (dir[j].key === want) return dir[j];
    }
    return null;
  }

  function renderMedia(ev) {
    if (!ev || !ev.mediaUrl) return "";
    var url = esc(ev.mediaUrl);
    var mime = String(ev.mediaMime || "").toLowerCase();
    var type = String(ev.messageType || "").toLowerCase();
    var asImage =
      mime.indexOf("image") === 0 ||
      type === "image" ||
      type === "sticker" ||
      /\.(webp|png|jpe?g|gif)(\?|$)/i.test(String(ev.mediaUrl || ""));
    if (asImage) {
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener"><img class="portal-pnlog-bubble__img' +
        (type === "sticker" ? " portal-pnlog-bubble__img--sticker" : "") +
        '" src="' +
        url +
        '" alt="' +
        esc(type === "sticker" ? "Sticker" : ev.messageType || "image") +
        '" loading="lazy" /></a>'
      );
    }
    if (mime.indexOf("video") === 0 || type === "video") {
      return '<video class="portal-pnlog-bubble__img" src="' + url + '" controls playsinline></video>';
    }
    if (mime.indexOf("audio") === 0 || type === "audio") {
      return '<audio class="portal-pnlog-bubble__audio" src="' + url + '" controls preload="auto"></audio>';
    }
    return (
      '<a class="portal-pnlog-bubble__file" href="' +
      url +
      '" target="_blank" rel="noopener">Open attachment</a>'
    );
  }

  function eventWaMessageId(ev) {
    if (!ev || !ev.row) return "";
    if (ev.dir === "in") return String(ev.row.wa_message_id || "").trim();
    return String(ev.row.whatsapp_message_id || "").trim();
  }

  function canReplyToEvent(ev) {
    var id = eventWaMessageId(ev);
    if (!id || id.indexOf("app:") === 0) return false;
    if (ev.messageType === "reaction") return false;
    if (ev.dir === "out" && String(ev.status || "").toLowerCase() === "failed") return false;
    return true;
  }

  function replyPreviewForEvent(ev) {
    var bodyStr = String((ev && ev.body) || "").trim();
    var type = String((ev && ev.messageType) || "").toLowerCase();
    if (/^\[(sticker|image|video|audio|document)\]$/i.test(bodyStr)) {
      return bodyStr.replace(/^\[|\]$/g, "").replace(/^\w/, function (c) {
        return c.toUpperCase();
      });
    }
    if (bodyStr) return bodyPreview(bodyStr);
    if (type === "image" || type === "sticker") return type === "sticker" ? "Sticker" : "Photo";
    if (type === "audio" || type === "video" || type === "document") {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
    return "Message";
  }

  function renderBubble(ev) {
    var side = ev.dir === "in" ? "in" : "out";
    var metaBits = [];
    var errTip = "";
    if (ev.dir === "out") {
      if (ev.kind) metaBits.push(esc(kindLabel(ev.kind)));
      errTip = ev.status === "failed" ? friendlyWaError(ev.errorDetail || (ev.row && ev.row.error_detail)) : "";
      metaBits.push(statusChip(ev.status, ev.channel, errTip || (ev.row && ev.row.error_detail)));
      if (ev.sentBy) metaBits.push(esc(ev.sentBy));
      if (ev.row && ev.row.meta && ev.row.meta.edited_at) {
        metaBits.push('<span class="portal-pnlog-chip portal-pnlog-chip--edited">Edited</span>');
      }
    } else if (ev.fromApp) {
      metaBits.push('<span class="portal-pnlog-chip portal-pnlog-chip--parent-app">Parent app</span>');
    } else {
      metaBits.push('<span class="portal-pnlog-chip portal-pnlog-chip--phone">Phone</span>');
    }
    metaBits.push('<span class="portal-pnlog-bubble__time">' + esc(formatLondon(ev.when)) + "</span>");
    var mediaHtml = renderMedia(ev);
    var bodyStr = String(ev.body || "");
    var isReaction = ev.messageType === "reaction";
    var type = String(ev.messageType || "").toLowerCase();
    var isMediaPlaceholder =
      /^\[(sticker|image|video|audio|document)\]$/i.test(bodyStr.trim());
    var contentHtml = "";
    if (isReaction) {
      contentHtml = '<div class="portal-pnlog-bubble__reaction">' + esc(bodyStr) + "</div>";
    } else if (mediaHtml && isMediaPlaceholder) {
      contentHtml = "";
    } else if (!mediaHtml && isMediaPlaceholder) {
      contentHtml =
        '<div class="portal-pnlog-bubble__text portal-pnlog-bubble__text--muted">' +
        (type === "sticker"
          ? "Sticker (file not saved)"
          : bodyStr.replace(/^\[|\]$/g, "").replace(/^\w/, function (c) {
              return c.toUpperCase();
            }) + " (file not saved)") +
        "</div>";
    } else if (bodyStr && !isMediaPlaceholder) {
      contentHtml =
        '<div class="portal-pnlog-bubble__text">' +
        esc(bodyStr).replace(/\r\n/g, "\n").replace(/\n/g, "<br>") +
        "</div>";
    }
    var errHtml =
      errTip
        ? '<div class="portal-pnlog-bubble__err" style="margin-top:6px;font-size:11px;line-height:1.35;color:#b91c1c;overflow-wrap:anywhere">' +
          esc(errTip) +
          "</div>"
        : "";
    var waMid = eventWaMessageId(ev);
    var replySelected =
      state.replyTo &&
      state.replyTo.waMessageId &&
      waMid &&
      state.replyTo.waMessageId === waMid;
    var actionHtml = "";
    if (canReplyToEvent(ev)) {
      actionHtml +=
        '<button type="button" class="portal-pnlog-bubble__reply' +
        (replySelected ? " is-active" : "") +
        '" data-reply-wa-id="' +
        esc(waMid) +
        '" title="Reply to this message (quote in WhatsApp)">Reply</button>';
    }
    if (
      ev.dir === "out" &&
      bodyStr &&
      !isMediaPlaceholder &&
      !isReaction &&
      !mediaHtml &&
      ev.status !== "failed" &&
      ev.id &&
      waMid &&
      !String(waMid).startsWith("app:")
    ) {
      actionHtml +=
        '<button type="button" class="portal-pnlog-bubble__edit" data-edit-log-id="' +
        esc(String(ev.id)) +
        '" data-edit-wa-id="' +
        esc(waMid) +
        '" title="Send a quoted correction (WhatsApp cannot rewrite the old bubble)">Correct</button>';
    }
    return (
      '<div class="portal-pnlog-bubble portal-pnlog-bubble--' +
      side +
      (replySelected ? " portal-pnlog-bubble--replying" : "") +
      '"' +
      (waMid ? ' data-wa-id="' + esc(waMid) + '"' : "") +
      ">" +
      mediaHtml +
      contentHtml +
      errHtml +
      '<div class="portal-pnlog-bubble__meta">' +
      metaBits.join(" ") +
      (actionHtml ? '<span class="portal-pnlog-bubble__actions">' + actionHtml + "</span>" : "") +
      "</div></div>"
    );
  }

  function captureComposerDraft() {
    var ta = document.getElementById("portalPnlogComposerInput");
    if (!ta || !state.selectedKey) return;
    state.draftByKey[state.selectedKey] = ta.value;
  }

  function syncComposerSendingState() {
    var ta = document.getElementById("portalPnlogComposerInput");
    var btn = document.getElementById("portalPnlogComposerSend");
    var thread = findThread(state.selectedKey);
    var mediaAllowed = threadHasOpenWhatsappSession(thread);
    if (ta) ta.disabled = !!state.sending;
    if (btn) {
      btn.disabled = !!state.sending;
      btn.textContent = state.sending
        ? state.editing
          ? "Saving…"
          : "Sending…"
        : state.editing
          ? "Save edit"
          : "Send";
    }
    [
      "portalPnlogComposerPhoto",
      "portalPnlogComposerDocument",
      "portalPnlogComposerAudio",
    ].forEach(function (id) {
      var tool = document.getElementById(id);
      if (tool) tool.disabled = !!state.sending || !mediaAllowed || !!state.editing;
    });
  }

  function composerPhoneKey(t) {
    if (!t) return "";
    // Thread WhatsApp id — not a redirected profile phone.
    return String(t.phone || t.sendPhone || "");
  }

  function clearEditing() {
    state.editing = null;
  }

  function clearReplyTo() {
    state.replyTo = null;
  }

  function startReplyToMessage(waMessageId, preview, side) {
    var t = findThread(state.selectedKey);
    if (!t) return;
    var id = String(waMessageId || "").trim();
    if (!id || id.indexOf("app:") === 0) {
      cfg.toast("This message cannot be quoted (no WhatsApp id).", "err");
      return;
    }
    clearEditing();
    state.replyTo = {
      waMessageId: id,
      preview: String(preview || "Message").slice(0, 120),
      side: side === "in" ? "in" : "out",
      threadKey: t.key,
    };
    clearComposerAttach();
    state.composerSig = "";
    state.threadRefresh.sig = "";
    mountComposer(t, true);
    var threadEl = document.getElementById("portalPnlogThread");
    if (threadEl) {
      threadEl.innerHTML = renderThreadMessagesHtml(t);
    }
    var ta = document.getElementById("portalPnlogComposerInput");
    if (ta) {
      try {
        ta.focus();
      } catch (_f) {}
    }
    syncComposerSendingState();
  }

  function startEditOutbound(logId, waMessageId, bodyText) {
    var t = findThread(state.selectedKey);
    if (!t) return;
    clearReplyTo();
    state.editing = {
      logId: String(logId || ""),
      waMessageId: String(waMessageId || ""),
      threadKey: t.key,
    };
    state.draftByKey[t.key] = String(bodyText || "");
    clearComposerAttach();
    state.composerSig = "";
    state.threadRefresh.sig = "";
    mountComposer(t, true);
    var editThreadEl = document.getElementById("portalPnlogThread");
    if (editThreadEl) editThreadEl.innerHTML = renderThreadMessagesHtml(t);
    var ta = document.getElementById("portalPnlogComposerInput");
    if (ta) {
      ta.value = String(bodyText || "");
      try {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (_f) {}
    }
    var statusEl = document.getElementById("portalPnlogComposerStatus");
    if (statusEl) {
      statusEl.textContent =
        "Correcting — WhatsApp Cloud API cannot rewrite a sent bubble. Save sends a reply that quotes the original to " +
        (t.name || "this parent") +
        " (" +
        threadPhoneForUi(t) +
        "), and updates this thread in the portal.";
    }
    syncComposerSendingState();
  }

  function renderPaneHeadHtml(t) {
    if (!t) return "";
    var title = t.name;
    if (t.client && namesRoughlySame(title, t.client) && t.waContact && !namesRoughlySame(t.waContact, t.client)) {
      title = t.waContact;
    }
    var participant = t.client || "";
    var enrolledHtml = participant ? enrolledChipsForClient(participant) : "";
    var subline = threadPhoneForUi(t) + (participant ? " · " + participant : "");
    return (
      '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-pane-back" id="portalPnlogBack">← Back</button>' +
      '<div class="portal-pnlog-pane-head__text">' +
      '<div class="portal-pnlog-pane-head__who">' +
      esc(title) +
      "</div>" +
      '<div class="portal-pnlog-pane-head__sub-row">' +
      '<div class="portal-pnlog-pane-head__sub muted">' +
      esc(subline) +
      "</div>" +
      enrolledHtml +
      "</div></div>"
    );
  }

  function renderThreadMessagesHtml(t) {
    if (!t) return "";
    if (!t.events.length) {
      return '<p class="muted portal-pnlog-empty">No messages in this thread yet.</p>';
    }
    return t.events.map(renderBubble).join("");
  }

  function threadEventsSig(t) {
    if (!t || !Array.isArray(t.events)) return "";
    return t.events
      .map(function (ev) {
        return [
          ev.id || "",
          ev.when || "",
          ev.dir || "",
          ev.body || "",
          ev.mediaUrl || "",
          ev.whatsapp_delivered_at || "",
          ev.whatsapp_read_at || "",
          ev.whatsapp_status || "",
        ].join("\x1f");
      })
      .join("\n");
  }

  function ensureChatShell(host) {
    var shell = host.querySelector("#portalPnlogChatShell");
    if (shell) return shell;
    host.innerHTML =
      '<div class="portal-pnlog-chat" id="portalPnlogChatShell">' +
      '<aside class="portal-pnlog-chat__list" aria-label="Conversations">' +
      '<div class="portal-pnlog-chat__list-inner" id="portalPnlogListInner"></div></aside>' +
      '<section class="portal-pnlog-chat__pane" aria-label="Thread">' +
      '<div class="portal-pnlog-pane-empty" id="portalPnlogPaneEmpty">' +
      "<p><strong>Select a conversation</strong></p>" +
      '<p class="muted">WhatsApp threads with families appear on the left. Replies send via the Business API number.</p>' +
      "</div>" +
      '<div class="portal-pnlog-pane-active" id="portalPnlogPaneActive" hidden>' +
      '<div class="portal-pnlog-pane-head" id="portalPnlogPaneHead"></div>' +
      '<div class="portal-pnlog-thread-scroll" id="portalPnlogThreadScroll">' +
      '<div class="portal-pnlog-thread" id="portalPnlogThread"></div></div>' +
      '<div id="portalPnlogComposerMount"></div>' +
      "</div></section></div>";
    return host.querySelector("#portalPnlogChatShell");
  }

  function mountComposer(t, force) {
    var mount = document.getElementById("portalPnlogComposerMount");
    if (!mount) return;
    var phoneKey = composerPhoneKey(t);
    var replyKey =
      state.replyTo && state.replyTo.threadKey === (t && t.key)
        ? state.replyTo.waMessageId || ""
        : "";
    var editKey = state.editing && state.editing.threadKey === (t && t.key) ? state.editing.logId || "" : "";
    var sessionKey = threadHasOpenWhatsappSession(t) ? "open" : "cold";
    var nextSig =
      (t && t.key ? t.key : "") +
      "|" +
      phoneKey +
      "|" +
      (phoneKey ? "ok" : "none") +
      "|" +
      sessionKey +
      "|r:" +
      replyKey +
      "|e:" +
      editKey;
    var paneActive = document.getElementById("portalPnlogPaneActive");
    if (paneActive) {
      paneActive.classList.toggle(
        "portal-pnlog-pane-active--tpl",
        !!(t && !threadHasOpenWhatsappSession(t) && phoneKey),
      );
    }
    if (!force && state.composerSig === nextSig && mount.querySelector("#portalPnlogComposerInput, .portal-pnlog-composer--disabled")) {
      syncComposerSendingState();
      return;
    }
    state.composerSig = nextSig;
    mount.innerHTML = renderComposer(t);
    syncComposerSendingState();
    syncColdTemplatePreview();
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
    if (next !== state.selectedKey) {
      clearComposerAttach();
      clearEditing();
      clearReplyTo();
    }
    state.selectedKey = next;
    if (next) {
      state.mobileShowThread = true;
      var t = findThread(next);
      if (t) markThreadSeen(next, t.lastInboundAt || "");
      state.stickToBottom = true;
      state.threadRefresh.sig = "";
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
    var sub = t.events.length
      ? bodyPreview(t.events[t.events.length - 1].body)
      : t.fromDirectory
        ? "No WhatsApp history yet — open to send a first message"
        : "";
    var subline = threadPhoneForUi(t) + (t.client ? " · " + t.client : "");
    var headName = t.name;
    // If title still equals the participant, show a clearer label.
    if (t.client && namesRoughlySame(headName, t.client) && t.waContact && !namesRoughlySame(t.waContact, t.client)) {
      headName = t.waContact;
    }
    return (
      '<button type="button" class="portal-pnlog-conv' +
      sel +
      (unread ? " portal-pnlog-conv--unread" : "") +
      '" data-thread-key="' +
      esc(t.key) +
      '">' +
      '<span class="portal-pnlog-conv__top">' +
      '<span class="portal-pnlog-conv__who">' +
      esc(headName) +
      "</span>" +
      '<span class="portal-pnlog-conv__when muted">' +
      esc(formatLondonShort(adminWaThreadListWhen(t))) +
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

  function renderComposer(t) {
    if (!t || !(t.sendPhone || t.phone)) {
      return (
        '<div class="portal-pnlog-composer portal-pnlog-composer--disabled">' +
        '<p class="muted" style="margin:0">No WhatsApp number for this thread.</p></div>'
      );
    }
    var draft = state.draftByKey[t.key] != null ? state.draftByKey[t.key] : "";
    var disabled = state.sending ? " disabled" : "";
    var openSession = threadHasOpenWhatsappSession(t);
    var needsTemplate = !openSession && !state.editing;
    var mediaDisabled = !openSession || state.sending || state.editing ? " disabled" : "";
    var toName = t.name || t.parentName || "Parent";
    var toPhone = threadPhoneForUi(t);
    var editingNote = state.editing
      ? '<p class="portal-pnlog-composer__edit-banner" role="status">Correcting a sent message — WhatsApp will quote the original; check the recipient below before sending.</p>'
      : "";
    var replyNote = "";
    if (state.replyTo && state.replyTo.threadKey === t.key && !state.editing) {
      var quoteWorks = openSession;
      replyNote =
        '<div class="portal-pnlog-composer__reply-banner" role="status">' +
        '<div class="portal-pnlog-composer__reply-banner-main">' +
        "<strong>Replying to</strong> · " +
        esc(state.replyTo.side === "in" ? "parent" : "our message") +
        ": " +
        esc(state.replyTo.preview || "Message") +
        (!quoteWorks
          ? '<span class="portal-pnlog-composer__reply-banner-warn"> Quote appears in WhatsApp only while the 24-hour reply window is open (parent messaged recently).</span>'
          : "") +
        "</div>" +
        '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerCancelReply">Cancel</button>' +
        "</div>";
    }
    var sessionNote = "";
    var templateShell = "";
    var textareaPlaceholder = "Type a WhatsApp reply…";
    var textareaMax = "4000";
    if (needsTemplate) {
      sessionNote =
        '<div class="portal-pnlog-composer__tpl-banner" role="status">' +
        "<strong>Needs Meta template</strong> — no open 24h window. " +
        "Edit only <code>{{1}}</code> below. <strong>Chat history stays above — scroll it to read.</strong>" +
        "</div>";
      templateShell =
        '<div class="portal-pnlog-composer__tpl-shell">' +
        '<div class="portal-pnlog-composer__tpl-fixed" aria-hidden="true">' +
        esc(WA_COLD_TEMPLATE_PREFIX.trim()) +
        "</div>" +
        '<label class="portal-pnlog-composer__tpl-mid-lab muted" for="portalPnlogComposerInput">Editable {{1}}</label>';
      textareaPlaceholder =
        "Write {{1}} here — use a blank line between paragraphs (Meta cannot keep real line breaks; preview shows them as separate lines)…";
      textareaMax = String(WA_TEMPLATE_BODY_MAX);
    } else if (openSession && !state.editing) {
      sessionNote =
        '<p class="portal-pnlog-composer__session-open muted" role="status">24h window open — free-text reply (no Meta template).</p>';
    }
    var afterTextarea = needsTemplate
      ? '<div class="portal-pnlog-composer__tpl-fixed" aria-hidden="true">' +
        esc(WA_COLD_TEMPLATE_SUFFIX.trim()) +
        "</div></div>" +
        '<p id="portalPnlogTplLen" class="portal-pnlog-composer__tpl-len muted"></p>' +
        coldTemplatePreviewHtml(draft)
      : "";
    return (
      '<div class="portal-pnlog-composer' +
      (needsTemplate ? " portal-pnlog-composer--tpl" : "") +
      '">' +
      editingNote +
      replyNote +
      sessionNote +
      '<p class="portal-pnlog-composer__to" title="Messages always go to this WhatsApp number">' +
      "<strong>To:</strong> " +
      esc(toName) +
      " · " +
      esc(toPhone) +
      "</p>" +
      (needsTemplate
        ? state.editing
          ? '<div class="portal-pnlog-composer__tools">' +
            '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerCancelEdit">Cancel</button>' +
            "</div>"
          : ""
        : '<div class="portal-pnlog-composer__tools">' +
          '<input type="file" id="portalPnlogComposerFile" accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden />' +
          '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerPhoto"' +
          mediaDisabled +
          ">📷 Photo</button>" +
          '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerDocument"' +
          mediaDisabled +
          ">📎 Document</button>" +
          '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerAudio"' +
          mediaDisabled +
          ">🎙 Audio</button>" +
          '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerClearAttach" hidden>✕ Clear</button>' +
          (state.editing
            ? '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-composer__tool" id="portalPnlogComposerCancelEdit">Cancel</button>'
            : "") +
          '<span id="portalPnlogComposerAttachPreview" class="portal-pnlog-composer__attach-preview muted"></span>' +
          "</div>") +
      templateShell +
      '<textarea id="portalPnlogComposerInput" class="portal-pnlog-composer__input' +
      (needsTemplate ? " portal-pnlog-composer__input--tpl" : "") +
      '" rows="' +
      (needsTemplate ? "3" : "4") +
      '" placeholder="' +
      esc(textareaPlaceholder) +
      '" maxlength="' +
      textareaMax +
      '" autocomplete="off" spellcheck="true"' +
      disabled +
      ">" +
      esc(draft) +
      "</textarea>" +
      afterTextarea +
      '<div class="portal-pnlog-composer__bar">' +
      '<p id="portalPnlogComposerStatus" class="portal-pnlog-composer__status muted" role="status"></p>' +
      '<button type="button" class="btn btn--pri portal-pnlog-composer__send" id="portalPnlogComposerSend"' +
      disabled +
      ">" +
      (state.sending
        ? state.editing
          ? "Sending correction…"
          : "Sending…"
        : state.editing
          ? "Send correction"
          : needsTemplate
            ? "Send template"
            : "Send") +
      "</button></div></div>"
    );
  }

  function renderChat(fromRefresh) {
    var host = document.getElementById("portalParentNotifyLogList");
    var countEl = document.getElementById("portalParentNotifyLogCount");
    if (!host) return;

    captureComposerDraft();

    var prevThreadScroll = document.getElementById("portalPnlogThreadScroll");
    var prevListScroll = document.getElementById("portalPnlogListInner") || host.querySelector(".portal-pnlog-chat__list-inner");
    var savedListTop = prevListScroll ? prevListScroll.scrollTop : 0;
    var savedThreadTop = prevThreadScroll ? prevThreadScroll.scrollTop : 0;
    var wasComposing =
      document.activeElement && document.activeElement.id === "portalPnlogComposerInput";
    var selStart = wasComposing ? document.activeElement.selectionStart : null;
    var selEnd = wasComposing ? document.activeElement.selectionEnd : null;
    if (fromRefresh && prevThreadScroll) {
      state.stickToBottom = isNearBottom(prevThreadScroll);
    }

    var threads = (state.threads || [])
      .concat(directoryThreadsMatchingQuery())
      .filter(threadMatches)
      .sort(compareAdminWaThreads);
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
        " · latest first";
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
        state.composerSig = "";
      }
    }

    var selected = state.selectedKey ? findThread(state.selectedKey) : null;
    var listHtml = threads.length
      ? threads.map(renderConvListItem).join("")
      : '<p class="muted portal-pnlog-empty">No WhatsApp conversations match your filters. Outbound sends and inbound replies to the API number appear here.</p>';

    var shell = ensureChatShell(host);
    shell.className =
      "portal-pnlog-chat" +
      (state.mobileShowThread && state.selectedKey ? " portal-pnlog-chat--thread" : "");

    var listInner = document.getElementById("portalPnlogListInner");
    if (listInner) listInner.innerHTML = listHtml;

    var emptyEl = document.getElementById("portalPnlogPaneEmpty");
    var activeEl = document.getElementById("portalPnlogPaneActive");
    var headEl = document.getElementById("portalPnlogPaneHead");
    var threadEl = document.getElementById("portalPnlogThread");

    if (!selected) {
      if (emptyEl) emptyEl.hidden = false;
      if (activeEl) {
        activeEl.hidden = true;
        activeEl.classList.remove("portal-pnlog-pane-active--tpl");
      }
      state.composerSig = "";
      var mountClear = document.getElementById("portalPnlogComposerMount");
      if (mountClear) mountClear.innerHTML = "";
    } else {
      if (emptyEl) emptyEl.hidden = true;
      if (activeEl) activeEl.hidden = false;
      if (headEl) headEl.innerHTML = renderPaneHeadHtml(selected);
      if (threadEl) {
        var threadHtml = renderThreadMessagesHtml(selected);
        var threadSig =
          String(selected.key || "") +
          "::" +
          threadEventsSig(selected) +
          "::reply:" +
          (state.replyTo && state.replyTo.threadKey === selected.key
            ? state.replyTo.waMessageId || ""
            : "");
        var maybeUpdate =
          typeof global.portalWaMaybeUpdateThreadHost === "function"
            ? global.portalWaMaybeUpdateThreadHost
            : function (host, html) {
                if (host) host.innerHTML = html;
                return true;
              };
        maybeUpdate(threadEl, threadHtml, threadSig, {
          fromRefresh: !!fromRefresh,
          state: state.threadRefresh,
        });
        if (typeof global.portalWaBindThreadMediaDefer === "function") {
          global.portalWaBindThreadMediaDefer(threadEl, function () {
            if (state.threadRefresh.deferRefresh) {
              state.threadRefresh.deferRefresh = false;
              renderChat(true);
            }
          });
        }
      }
      // Keep the same textarea node while typing / on poll so Grammarly + focus stay.
      mountComposer(selected, !fromRefresh && !wasComposing);
      syncComposerSendingState();
    }

    bindChatInteractions();

    // Poll/realtime updates list + bubbles only — restore scroll; restore caret if we had to remount.
    global.requestAnimationFrame(function () {
      var listEl = document.getElementById("portalPnlogListInner");
      if (listEl && fromRefresh) {
        listEl.scrollTop = savedListTop;
      }
      if (selected) {
        if (fromRefresh && !state.stickToBottom) {
          var scrollEl = document.getElementById("portalPnlogThreadScroll");
          if (scrollEl) scrollEl.scrollTop = savedThreadTop;
        } else {
          scrollThreadToBottom(!fromRefresh || state.stickToBottom);
        }
        if (wasComposing) {
          var ta = document.getElementById("portalPnlogComposerInput");
          if (ta) {
            try {
              ta.focus();
              if (selStart != null && selEnd != null && typeof ta.setSelectionRange === "function") {
                ta.setSelectionRange(selStart, selEnd);
              }
            } catch (_f2) {}
          }
        }
      }
    });
  }

  function threadHasOpenWhatsappSession(t) {
    if (!t || !Array.isArray(t.events)) return false;
    var cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (var i = t.events.length - 1; i >= 0; i--) {
      var ev = t.events[i];
      if (!ev || ev.dir !== "in") continue;
      var when = Date.parse(ev.when || "");
      return Number.isFinite(when) && when >= cutoff;
    }
    return false;
  }

  /**
   * Meta rejects newlines/tabs in template {{1}}.
   * Blank line (paragraph) → " — " · single line break → " · "
   * Preview re-expands those markers to real line breaks for the admin.
   */
  function flattenForWhatsappTemplate(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\t+/g, " ")
      .replace(/\n{2,}/g, "\n<<P>>\n")
      .replace(/\n/g, " · ")
      .replace(/(?:\s*·\s*)?<<P>>(?:\s*·\s*)?/g, " — ")
      .replace(/ {5,}/g, "    ")
      .replace(/\s{2,}/g, " ")
      .replace(/(?: · ){2,}/g, " · ")
      .replace(/(?: — ){2,}/g, " — ")
      .trim()
      .slice(0, WA_TEMPLATE_BODY_MAX);
  }

  /** Admin preview only: show Meta-safe markers as paragraphs/lines. */
  function coldTemplateVarHtml(flat) {
    return esc(flat || "…")
      .replace(/ — /g, "<br><br>")
      .replace(/ · /g, "<br>");
  }

  function coldTemplatePreviewHtml(body) {
    var mid = flattenForWhatsappTemplate(body);
    return (
      '<div class="portal-pnlog-composer__tpl-preview" id="portalPnlogTplPreview" aria-live="polite">' +
      '<div class="portal-pnlog-composer__tpl-preview-lab">WhatsApp will send</div>' +
      '<div class="portal-pnlog-composer__tpl-preview-body">' +
      esc(WA_COLD_TEMPLATE_PREFIX) +
      '<span class="portal-pnlog-composer__tpl-var">' +
      coldTemplateVarHtml(mid) +
      "</span>" +
      esc(WA_COLD_TEMPLATE_SUFFIX) +
      "</div></div>"
    );
  }

  function syncColdTemplatePreview() {
    var ta = document.getElementById("portalPnlogComposerInput");
    var prev = document.getElementById("portalPnlogTplPreview");
    var lenEl = document.getElementById("portalPnlogTplLen");
    if (!ta || !prev) return;
    var flat = flattenForWhatsappTemplate(ta.value);
    var varEl = prev.querySelector(".portal-pnlog-composer__tpl-var");
    if (varEl) varEl.innerHTML = coldTemplateVarHtml(flat);
    if (lenEl) {
      var n = flat.length;
      lenEl.textContent =
        n +
        " / " +
        WA_TEMPLATE_BODY_MAX +
        " characters in {{1}}" +
        (n >= WA_TEMPLATE_BODY_MAX ? " — at limit" : "");
      lenEl.classList.toggle("is-over", n >= WA_TEMPLATE_BODY_MAX);
    }
  }

  function syncAudioButton() {
    var btn = document.getElementById("portalPnlogComposerAudio");
    if (!btn) return;
    btn.textContent = state.recording ? "⏹ Stop recording" : "🎙 Audio";
  }

  async function toggleComposerAudio() {
    if (state.recording && state.mediaRecorder) {
      try {
        state.mediaRecorder.stop();
      } catch (_e) {}
      return;
    }
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cfg.toast("Voice recording is not supported on this device", "err");
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mime = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mime = "audio/ogg;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
        else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
      }
      state.recordChunks = [];
      state.mediaRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      state.recording = true;
      syncAudioButton();
      state.mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) state.recordChunks.push(ev.data);
      };
      state.mediaRecorder.onstop = function () {
        state.recording = false;
        syncAudioButton();
        try {
          stream.getTracks().forEach(function (track) {
            track.stop();
          });
        } catch (_stop) {}
        var blobMime =
          (state.mediaRecorder && state.mediaRecorder.mimeType) || mime || "audio/webm";
        var blob = new Blob(state.recordChunks, { type: blobMime });
        var ext =
          blobMime.indexOf("ogg") >= 0
            ? "ogg"
            : blobMime.indexOf("mp4") >= 0
              ? "m4a"
              : "webm";
        setComposerAttach(blob, "voice-note." + ext, blobMime);
        state.mediaRecorder = null;
        state.recordChunks = [];
      };
      state.mediaRecorder.start();
    } catch (_e) {
      state.recording = false;
      syncAudioButton();
      cfg.toast("Microphone permission is needed for voice notes", "err");
    }
  }

  function sendComposerReply() {
    if (state.sending) return;
    var t = findThread(state.selectedKey);
    if (!t || !(t.phone || t.sendPhone)) return;
    var ta = document.getElementById("portalPnlogComposerInput");
    var statusEl = document.getElementById("portalPnlogComposerStatus");
    var btn = document.getElementById("portalPnlogComposerSend");
    var msgBody = ta ? String(ta.value || "").trim() : "";
    if (!msgBody && !state.attach) {
      if (statusEl) statusEl.textContent = "Write a message or attach a photo, document or audio.";
      return;
    }
    if (!ensureParentNotifySendConfigured()) {
      if (statusEl) statusEl.textContent = "Send module not loaded — refresh the page.";
      return;
    }
    // Always the open WhatsApp thread — never another co-parent's profile mobile.
    var sendDigits =
      canonicalPhoneDigits(t.sendPhone) ||
      phoneDigits(t.sendPhone) ||
      canonicalPhoneDigits(t.phone) ||
      phoneDigits(t.phone);
    var ov = knownWaThreadOverride(sendDigits || t.phone);
    var ctx = threadContextForPhone(t.phone);
    if (ov) {
      ctx.parentName = ov.parentName;
      ctx.clientDisplay = ov.client;
    } else {
      if (!ctx.clientDisplay && t.client) ctx.clientDisplay = t.client;
      if (!ctx.parentName && t.name) ctx.parentName = t.name;
      /* Prefer live directory labels for this WhatsApp number over a prior mis-stamp. */
      var dirHit = findContactForThread(t, state.contactDirectory || []);
      if (dirHit) {
        if (dirHit.parent) ctx.parentName = dirHit.parent;
        if (dirHit.child) ctx.clientDisplay = dirHit.child;
      }
    }
    if (ov && statusEl && !state.editing) {
      /* Keep the To: line honest before send. */
    }
    var openSession = threadHasOpenWhatsappSession(t);
    if (state.attach && !openSession) {
      if (statusEl) {
        statusEl.textContent =
          "Attachments can only be sent within 24 hours after the parent messages the WhatsApp API number.";
      }
      return;
    }
    var editing = state.editing;
    if (editing && (!editing.waMessageId || String(editing.waMessageId).startsWith("app:"))) {
      var noId =
        "This message has no WhatsApp id — cannot correct it as a quote. Send a new message instead.";
      if (statusEl) statusEl.textContent = noId;
      else cfg.toast(noId, "err");
      return;
    }
    var contextWaId = "";
    if (editing && editing.waMessageId) {
      contextWaId = String(editing.waMessageId).trim();
    } else if (
      openSession &&
      state.replyTo &&
      state.replyTo.threadKey === t.key &&
      state.replyTo.waMessageId
    ) {
      contextWaId = String(state.replyTo.waMessageId).trim();
    } else if (openSession && t.lastInboundId) {
      for (var i = t.events.length - 1; i >= 0; i--) {
        if (t.events[i].dir === "in" && t.events[i].row) {
          contextWaId = String(
            t.events[i].row.wa_message_id || t.events[i].row.context_wa_id || ""
          ).trim();
          break;
        }
      }
    }
    /* Cold outbound uses a Meta template; {{1}} must stay short (Meta #132005).
       Quote-corrections always use free-text with context (need open 24h window). */
    var sendKind = editing || openSession ? "custom" : "contact_update";
    var sendBody = msgBody;
    if (!openSession && !editing) {
      var flatLen = String(msgBody || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim().length;
      if (flatLen > WA_TEMPLATE_BODY_MAX) {
        var tooLong =
          "Too long for WhatsApp template (" +
          flatLen +
          " chars; max ~" +
          WA_TEMPLATE_BODY_MAX +
          "). Paste the short WhatsApp text, or use Family broadcast (email = full body, WhatsApp = short field).";
        if (statusEl) statusEl.textContent = tooLong;
        else cfg.toast(tooLong, "err");
        return;
      }
      sendBody = flattenForWhatsappTemplate(msgBody);
    }
    if (editing && !openSession) {
      var closed =
        "Corrections need an open WhatsApp session (parent messaged within 24h). Ask them to reply first, then correct.";
      if (statusEl) statusEl.textContent = closed;
      else cfg.toast(closed, "err");
      return;
    }
    state.sending = true;
    state.draftByKey[t.key] = msgBody;
    if (btn) {
      btn.disabled = true;
      btn.textContent = editing ? "Sending correction…" : "Sending…";
    }
    if (ta) ta.disabled = true;
    if (statusEl) {
      statusEl.textContent = editing
        ? "Sending quoted correction to " + (t.name || "parent") + " · " + threadPhoneForUi(t) + "…"
        : openSession
          ? "Sending to " + (t.name || "parent") + " · " + threadPhoneForUi(t) + "…"
          : "No open WhatsApp session — sending via approved template to " +
            (t.name || "parent") +
            " · " +
            threadPhoneForUi(t) +
            "…";
    }

    var sendPayload = {
      kind: sendKind,
      channel: "whatsapp",
      parentName: ctx.parentName || t.name || "",
      parentWhatsapp: sendDigits,
      subject: replySubject(ctx.clientDisplay || t.client, ctx.parentName || t.name),
      body: sendBody,
      clientDisplay: ctx.clientDisplay || t.client || null,
      sessionDate: ctx.sessionDate || null,
      venue: ctx.venue || null,
      contextWaId: contextWaId || null,
    };
    if (editing && editing.waMessageId) {
      sendPayload.editWhatsappMessageId = editing.waMessageId;
      sendPayload.contextWaId = editing.waMessageId;
    }
    if (editing && editing.logId) {
      sendPayload.replacesLogId = editing.logId;
    }
    if (state.attach) {
      sendPayload.mediaBase64 = state.attach.base64;
      sendPayload.mediaMime = state.attach.mime;
      sendPayload.mediaFilename = state.attach.filename;
    }
    void global.PortalParentNotifySend.send(sendPayload)
      .then(function (res) {
        state.sending = false;
        if (!res || !res.ok) {
          var err = formatSendError(res && res.error, res && res.data);
          if (statusEl) statusEl.textContent = err;
          else cfg.toast(err, "err");
          syncComposerSendingState();
          return;
        }
        state.draftByKey[t.key] = "";
        clearEditing();
        clearReplyTo();
        var msg =
          res.data && res.data.corrected
            ? "Correction sent as a quoted reply (WhatsApp cannot edit the old bubble)."
            : res.data && res.data.edited
              ? "Message updated on WhatsApp."
              : global.PortalParentNotifySend && typeof global.PortalParentNotifySend.formatSendResult === "function"
                ? global.PortalParentNotifySend.formatSendResult(res.data)
                : "Sent.";
        cfg.toast(msg, "ok");
        state.stickToBottom = true;
        markThreadSeen(t.key, new Date().toISOString());
        if (ta) ta.value = "";
        clearComposerAttach();
        state.composerSig = "";
        mountComposer(t, true);
        syncComposerSendingState();
        void loadRows(true);
      })
      .catch(function () {
        state.sending = false;
        if (statusEl) statusEl.textContent = "Send failed — check your connection.";
        else cfg.toast("Send failed", "err");
        syncComposerSendingState();
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
      var photoBtn = e.target.closest("#portalPnlogComposerPhoto");
      if (photoBtn) {
        e.preventDefault();
        var photoInput = document.getElementById("portalPnlogComposerFile");
        if (photoInput) {
          photoInput.accept = "image/*";
          photoInput.click();
        }
        return;
      }
      var docBtn = e.target.closest("#portalPnlogComposerDocument");
      if (docBtn) {
        e.preventDefault();
        var docInput = document.getElementById("portalPnlogComposerFile");
        if (docInput) {
          docInput.accept = "image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";
          docInput.click();
        }
        return;
      }
      var audioBtn = e.target.closest("#portalPnlogComposerAudio");
      if (audioBtn) {
        e.preventDefault();
        void toggleComposerAudio();
        return;
      }
      var clearAttach = e.target.closest("#portalPnlogComposerClearAttach");
      if (clearAttach) {
        e.preventDefault();
        clearComposerAttach();
        return;
      }
      var cancelEdit = e.target.closest("#portalPnlogComposerCancelEdit");
      if (cancelEdit) {
        e.preventDefault();
        clearEditing();
        var cancelThread = findThread(state.selectedKey);
        if (cancelThread) {
          state.draftByKey[cancelThread.key] = "";
          state.composerSig = "";
          state.threadRefresh.sig = "";
          mountComposer(cancelThread, true);
          var cancelThreadEl = document.getElementById("portalPnlogThread");
          if (cancelThreadEl) cancelThreadEl.innerHTML = renderThreadMessagesHtml(cancelThread);
        }
        return;
      }
      var cancelReply = e.target.closest("#portalPnlogComposerCancelReply");
      if (cancelReply) {
        e.preventDefault();
        clearReplyTo();
        var replyThread = findThread(state.selectedKey);
        if (replyThread) {
          state.composerSig = "";
          state.threadRefresh.sig = "";
          mountComposer(replyThread, true);
          var replyThreadEl = document.getElementById("portalPnlogThread");
          if (replyThreadEl) replyThreadEl.innerHTML = renderThreadMessagesHtml(replyThread);
        }
        return;
      }
      var replyBtn = e.target.closest(".portal-pnlog-bubble__reply[data-reply-wa-id]");
      if (replyBtn) {
        e.preventDefault();
        var replyWaId = replyBtn.getAttribute("data-reply-wa-id") || "";
        var replyBubble = replyBtn.closest(".portal-pnlog-bubble");
        var replySide = replyBubble && replyBubble.classList.contains("portal-pnlog-bubble--in")
          ? "in"
          : "out";
        var preview = "";
        var replyThreadFind = findThread(state.selectedKey);
        if (replyThreadFind && replyThreadFind.events) {
          for (var ri = 0; ri < replyThreadFind.events.length; ri++) {
            if (eventWaMessageId(replyThreadFind.events[ri]) === replyWaId) {
              preview = replyPreviewForEvent(replyThreadFind.events[ri]);
              replySide = replyThreadFind.events[ri].dir === "in" ? "in" : "out";
              break;
            }
          }
        }
        if (!preview && replyBubble) {
          var textNode = replyBubble.querySelector(".portal-pnlog-bubble__text");
          preview = textNode
            ? bodyPreview(String(textNode.innerText || textNode.textContent || ""))
            : "Message";
        }
        startReplyToMessage(replyWaId, preview || "Message", replySide);
        return;
      }
      var editBtn = e.target.closest(".portal-pnlog-bubble__edit[data-edit-log-id]");
      if (editBtn) {
        e.preventDefault();
        var editLogId = editBtn.getAttribute("data-edit-log-id") || "";
        var editWaId = editBtn.getAttribute("data-edit-wa-id") || "";
        var bubble = editBtn.closest(".portal-pnlog-bubble");
        var textEl = bubble && bubble.querySelector(".portal-pnlog-bubble__text");
        var bodyFromDom = textEl
          ? String(textEl.innerText || textEl.textContent || "").trim()
          : "";
        var editThread = findThread(state.selectedKey);
        var bodyFromEvent = "";
        if (editThread && editThread.events) {
          for (var ei = 0; ei < editThread.events.length; ei++) {
            if (String(editThread.events[ei].id || "") === editLogId) {
              bodyFromEvent = String(editThread.events[ei].body || "");
              break;
            }
          }
        }
        startEditOutbound(editLogId, editWaId, bodyFromEvent || bodyFromDom);
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
        syncColdTemplatePreview();
      }
    });

    host.addEventListener("change", function (e) {
      if (!e.target || e.target.id !== "portalPnlogComposerFile") return;
      var file = e.target.files && e.target.files[0];
      if (file) {
        setComposerAttach(file, file.name, file.type || "application/octet-stream");
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
          "id, created_at, sent_by_email, kind, channel, client_display, parent_name, parent_email, parent_phone, session_date, venue, subject, body_text, message_type, media_path, media_mime, email_status, whatsapp_status, whatsapp_message_id, whatsapp_delivered_at, whatsapp_read_at, error_detail, meta"
        )
        .or("channel.eq.whatsapp,channel.eq.both")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (outboundRes.error) throw outboundRes.error;
      await resolveMediaSignedUrls(client, outboundRes.data || []);

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
      var liveDir = await fetchLiveContactDirectory();
      var localDir = directoryFromCfg();
      /* Live portal_parent_contacts wins over static export / stale labels. */
      state.contactDirectory = mergeContactDirectories(liveDir, localDir);
      state.threads = enrichThreadsWithProfilePhones(buildWhatsAppThreads(state.timeline));
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
    // No page-intro in the admin head (that column stays narrow/right). Full-width info lives in-body.
    return (
      '<div id="portalParentNotifyLogRoot" class="portal-day-ops-embed portal-pnlog-root">' +
      '<p class="portal-pnlog-info" role="note">' +
      "WhatsApp conversations via the Business API — pick a family on the left, read the thread, and reply in the box below (no email on this screen). " +
      "Use <strong>Reply</strong> on a bubble to quote that message (like swipe-to-reply). " +
      "Search also finds families from Contacts even if there is no WhatsApp history yet. " +
      "Delivery ticks: Sent → Delivered → Read. Refreshes every 15s. " +
      "When you see <em>Needs Meta template</em>, scroll the chat above the purple box to read earlier messages." +
      "</p>" +
      '<div class="portal-pnlog-toolbar">' +
      '<input type="search" id="portalParentNotifyLogSearch" class="inp portal-pnlog-toolbar__search" placeholder="Search parent, participant, phone…" autocomplete="off" />' +
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
    // Messages first; roster is lazy and powers enrolled labels beside the participant.
    void loadRows(false);
    function refreshEnrolledHeader() {
      if (!document.getElementById("portalParentNotifyLogList")) return;
      renderChat(true);
    }
    if (typeof global.portalAdminLoadHeavyScripts === "function") {
      void global
        .portalAdminLoadHeavyScripts(["roster"])
        .then(refreshEnrolledHeader)
        .catch(refreshEnrolledHeader);
    } else {
      refreshEnrolledHeader();
    }
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
      var lastInboundByPhone = {};
      (res.data || []).forEach(function (r) {
        var pk = phoneMatchKey(r && r.from_phone) || phoneDigits(r && r.from_phone);
        if (!pk) return;
        var at = String((r && r.created_at) || "");
        if (!lastInboundByPhone[pk] || at > lastInboundByPhone[pk]) lastInboundByPhone[pk] = at;
      });
      var lastOutboundByPhone = {};
      var outRes = await client
        .from("portal_parent_notify_log")
        .select("parent_phone, created_at, channel, whatsapp_status")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (!outRes.error) {
        (outRes.data || []).forEach(function (r) {
          var ch = String((r && r.channel) || "").toLowerCase();
          if (ch !== "whatsapp" && ch !== "both") return;
          var pk = phoneMatchKey(r && r.parent_phone) || phoneDigits(r && r.parent_phone);
          if (!pk) return;
          var at = String((r && r.created_at) || "");
          if (!lastOutboundByPhone[pk] || at > lastOutboundByPhone[pk]) lastOutboundByPhone[pk] = at;
        });
      }
      var seen = readSeenMap();
      var n = 0;
      Object.keys(lastInboundByPhone).forEach(function (pk) {
        var inn = String(lastInboundByPhone[pk] || "");
        var out = String(lastOutboundByPhone[pk] || "");
        if (out && out >= inn) return;
        if (inn > String(seen[pk] || "")) n += 1;
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
    notePhoneChange: notePhoneChange,
    stopLiveRefresh: stopInboundLiveRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
