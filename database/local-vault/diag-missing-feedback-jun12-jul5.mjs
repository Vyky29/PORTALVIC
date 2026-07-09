#!/usr/bin/env node
/** READ-ONLY: cross-check expected real client sessions (12 Jun–5 Jul 2026)
 *  from the roster bundle against submitted session_feedback + absents in Supabase.
 *  Unit = (session_date, client_slug), mirroring portal_session_key = date||slug.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
function readEnv(key) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}
const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"));

const FROM = "2026-06-12";
const TO = "2026-07-04"; // 05 Jul is "today" (sessions not done yet) — excluded from missing

function slug(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
const NON_REAL = new Set(["", "casa", "home", "manager", "closed", "available", "no_participant", "na", "n_a", "off", "day_off"]);
function isReal(clientName, area) {
  const sl = slug(clientName);
  if (NON_REAL.has(sl)) return false;
  if (String(area || "").toUpperCase() === "HOME") return false;
  return true;
}
function nextIso(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---- parse bundle ----
const bundleTxt = fs.readFileSync(path.join(root, "working_ui/portal/staff_dashboard_spreadsheet_bundle.js"), "utf8");
const mk = bundleTxt.indexOf("window.STAFF_DASHBOARD_SOURCE");
let i = bundleTxt.indexOf("{", mk), depth = 0, start = i;
for (; i < bundleTxt.length; i++) {
  const c = bundleTxt[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
}
const SOURCE = JSON.parse(bundleTxt.slice(start, i));
const rows = SOURCE.rows || [];

// ---- expected units ----
const units = new Map(); // key date||slug -> {date, client, slug, instructors:Set, services:Set, venues:Set}
for (const r of rows) {
  const date = String(r.session_date || "");
  if (date < FROM || date > TO) continue;
  if (!isReal(r.client_name, r.area)) continue;
  const sl = slug(r.client_name);
  const key = `${date}||${sl}`;
  let u = units.get(key);
  if (!u) { u = { date, client: r.client_name, slug: sl, instructors: new Set(), services: new Set(), venues: new Set() }; units.set(key, u); }
  String(r.instructors || "").split(/[,/]/).map((x) => x.trim()).filter(Boolean).forEach((x) => u.instructors.add(x));
  if (r.service) u.services.add(r.service);
  if (r.venue) u.venues.add(r.venue);
}

// ---- submitted feedback + absents ----
const { data: fb, error: e1 } = await admin
  .from("session_feedback")
  .select("session_date, client_name, client_id, portal_session_key, attendance, late_session_feedback, service, completed_by_name")
  .gte("session_date", FROM).lte("session_date", nextIso(TO));
if (e1) throw e1;
const { data: qm, error: e2 } = await admin
  .from("portal_staff_session_quick_marks")
  .select("session_date, portal_session_key, mark_type")
  .gte("session_date", FROM).lte("session_date", TO).eq("mark_type", "absent");
if (e2) throw e2;

// Fuzzy client identity: first name + surname initial (compatible if either initial missing).
// Handles roster "Khalid Ab" vs fb "Khalid", "Rayyan Fi" vs "Rayyan F", "Adam P" vs "Adam Pi",
// while still separating "Adam P" / "Adam Ab" / "Adam Me".
function parts(nameOrSlug) {
  const toks = slug(nameOrSlug).split("_").filter(Boolean);
  return { first: toks[0] || "", init: toks[1] ? toks[1][0] : null };
}
function compatible(a, b) {
  if (!a.first || !b.first || a.first !== b.first) return false;
  if (a.init == null || b.init == null) return true;
  return a.init === b.init;
}
function slugFromKey(sk, date, name) {
  if (sk) { const p = String(sk).split("||"); const s = p[p.length - 1]; if (s) return s; }
  return slug(name);
}

const subByDate = new Map();     // date -> [{first,init}]
const subLateByDate = new Map(); // date of feedback -> [{first,init}] (covers date-1 roster)
const absByDate = new Map();     // date -> [{first,init}]
function push(map, d, p) { if (!map.has(d)) map.set(d, []); map.get(d).push(p); }

for (const f of fb) {
  const d = String(f.session_date || "");
  const p = parts(f.client_name); // client_name is reliable; portal_session_key format varies
  if (String(f.attendance || "").trim().toLowerCase().startsWith("no")) { push(absByDate, d, p); continue; }
  push(subByDate, d, p);
  if (f.late_session_feedback) push(subLateByDate, d, p);
}
for (const m of qm) push(absByDate, String(m.session_date || ""), parts(slugFromKey(m.portal_session_key, m.session_date, "")));

function anyCompat(map, d, up) { return (map.get(d) || []).some((x) => compatible(x, up)); }

// ---- evaluate ----
function coveredStatus(u) {
  const up = parts(u.slug);
  if (anyCompat(absByDate, u.date, up)) return "ABSENT";
  if (anyCompat(subByDate, u.date, up)) return "SUBMITTED";
  if (anyCompat(subLateByDate, nextIso(u.date), up)) return "SUBMITTED(late)";
  return "MISSING";
}

const byDate = new Map();
let nSub = 0, nAbs = 0, nMiss = 0;
for (const u of units.values()) {
  const st = coveredStatus(u);
  if (st.startsWith("SUBMITTED")) nSub++;
  else if (st === "ABSENT") nAbs++;
  else nMiss++;
  if (!byDate.has(u.date)) byDate.set(u.date, []);
  byDate.get(u.date).push({ ...u, st });
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
console.log(`\n=== Expected real client feedback units ${FROM}..${TO} ===`);
console.log(`Total units: ${units.size}  |  submitted: ${nSub}  absent: ${nAbs}  MISSING: ${nMiss}\n`);

console.log("--- Per-day counts ---");
for (const d of [...byDate.keys()].sort()) {
  const arr = byDate.get(d);
  const miss = arr.filter((x) => x.st === "MISSING").length;
  const dow = DOW[new Date(d + "T00:00:00Z").getUTCDay()];
  console.log(`  ${d} ${dow}: ${arr.length} units, MISSING ${miss}`);
}

console.log("\n--- MISSING detail (chase these) ---");
for (const d of [...byDate.keys()].sort()) {
  const miss = byDate.get(d).filter((x) => x.st === "MISSING").sort((a, b) => a.client.localeCompare(b.client));
  if (!miss.length) continue;
  const dow = DOW[new Date(d + "T00:00:00Z").getUTCDay()];
  console.log(`\n  ${d} ${dow}:`);
  for (const u of miss) {
    console.log(`    - ${u.client.padEnd(14)} [${[...u.instructors].join(", ")}]  ${[...u.services].join("/")}  @${[...u.venues].join("/")}`);
  }
}

// missing count by instructor
const byInst = new Map();
for (const arr of byDate.values()) for (const u of arr) if (u.st === "MISSING") {
  for (const ins of u.instructors) byInst.set(ins, (byInst.get(ins) || 0) + 1);
}
console.log("\n--- MISSING by instructor ---");
for (const [k, v] of [...byInst.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);

// ---- validation: submitted feedback (present) in range not matching any expected unit ----
console.log("\n--- VALIDATION: submitted feedback with NO matching expected unit (possible name mismatch) ---");
const unitsByDate = new Map();
for (const u of units.values()) push(unitsByDate, u.date, parts(u.slug));
let orphans = 0;
const seenOrphan = new Set();
for (const f of fb) {
  if (String(f.attendance || "").trim().toLowerCase().startsWith("no")) continue;
  const d = String(f.session_date || "");
  if (d < FROM || d > TO) continue; // ignore the +1 late fetch tail
  const up = parts(f.client_name);
  const prev = (() => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); })();
  if ((unitsByDate.get(d) || []).some((x) => compatible(x, up))) continue;
  if (f.late_session_feedback && (unitsByDate.get(prev) || []).some((x) => compatible(x, up))) continue;
  const tag = `${d}|${f.client_name}`;
  if (seenOrphan.has(tag)) continue; seenOrphan.add(tag);
  orphans++;
  console.log(`    ${d}  ${f.client_name}  (${f.service || ""})  by ${f.completed_by_name || ""}`);
}
if (!orphans) console.log("    none — all submitted feedback maps to an expected unit (good)");
