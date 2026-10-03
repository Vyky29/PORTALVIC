/**
 * Admin — Booking Portal OTP leads (live portal_booking_leads).
 * Distinguishes real /bookingportal visitors from office email-interest imports.
 * Filters: Search, Lead, Type, Outcome. Writing to families is Family broadcast.
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
    /* Leads are people who asked for an OTP code. Email interest stays behind Origin. */
    outcome: "all",
    origin: "portal",
    entry: "all",
    person: "all",
    trackFilter: "all",
    q: "",
    leads: [],
    meta: {},
    loading: false,
    error: "",
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

  function isImportRow(r) {
    return String((r && r.origin) || "").toLowerCase() === "email_interest";
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

  /** What this visit did. Only looked, Waiting list, Trial, or Term. */
  function leadOutcome(r) {
    r = r || {};
    var key = String(r.visit_outcome || "").toLowerCase();
    if (key === "trial") return { key: "trial", label: "Booked Trial", tone: "lead-trial" };
    if (key === "term") return { key: "term", label: "Booked Term", tone: "ok" };
    if (key === "waiting") return { key: "waiting", label: "Waiting list", tone: "wait" };
    if (key === "looked") return { key: "looked", label: "Only looked", tone: "lead-looked" };
    var book = String(r.booking_status || "").toLowerCase();
    var client = String(r.client_status || "").toLowerCase();
    if (book === "waiting_list" || client === "waiting_list") {
      return { key: "waiting", label: "Waiting list", tone: "wait" };
    }
    return { key: "looked", label: "Only looked", tone: "lead-looked" };
  }

  /** Who they were. New visitor, known without the parent portal, or ACTIVE. */
  function leadType(r) {
    r = r || {};
    var kind = String(r.person_type || "").toLowerCase();
    var bucket = String(r.person_bucket || "").trim();
    if (kind === "active") return { key: "active", label: "ACTIVE", note: "", tone: "lead-active" };
    if (kind === "registered") {
      var note = bucket === "REGISTERED" ? "Not first time. Registered previously" : bucket;
      return { key: "registered", label: "Known visitor", note: note, tone: "lead-known" };
    }
    if (kind === "new") {
      var registeredNow = r.registered_this_visit === true;
      return {
        key: "new",
        label: "New visitor",
        note: registeredNow ? "First time. Registered." : "First time. Did not register.",
        tone: "lead-new",
      };
    }
    return {
      key: "new",
      label: "New visitor",
      note: "First time. Did not register.",
      tone: "lead-new",
    };
  }

  /** Parent hub opens Booking with no code. Booking OTP is a code asked on the booking page. */
  function entryWay(r) {
    r = r || {};
    if (r.visit_entry === "otp") {
      return { key: "otp", label: "OTP", note: "Asked for a code on Booking." };
    }
    if (r.visit_entry === "parent") {
      return {
        key: "parent",
        label: "Parent portal",
        note: "Opened Booking from the parent hub.",
      };
    }
    var source = String(r.source || "").toLowerCase();
    var client = String(r.client_status || "").toLowerCase();
    var existing =
      client === "active_client" ||
      source.indexOf("existing client") >= 0 ||
      source.indexOf("parent portal") >= 0;
    if (source.indexOf("parent portal") >= 0 && r.asked_otp !== true) {
      return {
        key: "parent",
        label: "Parent portal",
        note: "Opened Booking from the parent hub.",
      };
    }
    if (source.indexOf("booking otp") >= 0 || r.asked_otp === true) {
      return {
        key: "otp",
        label: "OTP",
        note: "Asked for a code on Booking.",
      };
    }
    if (existing && r.asked_otp === false) {
      return {
        key: "parent",
        label: "Parent portal",
        note: "Opened Booking from the parent hub.",
      };
    }
    if (existing) {
      return {
        key: "client",
        label: "Already a client",
        note: "Matched to a family already on file.",
      };
    }
    return {
      key: "booking",
      label: "Booking page",
      note: "Came in through Booking.",
    };
  }

  function personFilterMatch(r, key) {
    var person = leadType(r);
    var bucket = String((r && r.person_bucket) || "").trim().toUpperCase();
    if (key === "new") return person.key === "new";
    if (key === "active") return person.key === "active";
    if (key === "registered") return person.key === "registered";
    if (key === "old") return person.key === "registered" && bucket === "OLD CLIENT";
    if (key === "trial") return person.key === "registered" && bucket === "TRIAL";
    if (key === "waiting") return person.key === "registered" && bucket === "WAITING LIST";
    if (key === "reg") return person.key === "registered" && bucket === "REGISTERED";
    return true;
  }

  function visibleLeads() {
    var rows = state.leads || [];
    var key = state.outcome || "all";
    var entry = state.entry || "all";
    var person = state.person || "all";
    return rows.filter(function (r) {
      if (key !== "all" && leadOutcome(r).key !== key) return false;
      if (entry !== "all" && entryWay(r).key !== entry) return false;
      if (person !== "all" && !personFilterMatch(r, person)) return false;
      return true;
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

  function prettyService(raw) {
    var key = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    var map = {
      multi: "Multi-Activity",
      multi_activity: "Multi-Activity",
      day_centre: "Day Centre",
      daycentre: "Day Centre",
      intensive: "Intensive",
      climbing: "Climbing",
      climbing_activity: "Climbing",
      aquatic: "Aquatic",
      aquatic_activity: "Aquatic",
      physical: "Physical",
      physical_activity: "Physical",
    };
    return map[key] || String(raw || "").replace(/\s+/g, " ").trim();
  }

  /** Standing seat they already have. Looks and interest stay off this line. */
  function heldServiceText(r) {
    return String((r && r.held_place) || "").trim();
  }

  /** Only looked: form or an information edit, when that is what the visit was. */
  function lookedActionText(r) {
    var action = String((r && r.visit_action) || "");
    if (action === "filled") return "Filled the form";
    if (action === "edited") return "Edited information";
    return "";
  }

  /** Only looked: services they opened. Trial or Term: service, time, day, venue. */
  function leadActivityText(r) {
    var place = String((r && r.visit_place) || "").trim();
    if (place) return place;
    var outcome = leadOutcome(r).key;
    if (outcome !== "looked") return String((r && r.activity_interest) || "").trim();
    var viewed = Array.isArray(r && r.services_viewed) ? r.services_viewed : [];
    var names = [];
    viewed.forEach(function (item) {
      var label = prettyService(item);
      if (label && names.indexOf(label) < 0) names.push(label);
    });
    if (names.length) return names.join(", ");
    return String((r && r.activity_interest) || "").trim();
  }

  function leadEnquiryText(r) {
    return String((r && r.enquiry_notes) || "").trim();
  }

  /** Activity and Enquiry only when a row has them. Track status only on the office lists. */
  function leadTableCols(rows) {
    var list = rows || [];
    return {
      activity: list.some(function (r) {
        return !!leadActivityText(r);
      }),
      enquiry: list.some(function (r) {
        return !!leadEnquiryText(r);
      }),
      track: state.origin !== "portal",
    };
  }

  function leadColspan(cols) {
    return 6 + (cols.enquiry ? 1 : 0) + (cols.track ? 1 : 0);
  }

  function rowHtml(r, cols) {
    cols = cols || { activity: false, enquiry: false, track: false };
    var imported = isImportRow(r);
    var outcome = leadOutcome(r);
    var person = leadType(r);
    var entry = entryWay(r);
    var leadLabel = entry.label;
    var leadTone = entry.key === "parent" ? "info" : entry.key === "otp" ? "pend" : "warn";
    var leadNote = imported
      ? "Office list. Not someone who opened Booking Portal."
      : entry.note;
    var activity = leadActivityText(r);
    var enquiry = leadEnquiryText(r);
    var dash = '<span class="muted">—</span>';
    function placeLines(text) {
      var raw = String(text || "").trim();
      if (!raw) return "";
      return raw
        .split(" | ")
        .map(function (line) {
          return (
            '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">' +
            esc(line) +
            "</div>"
          );
        })
        .join("");
    }
    var lookedAction = lookedActionText(r);
    var typeUnder =
      person.key === "active"
        ? placeLines(heldServiceText(r))
        : person.note
          ? '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">' +
            esc(person.note) +
            "</div>"
          : "";
    var outcomeUnder =
      outcome.key === "trial" || outcome.key === "term"
        ? placeLines(activity)
        : outcome.key === "looked" && lookedAction
          ? placeLines(lookedAction)
          : "";
    var activityInColumn = outcome.key === "trial" || outcome.key === "term" ? "" : activity;
    return (
      "<tr>" +
      '<td style="min-width:0">' +
      '<strong style="overflow-wrap:break-word">' +
      esc(r.parent_name || "—") +
      "</strong>" +
      '<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:anywhere">' +
      esc(r.email || "—") +
      "</div>" +
      '<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:anywhere">' +
      esc(r.mobile || "—") +
      "</div></td>" +
      (cols.enquiry
        ? '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word;font-size:12px">' +
          (enquiry ? esc(enquiry.slice(0, 160)) : dash) +
          "</td>"
        : "") +
      '<td style="min-width:0;max-width:16rem;overflow-wrap:break-word">' +
      chip(leadLabel, leadTone) +
      (leadNote
        ? '<div class="muted" style="font-size:11px;margin-top:4px;overflow-wrap:break-word">' +
          esc(leadNote) +
          "</div>"
        : "") +
      "</td>" +
      '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word">' +
      chip(person.label, person.tone) +
      typeUnder +
      "</td>" +
      (cols.track
        ? '<td style="min-width:0">' + trackSelectHtml(r) + "</td>"
        : "") +
      '<td style="min-width:0;max-width:14rem;overflow-wrap:break-word">' +
      '<span class="chip chip--' +
      esc(outcome.tone) +
      '" style="white-space:normal;overflow-wrap:anywhere;max-width:100%;display:inline-block">' +
      esc(outcome.label) +
      "</span>" +
      outcomeUnder +
      "</td>" +
      '<td style="min-width:0;max-width:16rem;overflow-wrap:break-word;font-size:12px">' +
      (activityInColumn
        ? activityInColumn
            .split(" | ")
            .map(function (line) {
              return (
                '<div style="overflow-wrap:break-word">' + esc(line) + "</div>"
              );
            })
            .join("")
        : dash) +
      "</td>" +
      "<td>" +
      esc(formatWhen(r.visit_at || r.last_activity_at || r.created_at)) +
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

  function renderHost(host) {
    if (!host) return;
    var rows = visibleLeads();
    var cols = leadTableCols(rows);
    var span = String(leadColspan(cols));
    var body = state.loading
      ? '<tr><td colspan="' + span + '" class="muted">Loading leads…</td></tr>'
      : state.error
        ? '<tr><td colspan="' + span + '" class="muted">Could not load leads (' +
          esc(state.error) +
          ").</td></tr>"
        : rows.length
          ? rows.map(function (r) { return rowHtml(r, cols); }).join("")
          : '<tr><td colspan="' + span + '" class="muted">No visits with these filters.</td></tr>';

    function chipCount(entry, person, outcome) {
      var n = 0;
      (state.leads || []).forEach(function (r) {
        if (entry !== "all" && entryWay(r).key !== entry) return;
        if (person !== "all" && !personFilterMatch(r, person)) return;
        if (outcome !== "all" && leadOutcome(r).key !== outcome) return;
        n += 1;
      });
      return n;
    }
    function chipBtn(group, value, label, on, n) {
      if (n === 0 && !on) return "";
      return (
        '<button type="button" class="btn btn--sm' +
        (on ? "" : " btn--ghost") +
        '" data-bk-chip="' +
        esc(group) +
        '" data-bk-value="' +
        esc(value) +
        '" aria-pressed="' +
        (on ? "true" : "false") +
        '">' +
        esc(label) +
        (n == null ? "" : ' <span class="pax-chip-filters__n">' + esc(String(n)) + "</span>") +
        "</button>"
      );
    }
    function chipRow(aria, label, buttons) {
      if (!buttons) return "";
      return (
        '<div class="bk-lead-filters__row" role="group" aria-label="' +
        esc(aria) +
        '"><span class="bk-lead-filters__k">' +
        esc(label) +
        "</span>" +
        buttons +
        "</div>"
      );
    }
    var portalList = state.origin === "portal";
    var knownOn =
      state.person === "registered" ||
      state.person === "old" ||
      state.person === "trial" ||
      state.person === "waiting" ||
      state.person === "reg";
    var trackChips = portalList
      ? ""
      : chipRow(
          "Track status",
          "Track",
          [{ value: "all", label: "All" }, { value: "outreach", label: "Outreach" }]
            .concat(TRACK_STATUSES)
            .map(function (t) {
              return chipBtn("track", t.value, t.label, state.trackFilter === t.value, null);
            })
            .join("")
        );
    var entryChips = [
      ["all", "All"],
      ["otp", "OTP"],
      ["parent", "Parent portal"],
    ]
      .map(function (t) {
        return chipBtn(
          "entry",
          t[0],
          t[1],
          state.entry === t[0],
          chipCount(t[0], state.person, state.outcome)
        );
      })
      .join("");
    var personChips = [
      ["all", "All", state.person === "all"],
      ["new", "New visitor", state.person === "new"],
      ["registered", "Known visitor", knownOn],
      ["active", "ACTIVE", state.person === "active"],
    ]
      .map(function (t) {
        return chipBtn(
          "person",
          t[0],
          t[1],
          t[2],
          chipCount(state.entry, t[0] === "registered" ? "registered" : t[0], state.outcome)
        );
      })
      .join("");
    var knownChips = knownOn
      ? [
          ["old", "OLD CLIENT"],
          ["trial", "TRIAL"],
          ["waiting", "WAITING LIST"],
          ["reg", "Not first time"],
        ]
          .map(function (t) {
            return chipBtn(
              "person",
              t[0],
              t[1],
              state.person === t[0],
              chipCount(state.entry, t[0], state.outcome)
            );
          })
          .join("")
      : "";
    var outcomeChips = [
      ["all", "All"],
      ["looked", "Only looked"],
      ["waiting", "Waiting list"],
      ["trial", "Trial"],
      ["term", "Term"],
    ]
      .map(function (t) {
        return chipBtn(
          "outcome",
          t[0],
          t[1],
          state.outcome === t[0],
          chipCount(state.entry, state.person, t[0])
        );
      })
      .join("");
    function originOpt(value, label) {
      return (
        '<option value="' +
        esc(value) +
        '"' +
        (state.origin === value ? " selected" : "") +
        ">" +
        esc(label) +
        "</option>"
      );
    }
    host.innerHTML =
      (state.origin === "potential" ? potentialFormHtml() : "") +
      '<div class="bk-lead-filters">' +
      '<div class="bk-lead-filters__top">' +
      '<input class="inp" id="bkLeadSearch" type="search" placeholder="Search name, email, phone, enquiry" value="' +
      esc(state.q) +
      '" autocomplete="off" />' +
      '<select class="inp" id="bkLeadOrigin" title="Portal visits, or an office list">' +
      originOpt("portal", "Portal OTP") +
      originOpt("all", "All origins") +
      originOpt("potential", "Office potential") +
      originOpt("outreach", "Marketing outreach") +
      originOpt("email_interest", "Email interest") +
      "</select>" +
      '<button type="button" class="btn btn--sec btn--sm" id="bkLeadRefresh">Refresh</button>' +
      "</div>" +
      trackChips +
      chipRow("Lead", "Lead", entryChips) +
      chipRow("Type", "Type", personChips) +
      chipRow("Known visitor", "Known", knownChips) +
      chipRow("Outcome", "Outcome", outcomeChips) +
      "</div>" +
      '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
      '<table class="tbl tbl--center tbl--dense" id="bkLeadTable">' +
      "<thead><tr>" +
      "<th>Parent / carer</th>" +
      (cols.enquiry ? "<th>Enquiry</th>" : "") +
      '<th title="OTP asked for a code on Booking. Parent portal opened Booking from the family hub.">Lead</th>' +
      '<th title="New visitor is the first time. Registered means they sent the form. Did not register means they only asked for the code. Coming back, already registered and not ACTIVE, is Known visitor. Not first time means they registered previously. ACTIVE already has a place and can open the parent portal.">Type</th>' +
      (cols.track
        ? '<th title="Office list only. Booked takes the email off the marketing list. It does not change Outcome.">Track status</th>'
        : "") +
      '<th>Outcome</th><th title="Only looked: the services they opened. Trial or Term: service, time, day and venue.">Activity</th><th>Updated</th>' +
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
    var origin = host.querySelector("#bkLeadOrigin");
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
        state.origin = String(origin.value || "portal");
        if (state.origin === "portal") state.trackFilter = "all";
        void reload(host);
      });
    }
    host.querySelectorAll("[data-bk-chip]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var group = String(btn.getAttribute("data-bk-chip") || "");
        var value = String(btn.getAttribute("data-bk-value") || "all");
        if (group === "origin") {
          if (state.origin === value) return;
          state.origin = value;
          if (state.origin === "portal") state.trackFilter = "all";
          void reload(host);
          return;
        }
        if (group === "track") {
          if (state.trackFilter === value) return;
          state.trackFilter = value;
          void reload(host);
          return;
        }
        if (group === "entry") state.entry = value;
        else if (group === "person") state.person = value;
        else if (group === "outcome") state.outcome = value;
        else return;
        renderHost(host);
        wire(host);
      });
    });
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
