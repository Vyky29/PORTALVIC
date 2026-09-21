/**
 * Smoke: every rota worker (bundle staffProfiles + instructor tokens) bootstraps
 * with sessions stamped under the canonical staffId, and alias keys still resolve.
 *
 * Run: node database/local-vault/smoke-staff-rota-cards-bootstrap.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundlePath = path.join(root, "working_ui/portal/staff_dashboard_spreadsheet_bundle.js");
const adapterPath = path.join(root, "working_ui/portal/staff_dashboard_spreadsheet_adapter.js");

function loadScript(filePath, sandbox) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInNewContext(code, sandbox, { filename: path.basename(filePath) });
}

const sandbox = {
  window: {},
  console,
  Date,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Math,
  JSON,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
  Set,
  Map,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

loadScript(bundlePath, sandbox);
loadScript(adapterPath, sandbox);

const Adapter = sandbox.StaffDashboardSpreadsheetAdapter || sandbox.window.StaffDashboardSpreadsheetAdapter;
const source = sandbox.STAFF_DASHBOARD_SOURCE || sandbox.window.STAFF_DASHBOARD_SOURCE;
if (!Adapter || !source) {
  console.error("FAIL: adapter/source missing");
  process.exit(1);
}

const profiles = source.staffProfiles || {};
const instructorTokens = new Set();
for (const row of source.rows || []) {
  const raw = String(row.instructors || "");
  for (const part of raw.split(/[,/&]|\band\b/gi)) {
    const t = part.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
    if (t) instructorTokens.add(t);
  }
}

const CODE = {
  stf001: "sandra",
  stf002: "roberto",
  stf003: "dan",
  stf004: "angel",
  stf005: "youssef",
  stf006: "john",
  stf007: "bismark",
  stf008: "giuseppe",
  stf009: "godsway",
  stf010: "javier",
  stf011: "aurora",
  stf012: "berta",
  stf013: "victor",
  stf014: "carlos",
  stf015: "alex",
  stf016: "simon",
  stf017: "javi",
  stf018: "raul",
  stf019: "sevitha",
  stf020: "teflon",
  stf021: "luliya",
  stf022: "andres",
};

function canon(v) {
  const k = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!k) return "";
  if (CODE[k]) return CODE[k];
  if (k === "lulia" || k === "lulya" || k === "aida") return "luliya";
  if (k === "yousef" || k === "yusef" || k === "josep") return "youssef";
  return k;
}

const rotaWorkers = new Set();
for (const k of Object.keys(profiles)) {
  const c = canon(k);
  if (c && c !== "teflon") rotaWorkers.add(c);
}
for (const tok of instructorTokens) {
  const c = canon(tok);
  if (c && c !== "teflon") rotaWorkers.add(c);
}

const aliasProbes = {
  luliya: ["luliya", "lulia", "aida", "stf021", "LULIYA"],
  youssef: ["youssef", "yousef", "yusef", "stf005", "YOUSSEF"],
  javier: ["javier", "javiermarquez", "stf010", "JAVIER"],
  javi: ["javi", "palankas", "stf017"],
  michelle: ["michelle", "michelleemmacaleb", "stf000_skip", "MICHELLE"].filter(
    (x) => x !== "stf000_skip",
  ),
  aurora: ["aurora", "auroragarcia", "stf011", "AURORA"],
};

let failed = 0;
const report = [];

for (const staffId of [...rotaWorkers].sort()) {
  const boot = Adapter.bootstrap({ source, staffId });
  const sessions = (boot && boot.sessionsModel) || [];
  const stamped = sessions.filter((s) => canon(s.staffId) === staffId);
  const badStamp = sessions.filter((s) => canon(s.staffId) !== staffId);
  const hasProfile = !!(profiles[staffId] || Object.keys(profiles).some((k) => canon(k) === staffId));
  const inInstructors = [...instructorTokens].some((t) => canon(t) === staffId);

  // Workers on the instructor sheet should get cards; profile-only (sevitha admin)
  // may legitimately have zero participant sessions.
  const expectSessions = inInstructors;
  const ok =
    hasProfile &&
    (!expectSessions || (stamped.length > 0 && badStamp.length === 0)) &&
    sessions.every((s) => !s.staffId || canon(s.staffId) === staffId || canon(s.staffId) === canon(staffId));

  if (!ok) failed += 1;
  report.push({
    staffId,
    sessions: sessions.length,
    stamped: stamped.length,
    badStamp: badStamp.length,
    expectSessions,
    ok,
    sampleStaffIds: [...new Set(sessions.slice(0, 8).map((s) => s.staffId))],
  });

  const probes = aliasProbes[staffId] || [staffId, staffId.toUpperCase()];
  for (const probe of probes) {
    const b2 = Adapter.bootstrap({ source, staffId: probe });
    const n = (b2 && b2.sessionsModel && b2.sessionsModel.length) || 0;
    if (expectSessions && n === 0) {
      failed += 1;
      report.push({ staffId, probe, aliasFail: true, sessions: n });
    }
    const mismatched = (b2.sessionsModel || []).filter((s) => canon(s.staffId) !== staffId);
    if (mismatched.length) {
      failed += 1;
      report.push({
        staffId,
        probe,
        stampFail: true,
        bad: [...new Set(mismatched.map((s) => s.staffId))],
      });
    }
  }
}

for (const row of report) {
  if (row.aliasFail || row.stampFail || row.ok === false) {
    console.log("ISSUE", JSON.stringify(row));
  }
}

const summary = report.filter((r) => r.ok != null);
console.log(
  "rota_workers",
  summary.length,
  "ok",
  summary.filter((r) => r.ok).length,
  "fail",
  failed,
);
for (const row of summary) {
  console.log(
    `${row.ok ? "OK" : "FAIL"} ${row.staffId.padEnd(10)} sessions=${String(row.sessions).padStart(4)} stamped=${String(row.stamped).padStart(4)} expect=${row.expectSessions ? "yes" : "no "}`,
  );
}

if (failed) process.exit(1);
console.log("PASS: all rota workers bootstrap with canonical staffId stamps");
