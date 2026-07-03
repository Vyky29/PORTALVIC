import { bootstrapDashboardSupabase, portalIsOperationsAdminUser } from "/portal/auth-handler.js?v=20260703-ld-funding";

const form = document.getElementById("ldFundingForm");
const msgEl = document.getElementById("formMsg");
const submitBtn = document.getElementById("submitBtn");
const upfrontWrap = document.getElementById("upfrontWrap");
const exceptionalWrap = document.getElementById("exceptionalWrap");

const STAFF_ROLE_LABELS = {
  swimming: "Swimming",
  fitness: "Fitness / Physical activity",
  climbing: "Climbing",
  support: "Support worker",
  manager: "Manager",
  admin: "Administration",
};

let profile = null;
let client = null;
let session = null;

function clean(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

function todayIso() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function setMsg(text, kind) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.className =
    "msg" +
    (text ? " show" : "") +
    (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
}

function readRadio(name) {
  const el = form.querySelector('input[name="' + name + '"]:checked');
  return el ? clean(el.value) : "";
}

function roleLabel(staffRole) {
  const key = clean(staffRole).toLowerCase();
  return STAFF_ROLE_LABELS[key] || clean(staffRole) || "";
}

function readOrigin() {
  try {
    const o = clean(new URLSearchParams(location.search).get("from"));
    if (o === "quick_menu" || o === "policy" || o === "dashboard") return o;
  } catch (_) {}
  return "direct";
}

function syncConditionalFields() {
  const scheme = readRadio("applyingForScheme");
  const showFunding = scheme === "yes";
  upfrontWrap.hidden = !showFunding;
  if (!showFunding) {
    exceptionalWrap.hidden = true;
    return;
  }
  const upfront = readRadio("canPayUpfront");
  exceptionalWrap.hidden = upfront !== "no";
}

function parseProfileRpc(data) {
  if (data == null) return null;
  if (typeof data === "object" && !Array.isArray(data)) {
    return data.id != null ? data : null;
  }
  if (typeof data === "string") {
    try {
      return parseProfileRpc(JSON.parse(data));
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function loadStaffProfile(supabase, authSession) {
  const rpc = await supabase.rpc("portal_get_session_staff_profile");
  if (!rpc.error && rpc.data) {
    const fromRpc = parseProfileRpc(rpc.data);
    if (fromRpc) return fromRpc;
  }
  const { data: prof, error } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, staff_role, app_role")
    .eq("id", authSession.user.id)
    .maybeSingle();
  if (error) throw error;
  if (prof) return prof;
  const meta = authSession.user.user_metadata || {};
  const name = clean(meta.full_name || meta.name || meta.preferred_username);
  if (name) {
    return { full_name: name, username: name, staff_role: "", app_role: "staff" };
  }
  return null;
}

function prefillFromProfile(prof) {
  const name = clean(prof.full_name || prof.username);
  document.getElementById("employeeName").value = name;
  const title = roleLabel(prof.staff_role);
  if (title) document.getElementById("jobTitle").value = title;
  if (title) document.getElementById("serviceDepartment").value = title;
  document.getElementById("applicationDate").value = todayIso();
}

form.querySelectorAll('input[name="applyingForScheme"], input[name="canPayUpfront"]').forEach(function (el) {
  el.addEventListener("change", syncConditionalFields);
});

document.getElementById("clearBtn").addEventListener("click", function () {
  form.reset();
  if (profile) prefillFromProfile(profile);
  syncConditionalFields();
  setMsg("", "");
});

async function init() {
  try {
    await bootstrapDashboardSupabase({ page: "staff" });
  } catch (e) {
    setMsg("Sign in to the portal to submit an application.", "err");
    return;
  }
  const box = window.__PORTAL_SUPABASE__ || {};
  client = box.client;
  session = box.session;
  if (!client || !session?.user?.id) {
    location.href = "login.html?next=" + encodeURIComponent(location.href);
    return;
  }
  let prof = null;
  try {
    prof = await loadStaffProfile(client, session);
  } catch (e) {
    console.warn("[ld funding] profile load", e);
  }
  if (!prof) {
    setMsg(
      "Could not load your staff profile. Try signing out and back in, or contact the office.",
      "err"
    );
    return;
  }
  const role = clean(prof.app_role).toLowerCase();
  const authEmail = String(session.user?.email || "");
  const opsAdmin = portalIsOperationsAdminUser(prof, authEmail);
  if (role !== "staff" && role !== "lead" && !opsAdmin) {
    setMsg("This form is for staff and lead accounts only.", "err");
    submitBtn.disabled = true;
    return;
  }
  profile = prof;
  prefillFromProfile(prof);
  syncConditionalFields();
}

form.addEventListener("submit", async function (ev) {
  ev.preventDefault();
  syncConditionalFields();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!profile || !client || !session?.user?.id) {
    setMsg("Not signed in.", "err");
    return;
  }

  const applyingForScheme = readRadio("applyingForScheme") === "yes";
  const canPayUpfrontRaw = readRadio("canPayUpfront");
  const requestsExceptional =
    applyingForScheme && canPayUpfrontRaw === "no";
  const exceptionalNote = clean(document.getElementById("exceptionalNote").value);

  if (requestsExceptional && !exceptionalNote) {
    setMsg("Please briefly explain your exceptional funding request.", "err");
    document.getElementById("exceptionalNote").focus();
    return;
  }

  const costRaw = clean(document.getElementById("totalCourseCost").value);
  let totalCourseCost = null;
  if (costRaw) {
    const n = Number(costRaw);
    if (!Number.isFinite(n) || n < 0) {
      setMsg("Enter a valid course cost, or leave it blank.", "err");
      return;
    }
    totalCourseCost = Math.round(n * 100) / 100;
  }

  const deliveryMethod = readRadio("deliveryMethod") || null;
  const payload = {
    submitted_by_user_id: session.user.id,
    status: "pending",
    employee_name: clean(document.getElementById("employeeName").value),
    job_title: clean(document.getElementById("jobTitle").value) || null,
    service_department: clean(document.getElementById("serviceDepartment").value) || null,
    application_date: document.getElementById("applicationDate").value || todayIso(),
    course_title: clean(document.getElementById("courseTitle").value),
    training_provider: clean(document.getElementById("trainingProvider").value),
    course_start_date: document.getElementById("courseStartDate").value || null,
    course_end_date: document.getElementById("courseEndDate").value || null,
    delivery_method: deliveryMethod,
    total_course_cost_gbp: totalCourseCost,
    why_learning: clean(document.getElementById("whyLearning").value),
    role_improvement: clean(document.getElementById("roleImprovement").value),
    participants_benefit: clean(document.getElementById("participantsBenefit").value),
    apply_share_plan: clean(document.getElementById("applySharePlan").value),
    applying_for_scheme: applyingForScheme,
    can_pay_upfront: applyingForScheme
      ? canPayUpfrontRaw === "yes"
        ? true
        : canPayUpfrontRaw === "no"
          ? false
          : null
      : null,
    requests_exceptional_funding: requestsExceptional,
    exceptional_funding_note: requestsExceptional ? exceptionalNote : null,
    declaration_accepted: document.getElementById("declaration").checked,
    origin: readOrigin(),
  };

  submitBtn.disabled = true;
  setMsg("Submitting…", "");

  const { error } = await client.from("portal_staff_ld_funding_applications").insert(payload);
  submitBtn.disabled = false;

  if (error) {
    console.warn("[ld funding] submit", error);
    setMsg(error.message || "Could not submit. Please try again or contact the office.", "err");
    return;
  }

  setMsg(
    "Application submitted. Directors will review it and confirm in writing before you enrol. Do not pay or enrol until you receive approval.",
    "ok"
  );
  form.reset();
  prefillFromProfile(profile);
  syncConditionalFields();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

void init();
