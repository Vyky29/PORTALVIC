/**
 * Shared select / datalist options for onboarding forms (Staff Matrix / pay rates).
 */
(function (global) {
  "use strict";

  global.PORTAL_ONBOARDING_JOB_ROLES = [
    "Swimming Instructor",
    "Climbing Instructor",
    "Fitness Instructor",
    "Support Worker",
    "Service Lead",
    "Programme Lead",
    "Manager",
    "Administrator",
  ];

  global.PORTAL_ONBOARDING_STAFF_ROLE_ALIASES = {
    support: "Support Worker",
    swimming: "Swimming Instructor",
    swim: "Swimming Instructor",
    climbing: "Climbing Instructor",
    fitness: "Fitness Instructor",
    lead: "Service Lead",
    manager: "Manager",
    admin: "Administrator",
  };

  global.PORTAL_ONBOARDING_EMPLOYMENT_STATUS = [
    "Full-time",
    "Part-time",
    "Bank staff",
    "Zero-hours contract",
    "Casual",
    "Fixed-term contract",
    "Apprentice",
    "Volunteer",
  ];

  global.PORTAL_ONBOARDING_LOCATIONS = [
    "Acton Centre",
    "Westway Centre",
    "Northolt Centre",
    "SwimFarm Centre",
    "Multiple sites",
    "Office / admin",
  ];

  global.PORTAL_ONBOARDING_NATIONALITIES = [
    "British",
    "English",
    "Scottish",
    "Welsh",
    "Northern Irish",
    "Irish",
    "Spanish",
    "Italian",
    "Portuguese",
    "French",
    "German",
    "Polish",
    "Romanian",
    "Bulgarian",
    "Hungarian",
    "Lithuanian",
    "Latvian",
    "Czech",
    "Slovak",
    "Greek",
    "Turkish",
    "Indian",
    "Pakistani",
    "Bangladeshi",
    "Sri Lankan",
    "Chinese",
    "Filipino",
    "Nigerian",
    "Ghanaian",
    "South African",
    "Jamaican",
    "American",
    "Canadian",
    "Australian",
    "Brazilian",
    "Colombian",
    "Venezuelan",
  ];

  global.PORTAL_ONBOARDING_EDUCATION_LEVELS = [
    "GCSE / equivalent",
    "A-Level / BTEC Level 3",
    "BTEC / NVQ Level 2",
    "NVQ Level 3",
    "Foundation degree",
    "Bachelor's degree",
    "Master's degree",
    "Doctorate",
    "Professional qualification",
    "Other",
  ];

  global.PORTAL_ONBOARDING_CERTIFICATIONS = [
    "STA swimming teacher",
    "STA pool lifeguard",
    "NPLQ lifeguard",
    "First aid at work",
    "Emergency first aid",
    "Safeguarding children",
    "DBS checked",
    "Climbing wall instructor",
    "Mountain training",
    "Fitness instructor Level 2",
    "Fitness instructor Level 3",
    "Manual handling",
    "Food hygiene",
  ];

  global.PORTAL_ONBOARDING_AVAILABILITY_HINTS = [
    "Monday to Friday — full days",
    "Monday to Friday — mornings",
    "Monday to Friday — afternoons",
    "Weekends available",
    "Term time only",
    "School holidays only",
    "Flexible / ad hoc",
  ];

  function resolveRoleLabel(raw) {
    var key = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, " ");
    if (!key) return "";
    var aliases = global.PORTAL_ONBOARDING_STAFF_ROLE_ALIASES || {};
    if (aliases[key]) return aliases[key];
    key = key.replace(/\s+/g, "_");
    if (aliases[key]) return aliases[key];
    var roles = global.PORTAL_ONBOARDING_JOB_ROLES || [];
    for (var i = 0; i < roles.length; i++) {
      if (roles[i].toLowerCase() === String(raw || "").trim().toLowerCase()) return roles[i];
    }
    return String(raw || "").trim();
  }

  function fillSelect(selectEl, options, placeholder) {
    if (!selectEl || selectEl.tagName !== "SELECT") return;
    var current = String(selectEl.value || "");
    selectEl.innerHTML = "";
    var blank = global.document.createElement("option");
    blank.value = "";
    blank.textContent = placeholder || "Select…";
    selectEl.appendChild(blank);
    (options || []).forEach(function (opt) {
      var o = global.document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      selectEl.appendChild(o);
    });
    if (current) selectEl.value = current;
  }

  function fillDatalist(listEl, options) {
    if (!listEl) return;
    listEl.innerHTML = "";
    (options || []).forEach(function (opt) {
      var o = global.document.createElement("option");
      o.value = opt;
      listEl.appendChild(o);
    });
  }

  global.portalOnboardingFormInitJobOptions = function portalOnboardingFormInitJobOptions(form) {
    if (!form) return;
    fillSelect(form.elements.namedItem("role"), global.PORTAL_ONBOARDING_JOB_ROLES, "Select role…");
    fillSelect(
      form.elements.namedItem("status"),
      global.PORTAL_ONBOARDING_EMPLOYMENT_STATUS,
      "Select status…"
    );
    fillSelect(
      form.elements.namedItem("location"),
      global.PORTAL_ONBOARDING_LOCATIONS,
      "Select location…"
    );
    fillDatalist(global.document.getElementById("jobNationalityList"), global.PORTAL_ONBOARDING_NATIONALITIES);
    fillDatalist(global.document.getElementById("jobEducationList"), global.PORTAL_ONBOARDING_EDUCATION_LEVELS);
    fillDatalist(
      global.document.getElementById("jobCertificationsList"),
      global.PORTAL_ONBOARDING_CERTIFICATIONS
    );
    fillDatalist(
      global.document.getElementById("jobAvailabilityList"),
      global.PORTAL_ONBOARDING_AVAILABILITY_HINTS
    );
  };

  global.portalOnboardingFormInitHealthOptions = function portalOnboardingFormInitHealthOptions(form) {
    if (!form) return;
    fillSelect(form.elements.namedItem("role"), global.PORTAL_ONBOARDING_JOB_ROLES, "Select role…");
  };

  global.portalOnboardingFormResolveRoleLabel = resolveRoleLabel;
})(typeof window !== "undefined" ? window : globalThis);
