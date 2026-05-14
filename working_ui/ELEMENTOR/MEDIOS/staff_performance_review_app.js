/**
 * performance.html — split responsibilities:
 * - Backend (Supabase): public.staff_performance_reviews INSERT; public.session_feedback SELECT for context.
 * - Front-end: DOM, validation, conditional fields, pill UI.
 */

const PORTAL_AUTH_MODULE =
  "https://www.clubsensational.org/wp-content/uploads/2026/05/auth-handler.js?v=20260419-99";

const qs = new URLSearchParams(typeof location !== "undefined" ? location.search || "" : "");

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseSubjectUserIdFromUrl() {
  const raw = clean(qs.get("subject") || qs.get("staffId") || qs.get("subjectUserId"));
  if (!raw) return "";
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(raw) ? raw.toLowerCase() : "";
}

function isValidDdMmYyyy(s) {
  const t = clean(s);
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  if (!m) return false;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12) return false;
  const d = new Date(yyyy, mm - 1, dd);
  return (
    d.getFullYear() === yyyy &&
    d.getMonth() === mm - 1 &&
    d.getDate() === dd
  );
}

// --- Backend (Supabase)

/** @returns {Promise<{ supabase: object, userId: string, appRole: string, displayName: string } | null>} */
async function resolveReviewerContext() {
  const { getSupabaseClient } = await import(PORTAL_AUTH_MODULE);
  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData || !authData.user || !authData.user.id) return null;
  const userId = String(authData.user.id).trim();
  const { data: profileRow, error: profileErr } = await supabase
    .from("staff_profiles")
    .select("app_role, full_name, username")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr || !profileRow) return null;
  const appRole = String(profileRow.app_role || "").toLowerCase();
  const displayName = clean(profileRow.full_name || profileRow.username || "");
  if (!displayName) return null;
  return { supabase, userId, appRole, displayName };
}

function isHrReviewer(role) {
  const r = String(role || "").toLowerCase();
  return r === "admin" || r === "ceo" || r === "lead";
}

/** @param {object} supabase @param {string} subjectUserId */
async function fetchSessionObservationsForSubject(supabase, subjectUserId) {
  if (!subjectUserId) return { rows: [], error: null };
  const { data, error } = await supabase
    .from("session_feedback")
    .select(
      "session_date, client_name, service, attendance, engagement_rating, positive_feedback, relevant_information, completed_by_name"
    )
    .eq("submitted_by_user_id", subjectUserId)
    .order("session_date", { ascending: false })
    .limit(15);
  if (error) return { rows: [], error };
  return { rows: Array.isArray(data) ? data : [], error: null };
}

function formatObservationLine(row) {
  const parts = [];
  const d = row.session_date ? String(row.session_date) : "";
  if (d) parts.push(`<strong>${escapeHtml(d)}</strong>`);
  const client = clean(row.client_name);
  if (client) parts.push(escapeHtml(client));
  const svc = clean(row.service);
  if (svc) parts.push(escapeHtml(svc));
  const head = parts.length ? `${parts.join(" — ")}` : "Session";
  const att = clean(row.attendance);
  const rating =
    row.engagement_rating != null && row.engagement_rating !== ""
      ? String(row.engagement_rating)
      : "";
  const bits = [];
  if (att) bits.push(`Attendance: ${escapeHtml(att)}`);
  if (rating) bits.push(`Engagement: ${escapeHtml(rating)}/5`);
  const pos = clean(row.positive_feedback);
  if (pos) bits.push(`Positive: ${escapeHtml(pos.slice(0, 280))}${pos.length > 280 ? "…" : ""}`);
  const rel = clean(row.relevant_information);
  if (rel) bits.push(`Other info: ${escapeHtml(rel.slice(0, 220))}${rel.length > 220 ? "…" : ""}`);
  const body = bits.length ? `<div class="small" style="margin-top:4px;">${bits.join(" · ")}</div>` : "";
  return `<div class="obsLine">${head}${body}</div>`;
}

