/**
 * Admin — Booking Portal OTP leads (live portal_booking_leads).
 * Distinguishes real /bookingportal visitors from office email-interest imports.
 * Select contacts → copy emails/phones or send via Family broadcast.
 */
(function (global) {
  "use strict";

  var BROADCAST_SEED_KEY = "portal_broadcast_seed_v1";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
  };

  var state = {
    /* Leads are people who asked for an OTP code. Email interest stays behind Origin. */
    outcome: "all",
    origin: "portal",
    trackFilter: "all",
    q: "",
    leads: [],
    meta: {},
    loading: false,
    error: "",
    selected: {}, // email -> true
  };

  var TRACK_STATUSES = [
    { value: "new", label: "New" },
    { value: "following_up", label: "Following up" },
    { value: "waiting", label: "Waiting" },
    { value: "not_booking", label: "Not booking" },
    { value: "booked", label: "Booked" },
    { value: "closed", label: "Closed" },
  ];

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  function emailKey(r) {
    return String((r && r.email) || "")
      .trim()
      .toLowerCase();
  }

  function phoneDigits(p) {
    return String(p || "").replace(/\D/g, "");
  }

  function hasServices(r) {
    return Array.isArray(r.services_viewed) && r.services_viewed.length > 0;
  }

  function isExistingClient(r) {
    var s = String(r.client_status || "").toLowerCase();
    return s === "active_client" || s === "registered";
  }

  function isImportRow(r) {
    return String((r && r.origin) || "").toLowerCase() === "email_interest";
  }

  function selectedLeads() {
    return (state.leads || []).filter(function (r) {
      var em = emailKey(r);
      return em && state.selected[em];
    });
  }

  function selectedCount() {
    return selectedLeads().length;
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function chip(label, tone) {
    return (
      '<span class="chip chip--' +
      esc(tone || "info") +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function clientStatusLabel(raw) {
    var s = String(raw || "").toLowerCase();
    if (s === "registered") return "Registered";
    if (s === "active_client") return "Already a client";
    if (s === "waiting_list") return "Waiting list";
    if (s === "prospective") return "Only looked";
    if (s === "closed") return "Closed";
    return String(raw || "—").replace(/_/g, " ");
  }

  /** What this OTP lead did after asking for the code. */
  function leadOutcome(r) {
    r = r || {};
    var client = String(r.client_status || "").toLowerCase();
    var book = String(r.booking_status || "").toLowerCase();
    var reg = String(r.registration_status || "").toLowerCase();
    var source = String(r.source || "").toLowerCase();
    var existing = client === "active_client" || source.indexOf("existing client") >= 0;
    var regSubmitted = reg === "submitted" || book === "registration_submitted";
    var booked = book === "booking_completed";
    var started = reg === "started" || book === "booking_started";
    var waiting = client === "waiting_list" || book === "waiting_list";
    if (existing && regSubmitted && !booked) {
      return { key: "client_again", label: "Already a client, registered again", tone: "ok" };
    }
    if (existing && booked) {
      return { key: "client", label: "Already a client", tone: "ok" };
    }
    if (existing) {
      return { key: "client_looked", label: "Already a client, only looked", tone: "info" };
    }
    if (waiting) return { key: "waiting", label: "Waiting list", tone: "info" };
    if (booked) return { key: "booked", label: "Registered, place booked", tone: "ok" };
    if (regSubmitted || client === "registered") {
      return { key: "registered", label: "Registered", tone: "ok" };
    }
    if (started) return { key: "started", label: "Started registration", tone: "pend" };
    if (!r.email_verified_at) return { key: "code", label: "Asked for a code", tone: "pend" };
    return { key: "looked", label: "Only looked", tone: "info" };
  }

  function visibleLeads() {
    var rows = state.leads || [];
    var key = state.outcome || "all";
    if (key === "all") return rows;
    return rows.filter(function (r) {
      return leadOutcome(r).key === key;
    });
  }

  function statusTone(status) {
    var s = String(status || "").toLowerCase();
    if (s === "prospective" || s === "new_lead") return "pend";
    if (s === "registered") return "ok";
    if (s === "active_client" || s === "registration_submitted" || s === "booking_completed")
      return "ok";
    if (s === "waiting_list" || s === "exploring_services") return "info";
    if (s === "closed" || s === "no_booking") return "warn";
    return "info";
  }

  function trackStatusLabel(raw) {
    var s = String(raw || "new").toLowerCase();
    for (var i = 0; i < TRACK_STATUSES.length; i++) {
      if (TRACK_STATUSES[i].value === s) return TRACK_STATUSES[i].label;
    }
    return String(raw || "New").replace(/_/g, " ");
  }

  function trackSelectHtml(r) {
    var cur = String((r && r.track_status) || "new").toLowerCase();
    var opts = TRACK_STATUSES.map(function (t) {
      return (
        '<option value="' +
        esc(t.value) +
        '"' +
        (cur === t.value ? " selected" : "") +
        ">" +
        esc(t.label) +
        "</option>"
      );
    }).join("");
    return (
      '<select class="inp bk-lead-track" data-id="' +
      esc(r.id) +
      '" style="max-width:9.5rem;min-width:0;font-size:12px" title="Office track status">' +
      opts +
      "</select>" +
      (cur === "booked"
        ? '<div class="muted" style="font-size:10px;margin-top:3px">Off the marketing list</div>'
        : "")
    );
  }

  async function upsertLead(payload) {
    var token = await portalAuthToken();
    if (!token) return { error: "session_expired" };
    var res = await fetch(
      supabaseBase() + "/functions/v1/portal-admin-booking-leads-upsert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify(payload || {}),
      }
    );
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || "request_failed" };
    }
    return { lead: j.lead, outreach_joined: !!j.outreach_joined };
  }

  async function fetchLeads() {
    var token = await portalAuthToken();
    if (!token) return { error: "session_expired", leads: [] };
    var limit = state.origin === "portal" ? 200 : 400;
    var res = await fetch(supabaseBase() + "/functions/v1/portal-admin-booking-leads-list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify({
        client_status: "all",
        booking_status: "all",
        track_status: state.trackFilter || "all",
        origin: state.origin || "all",
        q: state.q,
        limit: limit,
      }),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || "request_failed", leads: [] };
    }
    return { leads: j.leads || [], meta: j.meta || {} };
  }

  function rowHtml(r) {
    var em = emailKey(r);
    var imported = isImportRow(r);
    var checked = em && state.selected[em] ? " checked" : "";
    var outcome = leadOutcome(r);
    var lookedAt =
      Array.isArray(r.services_viewed) && r.services_viewed.length
        ? r.services_viewed.slice(0, 2).join(", ")
        : "";
    var formBits = [];
    if (r.form_pdf_url) {
      formBits.push(
        '<button type="button" class="btn btn--pri btn--sm bk-lead-open-doc" data-url="' +
          esc(r.form_pdf_url) +
          '">Open PDF</button>'
      );
    }
    if (r.form_photo_url) {
      formBits.push(
        '<button type="button" class="btn btn--ghost btn--sm bk-lead-open-doc" data-url="' +
          esc(r.form_photo_url) +
          '">Photo</button>'
      );
    }
    if (!formBits.length) {
      formBits.push(
        '<button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_participant_documents">Registration forms</button>'
      );
    }
    var formSub = r.form_participant_name
      ? '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">' +
        esc(r.form_participant_name) +
        (r.form_type ? " · " + esc(String(r.form_type).replace(/_/g, " ")) : "") +
        "</div>"
      : "";
    var sourceLine = imported
      ? chip("Email interest list", "warn") +
        '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">' +
        esc(r.source || "Email interest import") +
        " — office outreach list, not someone who opened Booking Portal</div>"
      : '<div class="muted" style="font-size:11px;margin-top:2px;overflow-wrap:break-word">' +
        esc(r.source || "Booking Page") +
        "</div>";
    var activity =
      String(r.activity_interest || "").trim() ||
      (Array.isArray(r.services_viewed) && r.services_viewed.length
        ? r.services_viewed.slice(0, 3).join(", ")
        : "");
    var enquiry = String(r.enquiry_notes || "").trim();
    return (
      "<tr>" +
      '<td style="width:2.2rem;vertical-align:middle">' +
      (em
        ? '<input type="checkbox" class="bk-lead-cb" data-email="' +
          esc(em) +
          '"' +
          checked +
          ' aria-label="Select ' +
          esc(r.parent_name || em) +
          '" />'
        : "") +
      "</td>" +
      '<td style="min-width:0"><strong style="overflow-wrap:break-word">' +
      esc(r.parent_name || "—") +
      "</strong>" +
      sourceLine +
      "</td>" +
      '<td style="overflow-wrap:anywhere;min-width:0">' +
      esc(r.email || "—") +
      '<div class="muted" style="font-size:11px;margin-top:2px">' +
      esc(r.mobile || "—") +
      "</div></td>" +
      '<td style="min-width:0;max-width:10rem;overflow-wrap:break-word;font-size:12px">' +
      (activity ? esc(activity) : '<span class="muted">—</span>') +
      "</td>" +
      '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word;font-size:12px">' +
      (enquiry ? esc(enquiry.slice(0, 160)) : '<span class="muted">—</span>') +
      "</td>" +
      '<td style="min-width:0">' +
      trackSelectHtml(r) +
      "</td>" +
      '<td style="min-width:0;max-width:14rem;overflow-wrap:break-word">' +
      '<span class="chip chip--' +
      esc(outcome.tone) +
      '" style="white-space:normal;overflow-wrap:anywhere;max-width:100%;display:inline-block">' +
      esc(outcome.label) +
      "</span>" +
      (lookedAt
        ? '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">Looked at ' +
          esc(lookedAt) +
          "</div>"
        : "") +
      "</td>" +
      '<td style="min-width:7rem">' +
      '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
      formBits.join("") +
      "</div>" +
      formSub +
      "</td>" +
      "<td>" +
      esc(formatWhen(r.last_activity_at || r.created_at)) +
      "</td>" +
      "</tr>"
    );
  }

  function potentialFormHtml() {
    var trackOpts = TRACK_STATUSES.map(function (t) {
      return (
        '<option value="' +
        esc(t.value) +
        '"' +
        (t.value === "new" ? " selected" : "") +
        ">" +
        esc(t.label) +
        "</option>"
      );
    }).join("");
    return (
      '<div class="card" style="margin:0 0 14px">' +
      '<div class="card-pad" style="min-width:0">' +
      '<p style="margin:0 0 8px;font-weight:700">Add / update potential client</p>' +
      '<p class="muted" style="margin:0 0 10px;font-size:12px;line-height:1.45;overflow-wrap:break-word">' +
      "Track email, phone, enquiry, activity and status. If status is anything other than <strong>Booked</strong>, their email joins the marketing outreach list automatically." +
      "</p>" +
      '<div class="filter-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin:0">' +
      '<input class="inp" id="bkPotName" type="text" placeholder="Parent / carer name" style="max-width:180px;min-width:0" />' +
      '<input class="inp" id="bkPotEmail" type="email" placeholder="Email *" style="max-width:220px;min-width:0" />' +
      '<input class="inp" id="bkPotPhone" type="tel" placeholder="Phone" style="max-width:150px;min-width:0" />' +
      '<input class="inp" id="bkPotActivity" type="text" placeholder="Activity (e.g. Aquatic Wed)" style="max-width:200px;min-width:0" />' +
      '<select class="inp" id="bkPotStatus" style="max-width:150px;min-width:0">' +
      trackOpts +
      "</select>" +
      '<input class="inp" id="bkPotEnquiry" type="text" placeholder="Enquiry / notes" style="flex:1 1 220px;min-width:0;max-width:28rem" />' +
      '<button type="button" class="btn btn--pri btn--sm" id="bkPotSave">Save potential</button>' +
      "</div></div></div>"
    );
  }

  function selectionBarHtml() {
    var n = selectedCount();
    var withSvc = (state.leads || []).filter(hasServices).length;
    var existing = (state.leads || []).filter(function (r) {
      var key = leadOutcome(r).key;
      return key === "client" || key === "client_looked" || key === "client_again";
    }).length;
    return (
      '<div class="card" style="margin:0 0 14px">' +
      '<div class="card-pad" style="min-width:0">' +
      '<p style="margin:0 0 8px;font-weight:600;overflow-wrap:break-word">Write to this filter</p>' +
      '<p class="muted" style="margin:0 0 10px;font-size:12px;line-height:1.45;overflow-wrap:break-word">' +
      "This is not a filter. Use Search, Origin, Track status and Outcome above first. Then tick rows, or use these buttons, to copy emails, copy phones, or open Family broadcast. " +
      '<strong id="bkLeadSelCount">' +
      esc(n) +
      "</strong> ticked · " +
      esc(withSvc) +
      " viewed a service · " +
      esc(existing) +
      " already a client. Nothing here books a place." +
      "</p>" +
      '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadSelAll">Select all shown</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadSelServices">Select viewed services</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadSelExisting">Select existing clients</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadSelClear">Clear</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="bkLeadCopyEmails">Copy emails</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="bkLeadCopyPhones">Copy phones</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="bkLeadSendBroadcast">Send via Family broadcast</button>' +
      "</div></div></div>"
    );
  }

  function updateSelCount() {
    var el = document.getElementById("bkLeadSelCount");
    if (el) el.textContent = String(selectedCount());
  }

  function renderHost(host) {
    if (!host) return;
    var rows = visibleLeads();
    var body = state.loading
      ? '<tr><td colspan="9" class="muted">Loading OTP leads…</td></tr>'
      : state.error
        ? '<tr><td colspan="9" class="muted">Could not load leads (' +
          esc(state.error) +
          ").</td></tr>"
        : rows.length
          ? rows.map(rowHtml).join("")
          : '<tr><td colspan="9" class="muted">No OTP leads with this outcome.</td></tr>';

    var trackFilterOpts = [
      { value: "all", label: "All track statuses" },
      { value: "outreach", label: "On marketing outreach" },
    ]
      .concat(TRACK_STATUSES)
      .map(function (t) {
        var v = t.value;
        var lab = t.label || trackStatusLabel(v);
        return (
          '<option value="' +
          esc(v) +
          '"' +
          (state.trackFilter === v ? " selected" : "") +
          ">" +
          esc(lab) +
          "</option>"
        );
      })
      .join("");

    var outcomeOpts = [
      { value: "all", label: "All outcomes" },
      { value: "code", label: "Asked for a code" },
      { value: "looked", label: "Only looked" },
      { value: "started", label: "Started registration" },
      { value: "registered", label: "Registered" },
      { value: "booked", label: "Registered, place booked" },
      { value: "client_looked", label: "Already a client, only looked" },
      { value: "client_again", label: "Already a client, registered again" },
      { value: "client", label: "Already a client" },
      { value: "waiting", label: "Waiting list" },
    ]
      .map(function (t) {
        return (
          '<option value="' +
          esc(t.value) +
          '"' +
          (state.outcome === t.value ? " selected" : "") +
          ">" +
          esc(t.label) +
          "</option>"
        );
      })
      .join("");
    host.innerHTML =
      potentialFormHtml() +
      '<div class="filter-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px">' +
      '<input class="inp" id="bkLeadSearch" type="search" placeholder="Search name, email, phone, enquiry…" value="' +
      esc(state.q) +
      '" style="max-width:260px;min-width:0" />' +
      '<select class="inp" id="bkLeadOrigin" style="max-width:260px;min-width:0" title="Portal visits vs email interest import">' +
      '<option value="all"' +
      (state.origin === "all" ? " selected" : "") +
      ">Origin: All</option>" +
      '<option value="potential"' +
      (state.origin === "potential" ? " selected" : "") +
      ">Origin: Office potential clients</option>" +
      '<option value="outreach"' +
      (state.origin === "outreach" ? " selected" : "") +
      ">Origin: Marketing outreach list</option>" +
      '<option value="portal"' +
      (state.origin === "portal" ? " selected" : "") +
      ">Origin: Portal OTP only</option>" +
      '<option value="email_interest"' +
      (state.origin === "email_interest" ? " selected" : "") +
      ">Origin: Email interest + outreach</option>" +
      "</select>" +
      '<select class="inp" id="bkLeadTrackFilter" style="max-width:220px;min-width:0">' +
      trackFilterOpts +
      "</select>" +
      '<select class="inp" id="bkLeadFilter" style="max-width:280px;min-width:0" title="What the lead did after the code">' +
      outcomeOpts +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadRefresh">Refresh</button>' +
      "</div>" +
      selectionBarHtml() +
      '<div class="grid-kpi" style="margin:0 0 14px">' +
      '<div class="kpi"><div class="kpi-l">' +
      (state.origin === "portal" ? "OTP leads" : "Shown now") +
      '</div><div class="kpi-v">' +
      esc(rows.length) +
      '</div><div class="muted" style="font-size:11px;margin-top:4px;line-height:1.35;overflow-wrap:break-word">' +
      (state.origin === "portal"
        ? state.outcome === "all"
          ? "People who asked for a code. Outcome is in the table."
          : "OTP leads with this outcome."
        : "This origin is not the OTP list.") +
      "</div></div></div>" +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
      '<table class="tbl tbl--center tbl--dense" id="bkLeadTable">' +
      "<thead><tr>" +
      '<th style="width:2.2rem" title="Select"></th>' +
      "<th>Parent / carer</th><th>Email / phone</th><th>Activity</th><th>Enquiry</th>" +
      '<th title="Optional. Leave New. Booked takes the email off the marketing list. It does not change Outcome.">Track status</th>' +
      "<th>Outcome</th><th>Forms</th><th>Updated</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div></div>";
  }

  async function copyText(label, text) {
    var t = String(text || "").trim();
    if (!t) {
      cfg.toast("Nothing to copy — select rows first.");
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        var ta = document.createElement("textarea");
        ta.value = t;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      cfg.toast("Copied " + label + " (" + t.split(/\n/).filter(Boolean).length + ")");
    } catch (_e) {
      cfg.toast("Could not copy — check browser permissions.");
    }
  }

  function sendViaBroadcast() {
    var sel = selectedLeads();
    if (!sel.length) {
      cfg.toast("Select at least one person first.");
      return;
    }
    var recipients = [];
    var seen = {};
    sel.forEach(function (r) {
      var em = emailKey(r);
      if (!em || seen[em]) return;
      seen[em] = true;
      var mobile = String(r.mobile || "").trim();
      var svc = Array.isArray(r.services_viewed) ? r.services_viewed.filter(Boolean).join(", ") : "";
      recipients.push({
        email: em,
        parentName: String(r.parent_name || "").trim() || em,
        children: svc ? "Services viewed: " + svc : "",
        mobile: mobile,
        hasMobile: phoneDigits(mobile).length >= 10,
        paymentMethod: "unknown",
        paymentMethodLabel: "",
        marketingConsent: !!r.marketing_consent,
        origin: isImportRow(r) ? "email_interest" : "portal",
      });
    });
    try {
      sessionStorage.setItem(
        BROADCAST_SEED_KEY,
        JSON.stringify({
          source: "enquiries",
          at: new Date().toISOString(),
          recipients: recipients,
        })
      );
    } catch (_e) {
      cfg.toast("Could not prepare recipients — try Copy emails instead.");
      return;
    }
    cfg.toast(recipients.length + " ready — opening Family broadcast…");
    if (typeof global.portalAdminSetView === "function") {
      global.portalAdminSetView("portal_parent_broadcast");
    } else {
      cfg.toast("Open Communications → Family broadcast to send.");
    }
  }

  async function reload(host) {
    state.loading = true;
    state.error = "";
    renderHost(host);
    var out = await fetchLeads();
    state.loading = false;
    if (out.error) {
      state.error = out.error;
      state.leads = [];
      state.meta = {};
    } else {
      state.leads = out.leads || [];
      state.meta = out.meta || {};
      /* Drop selections that are no longer in the list. */
      var keep = {};
      (state.leads || []).forEach(function (r) {
        var em = emailKey(r);
        if (em && state.selected[em]) keep[em] = true;
      });
      state.selected = keep;
    }
    renderHost(host);
    wire(host);
  }

  function wire(host) {
    if (!host) return;
    var search = host.querySelector("#bkLeadSearch");
    var filter = host.querySelector("#bkLeadFilter");
    var origin = host.querySelector("#bkLeadOrigin");
    var trackFilter = host.querySelector("#bkLeadTrackFilter");
    var refresh = host.querySelector("#bkLeadRefresh");
    var potSave = host.querySelector("#bkPotSave");
    if (search) {
      search.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          state.q = String(search.value || "").trim();
          void reload(host);
        }
      });
      search.addEventListener("change", function () {
        state.q = String(search.value || "").trim();
        void reload(host);
      });
    }
    if (origin) {
      origin.addEventListener("change", function () {
        state.origin = String(origin.value || "all");
        state.selected = {};
        void reload(host);
      });
    }
    if (trackFilter) {
      trackFilter.addEventListener("change", function () {
        state.trackFilter = String(trackFilter.value || "all");
        state.selected = {};
        void reload(host);
      });
    }
    if (filter) {
      filter.addEventListener("change", function () {
        state.outcome = String(filter.value || "all");
        renderHost(host);
        wire(host);
      });
    }
    if (refresh) {
      refresh.addEventListener("click", function () {
        void reload(host);
      });
    }
    if (potSave) {
      potSave.addEventListener("click", function () {
        void (async function () {
          var nameEl = host.querySelector("#bkPotName");
          var emailEl = host.querySelector("#bkPotEmail");
          var phoneEl = host.querySelector("#bkPotPhone");
          var actEl = host.querySelector("#bkPotActivity");
          var stEl = host.querySelector("#bkPotStatus");
          var enqEl = host.querySelector("#bkPotEnquiry");
          var email = String((emailEl && emailEl.value) || "")
            .trim()
            .toLowerCase();
          if (!email || email.indexOf("@") < 0) {
            cfg.toast("Email is required.");
            return;
          }
          potSave.disabled = true;
          var out = await upsertLead({
            parent_name: String((nameEl && nameEl.value) || "").trim(),
            email: email,
            mobile: String((phoneEl && phoneEl.value) || "").trim(),
            activity_interest: String((actEl && actEl.value) || "").trim(),
            track_status: String((stEl && stEl.value) || "new"),
            enquiry_notes: String((enqEl && enqEl.value) || "").trim(),
          });
          potSave.disabled = false;
          if (out.error) {
            cfg.toast("Could not save: " + out.error);
            return;
          }
          cfg.toast(
            out.outreach_joined
              ? "Saved — email on marketing outreach (status is not Booked)."
              : "Saved as Booked."
          );
          if (nameEl) nameEl.value = "";
          if (emailEl) emailEl.value = "";
          if (phoneEl) phoneEl.value = "";
          if (actEl) actEl.value = "";
          if (enqEl) enqEl.value = "";
          if (stEl) stEl.value = "new";
          state.origin = "potential";
          void reload(host);
        })();
      });
    }
    host.querySelectorAll(".bk-lead-track").forEach(function (sel) {
      sel.addEventListener("change", function () {
        void (async function () {
          var id = String(sel.getAttribute("data-id") || "").trim();
          var lead = (state.leads || []).find(function (r) {
            return String(r.id) === id;
          });
          if (!lead || !lead.email) {
            cfg.toast("Missing lead email.");
            return;
          }
          sel.disabled = true;
          var out = await upsertLead({
            id: id,
            email: emailKey(lead),
            parent_name: String(lead.parent_name || "").trim(),
            mobile: String(lead.mobile || "").trim(),
            track_status: String(sel.value || "new"),
            enquiry_notes: String(lead.enquiry_notes || "").trim(),
            activity_interest: String(lead.activity_interest || "").trim(),
          });
          sel.disabled = false;
          if (out.error) {
            cfg.toast("Status update failed: " + out.error);
            void reload(host);
            return;
          }
          cfg.toast(
            out.outreach_joined
              ? "Status updated — on outreach list."
              : "Status updated (Booked)."
          );
          void reload(host);
        })();
      });
    });

    host.querySelectorAll(".bk-lead-cb").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var em = String(cb.getAttribute("data-email") || "").toLowerCase();
        if (!em) return;
        if (cb.checked) state.selected[em] = true;
        else delete state.selected[em];
        updateSelCount();
      });
    });

    var selAll = host.querySelector("#bkLeadSelAll");
    if (selAll) {
      selAll.addEventListener("click", function () {
        visibleLeads().forEach(function (r) {
          var em = emailKey(r);
          if (em) state.selected[em] = true;
        });
        renderHost(host);
        wire(host);
      });
    }
    var selSvc = host.querySelector("#bkLeadSelServices");
    if (selSvc) {
      selSvc.addEventListener("click", function () {
        state.selected = {};
        visibleLeads().forEach(function (r) {
          if (!hasServices(r)) return;
          var em = emailKey(r);
          if (em) state.selected[em] = true;
        });
        renderHost(host);
        wire(host);
        cfg.toast(selectedCount() + " with services viewed");
      });
    }
    var selEx = host.querySelector("#bkLeadSelExisting");
    if (selEx) {
      selEx.addEventListener("click", function () {
        state.selected = {};
        visibleLeads().forEach(function (r) {
          var key = leadOutcome(r).key;
          if (key !== "client" && key !== "client_looked" && key !== "client_again") return;
          var em = emailKey(r);
          if (em) state.selected[em] = true;
        });
        renderHost(host);
        wire(host);
        cfg.toast(selectedCount() + " existing clients");
      });
    }
    var selClear = host.querySelector("#bkLeadSelClear");
    if (selClear) {
      selClear.addEventListener("click", function () {
        state.selected = {};
        renderHost(host);
        wire(host);
      });
    }
    var copyEm = host.querySelector("#bkLeadCopyEmails");
    if (copyEm) {
      copyEm.addEventListener("click", function () {
        void copyText(
          "emails",
          selectedLeads()
            .map(function (r) {
              return emailKey(r);
            })
            .filter(Boolean)
            .join("\n")
        );
      });
    }
    var copyPh = host.querySelector("#bkLeadCopyPhones");
    if (copyPh) {
      copyPh.addEventListener("click", function () {
        void copyText(
          "phones",
          selectedLeads()
            .map(function (r) {
              return String(r.mobile || "").trim();
            })
            .filter(Boolean)
            .join("\n")
        );
      });
    }
    var sendBtn = host.querySelector("#bkLeadSendBroadcast");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        sendViaBroadcast();
      });
    }

    host.querySelectorAll(".bk-lead-open-doc").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        var url = String(btn.getAttribute("data-url") || "")
          .replace(/&amp;/g, "&")
          .trim();
        if (!url) {
          cfg.toast("No PDF linked for this lead yet.");
          return;
        }
        try {
          var a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          if (a.parentNode) a.parentNode.removeChild(a);
        } catch (_e) {
          try {
            window.open(url, "_blank");
          } catch (_e2) {
            cfg.toast("Pop-up blocked — allow pop-ups, or use Documents → Registration forms.");
          }
        }
      });
    });
    host.querySelectorAll("[data-view-target]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-view-target");
        if (id && typeof global.portalAdminSetView === "function") {
          global.portalAdminSetView(id);
        }
      });
    });
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Leads</h1>' +
      '<div id="bkLeadHost"></div>'
    );
  }

  function bindModule() {
    var host = document.getElementById("bkLeadHost");
    if (!host) return;
    void reload(host);
  }

  global.PortalBookingLeads = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
  };
})(typeof window !== "undefined" ? window : globalThis);
