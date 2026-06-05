/**
 * Staff wellbeing check-in + SRA bridge (Supabase).
 */
(function (global) {
 "use strict";

 /** TODO: set false before production - one check-in per staff per term */
 var ALLOW_REPEAT_CHECKIN = true;

 function stressorCatalog() {
 return global.portalWellbeingStressorCatalog || null;
 }

 var FALLBACK_DOMAIN_ORDER = ["demands", "control", "support", "relations", "role", "change"];
 var FALLBACK_DOMAIN_SECTION_TITLES = {
 demands: "Workload and job demands",
 control: "Job control",
 support: "Support, resources and communication",
 relations: "Work relationships",
 role: "Job role and conditions",
 change: "Job security and change",
 };
 var FALLBACK_DOMAIN_QUESTIONS = {
 demands: "Can you manage your workload and session demands comfortably?",
 control: "Do you have enough input into how your work is planned and delivered?",
 support: "Do you receive timely support from your manager and team?",
 relations: "Do you feel treated fairly and respectfully at work?",
 role: "Are your responsibilities and expectations clear?",
 change: "Is organisational change communicated well, and do you feel secure in your role?",
 };

 function getDomains() {
 var cat = stressorCatalog();
 if (cat && cat.buildDomains) return cat.buildDomains();
 return FALLBACK_DOMAIN_ORDER.map(function (key) {
 return {
 key: key,
 title: FALLBACK_DOMAIN_SECTION_TITLES[key],
 question: FALLBACK_DOMAIN_QUESTIONS[key],
 };
 });
 }

 function getDomainLabels() {
 var cat = stressorCatalog();
 if (cat && cat.DOMAIN_SECTION_TITLES) {
 return Object.assign({}, cat.DOMAIN_SECTION_TITLES);
 }
 return Object.assign({}, FALLBACK_DOMAIN_SECTION_TITLES);
 }

 function getCheckinStressors() {
 var cat = stressorCatalog();
 return cat && cat.buildCheckinStressors ? cat.buildCheckinStressors() : {};
 }

 function resolveStressorKey(raw, selectEl) {
 var cat = stressorCatalog();
 var val = cat && cat.resolveKey ? cat.resolveKey(raw) : clean(raw);
 if (!val) return "";
 if (selectEl) {
 for (var i = 0; i < selectEl.options.length; i++) {
 if (selectEl.options[i].value === val) return val;
 }
 }
 return val;
 }

 function stressorShortLabel(key) {
 var cat = stressorCatalog();
 return cat && cat.shortLabel ? cat.shortLabel(key) : clean(key);
 }

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
 return m[1] + (m[2] === "H1" ? " | Jan-Jun" : " | Jul-Dec");
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

 function normalizeDomains(domains) {
 var out = {};
 Object.keys(domains || {}).forEach(function (key) {
 var entry = domains[key] || {};
 var stressors = (entry.stressors || [])
 .map(function (s) {
 return resolveStressorKey(s);
 })
 .filter(Boolean);
 stressors = stressors.filter(function (s, i) {
 return stressors.indexOf(s) === i;
 });
 out[key] = {
 level: clean(entry.level || "green").toLowerCase() || "green",
 note: clean(entry.note),
 stressors: stressors,
 };
 });
 return out;
 }

 function buildCheckinRow(ctx, payload) {
 var domains = normalizeDomains(payload.domains || {});
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
 if (ins[0]) ins[0].value = "Stress RA - " + (checkin.staff_name || "");
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
 ") - " +
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
 return resolveStressorKey(s);
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
 var labels = getDomainLabels();
 Object.keys(labels).forEach(function (key) {
 var entry = domains[key];
 if (!domainHasConcern(entry)) return;
 var stressors = ((entry && entry.stressors) || [])
 .map(function (s) {
 return resolveStressorKey(s);
 })
 .filter(Boolean)
 .map(function (s) {
 return stressorShortLabel(s);
 });
 out.push({
 key: key,
 label: labels[key] || key,
 level: clean((entry && entry.level) || "amber").toLowerCase(),
 stressors: stressors,
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
 var stressorTxt =
 f.stressors && f.stressors.length
 ? " - " + f.stressors.join(", ")
 : "";
 return (
 '<span class="portal-wb-admin-chip' +
 cls +
 '">' +
 f.label +
 " - " +
 levelLabel(f.level) +
 stressorTxt +
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
 (checkin.staff_role ? " - " + clean(checkin.staff_role) : "") +
 (checkin.general_note
 ? '<br><span style="opacity:.9">Staff note: "' +
 clean(checkin.general_note).replace(/"/g, "'") +
 '"</span>'
 : "") +
 "</p>" +
 '<div class="portal-wb-admin-banner__chips">' +
 chips +
 "</div>";
 host.hidden = false;
 document.title = "1-to-1 Wellbeing Review - " + name + " - clubSENsational";
 var h1 = document.querySelector("#sra-form .brand h1");
 if (h1) h1.textContent = "1-to-1 Wellbeing Review - " + name;
 var sub = document.querySelector("#sra-form .brand .subtitle");
 if (sub) sub.textContent = "Complete together | HSE stress risk assessment";
 }

 function renderAdminQuickNav() {
 var nav = document.getElementById("portalWellbeingAdminSteps");
 if (!nav) return;
 var cat = stressorCatalog();
 var order = (cat && cat.DOMAIN_ORDER) || [
 "demands",
 "control",
 "support",
 "relations",
 "role",
 "change",
 ];
 var titles = (cat && cat.DOMAIN_SECTION_TITLES) || getDomainLabels();
 var links =
 '<a href="#sec-cover">Cover</a>' +
 order
 .map(function (key) {
 return (
 '<a href="#sec-' +
 key +
 '">' +
 (titles[key] || key) +
 "</a>"
 );
 })
 .join("") +
 '<a href="#sec-summary">Summary &amp; actions</a>' +
 '<a href="#sec-sign">Sign-off</a>';
 nav.innerHTML = links;
 nav.hidden = false;
 }

 global.portalWellbeingCheckin = {
 ALLOW_REPEAT_CHECKIN: ALLOW_REPEAT_CHECKIN,
 get DOMAINS() {
 return getDomains();
 },
 get DOMAIN_LABELS() {
 return getDomainLabels();
 },
 getDomainsList: getDomains,
 getCheckinStressors: getCheckinStressors,
 resolveStressorKey: resolveStressorKey,
 stressorShortLabel: stressorShortLabel,
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
