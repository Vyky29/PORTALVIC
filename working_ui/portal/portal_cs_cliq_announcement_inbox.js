/**
 * CS Cliq announcement inbox ù system conversations for staff and lead; unified inbox sections.
 */
(function (global) {
  "use strict";

  var patchedInternal = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function profile() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function client() {
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client ? box.client : null;
  }

  function simplifyGroupLabel(slug, title) {
    slug = String(slug || "").toLowerCase();
    title = String(title || "").trim();
    if (slug === "all_ceos" || /all\s*ceos/i.test(title)) return "Executive group";
    if (slug === "ceo_liaison" || /ceo\s*liaison/i.test(title)) return "Management group";
    if (slug === "staff_leads_ops" || /operations\s*group/i.test(title)) return "Leads coordination";
    if (slug === "session_leads") return "Session leads";
    return title || "Group";
  }

  function viewerCtx(prof) {
    prof = prof || profile();
    var box = global.__PORTAL_SUPABASE__ || {};
    return {
      authUserId: String((box.session && box.session.user && box.session.user.id) || prof.id || "").trim(),
      userId: String(prof.id || "").trim(),
      appRole: String(prof.app_role || "").trim().toLowerCase(),
      staffRole: String(prof.staff_role || "").trim(),
    };
  }

  function isVisible(row, ctx) {
    if (!row || !row.id || row.ends_at) return false;
    if (String(row.message_type || "announcement").toLowerCase() === "reminder") return false;
    if (global.portalStaffAnnouncementRowVisibleOnWorkerInbox) {
      return global.portalStaffAnnouncementRowVisibleOnWorkerInbox(row, ctx);
    }
    return true;
  }

  async function loadRows() {
    var c = client();
    if (!c) return [];
    var res = await c
      .from("portal_staff_announcements")
      .select(
        "id,title,body,message_type,created_at,ends_at,audience_scope,delivery_scope,target_staff_role,target_user_id,hide_after_ack_amount,hide_after_ack_unit"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (res.error || !Array.isArray(res.data)) return [];
    var ctx = viewerCtx();
    return res.data.filter(function (row) {
      return isVisible(row, ctx);
    });
  }

  async function ackMapForUser() {
    var c = client();
    var uid = viewerCtx().authUserId;
    var map = {};
    if (!c || !uid) return map;
    var res = await c.from("portal_staff_announcement_acks").select("announcement_id").eq("staff_id", uid);
    if (!res.error && Array.isArray(res.data)) {
      res.data.forEach(function (row) {
        if (row && row.announcement_id) map[String(row.announcement_id)] = true;
      });
    }
    return map;
  }

  async function getInboxItems() {
    var rows = await loadRows();
    var acks = await ackMapForUser();
    return rows.map(function (row) {
      var id = String(row.id || "");
      return {
        kind: "announcement",
        id: id,
        label: String(row.title || "Announcement").trim() || "Announcement",
        when: row.created_at,
        body: String(row.body || "").trim(),
        unread: !acks[id],
        row: row,
      };
    });
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (_e) {
      return "";
    }
  }

  function ensureReader() {
    var el = document.getElementById("portalCsCliqAnnouncementReader");
    if (el) return el;
    el = document.createElement("div");
    el.id = "portalCsCliqAnnouncementReader";
    el.className = "portal-cs-cliq-announcement-reader";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="portal-cs-cliq-announcement-reader__card">' +
      '<button type="button" class="portal-cs-cliq-announcement-reader__close" data-cs-cliq-ann-reader="close" aria-label="Close">&times;</button>' +
      '<p class="portal-cs-cliq-announcement-reader__eyebrow">Announcement</p>' +
      '<h3 id="portalCsCliqAnnouncementReaderTitle"></h3>' +
      '<p id="portalCsCliqAnnouncementReaderWhen" class="portal-cs-cliq-announcement-reader__when"></p>' +
      '<div id="portalCsCliqAnnouncementReaderBody" class="portal-cs-cliq-announcement-reader__body"></div>' +
      '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--pri" id="portalCsCliqAnnouncementReaderAck" data-cs-cliq-ann-reader="ack">Acknowledge</button>' +
      "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (ev) {
      if (ev.target === el) closeReader();
    });
    el.querySelectorAll("[data-cs-cliq-ann-reader]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-cs-cliq-ann-reader");
        if (act === "close") closeReader();
        if (act === "ack") void acknowledgeCurrent();
      });
    });
    return el;
  }

  var currentItem = null;

  function openReader(item) {
    currentItem = item || null;
    var el = ensureReader();
    var title = document.getElementById("portalCsCliqAnnouncementReaderTitle");
    var when = document.getElementById("portalCsCliqAnnouncementReaderWhen");
    var body = document.getElementById("portalCsCliqAnnouncementReaderBody");
    var ackBtn = document.getElementById("portalCsCliqAnnouncementReaderAck");
    if (title) title.textContent = item ? item.label : "Announcement";
    if (when) when.textContent = item ? formatWhen(item.when) : "";
    if (body) {
      var html =
        global.portalFormatSignableMessageHtml && typeof global.portalFormatSignableMessageHtml === "function"
          ? global.portalFormatSignableMessageHtml(item ? item.body : "")
          : "<p>" + esc(item ? item.body : "") + "</p>";
      body.innerHTML = html;
    }
    if (ackBtn) {
      ackBtn.hidden = !(item && item.unread);
      ackBtn.textContent = item && item.unread ? "Acknowledge" : "Close";
      if (!item || !item.unread) {
        ackBtn.setAttribute("data-cs-cliq-ann-reader", "close");
      } else {
        ackBtn.setAttribute("data-cs-cliq-ann-reader", "ack");
      }
    }
    el.hidden = false;
  }

  function closeReader() {
    var el = document.getElementById("portalCsCliqAnnouncementReader");
    if (el) el.hidden = true;
    currentItem = null;
  }

  async function acknowledgeCurrent() {
    if (!currentItem || !currentItem.id) {
      closeReader();
      return;
    }
    var pending = {
      portalAnnouncementId: currentItem.id,
      title: currentItem.label,
      text: currentItem.body,
      href: "#portal-ann-" + currentItem.id,
    };
    if (global.portalPersistAnnouncementAckToSupabase) {
      await global.portalPersistAnnouncementAckToSupabase(pending);
    }
    try {
      var key = "portal-ann:" + currentItem.id;
      var storageKey = "portalAnnouncementAckMap_v1";
      var raw = global.localStorage.getItem(storageKey);
      var map = raw ? JSON.parse(raw) : {};
      if (!map || typeof map !== "object") map = {};
      map[key] = {
        title: currentItem.label,
        text: currentItem.body,
        href: pending.href,
        signedAt: Date.now(),
        portalAnnouncementId: currentItem.id,
      };
      global.localStorage.setItem(storageKey, JSON.stringify(map));
    } catch (_ls) {}
    closeReader();
    refreshInboxes();
    if (global.portalCsCliqAnnouncementsHub && typeof global.portalCsCliqAnnouncementsHub.refresh === "function") {
      global.portalCsCliqAnnouncementsHub.refresh();
    }
  }

  function renderAnnouncementButton(item, activeId) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "portal-dm-thread-item portal-dm-thread-item--announcement" +
      (item.unread ? " portal-dm-thread-item--unread" : "") +
      (activeId === item.id ? " portal-dm-thread-item--active" : "");
    btn.setAttribute("data-cs-cliq-announcement", item.id);
    btn.innerHTML =
      '<span class="portal-cs-cliq-announcement-avatar" aria-hidden="true">A</span>' +
      '<div class="portal-dm-thread-item__body">' +
      '<div class="portal-dm-thread-item__head">' +
      '<span class="portal-dm-thread-peer">' +
      esc(item.label) +
      '<span class="portal-dm-thread-role-tag portal-cs-cliq-announcement-tag">Announcement</span></span>' +
      '<span class="portal-dm-thread-when">' +
      esc(formatWhen(item.when)) +
      "</span></div>" +
      '<div class="portal-dm-thread-preview"><span class="portal-dm-thread-preview-text">' +
      esc(String(item.body || "").slice(0, 80)) +
      "</span></div></div>" +
      (item.unread ? '<span class="portal-dm-thread-unread-badge" aria-label="Unread">!</span>' : "");
    btn.addEventListener("click", function () {
      openReader(item);
    });
    return btn;
  }

  function sectionLabel(text) {
    var el = document.createElement("p");
    el.className = "portal-cs-cliq-inbox-section__label";
    el.textContent = text;
    return el;
  }

  async function prependToHost(host) {
    if (!host) return;
    host.querySelectorAll(".portal-cs-cliq-inbox-section__label[data-section='announcements']").forEach(function (n) {
      n.remove();
    });
    host.querySelectorAll("[data-cs-cliq-announcement]").forEach(function (n) {
      n.remove();
    });
    var items = await getInboxItems();
    if (!items.length) return;
    var frag = document.createDocumentFragment();
    var label = sectionLabel("Announcements");
    label.setAttribute("data-section", "announcements");
    frag.appendChild(label);
    items.forEach(function (item) {
      frag.appendChild(renderAnnouncementButton(item));
    });
    host.insertBefore(frag, host.firstChild);
  }

  function appendGroupsSection(host, groupButtons) {
    if (!groupButtons.length) return;
    var existing = host.querySelector('.portal-cs-cliq-inbox-section__label[data-section="groups"]');
    if (existing) return;
    var label = sectionLabel("Groups");
    label.setAttribute("data-section", "groups");
    var firstGroup = groupButtons[0];
    if (firstGroup && firstGroup.parentNode === host) {
      host.insertBefore(label, firstGroup);
    } else {
      host.appendChild(label);
    }
  }

  function refreshInboxes() {
    var hosts = [
      document.getElementById("csCliqListWrap"),
      document.getElementById("internalChatListWrap"),
    ];
    hosts.forEach(function (host) {
      if (host && !host.hidden) void prependToHost(host);
    });
    if (global.portalExecutiveDmRenderList && typeof global.portalExecutiveDmRenderList === "function") {
      void global.portalExecutiveDmRenderList();
    }
    if (global.portalRenderInternalChatSheet && typeof global.portalRenderInternalChatSheet === "function") {
      void global.portalRenderInternalChatSheet();
    }
  }

  function patchInternalRender() {
    if (patchedInternal || !global.portalRenderInternalChatSheet) return;
    patchedInternal = true;
    var orig = global.portalRenderInternalChatSheet;
    global.portalRenderInternalChatSheet = async function () {
      await orig.apply(this, arguments);
      var host = document.getElementById("internalChatListWrap");
      if (host && !host.hidden) await prependToHost(host);
    };
  }

  function init() {
    patchInternalRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.portalCsCliqAnnouncementInbox = {
    getInboxItems: getInboxItems,
    simplifyGroupLabel: simplifyGroupLabel,
    prependToHost: prependToHost,
    openReader: openReader,
    refreshInboxes: refreshInboxes,
    init: init,
  };
})(typeof window !== "undefined" ? window : globalThis);
