/**
 * Single source of truth for HSE stressor keys (must match staff_wellbeing_review.html stressorSuggestions).
 */
(function (global) {
 "use strict";

 /** HSE domain section titles - must match staff check-in and staff_wellbeing_review.html */
 var DOMAIN_SECTION_TITLES = {
 demands: "Workload and job demands",
 control: "Job control",
 support: "Support, resources and communication",
 relations: "Work relationships",
 role: "Job role and conditions",
 change: "Job security and change",
 };

 var DOMAIN_QUESTIONS = {
 demands: "Can you manage your workload and session demands comfortably?",
 control: "Do you have enough input into how your work is planned and delivered?",
 support: "Do you receive timely support from your manager and team?",
 relations: "Do you feel treated fairly and respectfully at work?",
 role: "Are your responsibilities and expectations clear?",
 change: "Is organisational change communicated well, and do you feel secure in your role?",
 };

 var DOMAIN_ORDER = ["demands", "control", "support", "relations", "role", "change"];

 var DOMAIN_DESCRIPTIONS = {
 demands: "Workload, pace, and whether demands match your hours and skills.",
 control: "Your input into planning work and room to adapt day to day.",
 support: "Timely manager support, information, and wellbeing resources.",
 relations: "Fair treatment, respect, and relationships with colleagues.",
 role: "Clarity about responsibilities, expectations, and working conditions.",
 change: "How change is communicated and how secure you feel in your role.",
 };

 var STRESSOR_KEYS_BY_DOMAIN = {
 demands: [
 "High workload / too many sessions",
 "Back to back sessions without breaks",
 "Unclear priorities or conflicting deadlines",
 "Insufficient staffing on shift",
 "Skills or training gap for assigned duties",
 ],
 control: [
 "Limited input in planning",
 "Little autonomy in daily decisions",
 "Rigid processes with no room to adapt",
 "Unclear expectations from management",
 ],
 support: [
 "Unclear where to get support",
 "Manager unavailable for check-ins",
 "Information not cascaded in time",
 "Limited access to EAP or wellbeing resources",
 ],
 relations: [
 "Interpersonal conflict within the team",
 "Perceived unfair treatment",
 "Bullying or harassment concern",
 "Lack of recognition or feedback",
 ],
 role: [
 "Unclear role boundaries",
 "Responsibilities exceed capacity",
 "Unclear performance expectations",
 "Commute or travel burden",
 ],
 change: [
 "Poor communication during organisational change",
 "Consultation lacking on changes affecting role",
 "Fear regarding job security",
 "Rapid change without adequate support",
 ],
 };

 var STRESSOR_SHORT_LABELS = {
 "High workload / too many sessions": "High workload",
 "Back to back sessions without breaks": "No breaks between sessions",
 "Unclear priorities or conflicting deadlines": "Unclear priorities",
 "Insufficient staffing on shift": "Not enough staff on shift",
 "Skills or training gap for assigned duties": "Training or skills gap",
 "Limited input in planning": "Little input into planning",
 "Little autonomy in daily decisions": "Limited day-to-day autonomy",
 "Rigid processes with no room to adapt": "Rigid processes",
 "Unclear expectations from management": "Unclear expectations",
 "Unclear where to get support": "Unclear who to ask",
 "Manager unavailable for check-ins": "Hard to reach manager",
 "Information not cascaded in time": "Slow or late updates",
 "Limited access to EAP or wellbeing resources": "Limited wellbeing support",
 "Interpersonal conflict within the team": "Team tension",
 "Perceived unfair treatment": "Feeling unfairly treated",
 "Bullying or harassment concern": "Behaviour concerns",
 "Lack of recognition or feedback": "Feeling unheard",
 "Unclear role boundaries": "Unclear role boundaries",
 "Responsibilities exceed capacity": "Too many responsibilities",
 "Unclear performance expectations": "Unclear performance goals",
 "Commute or travel burden": "Travel or commute burden",
 "Poor communication during organisational change": "Poor communication",
 "Consultation lacking on changes affecting role": "Sudden changes",
 "Fear regarding job security": "Job security worries",
 "Rapid change without adequate support": "Change without support",
 };

 /** Old check-in chip text -> canonical SRA key */
 var LEGACY_STRESSOR_MAP = {
 "High workload": "High workload / too many sessions",
 "Back-to-back sessions": "Back to back sessions without breaks",
 "Unclear priorities": "Unclear priorities or conflicting deadlines",
 "Not enough breaks": "Back to back sessions without breaks",
 "Not enough staff on shift": "Insufficient staffing on shift",
 "Little input into planning": "Limited input in planning",
 "Can't adjust day-to-day": "Little autonomy in daily decisions",
 "Can't adjust approach": "Little autonomy in daily decisions",
 "Rigid timetable": "Rigid processes with no room to adapt",
 "Rigid processes": "Rigid processes with no room to adapt",
 "Unclear expectations": "Unclear expectations from management",
 "Hard to reach manager": "Manager unavailable for check-ins",
 "Unclear who to ask": "Unclear where to get support",
 "Slow responses": "Information not cascaded in time",
 "Slow or late updates": "Information not cascaded in time",
 "Limited wellbeing support": "Limited access to EAP or wellbeing resources",
 "Team tension": "Interpersonal conflict within the team",
 "Feeling unheard": "Lack of recognition or feedback",
 "Feeling unfairly treated": "Perceived unfair treatment",
 "Behaviour concerns": "Bullying or harassment concern",
 "Too many responsibilities": "Responsibilities exceed capacity",
 "Too many hats": "Responsibilities exceed capacity",
 "Role changed recently": "Unclear performance expectations",
 "Sudden changes": "Consultation lacking on changes affecting role",
 "Poor communication": "Poor communication during organisational change",
 "Job security worries": "Fear regarding job security",
 "Change without support": "Rapid change without adequate support",
 "Travel / commute burden": "Commute or travel burden",
 };

 function shortLabel(key) {
 return STRESSOR_SHORT_LABELS[key] || key;
 }

 function resolveKey(raw, domKey) {
 var val = String(raw || "").replace(/\s+/g, " ").trim();
 if (!val) return "";
 if (domKey) return resolveKeyForDomain(val, domKey);
 if (LEGACY_STRESSOR_MAP[val]) return LEGACY_STRESSOR_MAP[val];
 var domains = Object.keys(STRESSOR_KEYS_BY_DOMAIN);
 for (var d = 0; d < domains.length; d++) {
 var dom = domains[d];
 var keys = STRESSOR_KEYS_BY_DOMAIN[dom];
 for (var i = 0; i < keys.length; i++) {
 if (keys[i] === val) return val;
 if (STRESSOR_SHORT_LABELS[keys[i]] === val) return keys[i];
 }
 }
 return val;
 }

 function resolveKeyForDomain(raw, domKey) {
 var val = String(raw || "").replace(/\s+/g, " ").trim();
 if (!val || !domKey) return "";
 var allowed = STRESSOR_KEYS_BY_DOMAIN[domKey] || [];
 if (allowed.indexOf(val) >= 0) return val;
 if (LEGACY_STRESSOR_MAP[val] && allowed.indexOf(LEGACY_STRESSOR_MAP[val]) >= 0) {
 return LEGACY_STRESSOR_MAP[val];
 }
 for (var i = 0; i < allowed.length; i++) {
 if (STRESSOR_SHORT_LABELS[allowed[i]] === val) return allowed[i];
 }
 return "";
 }

 function stressorKeysForDomain(domKey) {
 return (STRESSOR_KEYS_BY_DOMAIN[domKey] || []).slice();
 }

 function buildDomains() {
 return DOMAIN_ORDER.map(function (key) {
 return {
 key: key,
 title: DOMAIN_SECTION_TITLES[key],
 question: DOMAIN_QUESTIONS[key],
 description: DOMAIN_DESCRIPTIONS[key] || "",
 };
 });
 }

 function buildCheckinStressors() {
 var out = {};
 Object.keys(STRESSOR_KEYS_BY_DOMAIN).forEach(function (dom) {
 out[dom] = STRESSOR_KEYS_BY_DOMAIN[dom].map(function (key) {
 return { key: key, label: shortLabel(key) };
 });
 });
 return out;
 }

 function applySectionTitlesToDocument() {
 DOMAIN_ORDER.forEach(function (key) {
 var sec = document.getElementById("sec-" + key);
 if (!sec) return;
 var h2 = sec.querySelector("h2.section-title, h2");
 if (h2) h2.textContent = DOMAIN_SECTION_TITLES[key] || key;
 var brief = DOMAIN_DESCRIPTIONS[key];
 if (!brief) return;
 var desc = sec.querySelector(".portal-wb-hse-desc");
 if (!desc) {
 desc = document.createElement("p");
 desc.className = "portal-wb-hse-desc pdf-parenthetical";
 if (h2 && h2.nextSibling) sec.insertBefore(desc, h2.nextSibling);
 else sec.appendChild(desc);
 }
 desc.textContent = brief;
 });
 }

 function assertMatchesSuggestions(suggestions) {
 if (!suggestions) return;
 Object.keys(STRESSOR_KEYS_BY_DOMAIN).forEach(function (dom) {
 var expected = STRESSOR_KEYS_BY_DOMAIN[dom];
 var actual = Object.keys((suggestions && suggestions[dom]) || {});
 expected.forEach(function (k) {
 if (actual.indexOf(k) < 0) {
 console.warn("[wellbeing] SRA stressor missing in review form:", dom, k);
 }
 });
 });
 }

 global.portalWellbeingStressorCatalog = {
 DOMAIN_SECTION_TITLES: DOMAIN_SECTION_TITLES,
 DOMAIN_QUESTIONS: DOMAIN_QUESTIONS,
 DOMAIN_DESCRIPTIONS: DOMAIN_DESCRIPTIONS,
 DOMAIN_ORDER: DOMAIN_ORDER,
 STRESSOR_KEYS_BY_DOMAIN: STRESSOR_KEYS_BY_DOMAIN,
 STRESSOR_SHORT_LABELS: STRESSOR_SHORT_LABELS,
 LEGACY_STRESSOR_MAP: LEGACY_STRESSOR_MAP,
 shortLabel: shortLabel,
 resolveKey: resolveKey,
 resolveKeyForDomain: resolveKeyForDomain,
 stressorKeysForDomain: stressorKeysForDomain,
 buildDomains: buildDomains,
 buildCheckinStressors: buildCheckinStressors,
 applySectionTitlesToDocument: applySectionTitlesToDocument,
 assertMatchesSuggestions: assertMatchesSuggestions,
 };
})(typeof window !== "undefined" ? window : globalThis);
