/**
 * Admin — Staff Readiness: training, compliance and app setup overview.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var state = {
    rows: [],
    loading: false,
    filter: "all",
    tab: "training_compliance",
    permissionsAnnouncementIds: [],
  };

  var INDUCTION_MODULES = 6;
  var INDUCTION_REQUIRED_KEYS = { alex: true, michelle: true, carlos: true };

  /** Staff roster keys that need live-map location when on Bespoke / Day Centre / Climbing shifts. */
  var LIVE_MAP_MANDATORY_KEYS = {
    berta: true,
    john: true,
    michelle: true,
    youssef: true,
    lulia: true,
    raul: true,
    victor: true,
    giuseppe: true,
    bismark: true,
    godsway: true,
    alex: true,
    carlos: true,
    andres: true,
    javi: true,
  };

  function normStaffKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function profileRosterKey(profile) {
    if (!profile) return "";
    var u = normStaffKey(profile.username);
    if (u) return u;
    var fn = String(profile.full_name || "")
      .trim()
      .split(/\s+/)[0];
    return normStaffKey(fn);
  }

  function inductionRequiredForProfile(profile) {
    var key = profileRosterKey(profile);
    return !!(key && INDUCTION_REQUIRED_KEYS[key]);
  }

  function demoHash(id, salt) {
    var s = String(id || "") + String(salt || "");
    var h = 0;
    var i;
    for (i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function defaultGrandfatheredInductionTrack() {
    var mods = {};
    var i;
    for (i = 1; i <= INDUCTION_MODULES; i++) {
      mods[String(i)] = { journey: true, video: true, quizPass: true, label: "Done" };
    }
    return {
      track: "induction",
      current_module: INDUCTION_MODULES,
      modules_total: INDUCTION_MODULES,
      progress_pct: 100,
      module_states: mods,
      phase_label: "Grandfathered complete",
      completed_at: "2026-05-01T12:00:00.000Z",
    };
  }

  function defaultInductionNotStartedTrack() {
    return {
      track: "induction",
      current_module: 1,
      modules_total: INDUCTION_MODULES,
      progress_pct: 0,
      module_states: {},
      phase_label: "Not started",
      completed_at: null,
    };
  }

  function applyInferredTrainingDefaults(byUser, profiles) {
    (profiles || []).forEach(function (p) {
      if (!p || !p.id || !byUser[p.id]) return;
      byUser[p.id].profile = p;
      if (byUser[p.id].tracks.induction) return;
      byUser[p.id].tracks.induction = inductionRequiredForProfile(p)
        ? Object.assign(defaultInductionNotStartedTrack(), { _inferred: true })
        : Object.assign(defaultGrandfatheredInductionTrack(), { _inferred: true });
    });
  }

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function formatLondon(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function trackProgressPct(track) {
    if (!track) return 0;
    var pct = Number(track.progress_pct);
    if (!Number.isFinite(pct)) return 0;
    return pct;
  }

  function trackIsComplete(track) {
    if (!track) return false;
    if (trackProgressPct(track) >= 100) return true;
    return /complete|grandfathered|done/i.test(String(track.phase_label || ""));
  }

  function trackIsInProgress(track) {
    if (!track) return false;
    if (trackIsComplete(track)) return false;
    var pct = trackProgressPct(track);
    if (pct > 0) return true;
    var mods = track.module_states || {};
    return Object.keys(mods).some(function (k) {
      var m = mods[k];
      return m && (m.video || m.journey || m.quizPass);
    });
  }

  function inductionStatus(row) {
    var ind = row.tracks.induction;
    if (!ind) return "not_started";
    if (trackIsComplete(ind)) return "complete";
    if (trackIsInProgress(ind)) return "in_progress";
    return "not_started";
  }

  function swimmingRequired(row) {
    return !!row.tracks.swimming_training;
  }

  function swimmingStatus(row) {
    if (!swimmingRequired(row)) return "na";
    var swim = row.tracks.swimming_training;
    if (!swim) return "not_started";
    if (trackIsComplete(swim)) return "complete";
    if (trackIsInProgress(swim)) return "in_progress";
    return "not_started";
  }

  function demoComplianceField(row, field) {
    var h = demoHash(row.id, field);
    if (field === "wellbeing") {
      if (h % 5 === 0) return "not_due";
      if (h % 7 === 0 || h % 11 === 3) return "outstanding";
      return "complete";
    }
    if (h % 6 === 0 || h % 9 === 2) return "outstanding";
    return "complete";
  }

  function safeguardingStatus(row) {
    var h = demoHash(row.id, "safeguarding");
    if (!row.setup || !row.setup.last_seen_at) return "missing";
    if (inductionStatus(row) !== "complete") return "missing";
    if (h % 13 === 0) return "expired";
    if (h % 8 === 0) return "missing";
    return "complete";
  }

  function locationRequiredForRow(row) {
    var key = profileRosterKey(row.profile);
    return !!(key && LIVE_MAP_MANDATORY_KEYS[key]);
  }

  function portalFeaturesComplete(row) {
    var s = row.setup || {};
    if (s.portal_features_complete) return true;
    if (!s.push_enabled) return false;
    if (!s.camera_granted) return false;
    if (locationRequiredForRow(row) && !s.location_granted) return false;
    return true;
  }

  function permissionsAnnouncementSigned(row) {
    return !!(row.permissionsSetupAck && row.permissionsSetupAck.signed_at);
  }

  function webOnlyApproved(row) {
    return false;
  }

  function deviceRegistered(row) {
    var s = row.setup;
    if (!s) return false;
    return !!s.is_pwa;
  }

  function portalAccess(row) {
    var s = row.setup;
    if (!s || !s.last_seen_at) return "unknown";
    if (s.is_pwa) return "app";
    return "web";
  }

  function trainingReady(row) {
    var ind = inductionStatus(row);
    if (ind !== "complete") return false;
    var swim = swimmingStatus(row);
    if (swim !== "na" && swim !== "complete") return false;
    if (safeguardingStatus(row) !== "complete") return false;
    return true;
  }

  function complianceReady(row) {
    if (demoComplianceField(row, "policies") !== "complete") return false;
    if (demoComplianceField(row, "risk") !== "complete") return false;
    if (demoComplianceField(row, "announcements") !== "complete") return false;
    var wb = demoComplianceField(row, "wellbeing");
    if (wb === "outstanding") return false;
    return true;
  }

  function appReady(row) {
    return portalFeaturesComplete(row);
  }

  function overallReady(row) {
    return trainingReady(row) && complianceReady(row) && appReady(row);
  }

  function enrichRow(row) {
    row.readiness = {
      induction: inductionStatus(row),
      swimming: swimmingStatus(row),
      safeguarding: safeguardingStatus(row),
      policies: demoComplianceField(row, "policies"),
      riskAssessments: demoComplianceField(row, "risk"),
      announcements: demoComplianceField(row, "announcements"),
      wellbeing: demoComplianceField(row, "wellbeing"),
      portalAccess: portalAccess(row),
      deviceRegistered: deviceRegistered(row),
      webOnlyApproved: webOnlyApproved(row),
      locationRequired: locationRequiredForRow(row),
      microphoneOptional: true,
      portalFeaturesComplete: portalFeaturesComplete(row),
      permissionsAnnouncementSigned: permissionsAnnouncementSigned(row),
      trainingReady: trainingReady(row),
      complianceReady: complianceReady(row),
      appReady: appReady(row),
      overallReady: overallReady(row),
    };
    return row;
  }

  function overallComplianceStatus(row) {
    var r = row.readiness;
    var hasRed =
      r.safeguarding === "missing" ||
      r.safeguarding === "expired" ||
      r.induction === "not_started" ||
      (r.swimming !== "na" && r.swimming === "not_started");
    if (hasRed) return "non_compliant";
    var hasAmber =
      !r.trainingReady ||
      !r.complianceReady ||
      r.policies === "outstanding" ||
      r.riskAssessments === "outstanding" ||
      r.announcements === "outstanding" ||
      r.wellbeing === "outstanding";
    if (hasAmber) return "follow_up";
    return "ready";
  }

  function deviceStatus(row) {
    return row.readiness.appReady ? "ready" : "setup_required";
  }

  function missingItems(row) {
    var r = row.readiness;
    var items = [];
    if (r.induction === "not_started" || r.induction === "in_progress") {
      items.push("Missing induction modules");
    }
    if (r.swimming === "not_started" || r.swimming === "in_progress") {
      items.push("Missing swimming training");
    }
    if (r.safeguarding === "missing") items.push("Missing safeguarding");
    if (r.safeguarding === "expired") items.push("Safeguarding expired");
    if (r.policies === "outstanding") items.push("Policies not signed");
    if (r.riskAssessments === "outstanding") items.push("Risk assessments outstanding");
    if (r.announcements === "outstanding") items.push("Announcements not signed");
    if (r.wellbeing === "outstanding") items.push("Wellbeing review outstanding");
    var s = row.setup || {};
    if (!portalFeaturesComplete(row)) items.push("Portal features not activated");
    if (state.permissionsAnnouncementIds.length && !permissionsAnnouncementSigned(row)) {
      items.push("Setup announcement not signed");
    }
    if (!s.push_enabled) items.push("Alerts disabled");
    if (!s.camera_granted) items.push("Camera disabled");
    if (r.portalAccess === "web" && !r.webOnlyApproved) items.push("Using web only");
    if (!r.deviceRegistered) items.push("App not installed");
    if (r.locationRequired && !s.location_granted) items.push("Location disabled");
    if (!s.microphone_granted) items.push("Microphone off (optional voice-to-text)");
    return items;
  }

  function followUpPriority(row) {
    var items = missingItems(row);
    if (!items.length) return "low";
    var r = row.readiness;
    if (
      r.safeguarding !== "complete" ||
      !push_enabledCheck(row) ||
      (r.portalAccess === "web" && !r.webOnlyApproved)
    ) {
      return "high";
    }
    if (!r.trainingReady || !r.complianceReady) return "medium";
    return "low";
  }

  function push_enabledCheck(row) {
    return !!(row.setup && row.setup.push_enabled);
  }

  function suggestedAction(row) {
    var items = missingItems(row);
    if (!items.length) return "No action required";
    if (items.indexOf("Missing safeguarding") >= 0 || items.indexOf("Safeguarding expired") >= 0) {
      return "Chase safeguarding completion before rostering";
    }
    if (items.indexOf("Missing induction modules") >= 0) {
      return "Send induction reminder and book check-in";
    }
    if (items.indexOf("Portal features not activated") >= 0) {
      return "Ask worker to tap Turn on portal features in Settings";
    }
    if (items.indexOf("Setup announcement not signed") >= 0) {
      return "Ask worker to read and sign the portal setup announcement";
    }
    if (items.indexOf("Alerts disabled") >= 0) {
      return "Ask worker to enable alerts in app settings";
    }
    if (items.indexOf("Using web only") >= 0) {
      return "Guide install of portal app or approve web-only";
    }
    if (items.indexOf("Policies not signed") >= 0) {
      return "Send policy sign-off link from Documents";
    }
    return "Review outstanding items with worker";
  }

  function rowNeedsAttention(row) {
    return !row.readiness.overallReady || missingItems(row).length > 0;
  }

  function rowTrainingIncomplete(row) {
    return !row.readiness.trainingReady;
  }

  function rowComplianceMissing(row) {
    return !row.readiness.complianceReady;
  }

  function rowAppSetupMissing(row) {
    return !row.readiness.appReady;
  }

  function rowWebOnly(row) {
    return row.readiness.portalAccess === "web";
  }

  function mergeRows(profiles, progressRows, setupRows, permissionAcksByStaff) {
    permissionAcksByStaff = permissionAcksByStaff || {};
    var byUser = {};
    (profiles || []).forEach(function (p) {
      byUser[p.id] = {
        id: p.id,
        name: String(p.full_name || p.username || "Staff").trim(),
        profile: p,
        tracks: {},
        setup: null,
        permissionsSetupAck: null,
      };
    });
    (progressRows || []).forEach(function (r) {
      if (!byUser[r.staff_user_id]) {
        byUser[r.staff_user_id] = {
          id: r.staff_user_id,
          name: String(r.staff_display_name || "Staff").trim(),
          profile: null,
          tracks: {},
          setup: null,
        };
      }
      byUser[r.staff_user_id].tracks[r.track] = r;
    });
    (setupRows || []).forEach(function (s) {
      if (!byUser[s.staff_user_id]) {
        byUser[s.staff_user_id] = {
          id: s.staff_user_id,
          name: String(s.staff_display_name || "Staff").trim(),
          profile: null,
          tracks: {},
          setup: null,
        };
      }
      byUser[s.staff_user_id].setup = s;
      if (!byUser[s.staff_user_id].name && s.staff_display_name) {
        byUser[s.staff_user_id].name = String(s.staff_display_name).trim();
      }
    });
    applyInferredTrainingDefaults(byUser, profiles);
    Object.keys(byUser).forEach(function (k) {
      if (permissionAcksByStaff[k]) {
        byUser[k].permissionsSetupAck = permissionAcksByStaff[k];
      }
    });
    return Object.keys(byUser)
      .map(function (k) {
        return enrichRow(byUser[k]);
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "en");
      });
  }

  function filterRows(rows) {
    var f = state.filter;
    if (f === "all") return rows;
    if (f === "attention") return rows.filter(rowNeedsAttention);
    if (f === "training_incomplete") return rows.filter(rowTrainingIncomplete);
    if (f === "compliance_missing") return rows.filter(rowComplianceMissing);
    if (f === "app_setup_missing") return rows.filter(rowAppSetupMissing);
    if (f === "browser_only") return rows.filter(rowWebOnly);
    return rows;
  }

  function statusBadge(kind, label) {
    var cls =
      kind === "ok"
        ? "chip--ok"
        : kind === "warn"
          ? "chip--pend"
          : kind === "bad"
            ? "portal-sready-chip--bad"
            : kind === "muted"
              ? "chip--info"
              : "chip--info";
    return '<span class="chip ' + cls + ' portal-sready-badge">' + esc(label) + "</span>";
  }

  function labelBadge(map, value) {
    var item = map[value] || { kind: "muted", label: value || "—" };
    return statusBadge(item.kind, item.label);
  }

  var INDUCTION_LABELS = {
    not_started: { kind: "bad", label: "Not Started" },
    in_progress: { kind: "warn", label: "In Progress" },
    complete: { kind: "ok", label: "Complete" },
  };

  var SWIM_LABELS = {
    not_started: { kind: "bad", label: "Not Started" },
    in_progress: { kind: "warn", label: "In Progress" },
    complete: { kind: "ok", label: "Complete" },
    na: { kind: "muted", label: "N/A" },
  };

  var SG_LABELS = {
    complete: { kind: "ok", label: "Complete" },
    expired: { kind: "warn", label: "Expired" },
    missing: { kind: "bad", label: "Missing" },
  };

  var OUTSTANDING_LABELS = {
    complete: { kind: "ok", label: "Complete" },
    outstanding: { kind: "warn", label: "Outstanding" },
  };

  var WELLBEING_LABELS = {
    complete: { kind: "ok", label: "Complete" },
    outstanding: { kind: "warn", label: "Outstanding" },
    not_due: { kind: "muted", label: "Not Due" },
  };

  var OVERALL_LABELS = {
    ready: { kind: "ok", label: "Ready" },
    follow_up: { kind: "warn", label: "Follow-Up Required" },
    non_compliant: { kind: "bad", label: "Non-Compliant" },
  };

  function moduleChip(n, mod) {
    var done = mod && mod.quizPass;
    var partial = mod && (mod.video || mod.journey) && !done;
    var cls = done ? "chip--ok" : partial ? "chip--info" : "chip--pend";
    var title = (mod && mod.label) || (done ? "Done" : partial ? "In progress" : "Not started");
    var inner = done ? "✓" : String(n);
    return (
      '<span class="chip ' +
      cls +
      ' portal-tprog-mod" title="Module ' +
      n +
      ": " +
      esc(title) +
      '">' +
      inner +
      "</span>"
    );
  }

  function inductionDetailHtml(row) {
    var p = row.tracks.induction;
    if (!p) return "";
    var mods = p.module_states || {};
    var chips = "";
    var i;
    for (i = 1; i <= INDUCTION_MODULES; i++) {
      chips += moduleChip(i, mods[String(i)]);
    }
    return (
      '<div class="portal-sready-ind-detail" title="Module detail">' +
      '<div class="portal-tprog-mod-row">' +
      chips +
      "</div></div>"
    );
  }

  function rowHighlightClass(row) {
    var r = row.readiness;
    var cls = [];
    if (r.safeguarding !== "complete") cls.push("portal-sready-row--sg");
    if (!r.complianceReady) cls.push("portal-sready-row--compliance");
    if (!r.appReady) cls.push("portal-sready-row--app");
    return cls.join(" ");
  }

  function permissionCell(row, field) {
    var s = row.setup || {};
    var r = row.readiness;
    if (field === "location") {
      if (!r.locationRequired) return statusBadge("muted", "Not Required");
      return s.location_granted ? statusBadge("ok", "Enabled") : statusBadge("bad", "Disabled");
    }
    if (field === "camera") {
      return s.camera_granted ? statusBadge("ok", "Enabled") : statusBadge("bad", "Disabled");
    }
    if (field === "microphone") {
      return s.microphone_granted ? statusBadge("ok", "Enabled") : statusBadge("muted", "Optional");
    }
    if (field === "alerts") {
      return s.push_enabled ? statusBadge("ok", "Enabled") : statusBadge("bad", "Disabled");
    }
    return statusBadge("muted", "—");
  }

  function portalFeaturesCell(row) {
    var s = row.setup || {};
    if (portalFeaturesComplete(row)) {
      var at = s.portal_features_completed_at || s.updated_at;
      return (
        statusBadge("ok", "On") +
        (at ? '<span class="muted portal-sready-subdate">' + esc(formatLondon(at)) + "</span>" : "")
      );
    }
    return statusBadge("bad", "Not set up");
  }

  function permissionsAnnouncementCell(row) {
    var ack = row.permissionsSetupAck;
    if (ack && ack.signed_at) {
      return (
        statusBadge("ok", "Signed") +
        '<span class="muted portal-sready-subdate">' +
        esc(formatLondon(ack.signed_at)) +
        "</span>"
      );
    }
    if (!state.permissionsAnnouncementIds.length) {
      return statusBadge("muted", "No active notice");
    }
    return statusBadge("bad", "Not signed");
  }

  function renderKpis(rows) {
    var el = document.getElementById("portalStaffReadinessKpis");
    if (!el) return;
    var total = rows.length;
    var fully = rows.filter(function (r) {
      return r.readiness.overallReady;
    }).length;
    var trainInc = rows.filter(rowTrainingIncomplete).length;
    var compMiss = rows.filter(rowComplianceMissing).length;
    var appMiss = rows.filter(rowAppSetupMissing).length;
    el.innerHTML =
      '<div class="grid-kpi portal-sready-kpis">' +
      '<div class="kpi card--premium portal-sready-kpi portal-sready-kpi--ok">' +
      '<div class="kpi-l">Staff fully ready</div>' +
      '<div class="kpi-v">' +
      esc(String(fully)) +
      " / " +
      esc(String(total)) +
      "</div>" +
      '<div class="kpi-s muted">Training + compliance + app</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi">' +
      '<div class="kpi-l">Training incomplete</div>' +
      '<div class="kpi-v">' +
      esc(String(trainInc)) +
      "</div>" +
      '<div class="kpi-s muted">Induction, swim or safeguarding</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi' +
      (compMiss ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">Compliance missing</div>' +
      '<div class="kpi-v">' +
      esc(String(compMiss)) +
      "</div>" +
      '<div class="kpi-s muted">Policies, RA, announcements, wellbeing</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi' +
      (appMiss ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">App setup missing</div>' +
      '<div class="kpi-v">' +
      esc(String(appMiss)) +
      "</div>" +
      '<div class="kpi-s muted">Alerts, device or install</div></div>' +
      "</div>";
  }

  function renderTrainingTable(rows) {
    var body = rows
      .map(function (row) {
        var r = row.readiness;
        var overall = overallComplianceStatus(row);
        return (
          '<tr class="' +
          esc(rowHighlightClass(row)) +
          '">' +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          '<td class="portal-sready-cell">' +
          labelBadge(INDUCTION_LABELS, r.induction) +
          inductionDetailHtml(row) +
          "</td>" +
          "<td>" +
          labelBadge(SWIM_LABELS, r.swimming) +
          "</td>" +
          "<td>" +
          labelBadge(SG_LABELS, r.safeguarding) +
          "</td>" +
          "<td>" +
          labelBadge(OUTSTANDING_LABELS, r.policies) +
          "</td>" +
          "<td>" +
          labelBadge(OUTSTANDING_LABELS, r.riskAssessments) +
          "</td>" +
          "<td>" +
          labelBadge(OUTSTANDING_LABELS, r.announcements) +
          "</td>" +
          "<td>" +
          labelBadge(WELLBEING_LABELS, r.wellbeing) +
          "</td>" +
          "<td>" +
          labelBadge(OVERALL_LABELS, overall) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table portal-sready-table">' +
      "<thead><tr>" +
      "<th>Staff</th>" +
      "<th>Induction</th>" +
      "<th>Swimming training</th>" +
      "<th>Safeguarding</th>" +
      "<th>Policies</th>" +
      "<th>Risk assessments</th>" +
      "<th>Signed announcements</th>" +
      "<th>Staff wellbeing review</th>" +
      "<th>Overall compliance</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function renderAppTable(rows) {
    var body = rows
      .map(function (row) {
        var s = row.setup || {};
        var r = row.readiness;
        var accessLabel =
          r.portalAccess === "app"
            ? statusBadge("ok", "App")
            : r.portalAccess === "web"
              ? statusBadge("warn", "Web")
              : statusBadge("muted", "Unknown");
        return (
          '<tr class="' +
          esc(rowHighlightClass(row)) +
          '">' +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          "<td>" +
          accessLabel +
          "</td>" +
          "<td>" +
          (r.deviceRegistered ? statusBadge("ok", "Yes") : statusBadge("bad", "No")) +
          "</td>" +
          '<td class="portal-sready-cell">' +
          portalFeaturesCell(row) +
          "</td>" +
          '<td class="portal-sready-cell">' +
          permissionsAnnouncementCell(row) +
          "</td>" +
          "<td>" +
          permissionCell(row, "alerts") +
          "</td>" +
          "<td>" +
          permissionCell(row, "camera") +
          "</td>" +
          "<td>" +
          permissionCell(row, "location") +
          "</td>" +
          "<td>" +
          permissionCell(row, "microphone") +
          "</td>" +
          '<td class="muted portal-tprog-seen">' +
          esc(formatLondon(s.last_seen_at)) +
          "</td>" +
          "<td>" +
          (deviceStatus(row) === "ready"
            ? statusBadge("ok", "Ready")
            : statusBadge("warn", "Setup Required")) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table portal-sready-table">' +
      "<thead><tr>" +
      "<th>Staff</th>" +
      "<th>Portal access</th>" +
      "<th>Device registered</th>" +
      "<th>Portal features</th>" +
      "<th>Setup announcement</th>" +
      "<th>Alerts</th>" +
      "<th>Camera</th>" +
      "<th>Location</th>" +
      "<th>Microphone</th>" +
      "<th>Last seen</th>" +
      "<th>Device status</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function renderFollowUpTable(rows) {
    var followRows = rows.filter(rowNeedsAttention);
    if (!followRows.length) {
      return '<p class="portal-activity-empty">No workers need follow-up for this filter.</p>';
    }
    var body = followRows
      .map(function (row) {
        var items = missingItems(row);
        var pri = followUpPriority(row);
        var priMap = {
          high: { kind: "bad", label: "High" },
          medium: { kind: "warn", label: "Medium" },
          low: { kind: "muted", label: "Low" },
        };
        return (
          '<tr class="' +
          esc(rowHighlightClass(row)) +
          '">' +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          '<td class="portal-sready-missing"><ul class="portal-sready-missing-list">' +
          items
            .map(function (it) {
              return "<li>" + esc(it) + "</li>";
            })
            .join("") +
          "</ul></td>" +
          "<td>" +
          labelBadge(priMap, pri) +
          "</td>" +
          '<td class="portal-sready-action">' +
          esc(suggestedAction(row)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table portal-sready-table portal-sready-table--follow">' +
      "<thead><tr>" +
      "<th>Staff</th>" +
      "<th>Missing items</th>" +
      "<th>Priority</th>" +
      "<th>Suggested action</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function renderTable(rows) {
    var list = document.getElementById("portalTrainingProgressTableWrap");
    var count = document.getElementById("portalTrainingProgressCount");
    if (!list) return;

    renderKpis(rows);
    var filtered = filterRows(rows);
    var visibleCount =
      state.tab === "follow_up"
        ? filtered.filter(rowNeedsAttention).length
        : filtered.length;
    if (count) {
      count.textContent =
        visibleCount +
        " staff" +
        (state.filter !== "all" || state.tab === "follow_up" ? " (filtered)" : "") +
        " · data updates when staff open the portal on their device";
    }

    if (!filtered.length) {
      list.innerHTML =
        '<p class="portal-activity-empty">No rows match this filter. Staff appear after they sign in on the app or web.</p>';
      return;
    }

    if (state.tab === "app_device") {
      list.innerHTML = renderAppTable(filtered);
      return;
    }
    if (state.tab === "follow_up") {
      list.innerHTML = renderFollowUpTable(filtered);
      return;
    }
    list.innerHTML = renderTrainingTable(filtered);
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalTrainingProgressStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  function syncTabsUi() {
    document.querySelectorAll("[data-portal-sready-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-portal-sready-tab") === state.tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  async function refresh() {
    var client = cfg.getClient();
    if (!client) {
      setStatus("<strong>Sign in required.</strong> Supabase session not available.", true);
      return;
    }

    var btn = document.getElementById("portalTrainingProgressRefresh");
    if (btn) btn.disabled = true;
    state.loading = true;
    setStatus("<strong>Loading…</strong>");

    var profilesRes = await client
      .from("staff_profiles")
      .select("id, full_name, username, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    var progressRes = await client
      .from("portal_staff_training_progress")
      .select(
        "staff_user_id, track, current_module, modules_total, progress_pct, module_states, phase_label, completed_at, updated_at"
      );

    var setupRes = await client.from("portal_staff_setup_status").select("*");

    var annRes = await client
      .from("portal_staff_announcements")
      .select("id, ends_at")
      .eq("on_ack_action", "portal_permissions");

    var allPermissionAnns = annRes.data || [];
    var nowMs = Date.now();
    state.permissionsAnnouncementIds = allPermissionAnns
      .filter(function (a) {
        if (!a || !a.id) return false;
        if (!a.ends_at) return true;
        return new Date(a.ends_at).getTime() >= nowMs;
      })
      .map(function (a) {
        return a.id;
      });

    var permissionAnnIds = allPermissionAnns
      .map(function (a) {
        return a && a.id;
      })
      .filter(Boolean);

    var permissionAcksByStaff = {};
    var ackErr = null;
    if (permissionAnnIds.length) {
      var ackRes = await client
        .from("portal_staff_announcement_acks")
        .select("staff_id, signed_at, announcement_id")
        .in("announcement_id", permissionAnnIds);
      if (ackRes.error) {
        ackErr = ackRes.error.message;
      } else {
        (ackRes.data || []).forEach(function (ack) {
          if (!ack || !ack.staff_id) return;
          var prev = permissionAcksByStaff[ack.staff_id];
          if (!prev || new Date(ack.signed_at).getTime() > new Date(prev.signed_at).getTime()) {
            permissionAcksByStaff[ack.staff_id] = ack;
          }
        });
      }
    }

    state.loading = false;
    if (btn) btn.disabled = false;

    var err =
      (profilesRes.error && profilesRes.error.message) ||
      (progressRes.error && progressRes.error.message) ||
      (setupRes.error && setupRes.error.message) ||
      (annRes.error && annRes.error.message) ||
      ackErr;

    if (err) {
      if (/does not exist|relation/i.test(err)) {
        setStatus(
          "<strong>Database not ready.</strong> Run migration <code>20260614150000_portal_staff_training_setup_status.sql</code> on Portal Supabase.",
          true
        );
      } else {
        setStatus("<strong>Error</strong> " + esc(err), true);
      }
      state.rows = [];
      renderTable([]);
      return;
    }

    state.rows = mergeRows(profilesRes.data, progressRes.data, setupRes.data, permissionAcksByStaff);
    setStatus("");
    renderTable(state.rows);
  }

  function bindModule() {
    var root = document.getElementById("portalTrainingProgressRoot");
    if (!root || root.getAttribute("data-portal-tprog-bound") === "1") return;
    root.setAttribute("data-portal-tprog-bound", "1");

    var refreshBtn = document.getElementById("portalTrainingProgressRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refresh();
      });
    }

    var filterSel = document.getElementById("portalTrainingProgressFilter");
    if (filterSel) {
      filterSel.addEventListener("change", function () {
        state.filter = filterSel.value || "all";
        renderTable(state.rows);
      });
    }

    root.addEventListener("click", function (ev) {
      var tabBtn = ev.target.closest ? ev.target.closest("[data-portal-sready-tab]") : null;
      if (!tabBtn || !root.contains(tabBtn)) return;
      state.tab = tabBtn.getAttribute("data-portal-sready-tab") || "training_compliance";
      syncTabsUi();
      renderTable(state.rows);
    });

    syncTabsUi();
    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalTrainingProgressRoot" class="portal-activity-embed portal-day-ops-embed portal-tprog-embed portal-sready-embed" data-portal-tprog-bound="0">' +
      '<h1 class="page-title">Staff Readiness</h1>' +
      '<p class="page-desc">Training, compliance and app setup overview</p>' +
      '<p class="page-intro portal-activity-intro">Operational view of induction, swimming training, safeguarding, compliance sign-offs, and portal device setup. Induction module detail (M1–M6) still syncs from each device. Policies, risk assessments, announcements and wellbeing use demo placeholders until live data is connected.</p>' +
      '<div id="portalStaffReadinessKpis" class="portal-sready-kpis-wrap" aria-live="polite"></div>' +
      '<div id="portalTrainingProgressStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-activity-toolbar">' +
      '<label class="portal-activity-toolbar__day"><span class="muted">Show</span> ' +
      '<select class="inp" id="portalTrainingProgressFilter">' +
      '<option value="all">All Staff</option>' +
      '<option value="attention">Needs Follow-Up</option>' +
      '<option value="training_incomplete">Training Incomplete</option>' +
      '<option value="compliance_missing">Compliance Missing</option>' +
      '<option value="app_setup_missing">App Setup Missing</option>' +
      '<option value="browser_only">Web Only Users</option>' +
      "</select></label>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalTrainingProgressRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="staffhr">Staff &amp; HR</button>' +
      "</div>" +
      '<div class="ash-tabs portal-sready-tabs" role="tablist" aria-label="Staff readiness views">' +
      '<button type="button" class="ash-tab is-active" role="tab" data-portal-sready-tab="training_compliance" aria-selected="true">Training &amp; Compliance</button>' +
      '<button type="button" class="ash-tab" role="tab" data-portal-sready-tab="app_device" aria-selected="false">App &amp; Device Readiness</button>' +
      '<button type="button" class="ash-tab" role="tab" data-portal-sready-tab="follow_up" aria-selected="false">Needs Follow-Up</button>' +
      "</div>" +
      '<p class="portal-activity-count" id="portalTrainingProgressCount">Loading…</p>' +
      '<div id="portalTrainingProgressTableWrap" aria-live="polite"></div>' +
      "</div>"
    );
  }

  global.PortalTrainingProgress = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
