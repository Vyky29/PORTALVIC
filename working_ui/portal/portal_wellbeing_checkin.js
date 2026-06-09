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
 var FALLBACK_DOMAIN_DESCRIPTIONS = {
 demands: "Workload, pace, and whether demands match your hours and skills.",
 control: "Your input into planning work and room to adapt day to day.",
 support: "Timely manager support, information, and wellbeing resources.",
 relations: "Fair treatment, respect, and relationships with colleagues.",
 role: "Clarity about responsibilities, expectations, and working conditions.",
 change: "How change is communicated and how secure you feel in your role.",
 };

 function getDomains() {
 var cat = stressorCatalog();
 if (cat && cat.buildDomains) return cat.buildDomains();
 return FALLBACK_DOMAIN_ORDER.map(function (key) {
 return {
 key: key,
 title: FALLBACK_DOMAIN_SECTION_TITLES[key],
 question: FALLBACK_DOMAIN_QUESTIONS[key],
 description: FALLBACK_DOMAIN_DESCRIPTIONS[key] || "",
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

 function resolveStressorKey(raw, domKeyOrSelectEl, selectEl) {
 var domKey = null;
 var sel = null;
 if (typeof domKeyOrSelectEl === "string") {
 domKey = domKeyOrSelectEl;
 sel = selectEl;
 } else if (domKeyOrSelectEl && domKeyOrSelectEl.options) {
 sel = domKeyOrSelectEl;
 }
 var cat = stressorCatalog();
 var val = "";
 if (cat && domKey && cat.resolveKeyForDomain) {
 val = cat.resolveKeyForDomain(raw, domKey);
 } else if (cat && cat.resolveKey) {
 val = cat.resolveKey(raw);
 } else {
 val = clean(raw);
 }
 if (!val) return "";
 if (sel) {
 for (var i = 0; i < sel.options.length; i++) {
 if (sel.options[i].value === val) return val;
 }
 }
 return val;
 }

 function stressorKeysForDomain(domKey) {
 var cat = stressorCatalog();
 if (cat && cat.stressorKeysForDomain) return cat.stressorKeysForDomain(domKey);
 return [];
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

 var TERM_SEASON_LABELS = {
 autumn: "Autumn Term",
 spring: "Spring Term",
 summer: "Summer Term",
 };

 function todayIsoLocal() {
 var d = new Date();
 return (
 d.getFullYear() +
 "-" +
 String(d.getMonth() + 1).padStart(2, "0") +
 "-" +
 String(d.getDate()).padStart(2, "0")
 );
 }

 /** Same season boundaries as admin-sessions-hub termLabelFromRange. */
 function seasonFromMonth(month) {
 var m = Number(month) || 0;
 if (m >= 4 && m <= 7) return "summer";
 if (m >= 9 && m <= 12) return "autumn";
 if (m >= 1 && m <= 3) return "spring";
 return "summer";
 }

 function termKeyFromSeason(year, season) {
 return String(year) + "-" + clean(season).toLowerCase();
 }

 function parsePortalTermName(termName) {
 var m = /^(Autumn|Spring|Summer)\s+Term\s+(\d{4})$/i.exec(clean(termName));
 if (!m) return null;
 return termKeyFromSeason(m[2], m[1].toLowerCase());
 }

 function currentTermKey() {
 var timetable = global.PORTAL_TERM_FROM_TIMETABLE;
 if (timetable && timetable.firstDate && timetable.lastDate) {
 var today = todayIsoLocal();
 var from = String(timetable.firstDate).slice(0, 10);
 var to = String(timetable.lastDate).slice(0, 10);
 if (today >= from && today <= to) {
 var fromName = parsePortalTermName(timetable.termName);
 if (fromName) return fromName;
 var y =
 Number(timetable.termCalendarYear) ||
 parseInt(String(from).slice(0, 4), 10) ||
 new Date().getFullYear();
 return termKeyFromSeason(y, seasonFromMonth(parseInt(String(from).slice(5, 7), 10)));
 }
 }
 var d = new Date();
 return termKeyFromSeason(d.getFullYear(), seasonFromMonth(d.getMonth() + 1));
 }

 function legacyHalfToSeason(half) {
 var m = new Date().getMonth() + 1;
 if (half === "H1") return m <= 3 ? "spring" : "summer";
 return m >= 9 ? "autumn" : "summer";
 }

 function termLabel(key) {
 key = clean(key);
 if (!key) return "This term";
 var seasonMatch = /^(\d{4})-(autumn|spring|summer)$/.exec(key);
 if (seasonMatch) {
 return (
 TERM_SEASON_LABELS[seasonMatch[2]] ||
 seasonMatch[2].charAt(0).toUpperCase() + seasonMatch[2].slice(1) + " Term"
 ) +
 " " +
 seasonMatch[1];
 }
 var legacyHalf = /^(\d{4})-(H1|H2)$/.exec(key);
 if (legacyHalf) {
 var season = legacyHalfToSeason(legacyHalf[2]);
 return (TERM_SEASON_LABELS[season] || "Term") + " " + legacyHalf[1];
 }
 if (TERM_SEASON_LABELS[key]) return TERM_SEASON_LABELS[key];
 return key;
 }

 function currentTermLabel() {
 return termLabel(currentTermKey());
 }

 function highestLevel(domains) {
 var max = "green";
 Object.keys(domains || {}).forEach(function (k) {
 var lv = clean((domains[k] && domains[k].level) || "green").toLowerCase();
 if (LEVEL_ORDER[lv] > LEVEL_ORDER[max]) max = lv;
 });
 return max;
 }

 function domainResponse(entry) {
 if (!entry) return "all_good";
 var response = clean(entry.response || "").toLowerCase();
 if (response === "support_requested" || response === "all_good") return response;
 var lv = clean(entry.level || "green").toLowerCase();
 if (lv === "amber" || lv === "red") return "support_requested";
 return "all_good";
 }

 function domainHasConcern(entry) {
 if (!entry) return false;
 if (domainResponse(entry) === "support_requested") return true;
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

 async function waitForAuthSession(client, maxMs) {
 maxMs = maxMs || 2800;
 var session = null;
 try {
 var box = global.__PORTAL_SUPABASE__;
 if (box && box.session && box.session.user && box.session.user.id) return box.session;
 } catch (_) {}
 try {
 var r = await client.auth.getSession();
 session = r && r.data && r.data.session;
 } catch (_) {}
 if (session && session.user && session.user.id) return session;
 try {
 var ur = await client.auth.getUser();
 if (ur && ur.data && ur.data.user && ur.data.user.id) {
 var r2 = await client.auth.getSession();
 session = r2 && r2.data && r2.data.session;
 if (session && session.user && session.user.id) return session;
 }
 } catch (_) {}
 return await new Promise(function (resolve) {
 var t = null;
 var subWrap = client.auth.onAuthStateChange(function (event, next) {
 if (next && next.user && next.user.id && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
 if (t != null) clearTimeout(t);
 try {
 subWrap.data.subscription.unsubscribe();
 } catch (_) {}
 resolve(next);
 }
 });
 t = setTimeout(function () {
 try {
 subWrap.data.subscription.unsubscribe();
 } catch (_) {}
 resolve(null);
 }, maxMs);
 });
 }

 async function getAuthClient() {
 if (global.__portalWellbeingAuthReady) {
 try {
 await global.__portalWellbeingAuthReady;
 } catch (_) {}
 }
 var sbMod = await import("/portal/supabase-client.js?v=20260610-wellbeing-auth");
 var client =
 (sbMod.getSharedSupabaseClient && sbMod.getSharedSupabaseClient()) ||
 (await import("/portal/auth-handler.js?v=20260610-wellbeing-auth")).getSupabaseClient();
 if (!client) throw new Error("Sign in to the portal first.");
 var session = await waitForAuthSession(client, 2800);
 var user = session && session.user;
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
 var allowed = stressorKeysForDomain(key);
 var stressors = (entry.stressors || [])
 .map(function (s) {
 return resolveStressorKey(s, key);
 })
 .filter(Boolean)
 .filter(function (s) {
 return !allowed.length || allowed.indexOf(s) >= 0;
 });
 stressors = stressors.filter(function (s, i) {
 return stressors.indexOf(s) === i;
 });
 var response = domainResponse(entry);
 out[key] = {
 response: response,
 level: response === "support_requested" ? "red" : "green",
 note: clean(entry.note),
 stressors: stressors,
 };
 });
 return out;
 }

 function cloneDomainsFromCheckin(domains) {
 var out = {};
 Object.keys(domains || {}).forEach(function (key) {
 var entry = domains[key] || {};
 var allowed = stressorKeysForDomain(key);
 var stressors = (entry.stressors || [])
 .map(function (s) {
 return resolveStressorKey(s, key);
 })
 .filter(Boolean)
 .filter(function (s) {
 return !allowed.length || allowed.indexOf(s) >= 0;
 });
 stressors = stressors.filter(function (s, i) {
 return stressors.indexOf(s) === i;
 });
 var response = domainResponse(entry);
 out[key] = {
 response: response,
 level: response === "support_requested" ? "red" : "green",
 note: clean(entry.note),
 stressors: stressors.slice(),
 };
 });
 return out;
 }

 async function fetchStaffEmploymentContext(client, staffUserId) {
 var uid = clean(staffUserId);
 if (!client || !uid) {
 return { roles: [], sites: [], deptSiteText: "", rolesText: "" };
 }
 var roles = [];
 var sites = [];
 var profile = null;
 try {
 var pr = await client
 .from("staff_profiles")
 .select("staff_role,full_name")
 .eq("id", uid)
 .maybeSingle();
 if (!pr.error && pr.data) profile = pr.data;
 } catch (_) {}
 try {
 var rr = await client
 .from("staff_role_rates")
 .select("role,is_primary")
 .eq("user_id", uid)
 .order("is_primary", { ascending: false });
 if (!rr.error && rr.data) {
 rr.data.forEach(function (row) {
 var role = clean(row.role);
 if (role && roles.indexOf(role) < 0) roles.push(role);
 });
 }
 } catch (_) {}
 if (!roles.length && profile && profile.staff_role) {
 roles.push(clean(profile.staff_role));
 }
 try {
 var since = new Date();
 since.setMonth(since.getMonth() - 6);
 var sinceStr =
 since.getFullYear() +
 "-" +
 String(since.getMonth() + 1).padStart(2, "0") +
 "-" +
 String(since.getDate()).padStart(2, "0");
 var sv = await client
 .from("schedule_overrides")
 .select("anchor_venue")
 .eq("anchor_staff_id", uid)
 .gte("session_date", sinceStr);
 if (!sv.error && sv.data) {
 sv.data.forEach(function (row) {
 var venue = clean(row.anchor_venue);
 if (venue && sites.indexOf(venue) < 0) sites.push(venue);
 });
 }
 } catch (_) {}
 var lines = [];
 if (roles.length && sites.length) {
 var n = Math.max(roles.length, sites.length);
 for (var i = 0; i < n; i++) {
 lines.push((roles[i] || roles[0]) + " | " + (sites[i] || sites[0]));
 }
 } else if (roles.length) {
 lines = roles.slice();
 } else if (sites.length) {
 lines = sites.slice();
 }
 return {
 roles: roles,
 sites: sites,
 rolesText: roles.join(", "),
 deptSiteText: lines.join("\n"),
 };
 }

 function applyStaffEmploymentToSraForm(form, employment, checkin) {
 if (!form || !employment) return;
 var ins = form.querySelectorAll(".header-fields input");
 if (ins[1] && employment.deptSiteText) {
 ins[1].value = employment.deptSiteText;
 }
 var cover = document.getElementById("sec-cover");
 if (cover) {
 var rolesEl = cover.querySelector(".js-wb-cover-roles");
 var rolesText = employment.rolesText || clean((checkin && checkin.staff_role) || "");
 if (rolesEl && rolesText && !clean(rolesEl.value)) {
 rolesEl.value = rolesText;
 }
 }
 }

 function markDomainSectionAllClear(sec) {
 if (!sec || sec.classList.contains("portal-wb-domain-all-clear")) return;
 sec.classList.add("portal-wb-domain-all-clear");
 if (sec.querySelector(".portal-wb-all-clear-note")) return;
 var note = document.createElement("p");
 note.className = "portal-wb-all-clear-note";
 note.textContent = "All good at staff check-in - no review needed for this area.";
 var h2 = sec.querySelector(".section-title, h2");
 if (h2 && h2.nextSibling) sec.insertBefore(note, h2.nextSibling);
 else if (h2) h2.insertAdjacentElement("afterend", note);
 else sec.insertBefore(note, sec.firstChild);
 }

 function applyDomainAllClearRow(tr) {
 if (!tr) return;
 tr.setAttribute("data-checkin-all-clear", "1");
 tr.removeAttribute("data-checkin-stressor");
 tr.removeAttribute("data-stressor-ui-collapsed");
 var sel = tr.querySelector(".js-common-stressor");
 var stText = tr.querySelector(".js-stressor-text");
 var obs = tr.querySelector(".js-obs-text");
 if (sel) sel.value = "__none__";
 if (stText) stText.value = "";
 if (obs) obs.value = "All good at staff check-in. No review needed.";
 applyScoresToRow(tr, { s: 1, l: 1 });
 var detail = tr.querySelector(".js-stressor-detail");
 if (detail) detail.hidden = true;
 if (typeof global.refreshRiskRow === "function") global.refreshRiskRow(tr);
 if (typeof global.updateNoStressorQuickVisual === "function") {
 global.updateNoStressorQuickVisual(tr);
 }
 }

 function applyDomainAllClear(tbody, sec) {
 if (!tbody || !tbody.rows.length) return;
 while (tbody.rows.length > 1) {
 tbody.deleteRow(tbody.rows.length - 1);
 }
 applyDomainAllClearRow(tbody.rows[0]);
 if (sec) markDomainSectionAllClear(sec);
 }

 function applyConcernDomainFromCheckin(tbody, entry, dk) {
 var note = clean(entry && entry.note);
 var stressors = ((entry && entry.stressors) || [])
 .map(function (s) {
 return resolveStressorKey(s, dk);
 })
 .filter(Boolean);
 var scores = levelToScores(entry && entry.level);
 var rowCount = Math.max(1, stressors.length || (note ? 1 : 0));
 ensureDomainRows(tbody, rowCount);
 if (stressors.length) {
 stressors.forEach(function (key, i) {
 applyStressorToRow(tbody.rows[i], key, i === 0 ? note : "", scores, {
 fromCheckinNote: i === 0 && !!note,
 fromCheckinStressor: true,
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
 }

 function eachCheckinDomain(form, checkin, fn) {
 var domains = (checkin && checkin.domains) || {};
 var domainMap = {
 demands: "demands",
 control: "control",
 support: "support",
 relations: "relations",
 role: "role",
 change: "change",
 };
 Object.keys(domainMap).forEach(function (dk) {
 var tbody = form.querySelector('.domain-tbody[data-domain="' + domainMap[dk] + '"]');
 var sec = document.getElementById("sec-" + dk);
 if (!tbody || !tbody.rows.length) return;
 fn(dk, domains[dk], tbody, sec);
 });
 }

 function applyCheckinDomainsToSraForm(form, checkin) {
 if (!form || !checkin) return;
 eachCheckinDomain(form, checkin, function (dk, entry, tbody, sec) {
 if (sec) sec.classList.remove("portal-wb-domain-all-clear");
 var oldNote = sec && sec.querySelector(".portal-wb-all-clear-note");
 if (oldNote) oldNote.remove();
 tbody.querySelectorAll("tr").forEach(function (tr) {
 tr.removeAttribute("data-checkin-all-clear");
 });
 if (!domainHasConcern(entry)) {
 applyDomainAllClear(tbody, sec);
 return;
 }
 applyConcernDomainFromCheckin(tbody, entry, dk);
 });
 }

 function reapplyAllClearDomainsFromCheckin(form, checkin) {
 if (!form || !checkin) return;
 eachCheckinDomain(form, checkin, function (dk, entry, tbody, sec) {
 if (domainHasConcern(entry)) return;
 applyDomainAllClear(tbody, sec);
 });
 }

 function isTextareaVoiceEligible(ta) {
 if (!ta || ta.tagName !== "TEXTAREA") return false;
 if (ta.closest(".portal-wb-domain-all-clear")) return false;
 if (ta.closest(".portal-wb-cover-hr, .portal-wb-cover-controls, .portal-wb-cover-observations")) return false;
 if (ta.closest(".portal-wb-admin-hide")) return false;
 if (ta.hidden) return false;
 var tr = ta.closest("tr");
 if (tr && tr.style && tr.style.display === "none") return false;
 var rect = ta.getBoundingClientRect();
 if (rect.width <= 0 && rect.height <= 0) return false;
 return true;
 }

 function voiceNameFromProfile(profile) {
 return clean((profile && (profile.full_name || profile.username)) || "");
 }

 function wireWellbeingReviewVoice(form, staffName) {
 if (!form || typeof global.PortalFeedbackVoiceInput === "undefined") return;
 var ids = [];
 var seen = {};
 var n = 0;
 function addTextarea(ta) {
 if (!isTextareaVoiceEligible(ta)) return;
 if (!ta.id) {
 ta.id = "wb-sra-voice-" + n;
 n += 1;
 }
 if (seen[ta.id]) return;
 if (ta.dataset.portalFbVoiceWired === "1") {
 seen[ta.id] = 1;
 ids.push(ta.id);
 return;
 }
 seen[ta.id] = 1;
 ids.push(ta.id);
 }
 ["wbConversationNotes", "wbAgreedActions", "wbEscalationNotes"].forEach(function (id) {
 addTextarea(document.getElementById(id));
 });
 form
 .querySelectorAll(
 "#portalWbClosingHost textarea, #portalWbDecisionsHost textarea, #portalWbAdvancedWrap textarea.js-obs-text, #portalWbAdvancedWrap textarea.js-controls-text"
 )
 .forEach(addTextarea);
 if (!ids.length) return;
 global.PortalFeedbackVoiceInput.attach({
 fields: ids,
 staffName: staffName || "",
 });
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

 function portalWellbeingSubmitError(err) {
 var msg = String((err && err.message) || err || "");
 if (/row-level security/i.test(msg)) {
 return new Error(
 "Could not save your check-in yet. Please try again in a moment — if it keeps failing, ask an admin to run database/fix_wellbeing_staff_submit.sql in Supabase."
 );
 }
 if (/portal_wellbeing_staff_upsert_checkin/i.test(msg) && /does not exist/i.test(msg)) {
 return new Error(
 "Check-in save is not fully set up in the database yet. Ask an admin to run database/fix_wellbeing_staff_submit.sql in Supabase."
 );
 }
 return err instanceof Error ? err : new Error(msg || "Could not save check-in.");
 }

 function mapCheckinRpcRow(data) {
 if (!data || typeof data !== "object") return null;
 return {
 id: data.id,
 status: data.status,
 has_concerns: data.has_concerns,
 term_key: data.term_key,
 created_at: data.created_at,
 };
 }

 async function submitCheckinViaRpc(client, row) {
 var rpc = await client.rpc("portal_wellbeing_staff_upsert_checkin", { p_row: row });
 if (rpc.error) throw portalWellbeingSubmitError(rpc.error);
 var mapped = mapCheckinRpcRow(rpc.data);
 if (!mapped || !mapped.id) throw new Error("Check-in saved but response was incomplete.");
 return mapped;
 }

 async function submitCheckin(payload) {
 var ctx = await getAuthClient();
 var row = buildCheckinRow(ctx, payload);
 var res = await ctx.client
 .from("portal_staff_wellbeing_checkins")
 .upsert(row, { onConflict: "staff_user_id,term_key" })
 .select("id,status,has_concerns,term_key,created_at")
 .single();
 if (!res.error) return { ctx: ctx, row: res.data };
 var msg = String((res.error && res.error.message) || "");
 if (/row-level security/i.test(msg)) {
 try {
 var viaRpc = await submitCheckinViaRpc(ctx.client, row);
 return { ctx: ctx, row: viaRpc };
 } catch (rpcErr) {
 throw portalWellbeingSubmitError(rpcErr);
 }
 }
 throw portalWellbeingSubmitError(res.error);
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
 if (res.data.status === "needs_1to1" || res.data.status === "awaiting_1to1") {
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

 async function resolveWellbeingNotifications(client, checkinId) {
 if (!client || !checkinId) return;
 await client
 .from("portal_wellbeing_admin_notifications")
 .update({ read_at: new Date().toISOString() })
 .eq("checkin_id", checkinId)
 .is("read_at", null);
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
 var finalStatus = "completed";
 if (draftJson && typeof draftJson === "object" && !Array.isArray(draftJson)) {
 var outcome = clean((draftJson.simple && draftJson.simple.outcome) || opts.outcome || "").toLowerCase();
 if (outcome === "monitoring" || outcome === "ongoing_support") finalStatus = "monitoring";
 }
 await ctx.client
 .from("portal_staff_wellbeing_checkins")
 .update({ status: finalStatus })
 .eq("id", checkinId);
 await resolveWellbeingNotifications(ctx.client, checkinId);
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
 x.textContent = "-";
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

 function ensureCheckinStressorBadge(tr) {
 if (!tr) return null;
 var cell = tr.querySelector(".stressor-cell");
 if (!cell) return null;
 var badge = cell.querySelector(".portal-wb-checkin-stressor-badge");
 if (!badge) {
 badge = document.createElement("div");
 badge.className = "portal-wb-checkin-stressor-badge";
 badge.setAttribute("aria-live", "polite");
 cell.insertBefore(badge, cell.firstChild);
 }
 return badge;
 }

 function setCheckinStressorBadge(tr, label) {
 var badge = ensureCheckinStressorBadge(tr);
 if (!badge) return;
 var text = clean(label);
 if (!text) {
 badge.hidden = true;
 badge.textContent = "";
 tr.removeAttribute("data-wb-checkin-stressor-label");
 return;
 }
 badge.hidden = false;
 badge.textContent = text;
 tr.setAttribute("data-wb-checkin-stressor-label", text);
 }

 function lockStressorRowFromCheckin(tr) {
 if (!tr) return;
 tr.setAttribute("data-checkin-stressor", "1");
 tr.classList.add("portal-wb-stressor-readonly");
 var quick = tr.querySelector(".stressor-quick");
 if (quick) quick.hidden = true;
 var detail = tr.querySelector(".js-stressor-detail");
 if (detail) detail.hidden = true;
 var noneBtn = tr.querySelector(".btn-no-stressor");
 if (noneBtn) noneBtn.hidden = true;
 var sel = tr.querySelector(".js-common-stressor");
 if (sel) {
 sel.setAttribute("aria-hidden", "true");
 sel.tabIndex = -1;
 Array.prototype.slice.call(sel.options).forEach(function (opt) {
 if (opt.value === "__none__") opt.remove();
 });
 if (sel.value === "__none__") sel.value = "";
 }
 var stText = tr.querySelector(".js-stressor-text");
 if (stText) {
 stText.setAttribute("aria-hidden", "true");
 stText.tabIndex = -1;
 }
 }

 function applyStressorToRow(tr, sraKey, note, scores, opts) {
 opts = opts || {};
 if (!tr) return;
 tr.removeAttribute("data-stressor-ui-collapsed");
 var detail = tr.querySelector(".js-stressor-detail");
 if (detail) detail.hidden = false;
 var tb = tr.closest(".domain-tbody");
 var domKey = tb ? tb.getAttribute("data-domain") : "";
 var sel = tr.querySelector(".js-common-stressor");
 var stText = tr.querySelector(".js-stressor-text");
 var obs = tr.querySelector(".js-obs-text");
 var resolved = sraKey ? resolveStressorKey(sraKey, domKey, sel) : "";
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
 if (resolved) sel.dataset.wbPrevStressor = resolved;
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
 if (opts.fromCheckinStressor) {
 var badgeLabel = "";
 if (resolved && hasOption) badgeLabel = stressorShortLabel(resolved);
 else if (stText && clean(stText.value)) badgeLabel = clean(stText.value);
 else if (resolved || sraKey) badgeLabel = stressorShortLabel(resolved || sraKey) || clean(resolved || sraKey);
 if (resolved) tr.setAttribute("data-wb-checkin-stressor-key", resolved);
 setCheckinStressorBadge(tr, badgeLabel);
 lockStressorRowFromCheckin(tr);
 }
 }

 function reapplyCheckinStressorsFromCheckin(form, checkin) {
 if (!form || !checkin) return;
 eachCheckinDomain(form, checkin, function (dk, entry, tbody) {
 if (!domainHasConcern(entry)) return;
 var note = clean(entry && entry.note);
 var stressors = ((entry && entry.stressors) || [])
 .map(function (s) {
 return resolveStressorKey(s, dk);
 })
 .filter(Boolean);
 var scores = levelToScores(entry && entry.level);
 if (!stressors.length) {
 var tr0 = tbody.rows[0];
 if (!tr0) return;
 var sel0 = tr0.querySelector(".js-common-stressor");
 var st0 = tr0.querySelector(".js-stressor-text");
 var hasVal =
 sel0 &&
 sel0.value &&
 sel0.value !== "" &&
 sel0.value !== "__none__";
 var hasText = st0 && clean(st0.value);
 if (!hasVal && !hasText && note) {
 applyStressorToRow(tr0, null, note, scores, { fromCheckinNote: true, fromCheckinStressor: true });
 }
 return;
 }
 ensureDomainRows(tbody, stressors.length);
 stressors.forEach(function (key, i) {
 var tr = tbody.rows[i];
 if (!tr) return;
 var sel = tr.querySelector(".js-common-stressor");
 var stText = tr.querySelector(".js-stressor-text");
 var hasVal =
 sel &&
 sel.value &&
 sel.value !== "" &&
 sel.value !== "__none__";
 var hasText = stText && clean(stText.value);
 if (!hasVal && !hasText) {
 applyStressorToRow(tr, key, i === 0 ? note : "", scores, {
 fromCheckinNote: i === 0 && !!note,
 fromCheckinStressor: true,
 });
 } else if (tr.getAttribute("data-checkin-stressor") === "1") {
 var label =
 hasVal && sel.value !== "__other__"
 ? stressorShortLabel(sel.value)
 : clean(stText && stText.value);
 setCheckinStressorBadge(tr, label);
 lockStressorRowFromCheckin(tr);
 }
 });
 });
 }

 function applyCheckinToSraForm(form, checkin, employment, adminCtx) {
 if (!form || !checkin) return;
 adminCtx = adminCtx || {};
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
 var nameEl = cover.querySelector(".js-wb-cover-name");
 var rolesEl = cover.querySelector(".js-wb-cover-roles");
 var undertakenEl = cover.querySelector(".js-wb-cover-undertaken");
 var triggerEl = cover.querySelector(".js-wb-cover-trigger");
 if (nameEl) nameEl.value = checkin.staff_name || "";
 if (rolesEl && !clean(rolesEl.value)) rolesEl.value = checkin.staff_role || "";
 if (undertakenEl && !clean(undertakenEl.value)) {
 undertakenEl.value = clean(adminCtx.staffName) || "";
 }
 if (triggerEl) {
 var triggerText =
 "Staff wellbeing check-in (" +
 termLabel(checkin.term_key) +
 ") - " +
 (checkin.has_concerns ? "concerns flagged for 1-to-1" : "routine review");
 if (checkin.general_note) {
 triggerText += "\n\nStaff note: " + checkin.general_note;
 }
 triggerEl.value = triggerText;
 }
 }
 if (employment) applyStaffEmploymentToSraForm(form, employment, checkin);
 applyCheckinDomainsToSraForm(form, checkin);
 }

 function levelLabel(level) {
 var lv = clean(level || "green").toLowerCase();
 if (lv === "support_requested" || lv === "red") return "Support requested";
 if (lv === "amber") return "Some pressure";
 if (lv === "all_good" || lv === "green") return "All good";
 return String(level || "").replace(/_/g, " ");
 }

 function statusLabel(status) {
 var map = {
 all_clear: "All good",
 needs_1to1: "Awaiting 1 to 1",
 awaiting_1to1: "Awaiting 1 to 1",
 in_progress: "In progress",
 completed: "Completed",
 monitoring: "Monitoring",
 };
 return map[clean(status).toLowerCase()] || String(status || "").replace(/_/g, " ");
 }

 function flaggedDomainsList(checkin) {
 var out = [];
 var domains = (checkin && checkin.domains) || {};
 var labels = getDomainLabels();
 Object.keys(labels).forEach(function (key) {
 var entry = domains[key];
 if (!entry || domainResponse(entry) !== "support_requested") return;
 if (!domainHasConcern(entry) && domainResponse(entry) !== "support_requested") return;
 var stressors = ((entry && entry.stressors) || [])
 .map(function (s) {
 return resolveStressorKey(s, key);
 })
 .filter(Boolean)
 .map(function (s) {
 return stressorShortLabel(s);
 });
 out.push({
 key: key,
 label: labels[key] || key,
 level: domainResponse(entry),
 stressors: stressors,
 });
 });
 return out;
 }

 function escapeHtml(s) {
 return String(s || "")
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;");
 }

 function buildAdminHeroFocusHtml(flagged, checkin) {
 var parts = [];
 var note = clean(checkin && checkin.general_note);
 if (flagged.length) {
 parts.push('<p class="portal-wb-hero-focus__label">Areas to review in this meeting</p>');
 parts.push('<div class="portal-wb-hero-flags">');
 flagged.forEach(function (f) {
 var lvCls =
 f.level === "red"
 ? " portal-wb-hero-flag--red"
 : f.level === "amber"
 ? " portal-wb-hero-flag--amber"
 : "";
 parts.push('<article class="portal-wb-hero-flag' + lvCls + '">');
 parts.push(
 '<div class="portal-wb-hero-flag__head"><span class="portal-wb-hero-flag__domain">' +
 escapeHtml(f.label) +
 '</span><span class="portal-wb-hero-flag__level">' +
 escapeHtml(levelLabel(f.level, (checkin.domains || {})[f.key])) +
 "</span></div>"
 );
 if (f.stressors && f.stressors.length) {
 parts.push('<div class="portal-wb-hero-flag__topics">');
 f.stressors.forEach(function (s) {
 parts.push("<span>" + escapeHtml(s) + "</span>");
 });
 parts.push("</div>");
 }
 parts.push("</article>");
 });
 parts.push("</div>");
 }
 if (note) {
 parts.push(
 '<blockquote class="portal-wb-hero-note"><span class="portal-wb-hero-note__label">Staff message</span><p>' +
 escapeHtml(note) +
 "</p></blockquote>"
 );
 }
 return parts.join("");
 }

 function renderAdminBanner(checkin) {
 if (!checkin) return;
 var name = clean(checkin.staff_name) || "Team member";
 var term = termLabel(checkin.term_key);
 var role = clean(checkin.staff_role);
 var flagged = flaggedDomainsList(checkin);
 var meta = [term];
 if (role) meta.push(role);

 var legacyBanner = document.getElementById("portalWellbeingAdminBanner");
 if (legacyBanner) {
 legacyBanner.hidden = true;
 legacyBanner.innerHTML = "";
 }

 var h1 = document.getElementById("sraHeroTitle");
 if (h1) h1.textContent = "1-to-1 Wellbeing Review";

 var sub = document.getElementById("sraHeroSubtitle");
 if (sub) sub.textContent = name + (meta.length ? " · " + meta.join(" · ") : "");


 var lead = document.getElementById("sraLead");
 if (lead) lead.hidden = true;

 var focus = document.getElementById("portalWbHeroFocus");
 if (focus) {
 var html = buildAdminHeroFocusHtml(flagged, checkin);
 focus.innerHTML = html;
 focus.hidden = !html;
 }

 document.body.classList.add("portal-wb-hero-ready");
 document.title = name + " - 1-to-1 Wellbeing - clubSENsational";
 }

 function renderAdminQuickNav() {
 var nav = document.getElementById("portalWellbeingAdminSteps");
 if (nav) nav.hidden = true;
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
 cloneDomainsFromCheckin: cloneDomainsFromCheckin,
 getCheckinStressors: getCheckinStressors,
 resolveStressorKey: resolveStressorKey,
 stressorKeysForDomain: stressorKeysForDomain,
 fetchStaffEmploymentContext: fetchStaffEmploymentContext,
 applyStaffEmploymentToSraForm: applyStaffEmploymentToSraForm,
 stressorShortLabel: stressorShortLabel,
 currentTermKey: currentTermKey,
 currentTermLabel: currentTermLabel,
 termLabel: termLabel,
 submitCheckin: submitCheckin,
 fetchCheckinForAdmin: fetchCheckinForAdmin,
 fetchOwnCheckinThisTerm: fetchOwnCheckinThisTerm,
 loadSraDraft: loadSraDraft,
 saveSraDraft: saveSraDraft,
 applyCheckinToSraForm: applyCheckinToSraForm,
 applyCheckinDomainsToSraForm: applyCheckinDomainsToSraForm,
 reapplyCheckinStressorsFromCheckin: reapplyCheckinStressorsFromCheckin,
 reapplyAllClearDomainsFromCheckin: reapplyAllClearDomainsFromCheckin,
 wireWellbeingReviewVoice: wireWellbeingReviewVoice,
 voiceNameFromProfile: voiceNameFromProfile,
 domainHasConcern: domainHasConcern,
 checkinHasConcerns: checkinHasConcerns,
 renderAdminBanner: renderAdminBanner,
 renderAdminQuickNav: renderAdminQuickNav,
 flaggedDomainsList: flaggedDomainsList,
 domainResponse: domainResponse,
 statusLabel: statusLabel,
 resolveWellbeingNotifications: resolveWellbeingNotifications,
 };
})(typeof window !== "undefined" ? window : globalThis);
