/**
 * Admin — Booking Portal OTP leads (live portal_booking_leads).
 * Distinguishes real /bookingportal visitors from office email-interest imports.
 */
(function (global) {
  "use strict";

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

  function isImportRow(r) {
    return String(r && r.origin || "").toLowerCase() === "email_interest";
  }

  async function fetchLeads() {
    var token = await portalAuthToken();
    if (!token) return { error: "session_expired", leads: [] };
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
        limit: 200,
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
    var imported = isImportRow(r);
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
      "<td style=\"min-width:0\"><strong style=\"overflow-wrap:break-word\">" +
      esc(r.parent_name || "—") +
      "</strong>" +
      sourceLine +
      "</td>" +
      "<td style=\"overflow-wrap:anywhere;min-width:0\">" +
      esc(r.email || "—") +
      "</td>" +
      "<td style=\"min-width:0;overflow-wrap:break-word\">" +
      esc(r.mobile || "—") +
      "</td>" +
      "<td>" +
      chip(String(r.client_status || "").replace(/_/g, " "), statusTone(r.client_status)) +
      "</td>" +
      "<td>" +
      chip(String(r.booking_status || "").replace(/_/g, " "), statusTone(r.booking_status)) +
      "<div style=\"margin-top:4px\">" +
      chip(
        String(r.registration_status || "").replace(/_/g, " "),
        String(r.registration_status || "").toLowerCase() === "submitted" ? "ok" : "info"
      ) +
      "</div></td>" +
      "<td>" +
      verified +
      "</td>" +
      "<td style=\"min-width:7rem\">" +
      '<div class="toolbar" style="margin:0;flex-wrap:wrap;gap:6px">' +
      formBits.join("") +
      "</div>" +
      formSub +
      "</td>" +
      "<td style=\"min-width:0;overflow-wrap:break-word\">" +
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
      'Live presence (online now / last 24h) is on <a href="/ceo_booking_service_portal.html" target="_blank" rel="noopener">CEO → Booking Portal visitors</a>.' +
      "</p>" +
      "</div></div>"
    );
  }

  function renderHost(host) {
    if (!host) return;
    var meta = state.meta || {};
    var rows = state.leads || [];
    var body = state.loading
      ? '<tr><td colspan="9" class="muted">Loading booking leads…</td></tr>'
      : state.error
        ? '<tr><td colspan="9" class="muted">Could not load leads (' +
          esc(state.error) +
          ").</td></tr>"
        : rows.length
          ? rows.map(rowHtml).join("")
          : '<tr><td colspan="9" class="muted">No portal OTP leads match this filter. Try <strong>All origins</strong> only if you need the email-interest outreach list.</td></tr>';

    host.innerHTML =
      clarifyBanner(meta) +
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
      "<th>Parent / carer</th><th>Email</th><th>Phone</th><th>Client</th><th>Booking / reg</th><th>OTP</th><th>Form PDF</th><th>Services viewed</th><th>Last activity</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div></div>";
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
        void reload(host);
      });
    }
    if (filter) {
      filter.addEventListener("change", function () {
        state.filter = String(filter.value || "all");
        void reload(host);
      });
    }
    if (refresh) {
      refresh.addEventListener("click", function () {
        void reload(host);
      });
    }
    host.querySelectorAll(".bk-lead-open-doc").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var url = String(btn.getAttribute("data-url") || "")
          .replace(/&amp;/g, "&")
          .trim();
        if (!url) {
          cfg.toast("No PDF linked for this lead yet.");
          return;
        }
        var win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          cfg.toast("Pop-up blocked — allow pop-ups, or use Documents → Participant documents.");
        }
      });
    });
    host.querySelectorAll("[data-view-target]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-view-target");
        if (id && typeof window.portalAdminSetView === "function") {
          window.portalAdminSetView(id);
        }
      });
    });
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Enquiries &amp; intake</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">' +
      "This screen mixes two different things: (1) families who requested an access code on the public Booking Portal, and " +
      "(2) an office email-interest list imported for future outreach. " +
      "Only (1) counts as Booking Portal activity — roughly the <strong>Portal visitors</strong> KPI (~70), not the full row count. " +
      "Default filter is <strong>Portal OTP only</strong>." +
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
