/**
 * Sync induction / training progress + app readiness (PWA, alerts, map, mic) to Supabase.
 */
(function (global) {
  "use strict";

  var INDUCTION_MODULES = 6;
  var INDUCTION_REQUIRED_KEYS = { alex: true, michelle: true, carlos: true };
  var SWIMMING_TRAINING_KEY = "portalvic_swimming_training_progress_v1";
  var SWIMMING_TERM_KEY = "portalvic_swimming_term_review_progress_v1";

  function normKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function rosterKeyFromProfile(profile, authEmail) {
    if (typeof global.portalInferStaffKey === "function") {
      var k = global.portalInferStaffKey(profile || {}, authEmail || "");
      if (k) return normKey(k);
    }
    var raw = String((profile && profile.full_name) || (profile && profile.username) || "").trim();
    return normKey(raw.split(/\s+/)[0] || raw);
  }

  function inductionModuleState(n) {
    try {
      return JSON.parse(global.localStorage.getItem("provisional-induction-module-" + n) || "{}");
    } catch (_) {
      return {};
    }
  }

  function inductionModuleLabel(n, st) {
    if (st.quizPass) return "Done";
    if (st.video) return "Quiz pending";
    if (st.journey || Object.keys(st).length) return "In progress";
    return "Not started";
  }

  function readInductionProgress(profile, authEmail) {
    var key = rosterKeyFromProfile(profile, authEmail);
    var mustComplete = !!(key && INDUCTION_REQUIRED_KEYS[key]);
    var completeFlag = false;
    try {
      completeFlag = global.localStorage.getItem("provisional-induction-training-complete") === "1";
    } catch (_) {}

    var moduleStates = {};
    var doneCount = 0;
    var currentModule = 0;
    for (var i = 1; i <= INDUCTION_MODULES; i++) {
      var st = inductionModuleState(i);
      moduleStates[String(i)] = {
        journey: !!st.journey,
        video: !!st.video,
        quizPass: !!st.quizPass,
        label: inductionModuleLabel(i, st),
      };
      if (st.quizPass) {
        doneCount++;
      } else if (!currentModule) {
        currentModule = i;
      }
    }
    if (!currentModule && doneCount < INDUCTION_MODULES) currentModule = 1;
    if (doneCount >= INDUCTION_MODULES || (completeFlag && !mustComplete)) {
      currentModule = INDUCTION_MODULES;
    }

    var pct = Math.round((doneCount / INDUCTION_MODULES) * 100);
    var phase = "";
    if (!mustComplete && (completeFlag || doneCount >= INDUCTION_MODULES)) {
      phase = "Grandfathered complete";
    } else if (doneCount >= INDUCTION_MODULES) {
      phase = "All modules complete";
    } else if (currentModule) {
      phase = "Module " + currentModule + " · " + (moduleStates[String(currentModule)] || {}).label;
    } else {
      phase = "Not started";
    }

    return {
      track: "induction",
      current_module: currentModule,
      modules_total: INDUCTION_MODULES,
      progress_pct: mustComplete ? pct : Math.max(pct, completeFlag ? 100 : 0),
      module_states: moduleStates,
      phase_label: phase,
      completed_at:
        doneCount >= INDUCTION_MODULES || (!mustComplete && completeFlag)
          ? new Date().toISOString()
          : null,
      required: mustComplete,
    };
  }

  function readJsonProgress(storageKey, track, defaults) {
    defaults = defaults || {};
    var raw = null;
    try {
      raw = global.localStorage.getItem(storageKey);
    } catch (_) {}
    var data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      data = {};
    }
    if (!data || typeof data !== "object") data = {};
    return {
      track: track,
      current_module: Number(data.current_module || data.module || 0) || 0,
      modules_total: Number(data.modules_total || defaults.modules_total || 0) || 0,
      progress_pct: Math.min(100, Math.max(0, Number(data.progress_pct || data.pct || 0) || 0)),
      module_states: data.module_states && typeof data.module_states === "object" ? data.module_states : {},
      phase_label: String(data.phase_label || data.phase || defaults.phase || "Not started"),
      completed_at: data.completed_at || null,
    };
  }

  function inferTrackFromPath() {
    try {
      var p = String(global.location.pathname || "").toLowerCase();
      if (p.indexOf("swtermreview") >= 0) {
        return {
          track: "swimming_term_review",
          phase_label: "Opened term review",
          progress_pct: 5,
        };
      }
      if (p.indexOf("swtraining") >= 0 || p.indexOf("swimming") >= 0) {
        return {
          track: "swimming_training",
          phase_label: "Opened swimming training",
          progress_pct: 5,
        };
      }
      if (p.indexOf("general-induction") >= 0) {
        return { track: "induction", touchOnly: true };
      }
    } catch (_) {}
    return null;
  }

  function isPwaShell() {
    try {
      if (global.navigator && global.navigator.standalone === true) return true;
      if (global.matchMedia) {
        if (global.matchMedia("(display-mode: standalone)").matches) return true;
        if (global.matchMedia("(display-mode: fullscreen)").matches) return true;
      }
    } catch (_) {}
    return false;
  }

  function readSetupStatus(profile, authEmail) {
    var email = String(authEmail || "").trim();
    var display =
      String((profile && profile.full_name) || (profile && profile.username) || "").trim() ||
      email.split("@")[0];
    var push = false;
    try {
      push =
        typeof global.Notification !== "undefined" &&
        global.Notification.permission === "granted";
    } catch (_) {}
    var loc = false;
    var mic = false;
    try {
      loc = global.localStorage.getItem("portal_location_granted_v1") === "1";
    } catch (_) {}
    try {
      mic = global.localStorage.getItem("portal_microphone_granted_v1") === "1";
    } catch (_) {}
    if (typeof global.portalLocationPermissionGranted === "function" && global.portalLocationPermissionGranted()) {
      loc = true;
    }
    if (typeof global.portalMicrophonePermissionGranted === "function" && global.portalMicrophonePermissionGranted()) {
      mic = true;
    }
    return {
      staff_display_name: display,
      is_pwa: isPwaShell(),
      push_enabled: push,
      location_granted: loc,
      microphone_granted: mic,
      last_shell: isPwaShell() ? "pwa" : "browser",
      last_seen_at: new Date().toISOString(),
      client_meta: {
        ua: String((global.navigator && global.navigator.userAgent) || "").slice(0, 240),
      },
    };
  }

  async function upsertProgress(client, userId, row) {
    if (!client || !userId || !row || !row.track) return;
    var payload = {
      staff_user_id: userId,
      track: row.track,
      current_module: row.current_module || 0,
      modules_total: row.modules_total || 0,
      progress_pct: row.progress_pct || 0,
      module_states: row.module_states || {},
      phase_label: row.phase_label || "",
      completed_at: row.completed_at || null,
      updated_at: new Date().toISOString(),
    };
    var res = await client
      .from("portal_staff_training_progress")
      .upsert(payload, { onConflict: "staff_user_id,track" });
    if (res.error) throw res.error;
  }

  function resolveAuthUserId(opts, box) {
    opts = opts || {};
    box = box || {};
    var fromOpts = String(opts.userId || "").trim();
    if (fromOpts) return fromOpts;
    var session = opts.session || box.session;
    var uid = session && session.user && session.user.id;
    return uid ? String(uid).trim() : "";
  }

  async function upsertSetup(client, userId, row) {
    if (!client || !userId) return;
    var payload = Object.assign({ staff_user_id: userId }, row);
    var res = await client
      .from("portal_staff_setup_status")
      .upsert(payload, { onConflict: "staff_user_id" });
    if (res.error) throw res.error;
  }

  global.portalCollectTrainingProgressSnapshot = function portalCollectTrainingProgressSnapshot(opts) {
    opts = opts || {};
    var profile = opts.profile;
    var email = opts.authEmail || "";
    var rows = [readInductionProgress(profile, email)];
    rows.push(
      readJsonProgress(SWIMMING_TRAINING_KEY, "swimming_training", {
        modules_total: 2,
        phase: "Not started",
      })
    );
    rows.push(
      readJsonProgress(SWIMMING_TERM_KEY, "swimming_term_review", {
        phase: "Not launched / not started",
      })
    );
    var pathHint = inferTrackFromPath();
    if (pathHint && !pathHint.touchOnly) {
      var existing = rows.find(function (r) {
        return r.track === pathHint.track;
      });
      if (existing && (existing.progress_pct || 0) < (pathHint.progress_pct || 0)) {
        existing.phase_label = pathHint.phase_label;
        existing.progress_pct = pathHint.progress_pct;
      }
    }
    return {
      progress: rows,
      setup: readSetupStatus(profile, email),
    };
  };

  global.portalSyncTrainingProgressToSupabase = async function portalSyncTrainingProgressToSupabase(opts) {
    opts = opts || {};
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var client = opts.client || box.client;
      var session = opts.session || box.session;
      var profile = opts.profile || box.staff_profile;
      var userId = resolveAuthUserId(opts, box);
      if (!client || !userId) return { ok: false };

      var email = (session && session.user && session.user.email) || "";
      var snap = global.portalCollectTrainingProgressSnapshot({
        profile: profile,
        authEmail: email,
      });

      for (var i = 0; i < snap.progress.length; i++) {
        await upsertProgress(client, userId, snap.progress[i]);
      }
      await upsertSetup(client, userId, snap.setup);
      return { ok: true };
    } catch (e) {
      try {
        console.debug("[portal] training progress sync", e);
      } catch (_) {}
      return { ok: false, error: e };
    }
  };

  var trainingProgressSyncQueued = false;
  function queueTrainingProgressSync() {
    if (trainingProgressSyncQueued) return;
    trainingProgressSyncQueued = true;
    void global.portalSyncTrainingProgressToSupabase().finally(function () {
      trainingProgressSyncQueued = false;
    });
  }

  if (global.addEventListener) {
    global.addEventListener("portal:supabase-ready", queueTrainingProgressSync);
    global.addEventListener("portal:location-permission-change", queueTrainingProgressSync);
    global.addEventListener("portal:microphone-permission-change", queueTrainingProgressSync);
    global.addEventListener("portal:induction-progress", queueTrainingProgressSync);
  }
})(typeof window !== "undefined" ? window : globalThis);
