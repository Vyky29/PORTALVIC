/**
 * Lead Feedback Report — simplified standalone form.
 * Inserts into public.lead_session_reports via Supabase (same row shape as before).
 */

const PORTAL_AUTH_MODULE =
  "https://www.clubsensational.org/wp-content/uploads/2026/05/auth-handler.js?v=20260419-99";
const PORTAL_CLIENTS_INFO_SCRIPT =
  "https://www.clubsensational.org/wp-content/uploads/2026/05/clients_info_embed.js?v=20260419-99";

const qs = new URLSearchParams(typeof location !== "undefined" ? location.search || "" : "");

/** Set true only after submit listener is registered (so file:// + fast click still sees a handler). */
try {
  if (typeof window !== "undefined") window.__LR_FEEDBACK_MODULE_READY = false;
} catch (_) {}

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadPortalScriptOnceLead(src) {
  return new Promise((resolve, reject) => {
    const nodes = document.getElementsByTagName("script");
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].src === src) {
        resolve();
        return;
      }
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load failed: " + src));
    document.head.appendChild(s);
  });
}

function getPortalClientNamesSorted() {
  const rows = Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS) ? window.PORTAL_CLIENTS_INFO_ROWS : [];
  const map = new Map();
  rows.forEach((r) => {
    const nm = String(r && r.client_name != null ? r.client_name : "").trim();
    if (nm) map.set(nm.toLowerCase(), nm);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function wireBespokeParticipantAutocomplete() {
  const input = document.getElementById("lrBespokeParticipant");
  const list = document.getElementById("lrBespokeSuggest");
  if (!input || !list) return;

  let blurTimer = null;
  function setOpen(open) {
    list.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function closeList() {
    setOpen(false);
    list.replaceChildren();
  }
  function pickName(name) {
    input.value = name;
    closeList();
    try {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {}
    try {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_) {}
  }
  function renderList(query) {
    const q = String(query || "").trim();
    list.replaceChildren();
    if (q.length < 1) {
      setOpen(false);
      return;
    }
    const ql = q.toLowerCase();
    const all = getPortalClientNamesSorted();
    const matches = all.filter((n) => n.toLowerCase().includes(ql)).slice(0, 18);
    if (!matches.length) {
      setOpen(false);
      return;
    }
    matches.forEach((name, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.role = "option";
      b.id = "lrBespokeSuggestOpt-" + idx;
      b.textContent = name;
      b.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        pickName(name);
      });
      list.appendChild(b);
    });
    setOpen(true);
  }

  input.addEventListener("input", () => {
    clearTimeout(blurTimer);
    renderList(input.value);
  });
  input.addEventListener("focus", () => {
    renderList(input.value);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closeList();
      return;
    }
    if (ev.key !== "Enter") return;
    const first = list.querySelector("button");
    if (first && !list.hidden) {
      ev.preventDefault();
      pickName(first.textContent || "");
    }
  });
  input.addEventListener("blur", () => {
    blurTimer = setTimeout(() => closeList(), 160);
  });
  document.addEventListener("click", (ev) => {
    const wrap = document.getElementById("lrBespokeComboWrap");
    if (wrap && !wrap.contains(ev.target)) closeList();
  });
}

function contextFromQuery() {
  let origin = clean(qs.get("origin") || "dashboard");
  if (origin !== "this_week" && origin !== "term" && origin !== "dashboard") origin = "dashboard";
  return {
    date: clean(qs.get("date") || ""),
    service: clean(qs.get("service") || ""),
    venue: clean(qs.get("venue") || qs.get("location") || ""),
    role: clean(qs.get("role") || qs.get("leadRole") || qs.get("staffRole") || ""),
    clientName: clean(qs.get("name") || qs.get("clientName") || qs.get("client") || ""),
    completedBy: clean(
      qs.get("completedBy") ||
        qs.get("worker") ||
        qs.get("staffName") ||
        qs.get("openedBy") ||
        qs.get("instructor") ||
        qs.get("leadName") ||
        ""
    ),
    portalSessionKey: clean(qs.get("sessionKey") || ""),
    clientId: clean(qs.get("clientId") || qs.get("client_id") || ""),
    sessionTime: clean(qs.get("time") || qs.get("sessionTime") || ""),
    origin
  };
}

/** DB needs a session_date; if nothing in URL/sessionKey, use local today (not shown in Session Context unless sourced). */
function initContextDateForSubmit(ctx) {
  if (!ctx.date) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    ctx.date = `${yyyy}-${mm}-${dd}`;
    ctx._dateWasFallback = true;
  } else {
    ctx._dateWasFallback = false;
  }
}

