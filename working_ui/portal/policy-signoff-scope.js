/**
 * Shared policy / procedure sign-off scope.
 * Policies = everyone. Procedures = union of tags from employment contract(s).
 */
(function (global) {
  "use strict";

  /** Statuses that count toward a worker's reading list (sent + signed). */
  var ACTIVE_CONTRACT_STATUSES = [
    "awaiting_employee",
    "completed",
    "active",
    "signed",
    "sent",
    "pending",
  ];

  var DOC_SCOPE = {
    "POL-001": { kind: "policy", tags: ["all"] },
    "POL-002": { kind: "policy", tags: ["all"] },
    "POL-003": { kind: "policy", tags: ["all"] },
    "POL-004": { kind: "policy", tags: ["all"] },
    "POL-005": { kind: "policy", tags: ["all"] },
    "POL-006": { kind: "policy", tags: ["all"] },
    "POL-007": { kind: "policy", tags: ["all"] },
    "POL-008": { kind: "policy", tags: ["all"] },
    "POL-009": { kind: "policy", tags: ["all"] },
    "POL-010": { kind: "policy", tags: ["all"] },
    "POL-011": { kind: "policy", tags: ["all"] },
    "POL-012": { kind: "policy", tags: ["all"] },
    "POL-014": { kind: "procedure", tags: ["core"] },
    "POL-015": { kind: "procedure", tags: ["core"] },
    "POL-016": { kind: "procedure", tags: ["core"] },
    "POL-017": { kind: "procedure", tags: ["core"] },
    "POL-018": { kind: "procedure", tags: ["core"] },
    "POL-019": { kind: "procedure", tags: ["core"] },
    "POL-020": { kind: "procedure", tags: ["core"] },
    "POL-021": { kind: "procedure", tags: ["core"] },
    "POL-022": { kind: "procedure", tags: ["office"] },
    "POL-023": { kind: "procedure", tags: ["core"] },
    "POL-024": { kind: "procedure", tags: ["swim"] },
    "POL-025": { kind: "procedure", tags: ["climb"] },
    "POL-026": { kind: "procedure", tags: ["hub", "day_centre"] },
    "POL-027": { kind: "procedure", tags: ["fitness"] },
    "POL-028": { kind: "procedure", tags: ["hub", "day_centre"] },
    "POL-029": { kind: "procedure", tags: ["venue_acton"] },
    "POL-030": { kind: "procedure", tags: ["venue_westway"] },
    "POL-031": { kind: "procedure", tags: ["venue_swimfarm"] },
    "POL-032": { kind: "procedure", tags: ["venue_northolt"] },
    "POL-033": { kind: "procedure", tags: ["venue_acton"] },
    "POL-034": { kind: "procedure", tags: ["venue_westway"] },
    "POL-035": { kind: "procedure", tags: ["venue_swimfarm"] },
    "POL-036": { kind: "procedure", tags: ["venue_northolt"] },
    "POL-037": { kind: "procedure", tags: ["venue_hub", "hub", "day_centre"] },
    "POL-038": { kind: "procedure", tags: ["venue_hub", "hub", "day_centre"] },
    "POL-039": { kind: "procedure", tags: ["home_visit"] },
    "POL-040": { kind: "procedure", tags: ["home_visit"] },
    "POL-041": { kind: "procedure", tags: ["home_visit"] },
    "POL-042": { kind: "procedure", tags: ["core"] },
    "POL-043": { kind: "procedure", tags: ["core"] },
    "POL-044": { kind: "procedure", tags: ["core"] },
    "POL-045": { kind: "procedure", tags: ["core"] },
    "POL-046": { kind: "procedure", tags: ["core"] },
    "POL-047": { kind: "procedure", tags: ["swim"] },
    "POL-048": { kind: "procedure", tags: ["core"] },
    "POL-049": { kind: "policy", tags: ["all"] },
    "POL-050": { kind: "policy", tags: ["all"] },
    "POL-051": { kind: "policy", tags: ["all"] },
    "POL-052": { kind: "policy", tags: ["all"] },
    "POL-053": { kind: "policy", tags: ["all"] },
    "POL-054": { kind: "policy", tags: ["all"] },
    "POL-055": { kind: "policy", tags: ["all"] },
    "POL-056": { kind: "policy", tags: ["all"] },
    "POL-057": { kind: "policy", tags: ["all"] },
    "POL-058": { kind: "policy", tags: ["all"] },
    "POL-059": { kind: "policy", tags: ["all"] },
    "POL-060": { kind: "policy", tags: ["all"] },
    "POL-061": { kind: "policy", tags: ["all"] },
    "POL-062": { kind: "policy", tags: ["all"] },
    "POL-063": { kind: "policy", tags: ["all"] },
  };

  function addTag(set, tag) {
    if (!tag) return;
    if (set.indexOf(tag) < 0) set.push(tag);
  }

  function tagsFromRoleText(text, set) {
    var t = String(text || "").toLowerCase();
    if (!t) return;
    if (/swimming|\bswim\b/.test(t)) addTag(set, "swim");
    if (/climbing|\bclimb\b/.test(t)) addTag(set, "climb");
    if (/fitness|physical/.test(t)) addTag(set, "fitness");
    if (/hub\s*&\s*community|hub and community|\bhub\b|support worker|session lead/.test(t)) {
      addTag(set, "hub");
    }
    if (/day\s*centre|day center/.test(t)) addTag(set, "day_centre");
    if (/home\s*visit|lone\s*work|outreach/.test(t)) addTag(set, "home_visit");
    if (/business development|\badmin\b|\boffice\b|operations/.test(t)) addTag(set, "office");
  }

  function tagsFromPlace(place, set) {
    var p = String(place || "").toLowerCase();
    if (!p) return;
    if (/acton/.test(p)) addTag(set, "venue_acton");
    if (/westway/.test(p)) addTag(set, "venue_westway");
    if (/swimfarm|swim farm/.test(p)) addTag(set, "venue_swimfarm");
    if (/northolt/.test(p)) addTag(set, "venue_northolt");
    if (/hub/.test(p) || /clubsensational/.test(p)) {
      addTag(set, "venue_hub");
      addTag(set, "hub");
    }
  }

  function tagsFromStaffRoleSlug(slug, set) {
    var s = String(slug || "").toLowerCase().trim();
    if (s === "swimming" || s === "swim") addTag(set, "swim");
    else if (s === "climbing" || s === "climb") addTag(set, "climb");
    else if (s === "fitness" || s === "physical") addTag(set, "fitness");
    else if (s === "support" || s === "support_lead") addTag(set, "hub");
    else if (s === "manager") addTag(set, "sign_all");
    else if (s === "admin") addTag(set, "office");
  }

  function profileNameBlob(profile) {
    profile = profile || {};
    function norm(s) {
      return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }
    return norm(
      [profile.full_name, profile.username, profile.email].filter(Boolean).join(" ")
    );
  }

  /**
   * Pre-contract dual-role overrides (until employment contracts are issued).
   * Luliya / Youssef / Roberto: swimming + class support (Hub / Day Centre).
   * Bismark: climbing + class support (Hub / Day Centre).
   */
  function applyNamedDualRoleOverrides(profile, set) {
    var blob = profileNameBlob(profile);
    if (!blob) return;
    if (/\bluliya\b/.test(blob) || /\blulia\b/.test(blob)) {
      addTag(set, "swim");
      addTag(set, "hub");
      addTag(set, "day_centre");
      return;
    }
    if (/\byoussef\b/.test(blob) || /\byusef\b/.test(blob) || /\byusuf\b/.test(blob)) {
      addTag(set, "swim");
      addTag(set, "hub");
      addTag(set, "day_centre");
      return;
    }
    if (/\broberto\b/.test(blob)) {
      addTag(set, "swim");
      addTag(set, "hub");
      addTag(set, "day_centre");
      return;
    }
    if (/\bbismark\b/.test(blob) || /\bbismarck\b/.test(blob)) {
      addTag(set, "climb");
      addTag(set, "hub");
      addTag(set, "day_centre");
    }
  }

  /** Directors / managers acknowledge the full policy + procedure set. */
  function isCompanyManagerProfile(profile) {
    profile = profile || {};
    var app = String(profile.app_role || "").toLowerCase().trim();
    if (app === "manager") return true;
    var role = String(profile.staff_role || "").toLowerCase().trim();
    if (role === "manager" || role === "director") return true;

    function norm(s) {
      return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }
    var blob = norm(
      [profile.full_name, profile.username, profile.email].filter(Boolean).join(" ")
    );
    if (!blob) return false;
    // Victor Matilla, Raul Salvador Gallego, Javi Palankas (Javier Arranz Escorial)
    if (blob === "victor" || blob === "raul" || blob === "javi") return true;
    if (/\bvictor\b/.test(blob) && (/\bmatilla\b/.test(blob) || blob.indexOf("victor ") === 0)) return true;
    if (/\braul\b/.test(blob) && (/\bsalvador\b/.test(blob) || /\bgallego\b/.test(blob) || blob.indexOf("raul ") === 0)) {
      return true;
    }
    if (/\bpalankas\b/.test(blob)) return true;
    if (/\bjavier\b/.test(blob) && /\barranz\b/.test(blob)) return true;
    return false;
  }

  function isLiveContractStatus(status) {
    var s = String(status || "").toLowerCase().trim();
    if (!s) return false;
    if (/cancel|void|delet|supersed|draft|expired|rejected/.test(s)) return false;
    return ACTIVE_CONTRACT_STATUSES.indexOf(s) >= 0 || s.indexOf("await") >= 0 || s.indexOf("complet") >= 0;
  }

  /** Default venues whose emergency (and overview) procedures follow each service role. */
  function expandServiceVenueTags(set) {
    if (set.indexOf("swim") >= 0) {
      addTag(set, "venue_acton");
      addTag(set, "venue_swimfarm");
      addTag(set, "venue_northolt");
    }
    if (set.indexOf("climb") >= 0) {
      addTag(set, "venue_westway");
    }
    if (set.indexOf("fitness") >= 0) {
      addTag(set, "venue_westway");
      addTag(set, "venue_hub");
    }
    if (set.indexOf("hub") >= 0 || set.indexOf("day_centre") >= 0) {
      addTag(set, "venue_hub");
      addTag(set, "venue_westway");
    }
  }

  /**
   * Union of tags from all live contracts (+ staff_role / app_role fallback).
   * Multi-role workers get every procedure that matches any of their roles.
   * Managers / directors get sign_all (every policy and procedure).
   */
  function deriveTagsForWorker(profile, contracts) {
    var set = ["core"];
    profile = profile || {};

    if (isCompanyManagerProfile(profile)) {
      addTag(set, "sign_all");
      return set;
    }

    var app = String(profile.app_role || "").toLowerCase();
    if (app === "admin" || app === "ceo") addTag(set, "office");

    tagsFromStaffRoleSlug(profile.staff_role, set);

    (contracts || []).forEach(function (c) {
      if (c && c.status != null && !isLiveContractStatus(c.status)) return;
      var fp = c.form_payload || {};
      var kind = String(fp.contractKind || c.contract_kind || "").toLowerCase();
      if (kind.indexOf("day_centre") >= 0) {
        addTag(set, "day_centre");
        addTag(set, "hub");
      }
      var roles = fp.roles;
      if (!Array.isArray(roles) && fp.role) roles = [fp.role];
      if (!Array.isArray(roles) && c.role) roles = String(c.role).split(/[,;|/]+/);
      (roles || []).forEach(function (r) {
        tagsFromRoleText(r, set);
      });
      tagsFromRoleText(c.role, set);

      var ss = fp.serviceSettings;
      if (!Array.isArray(ss) && fp.serviceSetting) ss = [fp.serviceSetting];
      (ss || []).forEach(function (x) {
        if (/day_centre/i.test(String(x))) {
          addTag(set, "day_centre");
          addTag(set, "hub");
        }
      });

      (fp.places || []).forEach(function (pl) {
        tagsFromPlace(pl, set);
      });
    });

    // Named dual roles before contracts are issued (union with staff_role / contracts).
    applyNamedDualRoleOverrides(profile, set);

    // Role implies its usual venues, so venue emergency procedures are required too.
    expandServiceVenueTags(set);

    return set;
  }

  function docApplies(doc, workerTags) {
    if (!doc) return false;
    if (typeof doc === "string") doc = DOC_SCOPE[String(doc).toUpperCase()];
    if (!doc) return false;
    var wt = workerTags || ["core"];
    if (wt.indexOf("sign_all") >= 0) return true;
    if (doc.kind === "policy") return true;
    var tags = doc.tags || ["core"];
    if (tags.indexOf("all") >= 0) return true;
    for (var i = 0; i < tags.length; i++) {
      if (wt.indexOf(tags[i]) >= 0) return true;
    }
    return false;
  }

  function roleLabelFromTags(tags) {
    var t = tags || [];
    if (t.indexOf("sign_all") >= 0) return "Manager (all)";
    var nice = [];
    if (t.indexOf("swim") >= 0) nice.push("Swim");
    if (t.indexOf("climb") >= 0) nice.push("Climb");
    if (t.indexOf("fitness") >= 0) nice.push("Fitness");
    if (t.indexOf("hub") >= 0) nice.push("Hub");
    if (t.indexOf("day_centre") >= 0) nice.push("Day Centre");
    if (t.indexOf("home_visit") >= 0) nice.push("Home visit");
    if (t.indexOf("office") >= 0) nice.push("Office");
    return nice.join(" · ");
  }

  global.PortalPolicySignoffScope = {
    DOC_SCOPE: DOC_SCOPE,
    ACTIVE_CONTRACT_STATUSES: ACTIVE_CONTRACT_STATUSES,
    isLiveContractStatus: isLiveContractStatus,
    isCompanyManagerProfile: isCompanyManagerProfile,
    deriveTagsForWorker: deriveTagsForWorker,
    docApplies: docApplies,
    roleLabelFromTags: roleLabelFromTags,
  };
})(typeof window !== "undefined" ? window : this);
