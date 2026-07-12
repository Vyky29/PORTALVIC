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
    var swim = row.tracks && row.tracks.swimming_training;
    if (!swim) return false;
    // Ignore auto-synced empty stubs (every device used to upload "Not started" @ 0%).
    if (trackIsComplete(swim) || trackIsInProgress(swim)) return true;
    if (trackProgressPct(swim) > 0) return true;
    var phase = String(swim.phase_label || "")
      .trim()
      .toLowerCase();
    if (phase && phase !== "not started" && phase.indexOf("not launched") < 0) return true;
    return false;
  }

  function swimmingStatus(row) {
    if (!swimmingRequired(row)) return "na";
    var swim = row.tracks.swimming_training;
    if (!swim) return "not_started";
    if (trackIsComplete(swim)) return "complete";
    if (trackIsInProgress(swim)) return "in_progress";
    return "not_started";
  }

  /** Live compliance feeds are not wired yet — do not invent status. */
  function complianceField(_row, _field) {
    return "not_tracked";
  }

  function safeguardingStatus(_row) {
    return "not_tracked";
  }

  /** All active staff with a shift must grant location during portal setup. */
  function locationRequiredForRow(row) {
    if (!row || !row.profile) return true;
    if (row.profile.is_active === false) return false;
    return true;
  }

  function formatGpsAgo(iso) {
    if (!iso) return "";
    var ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    if (ms < 60000) return Math.round(ms / 1000) + "s ago";
    if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
    return Math.round(ms / 3600000) + "h ago";
  }

  function mergeLiveLocationPings(rows, liveRows) {
    var byUser = Object.create(null);
    (liveRows || []).forEach(function (r) {
      if (!r || !r.staff_user_id) return;
      byUser[r.staff_user_id] = r;
    });
    rows.forEach(function (row) {
      var ping = byUser[row.id];
      row.liveLocation = ping
        ? {
            updated_at: ping.updated_at,
            is_sharing: !!ping.is_sharing,
            ago: formatGpsAgo(ping.updated_at),
          }
        : null;
    });
    return rows;
  }

  function mergeDeviceAttribution(rows, attributionRows, unavailable) {
    if (unavailable) {
      rows.forEach(function (row) {
        var s = row.setup || {};
        var hasSetup =
          !!s.push_enabled || !!s.location_granted || !!s.is_pwa || !!s.last_seen_at;
        row.deviceAttribution = hasSetup
          ? { attribution: "unknown", sharedWith: [], lastGpsAt: null, hasPush: false }
          : { attribution: "not_setup", sharedWith: [], lastGpsAt: null, hasPush: false };
      });
      return rows;
    }
    var byUser = Object.create(null);
    (attributionRows || []).forEach(function (r) {
      if (!r || !r.staff_user_id) return;
      byUser[r.staff_user_id] = r;
    });
    rows.forEach(function (row) {
      var attr = byUser[row.id];
      row.deviceAttribution = attr
        ? {
            attribution: String(attr.attribution || "unknown"),
            sharedWith: Array.isArray(attr.shared_with) ? attr.shared_with : [],
            lastGpsAt: attr.last_gps_at || null,
            hasPush: !!attr.has_push,
          }
        : { attribution: "not_setup", sharedWith: [], lastGpsAt: null, hasPush: false };
    });
    return rows;
  }

  function deviceSetupIsShared(row) {
    var a = row.deviceAttribution && row.deviceAttribution.attribution;
    return a === "shared_device" || a === "likely_shared";
  }

  function sharedDeviceNames(row) {
    var list = (row.deviceAttribution && row.deviceAttribution.sharedWith) || [];
    return list
      .map(function (x) {
        return String((x && x.staff_display_name) || "").trim();
      })
      .filter(Boolean);
  }

  function deviceAttributionCell(row) {
    var da = row.deviceAttribution || {};
    var attr = da.attribution || "unknown";
    var names = sharedDeviceNames(row);
    var labelMap = {
      own_device: { kind: "ok", label: "Their phone" },
      shared_device: { kind: "bad", label: "Someone else's phone" },
      likely_shared: { kind: "bad", label: "Likely shared phone" },
      unknown: { kind: "warn", label: "Can't tell yet" },
      not_setup: { kind: "muted", label: "Not set up" },
    };
    var item = labelMap[attr] || labelMap.unknown;
    var html = statusBadge(item.kind, item.label);
    if (names.length) {
      html +=
        '<span class="muted portal-sready-subdate">Same device as: ' +
        esc(names.join(", ")) +
        "</span>";
    }
    if (deviceSetupIsShared(row) && da.lastGpsAt) {
      html +=
        '<span class="muted portal-sready-subdate">GPS from their phone recently — ask them to redo setup on their device</span>';
    }
    return html;
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

  function setupClientMeta(row) {
    var s = row && row.setup;
    return (s && s.client_meta && typeof s.client_meta === "object" ? s.client_meta : {}) || {};
  }

  /** staff_app | portalvic | other | unknown */
  function accessChannel(row) {
    var meta = setupClientMeta(row);
    var channel = String(meta.channel || "")
      .trim()
      .toLowerCase();
    if (channel === "staff_app" || channel === "portalvic" || channel === "other") return channel;
    var host = String(meta.host || meta.hostname || "")
      .trim()
      .toLowerCase();
    if (!host && meta.origin) {
      try {
        host = String(new URL(String(meta.origin)).hostname || "").toLowerCase();
      } catch (_) {}
    }
    if (/clubsensational-staff/.test(host)) return "staff_app";
    if (/portalvic/.test(host)) return "portalvic";
    if (host) return "other";
    if (meta.staff_app_build === true || meta.staff_app_flag === true) return "staff_app";
    return "unknown";
  }

  function accessShell(row) {
    var s = row.setup || {};
    if (!s || !s.last_seen_at) return "unknown";
    if (s.is_pwa || s.last_shell === "pwa") return "installed";
    return "browser";
  }

  /** Preferred: clubsensational-staff installed app. */
  function accessIsPreferred(row) {
    return accessChannel(row) === "staff_app" && accessShell(row) === "installed";
  }

  function portalAccess(row) {
    var shell = accessShell(row);
    if (shell === "unknown") return "unknown";
    if (shell === "installed") return "app";
    return "web";
  }

  function deviceRegistered(row) {
    return accessShell(row) === "installed";
  }

  function trainingReady(row) {
    if (inductionStatus(row) !== "complete") return false;
    var swim = swimmingStatus(row);
    if (swim !== "na" && swim !== "complete") return false;
    return true;
  }

  function complianceReady(_row) {
    // Placeholders removed — compliance is not scored until live feeds exist.
    return true;
  }

  function appReady(row) {
    return portalFeaturesComplete(row);
  }

  function overallReady(row) {
    return trainingReady(row) && appReady(row);
  }

  function enrichRow(row) {
    row.readiness = {
      induction: inductionStatus(row),
      swimming: swimmingStatus(row),
      safeguarding: safeguardingStatus(row),
      policies: complianceField(row, "policies"),
      riskAssessments: complianceField(row, "risk"),
      announcements: complianceField(row, "announcements"),
      wellbeing: complianceField(row, "wellbeing"),
      accessChannel: accessChannel(row),
      accessShell: accessShell(row),
      portalAccess: portalAccess(row),
      deviceRegistered: deviceRegistered(row),
      accessPreferred: accessIsPreferred(row),
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
    if (row.readiness.overallReady) return "ready";
    if (!row.readiness.trainingReady) return "follow_up";
    if (!row.readiness.appReady) return "follow_up";
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
    var s = row.setup || {};
    if (!portalFeaturesComplete(row)) items.push("Portal features not activated");
    if (state.permissionsAnnouncementIds.length && !permissionsAnnouncementSigned(row)) {
      items.push("Setup announcement not signed");
    }
    if (!s.push_enabled) items.push("Alerts disabled");
    if (!s.camera_granted) items.push("Camera disabled");
    if (r.locationRequired && !s.location_granted) items.push("Location disabled");
    if (r.locationRequired && s.location_granted && (!row.liveLocation || !row.liveLocation.updated_at)) {
      items.push("No GPS from their device yet");
    } else if (
      r.locationRequired &&
      s.location_granted &&
      row.liveLocation &&
      row.liveLocation.updated_at &&
      Date.now() - new Date(row.liveLocation.updated_at).getTime() > 20 * 60 * 1000
    ) {
      items.push("GPS stale — portal must stay open during shift");
    }
    if (r.accessChannel === "portalvic") {
      items.push(
        r.accessShell === "installed"
          ? "Still on portalvic app — move to clubsensational-staff"
          : "Still on portalvic web — open clubsensational-staff"
      );
    } else if (r.accessShell === "browser") {
      items.push(
        r.accessChannel === "staff_app"
          ? "Using browser on staff app host — Add to Home Screen"
          : "Using browser only — install clubsensational-staff app"
      );
    }
    if (deviceSetupIsShared(row)) {
      items.push("Portal setup done on someone else's phone — not their device");
    }
    return items;
  }

  function followUpPriority(row) {
    var items = missingItems(row);
    if (!items.length) return "low";
    var r = row.readiness;
    if (!push_enabledCheck(row) || !r.trainingReady) return "high";
    if (items.some(function (x) {
      return /someone else|portalvic|browser/i.test(x);
    })) {
      return "medium";
    }
    if (!r.appReady) return "medium";
    return "low";
  }

  function push_enabledCheck(row) {
    return !!(row.setup && row.setup.push_enabled);
  }

  function suggestedAction(row) {
    var items = missingItems(row);
    if (!items.length) return "No action required";
    if (items.indexOf("Missing induction modules") >= 0) {
      return "Send induction reminder and book check-in";
    }
    if (items.indexOf("Missing swimming training") >= 0) {
      return "Confirm swimming training path with worker";
    }
    if (items.indexOf("Portal features not activated") >= 0) {
      return "Ask worker to tap Turn on portal features in Settings";
    }
    if (items.indexOf("Setup announcement not signed") >= 0) {
      return "Ask worker to read and sign the portal setup announcement";
    }
    if (items.indexOf("Portal setup done on someone else's phone — not their device") >= 0) {
      return "Ask worker to sign in on their own phone and turn on portal features there — do not use admin phone";
    }
    if (items.indexOf("No GPS from their device yet") >= 0) {
      return "Ask worker to open the portal app on their own phone and keep it open during shift";
    }
    if (items.indexOf("GPS stale — portal must stay open during shift") >= 0) {
      return "Ask worker to reopen the portal app — GPS stops when the app is closed";
    }
    if (items.indexOf("Alerts disabled") >= 0) {
      return "Ask worker to enable alerts in app settings";
    }
    if (items.some(function (x) {
      return /portalvic|browser|clubsensational-staff/i.test(x);
    })) {
      return "Guide worker to clubsensational-staff.vercel.app and Add to Home Screen";
    }
    return "Review outstanding items with worker";
  }

  function rowNeedsAttention(row) {
    return !row.readiness.overallReady || missingItems(row).length > 0;
  }

  function rowTrainingIncomplete(row) {
    return !row.readiness.trainingReady;
  }

  function rowComplianceMissing(_row) {
    return false;
  }

  function rowAppSetupMissing(row) {
    return !row.readiness.appReady;
  }

  function rowWebOnly(row) {
    return row.readiness.accessShell === "browser";
  }

  function rowOnPortalvic(row) {
    return row.readiness.accessChannel === "portalvic";
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
    if (f === "app_setup_missing") return rows.filter(rowAppSetupMissing);
    if (f === "browser_only") return rows.filter(rowWebOnly);
    if (f === "portalvic") return rows.filter(rowOnPortalvic);
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

  var OVERALL_LABELS = {
    ready: { kind: "ok", label: "Ready" },
    follow_up: { kind: "warn", label: "Follow up" },
    non_compliant: { kind: "bad", label: "Needs work" },
  };

  function accessChannelCell(row) {
    var r = row.readiness || {};
    var channel = r.accessChannel || "unknown";
    var shell = r.accessShell || "unknown";
    var label;
    var kind;
    if (channel === "staff_app" && shell === "installed") {
      label = "Staff app";
      kind = "ok";
    } else if (channel === "staff_app" && shell === "browser") {
      label = "Staff app · browser";
      kind = "warn";
    } else if (channel === "portalvic" && shell === "installed") {
      label = "portalvic app";
      kind = "warn";
    } else if (channel === "portalvic") {
      label = "portalvic · web";
      kind = "warn";
    } else if (shell === "installed") {
      label = "Installed app";
      kind = "muted";
    } else if (shell === "browser") {
      label = "Web browser";
      kind = "warn";
    } else {
      label = "Unknown";
      kind = "muted";
    }
    var html = statusBadge(kind, label);
    if (channel === "unknown" && shell !== "unknown") {
      html +=
        '<span class="muted portal-sready-subdate">Host unknown until they reopen after update</span>';
    } else if (channel === "portalvic") {
      html +=
        '<span class="muted portal-sready-subdate">Move to clubsensational-staff.vercel.app</span>';
    }
    return html;
  }

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
    if (!r.trainingReady) cls.push("portal-sready-row--sg");
    if (!r.appReady) cls.push("portal-sready-row--app");
    if (!r.accessPreferred) cls.push("portal-sready-row--compliance");
    return cls.join(" ");
  }

  function permissionCell(row, field) {
    var s = row.setup || {};
    var r = row.readiness;
    if (field === "location") {
      if (!r.locationRequired) return statusBadge("muted", "Not Required");
      var base = s.location_granted ? statusBadge("ok", "Enabled") : statusBadge("bad", "Disabled");
      var ping = row.liveLocation;
      if (ping && ping.updated_at) {
        var fresh = Date.now() - new Date(ping.updated_at).getTime() <= 20 * 60 * 1000;
        var sub =
          '<span class="muted portal-sready-subdate">' +
          esc(fresh ? "GPS " + ping.ago : "No recent GPS") +
          "</span>";
        return base + sub;
      }
      if (s.location_granted) {
        return (
          base +
          '<span class="muted portal-sready-subdate">No GPS ping yet — must open portal on their phone</span>'
        );
      }
      return base;
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

  function renderKpis(rows) {
    var el = document.getElementById("portalStaffReadinessKpis");
    if (!el) return;
    var total = rows.length;
    var fully = rows.filter(function (r) {
      return r.readiness.overallReady && r.readiness.accessPreferred;
    }).length;
    var trainInc = rows.filter(rowTrainingIncomplete).length;
    var onPortalvic = rows.filter(rowOnPortalvic).length;
    var appMiss = rows.filter(rowAppSetupMissing).length;
    var browserOnly = rows.filter(rowWebOnly).length;
    el.innerHTML =
      '<div class="grid-kpi portal-sready-kpis">' +
      '<div class="kpi card--premium portal-sready-kpi portal-sready-kpi--ok">' +
      '<div class="kpi-l">Staff fully ready</div>' +
      '<div class="kpi-v">' +
      esc(String(fully)) +
      " / " +
      esc(String(total)) +
      "</div>" +
      '<div class="kpi-s muted">Training + features + staff app</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi">' +
      '<div class="kpi-l">Training incomplete</div>' +
      '<div class="kpi-v">' +
      esc(String(trainInc)) +
      "</div>" +
      '<div class="kpi-s muted">Induction or swimming in progress</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi' +
      (onPortalvic || browserOnly ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">Wrong / web access</div>' +
      '<div class="kpi-v">' +
      esc(String(onPortalvic + browserOnly)) +
      "</div>" +
      '<div class="kpi-s muted">' +
      esc(String(onPortalvic)) +
      " portalvic · " +
      esc(String(browserOnly)) +
      " browser</div></div>" +
      '<div class="kpi card--premium portal-sready-kpi' +
      (appMiss ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">App setup missing</div>' +
      '<div class="kpi-v">' +
      esc(String(appMiss)) +
      "</div>" +
      '<div class="kpi-s muted">Alerts, location or features</div></div>' +
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
          '<td class="portal-sready-cell">' +
          accessChannelCell(row) +
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
      "<th>Access</th>" +
      "<th>Overall</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function renderAppTable(rows) {
    var body = rows
      .map(function (row) {
        var s = row.setup || {};
        return (
          '<tr class="' +
          esc(rowHighlightClass(row)) +
          '">' +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          '<td class="portal-sready-cell">' +
          accessChannelCell(row) +
          "</td>" +
          '<td class="portal-sready-cell">' +
          portalFeaturesCell(row) +
          "</td>" +
          "<td>" +
          permissionCell(row, "alerts") +
          "</td>" +
          "<td>" +
          permissionCell(row, "location") +
          "</td>" +
          "<td>" +
          permissionCell(row, "camera") +
          "</td>" +
          '<td class="portal-sready-cell">' +
          deviceAttributionCell(row) +
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
      "<th>Access (portalvic / staff app / web)</th>" +
      "<th>Portal features</th>" +
      "<th>Alerts</th>" +
      "<th>Location</th>" +
      "<th>Camera</th>" +
      "<th>Setup on whose phone?</th>" +
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

    var liveLocRes = await client.rpc("portal_admin_fetch_staff_live_locations", {
      p_stale_minutes: 120,
    });

    var liveLocRows = [];
    if (!liveLocRes.error && liveLocRes.data != null) {
      liveLocRows = Array.isArray(liveLocRes.data) ? liveLocRes.data : [];
    } else {
      var liveTable = await client
        .from("portal_staff_live_locations")
        .select("staff_user_id, updated_at, is_sharing")
        .gte("updated_at", new Date(Date.now() - 120 * 60 * 1000).toISOString());
      if (!liveTable.error) liveLocRows = liveTable.data || [];
    }

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

    state.rows = mergeDeviceAttribution(
      mergeLiveLocationPings(
        mergeRows(profilesRes.data, progressRes.data, setupRes.data, permissionAcksByStaff),
        liveLocRows
      ),
      [],
      true
    );
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
      '<p class="page-desc">Training and device access — portalvic, clubsensational-staff, or web</p>' +
      '<p class="page-intro portal-activity-intro">Shows real induction progress and how each person last opened the portal: <strong>Staff app</strong> (clubsensational-staff), <strong>portalvic</strong>, or <strong>web browser</strong>. Preferred: installed Staff app. Host is recorded when they open the portal after this update; until then Access may say host unknown.</p>' +
      '<div id="portalStaffReadinessKpis" class="portal-sready-kpis-wrap" aria-live="polite"></div>' +
      '<div id="portalTrainingProgressStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-activity-toolbar">' +
      '<label class="portal-activity-toolbar__day"><span class="muted">Show</span> ' +
      '<select class="inp" id="portalTrainingProgressFilter">' +
      '<option value="all">All Staff</option>' +
      '<option value="attention">Needs Follow-Up</option>' +
      '<option value="training_incomplete">Training Incomplete</option>' +
      '<option value="app_setup_missing">App Setup Missing</option>' +
      '<option value="portalvic">On portalvic</option>' +
      '<option value="browser_only">Browser only</option>' +
      "</select></label>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalTrainingProgressRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="staffhr">Staff &amp; HR</button>' +
      "</div>" +
      '<div class="ash-tabs portal-sready-tabs" role="tablist" aria-label="Staff readiness views">' +
      '<button type="button" class="ash-tab is-active" role="tab" data-portal-sready-tab="training_compliance" aria-selected="true">Training &amp; Access</button>' +
      '<button type="button" class="ash-tab" role="tab" data-portal-sready-tab="app_device" aria-selected="false">App &amp; Device</button>' +
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
