/**
 * Admin — Booking Portal OTP leads (live portal_booking_leads).
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
    filter: "prospective",
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
        client_status: state.filter === "all" ? "all" : state.filter,
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
    var verified = r.email_verified_at
      ? chip("Verified", "ok")
      : chip("Code sent / pending", "pend");
    var services = Array.isArray(r.services_viewed) && r.services_viewed.length
      ? esc(r.services_viewed.slice(0, 4).join(", "))
      : '<span class="muted">—</span>';
    return (
      "<tr>" +
      "<td><strong>" +
      esc(r.parent_name || "—") +
      "</strong><div class=\"muted\" style=\"font-size:11px;margin-top:2px\">" +
      esc(r.source || "") +
      "</div></td>" +
      "<td style=\"overflow-wrap:anywhere\">" +
      esc(r.email || "—") +
      "</td>" +
      "<td>" +
      esc(r.mobile || "—") +
      "</td>" +
      "<td>" +
      chip(String(r.client_status || "").replace(/_/g, " "), statusTone(r.client_status)) +
      "</td>" +
      "<td>" +
      chip(String(r.booking_status || "").replace(/_/g, " "), statusTone(r.booking_status)) +
      "<div style=\"margin-top:4px\">" +
      chip(String(r.registration_status || "").replace(/_/g, " "), "info") +
      "</div></td>" +
      "<td>" +
      verified +
      "</td>" +
      "<td>" +
      services +
      "</td>" +
      "<td>" +
      esc(formatWhen(r.last_activity_at || r.created_at)) +
      "</td>" +
      "</tr>"
    );
  }

  function renderHost(host) {
    if (!host) return;
    var meta = state.meta || {};
    var rows = state.leads || [];
    var body = state.loading
      ? '<tr><td colspan="8" class="muted">Loading booking leads…</td></tr>'
      : state.error
        ? '<tr><td colspan="8" class="muted">Could not load leads (' +
          esc(state.error) +
          ").</td></tr>"
        : rows.length
          ? rows.map(rowHtml).join("")
          : '<tr><td colspan="8" class="muted">No booking leads match this filter.</td></tr>';

    host.innerHTML =
      '<div class="filter-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px">' +
      '<input class="inp" id="bkLeadSearch" type="search" placeholder="Search name, email, phone…" value="' +
      esc(state.q) +
      '" style="max-width:260px;min-width:0" />' +
      '<select class="inp" id="bkLeadFilter" style="max-width:200px">' +
      '<option value="prospective"' +
      (state.filter === "prospective" ? " selected" : "") +
      ">Prospective (new)</option>" +
      '<option value="active_client"' +
      (state.filter === "active_client" ? " selected" : "") +
      ">Existing clients</option>" +
      '<option value="registered"' +
      (state.filter === "registered" ? " selected" : "") +
      ">Registered</option>" +
      '<option value="all"' +
      (state.filter === "all" ? " selected" : "") +
      ">All</option>" +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadRefresh">Refresh</button>' +
      "</div>" +
      '<div class="grid-kpi" style="margin:0 0 14px">' +
      '<div class="kpi"><div class="kpi-l">Shown</div><div class="kpi-v">' +
      esc(meta.total != null ? meta.total : rows.length) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-l">New (24h)</div><div class="kpi-v">' +
      esc(meta.new_24h != null ? meta.new_24h : "—") +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-l">Email verified</div><div class="kpi-v">' +
      esc(meta.verified != null ? meta.verified : "—") +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-l">Registration started</div><div class="kpi-v">' +
      esc(meta.registration_started != null ? meta.registration_started : "—") +
      "</div></div></div>" +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense" id="bkLeadTable">' +
      "<thead><tr>" +
      "<th>Parent / carer</th><th>Email</th><th>Phone</th><th>Client</th><th>Booking / reg</th><th>OTP</th><th>Services viewed</th><th>Last activity</th>" +
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
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Booking Portal leads</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">' +
      "Families who requested an access code on the public Booking Portal. " +
      "<strong>New visitor</strong> needs name, email and phone. " +
      "Verified means they entered the OTP and can browse the offer. " +
      "Registration starts when they press Book and submit the form." +
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
