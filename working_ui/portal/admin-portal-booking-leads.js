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
    /* Default portal-only — email interest import is outreach list, not visits. */
    filter: "all",
    origin: "portal",
    q: "",
    leads: [],
    meta: {},
    loading: false,
    error: "",
    selected: {}, // email -> true
  };

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

  function statusTone(status) {
    var s = String(status || "").toLowerCase();
    if (s === "prospective" || s === "new_lead") return "pend";
    if (s === "active_client" || s === "registration_submitted" || s === "booking_completed")
      return "ok";
    if (s === "waiting_list" || s === "exploring_services") return "info";
    if (s === "closed" || s === "no_booking") return "warn";
    return "info";
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
        client_status:
          state.filter === "all" || state.filter === "reg_started"
            ? "all"
            : state.filter,
        booking_status:
          state.filter === "reg_started" ? "registration_submitted" : "all",
        origin: state.origin || "portal",
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
    var verified = imported
      ? chip("Import — not a portal visit", "warn")
      : r.email_verified_at
        ? chip("Verified", "ok")
        : chip("Code sent / pending", "pend");
    var services = Array.isArray(r.services_viewed) && r.services_viewed.length
      ? esc(r.services_viewed.slice(0, 4).join(", "))
      : '<span class="muted">—</span>';
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
        '<button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_participant_documents">Forms folder</button>'
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
      "</td>" +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(r.mobile || "—") +
      "</td>" +
      "<td>" +
      chip(String(r.client_status || "").replace(/_/g, " "), statusTone(r.client_status)) +
      "</td>" +
      "<td>" +
      chip(String(r.booking_status || "").replace(/_/g, " "), statusTone(r.booking_status)) +
      '<div style="margin-top:4px">' +
      chip(
        String(r.registration_status || "").replace(/_/g, " "),
        String(r.registration_status || "").toLowerCase() === "submitted" ? "ok" : "info"
      ) +
      "</div></td>" +
      "<td>" +
      verified +
      "</td>" +
      '<td style="min-width:7rem">' +
      '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
      formBits.join("") +
      "</div>" +
      formSub +
      "</td>" +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      services +
      "</td>" +
      "<td>" +
      esc(formatWhen(r.last_activity_at || r.created_at)) +
      "</td>" +
      "</tr>"
    );
  }

  function clarifyBanner(meta) {
    var visitors = meta.portal_visitors_total != null ? meta.portal_visitors_total : "—";
    var portalContacts = meta.portal_otp_contacts != null ? meta.portal_otp_contacts : "—";
    var imported = meta.email_interest_imported != null ? meta.email_interest_imported : "—";
    var allRows = meta.leads_all_rows != null ? meta.leads_all_rows : "—";
    return (
      '<div class="card" style="margin:0 0 14px;border-color:rgba(180,120,20,.35);background:rgba(255,196,60,.08)">' +
      '<div class="card-pad" style="min-width:0">' +
      '<p style="margin:0 0 8px;font-weight:700;overflow-wrap:break-word">Do not read the big lead list as “visitors”.</p>' +
      '<p class="muted" style="margin:0;font-size:13px;line-height:1.5;overflow-wrap:break-word">' +
      "Real Booking Portal visitors (people who opened <code>/bookingportal</code>): about <strong>" +
      esc(visitors) +
      "</strong> sessions since tracking started. " +
      "OTP contacts from the portal itself: <strong>" +
      esc(portalContacts) +
      "</strong>. " +
      "The other <strong>" +
      esc(imported) +
      "</strong> rows are an office <em>email interest</em> import for outreach — they never visited the portal. " +
      "Total rows in this table if you choose All origins: " +
      esc(allRows) +
      "." +
      "</p>" +
      '<p class="muted" style="margin:8px 0 0;font-size:12px;line-height:1.45;overflow-wrap:break-word">' +
      'Tick people below → <strong>Send via Family broadcast</strong> to email/WhatsApp them. Live presence: <a href="/ceo_booking_service_portal.html" target="_blank" rel="noopener">CEO → Booking Portal visitors</a>.' +
      "</p>" +
      "</div></div>"
    );
  }

  function selectionBarHtml() {
    var n = selectedCount();
    var withSvc = (state.leads || []).filter(hasServices).length;
    var existing = (state.leads || []).filter(isExistingClient).length;
    return (
      '<div class="card" style="margin:0 0 14px">' +
      '<div class="card-pad" style="min-width:0">' +
      '<p style="margin:0 0 8px;font-weight:600;overflow-wrap:break-word">Contact selection</p>' +
      '<p class="muted" style="margin:0 0 10px;font-size:12px;line-height:1.45;overflow-wrap:break-word">' +
      '<strong id="bkLeadSelCount">' +
      esc(n) +
      "</strong> selected · " +
      esc(withSvc) +
      " on this list viewed services · " +
      esc(existing) +
      " existing clients shown. Use Origin / status filters first, then select." +
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
    var meta = state.meta || {};
    var rows = state.leads || [];
    var body = state.loading
      ? '<tr><td colspan="10" class="muted">Loading booking leads…</td></tr>'
      : state.error
        ? '<tr><td colspan="10" class="muted">Could not load leads (' +
          esc(state.error) +
          ").</td></tr>"
        : rows.length
          ? rows.map(rowHtml).join("")
          : '<tr><td colspan="10" class="muted">No portal OTP leads match this filter. Try <strong>All origins</strong> or <strong>Email interest import</strong> for outreach lists.</td></tr>';

    host.innerHTML =
      clarifyBanner(meta) +
      selectionBarHtml() +
      '<div class="filter-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px">' +
      '<input class="inp" id="bkLeadSearch" type="search" placeholder="Search name, email, phone…" value="' +
      esc(state.q) +
      '" style="max-width:260px;min-width:0" />' +
      '<select class="inp" id="bkLeadOrigin" style="max-width:260px;min-width:0" title="Portal visits vs email interest import">' +
      '<option value="portal"' +
      (state.origin === "portal" ? " selected" : "") +
      ">Origin: Portal OTP only</option>" +
      '<option value="email_interest"' +
      (state.origin === "email_interest" ? " selected" : "") +
      ">Origin: Email interest import</option>" +
      '<option value="all"' +
      (state.origin === "all" ? " selected" : "") +
      ">Origin: All (includes import)</option>" +
      "</select>" +
      '<select class="inp" id="bkLeadFilter" style="max-width:220px;min-width:0">' +
      '<option value="all"' +
      (state.filter === "all" ? " selected" : "") +
      ">All statuses</option>" +
      '<option value="prospective"' +
      (state.filter === "prospective" ? " selected" : "") +
      ">Prospective</option>" +
      '<option value="registered"' +
      (state.filter === "registered" ? " selected" : "") +
      ">Registered</option>" +
      '<option value="reg_started"' +
      (state.filter === "reg_started" ? " selected" : "") +
      ">Registration submitted</option>" +
      '<option value="active_client"' +
      (state.filter === "active_client" ? " selected" : "") +
      ">Existing clients</option>" +
      '<option value="waiting_list"' +
      (state.filter === "waiting_list" ? " selected" : "") +
      ">Waiting list</option>" +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadRefresh">Refresh</button>' +
      "</div>" +
      '<div class="grid-kpi" style="margin:0 0 14px">' +
      '<div class="kpi"><div class="kpi-l">Portal visitors</div><div class="kpi-v">' +
      esc(meta.portal_visitors_total != null ? meta.portal_visitors_total : "—") +
      '</div><div class="muted" style="font-size:11px;margin-top:4px;line-height:1.35;overflow-wrap:break-word">Real /bookingportal sessions</div></div>' +
      '<div class="kpi"><div class="kpi-l">Portal OTP contacts</div><div class="kpi-v">' +
      esc(meta.portal_otp_contacts != null ? meta.portal_otp_contacts : "—") +
      '</div><div class="muted" style="font-size:11px;margin-top:4px;line-height:1.35;overflow-wrap:break-word">Asked for a code on the portal</div></div>' +
      '<div class="kpi"><div class="kpi-l">Email interest import</div><div class="kpi-v">' +
      esc(meta.email_interest_imported != null ? meta.email_interest_imported : "—") +
      '</div><div class="muted" style="font-size:11px;margin-top:4px;line-height:1.35;overflow-wrap:break-word">Not visitors — outreach list</div></div>' +
      '<div class="kpi"><div class="kpi-l">Shown now</div><div class="kpi-v">' +
      esc(meta.total != null ? meta.total : rows.length) +
      '</div><div class="muted" style="font-size:11px;margin-top:4px;line-height:1.35;overflow-wrap:break-word">OTP verified (portal): ' +
      esc(meta.portal_otp_verified != null ? meta.portal_otp_verified : "—") +
      "</div></div></div>" +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
      '<table class="tbl tbl--center tbl--dense" id="bkLeadTable">' +
      "<thead><tr>" +
      '<th style="width:2.2rem" title="Select"></th>' +
      "<th>Parent / carer</th><th>Email</th><th>Phone</th><th>Client</th><th>Booking / reg</th><th>OTP</th><th>Form PDF</th><th>Services viewed</th><th>Last activity</th>" +
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
    var refresh = host.querySelector("#bkLeadRefresh");
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
        state.origin = String(origin.value || "portal");
        state.selected = {};
        void reload(host);
      });
    }
    if (filter) {
      filter.addEventListener("change", function () {
        state.filter = String(filter.value || "all");
        state.selected = {};
        void reload(host);
      });
    }
    if (refresh) {
      refresh.addEventListener("click", function () {
        void reload(host);
      });
    }

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
        (state.leads || []).forEach(function (r) {
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
        (state.leads || []).forEach(function (r) {
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
        (state.leads || []).forEach(function (r) {
          if (!isExistingClient(r)) return;
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
            cfg.toast("Pop-up blocked — allow pop-ups, or use Documents → Participant documents.");
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
      '<h1 class="page-title">Enquiries &amp; intake</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">' +
      "Portal OTP contacts and the email-interest outreach list. " +
      "Tick people who viewed services or existing clients, then <strong>Send via Family broadcast</strong> (or copy emails/phones). " +
      "Only Portal OTP counts as Booking Portal activity (~<strong>Portal visitors</strong> KPI), not the import." +
      "</p>" +
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
