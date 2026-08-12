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

  var ENQUIRY_SEED_KEY = "portal_broadcast_seed_v1";

  var state = {
    recipients: [],
    selected: {},          // email -> true
    loading: false,
    sending: false,
    cancel: false,
    query: "",
    payFilter: "",         // "" | "bank" | "gocardless"
    audience: "in_class",  // "in_class" | "waiting_list" | "all"
    seededFromEnquiries: false,
  };

  var DEFAULT_SUBJECT = "Welcome to your Family portal — re-enrol by 22 July & crash courses are open";
  var DEFAULT_BODY =
    "Dear families,\n\n" +
    "We are delighted to welcome you to the new clubSENsational Family portal — " +
    "a calmer, clearer home for everything about your child’s place with us.\n\n" +
    "You already have access. There is nothing to apply for.\n\n" +
    "Open your portal here:\n" +
    "https://www.clubsensational.org/parent\n\n" +
    "Sign in with:\n" +
    "• your child’s first name (no surname), and\n" +
    "• your family 4-digit PIN (we send this to you on WhatsApp).\n\n" +
    "What you can do in the Family portal\n" +
    "• See each child’s hub — sessions, photos, weekly notes and messages from the club\n" +
    "• Re-enrol for 2026/27 — please confirm by Wednesday 22 July 2026 (the last day to respond)\n" +
    "• Book July Intensive Courses & Camps (crash courses) now — you can book crash first and finish re-enrolment afterwards if that suits you better\n" +
    "• Update registration details, report absences, and keep in touch with the office\n\n" +
    "A tip that makes a real difference on your phone\n" +
    "You can use the portal in any browser. For the best experience, add Family to your Home Screen " +
    "(iPhone: Share → Add to Home Screen; Android: browser menu → Install app), open it from that icon, " +
    "and turn on alerts. Then session changes, announcements and photos can reach your phone even when " +
    "the browser is closed.\n\n" +
    "Important dates for places\n" +
    "• Wednesday 22 July 2026 — last day to respond to re-enrolment\n" +
    "• From Thursday 23 July 2026 — places that have not been confirmed may be released, and unconfirmed " +
    "slots may be offered to new clients on our booking website\n\n" +
    "If anything looks unclear when you sign in, just reply to this email or message us on WhatsApp — " +
    "we are here to help.\n\n" +
    "Warm wishes,\n" +
    "The clubSENsational team";

  // Short pointer sent over WhatsApp (Meta template): keeps it to one concise
  // paragraph and refers parents to the full email. No closing sign-off here —
  // the approved template already appends "Thank you, ClubSENsational".
  // Stay well under ~700 chars — Meta rejects near-limit {{1}} as #132005
  // ("Translated text too long") once the template footer is included.
  // Note: family PIN is personal — use individual WhatsApp sends for the PIN itself.
  var WA_TEMPLATE_MAX = 700;
  var DEFAULT_WA_BODY =
    "Welcome to your Family portal — you already have access.\n" +
    "https://www.clubsensational.org/parent\n" +
    "Sign in with your child’s first name + your family 4-digit PIN (sent to you on WhatsApp).\n\n" +
    "Inside you can re-enrol for 2026/27 (by Wed 22 July), book July crash courses now, see sessions, photos and messages.\n\n" +
    "Tip: Add to Home Screen, open from that icon and turn on alerts so updates reach your phone.\n\n" +
    "From Thu 23 July, unconfirmed places may be released. Full welcome email has all the details.";

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
    var pay = String(state.payFilter || "");
    return state.recipients.filter(function (r) {
      if (pay === "bank" && r.paymentMethod !== "bank") return false;
      if (pay === "gocardless" && r.paymentMethod !== "gocardless") return false;
      if (!q) return true;
      return (
        String(r.parentName || "").toLowerCase().indexOf(q) >= 0 ||
        String(r.children || "").toLowerCase().indexOf(q) >= 0 ||
        String(r.email || "").toLowerCase().indexOf(q) >= 0 ||
        String(r.paymentMethodLabel || "").toLowerCase().indexOf(q) >= 0 ||
        phoneDigits(r.mobile).indexOf(q) >= 0
      );
    });
  }

  function updateCounts() {
    var sel = selectedRecipients();
    var selWa = sel.filter(function (r) { return r.hasMobile; }).length;
    var selBank = sel.filter(function (r) { return r.paymentMethod === "bank"; }).length;
    var selGc = sel.filter(function (r) { return r.paymentMethod === "gocardless"; }).length;
    var el = $("pbcastCounts");
    if (el) {
      el.textContent =
        state.recipients.length + " inboxes loaded · " +
        sel.length + " selected (" + selWa + " with WhatsApp, " + (sel.length - selWa) + " email-only" +
        " · " + selBank + " bank · " + selGc + " GoCardless)";
    }
    var btn = $("pbcastSend");
    if (btn) btn.disabled = state.sending || !sel.length;
    syncPayFilterButtons();
    syncAudienceButtons();
  }

  function syncToggleButtons(pairs, activeKey) {
    pairs.forEach(function (pair) {
      var el = $(pair.id);
      if (!el) return;
      var on = activeKey === pair.key;
      if (on) {
        el.style.setProperty("background", "#f0f9ff", "important");
        el.style.setProperty("background-color", "#f0f9ff", "important");
        el.style.setProperty("color", "#0c4a6e", "important");
        el.style.setProperty("border-color", "#0ea5e9", "important");
        el.style.setProperty("box-shadow", "inset 0 0 0 1px #0ea5e9", "important");
        el.style.setProperty("font-weight", "600", "important");
      } else {
        el.style.removeProperty("background");
        el.style.removeProperty("background-color");
        el.style.removeProperty("color");
        el.style.removeProperty("border-color");
        el.style.removeProperty("box-shadow");
        el.style.removeProperty("font-weight");
      }
      el.setAttribute("aria-pressed", on ? "true" : "false");
      el.classList.toggle("pbcast-tog--on", on);
    });
  }

  function syncPayFilterButtons() {
    syncToggleButtons(
      [
        { id: "pbcastFilterPayAll", key: "" },
        { id: "pbcastFilterBank", key: "bank" },
        { id: "pbcastFilterGc", key: "gocardless" },
      ],
      state.payFilter
    );
  }

  function syncAudienceButtons() {
    syncToggleButtons(
      [
        { id: "pbcastAudInClass", key: "in_class" },
        { id: "pbcastAudWait", key: "waiting_list" },
        { id: "pbcastAudAll", key: "all" },
      ],
      state.audience
    );
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
      var listChip =
        r.listKind === "waiting_list" || (r.onWaitingList && !r.inClass)
          ? '<span class="portal-pnlog-chip" style="background:#e0f2fe;color:#075985;border:1px solid #38bdf8">Waiting list</span>'
          : r.listKind === "in_class_and_waiting" || (r.inClass && r.onWaitingList)
            ? '<span class="portal-pnlog-chip" style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24">In class + wait</span>'
            : "";
      var payChip =
        r.paymentMethod === "gocardless"
          ? '<span class="portal-pnlog-chip" style="background:#fecdd3;color:#9f1239;border:1px solid #f43f5e">GoCardless</span>'
          : r.paymentMethod === "bank"
            ? '<span class="portal-pnlog-chip" style="background:#f4f4f5;color:#3f3f46;border:1px solid #a1a1aa">Bank</span>'
            : r.paymentMethod === "other"
              ? '<span class="portal-pnlog-chip portal-pnlog-chip--muted">Other</span>'
              : '<span class="portal-pnlog-chip portal-pnlog-chip--muted">Pay ?</span>';
      return (
        '<label class="pbcast-row" style="display:grid;grid-template-columns:26px minmax(0,1.2fr) minmax(0,1.2fr) auto;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #e2e8f0;min-width:0">' +
        '<input type="checkbox" class="pbcast-cb" data-email="' + esc(r.email) + '"' + checked + " />" +
        '<span style="min-width:0;overflow-wrap:anywhere"><strong>' + esc(r.parentName) + "</strong>" +
        (r.children ? '<br><span class="muted" style="font-size:12px">' + esc(r.children) + "</span>" : "") +
        "</span>" +
        '<span class="muted" style="min-width:0;overflow-wrap:anywhere;font-size:13px">' + esc(r.email) +
        (r.mobile ? '<br><span style="font-size:12px">' + esc(r.mobile) + "</span>" : "") + "</span>" +
        '<span style="justify-self:end;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;min-width:0">' +
        listChip + payChip + wa +
        "</span>" +
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

  function consumeEnquirySeed() {
    try {
      var raw = sessionStorage.getItem(ENQUIRY_SEED_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(ENQUIRY_SEED_KEY);
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.recipients) || !parsed.recipients.length) return null;
      return parsed;
    } catch (_e) {
      try { sessionStorage.removeItem(ENQUIRY_SEED_KEY); } catch (_e2) { /* ignore */ }
      return null;
    }
  }

  function applyRecipientList(list, opts) {
    opts = opts || {};
    state.recipients = (list || []).map(function (r) {
      var email = String(r.email || "").trim().toLowerCase();
      var mobile = String(r.mobile || "").trim();
      return {
        email: email,
        parentName: String(r.parentName || "").trim() || email,
        children: String(r.children || "").trim(),
        mobile: mobile,
        hasMobile: r.hasMobile != null ? !!r.hasMobile : phoneDigits(mobile).length >= 10,
        paymentMethod: String(r.paymentMethod || "unknown"),
        paymentMethodLabel: String(r.paymentMethodLabel || ""),
        inClass: !!r.inClass,
        onWaitingList: !!r.onWaitingList,
        listKind: String(r.listKind || ""),
      };
    }).filter(function (r) { return r.email; });
    state.selected = {};
    state.payFilter = "";
    state.recipients.forEach(function (r) { state.selected[r.email] = true; });
    state.seededFromEnquiries = !!opts.fromEnquiries;
    var banner = $("pbcastEnquiryBanner");
    if (banner) {
      banner.style.display = state.seededFromEnquiries ? "" : "none";
      banner.textContent = state.seededFromEnquiries
        ? "Loaded " + state.recipients.length + " contact(s) from Enquiries & intake. Edit the message, review ticks, then Send. Audience buttons reload the portal contact lists."
        : "";
    }
    renderTable();
  }

  function audienceLabel(a) {
    if (a === "waiting_list") return "Waiting list";
    if (a === "all") return "All contacts";
    return "In class";
  }

  async function loadRecipients(opts) {
    opts = opts || {};
    if (state.loading) return;
    var statusEl = $("pbcastStatus");

    if (!opts.skipSeed && !opts.forceAudience) {
      var seed = consumeEnquirySeed();
      if (seed) {
        applyRecipientList(seed.recipients, { fromEnquiries: true });
        if (statusEl) {
          statusEl.textContent =
            seed.recipients.length + " contacts from Enquiries — selected and ready to message.";
          statusEl.className = "portal-forms-status";
        }
        var subj = $("pbcastSubject");
        if (subj && (!subj.value || /Welcome to your Family portal/i.test(subj.value))) {
          subj.value = "clubSENsational — places & services update";
        }
        return;
      }
    }

    if (opts.audience) state.audience = opts.audience;
    state.loading = true;
    if (statusEl) {
      statusEl.textContent = "Loading " + audienceLabel(state.audience).toLowerCase() + "…";
      statusEl.className = "portal-forms-status";
    }
    syncAudienceButtons();
    var res = await edgePost("portal-parent-broadcast-recipients", { audience: state.audience });
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
    applyRecipientList(res.data.recipients || [], { fromEnquiries: false });
    if (statusEl) {
      var aud = audienceLabel(res.data.audience || state.audience);
      statusEl.textContent =
        aud + ": " + res.data.count + " inboxes · " + res.data.withMobile + " with WhatsApp · " +
        res.data.emailOnly + " email-only" +
        (res.data.waitingList != null ? " · " + res.data.waitingList + " waitlisted" : "") +
        " · " + (res.data.withBank || 0) + " bank · " +
        (res.data.withGocardless || 0) + " GoCardless. Review and untick anyone who should not receive this.";
      statusEl.className = "portal-forms-status";
    }
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
    if (!body && channel !== "whatsapp") { cfg.toast("Message body is empty", "err"); return; }
    if (channel === "whatsapp" && !waBody && !body) { cfg.toast("WhatsApp text is empty", "err"); return; }
    if (!subject && channel !== "whatsapp") { cfg.toast("Subject is required for email", "err"); return; }
    if ((channel === "both" || channel === "whatsapp") && waBody && waBody.replace(/\s+/g, " ").length > WA_TEMPLATE_MAX) {
      cfg.toast("WhatsApp text is over " + WA_TEMPLATE_MAX + " characters — shorten it.", "err");
      return;
    }

    var sendList = sel;
    if (channel === "whatsapp") {
      sendList = sel.filter(function (r) { return r.hasMobile; });
      if (!sendList.length) {
        cfg.toast("No selected recipients have a WhatsApp number.", "err");
        return;
      }
    }
    var waCount = sendList.filter(function (r) { return r.hasMobile; }).length;
    var confirmMsg = "Send this message to " + sendList.length + " recipient(s)?\n\n";
    if (channel === "email") confirmMsg += "• Email: " + sendList.length + "\n";
    else if (channel === "whatsapp") confirmMsg += "• WhatsApp only: " + sendList.length + "\n";
    else confirmMsg += "• Email: " + sendList.length + "\n• WhatsApp: " + waCount + " (with mobile)\n";
    confirmMsg += "\nThis cannot be undone.";
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

    for (var i = 0; i < sendList.length; i++) {
      if (state.cancel) break;
      var r = sendList[i];
      var thisChannel =
        channel === "whatsapp"
          ? "whatsapp"
          : (channel === "both" && r.hasMobile) ? "both" : "email";
      setSendProgress(
        "Sending " + (done + 1) + " of " + sendList.length + "… (" + ok + " sent, " + fail + " failed)"
      );
      var res;
      try {
        res = await global.PortalParentNotifySend.send({
          kind: "contact_update",
          channel: thisChannel,
          parentName: r.parentName || null,
          parentEmail: r.email,
          parentWhatsapp: thisChannel !== "email" ? phoneDigits(r.mobile) : null,
          subject: subject || "clubSENsational",
          body: body || waBody,
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
        "<strong>" + done + " of " + sendList.length + " done</strong> · " + ok + " sent · " + fail + " failed" +
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
    var selEmail = $("pbcastSelectEmail");
    if (selEmail) selEmail.addEventListener("click", function () {
      state.selected = {};
      state.recipients.forEach(function (r) { if (!r.hasMobile) state.selected[r.email] = true; });
      renderTable();
    });
    function applyPayFilter(key) {
      state.payFilter = key;
      state.selected = {};
      filteredRecipients().forEach(function (r) { state.selected[r.email] = true; });
      renderTable();
    }
    var filterBank = $("pbcastFilterBank");
    if (filterBank) filterBank.addEventListener("click", function () {
      applyPayFilter(state.payFilter === "bank" ? "" : "bank");
    });
    var filterGc = $("pbcastFilterGc");
    if (filterGc) filterGc.addEventListener("click", function () {
      applyPayFilter(state.payFilter === "gocardless" ? "" : "gocardless");
    });
    var filterPayAll = $("pbcastFilterPayAll");
    if (filterPayAll) filterPayAll.addEventListener("click", function () {
      applyPayFilter("");
    });
    var selectBank = $("pbcastSelectBank");
    if (selectBank) selectBank.addEventListener("click", function () {
      state.payFilter = "bank";
      state.selected = {};
      state.recipients.forEach(function (r) {
        if (r.paymentMethod === "bank") state.selected[r.email] = true;
      });
      renderTable();
    });
    var selectGc = $("pbcastSelectGc");
    if (selectGc) selectGc.addEventListener("click", function () {
      state.payFilter = "gocardless";
      state.selected = {};
      state.recipients.forEach(function (r) {
        if (r.paymentMethod === "gocardless") state.selected[r.email] = true;
      });
      renderTable();
    });
    var refresh = $("pbcastRefresh");
    if (refresh) refresh.addEventListener("click", function () {
      void loadRecipients({ skipSeed: true, forceAudience: true });
    });
    function setAudience(aud) {
      if (state.loading || state.sending) return;
      state.audience = aud;
      syncAudienceButtons();
      void loadRecipients({ skipSeed: true, forceAudience: true, audience: aud });
    }
    var audIn = $("pbcastAudInClass");
    if (audIn) audIn.addEventListener("click", function () { setAudience("in_class"); });
    var audWait = $("pbcastAudWait");
    if (audWait) audWait.addEventListener("click", function () { setAudience("waiting_list"); });
    var audAll = $("pbcastAudAll");
    if (audAll) audAll.addEventListener("click", function () { setAudience("all"); });
    var send = $("pbcastSend");
    if (send) send.addEventListener("click", function () { void runBatch(); });
    var stop = $("pbcastStop");
    if (stop) stop.addEventListener("click", function () { state.cancel = true; });
  }

  function viewHtml() {
    return (
      '<div id="pbcastRoot" class="portal-day-ops-embed">' +
      '<style id="pbcastTogCss">' +
      ".pbcast-tog--on{background:#f0f9ff!important;background-color:#f0f9ff!important;color:#0c4a6e!important;border-color:#0ea5e9!important;box-shadow:inset 0 0 0 1px #0ea5e9!important;font-weight:600!important}" +
      "</style>" +
      '<h1 class="page-title">Family broadcast</h1>' +
      '<p class="page-intro">Send one message to many families at once — <strong>email</strong> and/or <strong>WhatsApp</strong>. Choose <strong>In class</strong>, <strong>Waiting list</strong>, or <strong>All</strong> under Recipients. Every send is logged in <strong>Family messages</strong>. Replies to +44 7886 292726 arrive there automatically. You can also seed this list from <strong>Operator → Enquiries &amp; intake</strong>.</p>' +
      '<div id="pbcastEnquiryBanner" class="card card-pad" style="display:none;margin:0 0 12px;border-color:rgba(21,128,61,.35);background:rgba(34,197,94,.08);font-size:13px;line-height:1.45;overflow-wrap:break-word" role="status"></div>' +
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
      '<label style="display:inline-flex;align-items:center;gap:6px"><input type="radio" name="pbcastChannel" value="whatsapp" /> <span>WhatsApp only</span></label>' +
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
      '<span class="muted" style="font-size:12px">Audience:</span>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastAudInClass" aria-pressed="true">In class</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastAudWait" aria-pressed="false">Waiting list</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastAudAll" aria-pressed="false">All</button>' +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input type="search" id="pbcastSearch" class="inp" style="flex:1;min-width:160px" placeholder="Search name, child, email, phone…" autocomplete="off" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectAll">Select all</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectWa">Only WhatsApp</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectEmail">Only Email</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectBank">Only Bank</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectGc">Only GoCardless</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastSelectNone">Clear</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastRefresh">Reload</button>' +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
      '<span class="muted" style="font-size:12px">Payment method:</span>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastFilterPayAll">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastFilterBank">Bank</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="pbcastFilterGc">GoCardless</button>' +
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
