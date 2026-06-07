/**
 * Admin CS Cliq — full-page chats + channels (announcements).
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    adminNavIconHtml: function () {
      return "";
    },
    initChat: function () {},
    channels: {},
    openAdminView: function () {},
    focusChats: function () {},
  };

  var WORKSPACE_KEY = "portal_cs_cliq_workspace_status";

  var RAIL_SVGS = {
    chats:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    channels:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v3a1 1 0 001 1h2"/><path d="M11 4L6 3H3v12h3l5-1"/><path d="M15.5 6.5L21 11l-5.5 4.5"/></svg>',
    phone:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
    files:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    calendar:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  };

  function esc(s) {
    return cfg.esc(s);
  }

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.adminNavIconHtml) cfg.adminNavIconHtml = options.adminNavIconHtml;
    if (options.initChat) cfg.initChat = options.initChat;
    if (options.channels) cfg.channels = options.channels;
    if (options.openAdminView) cfg.openAdminView = options.openAdminView;
    if (options.focusChats) cfg.focusChats = options.focusChats;
  }

  function readWorkspaceStatus() {
    try {
      var v = String(localStorage.getItem(WORKSPACE_KEY) || "at_work").trim();
      return v === "away" ? "away" : "at_work";
    } catch (_e) {
      return "at_work";
    }
  }

  function writeWorkspaceStatus(status) {
    try {
      localStorage.setItem(WORKSPACE_KEY, status === "away" ? "away" : "at_work");
    } catch (_e2) {}
  }

  function callBarHtml(prefix, compact) {
    var p = esc(prefix || "csCliq");
    var extraClass = compact ? " portal-cs-cliq__head-call-bar" : "";
    return (
      '<div id="' +
      p +
      'CallBar" class="portal-dm-call-bar portal-cs-cliq__call-bar' +
      extraClass +
      '" hidden aria-hidden="true">' +
      '<button type="button" class="portal-dm-call-bar-btn" id="' +
      p +
      'VoiceCallBtn" data-portal-call-kind="audio" title="Start a voice call"><span class="portal-dm-call-bar-icon" aria-hidden="true">📞</span>' +
      (compact ? '<span class="sr-only">Voice</span>' : '<span class="portal-dm-call-bar-label">Voice</span>') +
      "</button>" +
      '<button type="button" class="portal-dm-call-bar-btn" id="' +
      p +
      'VideoCallBtn" data-portal-call-kind="video" title="Start a video call"><span class="portal-dm-call-bar-icon" aria-hidden="true">📹</span>' +
      (compact ? '<span class="sr-only">Video</span>' : '<span class="portal-dm-call-bar-label">Video</span>') +
      "</button>" +
      '<button type="button" class="portal-dm-call-bar-btn" id="' +
      p +
      'MeetingBtn" data-portal-call-kind="meeting" title="Schedule a meeting"><span class="portal-dm-call-bar-icon" aria-hidden="true">📅</span>' +
      (compact ? '<span class="sr-only">Meeting</span>' : '<span class="portal-dm-call-bar-label">Meeting</span>') +
      "</button></div>"
    );
  }

  function syncWorkspacePills() {
    var status = readWorkspaceStatus();
    var root = document.getElementById("csCliqRoot");
    if (!root) return;
    root.querySelectorAll("[data-cs-cliq-workspace]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-cs-cliq-workspace") === status);
    });
    var statusEl = document.getElementById("csCliqPhoneStatusLabel");
    if (statusEl) {
      statusEl.textContent = status === "away" ? "Away" : "At work";
    }
  }

  function syncPhonePaneContext() {
    var peerEl = document.getElementById("csCliqPhonePeer");
    var hintEl = document.getElementById("csCliqPhoneHint");
    var bar = document.getElementById("csCliqPhoneCallBar");
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var adminUi = global.__PORTAL_ADMIN_DM_UI || {};
    var tid = String(ui.threadId || adminUi.threadId || "").trim();
    var gid = String(adminUi.groupId || "").trim();
    var peer = String(ui.peerLabel || adminUi.peerLabel || "").trim();
    var active = !!tid || !!gid;
    if (peerEl) peerEl.textContent = active && peer ? peer : "No active chat";
    if (hintEl) {
      hintEl.textContent = active
        ? gid
          ? "Calls and meetings use the open group: " + peer + "."
          : "Calls and meetings use your open chat with " + peer + "."
        : "Open a staff, lead, or group chat from Chats, then return here to call or schedule.";
    }
    if (bar) {
      bar.hidden = !active;
      bar.setAttribute("aria-hidden", active ? "false" : "true");
    }
    syncWorkspacePills();
  }

  function railBtn(id, label, disabled, soon) {
    var dis = disabled ? " disabled" : "";
    var soonTag = soon ? ' title="Coming in a later phase"' : "";
    return (
      '<button type="button" class="portal-cs-cliq__rail-btn" data-cs-cliq-rail="' +
      esc(id) +
      '"' +
      dis +
      soonTag +
      ">" +
      '<span class="portal-cs-cliq__rail-btn__ico" aria-hidden="true">' +
      (RAIL_SVGS[id] || "") +
      "</span>" +
      '<span class="portal-cs-cliq__rail-label">' +
      esc(label) +
      "</span></button>"
    );
  }

  function viewHtml() {
    var annIco = cfg.adminNavIconHtml("announcements");
    var remIco = cfg.adminNavIconHtml("reminders");
    return (
      '<div id="csCliqRoot" class="portal-cs-cliq">' +
      '<div class="portal-cs-cliq__layout">' +
      '<nav class="portal-cs-cliq__rail" aria-label="CS Cliq">' +
      railBtn("chats", "Chats", false, false) +
      railBtn("channels", "Channels", false, false) +
      railBtn("phone", "Phone", false, false) +
      railBtn("files", "Files", false, false) +
      railBtn("calendar", "Calendar", false, false) +
      "</nav>" +
      '<div class="portal-cs-cliq__main">' +
      '<div id="csCliqChatsPane" class="portal-cs-cliq__pane" data-cs-cliq-pane="chats">' +
      '<div class="portal-cs-cliq__chat-head">' +
      '<button type="button" class="portal-cs-cliq__back-btn" id="csCliqBackBtn" hidden aria-label="Back to chats">‹</button>' +
      '<h2 class="portal-cs-cliq__chat-title" id="csCliqTitle">Chats</h2>' +
      callBarHtml("csCliqHead", true) +
      '<button type="button" class="portal-cs-cliq__new-btn" id="csCliqBtnNew">New</button>' +
      "</div>" +
      '<div class="portal-cs-cliq__chat-body portal-dm-wrap" data-cs-cliq-panel="list">' +
      '<div id="csCliqChannelNav" class="portal-dm-inbox-nav">' +
      '<button type="button" class="portal-dm-inbox-nav-btn is-active" id="csCliqTabStaff" data-admin-chat-channel="staff_lead">Staff &amp; leads</button>' +
      '<button type="button" class="portal-dm-inbox-nav-btn" id="csCliqTabCeo" data-admin-chat-channel="ceo_exec">CEO&apos;s chat</button>' +
      "</div>" +
      '<div id="csCliqListPanel">' +
      '<div id="csCliqCeoQuickWrap" hidden style="min-width:0">' +
      '<p class="muted" style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Quick open</p>' +
      '<div class="filter-row" style="flex-wrap:wrap;gap:8px;min-width:0">' +
      '<button type="button" class="btn btn--sec btn--sm" id="csCliqQOpsAdmin">Operations admin</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="csCliqQCeoGroup">CEO group</button>' +
      "</div>" +
      '<div id="csCliqQCeosHost" class="filter-row" style="flex-wrap:wrap;gap:8px;margin-top:8px;min-width:0"></div>' +
      "</div>" +
      '<div id="csCliqStaffLeadsQuickWrap" hidden style="min-width:0">' +
      '<p class="muted" style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Quick open</p>' +
      '<div class="filter-row" style="flex-wrap:wrap;gap:8px;min-width:0">' +
      '<button type="button" class="btn btn--pri btn--sm" id="csCliqQStaffLeadsGroup">Ring all staff &amp; leads</button>' +
      "</div></div>" +
      '<div id="csCliqListWrap" class="portal-dm-inbox-list"></div>' +
      "</div>" +
      '<div id="csCliqComposePanel" hidden>' +
      '<label class="muted">Recipient</label>' +
      '<div id="csCliqPeerPickWrap">' +
      '<input type="text" id="csCliqPeerSearch" autocomplete="off" autocapitalize="off" spellcheck="false" aria-autocomplete="list" aria-controls="csCliqPeerSuggest" placeholder="Search staff or lead…" />' +
      '<input type="hidden" id="csCliqPeerUser" value="" />' +
      '<div id="csCliqPeerSuggest" class="adm-dm-peer-suggest" hidden role="listbox"></div>' +
      "</div>" +
      '<label class="muted">Message</label>' +
      '<textarea class="txa" id="csCliqFirstBody" placeholder="Type your message…" style="min-height:100px"></textarea>' +
      '<p class="muted" id="csCliqComposeErr" style="margin:10px 0 0;min-height:1.2em;font-size:12px;color:var(--danger)"></p>' +
      '<div class="filter-row" style="margin-top:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="csCliqComposeBack">Back to threads</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="csCliqComposeSend">Send</button>' +
      "</div></div>" +
      '<div id="csCliqThreadPanel" class="portal-dm-thread-view" hidden aria-hidden="true">' +
      '<span id="csCliqThreadPeerHidden" hidden aria-hidden="true"></span>' +
      '<div id="csCliqMessages" class="portal-dm-msgs-col portal-dm-msgs-scroll"></div>' +
      '<div class="portal-dm-compose-bar">' +
      '<label class="sr-only" for="csCliqInput">Your message</label>' +
      '<textarea id="csCliqInput" class="txa" placeholder="Write a message…" maxlength="8000"></textarea>' +
      '<p id="csCliqErr" class="muted" style="margin:0;font-size:13px;color:var(--danger);min-height:1.2em"></p>' +
      '<button type="button" class="portal-dm-btn portal-dm-btn--primary" id="csCliqSendBtn">Send</button>' +
      "</div></div></div></div>" +
      '<div id="csCliqChannelsPane" class="portal-cs-cliq__pane" data-cs-cliq-pane="channels" hidden>' +
      '<div class="portal-cs-cliq__channels-head">' +
      "<h2>Channels</h2>" +
      '<p class="muted" style="margin:8px 0 0;font-size:13px;line-height:1.5;min-width:0;overflow-wrap:break-word">Announcements and reminders for staff — same tools as Day operations.</p>' +
      "</div>" +
      '<div class="portal-cs-cliq__channels-body">' +
      '<div class="portal-cs-cliq__channels-grid">' +
      '<button type="button" id="csCliqChAnn" class="card card-pad dash-link-card card--premium dayops-screen-nav__card" data-dayops-tone="announcements" style="min-width:0">' +
      '<div class="dash-link-row dayops-screen-nav__stack">' +
      '<span class="dayops-screen-nav__ico-wrap" aria-hidden="true">' +
      annIco +
      "</span>" +
      '<div class="dash-link-meta dayops-screen-nav__meta" style="min-width:0">' +
      '<span class="dayops-screen-nav__label">Announcement</span>' +
      '<span class="dayops-screen-nav__desc">Site-wide</span>' +
      "</div></div></button>" +
      '<button type="button" id="csCliqChRem" class="card card-pad dash-link-card card--premium dayops-screen-nav__card" data-dayops-tone="reminders" style="min-width:0">' +
      '<div class="dash-link-row dayops-screen-nav__stack">' +
      '<span class="dayops-screen-nav__ico-wrap" aria-hidden="true">' +
      remIco +
      "</span>" +
      '<div class="dash-link-meta dayops-screen-nav__meta" style="min-width:0">' +
      '<span class="dayops-screen-nav__label">Reminder</span>' +
      '<span class="dayops-screen-nav__desc">Targeted</span>' +
      "</div></div></button>" +
      "</div>" +
      '<div class="portal-cs-cliq__channels-actions">' +
      '<button type="button" id="csCliqChSigned" class="btn btn--sec">Signed announcements log</button>' +
      '<button type="button" id="csCliqChRemAck" class="btn btn--sec">Acknowledged reminders log</button>' +
      '<button type="button" id="csCliqChManage" class="btn btn--ghost">Manage sent messages</button>' +
      "</div></div></div>" +
      '<div id="csCliqPhonePane" class="portal-cs-cliq__pane" data-cs-cliq-pane="phone" hidden>' +
      '<div class="portal-cs-cliq__module-head"><h2>Phone</h2>' +
      '<p class="muted portal-cs-cliq__module-sub">Voice and video from your open 1:1 chat — same as in the thread header.</p></div>' +
      '<div class="portal-cs-cliq__module-body">' +
      '<div class="portal-cs-cliq__workspace-card card card-pad">' +
      '<p class="muted" style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">My workspace</p>' +
      '<div class="filter-row" style="flex-wrap:wrap;gap:8px;min-width:0">' +
      '<button type="button" class="btn btn--sec btn--sm is-active" data-cs-cliq-workspace="at_work">At work</button>' +
      '<button type="button" class="btn btn--sec btn--sm" data-cs-cliq-workspace="away">Away</button>' +
      "</div>" +
      '<p class="muted" style="margin:10px 0 0;font-size:13px;min-width:0;overflow-wrap:break-word">Status: <strong id="csCliqPhoneStatusLabel">At work</strong></p>' +
      "</div>" +
      '<div class="portal-cs-cliq__phone-active card card-pad" style="margin-top:12px;min-width:0">' +
      '<p class="muted" style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Active chat</p>' +
      '<p id="csCliqPhonePeer" class="portal-cs-cliq__phone-peer" style="margin:0;font-size:16px;font-weight:800;min-width:0;overflow-wrap:break-word">No active 1:1 chat</p>' +
      '<p id="csCliqPhoneHint" class="muted" style="margin:8px 0 0;font-size:13px;line-height:1.5;min-width:0;overflow-wrap:break-word">Open a staff or lead chat from Chats, then return here to call or schedule.</p>' +
      callBarHtml("csCliqPhone", false) +
      '<div class="filter-row" style="margin-top:12px;flex-wrap:wrap;gap:8px;min-width:0">' +
      '<button type="button" class="btn btn--pri btn--sm" id="csCliqPhoneOpenChats">Open Chats</button>' +
      "</div></div></div></div>" +
      '<div id="csCliqFilesPane" class="portal-cs-cliq__pane" data-cs-cliq-pane="files" hidden>' +
      '<div class="portal-cs-cliq__module-head"><h2>Files</h2>' +
      '<p class="muted portal-cs-cliq__module-sub">Portal documents and chat attachments in one place.</p></div>' +
      '<div class="portal-cs-cliq__module-body">' +
      '<button type="button" class="card card-pad dash-link-card card--premium portal-cs-cliq__link-card" id="csCliqFilesPortalDocs">' +
      '<div class="dash-link-row dayops-screen-nav__stack" style="min-width:0">' +
      '<span class="dayops-screen-nav__ico-wrap" aria-hidden="true">' +
      (RAIL_SVGS.files || "") +
      "</span>" +
      '<div class="dash-link-meta dayops-screen-nav__meta" style="min-width:0">' +
      '<span class="dayops-screen-nav__label">Portal documents</span>' +
      '<span class="dayops-screen-nav__desc">Policies, uploads, and shared club files</span>' +
      "</div></div></button>" +
      '<p class="muted portal-cs-cliq__module-note">A shared media gallery from chat threads will appear here in a later update.</p>' +
      "</div></div>" +
      '<div id="csCliqCalendarPane" class="portal-cs-cliq__pane" data-cs-cliq-pane="calendar" hidden>' +
      '<div class="portal-cs-cliq__module-head"><h2>Calendar</h2>' +
      '<p class="muted portal-cs-cliq__module-sub">Scheduling and meeting invites from chat.</p></div>' +
      '<div class="portal-cs-cliq__module-body">' +
      '<button type="button" class="card card-pad dash-link-card card--premium portal-cs-cliq__link-card" id="csCliqCalScheduling">' +
      '<div class="dash-link-row dayops-screen-nav__stack" style="min-width:0">' +
      '<span class="dayops-screen-nav__ico-wrap" aria-hidden="true">' +
      (RAIL_SVGS.calendar || "") +
      "</span>" +
      '<div class="dash-link-meta dayops-screen-nav__meta" style="min-width:0">' +
      '<span class="dayops-screen-nav__label">Staff scheduling</span>' +
      '<span class="dayops-screen-nav__desc">Roster, sessions, and term calendar</span>' +
      "</div></div></button>" +
      '<div class="portal-cs-cliq__calendar-actions card card-pad" style="margin-top:12px;min-width:0">' +
      '<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.5;min-width:0;overflow-wrap:break-word">Schedule a meeting in your open 1:1 chat — everyone gets a join button in the thread.</p>' +
      '<button type="button" class="btn btn--pri" id="csCliqCalScheduleMeeting">Schedule meeting in chat</button>' +
      '<button type="button" class="btn btn--sec" id="csCliqCalOpenChats" style="margin-top:8px">Open Chats</button>' +
      "</div></div></div>" +
      '<div id="csCliqSoonPane" class="portal-cs-cliq__pane portal-cs-cliq__soon" data-cs-cliq-pane="soon" hidden>' +
      "<h2 id=\"csCliqSoonTitle\">Coming soon</h2>" +
      '<p id="csCliqSoonBody">This section will arrive in a later CS Cliq phase.</p>' +
      "</div></div></div></div>"
    );
  }

  function setRailPane(pane) {
    var root = document.getElementById("csCliqRoot");
    if (!root) return;
    var allowed = { chats: 1, channels: 1, phone: 1, files: 1, calendar: 1, soon: 1 };
    if (!allowed[pane]) pane = "chats";
    root.querySelectorAll("[data-cs-cliq-rail]").forEach(function (btn) {
      var id = btn.getAttribute("data-cs-cliq-rail");
      btn.classList.toggle("is-active", id === pane);
    });
    var chats = document.getElementById("csCliqChatsPane");
    var channels = document.getElementById("csCliqChannelsPane");
    var phone = document.getElementById("csCliqPhonePane");
    var files = document.getElementById("csCliqFilesPane");
    var calendar = document.getElementById("csCliqCalendarPane");
    var soon = document.getElementById("csCliqSoonPane");
    if (chats) chats.hidden = pane !== "chats";
    if (channels) channels.hidden = pane !== "channels";
    if (phone) phone.hidden = pane !== "phone";
    if (files) files.hidden = pane !== "files";
    if (calendar) calendar.hidden = pane !== "calendar";
    if (soon) soon.hidden = pane !== "soon";
    if (pane === "phone") syncPhonePaneContext();
    if (pane === "chats" && typeof cfg.initChat === "function") {
      cfg.initChat(global.__PORTAL_ADMIN_DM_CHANNEL || "staff_lead");
    }
  }

  function bindModule() {
    var root = document.getElementById("csCliqRoot");
    if (!root || root.dataset.portalCsCliqBound === "1") return;
    root.dataset.portalCsCliqBound = "1";

    var pendingPane = String(global.__PORTAL_CS_CLIQ_PENDING_PANE || "chats").trim();
    if (
      pendingPane !== "channels" &&
      pendingPane !== "phone" &&
      pendingPane !== "files" &&
      pendingPane !== "calendar" &&
      pendingPane !== "soon"
    ) {
      pendingPane = "chats";
    }
    global.__PORTAL_CS_CLIQ_PENDING_PANE = "";
    setRailPane(pendingPane);

    root.querySelectorAll("[data-cs-cliq-rail]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var rail = btn.getAttribute("data-cs-cliq-rail") || "chats";
        setRailPane(rail);
      });
    });

    root.querySelectorAll("[data-cs-cliq-workspace]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        writeWorkspaceStatus(btn.getAttribute("data-cs-cliq-workspace"));
        syncWorkspacePills();
      });
    });

    var openChats = document.getElementById("csCliqPhoneOpenChats");
    if (openChats) {
      openChats.addEventListener("click", function () {
        if (typeof cfg.focusChats === "function") cfg.focusChats();
        else setRailPane("chats");
      });
    }
    var calOpenChats = document.getElementById("csCliqCalOpenChats");
    if (calOpenChats) {
      calOpenChats.addEventListener("click", function () {
        if (typeof cfg.focusChats === "function") cfg.focusChats();
        else setRailPane("chats");
      });
    }
    var calMeet = document.getElementById("csCliqCalScheduleMeeting");
    if (calMeet) {
      calMeet.addEventListener("click", function () {
        if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.openMeetingPanel === "function") {
          global.portalStaffChatCalls.openMeetingPanel();
        }
      });
    }
    var filesBtn = document.getElementById("csCliqFilesPortalDocs");
    if (filesBtn) {
      filesBtn.addEventListener("click", function () {
        if (typeof cfg.openAdminView === "function") cfg.openAdminView("portal_documents");
      });
    }
    var calSched = document.getElementById("csCliqCalScheduling");
    if (calSched) {
      calSched.addEventListener("click", function () {
        if (typeof cfg.openAdminView === "function") cfg.openAdminView("scheduling");
      });
    }

    syncWorkspacePills();
    syncPhonePaneContext();

    if (pendingPane === "chats" && typeof cfg.initChat === "function") {
      var ch = global.__PORTAL_CS_CLIQ_PENDING_CHANNEL || global.__PORTAL_ADMIN_DM_CHANNEL || "staff_lead";
      global.__PORTAL_CS_CLIQ_PENDING_CHANNEL = "";
      cfg.initChat(ch);
    }

    var ch = cfg.channels || {};
    var ann = document.getElementById("csCliqChAnn");
    if (ann && ch.composeAnnouncement) ann.addEventListener("click", ch.composeAnnouncement);
    var rem = document.getElementById("csCliqChRem");
    if (rem && ch.composeReminder) rem.addEventListener("click", ch.composeReminder);
    var signed = document.getElementById("csCliqChSigned");
    if (signed && ch.signedLog) signed.addEventListener("click", ch.signedLog);
    var remAck = document.getElementById("csCliqChRemAck");
    if (remAck && ch.reminderAck) remAck.addEventListener("click", ch.reminderAck);
    var manage = document.getElementById("csCliqChManage");
    if (manage && ch.manage) manage.addEventListener("click", ch.manage);
  }

  function destroyModule() {
    var root = document.getElementById("csCliqRoot");
    if (root) delete root.dataset.portalCsCliqBound;
    global.__PORTAL_CS_CLIQ_ACTIVE = false;
  }

  global.PortalAdminCsCliq = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    setRailPane: setRailPane,
    syncPhonePaneContext: syncPhonePaneContext,
  };
})(window);