async function renderSessionContext(supabase, subjectUserId, el) {
  if (!el) return;
  if (!subjectUserId) {
    el.innerHTML =
      '<span class="small">No linked staff user — add <code>?subject=</code> with the staff member’s user UUID to load their recent session feedback here.</span>';
    return;
  }
  el.innerHTML = '<span class="small">Loading…</span>';
  const { rows, error } = await fetchSessionObservationsForSubject(supabase, subjectUserId);
  if (error) {
    el.innerHTML = `<span class="small">Could not load session feedback (${escapeHtml(error.message || "error")}).</span>`;
    return;
  }
  if (!rows.length) {
    el.innerHTML =
      '<span class="small">No session feedback rows found for this staff user yet.</span>';
    return;
  }
  const nameHint = clean(rows[0].completed_by_name);
  const staffField = document.getElementById("staffName");
  if (staffField && !clean(staffField.value) && nameHint) {
    staffField.value = nameHint;
  }
  el.innerHTML = rows.map(formatObservationLine).join("");
}

async function insertPerformanceReview(supabase, payload) {
  const { error } = await supabase.from("staff_performance_reviews").insert([payload]);
  if (error) throw error;
}

// --- Front-end

function syncPills(containerSelector, inputName) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  const checked = root.querySelector(`input[name="${inputName}"]:checked`);
  const val = checked ? checked.value : "";
  root.querySelectorAll(".pill").forEach((pill) => {
    const inp = pill.querySelector("input");
    const v = inp ? inp.value : "";
    pill.classList.toggle("isSelected", v === val && val !== "");
  });
}

function updateSupportedConditional() {
  const el = document.querySelector('input[name="supported"]:checked');
  const v = el ? el.value : "";
  const wrap = document.getElementById("supportedExplainWrap");
  const ta = document.getElementById("supportedExplain");
  const open = v === "Partially" || v === "No";
  if (wrap) wrap.classList.toggle("isOpen", open);
  if (ta) {
    ta.required = open;
    if (!open) ta.setCustomValidity("");
  }
}

function updateContinueConditional() {
  const el = document.querySelector('input[name="continueRole"]:checked');
  const v = el ? el.value : "";
  const wrap = document.getElementById("continueExplainWrap");
  const ta = document.getElementById("continueExplain");
  const open = v === "No" || v === "Not sure";
  if (wrap) wrap.classList.toggle("isOpen", open);
  if (ta) {
    ta.required = open;
    if (!open) ta.setCustomValidity("");
  }
}

function buildResponsesFromForm(fd) {
  return {
    feeling_role: clean(fd.get("feelingRole")),
    supported: clean(fd.get("supported")),
    supported_explain: clean(fd.get("supportedExplain")),
    concerns: clean(fd.get("concerns")),
    job_better: clean(fd.get("jobBetter")),
    mgmt_ops_feedback: clean(fd.get("mgmtOpsFeedback")),
    strengths_mgmt: clean(fd.get("strengthsMgmt")),
    improve_mgmt: clean(fd.get("improveMgmt")),
    continue_role: clean(fd.get("continueRole")),
    continue_explain: clean(fd.get("continueExplain")),
    explore_roles: clean(fd.get("exploreRoles")),
    availability: clean(fd.get("availability")),
    term_review_meeting_notes: clean(fd.get("termReviewNotes")),
    reviewer_name_form: clean(fd.get("reviewerName"))
  };
}

