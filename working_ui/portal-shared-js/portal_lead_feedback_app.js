/**
 * Lead session report form (portal-lead-feedback.html) — wires lr* fields to lead_session_reports.
 */
const PORTAL_AUTH_MODULE = "/portal/auth-handler.js?v=20260616-lead-report-shell";
const PORTAL_CLIENTS_SCRIPT = "/portal/clients_info_embed.js?v=20260609-autofill";
const PORTAL_AUTOCOMPLETE_SCRIPT = "/portal-shared-js/portal_field_autocomplete.js?v=20260609-autofill";
const PORTAL_CATALOG_SCRIPT = "/portal-shared-js/participant_services.js?v=20260609-autofill";
const PORTAL_ROSTER_BUNDLE = "/portal/staff_dashboard_spreadsheet_bundle.js?v=20260609-luliya-photo";
const PORTAL_LEAD_SCOPE_MODULE = "/portal/portal_lead_session_scope.js?v=20260610-lead-report";

const LEAD_SERVICES = [
  "Bespoke Programme",
  "Day Centre",
  "Multi-Activity",
  "Aquatic Group Activity",
  "Parents & Babys",
];

const qs = new URLSearchParams(typeof location !== "undefined" ? location.search || "" : "");

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBespokeService(service) {
  return /bespoke/i.test(clean(service));
}

function isDayCentreService(service) {
  return /day\s*centre/i.test(clean(service));
}

function isMultiActivityService(service) {
  return /^multi-activity$/i.test(clean(service));
}

/** Programme-lead report uses one session band per service/day (Day Centre keeps roster slots). */
function leadReportFixedSessionTime(iso, service) {
  const wd = weekdayLongFromIso(iso);
  const svc = clean(service);
  if (!wd || !svc) return "";
  if (isMultiActivityService(svc)) {
    if (wd === "Sunday") return "9.15 to 2.15";
    if (wd === "Wednesday") return "4.15 to 6.15";
  }
  if (
    isBespokeService(svc) &&
    (wd === "Monday" || wd === "Wednesday" || wd === "Friday")
  ) {
    return "4.15 to 6.15";
  }
  return "";
}

function isGroupService(service) {
  return !isBespokeService(service) && !isDayCentreService(service);
}

function leadServiceMode(service) {
  const svc = clean(service);
  if (!svc) return "none";
  if (isBespokeService(svc)) return "bespoke";
  if (isDayCentreService(svc)) return "dayCentre";
  return "group";
}

function setLeadSectionVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  if (visible) {
    el.removeAttribute("aria-hidden");
    el.classList.remove("lr-service-section--off");
  } else {
    el.setAttribute("aria-hidden", "true");
    el.classList.add("lr-service-section--off");
  }
}

function mapStarEngagement(rating) {
  const n = Number(rating);
  if (!n || n < 1) return "";
  if (n <= 2) return "Very low";
  if (n === 3) return "Mixed";
  if (n === 4) return "Good";
  return "Excellent";
}

