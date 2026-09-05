/**
 * venue_review.html — logic split (same-origin `venue_review.html` when deployed with this repo):
 * - Backend: Supabase insert into public.venue_reviews
 * - When has_issues = Yes and notes are non-empty, DB trigger fills public.venue_review_admin_notifications (admin/CEO alerts).
 * - Front-end: DOM, query context, issues toggles, submit handler
 */

const PORTAL_AUTH_MODULE_V = "20260419-99";

/** Resolve auth-handler from same folder as this module (portal/ or portal-shared-js/). */
function portalAuthModuleUrl() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return new URL("./auth-handler.js?v=" + PORTAL_AUTH_MODULE_V, import.meta.url).href;
    }
  } catch (_) {}
  return "/portal/auth-handler.js?v=" + PORTAL_AUTH_MODULE_V;
}

const qs = new URLSearchParams(typeof location !== "undefined" ? location.search || "" : "");

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dashboard: date, venue|location, kind|openingClosing, optional sessionKey, origin, completedBy|name */
function contextFromQuery() {
  const kindRaw = clean(qs.get("kind") || qs.get("openingClosing") || "");
  let openingClosing = "";
  const low = kindRaw.toLowerCase();
  if (low === "open" || low === "opening") openingClosing = "Opening";
  else if (low === "close" || low === "closing") openingClosing = "Closing";
  else if (kindRaw === "Opening" || kindRaw === "Closing") openingClosing = kindRaw;
  let origin = clean(qs.get("origin") || "dashboard");
  if (origin !== "this_week" && origin !== "term" && origin !== "dashboard") origin = "dashboard";
  return {
    date: clean(qs.get("date") || ""),
    venue: clean(qs.get("venue") || qs.get("location") || ""),
    service: clean(qs.get("service") || qs.get("programme") || ""),
    openingClosing,
    portalSessionKey: clean(qs.get("sessionKey") || ""),
    origin,
    completedBy: clean(qs.get("completedBy") || qs.get("name") || ""),
    requireVideo:
      qs.get("video") === "1" ||
      qs.get("requireVideo") === "1" ||
      clean(qs.get("video") || "").toLowerCase() === "true"
  };
}

function localIsoDateToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseReviewDate(ctxDate) {
  const s = clean(ctxDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return localIsoDateToday();
}

function venueSlugForMarker(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Mirror the staff dashboard "venue report done" flag so the reminder clears
 * after the report is submitted (until the next day's reminder). Only the
 * specific kind (opening or closing) is marked — staff who owe two reports
 * per day keep the other reminder until that one is submitted too.
 */
function markVenueReportDoneLocal(row, ctx) {
  try {
    const oc = String(
      (row && row.opening_or_closing) || (ctx && ctx.openingClosing) || ""
    ).toLowerCase();
    var kinds = [];
    if (oc.indexOf("clos") >= 0) kinds = ["close"];
    else if (oc.indexOf("open") >= 0) kinds = ["open"];
    else return;
    const dates = [];
    const rd = String((row && row.review_date) || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) dates.push(rd);
    const today = localIsoDateToday();
    if (dates.indexOf(today) < 0) dates.push(today);
    const vslug = venueSlugForMarker(row && row.venue);
    for (let d = 0; d < dates.length; d++) {
      for (let k = 0; k < kinds.length; k++) {
        try {
          localStorage.setItem("portalVenueSubmitted_" + dates[d] + "_" + kinds[k], "1");
        } catch (_) {}
        if (vslug) {
          try {
            localStorage.setItem(
              "portalVenueSubmitted_" + dates[d] + "_" + vslug + "_" + kinds[k],
              "1"
            );
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

function toUkDisplayDate(isoLike) {
  const s = clean(isoLike);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(5, 7);
    const d = s.slice(8, 10);
    return `${d}/${m}/${y}`;
  }
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = now.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// --- Backend (Supabase)

/**
 * Display name for inserts: prefer staff_profiles, then auth metadata / email.
 */
function submittedByNameFromProfileAndUser(profileRow, user) {
  if (profileRow) {
    const n = clean(profileRow.full_name || profileRow.username || "");
    if (n) return n;
  }
  if (user) {
    const meta = user.user_metadata || {};
    const fromMeta = clean(
      meta.full_name || meta.name || meta.display_name || ""
    );
    if (fromMeta) return fromMeta;
    const em = clean(user.email || "");
    if (em && em.includes("@")) {
      return clean(em.split("@")[0].replace(/[._]+/g, " "));
    }
  }
  return "Portal user";
}

/**
 * Returns a submission context that does not require authenticated user:
 * - keeps authenticated user id/name when available
 * - falls back to query name or generic label for open submissions
 */
async function resolveSubmissionContext(ctx) {
  const { getSupabaseClient } = await import(portalAuthModuleUrl());
  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user =
    !authErr && authData && authData.user && authData.user.id ? authData.user : null;
  const uid = user ? String(user.id).trim() : "";
  let profileRow = null;
  if (uid) {
    try {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("full_name, username")
        .eq("id", uid)
        .maybeSingle();
      if (!error && data) profileRow = data;
    } catch (_) {
      profileRow = null;
    }
  }
  const submittedByName =
    submittedByNameFromProfileAndUser(profileRow, user) ||
    clean(ctx && ctx.completedBy) ||
    "Venue staff";
  return {
    submittedByUserId: uid || null,
    submittedByName,
    supabase
  };
}

/**
 * @param {ReturnType<typeof contextFromQuery>} ctx
 * @param {{ time: string, issueMode: "yes" | "no", issuesReported: string, videoStoragePath?: string, videoMimeType?: string, videoDurationSec?: number|null }} formState
 */
function buildVenueReviewRow(ctx, formState, submission) {
  const opening = clean(ctx.openingClosing) || null;
  const venue = clean(ctx.venue) || null;
  const psk = clean(ctx.portalSessionKey) || null;
  const hasYes = formState.issueMode === "yes";
  const notes = clean(formState.issuesReported);
  const row = {
    submitted_by_user_id: submission.submittedByUserId,
    submitted_by_name: submission.submittedByName,
    review_date: parseReviewDate(ctx.date),
    venue,
    opening_or_closing: opening,
    review_time: clean(formState.time),
    has_issues: hasYes ? "Yes" : "No",
    issues_reported: notes || null,
    portal_session_key: psk,
    origin: ctx.origin || "dashboard"
  };
  const vPath = clean(formState.videoStoragePath || "");
  if (vPath) {
    row.video_storage_path = vPath;
    row.video_mime_type = clean(formState.videoMimeType || "") || null;
    const dur = formState.videoDurationSec;
    row.video_duration_sec =
      dur != null && Number.isFinite(Number(dur)) ? Number(dur) : null;
  }
  return row;
}

const VENUE_REVIEW_VIDEO_BUCKET = "venue-review-videos";
const VENUE_WALKTHROUGH_MAX_MS = 3 * 60 * 1000;

function pickVenueVideoMimeType() {
  try {
    if (typeof MediaRecorder === "undefined") return "";
    const types = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    for (let i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) {
        return types[i];
      }
    }
  } catch (_) {}
  return "";
}

function venueVideoExtForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.indexOf("mp4") >= 0 || m.indexOf("quicktime") >= 0) return "mp4";
  if (m.indexOf("ogg") >= 0) return "ogv";
  return "webm";
}

function stopVenueMediaStream(stream) {
  try {
    if (!stream) return;
    const tracks = stream.getTracks ? stream.getTracks() : [];
    for (let i = 0; i < tracks.length; i++) {
      try {
        tracks[i].stop();
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Camera + MediaRecorder for Roberto Sunday open/close walkthrough.
 * @returns {{ required: boolean, hasBlob: function(): boolean, getBlob: function(): Blob|null, getMime: function(): string, getDurationSec: function(): number|null, stopAll: function(): void }}
 */
function initVenueWalkthroughRecorder(ctx) {
  const panel = document.getElementById("venueWalkthroughPanel");
  const liveEl = document.getElementById("venueWalkthroughLive");
  const playEl = document.getElementById("venueWalkthroughPlayback");
  const statusEl = document.getElementById("venueWalkthroughStatus");
  const hintEl = document.getElementById("venueWalkthroughHint");
  const btnCam = document.getElementById("venueWalkthroughStartCam");
  const btnRec = document.getElementById("venueWalkthroughRecord");
  const btnStop = document.getElementById("venueWalkthroughStop");
  const btnRetake = document.getElementById("venueWalkthroughRetake");
  const required = !!(ctx && ctx.requireVideo);
  const state = {
    stream: null,
    recorder: null,
    chunks: [],
    blob: null,
    mime: "",
    objectUrl: "",
    startedAt: 0,
    durationSec: null,
    maxTimer: null
  };
  const api = {
    required: required,
    hasBlob: function () {
      return !!(state.blob && state.blob.size > 0);
    },
    getBlob: function () {
      return state.blob || null;
    },
    getMime: function () {
      return state.mime || "";
    },
    getDurationSec: function () {
      return state.durationSec;
    },
    stopAll: function () {
      try {
        if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
      } catch (_) {}
      stopVenueMediaStream(state.stream);
      state.stream = null;
      state.recorder = null;
    }
  };
  if (!panel || !required) {
    if (panel) panel.hidden = true;
    return api;
  }
  panel.hidden = false;
  const kindLabel = clean(ctx.openingClosing) || "venue";
  if (hintEl) {
    hintEl.textContent =
      "Record a short walkthrough of SwimFarm for this " +
      kindLabel.toLowerCase() +
      " check (up to 3 minutes). The video stays internal with venue reviews.";
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = String(msg || "");
  }
  function setButtons(mode) {
    // idle | preview | recording | ready
    if (btnCam) btnCam.disabled = mode === "recording" || mode === "preview";
    if (btnRec) btnRec.disabled = mode !== "preview";
    if (btnStop) btnStop.disabled = mode !== "recording";
    if (btnRetake) btnRetake.disabled = mode !== "ready" && mode !== "preview";
  }
  function clearPlayback() {
    if (state.objectUrl) {
      try {
        URL.revokeObjectURL(state.objectUrl);
      } catch (_) {}
      state.objectUrl = "";
    }
    if (playEl) {
      try {
        playEl.removeAttribute("src");
        playEl.load();
      } catch (_) {}
      playEl.hidden = true;
    }
    if (liveEl) liveEl.hidden = false;
  }
  function showPlayback(blob) {
    if (!playEl || !blob) return;
    clearPlayback();
    state.objectUrl = URL.createObjectURL(blob);
    playEl.src = state.objectUrl;
    playEl.hidden = false;
    if (liveEl) liveEl.hidden = true;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera not supported on this device/browser.");
      return;
    }
    try {
      stopVenueMediaStream(state.stream);
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (liveEl) {
        liveEl.srcObject = state.stream;
        liveEl.hidden = false;
        try {
          await liveEl.play();
        } catch (_) {}
      }
      if (playEl) playEl.hidden = true;
      state.blob = null;
      state.mime = "";
      state.durationSec = null;
      setButtons("preview");
      setStatus("Camera on. Tap Record when ready.");
    } catch (err) {
      console.error(err);
      setStatus("Could not open the camera. Check permissions and try again.");
      setButtons("idle");
    }
  }

  function startRecording() {
    if (!state.stream) {
      setStatus("Start the camera first.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatus("Recording is not supported in this browser.");
      return;
    }
    state.chunks = [];
    state.blob = null;
    state.mime = pickVenueVideoMimeType();
    try {
      state.recorder = state.mime
        ? new MediaRecorder(state.stream, { mimeType: state.mime })
        : new MediaRecorder(state.stream);
      if (!state.mime) state.mime = state.recorder.mimeType || "video/webm";
    } catch (err) {
      console.error(err);
      setStatus("Could not start recording.");
      return;
    }
    state.recorder.ondataavailable = function (ev) {
      if (ev && ev.data && ev.data.size > 0) state.chunks.push(ev.data);
    };
    state.recorder.onstop = function () {
      try {
        if (state.maxTimer) {
          clearTimeout(state.maxTimer);
          state.maxTimer = null;
        }
      } catch (_) {}
      const blob = new Blob(state.chunks, { type: state.mime || "video/webm" });
      state.blob = blob;
      if (state.startedAt) {
        state.durationSec = Math.max(
          0.1,
          Math.round(((Date.now() - state.startedAt) / 1000) * 10) / 10
        );
      }
      showPlayback(blob);
      setButtons("ready");
      setStatus("Video ready. You can Retake or Submit the venue report.");
    };
    try {
      state.startedAt = Date.now();
      state.recorder.start(1000);
      setButtons("recording");
      setStatus("Recording… tap Stop when finished.");
      state.maxTimer = setTimeout(function () {
        try {
          if (state.recorder && state.recorder.state === "recording") state.recorder.stop();
        } catch (_) {}
      }, VENUE_WALKTHROUGH_MAX_MS);
    } catch (err) {
      console.error(err);
      setStatus("Recording failed to start.");
      setButtons("preview");
    }
  }

  function stopRecording() {
    try {
      if (state.recorder && state.recorder.state === "recording") state.recorder.stop();
    } catch (_) {}
  }

  function retake() {
    state.blob = null;
    state.chunks = [];
    state.durationSec = null;
    clearPlayback();
    if (state.stream && liveEl) {
      liveEl.srcObject = state.stream;
      liveEl.hidden = false;
      setButtons("preview");
      setStatus("Camera on. Tap Record when ready.");
    } else {
      setButtons("idle");
      setStatus("Camera ready when you tap Start camera.");
    }
  }

  if (btnCam) btnCam.addEventListener("click", function () { void startCamera(); });
  if (btnRec) btnRec.addEventListener("click", startRecording);
  if (btnStop) btnStop.addEventListener("click", stopRecording);
  if (btnRetake) btnRetake.addEventListener("click", retake);
  setButtons("idle");
  setStatus("Camera ready when you tap Start camera.");
  return api;
}

async function uploadVenueWalkthroughVideo(supabase, submission, ctx, recorderApi) {
  const blob = recorderApi && recorderApi.getBlob ? recorderApi.getBlob() : null;
  if (!blob || !blob.size) throw new Error("Walkthrough video is required.");
  const uid = clean(submission && submission.submittedByUserId);
  if (!uid) throw new Error("Sign in required to upload the venue video.");
  const mime = clean((recorderApi.getMime && recorderApi.getMime()) || blob.type || "video/webm");
  const ext = venueVideoExtForMime(mime);
  const kind =
    clean(ctx.openingClosing).toLowerCase().indexOf("clos") >= 0 ? "close" : "open";
  const day = parseReviewDate(ctx.date);
  const stamp = String(Date.now());
  const path = uid + "/" + day + "/" + kind + "_" + stamp + "." + ext;
  const { error } = await supabase.storage.from(VENUE_REVIEW_VIDEO_BUCKET).upload(path, blob, {
    contentType: mime || "video/webm",
    upsert: false
  });
  if (error) throw error;
  return {
    path: path,
    mime: mime,
    durationSec: recorderApi.getDurationSec ? recorderApi.getDurationSec() : null
  };
}

async function submitVenueReviewToSupabase(supabase, row) {
  const { error } = await supabase.from("venue_reviews").insert([row]);
  if (error) throw error;
}

// --- Front-end

const ISSUES_LABEL_YES =
  "📝 Describe issues, damages or incidents";
const ISSUES_LABEL_NO =
  "📝 Optional notes (only if you want to add something for the record)";
const PLACEHOLDER_YES = "Describe any issues, damages or incidents…";
const PLACEHOLDER_NO =
  "You can leave this empty. Add any extra notes about the venue check if you wish.";

const HINT_YES =
  "Required: describe issues, damages or incidents. Admin is notified when you submit.";
const HINT_NO =
  "Optional: add anything you want on record. You can leave this empty.";

function lockVenueReviewForm(form, submitBtn) {
  try {
    const controls = form.querySelectorAll("input, textarea, button, select");
    controls.forEach(function (el) {
      try {
        el.disabled = true;
      } catch (_) {}
    });
  } catch (_) {}
  try {
    form.setAttribute("aria-disabled", "true");
    form.style.pointerEvents = "none";
    form.style.opacity = "0.7";
  } catch (_) {}
  if (submitBtn) {
    try {
      submitBtn.textContent = "Submitted";
    } catch (_) {}
  }
}

function showVenueReviewSuccessLocked() {
  var el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = "Venue report submitted successfully. Returning to your dashboard…";
  el.style.cssText =
    "position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:99999;" +
    "padding:16px 22px;background:#173247;color:#fff;border-radius:14px;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.22);font:600 15px system-ui,-apple-system,sans-serif;" +
    "max-width:min(440px,calc(100vw - 28px));text-align:center;line-height:1.35;";
  try {
    document.body.appendChild(el);
  } catch (_) {}
}

function venueReviewDashboardReturnUrl() {
  try {
    var ret = new URLSearchParams(location.search).get("return");
    if (ret) {
      var ru = new URL(ret, location.href);
      if (ru.protocol === "http:" || ru.protocol === "https:") return ru.href;
    }
  } catch (_) {}
  try {
    if (typeof window.portalFormComputeReturnTarget === "function") {
      return window.portalFormComputeReturnTarget();
    }
  } catch (_) {}
  try {
    var rp = new URLSearchParams(location.search).get("rp");
    if (rp && /\.html(\?|$)/i.test(rp)) return new URL(rp, location.href).href;
  } catch (_) {}
  return new URL("staff_dashboard.html", location.href).href;
}

function showCompletionPopupAndReturnDashboard() {
  showVenueReviewSuccessLocked();
  var dest = venueReviewDashboardReturnUrl();
  window.setTimeout(function () {
    try {
      window.location.assign(dest);
    } catch (_) {
      window.location.href = dest;
    }
  }, 1600);
}

async function renderVenueContextHeader(ctx) {
  const completedByEl = document.getElementById("venueContextCompletedBy");
  const venueEl = document.getElementById("venueContextVenue");
  const dateEl = document.getElementById("venueContextDate");
  const kindEl = document.getElementById("venueContextKind");
  if (!completedByEl || !venueEl || !dateEl) return;

  const fallbackName = clean(ctx.completedBy) || "Portal user";
  const venue = clean(ctx.venue) || "Venue not detected";
  const date = toUkDisplayDate(parseReviewDate(ctx.date));
  const kindLabel = clean(ctx.openingClosing) || "";

  completedByEl.textContent = fallbackName;
  venueEl.textContent = venue;
  dateEl.textContent = date;
  if (kindEl) {
    const kindRow = document.getElementById("venueContextKindRow");
    if (kindLabel) {
      kindEl.textContent = kindLabel;
      if (kindRow) kindRow.removeAttribute("hidden");
    } else {
      kindEl.textContent = "—";
      if (kindRow) kindRow.setAttribute("hidden", "hidden");
    }
  }

  try {
    const submission = await resolveSubmissionContext(ctx);
    const resolvedName = clean(submission && submission.submittedByName);
    if (resolvedName) completedByEl.textContent = resolvedName;
  } catch (_) {}
}

function setAutomaticTime() {
  const now = new Date();
  const timeEl = document.getElementById("time");
  const timeContextEl = document.getElementById("venueContextTime");
  const h = now.getHours();
  const min = now.getMinutes();
  const hhmm = (h < 10 ? "0" : "") + h + ":" + (min < 10 ? "0" : "") + min;
  if (timeEl) timeEl.value = hhmm;
  if (timeContextEl) timeContextEl.textContent = hhmm;
}

function updateNoButtonText(btnNo) {
  if (!btnNo) return;
  // Only update the text label so the pill icon (SVG) is preserved.
  const label = btnNo.querySelector(".venue-issue-pill-label");
  if (label) label.textContent = "No";
  else btnNo.textContent = "No";
}

function initVenueReviewPage() {
  const form = document.getElementById("form");
  const backBtn = document.getElementById("venueReviewBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var dest = venueReviewDashboardReturnUrl();
      try {
        window.location.assign(dest);
      } catch (_) {
        window.location.href = dest;
      }
    });
  }
  const btnNo = document.getElementById("btnNoReady");
  const btnYes =
    document.getElementById("btnYesIssues") ||
    document.querySelector(".btn.yes");
  const issuesCell = document.getElementById("issuesCell");
  const issuesInput = document.getElementById("issues");
  const issuesLabel = document.getElementById("issuesLabel");
  const venueNotesPanel = document.getElementById("venueNotesPanel");
  const venueNotesHint = document.getElementById("venueNotesHint");
  if (!form || !btnNo || !btnYes || !issuesCell || !issuesInput || !issuesLabel)
    return;

  setAutomaticTime();
  try {
    window.setInterval(setAutomaticTime, 15000);
  } catch (_) {}
  updateNoButtonText(btnNo);
  const ctx = contextFromQuery();
  renderVenueContextHeader(ctx);
  void portalBindVenueReviewVoice(ctx);
  const walkthrough = initVenueWalkthroughRecorder(ctx);

  function getIssueMode() {
    const m = clean(form.dataset.issueMode || "").toLowerCase();
    if (m === "yes" || m === "no") return m;
    return "";
  }

  function applyNoPath() {
    form.dataset.issueMode = "no";
    btnNo.classList.add("selected");
    btnNo.setAttribute("aria-pressed", "true");
    btnYes.classList.remove("selected");
    btnYes.setAttribute("aria-pressed", "false");
    issuesCell.classList.add("visible");
    issuesLabel.textContent = ISSUES_LABEL_NO;
    issuesInput.placeholder = PLACEHOLDER_NO;
    issuesInput.removeAttribute("required");
    if (venueNotesPanel) {
      venueNotesPanel.classList.remove("venue-notes-panel--yes");
      venueNotesPanel.setAttribute("aria-hidden", "false");
    }
    if (venueNotesHint) {
      venueNotesHint.textContent = HINT_NO;
      venueNotesHint.hidden = false;
    }
  }

  function applyYesPath() {
    form.dataset.issueMode = "yes";
    btnYes.classList.add("selected");
    btnYes.setAttribute("aria-pressed", "true");
    btnNo.classList.remove("selected");
    btnNo.setAttribute("aria-pressed", "false");
    issuesCell.classList.add("visible");
    issuesLabel.textContent = ISSUES_LABEL_YES;
    issuesInput.placeholder = PLACEHOLDER_YES;
    issuesInput.setAttribute("required", "required");
    if (venueNotesPanel) {
      venueNotesPanel.classList.add("venue-notes-panel--yes");
      venueNotesPanel.setAttribute("aria-hidden", "false");
    }
    if (venueNotesHint) {
      venueNotesHint.textContent = HINT_YES;
      venueNotesHint.hidden = false;
    }
    try {
      issuesInput.focus();
    } catch (_) {}
    try {
      venueNotesPanel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (_) {}
  }

  btnNo.addEventListener("click", function () {
    applyNoPath();
  });

  btnYes.addEventListener("click", function () {
    applyYesPath();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const issueMode = getIssueMode();
    const ctxNow = contextFromQuery();
    const submitBtn = form.querySelector(".submit-btn");

    if (!issueMode) {
      alert(
        'Please tap "No" or "Yes" to say whether there is anything to report.'
      );
      return;
    }

    if (issueMode === "yes") {
      const t = clean(issuesInput.value);
      if (!t) {
        try {
          venueNotesPanel?.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (_) {}
        try {
          issuesInput.focus();
        } catch (_) {}
        alert("Please describe the issues, damages or incidents.");
        return;
      }
    }

    if (walkthrough.required && !walkthrough.hasBlob()) {
      try {
        document.getElementById("venueWalkthroughPanel")?.scrollIntoView({
          block: "center",
          behavior: "smooth"
        });
      } catch (_) {}
      alert("Please record the venue walkthrough video before submitting.");
      return;
    }

    let submission = null;
    let submissionErr = null;
    try {
      submission = await resolveSubmissionContext(ctxNow);
    } catch (err) {
      submissionErr = err;
      submission = null;
    }
    if (!submission) {
      if (submissionErr) console.error(submissionErr);
      alert(
        "Could not load the submission module for this form. Refresh the page and try again."
      );
      return;
    }
    if (walkthrough.required && !clean(submission.submittedByUserId)) {
      alert("Sign in is required to submit the walkthrough video with this venue report.");
      return;
    }

    const formState = {
      time: form.time.value,
      issueMode,
      issuesReported: issuesInput.value
    };

    if (submitBtn) submitBtn.disabled = true;
    var successSubmitted = false;
    try {
      if (walkthrough.required) {
        const up = await uploadVenueWalkthroughVideo(
          submission.supabase,
          submission,
          ctxNow,
          walkthrough
        );
        formState.videoStoragePath = up.path;
        formState.videoMimeType = up.mime;
        formState.videoDurationSec = up.durationSec;
      }
      const row = buildVenueReviewRow(ctxNow, formState, submission);
      await submitVenueReviewToSupabase(submission.supabase, row);
      successSubmitted = true;
      try {
        walkthrough.stopAll();
      } catch (_) {}
      markVenueReportDoneLocal(row, ctxNow);
      showVenueReviewSuccessLocked();
      lockVenueReviewForm(form, submitBtn);
      showCompletionPopupAndReturnDashboard();
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? String(err.message) : "";
      alert("Submission failed. Please try again." + (msg ? "\n" + msg : ""));
    } finally {
      if (submitBtn && !successSubmitted) submitBtn.disabled = false;
    }
  });
}

async function portalBindVenueReviewVoice(ctx) {
  if (typeof window === "undefined" || typeof window.PortalFeedbackVoiceInput === "undefined") {
    return;
  }
  let staffName = clean((ctx && ctx.completedBy) || "");
  try {
    const submission = await resolveSubmissionContext(ctx);
    staffName = clean(submission && submission.submittedByName) || staffName;
  } catch (_) {}
  window.PortalFeedbackVoiceInput.init({
    fields: ["issues"],
    staffName,
  });
}

function bootVenueReview() {
  try {
    initVenueReviewPage();
  } catch (err) {
    console.error("venue_review init failed:", err);
    try {
      alert(
        "Venue review could not start. Try refreshing the page. If it persists, contact support."
      );
    } catch (_) {}
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootVenueReview, { once: true });
} else {
  bootVenueReview();
}
