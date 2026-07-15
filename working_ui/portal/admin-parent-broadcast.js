/**
 * Admin — Family broadcast: send one message (email + optional WhatsApp) to
 * many parent/carer inboxes at once. Loads the live, de-duplicated recipient
 * list from portal-parent-broadcast-recipients, lets the admin review/select,
 * preview, and send in batch. Each send goes through portal-parent-notify-send
 * and is recorded in portal_parent_notify_log.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) { return String(s == null ? "" : s); },
    getClient: function () { return null; },
    toast: function () {},
    getSupabaseUrl: function () { return ""; },
    getAnonKey: function () { return ""; },
  };

  var state = {
    recipients: [],
    selected: {},          // email -> true
    loading: false,
    sending: false,
    cancel: false,
    query: "",
  };

  var DEFAULT_SUBJECT = "Important Update – ClubSENsational Contact Numbers";
  var DEFAULT_BODY =
    "\uD83D\uDCF1 Important Update – ClubSENsational Contact Numbers\n\n" +
    "Dear Parents,\n\n" +
    "We'd like to let you know about an update to our communication channels.\n\n" +
    "Due to a technical issue with our original WhatsApp number, we have made some changes to ensure we continue providing a fast and reliable service.\n\n" +
    "\u2705 Existing ClubSENsational families\n" +
    "Please contact us via our new WhatsApp number:\n" +
    "\uD83D\uDCF2 +44 7886 292726\n\n" +
    "This WhatsApp number is monitored Monday to Sunday, allowing the whole ClubSENsational team to access and respond to messages promptly. It is the best way to contact us for absences, session updates, general enquiries, or any non-urgent matters.\n\n" +
    "Please note that this number does not accept phone calls.\n\n" +
    "\uD83D\uDCDE If you need to speak to us directly or have an urgent matter, please call our usual ClubSENsational number:\n" +
    "+44 7592 558671\n\n" +
    "This number will continue to be used for urgent parent calls and new bookings.\n\n" +
    "Until the end of August, while we complete this transition, you may also receive calls from our administration number:\n" +
    "\uD83D\uDCDE +44 1313 816434\n\n" +
    "There is no need to save this number—if you receive a call from it, it will be from the ClubSENsational team.\n\n" +
    "Thank you for your patience and understanding as we improve our communication system.\n\n" +
    "The ClubSENsational Team";

  // Short pointer sent over WhatsApp (Meta template): keeps it to one concise
  // paragraph and refers parents to the full email. No closing sign-off here —
  // the approved template already appends "Thank you, ClubSENsational".
  // Stay well under ~700 chars — Meta rejects near-limit {{1}} as #132005
  // ("Translated text too long") once the template footer is included.
  var WA_TEMPLATE_MAX = 700;
  var DEFAULT_WA_BODY =
    "Following our email about our contact numbers: this is the new ClubSENsational WhatsApp number, +44 7886 292726. " +
    "It is monitored Monday to Sunday for messages only (this number does not take calls). " +
    "Please save it and message us here for absences, session updates and enquiries. " +
    "For urgent matters or new bookings, please call +44 7592 558671.";

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.toast) cfg.toast = options.toast;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function esc(s) { return cfg.esc(s); }
  function $(id) { return document.getElementById(id); }
  function phoneDigits(p) { return String(p || "").replace(/\D/g, ""); }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }
  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var r = await client.auth.getSession();
    var s = r && r.data && r.data.session;
    return s && s.access_token ? s.access_token : null;
  }
  async function edgePost(path, body) {
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };
    var res;
    try {
      res = await fetch(supabaseBase() + "/functions/v1/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
    var j = null;
    try { j = await res.json(); } catch (_e) { j = null; }
    if (!res.ok || !j || !j.ok) {
      return { ok: false, error: (j && (j.error || j.message)) || res.statusText || "request_failed", data: j };
    }
    return { ok: true, data: j };
  }

  function selectedRecipients() {
    return state.recipients.filter(function (r) { return state.selected[r.email]; });
  }

  function filteredRecipients() {
    var q = String(state.query || "").trim().toLowerCase();
    if (!q) return state.recipients;
    return state.recipients.filter(function (r) {
      return (
        String(r.parentName || "").toLowerCase().indexOf(q) >= 0 ||
        String(r.children || "").toLowerCase().indexOf(q) >= 0 ||
        String(r.email || "").toLowerCase().indexOf(q) >= 0 ||
        phoneDigits(r.mobile).indexOf(q) >= 0
      );
    });
  }

  function updateCounts() {
    var sel = selectedRecipients();
    var selWa = sel.filter(function (r) { return r.hasMobile; }).length;
    var el = $("pbcastCounts");
    if (el) {
      el.textContent =
        state.recipients.length + " inboxes loaded · " +
        sel.length + " selected (" + selWa + " with WhatsApp, " + (sel.length - selWa) + " email-only)";
    }
    var btn = $("pbcastSend");
    if (btn) btn.disabled = state.sending || !sel.length;
  }

  function renderTable() {
    var host = $("pbcastList");
    if (!host) return;
    var rows = filteredRecipients();
    if (!rows.length) {
      host.innerHTML = '<p class="muted" style="padding:12px">No recipients match your search.</p>';
      updateCounts();
      return;
    }
    host.innerHTML = rows.map(function (r) {
      var checked = state.selected[r.email] ? " checked" : "";
      var wa = r.hasMobile
        ? '<span class="portal-pnlog-chip portal-pnlog-chip--ok">WhatsApp</span>'
        : '<span class="portal-pnlog-chip portal-pnlog-chip--muted">email only</span>';
      return (
        '<label class="pbcast-row" style="display:grid;grid-template-columns:26px 1.2fr 1.4fr 110px;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #e2e8f0;min-width:0">' +
        '<input type="checkbox" class="pbcast-cb" data-email="' + esc(r.email) + '"' + checked + " />" +
        '<span style="min-width:0;overflow-wrap:anywhere"><strong>' + esc(r.parentName) + "</strong>" +
        (r.children ? '<br><span class="muted" style="font-size:12px">' + esc(r.children) + "</span>" : "") +
        "</span>" +
        '<span class="muted" style="min-width:0;overflow-wrap:anywhere;font-size:13px">' + esc(r.email) +
        (r.mobile ? '<br><span style="font-size:12px">' + esc(r.mobile) + "</span>" : "") + "</span>" +
        '<span style="justify-self:end">' + wa + "</span>" +
        "</label>"
      );
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".pbcast-cb"), function (cb) {
      cb.addEventListener("change", function () {
        var em = cb.getAttribute("data-email");
        if (cb.checked) state.selected[em] = true; else delete state.selected[em];
        updateCounts();
      });
    });
    updateCounts();
  }

  async function loadRecipients() {
    if (state.loading) return;
    state.loading = true;
    var statusEl = $("pbcastStatus");
    if (statusEl) { statusEl.textContent = "Loading recipients…"; statusEl.className = "portal-forms-status"; }
    var res = await edgePost("portal-parent-broadcast-recipients", {});
    state.loading = false;
    if (!res.ok) {
      if (statusEl) {
        statusEl.textContent = res.error === "session_expired"
          ? "Your session expired — sign in again."
          : "Could not load recipients (" + res.error + ").";
        statusEl.className = "portal-forms-status is-error";
      }
      return;
    }
    state.recipients = (res.data.recipients || []).map(function (r) {
      return {
        email: String(r.email || "").trim(),
        parentName: String(r.parentName || "").trim(),
        children: String(r.children || "").trim(),
        mobile: String(r.mobile || "").trim(),
        hasMobile: !!r.hasMobile,
      };
    }).filter(function (r) { return r.email; });
    // Default: select everyone.
    state.selected = {};
    state.recipients.forEach(function (r) { state.selected[r.email] = true; });
    if (statusEl) {
      statusEl.textContent =
        res.data.count + " inboxes · " + res.data.withMobile + " with WhatsApp · " +
        res.data.emailOnly + " email-only. Review and untick anyone who should not receive this.";
      statusEl.className = "portal-forms-status";
    }
    renderTable();
  }

  function setSendProgress(html) {
    var el = $("pbcastProgress");
    if (el) el.innerHTML = html;
  }

  async function runBatch() {
    if (state.sending) return;
    var sel = selectedRecipients();
    if (!sel.length) { cfg.toast("Select at least one recipient", "err"); return; }
    var channel = (document.querySelector('input[name="pbcastChannel"]:checked') || {}).value || "email";
    var subject = String(($("pbcastSubject") && $("pbcastSubject").value) || "").trim();
    var body = String(($("pbcastBody") && $("pbcastBody").value) || "").trim();
    var waBody = String(($("pbcastWaBody") && $("pbcastWaBody").value) || "").trim();
    if (!body) { cfg.toast("Message body is empty", "err"); return; }
    if (!subject) { cfg.toast("Subject is required for email", "err"); return; }
    if (channel === "both" && waBody && waBody.replace(/\s+/g, " ").length > WA_TEMPLATE_MAX) {
      cfg.toast("WhatsApp text is over " + WA_TEMPLATE_MAX + " characters — shorten it.", "err");
      return;
    }

    var waCount = sel.filter(function (r) { return r.hasMobile; }).length;
    var confirmMsg = "Send this message to " + sel.length + " inbox(es)?\n\n" +
      "• Email: " + sel.length + "\n" +
      (channel === "both" ? "• WhatsApp: " + waCount + " (recipients with a mobile)\n" : "") +
      "\nThis cannot be undone.";
    if (!global.confirm(confirmMsg)) return;

    state.sending = true;
    state.cancel = false;
    var sendBtn = $("pbcastSend");
    var stopBtn = $("pbcastStop");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }
    if (stopBtn) stopBtn.style.display = "";

    var ok = 0, fail = 0, done = 0;
    var log = [];
    if (!global.PortalParentNotifySend || typeof global.PortalParentNotifySend.send !== "function") {
      cfg.toast("Send module not loaded — refresh the page.", "err");
      state.sending = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send batch"; }
      if (stopBtn) stopBtn.style.display = "none";
      return;
    }

    for (var i = 0; i < sel.length; i++) {
      if (state.cancel) break;
      var r = sel[i];
      var thisChannel = (channel === "both" && r.hasMobile) ? "both" : "email";
      setSendProgress(
        "Sending " + (done + 1) + " of " + sel.length + "… (" + ok + " sent, " + fail + " failed)"
      );
      var res;
      try {
        res = await global.PortalParentNotifySend.send({
          kind: "contact_update",
          channel: thisChannel,
          parentName: r.parentName || null,
          parentEmail: r.email,
          parentWhatsapp: thisChannel === "both" ? phoneDigits(r.mobile) : null,
          subject: subject,
          body: body,
          whatsappBody: waBody || undefined,
          clientDisplay: r.children || null,
        });
      } catch (e) {
        res = { ok: false, error: String((e && e.message) || e) };
      }
      done++;
      if (res && res.ok) {
        ok++;
        log.unshift('<div style="color:#15803d">✓ ' + esc(r.parentName) + " — " + esc(r.email) + "</div>");
      } else {
        fail++;
        var em = global.PortalParentNotifySend.formatNotifyError
          ? global.PortalParentNotifySend.formatNotifyError(res && res.error, res && res.data)
          : String((res && res.error) || "failed");
        log.unshift('<div style="color:#b91c1c">✗ ' + esc(r.parentName) + " — " + esc(r.email) + ": " + esc(em) + "</div>");
      }
      setSendProgress(
        "<strong>" + done + " of " + sel.length + " done</strong> · " + ok + " sent · " + fail + " failed" +
        '<div style="max-height:220px;overflow:auto;margin-top:8px;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;padding:8px">' +
        log.join("") + "</div>"
      );
      // Gentle pacing to avoid hammering SMTP / WhatsApp.
      await new Promise(function (rr) { setTimeout(rr, 350); });
    }

    state.sending = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send batch"; }
    if (stopBtn) stopBtn.style.display = "none";
    cfg.toast(
      (state.cancel ? "Stopped. " : "Done. ") + ok + " sent, " + fail + " failed.",
      fail ? "err" : "ok"
    );
    updateCounts();
  }

  function bindControls() {
    var root = $("pbcastRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");

    var waBody = $("pbcastWaBody");
    var waLen = $("pbcastWaLen");
    function updateWaLen() {
      if (!waBody || !waLen) return;
      var n = String(waBody.value || "").replace(/\s+/g, " ").trim().length;
      waLen.textContent = n + " / " + WA_TEMPLATE_MAX + " characters" + (n > WA_TEMPLATE_MAX ? " — too long for WhatsApp template" : "");
      waLen.style.color = n > WA_TEMPLATE_MAX ? "#b91c1c" : "";
    }
    if (waBody) { waBody.addEventListener("input", updateWaLen); updateWaLen(); }

    var search = $("pbcastSearch");
    if (search) search.addEventListener("input", function () { state.query = search.value; renderTable(); });

    var selAll = $("pbcastSelectAll");
    if (selAll) selAll.addEventListener("click", function () {
      filteredRecipients().forEach(function (r) { state.selected[r.email] = true; });
      renderTable();
    });
    var selNone = $("pbcastSelectNone");
    if (selNone) selNone.addEventListener("click", function () {
      filteredRecipients().forEach(function (r) { delete state.selected[r.email]; });
      renderTable();
    });
    var selWa = $("pbcastSelectWa");
    if (selWa) selWa.addEventListener("click", function () {
      state.selected = {};
      state.recipients.forEach(function (r) { if (r.hasMobile) state.selected[r.email] = true; });
      renderTable();
    });
    var refresh = $("pbcastRefresh");
    if (refresh) refresh.addEventListener("click", function () { void loadRecipients(); });
    var send = $("pbcastSend");
    if (send) send.addEventListener("click", function () { void runBatch(); });
    var stop = $("pbcastStop");
    if (stop) stop.addEventListener("click", function () { state.cancel = true; });
  }

  function viewHtml() {
    return (
      '<div id="pbcastRoot" class="portal-day-ops-embed">' +
      '<h1 class="page-title">Family broadcast</h1>' +
      '<p class="page-intro">Send one message to many families at once — <strong>email</strong> (always) and optionally <strong>WhatsApp</strong> for those with a mobile on file. Every send is logged in <strong>Family messages</strong>. Replies to +44 7886 292726 arrive there automatically.</p>' +
      '<div id="pbcastStatus" class="portal-forms-status" role="status"></div>' +

      '<div style="display:grid;grid-template-columns:1fr;gap:14px;margin-top:12px">' +

      '<fieldset style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;min-width:0">' +
      '<legend class="muted" style="padding:0 6px">Message</legend>' +
      '<label class="muted" for="pbcastSubject">Email subject</label>' +
      '<input id="pbcastSubject" class="inp" style="max-width:100%" value="' + esc(DEFAULT_SUBJECT) + '" />' +
      '<label class="muted" for="pbcastBody" style="display:block;margin-top:10px">Message (email body / WhatsApp text)</label>' +
      '<textarea id="pbcastBody" class="txa" style="min-height:220px;max-width:100%">' + esc(DEFAULT_BODY) + "</textarea>" +
      '<fieldset style="margin:12px 0 0;padding:0;border:0;min-width:0"><legend class="muted" style="margin-bottom:6px">Channel</legend>' +
      '<div style="display:flex;flex-wrap:wrap;gap:14px;min-width:0">' +
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="radio" name="pbcastChannel" value="email" checked /> <span>Email only</span></label>' +
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="radio" name="pbcastChannel" value="both" /> <span>Email + WhatsApp</span></label>' +
      "</div>" +
      '<label class="muted" for="pbcastWaBody" style="display:block;margin-top:10px">WhatsApp text <span style="font-size:12px">(short — used only for the WhatsApp channel; the email uses the full body above)</span></label>' +
      '<textarea id="pbcastWaBody" class="txa" style="min-height:150px;max-width:100%">' + esc(DEFAULT_WA_BODY) + "</textarea>" +
      '<p id="pbcastWaLen" class="muted" style="margin:4px 0 0;font-size:12px"></p>' +
      '<p class="muted" style="margin:8px 0 0;font-size:12px;overflow-wrap:anywhere">WhatsApp uses the approved Meta template (env <code>PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE</code>), which must stay under ~' + WA_TEMPLATE_MAX + ' characters (Meta #132005 if longer once translated). It sends as a single paragraph; if none is set it falls back to SMS. Email always sends the full body above via SMTP.</p>' +
      "</fieldset>" +
      "</fieldset>" +

      '<fieldset style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;min-width:0">' +
      '<legend class="muted" style="padding:0 6px">Recipients</legend>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input type="search" id="pbcastSearch" class="inp" style="flex:1;min-width:160px" placeholder="Search name, child, email, phone…" autocomplete="off" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectAll">Select all</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectWa">Only WhatsApp</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectNone">Clear</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastRefresh">Reload</button>' +
      "</div>" +
      '<p id="pbcastCounts" class="muted" style="margin:0 0 8px"></p>' +
      '<div id="pbcastList" style="border:1px solid #e2e8f0;border-radius:8px;max-height:420px;overflow:auto;min-width:0"></div>' +
      "</fieldset>" +

      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
      '<button type="button" class="btn btn--pri" id="pbcastSend" style="background:#15803d;border-color:#15803d" disabled>Send batch</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="pbcastStop" style="display:none">Stop</button>' +
      "</div>" +
      '<div id="pbcastProgress" class="muted" style="margin-top:6px;min-width:0;overflow-wrap:anywhere"></div>' +

      "</div></div>"
    );
  }

  function bindModule() {
    if (global.PortalParentNotifySend && typeof global.PortalParentNotifySend.configure === "function") {
      global.PortalParentNotifySend.configure({
        esc: cfg.esc, toast: cfg.toast, getClient: cfg.getClient,
        getSupabaseUrl: cfg.getSupabaseUrl, getAnonKey: cfg.getAnonKey,
      });
    }
    bindControls();
    void loadRecipients();
  }

  global.PortalParentBroadcast = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
  };
})(typeof window !== "undefined" ? window : globalThis);
