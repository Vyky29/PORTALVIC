/**
 * Staff wellbeing check-in + SRA bridge (Supabase).
 */
(function (global) {
  "use strict";

  /** TODO: set false before production ù one check-in per staff per term */
  var ALLOW_REPEAT_CHECKIN = true;

  var DOMAINS = [
    {
      key: "demands",
      title: "Workload & Demands",
      question: "Can you manage your workload and session demands comfortably?",
    },
    {
      key: "control",
      title: "Control & Autonomy",
      question: "Do you have enough input into how your work is planned and delivered?",
    },
    {
      key: "support",
      title: "Support & Communication",
      question: "Do you receive timely support from your manager and team?",
    },
    {
      key: "relations",
      title: "Working Relationships",
      question: "Do you feel treated fairly and respectfully at work?",
    },
    {
      key: "role",
      title: "Role Clarity",
      question: "Are your responsibilities and expectations clear?",
    },
    {
      key: "change",
      title: "Change & Security",
      question: "Is organisational change communicated well, and do you feel secure in your role?",
    },
  ];

  var DOMAIN_LABELS = {
    demands: "Workload",
    control: "Control",
    support: "Support",
    relations: "Relationships",
    role: "Role",
    change: "Change",
  };

  /**
   * Chip labels are short; keys match staff_wellbeing_review.html stressorSuggestions exactly.
   */
  var CHECKIN_STRESSORS = {
    demands: [
      { key: "High workload / too many sessions", label: "High workload" },
      { key: "Back to back sessions without breaks", label: "Back-to-back sessions" },
      { key: "Unclear priorities or conflicting deadlines", label: "Unclear priorities" },
      { key: "Insufficient staffing on shift", label: "Not enough staff on shift" },
    ],
    control: [
      { key: "Limited input in planning", label: "Little input into planning" },
      { key: "Little autonomy in daily decisions", label: "Can't adjust day-to-day" },
      { key: "Rigid processes with no room to adapt", label: "Rigid processes" },
      { key: "Unclear expectations from management", label: "Unclear expectations" },
    ],
    support: [
      { key: "Unclear where to get support", label: "Unclear who to ask" },
      { key: "Manager unavailable for check-ins", label: "Hard to reach manager" },
      { key: "Information not cascaded in time", label: "Slow or late updates" },
      { key: "Limited access to EAP or wellbeing resources", label: "Limited wellbeing support" },
    ],
    relations: [
      { key: "Interpersonal conflict within the team", label: "Team tension" },
      { key: "Perceived unfair treatment", label: "Feeling unfairly treated" },
      { key: "Bullying or harassment concern", label: "Behaviour concerns" },
      { key: "Lack of recognition or feedback", label: "Feeling unheard" },
    ],
    role: [
      { key: "Unclear role boundaries", label: "Unclear expectations" },
      { key: "Responsibilities exceed capacity", label: "Too many responsibilities" },
      { key: "Unclear performance expectations", label: "Role changed recently" },
      { key: "Commute or travel burden", label: "Travel / commute burden" },
    ],
    change: [
      { key: "Poor communication during organisational change", label: "Poor communication" },
      { key: "Consultation lacking on changes affecting role", label: "Sudden changes" },
      { key: "Fear regarding job security", label: "Job security worries" },
      { key: "Rapid change without adequate support", label: "Change without support" },
    ],
  };

  /** Old check-in chip text -> SRA dropdown value */
  var LEGACY_STRESSOR_MAP = {
    "High workload": "High workload / too many sessions",
    "Back-to-back sessions": "Back to back sessions without breaks",
    "Unclear priorities": "Unclear priorities or conflicting deadlines",
    "Not enough breaks": "Back to back sessions without breaks",
    "Little input into planning": "Limited input in planning",
    "Rigid timetable": "Rigid processes with no room to adapt",
    "Can't adjust approach": "Little autonomy in daily decisions",
    "Hard to reach manager": "Manager unavailable for check-ins",
    "Unclear who to ask": "Unclear where to get support",
    "Slow responses": "Information not cascaded in time",
    "Team tension": "Interpersonal conflict within the team",
    "Feeling unheard": "Lack of recognition or feedback",
    "Behaviour concerns": "Bullying or harassment concern",
    "Unclear expectations": "Unclear expectations from management",
    "Role changed recently": "Unclear performance expectations",
    "Too many hats": "Responsibilities exceed capacity",
    "Sudden changes": "Consultation lacking on changes affecting role",
    "Poor communication": "Poor communication during organisational change",
    "Job security worries": "Fear regarding job security",
  };

  var LEVEL_ORDER = { green: 0, amber: 1, red: 2 };

  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currentTermKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var half = m <= 6 ? "H1" : "H2";
    return y + "-" + half;
  }

  function termLabel(key) {
    key = clean(key);
    var m = /^(\d{4})-(H1|H2)$/.exec(key);
    if (!m) return key || "This term";
    return m[1] + (m[2] === "H1" ? " ù JanùJun" : " ù JulùDec");
  }

  function highestLevel(domains) {
    var max = "green";
    Object.keys(domains || {}).forEach(function (k) {
      var lv = clean((domains[k] && domains[k].level) || "green").toLowerCase();
      if (LEVEL_ORDER[lv] > LEVEL_ORDER[max]) max = lv;
    });
    return max;
  }

  function domainHasConcern(entry) {
    if (!entry) return false;
    var lv = clean(entry.level || "green").toLowerCase();
    if (lv === "amber" || lv === "red") return true;
    if (clean(entry.note)) return true;
    var stressors = entry.stressors;
    return Array.isArray(stressors) && stressors.some(function (s) {
      return clean(s);
    });
  }

  function checkinHasConcerns(domains, generalNote) {
    if (clean(generalNote)) return true;
    var any = false;
    Object.keys(domains || {}).forEach(function (k) {
      if (domainHasConcern(domains[k])) any = true;
    });
    return any;
  }

  async function getAuthClient() {
    var mod = await import("/portal/auth-handler.js?v=20260605-wellbeing");
    var client = mod.getSupabaseClient && mod.getSupabaseClient();
    if (!client) throw new Error("Sign in to the portal first.");
    var userRes = await client.auth.getUser();
    var user = userRes && userRes.data && userRes.data.user;
    if (!user || !user.id) throw new Error("Sign in to the portal first.");
    var profile = null;
    try {
      var pr = await client
        .from("staff_profiles")
        .select("id,full_name,username,app_role,staff_role")
        .eq("id", user.id)
        .maybeSingle();
      if (!pr.error && pr.data) profile = pr.data;
    } catch (_) {}
    var name = clean((profile && (profile.full_name || profile.username)) || "");
    if (!name && user.email) {
      name = clean(String(user.email).split("@")[0].replace(/[._]+/g, " "));
    }
    return { client: client, user: user, profile: profile, staffName: name || "Staff member" };
  }

  function buildCheckinRow(ctx, payload) {
    var domains = payload.domains || {};
    var generalNote = clean(payload.general_note);
    var hasConcerns = checkinHasConcerns(domains, generalNote);
    var hl = highestLevel(domains);
    return {
      staff_user_id: ctx.user.id,
      staff_name: ctx.staffName,
      staff_role: clean((ctx.profile && (ctx.profile.staff_role || ctx.profile.app_role)) || ""),
      term_key: currentTermKey(),
      status: hasConcerns ? "needs_1to1" : "all_clear",
      has_concerns: hasConcerns,
      highest_level: hl,
      domains: domains,
      general_note: generalNote || null,
    };
  }

  async function submitCheckin(payload) {
    var ctx = await getAuthClient();
    var row = buildCheckinRow(ctx, payload);
    var res = await ctx.client
      .from("portal_staff_wellbeing_checkins")
      .upsert(row, { onConflict: "staff_user_id,term_key" })
      .select("id,status,has_concerns,term_key,created_at")
      .single();
    if (res.error) throw res.error;
    return { ctx: ctx, row: res.data };
  }

  async function fetchCheckinForAdmin(checkinId) {
    var ctx = await getAuthClient();
    var role = clean((ctx.profile && ctx.profile.app_role) || "").toLowerCase();
    if (role !== "admin" && role !== "ceo") {
      throw new Error("Only admin or CEO can open this review.");
    }
    var id = clean(checkinId);
    if (!id) throw new Error("Missing check-in id.");
    var res = await ctx.client
      .from("portal_staff_wellbeing_checkins")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) throw new Error("Check-in not found.");
    if (res.data.status === "needs_1to1") {
      await ctx.client
        .from("portal_staff_wellbeing_checkins")
        .update({ status: "in_progress" })
        .eq("id", id);
      res.data.status = "in_progress";
    }
    return { ctx: ctx, checkin: res.data };
  }

  async function fetchOwnCheckinThisTerm() {
    var ctx = await getAuthClient();
    var fields = ALLOW_REPEAT_CHECKIN
      ? "id,status,has_concerns,term_key,created_at,highest_level,domains,general_note"
      : "id,status,has_concerns,term_key,created_at,highest_level";
    var res = await ctx.client
      .from("portal_staff_wellbeing_checkins")
      .select(fields)
      .eq("staff_user_id", ctx.user.id)
      .eq("term_key", currentTermKey())
      .maybeSingle();
    if (res.error) throw res.error;
    return { ctx: ctx, checkin: res.data, allowRepeat: ALLOW_REPEAT_CHECKIN };
  }

  async function loadSraDraft(checkinId) {
    var ctx = await getAuthClient();
    var res = await ctx.client
      .from("portal_staff_wellbeing_sra")
      .select("draft_json,completed_at,updated_at")
      .eq("checkin_id", checkinId)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  }

  async function saveSraDraft(checkinId, draftJson, opts) {
    opts = opts || {};
    var ctx = await getAuthClient();
    var role = clean((ctx.profile && ctx.profile.app_role) || "").toLowerCase();
    if (role !== "admin" && role !== "ceo") {
      throw new Error("Only admin or CEO can save this document.");
    }
    var row = {
      checkin_id: checkinId,
      draft_json: draftJson,
      updated_at: new Date().toISOString(),
      updated_by: ctx.user.id,
    };
    if (opts.completed) {
      row.completed_at = new Date().toISOString();
      row.completed_by = ctx.user.id;
    }
    var res = await ctx.client.from("portal_staff_wellbeing_sra").upsert(row, { onConflict: "checkin_id" });
    if (res.error) throw res.error;
    if (opts.completed) {
      await ctx.client
        .from("portal_staff_wellbeing_checkins")
        .update({ status: "completed" })
        .eq("id", checkinId);
    }
    return true;
  }

  function levelToScores(level) {
    var lv = clean(level || "green").toLowerCase();
    if (lv === "red") return { s: 3, l: 3 };
    if (lv === "amber") return { s: 2, l: 2 };
    return { s: 1, l: 1 };
  }

  function resolveStressorKey(raw, selectEl) {
    var val = clean(raw);
    if (!val) return "";
    if (LEGACY_STRESSOR_MAP[val]) val = LEGACY_STRESSOR_MAP[val];
    if (selectEl) {
      for (var i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === val) return val;
      }
    }
    Object.keys(CHECKIN_STRESSORS).forEach(function (dom) {
      (CHECKIN_STRESSORS[dom] || []).forEach(function (item) {
        if (item.key === val || item.label === val) val = item.key;
      });
    });
    if (LEGACY_STRESSOR_MAP[val]) val = LEGACY_STRESSOR_MAP[val];
    return val;
  }

  function ensureDomainRows(tbody, count) {
    if (!tbody || count < 1) return;
    while (tbody.rows.length < count) {
      var clone = tbody.rows[tbody.rows.length - 1].cloneNode(true);
      clone.querySelectorAll("input, textarea, select").forEach(function (el) {
        if (el.tagName === "SELECT") el.value = "";
        else {
          el.value = "";
          if (el.classList.contains("js-score")) el.removeAttribute("style");
        }
      });
      clone.querySelectorAll(".js-s-range, .js-l-range").forEach(function (r) {
        r.value = "1";
      });
      clone.querySelectorAll(".js-band").forEach(function (b) {
        b.textContent = "";
        b.className = "js-band score-band";
      });
      clone.querySelectorAll(".js-s-name, .js-l-name").forEach(function (x) {
        x.textContent = "\u2014";
      });
      clone.querySelectorAll(".js-common-stressor").forEach(function (s) {
        s.value = "";
      });
      clone.removeAttribute("data-stressor-ui-collapsed");
      tbody.appendChild(clone);
    }
  }

  function applyScoresToRow(tr, scores) {
    var sIn = tr.querySelector(".js-s");
    var lIn = tr.querySelector(".js-l");
    var sR = tr.querySelector(".js-s-range");
    var lR = tr.querySelector(".js-l-range");
    if (sIn) sIn.value = String(scores.s);
    if (lIn) lIn.value = String(scores.l);
    if (sR) sR.value = String(scores.s);
    if (lR) lR.value = String(scores.l);
    if (typeof global.refreshRiskRow === "function") global.refreshRiskRow(tr);
  }

  function applyStressorToRow(tr, sraKey, note, scores, opts) {
    opts = opts || {};
    if (!tr) return;
    tr.removeAttribute("data-stressor-ui-collapsed");
    var detail = tr.querySelector(".js-stressor-detail");
    if (detail) detail.hidden = false;
    var sel = tr.querySelector(".js-common-stressor");
    var stText = tr.querySelector(".js-stressor-text");
    var obs = tr.querySelector(".js-obs-text");
    var resolved = sraKey ? resolveStressorKey(sraKey, sel) : "";
    var hasOption = false;
    if (sel && resolved) {
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === resolved) {
          hasOption = true;
          break;
        }
      }
    }
    if (sel) {
      if (hasOption) {
        sel.value = resolved;
        if (stText) stText.value = "";
      } else if (resolved || sraKey) {
        sel.value = "__other__";
        if (stText) stText.value = resolved || clean(sraKey);
      } else if (note) {
        sel.value = "__other__";
        if (stText) stText.value = note;
      }
    }
    if (opts.fromCheckinNote && note && obs) {
      obs.value = "From staff check-in: " + note;
    }
    applyScoresToRow(tr, scores);
    if (typeof global.refreshStressorRowPicklists === "function") {
      global.refreshStressorRowPicklists(tr);
    }
    if (typeof global.syncStressorDetailVisibility === "function") {
      global.syncStressorDetailVisibility(tr);
    }
    if (typeof global.updateNoStressorQuickVisual === "function") {
      global.updateNoStressorQuickVisual(tr);
    }
  }

  function applyCheckinToSraForm(form, checkin) {
    if (!form || !checkin) return;
    var domains = checkin.domains || {};
    var ins = form.querySelectorAll(".header-fields input");
    if (ins[0]) ins[0].value = "Stress RA ù " + (checkin.staff_name || "");
    if (ins[3] && !ins[3].value) {
      var d = new Date();
      ins[3].value =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
    }
    var cover = document.getElementById("sec-cover");
    if (cover) {
      var fields = cover.querySelectorAll("textarea, input");
      if (fields[0]) fields[0].value = checkin.staff_name || "";
      if (fields[1]) fields[1].value = checkin.staff_role || "";
      if (fields[4]) {
        fields[4].value =
          "Staff wellbeing check-in (" +
          termLabel(checkin.term_key) +
          ") ù " +
          (checkin.has_concerns ? "concerns flagged for 1-to-1" : "routine review");
      }
      if (fields[5] && checkin.general_note) {
        fields[5].value = "From check-in:\n" + checkin.general_note;
      }
    }

    var domainMap = {
      demands: "demands",
      control: "control",
      support: "support",
      relations: "relations",
      role: "role",
      change: "change",
    };

    Object.keys(domainMap).forEach(function (dk) {
      var entry = domains[dk];
      if (!domainHasConcern(entry)) return;
      var tbody = form.querySelector('.domain-tbody[data-domain="' + domainMap[dk] + '"]');
      if (!tbody || !tbody.rows.length) return;
      var note = clean(entry && entry.note);
      var stressors = ((entry && entry.stressors) || [])
        .map(function (s) {
          return clean(s);
        })
        .filter(Boolean);
      var scores = levelToScores(entry && entry.level);
      var rowCount = Math.max(1, stressors.length || (note ? 1 : 0));
      ensureDomainRows(tbody, rowCount);
      if (stressors.length) {
        stressors.forEach(function (key, i) {
          applyStressorToRow(tbody.rows[i], key, i === 0 ? note : "", scores, {
            fromCheckinNote: i === 0 && !!note,
          });
        });
      } else {
        applyStressorToRow(
          tbody.rows[0],
          null,
          note || "Concern raised in wellbeing check-in",
          scores,
          { fromCheckinNote: !!note }
        );
      }
    });
  }

  function levelLabel(level) {
    var lv = clean(level || "green").toLowerCase();
    if (lv === "red") return "Needs support soon";
    if (lv === "amber") return "Some pressure";
    return "All good";
  }

  function flaggedDomainsList(checkin) {
    var out = [];
    var domains = (checkin && checkin.domains) || {};
    Object.keys(DOMAIN_LABELS).forEach(function (key) {
      var entry = domains[key];
      if (!domainHasConcern(entry)) return;
      out.push({
        key: key,
        label: DOMAIN_LABELS[key] || key,
        level: clean((entry && entry.level) || "amber").toLowerCase(),
      });
    });
    return out;
  }

  function renderAdminBanner(checkin) {
    var host = document.getElementById("portalWellbeingAdminBanner");
    if (!host || !checkin) return;
    var name = clean(checkin.staff_name) || "Team member";
    var term = termLabel(checkin.term_key);
    var flagged = flaggedDomainsList(checkin);
    var chips = flagged
      .map(function (f) {
        var cls =
          f.level === "red"
            ? " portal-wb-admin-chip--red"
            : f.level === "amber"
              ? " portal-wb-admin-chip--amber"
              : "";
        return (
          '<span class="portal-wb-admin-chip' +
          cls +
          '">' +
          f.label +
          " ù " +
          levelLabel(f.level) +
          "</span>"
        );
      })
      .join("");
    if (!chips) {
      chips = '<span class="portal-wb-admin-chip">General note from check-in</span>';
    }
    host.innerHTML =
      '<p class="portal-wb-admin-banner__eyebrow">1-to-1 Wellbeing Review</p>' +
      "<h2>" +
      name +
      "</h2>" +
      '<p class="portal-wb-admin-banner__meta">' +
      term +
      (checkin.staff_role ? " ù " + clean(checkin.staff_role) : "") +
      (checkin.general_note
        ? '<br><span style="opacity:.9">Staff note: ù' +
          clean(checkin.general_note).replace(/"/g, "'") +
          "ù</span>"
        : "") +
      "</p>" +
      '<div class="portal-wb-admin-banner__chips">' +
      chips +
      "</div>";
    host.hidden = false;
    document.title = "1-to-1 Wellbeing Review ù " + name + " ù clubSENsational";
    var h1 = document.querySelector("#sra-form .brand h1");
    if (h1) h1.textContent = "1-to-1 Wellbeing Review ù " + name;
    var sub = document.querySelector("#sra-form .brand .subtitle");
    if (sub) sub.textContent = "Complete together ù HSE stress risk assessment";
  }

  function renderAdminQuickNav() {
    var nav = document.getElementById("portalWellbeingAdminSteps");
    if (!nav) return;
    nav.innerHTML =
      '<a href="#sec-cover">Cover</a>' +
      '<a href="#sec-demands">Workload</a>' +
      '<a href="#sec-control">Control</a>' +
      '<a href="#sec-support">Support</a>' +
      '<a href="#sec-relations">Relationships</a>' +
      '<a href="#sec-role">Role</a>' +
      '<a href="#sec-change">Change</a>' +
      '<a href="#sec-summary">Summary &amp; actions</a>' +
      '<a href="#sec-sign">Sign-off</a>';
    nav.hidden = false;
  }

  global.portalWellbeingCheckin = {
    ALLOW_REPEAT_CHECKIN: ALLOW_REPEAT_CHECKIN,
    DOMAINS: DOMAINS,
    DOMAIN_LABELS: DOMAIN_LABELS,
    CHECKIN_STRESSORS: CHECKIN_STRESSORS,
    currentTermKey: currentTermKey,
    termLabel: termLabel,
    submitCheckin: submitCheckin,
    fetchCheckinForAdmin: fetchCheckinForAdmin,
    fetchOwnCheckinThisTerm: fetchOwnCheckinThisTerm,
    loadSraDraft: loadSraDraft,
    saveSraDraft: saveSraDraft,
    applyCheckinToSraForm: applyCheckinToSraForm,
    domainHasConcern: domainHasConcern,
    checkinHasConcerns: checkinHasConcerns,
    renderAdminBanner: renderAdminBanner,
    renderAdminQuickNav: renderAdminQuickNav,
    flaggedDomainsList: flaggedDomainsList,
  };
})(typeof window !== "undefined" ? window : globalThis);
