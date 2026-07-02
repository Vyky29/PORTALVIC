#!/usr/bin/env node
/**
 * Audit Sessions Overview vs Session Feedbacks for a date range.
 * Uses the same AdminSessionsHub matching logic as the admin dashboard.
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function readSecrets() {
  const p = path.join(ROOT, "local-secrets/secrets.env");
  if (!fs.existsSync(p)) throw new Error("Missing local-secrets/secrets.env");
  return Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function loadHub() {
  const bundlePath = path.join(ROOT, "working_ui/portal/staff_dashboard_spreadsheet_bundle.js");
  const hubPath = path.join(ROOT, "working_ui/portal/admin-sessions-hub.js");
  const sandbox = {
    window: {},
    globalThis: {},
    document: {
      querySelector: () => null,
      createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
      head: { appendChild: () => {} },
    },
    localStorage: {
      _d: {},
      getItem(k) {
        return this._d[k] ?? null;
      },
      setItem(k, v) {
        this._d[k] = String(v);
      },
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(bundlePath, "utf8"), ctx);
  vm.runInContext(fs.readFileSync(hubPath, "utf8"), ctx);
  if (!sandbox.AdminSessionsHub) throw new Error("AdminSessionsHub failed to load");
  return sandbox;
}

function isoAddDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtUk(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

async function fetchPayload(sb, from, to) {
  const [fb, ovs, marks] = await Promise.all([
    sb
      .from("session_feedback")
      .select(
        "id,client_name,session_date,service,attendance,engagement_rating,engagement_patterns,client_emotions,positive_feedback,relevant_information,completed_by_name,portal_session_key,session_time,created_at"
      )
      .gte("session_date", from)
      .lte("session_date", to)
      .order("session_date", { ascending: true }),
    sb
      .from("schedule_overrides")
      .select("*")
      .eq("status", "active")
      .gte("session_date", from)
      .lte("session_date", to),
    sb
      .from("portal_staff_session_quick_marks")
      .select("*")
      .eq("mark_type", "absent")
      .gte("session_date", from)
      .lte("session_date", to),
  ]);
  if (fb.error) throw fb.error;
  if (ovs.error) throw ovs.error;
  if (marks.error) throw marks.error;
  return {
    session_feedback: fb.data || [],
    session_feedback_total: (fb.data || []).length,
    session_feedback_loaded: (fb.data || []).length,
    schedule_overrides: ovs.data || [],
    session_quick_marks: marks.data || [],
    incident_reports: [],
    lead_session_reports: [],
    venue_reviews: [],
    cancellation_reports: [],
  };
}

function makeHub(sandbox, payload, mode, extraOpts = {}) {
  const root = { innerHTML: "", querySelector: () => null, _ashHubInstance: null };
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const hub = new sandbox.AdminSessionsHub(root, {
    escapeHtml: esc,
    mode,
    externalTabs: true,
    showFullWeekDayStrip: true,
    ...extraOpts,
  });
  hub.setPayload(payload);
  hub.refreshRosterRowsFromResolvedSource();
  return hub;
}

function auditDay(overviewHub, feedbackHub, iso) {
  overviewHub.selectedDay = iso;
  overviewHub.weekStart = mondayOf(iso);
  feedbackHub.selectedDay = iso;
  feedbackHub.weekStart = mondayOf(iso);
  overviewHub.invalidateComputeCaches();
  feedbackHub.invalidateComputeCaches();

  const diag = overviewHub.diagnoseDay(iso);
  const ovStats = overviewHub.dayStats(iso);
  const fbStats = feedbackHub.dayStats(iso);
  const submittedOnly = feedbackHub.feedbackLogRowsForDay(iso).length;
  const mixRows = feedbackHub.feedbackMixAwaitingSlots
    ? feedbackHub.feedbackMixRowsForDay(iso).length
    : null;
  const mixEnabled = !!feedbackHub.opts.feedbackMixAwaitingSlots;
  const fbTableRows = feedbackHub.feedbackRowsForSelectedDay().length;

  return {
    iso,
    overview: { total: ovStats.total, done: ovStats.done, awaiting: ovStats.total - ovStats.done },
    feedbackTab: {
      dayStats: fbStats,
      submittedOnlyRows: submittedOnly,
      tableRows: fbTableRows,
      mixAwaitingEnabled: mixEnabled,
      mixRows: mixRows,
    },
    awaitingSlots: diag.awaiting,
    orphanFeedback: diag.orphanFeedback,
  };
}

const env = readSecrets();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sandbox = loadHub();

const to = process.argv[2] || "2026-07-02";
const from = process.argv[3] || isoAddDays(to, -13);
const payload = await fetchPayload(sb, from, to);

const overviewHub = makeHub(sandbox, payload, "tracking");
const feedbackHubPlain = makeHub(sandbox, payload, "feedback");
const feedbackHubMix = makeHub(sandbox, payload, "feedback", { feedbackMixAwaitingSlots: true });

const days = [];
for (let d = from; d <= to; d = isoAddDays(d, 1)) days.push(d);

const results = days.map((iso) => {
  overviewHub.selectedDay = iso;
  feedbackHubPlain.selectedDay = iso;
  feedbackHubMix.selectedDay = iso;
  const base = auditDay(overviewHub, feedbackHubPlain, iso);
  feedbackHubMix.selectedDay = iso;
  feedbackHubMix.weekStart = mondayOf(iso);
  feedbackHubMix.invalidateComputeCaches();
  base.feedbackTabWithMix = feedbackHubMix.feedbackRowsForSelectedDay().length;
  return base;
});

console.log("\n=== FEEDBACK SYNC AUDIT ===");
console.log(`Range: ${from} → ${to}\n`);

let totalAwaiting = 0;
let totalOrphans = 0;
const awaitingAll = [];
const orphansAll = [];

for (const r of results) {
  if (!r.overview.total && !r.feedbackTab.submittedOnlyRows) continue;
  const stripMismatch = r.overview.total !== r.feedbackTab.dayStats.total || r.overview.done !== r.feedbackTab.dayStats.done;
  const tableMismatch = r.feedbackTab.tableRows !== r.feedbackTabWithMix;
  console.log(
    `${fmtUk(r.iso)} ${r.iso}  Overview ${r.overview.done}/${r.overview.total} awaiting=${r.overview.awaiting}` +
      `  | Feedbacks tab rows=${r.feedbackTab.tableRows} (submitted-only=${r.feedbackTab.submittedOnlyRows}, with-mix=${r.feedbackTabWithMix})` +
      (stripMismatch ? "  ⚠ strip mismatch" : "") +
      (tableMismatch ? "  ⚠ tab not using mix" : "")
  );
  totalAwaiting += r.overview.awaiting;
  totalOrphans += r.orphanFeedback.length;
  for (const a of r.awaitingSlots) {
    awaitingAll.push({ date: r.iso, ...a });
  }
  for (const o of r.orphanFeedback) {
    orphansAll.push({ date: r.iso, ...o });
  }
}

console.log(`\n--- Summary ---`);
console.log(`Roster slots still awaiting (Overview logic): ${totalAwaiting}`);
console.log(`Orphan feedback rows (submitted but no roster match): ${totalOrphans}`);
console.log(
 `\nRoot sync issue: admin Session Feedbacks tab has feedbackMixAwaitingSlots=${feedbackHubPlain.opts.feedbackMixAwaitingSlots || false}` +
    ` — table shows submitted rows only, not Overview awaiting slots.`
);

if (awaitingAll.length) {
  console.log(`\n--- Awaiting roster slots (${awaitingAll.length}) ---`);
  for (const a of awaitingAll) {
    console.log(
      `${a.date} | ${a.client} | ${a.service} ${a.time || ""} | ${a.instructors || ""} | area=${a.area || ""}`
    );
  }
}

if (orphansAll.length) {
  console.log(`\n--- Orphan feedback (exists, Overview cannot link) (${orphansAll.length}) ---`);
  for (const o of orphansAll) {
    console.log(
      `${o.date} | ${o.client} | ${o.service} ${o.time || ""} | by ${o.completed_by || ""} | key=${o.portal_session_key || ""}`
    );
  }
}
