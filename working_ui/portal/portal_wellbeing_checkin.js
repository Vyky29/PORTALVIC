/**
 * Staff wellbeing check-in + SRA bridge (Supabase).
 */
(function (global) {
  "use strict";

  var DOMAINS = [
    { key: "demands", title: "Workload & demands", question: "Can you cope with your workload and session demands?" },
    { key: "control", title: "Control & input", question: "Do you have enough say in how your work is organised?" },
    { key: "support", title: "Support & communication", question: "Do you get enough support from your manager and team?" },
    { key: "relations", title: "Relationships", question: "Do you feel treated fairly and respectfully at work?" },
    { key: "role", title: "Role clarity", question: "Is your role and what is expected of you clear?" },
    { key: "change", title: "Change & security", question: "Is change communicated well and do you feel secure in your role?" },
  ];

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
    return m[1] + (m[2] === "H1" ? " · Jan–Jun" : " · Jul–Dec");
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
    var res = await ctx.client
      .from("portal_staff_wellbeing_checkins")
      .select("id,status,has_concerns,term_key,created_at,highest_level")
      .eq("staff_user_id", ctx.user.id)
      .eq("term_key", currentTermKey())
      .maybeSingle();
    if (res.error) throw res.error;
    return { ctx: ctx, checkin: res.data };
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

  function applyCheckinToSraForm(form, checkin) {
    if (!form || !checkin) return;
    var domains = checkin.domains || {};
    var ins = form.querySelectorAll(".header-fields input");
    if (ins[0]) ins[0].value = "Stress RA — " + (checkin.staff_name || "");
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
          ") — " +
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
      var tr = tbody.rows[0];
      var detail = tr.querySelector(".js-stressor-detail");
      if (detail) detail.hidden = false;
      tr.setAttribute("data-stressor-ui-collapsed", "0");
      var stressors = (entry && entry.stressors) || [];
      var stText = tr.querySelector(".js-stressor-text");
      var obs = tr.querySelector(".js-obs-text");
      var note = clean(entry && entry.note);
      var lines = [];
      if (stressors.length) lines.push(stressors.join("; "));
      if (note) lines.push(note);
      if (stText) stText.value = stressors[0] || note || "Concern raised in wellbeing check-in";
      if (obs) {
        obs.value =
          (note ? note + "\n" : "") +
          (stressors.length > 1 ? "Also: " + stressors.slice(1).join("; ") : "");
      }
      var scores = levelToScores(entry && entry.level);
      var sIn = tr.querySelector(".js-s");
      var lIn = tr.querySelector(".js-l");
      var sR = tr.querySelector(".js-s-range");
      var lR = tr.querySelector(".js-l-range");
      if (sIn) sIn.value = String(scores.s);
      if (lIn) lIn.value = String(scores.l);
      if (sR) sR.value = String(scores.s);
      if (lR) lR.value = String(scores.l);
      if (typeof global.refreshRiskRow === "function") global.refreshRiskRow(tr);
    });
  }

  global.portalWellbeingCheckin = {
    DOMAINS: DOMAINS,
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
  };
})(typeof window !== "undefined" ? window : globalThis);
