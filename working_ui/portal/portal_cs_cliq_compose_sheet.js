/**
 * Premium announcement/reminder composer for CS Cliq on staff, lead, and CEO portals.
 */
(function (global) {
  "use strict";

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

  function ensureShell() {
    var el = document.getElementById("portalCsCliqComposeSheet");
    if (el) return el;
    el = document.createElement("div");
    el.id = "portalCsCliqComposeSheet";
    el.className = "portal-cs-cliq-compose-sheet";
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="portal-cs-cliq-compose-sheet__backdrop" data-cs-cliq-compose-close></div>' +
      '<div class="portal-cs-cliq-compose-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="portalCsCliqComposeTitle">' +
      '<header class="portal-cs-cliq-compose-sheet__head">' +
      '<button type="button" class="portal-cs-cliq-compose-sheet__close" data-cs-cliq-compose-close aria-label="Close">&times;</button>' +
      '<div><p class="portal-cs-cliq-compose-sheet__kicker">CS Cliq · Channels</p><h3 id="portalCsCliqComposeTitle">Compose</h3></div>' +
      "</header>" +
      '<div class="portal-cs-cliq-compose-sheet__body">' +
      '<label class="portal-cs-cliq-compose-label">Title</label>' +
      '<input type="text" id="portalCsCliqComposeTitleInput" class="portal-cs-cliq-compose-input" maxlength="200" placeholder="Title for staff…" />' +
      '<label class="portal-cs-cliq-compose-label">Message</label>' +
      '<textarea id="portalCsCliqComposeBody" class="portal-cs-cliq-compose-textarea" placeholder="Write your announcement or reminder…"></textarea>' +
      '<div id="portalCsCliqComposeReminderWrap" hidden>' +
      '<label class="portal-cs-cliq-compose-label">Reminder category</label>' +
      '<select id="portalCsCliqComposeRemCat" class="portal-cs-cliq-compose-select">' +
      '<option value="training">Training</option><option value="timesheet">Timesheet</option><option value="notes">Notes</option>' +
      "</select></div>" +
      '<label class="portal-cs-cliq-compose-label">Audience</label>' +
      '<select id="portalCsCliqComposeAudience" class="portal-cs-cliq-compose-select">' +
      '<option value="all_everyone">All staff</option>' +
      '<option value="leads_everyone">Leads</option>' +
      '<option value="role:swimming">Swimming staff</option>' +
      '<option value="role:fitness">Fitness staff</option>' +
      '<option value="role:climbing">Climbing staff</option>' +
      '<option value="role:support">Support staff</option>' +
      "</select>" +
      '<p id="portalCsCliqComposeErr" class="portal-cs-cliq-compose-err"></p>' +
      "</div>" +
      '<footer class="portal-cs-cliq-compose-sheet__foot">' +
      '<button type="button" class="btn btn--ghost" data-cs-cliq-compose-close>Cancel</button>' +
      '<button type="button" class="btn btn--pri" id="portalCsCliqComposeSend">Publish to portal</button>' +
      "</footer></div>";
    document.body.appendChild(el);
    el.querySelectorAll("[data-cs-cliq-compose-close]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });
    var send = document.getElementById("portalCsCliqComposeSend");
    if (send) send.addEventListener("click", function () {
      void publish();
    });
    return el;
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

  function open(kind) {
    kind = String(kind || "announcement").toLowerCase() === "reminder" ? "reminder" : "announcement";
    var shell = ensureShell();
    var title = document.getElementById("portalCsCliqComposeTitle");
    var titleInp = document.getElementById("portalCsCliqComposeTitleInput");
    var remWrap = document.getElementById("portalCsCliqComposeReminderWrap");
    var err = document.getElementById("portalCsCliqComposeErr");
    if (title) title.textContent = kind === "reminder" ? "Compose reminder" : "Compose announcement";
    if (titleInp) titleInp.value = "";
    var body = document.getElementById("portalCsCliqComposeBody");
    if (body) body.value = "";
    if (remWrap) remWrap.hidden = kind !== "reminder";
    if (err) err.textContent = "";
    shell.dataset.composeKind = kind;
    shell.removeAttribute("hidden");
    shell.setAttribute("aria-hidden", "false");
    shell.classList.add("is-open");
    if (titleInp) titleInp.focus();
  }

  function close() {
    var shell = document.getElementById("portalCsCliqComposeSheet");
    if (!shell) return;
    shell.classList.remove("is-open");
    shell.setAttribute("hidden", "");
    shell.setAttribute("aria-hidden", "true");
  }

  async function publish() {
    var c = client();
    var err = document.getElementById("portalCsCliqComposeErr");
    var shell = document.getElementById("portalCsCliqComposeSheet");
    var kind = shell && shell.dataset.composeKind === "reminder" ? "reminder" : "announcement";
    var title = String((document.getElementById("portalCsCliqComposeTitleInput") || {}).value || "").trim();
    var body = String((document.getElementById("portalCsCliqComposeBody") || {}).value || "").trim();
    var aud = String((document.getElementById("portalCsCliqComposeAudience") || {}).value || "all_everyone");
    if (!title) {
      if (err) err.textContent = "Add a title.";
      return;
    }
    if (!body) body = "(empty)";
    if (!c) {
      if (err) err.textContent = "Sign in to publish.";
      return;
    }
    var tgt = audienceTargets(aud);
    var row = {
      title: title.length > 200 ? title.slice(0, 197) + "…" : title,
      body: body,
      message_type: kind,
      priority: "normal",
      audience_scope: tgt.audience_scope,
      delivery_scope: tgt.delivery_scope,
      target_staff_role: tgt.target_staff_role,
      target_user_id: tgt.target_user_id,
    };
    if (kind === "reminder") {
      var cat = String((document.getElementById("portalCsCliqComposeRemCat") || {}).value || "notes").toLowerCase();
      row.reminder_category = ["training", "timesheet", "notes"].indexOf(cat) >= 0 ? cat : "notes";
    }
    var send = document.getElementById("portalCsCliqComposeSend");
    if (send) send.disabled = true;
    if (err) err.textContent = "";
    try {
      var uid = null;
      if (c.auth && c.auth.getSession) {
        var sess = await c.auth.getSession();
        uid = sess && sess.data && sess.data.session && sess.data.session.user ? sess.data.session.user.id : null;
      }
      if (uid) row.created_by = uid;
      var res = await c.from("portal_staff_announcements").insert([row]).select("id");
      if (res.error) throw new Error(res.error.message || String(res.error));
      close();
      if (global.portalCsCliqWorkspace && typeof global.portalCsCliqWorkspace.syncChannelsChrome === "function") {
        global.portalCsCliqWorkspace.syncChannelsChrome();
      }
      alert(kind === "reminder" ? "Reminder published to the staff portal." : "Announcement published to the staff portal.");
    } catch (e) {
      if (err) err.textContent = String((e && e.message) || e || "Could not publish.");
    } finally {
      if (send) send.disabled = false;
    }
  }

  function openManage() {
    if (typeof global.openSheet === "function") {
      global.openSheet("announcementsSheet");
      return;
    }
    try {
      global.location.assign("/admin_dashboard.html");
    } catch (_m) {}
  }

  global.portalCsCliqComposeSheet = {
    open: open,
    close: close,
    openManage: openManage,
  };
})(typeof window !== "undefined" ? window : globalThis);