(function init() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("perfForm");
  const done = document.getElementById("done");
  const submitBtn = document.getElementById("submitBtn");
  const sessionEl = document.getElementById("sessionObservations");
  const subjectHidden = document.getElementById("subjectUserId");
  const reviewerName = document.getElementById("reviewerName");

  const subjectFromUrl = parseSubjectUserIdFromUrl();
  if (subjectHidden) subjectHidden.value = subjectFromUrl;

  document.querySelectorAll(".pill[data-supported]").forEach((pill) => {
    pill.addEventListener("click", () => {
      requestAnimationFrame(() => {
        syncPills('[role="radiogroup"][aria-label="Supported"]', "supported");
        updateSupportedConditional();
      });
    });
  });
  document.querySelectorAll(".pill[data-continue]").forEach((pill) => {
    pill.addEventListener("click", () => {
      requestAnimationFrame(() => {
        syncPills('[role="radiogroup"][aria-label="Continue role"]', "continueRole");
        updateContinueConditional();
      });
    });
  });

  form?.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.name) return;
    if (t.name === "supported") {
      syncPills('[role="radiogroup"][aria-label="Supported"]', "supported");
      updateSupportedConditional();
    }
    if (t.name === "continueRole") {
      syncPills('[role="radiogroup"][aria-label="Continue role"]', "continueRole");
      updateContinueConditional();
    }
  });

  document.getElementById("clearDraftBtn")?.addEventListener("click", () => {
    form.reset();
    if (subjectHidden) subjectHidden.value = subjectFromUrl;
    if (reviewerName) reviewerName.value = reviewerName.dataset.initialName || "";
    syncPills('[role="radiogroup"][aria-label="Supported"]', "supported");
    syncPills('[role="radiogroup"][aria-label="Continue role"]', "continueRole");
    updateSupportedConditional();
    updateContinueConditional();
  });

  document.getElementById("reloadContextBtn")?.addEventListener("click", async () => {
    const ctx = await resolveReviewerContext();
    if (!ctx || !isHrReviewer(ctx.appRole)) return;
    const sid = clean(subjectHidden?.value || subjectFromUrl);
    await renderSessionContext(ctx.supabase, sid, sessionEl);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const staffName = clean(fd.get("staffName"));
    const reviewDate = clean(fd.get("reviewDate"));
    const supported = clean(fd.get("supported"));
    const supportedExplain = clean(fd.get("supportedExplain"));
    const continueRole = clean(fd.get("continueRole"));
    const continueExplain = clean(fd.get("continueExplain"));

    if (!isValidDdMmYyyy(reviewDate)) {
      alert("Date of Review must be a real calendar date in DD-MM-YYYY format.");
      return;
    }
    if ((supported === "Partially" || supported === "No") && !supportedExplain) {
      alert('Please explain your answer for "supported by your team and line manager".');
      return;
    }
    if ((continueRole === "No" || continueRole === "Not sure") && !continueExplain) {
      alert('Please explain your answer for "continue in your current role".');
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    let ctx;
    try {
      ctx = await resolveReviewerContext();
    } catch (err) {
      console.error(err);
      gate.textContent = "Could not reach authentication. Refresh and try again.";
      return;
    }
    if (!ctx || !isHrReviewer(ctx.appRole)) {
      alert("Only authorised reviewers (admin, ceo or lead) can save this form.");
      return;
    }

    const subjectUid = clean(fd.get("subjectUserId") || subjectFromUrl) || null;
    const responses = buildResponsesFromForm(fd);

    submitBtn.disabled = true;
    try {
      await insertPerformanceReview(ctx.supabase, {
        subject_user_id: subjectUid,
        subject_display_name: staffName,
        review_date: reviewDate,
        reviewer_user_id: ctx.userId,
        responses
      });
      form.style.display = "none";
      done.style.display = "block";
      try {
        if (typeof window !== "undefined" && typeof window.portalRedirectToPortalReturn === "function") {
          window.setTimeout(function () {
            window.portalRedirectToPortalReturn();
          }, 1200);
        }
      } catch (_) {}
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? String(err.message) : "Save failed";
      alert(msg);
    } finally {
      submitBtn.disabled = false;
    }
  });

  resolveReviewerContext()
    .then(async (ctx) => {
      if (!ctx) {
        gate.textContent =
          "You must be signed in with a staff profile that has a display name. Open this page from the portal after logging in.";
        return;
      }
      if (!isHrReviewer(ctx.appRole)) {
        gate.textContent =
          "This in-meeting form is restricted to admin, ceo or lead accounts. Other staff profiles cannot use this page.";
        return;
      }
      gate.style.display = "none";
      form.style.display = "block";
      if (reviewerName) {
        reviewerName.value = ctx.displayName;
        reviewerName.dataset.initialName = ctx.displayName;
      }
      await renderSessionContext(ctx.supabase, subjectFromUrl, sessionEl);
      syncPills('[role="radiogroup"][aria-label="Supported"]', "supported");
      syncPills('[role="radiogroup"][aria-label="Continue role"]', "continueRole");
      updateSupportedConditional();
      updateContinueConditional();
    })
    .catch((err) => {
      console.error(err);
      gate.textContent = "Could not verify access. Check your connection and try again.";
    });
})();