function enrichContextFromSessionKey(ctx) {
  const sk = clean(ctx.portalSessionKey);
  if (!sk) return;
  const parts = sk.split("|");
  const seg0 = clean(parts[0] || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(seg0)) {
    const explicitDate = clean(qs.get("date") || "");
    if (!explicitDate) ctx.date = seg0;
  }
  if (parts.length >= 2) {
    const slot = clean(parts[1]);
    if (slot && !clean(ctx.sessionTime)) ctx.sessionTime = slot;
  }
}

function isBespokeProgramme(service) {
  return /^bespoke\s*programme$/i.test(clean(service));
}

function parseSessionDate(iso) {
  const s = clean(iso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sessionDateDisplayLong(iso) {
  const s = clean(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const parts = s.split("-").map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return "";
  const weekday = dt.toLocaleDateString("en-GB", { weekday: "long" });
  const monthName = dt.toLocaleDateString("en-GB", { month: "long" });
  const v = d % 100;
  let ordDay;
  if (v >= 11 && v <= 13) ordDay = d + "th";
  else {
    const last = d % 10;
    if (last === 1) ordDay = d + "st";
    else if (last === 2) ordDay = d + "nd";
    else if (last === 3) ordDay = d + "rd";
    else ordDay = d + "th";
  }
  return `${weekday} ${ordDay} ${monthName} ${y}`;
}

/** Session Context date line whenever we have a resolved YYYY-MM-DD (including submit fallback). */
function displayDateLineForContext(ctx) {
  const iso = clean(ctx.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return sessionDateDisplayLong(iso) || iso;
  return "";
}

function normalizeLeadName(name) {
  const n = clean(name).toLowerCase();
  if (n.includes("john")) return "John";
  if (n.includes("berta")) return "Berta";
  return "";
}

function deriveServiceForLead(name, isoDate, currentService) {
  const leadName = normalizeLeadName(name);
  if (leadName === "Berta") return "Multi-Activity";
  if (leadName === "John") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const parts = isoDate.split("-").map(Number);
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = dt.getDay(); // 0=Sun,1=Mon,...6=Sat
      if (day === 1 || day === 3 || day === 5) return "Bespoke Programme";
    }
    return "Multi-Activity";
  }
  const fromCtx = clean(currentService);
  return fromCtx || "Multi-Activity";
}

function normalizeVenue(value) {
  const v = clean(value).toLowerCase();
  if (v.includes("swim")) return "SwimFarm";
  if (v.includes("acton")) return "Acton";
  return "Acton";
}

function ensureSessionTime(value) {
  const v = clean(value);
  if (v) return v;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function applyLeadContextRules(ctx) {
  ctx.clientName = "";
  ctx.role = "Lead";
  const leadName = normalizeLeadName(ctx.completedBy);
  if (leadName) ctx.completedBy = leadName;
  ctx.service = deriveServiceForLead(ctx.completedBy, clean(ctx.date), ctx.service);
  ctx.venue = normalizeVenue(ctx.venue);
  ctx.sessionTime = clean(ctx._openedAtTime) || ensureSessionTime(ctx.sessionTime);
}

function applySessionContextDisplay(ctx) {
  function set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "";
  }
  set("ctxParticipant", "");
  set("ctxService", clean(ctx.service));
  set("ctxVenue", clean(ctx.venue));
  set("ctxDate", displayDateLineForContext(ctx));
  set("ctxTime", clean(ctx.sessionTime));
  set("ctxRole", "Lead");
  set("ctxInstructor", clean(ctx.completedBy));
}

function getCheckedSessionTypeValue() {
  const formEl = document.getElementById("feedbackForm");
  if (!formEl) return "";
  return String(new FormData(formEl).get("sessionType") || "").trim();
}

function syncSessionPills() {
  const formEl = document.getElementById("feedbackForm");
  if (!formEl) return;
  const selected = (new FormData(formEl).get("sessionType") || "").toString();
  document.querySelectorAll("label.pill.lr-session-pill").forEach((p) => {
    const val = p.getAttribute("data-value") || "";
    p.classList.toggle("isSelected", val === selected);
  });
}

function syncBespokeSessionUi() {
  const field = document.getElementById("lrBespokeParticipantField");
  const inp = document.getElementById("lrBespokeParticipant");
  if (!field) return;
  const bespoke = getCheckedSessionTypeValue() === "bespoke";
  if (!bespoke && inp) inp.value = "";
  field.setAttribute("aria-hidden", bespoke ? "false" : "true");
  if (inp) inp.required = bespoke;
}

function syncEngagementPills() {
  const formEl = document.getElementById("feedbackForm");
  if (!formEl) return;
  const selected = (new FormData(formEl).get("engagement") || "").toString();
  document.querySelectorAll(".pill.eng").forEach((p) => {
    const val = p.getAttribute("data-value") || "";
    p.classList.toggle("isSelected", val === selected);
  });
}

async function resolveAuthContext() {
  const { getSupabaseClient } = await import(PORTAL_AUTH_MODULE);
  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData || !authData.user || !authData.user.id) return null;
  const uid = String(authData.user.id).trim();
  const { data: profileRow, error: profileErr } = await supabase
    .from("staff_profiles")
    .select("full_name, username")
    .eq("id", uid)
    .maybeSingle();
  if (profileErr || !profileRow) return null;
  const submittedByName = clean(profileRow.full_name || profileRow.username || "");
  if (!submittedByName) return null;
  return {
    supabase,
    submittedByUserId: uid,
    submittedByName
  };
}

async function hydrateInstructorFromProfile(ctx) {
  try {
    const auth = await resolveAuthContext();
    if (auth && clean(auth.submittedByName)) ctx.completedBy = clean(auth.submittedByName) || ctx.completedBy;
  } catch (_) {
    /* ignore */
  }
}

function buildLeadSessionReportRow(ctx, data, summaryText, auth) {
  const engagement = (data.get("engagement") || "").toString();
  const brief = (data.get("brief") || "").toString();
  const other = (data.get("other") || "").toString();
  const incidents = (data.get("incidents") || "").toString();
  const sessionType = (data.get("sessionType") || "").toString();
  const bespokePick = clean(data.get("bespokeParticipant") || data.get("bespokeClient") || "");
  const isBespokeSession = sessionType === "bespoke";
  const cname = clean(ctx.clientName);
  const clientNameOut =
    isBespokeSession ? bespokePick || cname || null : cname || null;
  return {
    submitted_by_user_id: auth.submittedByUserId,
    submitted_by_name: auth.submittedByName,
    session_date: parseSessionDate(ctx.date),
    session_time: clean(ctx.sessionTime) || null,
    portal_session_key: clean(ctx.portalSessionKey) || null,
    client_id: clean(ctx.clientId) || null,
    client_name: clientNameOut,
    service: clean(ctx.service) || "Not specified",
    is_bespoke_programme: isBespokeSession,
    engagement: clean(engagement),
    brief_description: clean(brief),
    other_information: clean(other) || null,
    incidents: clean(incidents),
    summary_text: clean(summaryText),
    origin: ctx.origin || "dashboard"
  };
}

async function submitLeadReportToSupabase(supabase, row) {
  const { error } = await supabase.from("lead_session_reports").insert([row]);
  if (error) throw error;
}

function buildSummaryText(ctx, data) {
  const engagement = (data.get("engagement") || "").toString();
  const brief = (data.get("brief") || "").toString();
  const other = (data.get("other") || "").toString();
  const incidents = (data.get("incidents") || "").toString();
  const sessionType = (data.get("sessionType") || "").toString();
  const bespokePick = clean(data.get("bespokeParticipant") || "");
  const sessionLabel =
    sessionType === "bespoke" ? "Bespoke Programme" : sessionType === "group" ? "Group Session" : sessionType;
  const part = sessionType === "bespoke" && bespokePick ? `\n\nClient:\n${bespokePick}` : "";
  return [
    "Session Feedback",
    "",
    `Date (ISO): ${clean(ctx.date)}`,
    `Activity: ${clean(ctx.service)}`,
    `Session: ${sessionLabel}${part}`,
    `Engagement: ${engagement}`,
    "",
    "Brief:",
    brief,
    "",
    "Other:",
    other,
    "",
    `Incidents: ${incidents}`
  ].join("\n");
}

function showLeadFeedbackSuccessBanner() {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent =
    "Session feedback submitted successfully. Please close this window.";
  el.style.cssText =
    "position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:99999;" +
    "padding:16px 22px;background:#173247;color:#fff;border-radius:14px;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.22);font:600 15px system-ui,-apple-system,sans-serif;" +
    "max-width:min(440px,calc(100vw - 28px));text-align:center;line-height:1.35;";
  try {
    document.body.appendChild(el);
  } catch (_) {}
}

function showLeadFeedbackCompletionPopupAndExit() {
  try {
    alert("Session feedback submitted successfully.");
  } catch (_) {}
  try {
    exitAfterLeadFeedbackSuccess();
  } catch (_) {}
}

function exitAfterLeadFeedbackSuccess() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "PORTAL_LEAD_FEEDBACK_DONE",
          source: "lead_feedback_report",
          ok: true
        },
        typeof location !== "undefined" ? location.origin : "*"
      );
    }
  } catch (_) {}
  /* Local disk: do not replace location or portal hooks — stay on the page after success. */
  if (typeof location !== "undefined" && location.protocol === "file:") {
    return;
  }
  try {
    if (typeof window.portalRedirectToPortalReturn === "function") {
      window.portalRedirectToPortalReturn();
      return;
    }
  } catch (_) {}
  try {
    const u = typeof window.portalGetPortalReturnUrl === "function" ? window.portalGetPortalReturnUrl() : "";
    if (clean(u)) {
      window.location.replace(u);
      return;
    }
  } catch (_) {}
  try {
    window.close();
  } catch (_) {}
}

