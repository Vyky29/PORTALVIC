/**
 * Admin — CS WhatsApp threads (all active staff).
 * Parallel to Family messages; uses portal_staff_* tables.
 * Unread = inbound from staff newer than localStorage seen cursor (per username).
 * Supports photo / file / voice attachments (Meta WhatsApp).
 */
(function (global) {
  "use strict";

  var SEEN_STORE_KEY = "portalStaffWaAdminSeenV1";
  var MAX_ATTACH_BYTES = 4 * 1024 * 1024;

  var state = {
    directory: [],
    selected: "",
    messages: [],
    loading: false,
    sending: false,
    draft: "",
    pollTimer: null,
    attach: null,
    recording: false,
    mediaRecorder: null,
    recordChunks: [],
    mobileShowThread: false,
  };

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
  };

  function esc(s) {
    return cfg.esc(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readSeenMap() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(SEEN_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function markThreadSeen(username, iso) {
    var key = String(username || "").trim().toLowerCase();
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
          global.dispatchEvent(new CustomEvent("portal:staff-wa-seen"));
        } catch (_ev) {}
      }
    } catch (_e) {}
  }

  function isLeaderUnread(l) {
    if (!l || !l.lastInboundAt) return false;
    var key = String(l.username || "").trim().toLowerCase();
    var seen = readSeenMap()[key] || "";
    return String(l.lastInboundAt) > String(seen);
  }

  function unreadLeadersCount(directory) {
    var n = 0;
    (directory || state.directory || []).forEach(function (l) {
      if (isLeaderUnread(l)) n += 1;
    });
    return n;
  }

  async function authHeaders() {
    var client = cfg.getClient();
    var token = "";
    try {
      if (client && client.auth && client.auth.getSession) {
        var res = await client.auth.getSession();
        token = (res && res.data && res.data.session && res.data.session.access_token) || "";
      }
    } catch (_e) {}
    return {
      Authorization: "Bearer " + token,
      apikey: cfg.getAnonKey(),
      "Content-Type": "application/json",
    };
  }

  async function api(path, body) {
    var url = String(cfg.getSupabaseUrl() || "").replace(/\/$/, "") + "/functions/v1/" + path;
    var res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body || {}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    return { ok: res.ok && !!data.ok, status: res.status, data: data };
  }

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

  function clearAttach() {
    state.attach = null;
    var preview = document.getElementById("portalStaffWaAttachPreview");
    if (preview) preview.textContent = "";
    var fileInput = document.getElementById("portalStaffWaFile");
    if (fileInput) fileInput.value = "";
  }

  function setAttach(fileOrBlob, filename, mime) {
    if (!fileOrBlob) return;
    var size = fileOrBlob.size || 0;
    if (size > MAX_ATTACH_BYTES) {
      cfg.toast("Attachment too large (max 4 MB)");
      return;
    }
    var name = filename || fileOrBlob.name || "attachment";
    var type = mime || fileOrBlob.type || "application/octet-stream";
    void fileToBase64(fileOrBlob).then(function (b64) {
      state.attach = { base64: b64, mime: type, filename: name };
      var preview = document.getElementById("portalStaffWaAttachPreview");
      if (preview) {
        preview.textContent = "Attached: " + name;
      }
      syncClearAttachBtn();
    }).catch(function () {
      cfg.toast("Could not read file");
    });
  }

  function toolBtnHtml(id, label, iconSvg, hidden) {
    return (
      '<button type="button" class="btn btn--ghost btn--sm portal-staff-wa-admin__tool" id="' +
      id +
      '"' +
      (hidden ? " hidden" : "") +
      ' aria-label="' +
      esc(label) +
      '">' +
      '<span class="portal-staff-wa-admin__tool-ico" aria-hidden="true">' +
      iconSvg +
      "</span>" +
      '<span class="portal-staff-wa-admin__tool-label">' +
      esc(label) +
      "</span>" +
      "</button>"
    );
  }

  var ICO_PHOTO =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var ICO_FILE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICO_VOICE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICO_CLEAR =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICO_STOP =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  function setRecordBtnLabel(btn, recording) {
    if (!btn) return;
    btn.innerHTML =
      '<span class="portal-staff-wa-admin__tool-ico" aria-hidden="true">' +
      (recording ? ICO_STOP : ICO_VOICE) +
      "</span>" +
      '<span class="portal-staff-wa-admin__tool-label">' +
      (recording ? "Stop" : "Voice") +
      "</span>";
    btn.setAttribute("aria-label", recording ? "Stop" : "Voice");
    btn.classList.toggle("is-recording", !!recording);
  }

  function staffProfileForUsername(username) {
    var key = String(username || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
    var src =
      (typeof global !== "undefined" &&
        global.STAFF_DASHBOARD_SOURCE &&
        global.STAFF_DASHBOARD_SOURCE.staffProfiles) ||
      {};
    if (src[key]) return { key: key, profile: src[key] };
    if (key === "luliya" && src.lulia) return { key: "lulia", profile: src.lulia };
    if (key === "lulia" && src.luliya) return { key: "luliya", profile: src.luliya };
    return { key: key, profile: null };
  }

  function displayNameForStaff(l) {
    var key = String((l && l.username) || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (key === "berta") return "Berta Trapero";
    var raw = String((l && (l.displayName || l.username)) || "").trim();
    if (key === "berta" || /berta\s+trapero/i.test(raw)) {
      return "Berta Trapero";
    }
    return raw || String((l && l.username) || "");
  }

  function roleChipsForStaff(l) {
    var info = staffProfileForUsername(l && l.username);
    var prof = info.profile || {};
    var tracks = [];
    if (Array.isArray(prof.staffRoleTracks) && prof.staffRoleTracks.length) {
      tracks = prof.staffRoleTracks.slice();
    } else if (prof.staffRoleTrack) {
      tracks = [prof.staffRoleTrack];
    }
    var dbRole = String((l && (l.staffRole || l.staff_role)) || "").trim().toLowerCase();
    var dbApp = String((l && (l.appRole || l.app_role)) || "").trim().toLowerCase();
    if (dbRole && tracks.indexOf(dbRole) < 0) tracks.push(dbRole);
    if (dbApp === "lead" && tracks.indexOf("support_lead") < 0 && tracks.indexOf("lead") < 0) {
      tracks.push("support_lead");
    }

    var hasSupport = false;
    var hasSwim = false;
    var hasClimb = false;
    var hasFitness = false;
    var hasLead = false;
    var hasAdmin = false;
    var hasManager = false;

    tracks.forEach(function (t) {
      var k = String(t || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      if (k === "support" || k === "supportlead") hasSupport = true;
      if (k === "supportlead" || k === "lead" || k === "programmelead") hasLead = true;
      if (k === "swimming" || k === "swim") hasSwim = true;
      if (k === "climbing" || k === "climb") hasClimb = true;
      if (k === "fitness" || k === "physical" || k === "physicalactivity") hasFitness = true;
      if (k === "admin" || k === "administrator") hasAdmin = true;
      if (k === "manager" || k === "ceo") hasManager = true;
    });

    if (dbApp === "lead" || dbApp === "ceo") hasLead = true;
    if (dbApp === "admin") hasAdmin = true;
    if (
      info.key === "john" ||
      info.key === "berta" ||
      info.key === "michelle" ||
      info.key === "victor" ||
      info.key === "raul" ||
      info.key === "javi"
    ) {
      hasLead = true;
    }
    if (hasLead && (info.key === "john" || info.key === "berta" || info.key === "michelle")) {
      hasSupport = true;
    }

    // Prefer dual tracks from roster when present (e.g. support + swimming).
    var chips = [];
    if (hasSupport) chips.push("Support Worker");
    if (hasLead) chips.push("Leader");
    if (hasSwim) chips.push("Swimming Instructor");
    if (hasClimb) chips.push("Climbing Instructor");
    if (hasFitness) chips.push("Fitness Instructor");
    if (hasManager && !hasLead) chips.push("Manager");
    if (hasAdmin) chips.push("Admin");
    if (!chips.length && dbRole) {
      chips.push(dbRole.replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
    }
    return chips;
  }

  function photoUrlForStaff(l) {
    var info = staffProfileForUsername(l && l.username);
    var file = info.profile && info.profile.avatarFile;
    if (file) {
      var path = String(file).replace(/^\//, "");
      return "/" + path;
    }
    var key = info.key || "staff";
    return "/portal/staff_photos/" + key + ".png";
  }

  function initialsForStaff(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function viewHtml() {
    return (
      '<div class="portal-staff-wa-admin" id="portalStaffWaAdmin">' +
      '<p class="page-intro">CS WhatsApp with staff. Messages also appear on their staff dashboard under their name.</p>' +
      '<p class="portal-staff-wa-admin__count muted" id="portalStaffWaCount"></p>' +
      '<div class="portal-staff-wa-admin__layout">' +
      '<aside class="portal-staff-wa-admin__list" id="portalStaffWaDir"></aside>' +
      '<section class="portal-staff-wa-admin__chat">' +
      '<div class="portal-staff-wa-admin__chat-head" id="portalStaffWaHead">Select a staff member</div>' +
      '<div class="portal-staff-wa-admin__thread" id="portalStaffWaMsgs"></div>' +
      '<form class="portal-staff-wa-admin__composer" id="portalStaffWaForm">' +
      '<div class="portal-staff-wa-admin__tools">' +
      '<input type="file" id="portalStaffWaFile" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden />' +
      toolBtnHtml("portalStaffWaAttachPhoto", "Photo", ICO_PHOTO, false) +
      toolBtnHtml("portalStaffWaAttachDoc", "File", ICO_FILE, false) +
      toolBtnHtml("portalStaffWaRecord", "Voice", ICO_VOICE, false) +
      toolBtnHtml("portalStaffWaClearAttach", "Clear", ICO_CLEAR, true) +
      '<span class="portal-staff-wa-admin__attach-preview muted" id="portalStaffWaAttachPreview"></span>' +
      "</div>" +
      '<textarea id="portalStaffWaDraft" rows="3" placeholder="Message…" maxlength="4000"></textarea>' +
      '<button type="submit" class="btn" id="portalStaffWaSend">Send WhatsApp</button>' +
      "</form>" +
      "</section>" +
      "</div>" +
      "</div>"
    );
  }

  function renderCount() {
    var el = document.getElementById("portalStaffWaCount");
    if (!el) return;
    var unread = unreadLeadersCount();
    var total = state.directory.length;
    el.textContent =
      total +
      " staff" +
      (unread ? " · " + unread + " unread" : "");
    el.classList.toggle("portal-staff-wa-admin__count--has-unread", unread > 0);
  }

  function renderDirectory() {
    var host = document.getElementById("portalStaffWaDir");
    if (!host) return;
    if (!state.directory.length) {
      host.innerHTML = '<p class="muted">No staff found.</p>';
      renderCount();
      return;
    }
    var sorted = state.directory.slice().sort(function (a, b) {
      var ua = isLeaderUnread(a) ? 1 : 0;
      var ub = isLeaderUnread(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return displayNameForStaff(a).localeCompare(displayNameForStaff(b), undefined, {
        sensitivity: "base",
      });
    });
    host.innerHTML = sorted
      .map(function (l) {
        var active = state.selected === l.username ? " is-active" : "";
        var unread = isLeaderUnread(l);
        var name = displayNameForStaff(l);
        var phone = l.hasPhone
          ? '<span class="muted">WhatsApp on file</span>'
          : '<span class="portal-staff-wa-admin__warn">No phone</span>';
        var preview = unread && l.lastInboundPreview
          ? '<span class="portal-staff-wa-admin__preview">' +
            esc(l.lastInboundPreview) +
            "</span>"
          : "";
        var roles = roleChipsForStaff(l);
        var rolesHtml = roles.length
          ? '<span class="portal-staff-wa-admin__roles">' +
            roles
              .map(function (r) {
                return (
                  '<span class="portal-staff-wa-admin__role-chip">' + esc(r) + "</span>"
                );
              })
              .join("") +
            "</span>"
          : "";
        var photo = photoUrlForStaff(l);
        var initials = initialsForStaff(name);
        return (
          '<button type="button" class="portal-staff-wa-admin__person' +
          active +
          (unread ? " portal-staff-wa-admin__person--unread" : "") +
          '" data-staff-wa-user="' +
          esc(l.username) +
          '">' +
          '<span class="portal-staff-wa-admin__person-row">' +
          '<span class="portal-staff-wa-admin__person-main">' +
          "<strong>" +
          esc(name) +
          "</strong>" +
          (unread
            ? '<span class="portal-staff-wa-admin__unread-chip">Unread</span>'
            : "") +
          rolesHtml +
          "</span>" +
          '<span class="portal-staff-wa-admin__avatar" aria-hidden="true">' +
          '<img src="' +
          esc(photo) +
          '" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />' +
          '<span class="portal-staff-wa-admin__avatar-fallback" hidden>' +
          esc(initials) +
          "</span>" +
          "</span>" +
          "</span>" +
          phone +
          preview +
          "</button>"
        );
      })
      .join("");
    renderCount();
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return "";
    }
  }

  function latestInboundAt(messages) {
    var max = "";
    (messages || []).forEach(function (m) {
      if (m && m.direction === "inbound" && String(m.created_at || "") > max) {
        max = String(m.created_at);
      }
    });
    return max;
  }

  function renderMedia(m) {
    var url = m && m.media_url ? String(m.media_url) : "";
    if (!url) return "";
    var mime = String((m && m.media_mime) || "").toLowerCase();
    var type = String((m && m.message_type) || "").toLowerCase();
    if (mime.indexOf("image") === 0 || type === "image" || type === "sticker") {
      return (
        '<a href="' +
        esc(url) +
        '" target="_blank" rel="noopener"><img class="portal-staff-wa-admin__img" src="' +
        esc(url) +
        '" alt="Photo" loading="lazy" /></a>'
      );
    }
    if (mime.indexOf("video") === 0 || type === "video") {
      return (
        '<video class="portal-staff-wa-admin__img" src="' +
        esc(url) +
        '" controls playsinline></video>'
      );
    }
    if (mime.indexOf("audio") === 0 || type === "audio") {
      return (
        '<audio class="portal-staff-wa-admin__audio" src="' +
        esc(url) +
        '" controls></audio>'
      );
    }
    return (
      '<a class="portal-staff-wa-admin__file" href="' +
      esc(url) +
      '" target="_blank" rel="noopener">Open attachment</a>'
    );
  }

  function syncMobileLayout() {
    var root = document.getElementById("portalStaffWaAdmin");
    if (!root) return;
    root.classList.toggle(
      "portal-staff-wa-admin--thread",
      !!(state.mobileShowThread && state.selected)
    );
  }

  function isMobileWaLayout() {
    try {
      return !!(global.matchMedia && global.matchMedia("(max-width: 720px)").matches);
    } catch (_e) {
      return false;
    }
  }

  function openStaffThread(username) {
    var key = String(username || "").trim();
    if (!key) return;
    state.mobileShowThread = true;
    syncMobileLayout();
    void loadThread(key).then(function () {
      if (!isMobileWaLayout()) {
        var chat = document.querySelector(".portal-staff-wa-admin__chat");
        if (chat && typeof chat.scrollIntoView === "function") {
          try {
            chat.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch (_e) {
            chat.scrollIntoView(true);
          }
        }
      }
    });
  }

  function closeMobileThread() {
    state.mobileShowThread = false;
    syncMobileLayout();
    renderMessages();
  }

  function renderMessages() {
    var host = document.getElementById("portalStaffWaMsgs");
    var head = document.getElementById("portalStaffWaHead");
    if (head) {
      var lead = state.directory.find(function (l) {
        return l.username === state.selected;
      });
      if (lead) {
        head.innerHTML =
          '<button type="button" class="btn btn--ghost btn--sm portal-staff-wa-admin__back" id="portalStaffWaBack" aria-label="Back to staff list">← Back</button>' +
          '<span class="portal-staff-wa-admin__head-title">' +
          esc(displayNameForStaff(lead)) +
          (lead.hasPhone ? "" : " — add phone_e164 first") +
          "</span>";
      } else {
        head.innerHTML =
          '<span class="portal-staff-wa-admin__head-title">Select a staff member</span>';
      }
    }
    syncMobileLayout();
    if (!host) return;
    if (!state.selected) {
      host.innerHTML = '<p class="muted">Choose a staff member on the left.</p>';
      return;
    }
    if (state.loading) {
      host.innerHTML = '<p class="muted">Loading…</p>';
      return;
    }
    if (!state.messages.length) {
      host.innerHTML = '<p class="muted">No messages yet.</p>';
      return;
    }
    host.innerHTML = state.messages
      .map(function (m) {
        var dir = m.direction === "inbound" ? "in" : "out";
        var who = dir === "in" ? "Staff" : "Admin";
        var bodyStr = String(m.body_text || "");
        var isPlaceholder =
          !!m.media_url && /^\[(sticker|image|video|audio|document)\]$/i.test(bodyStr.trim());
        var mediaHtml = renderMedia(m);
        var bodyHtml =
          bodyStr && !isPlaceholder
            ? '<div class="portal-staff-wa-admin__body">' + esc(bodyStr) + "</div>"
            : "";
        return (
          '<div class="portal-staff-wa-admin__bubble portal-staff-wa-admin__bubble--' +
          dir +
          '">' +
          '<div class="portal-staff-wa-admin__meta">' +
          esc(who) +
          " · " +
          esc(formatTime(m.created_at)) +
          (m.whatsapp_status ? " · " + esc(m.whatsapp_status) : "") +
          "</div>" +
          mediaHtml +
          bodyHtml +
          "</div>"
        );
      })
      .join("");
    host.scrollTop = host.scrollHeight;
  }

  async function loadDirectory(opts) {
    opts = opts || {};
    var prevUnread = unreadLeadersCount();
    var res = await api("portal-staff-messages-list", { directory: true });
    if (!res.ok) {
      if (!opts.silent) {
        cfg.toast("Could not load staff: " + ((res.data && res.data.error) || res.status));
      }
      return;
    }
    state.directory = Array.isArray(res.data.directory) ? res.data.directory : [];
    if (state.selected) {
      var open = state.directory.find(function (l) {
        return l.username === state.selected;
      });
      if (open && open.lastInboundAt) {
        markThreadSeen(state.selected, open.lastInboundAt);
      }
    }
    renderDirectory();
    var nextUnread = unreadLeadersCount();
    if (opts.notifyNew && nextUnread > prevUnread) {
      var names = state.directory
        .filter(isLeaderUnread)
        .map(function (l) {
          return displayNameForStaff(l);
        })
        .slice(0, 3);
      cfg.toast(
        "New CS WhatsApp" +
          (names.length ? ": " + names.join(", ") : "")
      );
      if (typeof global.portalPlayAlertCue === "function") {
        global.portalPlayAlertCue();
      }
      try {
        global.dispatchEvent(
          new CustomEvent("portal:staff-wa-unread", { detail: { count: nextUnread } })
        );
      } catch (_e) {}
    }
  }

  async function loadThread(username, opts) {
    opts = opts || {};
    state.selected = String(username || "");
    // Do not force thread mode on silent poll refresh — that would reopen chat after Back.
    if (state.selected && !opts.silent && !opts.keepLoadingQuiet) {
      state.mobileShowThread = true;
    }
    if (!opts.keepLoadingQuiet) {
      state.loading = true;
      renderDirectory();
      renderMessages();
    } else {
      syncMobileLayout();
    }
    var res = await api("portal-staff-messages-list", { staffUsername: state.selected });
    state.loading = false;
    if (!res.ok) {
      if (!opts.silent) {
        cfg.toast("Could not load thread: " + ((res.data && res.data.error) || res.status));
      }
      state.messages = [];
      renderMessages();
      return;
    }
    state.messages = Array.isArray(res.data.messages) ? res.data.messages : [];
    var lastIn = latestInboundAt(state.messages);
    if (lastIn) markThreadSeen(state.selected, lastIn);
    state.directory = state.directory.map(function (l) {
      if (l.username !== state.selected) return l;
      return Object.assign({}, l, {
        lastInboundAt: lastIn || l.lastInboundAt || null,
      });
    });
    renderDirectory();
    renderMessages();
  }

  function syncClearAttachBtn() {
    var btn = document.getElementById("portalStaffWaClearAttach");
    var preview = document.getElementById("portalStaffWaAttachPreview");
    if (btn) btn.hidden = !state.attach;
    if (preview && !state.attach) preview.textContent = "";
  }

  async function sendMessage(ev) {
    if (ev) ev.preventDefault();
    if (state.sending || !state.selected) return;
    var draftEl = document.getElementById("portalStaffWaDraft");
    var body = draftEl ? String(draftEl.value || "").trim() : "";
    if (!body && !state.attach) {
      cfg.toast("Write a message or attach a photo/file/voice note");
      return;
    }
    var lead = state.directory.find(function (l) {
      return l.username === state.selected;
    });
    if (lead && !lead.hasPhone) {
      cfg.toast("This leader has no phone_e164 on staff_profiles yet");
      return;
    }
    state.sending = true;
    var btn = document.getElementById("portalStaffWaSend");
    if (btn) btn.disabled = true;
    var payload = {
      staffUsername: state.selected,
      body: body,
      kind: "staff_message",
    };
    if (state.attach) {
      payload.mediaBase64 = state.attach.base64;
      payload.mediaMime = state.attach.mime;
      payload.mediaFilename = state.attach.filename;
    }
    var res = await api("portal-staff-notify-send", payload);
    state.sending = false;
    if (btn) btn.disabled = false;
    if (!res.ok) {
      cfg.toast("Send failed: " + ((res.data && res.data.error) || res.status));
      return;
    }
    if (draftEl) draftEl.value = "";
    clearAttach();
    syncClearAttachBtn();
    cfg.toast("WhatsApp sent");
    await loadThread(state.selected);
  }

  async function toggleVoice() {
    var recBtn = document.getElementById("portalStaffWaRecord");
    if (state.recording && state.mediaRecorder) {
      try {
        state.mediaRecorder.stop();
      } catch (_e) {}
      return;
    }
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cfg.toast("Voice recording not supported on this device");
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mime = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mime = "audio/ogg;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
      }
      state.recordChunks = [];
      state.mediaRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      state.recording = true;
      setRecordBtnLabel(recBtn, true);
      state.mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) state.recordChunks.push(ev.data);
      };
      state.mediaRecorder.onstop = function () {
        state.recording = false;
        setRecordBtnLabel(recBtn, false);
        try {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
        } catch (_s) {}
        var blobMime = (state.mediaRecorder && state.mediaRecorder.mimeType) || mime || "audio/webm";
        var blob = new Blob(state.recordChunks, { type: blobMime });
        var ext = blobMime.indexOf("ogg") >= 0 ? "ogg" : blobMime.indexOf("mp4") >= 0 ? "m4a" : "webm";
        setAttach(blob, "voice-note." + ext, blobMime);
        syncClearAttachBtn();
        state.mediaRecorder = null;
        state.recordChunks = [];
      };
      state.mediaRecorder.start();
    } catch (_e) {
      cfg.toast("Microphone permission needed for voice notes");
      state.recording = false;
      setRecordBtnLabel(recBtn, false);
    }
  }

  function startLiveRefresh() {
    stopLiveRefresh();
    state.pollTimer = global.setInterval(function () {
      if (!document.getElementById("portalStaffWaAdmin")) {
        stopLiveRefresh();
        return;
      }
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void loadDirectory({ silent: true, notifyNew: true }).then(function () {
        if (state.selected) {
          void loadThread(state.selected, { silent: true, keepLoadingQuiet: true });
        }
      });
    }, 5000);
  }

  function stopLiveRefresh() {
    if (state.pollTimer) {
      global.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function bind() {
    var root = document.getElementById("portalStaffWaAdmin");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    root.addEventListener("click", function (ev) {
      var back = ev.target && ev.target.closest ? ev.target.closest("#portalStaffWaBack") : null;
      if (back) {
        ev.preventDefault();
        closeMobileThread();
        return;
      }
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-staff-wa-user]") : null;
      if (!btn) return;
      ev.preventDefault();
      openStaffThread(btn.getAttribute("data-staff-wa-user"));
    });
    var form = document.getElementById("portalStaffWaForm");
    if (form) form.addEventListener("submit", sendMessage);

    var fileInput = document.getElementById("portalStaffWaFile");
    var photoBtn = document.getElementById("portalStaffWaAttachPhoto");
    var docBtn = document.getElementById("portalStaffWaAttachDoc");
    var recBtn = document.getElementById("portalStaffWaRecord");
    var clearBtn = document.getElementById("portalStaffWaClearAttach");

    if (photoBtn && fileInput) {
      photoBtn.addEventListener("click", function () {
        fileInput.accept = "image/*";
        fileInput.click();
      });
    }
    if (docBtn && fileInput) {
      docBtn.addEventListener("click", function () {
        fileInput.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) {
          setAttach(f, f.name, f.type || "application/octet-stream");
          syncClearAttachBtn();
        }
      });
    }
    if (recBtn) {
      recBtn.addEventListener("click", function () {
        void toggleVoice();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        clearAttach();
        syncClearAttachBtn();
      });
    }

    void loadDirectory().then(function () {
      startLiveRefresh();
    });
  }

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.esc === "function") cfg.esc = opts.esc;
    if (typeof opts.getClient === "function") cfg.getClient = opts.getClient;
    if (typeof opts.toast === "function") cfg.toast = opts.toast;
    if (typeof opts.getSupabaseUrl === "function") cfg.getSupabaseUrl = opts.getSupabaseUrl;
    if (typeof opts.getAnonKey === "function") cfg.getAnonKey = opts.getAnonKey;
  }

  async function fetchUnreadCount() {
    try {
      var res = await api("portal-staff-messages-list", { directory: true });
      if (!res.ok) return 0;
      var dir = Array.isArray(res.data.directory) ? res.data.directory : [];
      return unreadLeadersCount(dir);
    } catch (_e) {
      return 0;
    }
  }

  global.PortalStaffWhatsappAdmin = {
    configure: configure,
    viewHtml: viewHtml,
    bind: bind,
    refresh: function () {
      return loadDirectory({ silent: true, notifyNew: false });
    },
    openStaff: function (username) {
      if (!username) return loadDirectory();
      return loadDirectory().then(function () {
        return loadThread(String(username).toLowerCase());
      });
    },
    unreadCount: fetchUnreadCount,
    stopLiveRefresh: stopLiveRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
