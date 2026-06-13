/**
 * CS Cliq Announcements centre � management create, review and logs.
 */
(function (global) {
  "use strict";

  var eventsBound = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function client() {
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client ? box.client : null;
  }

  function profile() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function canManage() {
    return (
      global.portalCsCliqHubRoles &&
      typeof global.portalCsCliqHubRoles.canManageAnnouncements === "function" &&
      global.portalCsCliqHubRoles.canManageAnnouncements()
    );
  }

  function audienceTargets(val) {
    val = String(val || "all_everyone");
    if (val === "leads_everyone") {
      return { audience_scope: "leads", delivery_scope: "everyone", target_staff_role: null, target_user_id: null };
    }
    if (val.indexOf("role:") === 0) {
      return {
        audience_scope: "all_staff",
        delivery_scope: "staff_role",
        target_staff_role: val.slice(5),
        target_user_id: null,
      };
    }
    return { audience_scope: "all_staff", delivery_scope: "everyone", target_staff_role: null, target_user_id: null };
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return iso;
    }
  }

  function audienceLabel(row) {
    if (!row) return "All staff";
    if (String(row.delivery_scope || "") === "staff_role" && row.target_staff_role) {
      return String(row.target_staff_role).charAt(0).toUpperCase() + String(row.target_staff_role).slice(1) + " staff";
    }
    if (String(row.audience_scope || "") === "leads") return "Leads";
    return "All staff";
  }

  async function fetchAnnouncements() {
    var c = client();
    if (!c) return [];
    var res = await c
      .from("portal_staff_announcements")
      .select(
        "id,title,body,message_type,created_at,ends_at,audience_scope,delivery_scope,target_staff_role,target_user_id,hide_after_ack_amount,hide_after_ack_unit"
      )
      .order("created_at", { ascending: false })
      .limit(40);
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data.filter(function (r) {
      return String(r.message_type || "announcement").toLowerCase() !== "reminder";
    });
  }

  async function fetchAckIds() {
    var c = client();
    var prof = profile();
    var uid = String(prof.id || "").trim();
    if (!c || !uid) return {};
    var res = await c.from("portal_staff_announcement_acks").select("announcement_id").eq("staff_id", uid);
    var map = {};
    if (!res.error && Array.isArray(res.data)) {
      res.data.forEach(function (row) {
        if (row && row.announcement_id) map[String(row.announcement_id)] = true;
      });
    }
    return map;
  }

  function ensureModal() {
    var existing = document.getElementById("portalCsCliqAnnouncementModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "portalCsCliqAnnouncementModal";
    modal.className = "portal-cs-cliq-announcement-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portalCsCliqAnnouncementModalTitle");
    modal.innerHTML =
      '<div class="portal-cs-cliq-announcement-modal__card">' +
      '<h3 id="portalCsCliqAnnouncementModalTitle">Create announcement</h3>' +
      '<label class="portal-cs-cliq-announcement-modal__field"><span>Title</span><input type="text" id="portalCsCliqAnnouncementTitle" maxlength="200" placeholder="Announcement title" /></label>' +
      '<label class="portal-cs-cliq-announcement-modal__field"><span>Audience</span><select id="portalCsCliqAnnouncementAudience">' +
      '<option value="all_everyone">All staff</option>' +
      '<option value="leads_everyone">Leads</option>' +
      '<option value="role:swimming">Swimming staff</option>' +
      '<option value="role:fitness">Fitness staff</option>' +
      '<option value="role:climbing">Climbing staff</option>' +
      '<option value="role:support">Support staff</option>' +
      "</select></label>" +
      '<label class="portal-cs-cliq-announcement-modal__field"><span>Message</span><textarea id="portalCsCliqAnnouncementBody" rows="5" maxlength="8000" placeholder="Write the update for staff and leads�"></textarea></label>' +
      '<label class="portal-cs-cliq-announcement-modal__check"><input type="checkbox" id="portalCsCliqAnnouncementRequireAck" checked /> Require acknowledgement</label>' +
      '<p id="portalCsCliqAnnouncementErr" class="portal-cs-cliq-announcement-modal__err" hidden></p>' +
      '<div class="portal-cs-cliq-announcement-modal__actions">' +
      '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--ghost" data-cs-cliq-ann-action="cancel">Cancel</button>' +
      '<button type="button" class="portal-cs-cliq-meetings-btn portal-cs-cliq-meetings-btn--pri" data-cs-cliq-ann-action="send">Send</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeModal();
    });
    modal.querySelectorAll("[data-cs-cliq-ann-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-cs-cliq-ann-action");
        if (act === "cancel") closeModal();
        if (act === "send") void sendAnnouncement();
      });
    });
    return modal;
  }

  function openModal() {
    if (!canManage()) return;
    var modal = ensureModal();
    var title = document.getElementById("portalCsCliqAnnouncementTitle");
    var body = document.getElementById("portalCsCliqAnnouncementBody");
    var err = document.getElementById("portalCsCliqAnnouncementErr");
    var ack = document.getElementById("portalCsCliqAnnouncementRequireAck");
    if (title) title.value = "";
    if (body) body.value = "";
    if (ack) ack.checked = true;
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    modal.hidden = false;
    if (title) title.focus();
  }

  function closeModal() {
    var modal = document.getElementById("portalCsCliqAnnouncementModal");
    if (modal) modal.hidden = true;
  }

  async function sendAnnouncement() {
    var c = client();
    var err = document.getElementById("portalCsCliqAnnouncementErr");
    var title = String((document.getElementById("portalCsCliqAnnouncementTitle") || {}).value || "").trim();
    var body = String((document.getElementById("portalCsCliqAnnouncementBody") || {}).value || "").trim();
    var aud = String((document.getElementById("portalCsCliqAnnouncementAudience") || {}).value || "all_everyone");
    var requireAck = !!(document.getElementById("portalCsCliqAnnouncementRequireAck") || {}).checked;
    if (!title) {
      if (err) {
        err.textContent = "Enter a title.";
        err.hidden = false;
      }
      return;
    }
    if (!body) {
      if (err) {
        err.textContent = "Enter a message.";
        err.hidden = false;
      }
      return;
    }
    if (!c) {
      if (err) {
        err.textContent = "Sign in to send announcements.";
        err.hidden = false;
      }
      return;
    }
    var tgt = audienceTargets(aud);
    var row = {
      title: title.length > 200 ? title.slice(0, 197) + "…" : title,
      body: body,
      message_type: "announcement",
      priority: "normal",
      audience_scope: tgt.audience_scope,
      delivery_scope: tgt.delivery_scope,
      target_staff_role: tgt.target_staff_role,
      target_user_id: tgt.target_user_id,
    };
    if (requireAck) {
      row.hide_after_ack_amount = 1;
      row.hide_after_ack_unit = "year";
    }
    try {
      var uid = null;
      if (c.auth && c.auth.getSession) {
        var sess = await c.auth.getSession();
        uid = sess && sess.data && sess.data.session && sess.data.session.user ? sess.data.session.user.id : null;
      }
      if (uid) row.created_by = uid;
      var res = await c.from("portal_staff_announcements").insert([row]).select("id");
      if (res.error) throw new Error(res.error.message || String(res.error));
      closeModal();
      try {
        global.dispatchEvent(new CustomEvent("portal-cs-cliq-announcement-sent", { detail: row }));
      } catch (_ev) {}
      refresh();
      try {
        global.dispatchEvent(new CustomEvent("portal-staff-announcements-changed"));
      } catch (_ev2) {}
    } catch (e) {
      if (err) {
        err.textContent = String((e && e.message) || e || "Could not send announcement.");
        err.hidden = false;
      }
    }
  }

  function renderCard(row, tag) {
    return (
      '<article class="portal-cs-cliq-announcements-item">' +
      '<div class="portal-cs-cliq-announcements-item__head">' +
      '<h4>' +
      esc(row.title || "Announcement") +
      "</h4>" +
      (tag ? '<span class="portal-cs-cliq-announcements-item__tag">' + esc(tag) + "</span>" : "") +
      "</div>" +
      '<p class="portal-cs-cliq-announcements-item__meta">' +
      esc(formatWhen(row.created_at)) +
      " � " +
      esc(audienceLabel(row)) +
      "</p>" +
      '<p class="portal-cs-cliq-announcements-item__preview">' +
      esc(String(row.body || "").trim().slice(0, 140)) +
      "</p></article>"
    );
  }

  function navIcon(id) {
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.iconHtml === "function") {
      return global.portalCsCliqWorkspace.iconHtml(id);
    }
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.defaultNavIconHtml === "function") {
      return global.portalCsCliqWorkspace.defaultNavIconHtml(id);
    }
    return "";
  }

  function runChannel(name) {
    if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.runChannelAction === "function") {
      global.portalCsCliqWorkspace.runChannelAction(name);
      return;
    }
    var acts =
      global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.channelActions === "function"
        ? global.portalCsCliqWorkspace.channelActions()
        : {};
    if (acts && typeof acts[name] === "function") acts[name]();
  }

  function dayOpsCardHtml(id, eyebrow, desc, tone, action) {
    return (
      '<button type="button" class="card card-pad dash-link-card card--premium dayops-screen-nav__card portal-cs-cliq__link-card" data-cs-cliq-ann-hub="' +
      esc(action) +
      '" data-dayops-tone="' +
      esc(tone) +
      '" style="flex:1;min-width:0">' +
      '<div class="dash-link-row dayops-screen-nav__stack" style="min-width:0">' +
      '<span class="dayops-screen-nav__ico-wrap" aria-hidden="true">' +
      navIcon(id) +
      "</span>" +
      '<div class="dash-link-meta dayops-screen-nav__meta" style="min-width:0">' +
      '<span class="dayops-screen-nav__label">' +
      esc(eyebrow) +
      "</span>" +
      '<span class="dayops-screen-nav__desc">' +
      esc(desc) +
      "</span></div></div></button>"
    );
  }

  async function render() {
    var host = document.getElementById("csCliqAnnouncementsCentre");
    if (!host) return;
    if (!canManage()) {
      host.innerHTML =
        '<header class="portal-cs-cliq__channels-head"><h2>Announcements &amp; reminders</h2>' +
        '<p class="portal-cs-cliq-announcements-dayops__intro muted">Management users can create organisation-wide updates here.</p></header>';
      return;
    }
    host.innerHTML =
      '<div class="portal-cs-cliq-announcements-dayops">' +
      '<header class="portal-cs-cliq__channels-head">' +
      "<h2>Announcements &amp; reminders</h2>" +
      '<p class="portal-cs-cliq-announcements-dayops__intro muted">Send a site-wide <strong>announcement</strong> or a targeted <strong>reminder</strong> (training, timesheet, notes).</p>' +
      "</header>" +
      '<div class="portal-cs-cliq__channels-body">' +
      '<div class="portal-cs-cliq__channels-grid">' +
      dayOpsCardHtml("announcements", "Announcement", "Site-wide", "announcements", "announce") +
      dayOpsCardHtml("reminders", "Reminder", "Targeted", "reminders", "reminder") +
      "</div>" +
      '<div class="portal-cs-cliq__channels-actions">' +
      '<button type="button" class="btn btn--sec" data-cs-cliq-ann-hub="signed">Signed announcements log</button>' +
      '<button type="button" class="btn btn--sec" data-cs-cliq-ann-hub="reminder-ack">Acknowledged reminders log</button>' +
      '<button type="button" class="btn btn--ghost" data-cs-cliq-ann-hub="manage">Manage sent messages</button>' +
      "</div></div></div>";
  }

  function bindHost(host) {
    if (!host || host.dataset.annHubBound === "1") return;
    host.dataset.annHubBound = "1";
    host.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-cs-cliq-ann-hub]");
      if (!btn) return;
      var act = btn.getAttribute("data-cs-cliq-ann-hub");
      if (act === "announce") runChannel("composeAnnouncement");
      else if (act === "reminder") runChannel("composeReminder");
      else if (act === "signed") runChannel("signedLog");
      else if (act === "reminder-ack") runChannel("reminderAck");
      else if (act === "manage") runChannel("manage");
      else if (act === "create") openModal();
    });
  }

  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;
    global.addEventListener("portal-cs-cliq-announcement-sent", function () {
      refresh();
    });
  }

  function refresh() {
    bindEventsOnce();
    void render().then(function () {
      bindHost(document.getElementById("csCliqAnnouncementsCentre"));
    });
  }

  global.portalCsCliqAnnouncementsHub = {
    refresh: refresh,
    openCreate: openModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
