/**
 * Admin CS Cliq — full-page inbox, announcements, meetings and files.
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
    onPaneOpen: function () {},
  };

  var WORKSPACE_KEY = "portal_cs_cliq_workspace_status";
  var MOBILE_MAX_WIDTH = 899;

  function mobileLayoutActive() {
    try {
      var w = global.innerWidth || document.documentElement.clientWidth || 0;
      var h = global.innerHeight || document.documentElement.clientHeight || 0;
      if (w <= MOBILE_MAX_WIDTH) return true;
      if (w < 1280 && h <= 640) {
        try {
          if (global.matchMedia && global.matchMedia("(orientation: landscape)").matches) return true;
        } catch (_land) {}
      }
    } catch (_e) {}
    return false;
  }

  function adminCsCliqMobileFullscreen() {
    try {
      return (
        mobileLayoutActive() &&
        document.body.classList.contains("admin-view-cs-cliq") &&
        document.body.classList.contains("admin-touch-compact")
      );
    } catch (_e) {
      return false;
    }
  }

  function syncMobileSubscreen(panel) {
    panel = String(panel || "list");
    var mobile = mobileLayoutActive();
    var adminFull = adminCsCliqMobileFullscreen();
    var threadSub = mobile && (panel === "thread" || panel === "compose");
    document.body.classList.toggle("portal-cs-cliq-mobile-subscreen", adminFull || threadSub);
    document.body.classList.toggle(
      "admin-cs-cliq-mobile-subscreen",
      (adminFull || threadSub) && document.body.classList.contains("admin-touch-compact")
    );
    var root = document.getElementById("csCliqRoot");
    if (root) {
      root.classList.toggle("portal-cs-cliq--admin-fullscreen", adminFull);
      root.classList.toggle("portal-cs-cliq--subscreen", threadSub);
    }
  }

  function bindMobileResize() {
    if (global.__PORTAL_CS_CLIQ_MOBILE_RESIZE_BOUND) return;
    global.__PORTAL_CS_CLIQ_MOBILE_RESIZE_BOUND = true;
    global.addEventListener("resize", function () {
      if (!document.getElementById("csCliqRoot")) return;
      var ui = global.__PORTAL_ADMIN_DM_UI || {};
      syncMobileSubscreen(String(ui.panel || "list"));
    });
  }

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
    if (options.onPaneOpen) cfg.onPaneOpen = options.onPaneOpen;
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

  function callBarIcon(name) {
    var ic = global.portalDmIcons;
    if (ic && typeof ic.svg === "function") {
      return '<span class="portal-dm-call-bar-icon" aria-hidden="true">' + ic.svg(name) + "</span>";
    }
    return '<span class="portal-dm-call-bar-icon" data-dm-icon="' + esc(name) + '" aria-hidden="true"></span>';
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
      'VoiceCallBtn" data-portal-call-kind="audio" title="Start a voice call">' +
      callBarIcon("phone") +
      (compact ? '<span class="sr-only">Voice</span>' : '<span class="portal-dm-call-bar-label">Voice</span>') +
      "</button>" +
      '<button type="button" class="portal-dm-call-bar-btn" id="' +
      p +
      'VideoCallBtn" data-portal-call-kind="video" title="Start a video call">' +
      callBarIcon("video") +
      (compact ? '<span class="sr-only">Video</span>' : '<span class="portal-dm-call-bar-label">Video</span>') +
      "</button>" +
      '<button type="button" class="portal-dm-call-bar-btn" id="' +
      p +
      'MeetingBtn" data-portal-call-kind="meeting" title="Schedule a meeting">' +
      callBarIcon("calendar") +
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
    if (global.portalCsCliqMeetingsHub && typeof global.portalCsCliqMeetingsHub.refresh === "function") {
      global.portalCsCliqMeetingsHub.refresh();
    }
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
    var railPlaceholder =
      global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.buildRailHtml === "function"
        ? global.portalCsCliqHubRoles.buildRailHtml()
        : railBtn("chats", "Inbox", false, false) + railBtn("files", "Files", false, false);
    return (
      '<div id="csCliqRoot" class="portal-cs-cliq portal-cs-cliq--hub">' +
      '<div class="portal-cs-cliq__layout">' +
      '<nav class="portal-cs-cliq__rail" aria-label="Operations communication hub">' +
      railPlaceholder +
      "</nav>" +
      '<div class="portal-cs-cliq__main">' +
      '<div id="csCliqChatsPane" class="portal-cs-cliq__pane portal-cs-cliq__pane--inbox" data-cs-cliq-pane="chats">' +
      '<div class="portal-cs-cliq-inbox portal-cs-cliq__chat-body portal-dm-wrap" data-cs-cliq-panel="list">' +
      '<aside class="portal-cs-cliq-inbox__list-col" id="csCliqListColumn">' +
      '<div class="portal-cs-cliq-inbox__list-head">' +
      '<h2 class="portal-cs-cliq__chat-title" id="csCliqTitle">Inbox</h2>' +
      '<button type="button" class="portal-cs-cliq__new-btn" id="csCliqBtnNew">New</button>' +
      "</div>" +
      '<div id="csCliqChannelNav" class="portal-dm-inbox-nav" hidden aria-hidden="true">' +
      '<button type="button" class="portal-dm-inbox-nav-btn is-active" id="csCliqTabStaff">Team inbox</button>' +
      '<button type="button" class="portal-dm-inbox-nav-btn" id="csCliqTabCeo">CEO chat</button>' +
      "</div>" +
      '<div id="csCliqCeoQuickWrap" class="portal-cs-cliq-ceo-quick" hidden>' +
      '<div class="portal-cs-cliq-channel-row">' +
      '<button type="button" class="portal-cs-cliq-channel-btn portal-cs-cliq-channel-btn--primary" id="csCliqQCeoGroup">CEOs</button>' +
      '<button type="button" class="portal-cs-cliq-channel-btn" id="csCliqQCeoLiaisonGroup">Sev + CEOs</button>' +
      "</div></div>" +
      '<div id="csCliqListPanel">' +
      '<div id="csCliqInboxCategoryBar" class="portal-cs-cliq-inbox-categories" hidden aria-hidden="true"></div>' +
      '<p id="csCliqInboxLaneHint" class="portal-cs-cliq-inbox-lane-hint" hidden aria-hidden="true"></p>' +
      '<div id="csCliqListWrap" class="portal-dm-inbox-list"></div>' +
      "</div></aside>" +
      '<div id="csCliqChatsConvHost" class="portal-cs-cliq-inbox__conv-host">' +
      '<section class="portal-cs-cliq-inbox__conversation-col" id="csCliqConversationCol">' +
      '<div id="csCliqInboxEmpty" class="portal-cs-cliq-inbox-empty" aria-hidden="false">' +
      '<p class="portal-cs-cliq-inbox-empty__title">Select a conversation</p>' +
      '<p class="portal-cs-cliq-inbox-empty__sub">Your messages, calls and meeting requests live here.</p>' +
      "</div>" +
      '<div id="csCliqComposePanel" class="portal-cs-cliq-compose-screen" hidden>' +
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
      '<div id="csCliqThreadPanel" class="portal-dm-thread-view portal-cs-cliq-thread" hidden aria-hidden="true">' +
      '<span id="csCliqThreadPeerHidden" hidden aria-hidden="true"></span>' +
      '<header class="portal-cs-cliq-thread-header" id="csCliqThreadHeader" aria-hidden="true">' +
      '<button type="button" class="portal-cs-cliq__back-btn" id="csCliqBackBtn" aria-label="Back to inbox">‹</button>' +
      '<div class="portal-cs-cliq-thread-header__identity">' +
      '<span class="portal-cs-cliq-thread-header__avatar" id="csCliqThreadAvatar" aria-hidden="true"></span>' +
      '<div class="portal-cs-cliq-thread-header__meta">' +
      '<span class="portal-cs-cliq-thread-header__name" id="csCliqThreadName">Conversation</span>' +
      '<span class="portal-cs-cliq-thread-header__role" id="csCliqThreadRole">Staff</span>' +
      '<div class="portal-cs-cliq-thread-header__members" id="csCliqThreadMembers" hidden aria-hidden="true"></div>' +
      '<span class="portal-cs-cliq-thread-header__status" id="csCliqThreadStatus">Available</span>' +
      "</div></div>" +
      callBarHtml("csCliqHead", true) +
      '<button type="button" class="portal-cs-cliq-thread-header__files" id="csCliqThreadFilesBtn">Files</button>' +
      "</header>" +
      '<div id="csCliqThreadFilesPanel" class="portal-cs-cliq-thread-files-panel" hidden></div>' +
      '<div id="csCliqMessages" class="portal-dm-msgs-col portal-dm-msgs-scroll portal-cs-cliq-messages"></div>' +
      '<div class="portal-cs-cliq-composer portal-dm-compose-bar">' +
      '<div class="portal-cs-cliq-composer__shell">' +
      '<div class="portal-cs-cliq-composer__leading" id="csCliqComposerLeading" aria-label="Message tools"></div>' +
      '<textarea id="csCliqInput" class="portal-cs-cliq-composer__input txa" aria-label="Message" placeholder="Message…" maxlength="8000" rows="1"></textarea>' +
      '<button type="button" class="portal-cs-cliq-composer__send portal-dm-btn portal-dm-btn--primary" id="csCliqSendBtn" aria-label="Send message">' +
      '<span class="portal-cs-cliq-composer__send-ico" data-dm-icon="send" aria-hidden="true"></span>' +
      "</button></div>" +
      '<p id="csCliqErr" class="portal-cs-cliq-composer__err muted"></p>' +
      "</div></div></section></div></div></div>" +
      '<div id="csCliqChannelsPane" class="portal-cs-cliq__pane portal-cs-cliq__pane--channels" data-cs-cliq-pane="channels" hidden>' +
      '<div class="portal-cs-cliq-inbox portal-cs-cliq__channels-body portal-cs-cliq__chat-body" data-cs-cliq-panel="list">' +
      '<aside class="portal-cs-cliq-inbox__list-col" id="csCliqChannelsListColumn">' +
      '<div class="portal-cs-cliq-inbox__list-head">' +
      '<h2 class="portal-cs-cliq__chat-title" id="csCliqChannelsTitle">Channels</h2>' +
      '<button type="button" class="portal-cs-cliq__new-btn" id="csCliqChannelsNewBtn">New group</button>' +
      "</div>" +
      '<p class="portal-cs-cliq-channels-intro muted">Group chats and team channels — Leads and Staff.</p>' +
      '<div id="csCliqChannelsCategoryBar" class="portal-cs-cliq-inbox-categories" hidden aria-hidden="true"></div>' +
      '<div id="csCliqChannelsListPanel">' +
      '<div id="csCliqTeamsList" class="portal-dm-inbox-list portal-cs-cliq-teams-list"></div>' +
      "</div></aside>" +
      '<div id="csCliqChannelsConvHost" class="portal-cs-cliq-inbox__conv-host"></div>' +
      "</div></div>" +
      '<div id="csCliqSupportPane" class="portal-cs-cliq__pane" data-cs-cliq-pane="support" hidden>' +
      '<div class="portal-cs-cliq__module-head"><div class="portal-cs-cliq__pane-title-row"><h2>Support</h2><span class="portal-cs-cliq__pane-badge">Staff</span></div>' +
      '<p class="muted portal-cs-cliq__module-sub">Request help from Management or Leads.</p></div>' +
      '<div class="portal-cs-cliq__module-body" id="csCliqSupportBody"></div></div>' +
      '<div id="csCliqPhonePane" class="portal-cs-cliq__pane portal-cs-cliq__pane--legacy" data-cs-cliq-pane="phone" hidden aria-hidden="true">' +
      '<div class="portal-cs-cliq__module-head"><div class="portal-cs-cliq__pane-title-row"><h2>Phone</h2><span class="portal-cs-cliq__pane-badge">Live</span></div>' +
      '<p class="muted portal-cs-cliq__module-sub">Voice, video, and meeting invites from your open chat — the same controls as in the thread header.</p></div>' +
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
      '<div class="portal-cs-cliq__module-head"><div class="portal-cs-cliq__pane-title-row"><h2>Files</h2><span class="portal-cs-cliq__pane-badge">Shared</span></div>' +
      '<p class="muted portal-cs-cliq__module-sub">Club documents and recent photos or files from your chat threads.</p></div>' +
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
      '<div class="portal-cs-cliq-files-search-wrap">' +
      '<input type="search" id="csCliqFilesSearch" class="portal-cs-cliq-files-search" placeholder="Search files…" autocomplete="off" />' +
      "</div>" +
      '<div class="portal-cs-cliq-files-section">' +
      '<p class="portal-cs-cliq-files-section__title">Recent from chat</p>' +
      '<div id="csCliqFilesGallery" class="portal-cs-cliq-files-list"></div>' +
      "</div>" +
      '<div class="portal-cs-cliq-files-section" id="csCliqFilesAllSection" hidden>' +
      '<p class="portal-cs-cliq-files-section__title">All shared files</p>' +
      '<p class="portal-cs-cliq-files-section__desc">Every photo and document sent across CS Cliq, with conversation and date.</p>' +
      '<div id="csCliqFilesAllGallery" class="portal-cs-cliq-files-list"></div>' +
      "</div></div></div>" +
      '<div id="csCliqCalendarPane" class="portal-cs-cliq__pane portal-cs-cliq__pane--meetings" data-cs-cliq-pane="calendar" hidden>' +
      '<div class="portal-cs-cliq-meetings-centre" id="csCliqMeetingsCentre"></div>' +
      "</div>" +
      '<div id="csCliqSoonPane" class="portal-cs-cliq__pane portal-cs-cliq__soon" data-cs-cliq-pane="soon" hidden>' +
      "<h2 id=\"csCliqSoonTitle\">Coming soon</h2>" +
      '<p id="csCliqSoonBody">This section will arrive in a later CS Cliq phase.</p>' +
      "</div></div></div></div>"
    );
  }

  function reparentConversationCol(pane) {
    var col = document.getElementById("csCliqConversationCol");
    var chatsHost = document.getElementById("csCliqChatsConvHost");
    var channelsHost = document.getElementById("csCliqChannelsConvHost");
    if (!col) return;
    var target = pane === "channels" ? channelsHost : chatsHost;
    if (target && col.parentElement !== target) target.appendChild(col);
  }

  function setRailPane(pane) {
    var root = document.getElementById("csCliqRoot");
    if (!root) return;
    var allowed = { chats: 1, channels: 1, phone: 1, files: 1, calendar: 1, support: 1, soon: 1 };
    if (!allowed[pane]) pane = "chats";
    global.__PORTAL_CS_CLIQ_RAIL_PANE = pane;
    root.querySelectorAll("[data-cs-cliq-rail]").forEach(function (btn) {
      var id = btn.getAttribute("data-cs-cliq-rail");
      btn.classList.toggle("is-active", id === pane);
    });
    var chats = document.getElementById("csCliqChatsPane");
    var channels = document.getElementById("csCliqChannelsPane");
    var phone = document.getElementById("csCliqPhonePane");
    var files = document.getElementById("csCliqFilesPane");
    var calendar = document.getElementById("csCliqCalendarPane");
    var support = document.getElementById("csCliqSupportPane");
    var soon = document.getElementById("csCliqSoonPane");
    if (chats) chats.hidden = pane !== "chats";
    if (channels) channels.hidden = pane !== "channels";
    if (phone) phone.hidden = true;
    if (files) files.hidden = pane !== "files";
    if (calendar) calendar.hidden = pane !== "calendar";
    if (support) support.hidden = pane !== "support";
    if (soon) soon.hidden = pane !== "soon";
    if (pane === "phone") syncPhonePaneContext();
    if (pane === "calendar" && global.portalCsCliqMeetingsHub && typeof global.portalCsCliqMeetingsHub.refresh === "function") {
      global.portalCsCliqMeetingsHub.refresh();
    }
    if (pane === "support" && global.portalCsCliqSupport && typeof global.portalCsCliqSupport.refresh === "function") {
      global.portalCsCliqSupport.refresh();
    }
    if (pane === "channels" && global.portalCsCliqTeams && typeof global.portalCsCliqTeams.refresh === "function") {
      global.portalCsCliqTeams.refresh();
    }
    reparentConversationCol(pane);
    if (pane === "chats" && typeof cfg.initChat === "function") {
      var ch = String(global.__PORTAL_ADMIN_DM_CHANNEL || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
      if (!global.__PORTAL_CS_CLIQ_CHAT_INIT_DONE) {
        global.__PORTAL_CS_CLIQ_CHAT_INIT_DONE = true;
        cfg.initChat(ch);
      } else if (global.__PORTAL_ADMIN_DM_CHANNEL !== ch) {
        cfg.initChat(ch);
      }
    }
    if (typeof cfg.onPaneOpen === "function") cfg.onPaneOpen(pane);
    if (typeof global.portalAdminDmSyncCsCliqRailUnread === "function") {
      global.portalAdminDmSyncCsCliqRailUnread();
    }
  }

  function bindModule() {
    var root = document.getElementById("csCliqRoot");
    if (!root || root.dataset.portalCsCliqBound === "1") return;
    root.dataset.portalCsCliqBound = "1";

    if (typeof global.portalAdminCsCliqEnsureDmWatchers === "function") {
      global.portalAdminCsCliqEnsureDmWatchers();
    }

    if (global.portalDmIcons && typeof global.portalDmIcons.upgrade === "function") {
      global.portalDmIcons.upgrade(root);
    }
    if (global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.applyRootChrome === "function") {
      global.portalCsCliqHubRoles.applyRootChrome();
    }

    var pendingPane = String(global.__PORTAL_CS_CLIQ_PENDING_PANE || "chats").trim();
    var allowedPending = { chats: 1, channels: 1, files: 1, calendar: 1, support: 1, soon: 1 };
    if (!allowedPending[pendingPane]) pendingPane = "chats";
    global.__PORTAL_CS_CLIQ_PENDING_PANE = "";
    setRailPane(pendingPane);

    var railNav = root.querySelector(".portal-cs-cliq__rail");
    if (railNav && railNav.dataset.portalCsCliqRailBound !== "1") {
      railNav.dataset.portalCsCliqRailBound = "1";
      railNav.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-cs-cliq-rail]");
        if (!btn || btn.disabled) return;
        setRailPane(btn.getAttribute("data-cs-cliq-rail") || "chats");
      });
    }

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
    var filesBtn = document.getElementById("csCliqFilesPortalDocs");
    if (filesBtn) {
      filesBtn.addEventListener("click", function () {
        if (typeof cfg.openAdminView === "function") cfg.openAdminView("portal_documents");
      });
    }
    var channelsNewBtn = document.getElementById("csCliqChannelsNewBtn");
    if (channelsNewBtn && global.portalCsCliqTeams && typeof global.portalCsCliqTeams.openCreateModal === "function") {
      channelsNewBtn.addEventListener("click", function () {
        global.portalCsCliqTeams.openCreateModal();
      });
    }
    syncWorkspacePills();
    syncPhonePaneContext();

    if (pendingPane === "chats" && typeof cfg.initChat === "function") {
      var ch = global.__PORTAL_CS_CLIQ_PENDING_CHANNEL || global.__PORTAL_ADMIN_DM_CHANNEL || "staff_lead";
      global.__PORTAL_CS_CLIQ_PENDING_CHANNEL = "";
      global.__PORTAL_CS_CLIQ_CHAT_INIT_DONE = true;
      cfg.initChat(ch);
    }

    if (global.portalCsCliqThreadFiles && typeof global.portalCsCliqThreadFiles.bind === "function") {
      global.portalCsCliqThreadFiles.bind();
    }
    bindMobileResize();
  }

  function syncInboxLayout(hooks) {
    hooks = hooks || {};
    var ui = global.__PORTAL_ADMIN_DM_UI || {};
    var panel = String(ui.panel || "list");
    var inThread = panel === "thread";
    var inCompose = panel === "compose";
    var railPane = String(global.__PORTAL_CS_CLIQ_RAIL_PANE || "chats");
    var listPanel = document.getElementById("csCliqListPanel");
    var channelsListPanel = document.getElementById("csCliqChannelsListPanel");
    var composePanel = document.getElementById("csCliqComposePanel");
    var threadPanel = document.getElementById("csCliqThreadPanel");
    var backBtn = document.getElementById("csCliqBackBtn");
    var titleEl = document.getElementById("csCliqTitle");
    var channelsTitleEl = document.getElementById("csCliqChannelsTitle");
    var nav = document.getElementById("csCliqChannelNav");
    var newBtn = document.getElementById("csCliqBtnNew");
    var channelsNewBtn = document.getElementById("csCliqChannelsNewBtn");
    var listCol = document.getElementById("csCliqListColumn");
    var channelsListCol = document.getElementById("csCliqChannelsListColumn");
    var convCol = document.getElementById("csCliqConversationCol");
    var emptyState = document.getElementById("csCliqInboxEmpty");
    var chatBody = document.querySelector("#csCliqChatsPane .portal-cs-cliq__chat-body");
    var channelsBody = document.querySelector("#csCliqChannelsPane .portal-cs-cliq__channels-body");
    if (chatBody) chatBody.setAttribute("data-cs-cliq-panel", panel);
    if (channelsBody) channelsBody.setAttribute("data-cs-cliq-panel", panel);
    reparentConversationCol(railPane);
    if (typeof hooks.onMobileSubscreen === "function") {
      hooks.onMobileSubscreen(panel);
    } else {
      syncMobileSubscreen(panel);
    }
    if (listPanel) listPanel.hidden = false;
    if (composePanel) composePanel.hidden = !inCompose;
    if (threadPanel) {
      threadPanel.hidden = !inThread;
      threadPanel.setAttribute("aria-hidden", inThread ? "false" : "true");
    }
    if (emptyState) {
      emptyState.hidden = inThread || inCompose;
      emptyState.setAttribute("aria-hidden", inThread || inCompose ? "true" : "false");
    }
    if (listCol) listCol.classList.toggle("portal-cs-cliq-inbox__list-col--hidden-mobile", inThread || inCompose);
    if (channelsListCol) {
      channelsListCol.classList.toggle("portal-cs-cliq-inbox__list-col--hidden-mobile", inThread || inCompose);
    }
    if (convCol) convCol.classList.toggle("portal-cs-cliq-inbox__conversation-col--active", inThread || inCompose);
    if (backBtn) {
      var adminMobileFull = adminCsCliqMobileFullscreen();
      var showBack = inThread || inCompose || (adminMobileFull && !inCompose);
      backBtn.hidden = !showBack;
      if (adminMobileFull && !inThread && !inCompose) {
        backBtn.setAttribute("aria-label", "Back to dashboard");
      } else if (inThread || inCompose) {
        var lane = "";
        try {
          if (
            global.portalCsCliqAdminInbox &&
            typeof global.portalCsCliqAdminInbox.getCeoInboxCategory === "function"
          ) {
            lane = global.portalCsCliqAdminInbox.getCeoInboxCategory();
          }
        } catch (_lane) {}
        if (lane === "ops") {
          backBtn.setAttribute("aria-label", "Back to Ops inbox");
        } else if (lane === "direct") {
          backBtn.setAttribute("aria-label", "Back to Direct inbox");
        } else {
          backBtn.setAttribute(
            "aria-label",
            railPane === "channels" ? "Back to channels" : "Back to inbox"
          );
        }
      } else {
        backBtn.setAttribute("aria-label", railPane === "channels" ? "Back to channels" : "Back to inbox");
      }
    }
    if (nav) {
      var showNav =
        global.portalCsCliqHubRoles &&
        typeof global.portalCsCliqHubRoles.isManagementProfile === "function" &&
        global.portalCsCliqHubRoles.isManagementProfile();
      nav.hidden = !showNav;
      nav.setAttribute("aria-hidden", showNav ? "false" : "true");
    }
    if (newBtn) {
      var adminInboxRoster = false;
      try {
        adminInboxRoster = /admin_dashboard\.html/i.test(String(global.location.pathname || ""));
      } catch (_p) {}
      if (
        !adminInboxRoster &&
        global.portalCsCliqAdminInbox &&
        typeof global.portalCsCliqAdminInbox.managementInboxFullStaffRoster === "function"
      ) {
        adminInboxRoster = global.portalCsCliqAdminInbox.managementInboxFullStaffRoster();
      }
      var canNew =
        !adminInboxRoster &&
        !(
          global.portalCsCliqHubRoles &&
          global.portalCsCliqHubRoles.canCreateConversations &&
          !global.portalCsCliqHubRoles.canCreateConversations()
        );
      newBtn.hidden = inThread || inCompose || !canNew || railPane !== "chats";
      if (adminInboxRoster) newBtn.setAttribute("aria-hidden", "true");
    }
    if (channelsNewBtn) {
      channelsNewBtn.hidden = inThread || inCompose || railPane !== "channels";
    }
    if (channelsListPanel) channelsListPanel.hidden = false;
    var threadHeader = document.getElementById("csCliqThreadHeader");
    if (threadHeader) {
      threadHeader.classList.toggle("is-open", inThread);
      threadHeader.setAttribute("aria-hidden", inThread ? "false" : "true");
    }
    if (global.portalCsCliqThreadHeader && typeof global.portalCsCliqThreadHeader.sync === "function") {
      global.portalCsCliqThreadHeader.sync(ui);
    }
    if (typeof hooks.onChannelTabs === "function") hooks.onChannelTabs();
    if (titleEl) {
      if (inCompose) {
        titleEl.textContent = "New message";
      } else if (typeof hooks.inboxTitle === "function") {
        titleEl.textContent = hooks.inboxTitle();
      } else {
        titleEl.textContent = "Inbox";
      }
    }
    if (channelsTitleEl) {
      if (inThread && ui.groupId) {
        channelsTitleEl.textContent = String(ui.peerLabel || "Channel").trim() || "Channel";
      } else {
        channelsTitleEl.textContent = "Channels";
      }
    }
    var gid = ui.groupId ? String(ui.groupId).trim() : "";
    var tid = ui.threadId ? String(ui.threadId).trim() : "";
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.threadId = inThread && tid && !gid ? tid : null;
    global.__PORTAL_INTERNAL_CHAT_UI.peerLabel =
      inThread && !gid ? String(ui.peerLabel || "").trim() : "";
    var showCalls = inThread && (!!tid || !!gid);
    if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.syncCallBar === "function") {
      global.portalStaffChatCalls.syncCallBar({ inThread: showCalls });
    } else {
      var callBar = document.getElementById("csCliqHeadCallBar");
      if (callBar) {
        callBar.hidden = !showCalls;
        callBar.setAttribute("aria-hidden", showCalls ? "false" : "true");
      }
    }
    syncPhonePaneContext();
  }

  function destroyModule() {
    var root = document.getElementById("csCliqRoot");
    if (root) delete root.dataset.portalCsCliqBound;
    global.__PORTAL_CS_CLIQ_ACTIVE = false;
    document.body.classList.remove("portal-cs-cliq-mobile-subscreen", "admin-cs-cliq-mobile-subscreen");
  }

  global.portalCsCliqMobileActive = mobileLayoutActive;
  global.portalCsCliqSyncMobileSubscreen = syncMobileSubscreen;

  global.PortalAdminCsCliq = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    setRailPane: setRailPane,
    syncInboxLayout: syncInboxLayout,
    syncPhonePaneContext: syncPhonePaneContext,
    syncMobileSubscreen: syncMobileSubscreen,
    mobileLayoutActive: mobileLayoutActive,
  };
})(window);
