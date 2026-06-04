/**
 * Lead session report form (portal-lead-feedback.html) — wires lr* fields to lead_session_reports.
 */
const PORTAL_AUTH_MODULE = "/portal/auth-handler.js?v=20260615-lead-report";
const PORTAL_CLIENTS_SCRIPT = "/portal/clients_info_embed.js?v=20260615-lead-report";

const LEAD_SERVICES = [
  "Bespoke Programme",
  "Day Centre",
  "Multi-Activity",
  "Aquatic Group Activity",
  "Parents & Babys",
];

const VENUE_OPTIONS = ["SwimFarm", "Acton", "Westway", "Other"];

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

function isGroupService(service) {
  return !isBespokeService(service) && !isDayCentreService(service);
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
  return { supabase, submittedByUserId: uid, submittedByName, profile: profileRow };
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

function wireNameSuggest(input, listEl) {
  if (!input || !listEl) return;
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
    const names = getClientNames().filter((n) => n.toLowerCase().includes(q));
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
    client_id: null,
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

function exitAfterSuccess() {
  try {
    if (typeof window.portalRedirectToPortalReturn === "function") {
      window.portalRedirectToPortalReturn();
      return;
    }
  } catch (_) {}
  try {
    const u =
      typeof window.portalGetPortalReturnUrl === "function"
        ? window.portalGetPortalReturnUrl()
        : "";
    if (clean(u)) {
      window.location.replace(u);
      return;
    }
  } catch (_) {}
  try {
    window.close();
  } catch (_) {}
}

export async function bootPortalLeadFeedback() {
  const form = document.getElementById("lrFeedbackForm");
  const clearBtn = document.getElementById("lrClearBtn");
  const submitBtn = document.getElementById("lrSubmitBtn");
  const serviceEl = document.getElementById("lrService");
  if (!form || !clearBtn || !submitBtn || !serviceEl) {
    throw new Error("lead_report_form_missing");
  }

  let origin = clean(qs.get("origin") || "dashboard");
  if (origin !== "this_week" && origin !== "term" && origin !== "dashboard") origin = "dashboard";

  const ctx = {
    date: clean(qs.get("date") || "") || isoToday(),
    service: clean(qs.get("service") || ""),
    venue: clean(qs.get("venue") || qs.get("location") || ""),
    sessionTime: clean(qs.get("time") || qs.get("sessionTime") || ""),
    portalSessionKey: clean(qs.get("sessionKey") || ""),
    clientNames: [],
    submittedByName: "",
    origin,
  };

  const dateHidden = document.getElementById("lrSessionDate");
  const dateDisplay = document.getElementById("lrSessionDateDisplay");
  const datePicker = document.getElementById("lrSessionDatePicker");
  const datePanel = document.getElementById("lrSessionDateEditPanel");
  const dateApply = document.getElementById("lrSessionDateApplyBtn");
  const dateCancel = document.getElementById("lrSessionDateCancelBtn");

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

  const venueList = document.getElementById("lrVenueList");
  if (venueList) {
    VENUE_OPTIONS.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      venueList.appendChild(opt);
    });
  }
  const venueInput = document.getElementById("lrVenue");
  if (venueInput && ctx.venue) venueInput.value = ctx.venue;

  const singleWrap = document.getElementById("lrParticipantSingleWrap");
  const dayCentreWrap = document.getElementById("lrDayCentreParticipantsWrap");
  const detailed = document.getElementById("lrDetailedSection");
  const general = document.getElementById("lrGeneralSection");
  const activityWrap = document.getElementById("lrActivityFieldWrap");

  function refreshServiceUi() {
    const svc = clean(serviceEl.value);
    ctx.service = svc;
    const bespoke = isBespokeService(svc);
    const dayCentre = isDayCentreService(svc);
    const group = isGroupService(svc);
    if (singleWrap) singleWrap.hidden = !bespoke;
    if (dayCentreWrap) dayCentreWrap.hidden = !dayCentre;
    if (detailed) detailed.hidden = !bespoke;
    if (general) general.hidden = bespoke;
    if (activityWrap) activityWrap.hidden = !/multi-activity/i.test(svc);
    const partInp = document.getElementById("lrParticipantName");
    if (partInp) partInp.required = bespoke;
  }
  serviceEl.addEventListener("change", refreshServiceUi);
  refreshServiceUi();

  if (dateDisplay && datePanel) {
    dateDisplay.addEventListener("dblclick", () => {
      datePanel.hidden = false;
      if (datePicker) datePicker.value = ctx.date;
    });
  }
  dateApply?.addEventListener("click", () => {
    const iso = clean(datePicker?.value || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) applyDateToUi(iso);
    if (datePanel) datePanel.hidden = true;
  });
  dateCancel?.addEventListener("click", () => {
    if (datePanel) datePanel.hidden = true;
  });

  try {
    await loadScriptOnce(PORTAL_CLIENTS_SCRIPT);
  } catch (e) {
    console.warn("[lead-report] clients embed", e);
  }
  wireNameSuggest(document.getElementById("lrParticipantName"), document.getElementById("lrParticipantSuggest"));
  for (let i = 1; i <= 5; i += 1) {
    wireNameSuggest(
      document.getElementById("lrDayCentreParticipant" + i),
      document.getElementById("lrDayCentreSuggest" + i)
    );
  }

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

  const auth = await resolveAuthContext();
  if (!auth) {
    alert("Please sign in from the lead dashboard, then open Lead Feedback Report again.");
    return;
  }
  ctx.submittedByName = auth.submittedByName;

  clearBtn.addEventListener("click", () => {
    form.reset();
    applyDateToUi(isoToday());
    refreshServiceUi();
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
    ctx.sessionTime = clean(document.getElementById("lrSessionTime")?.value || "");
    ctx.date = clean(dateHidden?.value || ctx.date) || isoToday();

    let engagement = "";
    let brief = "";
    let other = null;
    let emotions = "";
    let independence = "";
    let activity = "";

    if (isBespokeService(svc)) {
      const participant = clean(document.getElementById("lrParticipantName")?.value || "");
      if (!participant) {
        alert("Please enter the participant name.");
        return;
      }
      ctx.clientNames = [participant];
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
    try {
      const { error } = await auth.supabase.from("lead_session_reports").insert([row]);
      if (error) throw error;
      alert("Lead report submitted successfully.");
      exitAfterSuccess();
    } catch (err) {
      console.error(err);
      alert(
        "Submission failed. Please try again." +
          (err && err.message ? "\n" + String(err.message) : "")
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });

  if (typeof window.PortalFeedbackVoiceInput !== "undefined") {
    window.PortalFeedbackVoiceInput.init({
      fields: [
        "lrPositiveFeedback",
        "lrRelevantInformation",
        "lrSessionSummary",
        "lrOtherOptional",
      ],
      staffName: ctx.submittedByName,
    });
  }
}