async function initLeadFeedbackReportPage() {
  const ctx = contextFromQuery();
  enrichContextFromSessionKey(ctx);
  initContextDateForSubmit(ctx);
  ctx._openedAtTime = ensureSessionTime("");
  applyLeadContextRules(ctx);

  const form = document.getElementById("feedbackForm");
  const clearBtn = document.getElementById("clearBtn");
  const incidentNote = document.getElementById("incidentNote");
  const submitBtn = document.getElementById("submitBtn");
  const bespokeParticipantInp = document.getElementById("lrBespokeParticipant");

  if (!form || !clearBtn || !incidentNote || !submitBtn) return;

  function updateIncidentNote() {
    const v = (new FormData(form).get("incidents") || "").toString();
    incidentNote.style.display = v === "Yes" ? "block" : "none";
  }

  function prefillBespokeFromQuery() {
    if (!bespokeParticipantInp) return;
    const hint = clean(qs.get("participant") || qs.get("bespokeParticipant") || "");
    if (hint) bespokeParticipantInp.value = hint;
    if (hint) {
      const r = form.querySelector('input[name="sessionType"][value="bespoke"]');
      if (r) r.checked = true;
      syncSessionPills();
      syncBespokeSessionUi();
    }
  }

  form.addEventListener("change", (e) => {
    if (e.target && e.target.name === "incidents") updateIncidentNote();
    if (e.target && e.target.name === "engagement") syncEngagementPills();
    if (e.target && e.target.name === "sessionType") {
      syncSessionPills();
      syncBespokeSessionUi();
    }
  });

  form.addEventListener("click", (e) => {
    const lab = e.target && e.target.closest ? e.target.closest("label.lr-session-pill") : null;
    if (!lab || !form.contains(lab)) return;
    window.setTimeout(function () {
      syncSessionPills();
      syncBespokeSessionUi();
    }, 0);
  });

  clearBtn.addEventListener("click", () => {
    form.reset();
    incidentNote.style.display = "none";
    syncEngagementPills();
    syncSessionPills();
    syncBespokeSessionUi();
    void hydrateInstructorFromProfile(ctx).then(() => {
      applyLeadContextRules(ctx);
      applySessionContextDisplay(ctx);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fdPeek = new FormData(form);
    const stPeek = (fdPeek.get("sessionType") || "").toString();
    if (!stPeek) {
      alert('Please select "Group Session" or "Bespoke Programme".');
      return;
    }
    if (stPeek === "bespoke" && !clean(fdPeek.get("bespokeParticipant") || fdPeek.get("bespokeClient"))) {
      alert("Please enter the participant name for Bespoke Programme.");
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    let auth = null;
    try {
      auth = await resolveAuthContext();
    } catch (_) {
      auth = null;
    }
    if (!auth) {
      alert("Please sign in to submit session feedback.");
      return;
    }

    await hydrateInstructorFromProfile(ctx);
    applyLeadContextRules(ctx);
    applySessionContextDisplay(ctx);

    const data = new FormData(form);
    const summaryText = buildSummaryText(ctx, data);
    const row = buildLeadSessionReportRow(ctx, data, summaryText, auth);

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting";

    try {
      await submitLeadReportToSupabase(auth.supabase, row);
      showLeadFeedbackSuccessBanner();
      try {
        form.reset();
        incidentNote.style.display = "none";
        syncEngagementPills();
        syncSessionPills();
        syncBespokeSessionUi();
      } catch (_) {}
      showLeadFeedbackCompletionPopupAndExit();
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? String(err.message) : "";
      alert("Submission failed. Please try again." + (msg ? "\n" + msg : ""));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });

  try {
    if (typeof window !== "undefined") window.__LR_FEEDBACK_MODULE_READY = true;
  } catch (_) {}

  applySessionContextDisplay(ctx);
  await hydrateInstructorFromProfile(ctx);
  applyLeadContextRules(ctx);
  applySessionContextDisplay(ctx);

  prefillBespokeFromQuery();

  const wireAutocomplete = () => {
    try {
      wireBespokeParticipantAutocomplete();
    } catch (_) {}
  };
  if (Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS) && window.PORTAL_CLIENTS_INFO_ROWS.length) {
    wireAutocomplete();
  } else {
    loadPortalScriptOnceLead(PORTAL_CLIENTS_INFO_SCRIPT).then(wireAutocomplete).catch(wireAutocomplete);
  }

  syncSessionPills();
  syncBespokeSessionUi();
  syncEngagementPills();
  updateIncidentNote();
}

void initLeadFeedbackReportPage();