function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function sessionDateDisplayLong(iso) {
  const s = clean(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const parts = s.split("-").map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(dt.getTime())) return s;
  const weekday = dt.toLocaleDateString("en-GB", { weekday: "long" });
  const monthName = dt.toLocaleDateString("en-GB", { month: "long" });
  const day = parts[2];
  const v = day % 100;
  let ord = `${day}th`;
  if (v < 11 || v > 13) {
    const last = day % 10;
    if (last === 1) ord = `${day}st`;
    else if (last === 2) ord = `${day}nd`;
    else if (last === 3) ord = `${day}rd`;
  }
  return `${weekday} ${ord} ${monthName} ${parts[0]}`;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const nodes = document.getElementsByTagName("script");
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].src && nodes[i].src.indexOf(src.split("?")[0]) >= 0) {
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

function weekdayLongFromIso(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const p = s.split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normNameKey(v) {
  return clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function servicesEquivalent(a, b) {
  const x = normNameKey(a).replace(/[^a-z0-9]+/g, "");
  const y = normNameKey(b).replace(/[^a-z0-9]+/g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes("bespoke") && y.includes("bespoke")) return true;
  if (x.includes("daycentre") && y.includes("daycentre")) return true;
  if (x.includes("multi") && y.includes("multi")) return true;
  if (x.includes("aquatic") && y.includes("aquatic")) return true;
  if (x.includes("parent") && y.includes("parent")) return true;
  return false;
}

function rosterRowSessionDate(r) {
  return String(r.session_date || r.date || "")
    .trim()
    .slice(0, 10);
}

function isRosterClientName(nm) {
  const n = clean(nm).toLowerCase();
  return n && n !== "closed" && n !== "available" && n !== "no client";
}

function rosterRowAppliesOnDate(rosterRows, r, isoDate, wd) {
  if (clean(r.day) !== wd) return false;
  const sd = rosterRowSessionDate(r);
  if (sd) return sd === isoDate;
  const cid = slugify(r.client_name);
  if (!cid) return true;
  for (let i = 0; i < rosterRows.length; i++) {
    const o = rosterRows[i];
    if (rosterRowSessionDate(o) !== isoDate) continue;
    if (clean(o.day) !== wd) continue;
    if (slugify(o.client_name) === cid) return false;
  }
  return true;
}

function parseInstructorList(raw) {
  const out = [];
  String(raw || "")
    .split(/[,;/&]+|\band\b/gi)
    .forEach((part) => {
      const p = clean(part);
      if (p) out.push(p);
    });
  return out;
}

function parseHmPortal(token) {
  const t = String(token || "").trim();
  const parts = t.split(".");
  const h = parseInt(parts[0], 10) || 0;
  const m = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
  return { h, m };
}

function hourTo24Portal(hour, day) {
  if (day !== "Sunday" && hour < 8) return hour + 12;
  if (day === "Sunday" && hour >= 1 && hour <= 3) return hour + 12;
  return hour;
}

function parseTimeSlotPortal(timeSlot, day) {
  const normalized = String(timeSlot || "")
    .replace(/\s*-\s*/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = normalized.split(/\s+to\s+/i);
  if (parts.length < 2) return { start: "", end: "" };
  const a = parseHmPortal(parts[0]);
  const b = parseHmPortal(parts[1]);
  const ah = hourTo24Portal(a.h, day);
  const bh = hourTo24Portal(b.h, day);
  return {
    start: String(ah).padStart(2, "0") + ":" + String(a.m).padStart(2, "0"),
    end: String(bh).padStart(2, "0") + ":" + String(b.m).padStart(2, "0"),
  };
}

function rosterRowToLeadSlot(iso, wd, r) {
  return {
    iso,
    session_date: iso,
    day: wd,
    client_name: clean(r.client_name),
    service: clean(r.service),
    time_slot: clean(r.time_slot),
    venue: clean(r.venue),
    area: clean(r.area),
    instructors: parseInstructorList(r.instructors),
    instructor_label: clean(r.instructors),
  };
}

function buildLeadSessionKey(slot) {
  const iso = slot.session_date;
  const id = slugify(slot.client_name);
  if (!iso || !id) return "";
  const svc = clean(slot.service).toLowerCase();
  if (svc.indexOf("day centre") !== -1) return `${iso}|${id}|day_centre`;
  if (svc.indexOf("bespoke") !== -1) {
    const inst = slot.instructors || [];
    if (inst.length >= 2 && clean(slot.venue).toLowerCase() === "swimfarm") {
      return `${iso}|${id}|bespoke_shared`;
    }
  }
  const t = parseTimeSlotPortal(slot.time_slot, slot.day).start;
  if (t) return `${iso}|${t}|${id}`;
  return `${iso}|${id}`;
}

function expandLeadSlots(iso, serviceFilter, scopeFns) {
  const src = window.STAFF_DASHBOARD_SOURCE;
  const rows = src && Array.isArray(src.rows) ? src.rows : [];
  const wd = weekdayLongFromIso(iso);
  if (!wd) return [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    if (!isRosterClientName(r.client_name)) continue;
    if (!rosterRowAppliesOnDate(rows, r, iso, wd)) continue;
    const slot = rosterRowToLeadSlot(iso, wd, r);
    if (serviceFilter && !servicesEquivalent(slot.service, serviceFilter)) continue;
    if (scopeFns && typeof scopeFns.slotScopeFilter === "function") {
      if (!scopeFns.slotScopeFilter(slot)) continue;
    }
    out.push(slot);
  }
  out.sort(
    (a, b) =>
      (a.time_slot || "").localeCompare(b.time_slot || "", "en") ||
      (a.client_name || "").localeCompare(b.client_name || "", "en", { sensitivity: "base" })
  );
  return out;
}

function participantServicesOnDate(iso, participantName, scopeFns) {
  const want = normNameKey(participantName);
  if (!want) return [];
  const seen = new Set();
  const out = [];
  expandLeadSlots(iso, null, scopeFns).forEach((s) => {
    if (normNameKey(s.client_name) !== want) return;
    const svc = clean(s.service);
    if (!svc || seen.has(normNameKey(svc))) return;
    seen.add(normNameKey(svc));
    out.push(svc);
  });
  return out.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function uniqueParticipantNames(slots) {
  const map = new Map();
  slots.forEach((s) => {
    const nm = clean(s.client_name);
    if (nm) map.set(normNameKey(nm), nm);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

async function resolveAuthContext() {
  const { getSupabaseClient } = await import(PORTAL_AUTH_MODULE);
  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user?.id) return null;
  const uid = String(authData.user.id).trim();
  const { data: profileRow, error: profileErr } = await supabase
    .from("staff_profiles")
    .select("full_name, username, app_role, staff_role")
    .eq("id", uid)
    .maybeSingle();
  if (profileErr || !profileRow) return null;
  const submittedByName = clean(profileRow.full_name || profileRow.username || "");
  if (!submittedByName) return null;
  const { data: userData } = await supabase.auth.getUser();
  const authEmail = userData?.user?.email || "";
  return { supabase, submittedByUserId: uid, submittedByName, profile: profileRow, authEmail };
}

function getClientNames() {
  const rows = Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS) ? window.PORTAL_CLIENTS_INFO_ROWS : [];
  const map = new Map();
  rows.forEach((r) => {
    const nm = clean(r && r.client_name);
    if (nm) map.set(nm.toLowerCase(), nm);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function wireNameSuggest(input, listEl, getNames) {
  if (!input || !listEl) return;
  if (typeof window.portalWireFieldSuggest === "function") {
    window.portalWireFieldSuggest(input, listEl, {
      kind: "participant",
      strict: true,
      match: "startsWith",
      getNames: typeof getNames === "function" ? getNames : undefined,
    });
    return;
  }
  let blurTimer = null;
  function closeList() {
    listEl.hidden = true;
    listEl.replaceChildren();
    input.setAttribute("aria-expanded", "false");
  }
  function openList(matches) {
    listEl.replaceChildren();
    if (!matches.length) {
      closeList();
      return;
    }
    matches.slice(0, 18).forEach((name, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "option";
      btn.id = listEl.id + "-opt-" + idx;
      btn.textContent = name;
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        input.value = name;
        closeList();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      listEl.appendChild(btn);
    });
    listEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("input", () => {
    clearTimeout(blurTimer);
    const q = clean(input.value).toLowerCase();
    if (q.length < 1) {
      closeList();
      return;
    }
    const catalog = typeof getNames === "function" ? getNames() : getClientNames();
    const names = catalog.filter((n) => n.toLowerCase().includes(q));
    openList(names);
  });
  input.addEventListener("blur", () => {
    blurTimer = setTimeout(closeList, 160);
  });
}

function syncPillGroup(root, selector, inputName) {
  if (!root) return;
  const selected = clean(
    (root.querySelector(`input[name="${inputName}"]:checked`) || {}).value || ""
  );
  root.querySelectorAll(selector).forEach((pill) => {
    const inp = pill.querySelector(`input[name="${inputName}"]`);
    const val = inp ? clean(inp.value) : "";
    pill.classList.toggle("isSelected", !!val && val === selected);
  });
}

function collectDayCentreNames() {
  const out = [];
  for (let i = 1; i <= 5; i += 1) {
    const el = document.getElementById("lrDayCentreParticipant" + i);
    const nm = clean(el && el.value);
    if (nm) out.push(nm);
  }
  return out;
}

function buildSummaryText(ctx, data) {
  const lines = [
    "Lead session report",
    "",
    `Date: ${ctx.date}`,
    `Service: ${ctx.service}`,
    `Venue: ${ctx.venue}`,
    `Time: ${ctx.sessionTime || "—"}`,
    `Submitted by: ${ctx.submittedByName}`,
  ];
  if (ctx.clientNames.length) lines.push(`Participants: ${ctx.clientNames.join("; ")}`);
  if (data.emotions) lines.push(`Emotions: ${data.emotions}`);
  if (data.independence) lines.push(`Independence: ${data.independence}`);
  if (data.activity) lines.push(`Activity: ${data.activity}`);
  lines.push("", "Brief:", data.brief || "—", "", "Other:", data.other || "—", "", `Incidents: ${data.incidents}`);
  return lines.join("\n");
}

function buildRow(ctx, data, auth) {
  return {
    submitted_by_user_id: auth.submittedByUserId,
    submitted_by_name: auth.submittedByName,
    session_date: ctx.date,
    session_time: ctx.sessionTime || null,
    portal_session_key: ctx.portalSessionKey || null,
    client_id: ctx.clientId || null,
    client_name: ctx.clientNames.length ? ctx.clientNames.join("; ") : null,
    service: ctx.service,
    is_bespoke_programme: isBespokeService(ctx.service),
    engagement: data.engagement,
    brief_description: data.brief,
    other_information: data.other || null,
    incidents: data.incidents,
    summary_text: data.summaryText,
    origin: ctx.origin,
  };
}

function leadFeedbackNavigateBack() {
  try {
    if (
      typeof window.portalGetPortalReturnUrl === "function" &&
      window.portalGetPortalReturnUrl() &&
      typeof window.portalRedirectToPortalReturn === "function"
    ) {
      window.portalRedirectToPortalReturn();
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.portalFormComputeReturnTarget === "function") {
      window.location.replace(window.portalFormComputeReturnTarget());
      return;
    }
  } catch (_) {}
  try {
    const hub =
      typeof window.portalStaffDashboardUrl === "function"
        ? window.portalStaffDashboardUrl()
        : "staff_dashboard.html";
    window.location.replace(hub);
  } catch (_) {
    window.location.href = "staff_dashboard.html";
  }
}

function exitAfterSuccess() {
  leadFeedbackNavigateBack();
}

function showLeadReportSubmitSuccess(message) {
  const msg = clean(message) || "Successful — lead report submitted.";
  const banner = document.getElementById("lrSubmitSuccessBanner");
  if (banner) {
    const textEl = banner.querySelector(".lr-submit-success-banner__text");
    if (textEl) textEl.textContent = msg;
    banner.hidden = false;
    banner.classList.add("is-visible");
  }
  document.body.classList.add("lr-form-submitted-success");
  const form = document.getElementById("lrFeedbackForm");
  if (form) {
    form.setAttribute("aria-disabled", "true");
  }
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (_) {
    try {
      window.scrollTo(0, 0);
    } catch (_e) {}
  }
}

function exitAfterSuccessWithDelay() {
  const delayMs = 1800;
  if (typeof window.portalRedirectAfterSubmitSuccess === "function") {
    window.portalRedirectAfterSubmitSuccess("", delayMs, exitAfterSuccess);
    return;
  }
  setTimeout(exitAfterSuccess, delayMs);
}

async function initVoiceInput(staffName) {
  if (typeof window.PortalFeedbackVoiceInput === "undefined") return;
  try {
    if (typeof window.PortalFeedbackVoiceInput.prefetch === "function") {
      await window.PortalFeedbackVoiceInput.prefetch();
    }
    const voice = window.PortalFeedbackVoiceInput;
    const opts = { auto: true, staffName: staffName || "" };
    if (typeof voice.rescan === "function") voice.rescan(opts);
    else voice.init(opts);
  } catch (voiceErr) {
    console.warn("[lead-report] voice input", voiceErr);
  }
}

export async function bootPortalLeadFeedback() {
  const form = document.getElementById("lrFeedbackForm");
  const clearBtn = document.getElementById("lrClearBtn");
  const submitBtn = document.getElementById("lrSubmitBtn");
  const serviceEl = document.getElementById("lrService");
  const backBtn = document.getElementById("lrBackBtn");
  if (!form || !clearBtn || !submitBtn || !serviceEl) {
    throw new Error("lead_report_form_missing");
  }
  if (backBtn) backBtn.addEventListener("click", leadFeedbackNavigateBack);

  serviceEl.disabled = true;
  serviceEl.setAttribute("aria-busy", "true");

  let origin = clean(qs.get("origin") || "dashboard");
  if (origin !== "this_week" && origin !== "term" && origin !== "dashboard") origin = "dashboard";

  const ctx = {
    date: clean(qs.get("date") || "") || isoToday(),
    service: clean(qs.get("service") || ""),
    venue: clean(qs.get("venue") || qs.get("location") || ""),
    sessionTime: clean(qs.get("time") || qs.get("sessionTime") || ""),
    portalSessionKey: clean(qs.get("sessionKey") || ""),
    clientId: clean(qs.get("clientId") || qs.get("client") || ""),
    clientNames: [],
    submittedByName: "",
    origin,
  };

  let leadScopeFns = null;
  let leadProgrammeKey = "";
  let leadScopes = [];
  let leadSlotsCache = [];
  let rosterReady = false;
  const dateHidden = document.getElementById("lrSessionDate");
  const dateDisplay = document.getElementById("lrSessionDateDisplay");
  const datePicker = document.getElementById("lrSessionDatePicker");
  const datePanel = document.getElementById("lrSessionDateEditPanel");
  const dateApply = document.getElementById("lrSessionDateApplyBtn");
  const dateCancel = document.getElementById("lrSessionDateCancelBtn");

  const venueInput = document.getElementById("lrVenue");
  const timeInput = document.getElementById("lrSessionTime");
  const sessionKeyHidden = document.getElementById("lrPortalSessionKey");
  const clientIdHidden = document.getElementById("lrClientId");
  const singleWrap = document.getElementById("lrParticipantSingleWrap");
  const dayCentreWrap = document.getElementById("lrDayCentreParticipantsWrap");
  const detailed = document.getElementById("lrDetailedSection");
  const general = document.getElementById("lrGeneralSection");
  const activityWrap = document.getElementById("lrActivityFieldWrap");
  const timeSlotWrap = document.getElementById("lrTimeSlotWrap");
  const timeSlotOptions = document.getElementById("lrTimeSlotOptions");
  const partInp = document.getElementById("lrParticipantName");

  function getLeadParticipantNames() {
    if (leadSlotsCache.length) return uniqueParticipantNames(leadSlotsCache);
    return getClientNames();
  }

  function applyDateToUi(iso) {
    ctx.date = iso;
    if (dateHidden) dateHidden.value = iso;
    if (dateDisplay) dateDisplay.textContent = sessionDateDisplayLong(iso);
    if (datePicker) datePicker.value = iso;
  }
  applyDateToUi(ctx.date);

  LEAD_SERVICES.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    if (label === ctx.service) opt.selected = true;
    serviceEl.appendChild(opt);
  });

  if (venueInput && ctx.venue) venueInput.value = ctx.venue;
  if (timeInput && ctx.sessionTime) timeInput.value = ctx.sessionTime;
  if (sessionKeyHidden && ctx.portalSessionKey) sessionKeyHidden.value = ctx.portalSessionKey;
  if (clientIdHidden && ctx.clientId) clientIdHidden.value = ctx.clientId;

  const qsParticipant = clean(
    qs.get("participant") || qs.get("name") || qs.get("full_name") || qs.get("client_name") || ""
  );
  if (partInp && qsParticipant) partInp.value = qsParticipant;

  function suggestServiceSelection(preferred) {
    const pref = clean(preferred);
    if (!pref || clean(serviceEl.value)) return;
    const match = LEAD_SERVICES.find((l) => servicesEquivalent(l, pref));
    if (match) {
      serviceEl.value = match;
      ctx.service = match;
    }
  }

  function servicesForLeadDay(iso) {
    const seen = new Set();
    const out = [];
    expandLeadSlots(iso, null, leadScopeFns).forEach((s) => {
      const svc = clean(s.service);
      if (!svc) return;
      const k = normNameKey(svc);
      if (seen.has(k)) return;
      seen.add(k);
      if (LEAD_SERVICES.some((l) => servicesEquivalent(l, svc))) out.push(svc);
    });
    return out.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }

  function refreshServiceUi() {
    const svc = clean(serviceEl.value);
    ctx.service = svc;
    const mode = leadServiceMode(svc);

    setLeadSectionVisible(singleWrap, mode === "bespoke");
    setLeadSectionVisible(dayCentreWrap, mode === "dayCentre");
    setLeadSectionVisible(detailed, mode === "bespoke");
    setLeadSectionVisible(general, mode === "dayCentre" || mode === "group");
    setLeadSectionVisible(activityWrap, mode === "group" && /multi-activity/i.test(svc));
    if (partInp) partInp.required = mode === "bespoke";
    if (mode !== "none") void initVoiceInput(ctx.submittedByName);
  }

  function findSlotsForParticipant(participantName, serviceFilter) {
    const want = normNameKey(participantName);
    if (!want) return [];
    const svc = clean(serviceFilter != null ? serviceFilter : serviceEl.value);
    let slots = leadSlotsCache.filter((s) => normNameKey(s.client_name) === want);
    if (!slots.length && rosterReady) {
      slots = expandLeadSlots(ctx.date, svc || null, leadScopeFns).filter(
        (s) => normNameKey(s.client_name) === want
      );
    }
    if (svc) {
      const filtered = slots.filter((s) => servicesEquivalent(s.service, svc));
      if (filtered.length) slots = filtered;
    }
    return slots;
  }

  function applySlotToForm(slot) {
    if (!slot) return;
    ctx.venue = clean(slot.venue);
    ctx.sessionTime = clean(slot.time_slot);
    ctx.portalSessionKey = buildLeadSessionKey(slot);
    ctx.clientId = slugify(slot.client_name);
    if (venueInput) venueInput.value = ctx.venue;
    if (timeInput) timeInput.value = ctx.sessionTime;
    if (sessionKeyHidden) sessionKeyHidden.value = ctx.portalSessionKey;
    if (clientIdHidden) clientIdHidden.value = ctx.clientId;
  }

  function applyFixedSessionTimeBand(iso, service) {
    const fixed = leadReportFixedSessionTime(iso, service);
    if (!fixed) return false;
    ctx.sessionTime = fixed;
    if (timeInput) timeInput.value = fixed;
    rebuildTimeSlotPills([]);
    return true;
  }

  function rebuildTimeSlotPills(slots) {
    if (!timeSlotWrap || !timeSlotOptions) return;
    const times = [];
    const seen = new Set();
    slots.forEach((s) => {
      const t = clean(s.time_slot);
      if (!t || seen.has(t)) return;
      seen.add(t);
      times.push(t);
    });
    timeSlotOptions.replaceChildren();
    if (times.length <= 1) {
      timeSlotWrap.hidden = true;
      return;
    }
    times.forEach((t) => {
      const lbl = document.createElement("label");
      lbl.className = "pill lr-time-slot-pill";
      lbl.innerHTML =
        '<input type="radio" name="lrTimeSlotPick" value="' +
        t.replace(/"/g, "&quot;") +
        '" /><span>' +
        t +
        "</span>";
      lbl.addEventListener("change", () => {
        if (timeInput) timeInput.value = t;
        ctx.sessionTime = t;
        timeSlotOptions.querySelectorAll(".lr-time-slot-pill").forEach((p) => {
          p.classList.toggle("isSelected", p.querySelector("input")?.checked);
        });
      });
      timeSlotOptions.appendChild(lbl);
    });
    timeSlotWrap.hidden = false;
  }

  function applyParticipantSlot(participantName) {
    const nm = clean(participantName);
    if (!nm) return;
    if (!isBespokeService(serviceEl.value)) return;

    const matches = findSlotsForParticipant(nm, clean(serviceEl.value));
    if (!matches.length) return;
    if (matches.length === 1) {
      applySlotToForm(matches[0]);
      if (applyFixedSessionTimeBand(ctx.date, serviceEl.value)) return;
      rebuildTimeSlotPills([]);
      return;
    }
    const venues = [...new Set(matches.map((s) => clean(s.venue)).filter(Boolean))];
    if (venues.length === 1) {
      ctx.venue = venues[0];
      if (venueInput) venueInput.value = ctx.venue;
    }
    if (applyFixedSessionTimeBand(ctx.date, serviceEl.value)) {
      const pick = matches[0];
      ctx.portalSessionKey = buildLeadSessionKey(pick);
      ctx.clientId = slugify(pick.client_name);
      if (sessionKeyHidden) sessionKeyHidden.value = ctx.portalSessionKey;
      if (clientIdHidden) clientIdHidden.value = ctx.clientId;
      return;
    }
    rebuildTimeSlotPills(matches);
    const currentTime = clean(timeInput?.value || "");
    const pick =
      matches.find((s) => clean(s.time_slot) === currentTime) ||
      matches.find((s) => clean(s.time_slot) === clean(ctx.sessionTime)) ||
      matches[0];
    applySlotToForm(pick);
  }

  function fillDayCentreParticipants(names) {
    for (let i = 1; i <= 5; i += 1) {
      const el = document.getElementById("lrDayCentreParticipant" + i);
      if (el) el.value = names[i - 1] || "";
    }
  }

  function applyServiceContext(opts) {
    opts = opts || {};
    refreshServiceUi();
    const svc = clean(serviceEl.value);
    if (!svc || !rosterReady) return;

    leadSlotsCache = expandLeadSlots(ctx.date, svc, leadScopeFns);

    const participants = uniqueParticipantNames(leadSlotsCache);
    const venues = [...new Set(leadSlotsCache.map((s) => clean(s.venue)).filter(Boolean))];
    const times = [...new Set(leadSlotsCache.map((s) => clean(s.time_slot)).filter(Boolean))];

    if (!opts.keepVenue && venues.length === 1 && venueInput) {
      venueInput.value = venues[0];
      ctx.venue = venues[0];
    }

    if (isBespokeService(svc)) {
      const typed = clean(partInp?.value || "");
      const pick =
        (typed && participants.find((n) => normNameKey(n) === normNameKey(typed))) ||
        (participants.length === 1 ? participants[0] : "") ||
        typed;
      if (partInp && pick && (!typed || normNameKey(typed) !== normNameKey(pick))) {
        partInp.value = pick;
      }
      if (pick) applyParticipantSlot(pick);
      else if (applyFixedSessionTimeBand(ctx.date, svc)) {
        /* fixed band for bespoke Mon/Wed/Fri */
      } else if (times.length === 1 && timeInput) {
        timeInput.value = times[0];
        ctx.sessionTime = times[0];
      } else {
        rebuildTimeSlotPills(leadSlotsCache);
      }
    } else if (isDayCentreService(svc)) {
      if (participants.length) fillDayCentreParticipants(participants.slice(0, 5));
      if (times.length === 1 && timeInput) {
        timeInput.value = times[0];
        ctx.sessionTime = times[0];
      }
      if (leadSlotsCache[0]) {
        ctx.portalSessionKey = buildLeadSessionKey(leadSlotsCache[0]);
        if (sessionKeyHidden) sessionKeyHidden.value = ctx.portalSessionKey;
      }
      rebuildTimeSlotPills(leadSlotsCache);
    } else if (applyFixedSessionTimeBand(ctx.date, svc)) {
      if (leadSlotsCache[0]) {
        ctx.portalSessionKey = buildLeadSessionKey(leadSlotsCache[0]);
        if (sessionKeyHidden) sessionKeyHidden.value = ctx.portalSessionKey;
      }
    } else {
      if (times.length === 1 && timeInput && !clean(timeInput.value)) {
        timeInput.value = times[0];
        ctx.sessionTime = times[0];
      }
      rebuildTimeSlotPills(leadSlotsCache);
    }
  }

  serviceEl.addEventListener("change", () => applyServiceContext());
  serviceEl.addEventListener("input", () => applyServiceContext());
  refreshServiceUi();

  if (dateDisplay && datePanel) {
    dateDisplay.addEventListener("dblclick", () => {
      datePanel.hidden = false;
      if (datePicker) datePicker.value = ctx.date;
    });
  }
  dateApply?.addEventListener("click", () => {
    const iso = clean(datePicker?.value || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      applyDateToUi(iso);
      applyServiceContext();
    }
    if (datePanel) datePanel.hidden = true;
  });
  dateCancel?.addEventListener("click", () => {
    if (datePanel) datePanel.hidden = true;
  });

  try {
    const { bootstrapDashboardSupabase } = await import(PORTAL_AUTH_MODULE);
    await bootstrapDashboardSupabase({ page: "lead_report" });
  } catch (bootstrapErr) {
    console.warn("[lead-report] supabase bootstrap", bootstrapErr);
  }

  const auth = await resolveAuthContext();
  if (!auth) {
    alert("Please sign in from the staff dashboard, then open Lead report again.");
    serviceEl.disabled = false;
    serviceEl.removeAttribute("aria-busy");
    return;
  }
  ctx.submittedByName = auth.submittedByName;

  try {
    await loadScriptOnce(PORTAL_ROSTER_BUNDLE);
    await loadScriptOnce(PORTAL_CLIENTS_SCRIPT);
    await loadScriptOnce(PORTAL_CATALOG_SCRIPT);
    await loadScriptOnce(PORTAL_AUTOCOMPLETE_SCRIPT);
    const scopeMod = await import(PORTAL_LEAD_SCOPE_MODULE);
    leadScopes = scopeMod.portalLeadSessionScopesForProfile(auth.profile, auth.authEmail);
    leadProgrammeKey = scopeMod.portalLeadProgrammeKey(auth.profile, auth.authEmail);
    leadScopeFns = leadScopes.length
      ? scopeMod.portalLeadSessionScopeFilterFns(leadScopes, leadProgrammeKey)
      : null;
    rosterReady = true;
    const dayServices = servicesForLeadDay(ctx.date);
    if (dayServices.length) {
      suggestServiceSelection(ctx.service || dayServices[0]);
    }
    applyServiceContext({ keepVenue: !!ctx.venue });
  } catch (e) {
    console.warn("[lead-report] roster / scope", e);
  } finally {
    serviceEl.disabled = false;
    serviceEl.removeAttribute("aria-busy");
  }

  wireNameSuggest(partInp, document.getElementById("lrParticipantSuggest"), getLeadParticipantNames);
  for (let i = 1; i <= 5; i += 1) {
    wireNameSuggest(
      document.getElementById("lrDayCentreParticipant" + i),
      document.getElementById("lrDayCentreSuggest" + i),
      getLeadParticipantNames
    );
  }
  const venueSuggest = document.getElementById("lrVenueSuggest");
  if (venueInput && typeof window.portalWireFieldSuggest === "function") {
    window.portalWireFieldSuggest(venueInput, venueSuggest, {
      kind: "venue",
      strict: true,
      match: "contains",
    });
  }

  partInp?.addEventListener("input", () => {
    clearTimeout(partInp._lrSlotTimer);
    partInp._lrSlotTimer = setTimeout(() => {
      const nm = clean(partInp.value);
      if (nm && isBespokeService(serviceEl.value)) applyParticipantSlot(nm);
    }, 200);
  });
  partInp?.addEventListener("change", () => {
    const nm = clean(partInp.value);
    if (nm) applyParticipantSlot(nm);
  });
  partInp?.addEventListener("blur", () => {
    const nm = clean(partInp.value);
    if (nm) applyParticipantSlot(nm);
  });

  form.querySelectorAll(".options").forEach((box) => {
    const inp = box.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!inp || !inp.name) return;
    const name = inp.name;
    const sel =
      inp.type === "checkbox"
        ? ".pill.emotion"
        : name === "lrEngagementRating"
          ? ".engagement-star"
          : name === "lrIndependenceLevel"
            ? ".pill.independence"
            : name === "lrGroupEngagement"
              ? ".pill.group-engagement"
              : name === "lrIncidents"
                ? ".lr-incident-pill"
                : "";
    if (!sel) return;
    box.addEventListener("change", () => syncPillGroup(box, sel, name));
    syncPillGroup(box, sel, name);
  });

  applyServiceContext({ keepVenue: !!ctx.venue });
  await initVoiceInput(ctx.submittedByName);

  clearBtn.addEventListener("click", () => {
    form.reset();
    applyDateToUi(isoToday());
    ctx.portalSessionKey = "";
    ctx.clientId = "";
    ctx.venue = "";
    ctx.sessionTime = "";
    if (sessionKeyHidden) sessionKeyHidden.value = "";
    if (clientIdHidden) clientIdHidden.value = "";
    applyServiceContext();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const svc = clean(serviceEl.value);
    if (!svc) {
      alert("Please select a service.");
      return;
    }
    const venue = clean(venueInput?.value || "");
    if (!venue) {
      alert("Please enter the venue.");
      return;
    }
    const incidents = clean(
      (form.querySelector('input[name="lrIncidents"]:checked') || {}).value || ""
    );
    if (!incidents) {
      alert("Please indicate whether there were incidents.");
      return;
    }

    ctx.service = svc;
    ctx.venue = venue;
    ctx.sessionTime = clean(timeInput?.value || "");
    ctx.date = clean(dateHidden?.value || ctx.date) || isoToday();
    ctx.portalSessionKey = clean(sessionKeyHidden?.value || ctx.portalSessionKey);
    ctx.clientId = clean(clientIdHidden?.value || ctx.clientId);

    let engagement = "";
    let brief = "";
    let other = null;
    let emotions = "";
    let independence = "";
    let activity = "";

    if (isBespokeService(svc)) {
      const participant = clean(partInp?.value || "");
      if (!participant) {
        alert("Please enter the participant name.");
        return;
      }
      ctx.clientNames = [participant];
      if (!ctx.clientId) ctx.clientId = slugify(participant);
      const rating = clean(
        (form.querySelector('input[name="lrEngagementRating"]:checked') || {}).value || ""
      );
      engagement = mapStarEngagement(rating);
      if (!engagement) {
        alert("Please rate engagement (1–5 stars).");
        return;
      }
      const emo = [];
      form.querySelectorAll('input[name="lrClientEmotions"]:checked').forEach((el) => {
        emo.push(clean(el.value));
      });
      if (!emo.length) {
        alert("Please select at least one emotion / regulation option.");
        return;
      }
      emotions = emo.join(", ");
      independence = clean(
        (form.querySelector('input[name="lrIndependenceLevel"]:checked') || {}).value || ""
      );
      if (!independence) {
        alert("Please select independence level.");
        return;
      }
      brief = clean(document.getElementById("lrPositiveFeedback")?.value || "");
      const rel = clean(document.getElementById("lrRelevantInformation")?.value || "");
      if (!brief || !rel) {
        alert("Please complete positive feedback and relevant information.");
        return;
      }
      other = rel;
    } else if (isDayCentreService(svc)) {
      const names = collectDayCentreNames();
      if (!names.length) {
        alert("Please enter at least one Day Centre participant.");
        return;
      }
      ctx.clientNames = names;
      engagement = clean(
        (form.querySelector('input[name="lrGroupEngagement"]:checked') || {}).value || ""
      );
      if (!engagement) {
        alert("Please select overall group engagement.");
        return;
      }
      brief = clean(document.getElementById("lrSessionSummary")?.value || "");
      if (!brief) {
        alert("Please summarise how the session went.");
        return;
      }
      other = clean(document.getElementById("lrOtherOptional")?.value || "") || null;
    } else {
      engagement = clean(
        (form.querySelector('input[name="lrGroupEngagement"]:checked') || {}).value || ""
      );
      if (!engagement) {
        alert("Please select overall group engagement.");
        return;
      }
      activity = clean(document.getElementById("lrActivityName")?.value || "");
      if (/multi-activity/i.test(svc) && !activity) {
        alert("Please name the activity delivered.");
        return;
      }
      brief = clean(document.getElementById("lrSessionSummary")?.value || "");
      if (!brief) {
        alert("Please summarise how the session went.");
        return;
      }
      other = clean(document.getElementById("lrOtherOptional")?.value || "") || null;
    }

    const data = {
      engagement,
      brief,
      other,
      incidents,
      emotions,
      independence,
      activity,
      summaryText: "",
    };
    data.summaryText = buildSummaryText(ctx, data);
    const row = buildRow(ctx, data, auth);

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    let submitSucceeded = false;
    try {
      const { error } = await auth.supabase.from("lead_session_reports").insert([row]);
      if (error) throw error;
      submitSucceeded = true;
      submitBtn.textContent = "Submitted";
      showLeadReportSubmitSuccess("Successful — lead report submitted.");
      exitAfterSuccessWithDelay();
    } catch (err) {
      console.error(err);
      alert(
        "Submission failed. Please try again." +
          (err && err.message ? "\n" + String(err.message) : "")
      );
    } finally {
      if (!submitSucceeded) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
      }
    }
  });
}
