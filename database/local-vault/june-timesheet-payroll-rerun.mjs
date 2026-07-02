#!/usr/bin/env node
/**
 * June 2026 payroll re-run:
 * - Backfill missing timesheets (imports + PDF in Documents)
 * - Exclude Andres + demo teflon from payroll universe
 * - Clear penalties / dedupe duplicate submissions
 * - Preview then send payroll-monthly-report
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { readPayrollCronSecret } from "./read_payroll_cron_secret.mjs";
import {
  buildFormattedTimesheetPdfBytes,
  formatIsoDmy,
  loadTimesheetLogoDataUrl,
} from "./timesheet-pdf-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PERIOD_MONTH = "2026-06-01";
const PERIOD_START = "2026-05-25";
const PERIOD_END = "2026-06-24";

const BACKFILL = [
  { username: "Bismark", rosterKey: "bismark" },
  { username: "Dan", rosterKey: "dan" },
  { username: "Godsway", rosterKey: "godsway" },
  { username: "John", rosterKey: "john" },
  { username: "Youssef", rosterKey: "youssef" },
];

const EXCLUDE_PAYROLL = ["Andres", "teflon"];

function readEnv(key) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

function loadRosterWindow() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const bundle = fs.readFileSync(
    path.join(root, "database/staff_dashboard_spreadsheet_bundle.js"),
    "utf8",
  );
  const adapter = fs.readFileSync(
    path.join(root, "database/staff_dashboard_spreadsheet_adapter.js"),
    "utf8",
  );
  vm.runInNewContext(bundle, sandbox);
  vm.runInNewContext(adapter, sandbox);
  return sandbox;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function eachDateInclusive(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

function hmToMinutes(hm) {
  const t = String(hm || "").trim();
  if (!t) return 0;
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function normStaff(v) {
  const x = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (x === "yousef" || x === "youssef") return "youssef";
  return x;
}

function sessionsForCalendarDate(sessions, dateObj) {
  const dateKey = isoDate(dateObj);
  const dayName = WEEKDAY[dateObj.getDay()];
  const list = sessions || [];
  const dated = list.filter((s) => String(s.session_date || "").trim().slice(0, 10) === dateKey);
  if (dated.length) return dated;
  const rosterUsesDates = list.some((s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(s.session_date || "").trim().slice(0, 10)),
  );
  if (rosterUsesDates) return [];
  return list.filter((s) => String(s.day || "").trim() === dayName);
}

function timesheetSlugAreaKey(area) {
  return String(area || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function timesheetSessionReviewKey(s, dateObj) {
  const dateKey = isoDate(dateObj);
  const cid = String(s.clientId || "").trim().toLowerCase();
  if (!dateKey || !cid) return "";
  const act = String(s.activity || s.rosterService || s.service || "")
    .trim()
    .toLowerCase();
  if (/day\s*centre/.test(act)) return `${dateKey}|${cid}|day_centre`;
  if (/bespoke/.test(act) && /hub/.test(String(s.area || "").trim().toLowerCase())) {
    return `${dateKey}|${cid}|bespoke_shared`;
  }
  if (/aquatic|swimming/.test(act)) return `${dateKey}|${cid}|aquatic`;
  let suffix = "";
  if (/multi[-\s]?activity/.test(act) || act === "bespoke" || act.indexOf("climbing") >= 0) {
    const ak = timesheetSlugAreaKey(s.area || s.venue || "");
    if (ak) suffix = `|${ak}`;
  }
  return `${dateKey}|${String(s.start || "").trim()}|${cid}${suffix}`;
}

function collectRosterSessionKeys(sessionsModel, dates) {
  const keys = new Set();
  for (const dateObj of dates) {
    const rows = sessionsForCalendarDate(sessionsModel, dateObj).filter((s) => {
      const st = String(s.status || "").toLowerCase();
      return st !== "closed" && st !== "available";
    });
    for (const s of rows) {
      const sk = timesheetSessionReviewKey(s, dateObj);
      if (sk.length > 12) keys.add(sk);
    }
  }
  return [...keys];
}

function dayPayableHours(rows, dateObj, feedbackKeys) {
  if (!rows.length) return { hours: 0, completed: false };
  let minStart = Infinity;
  let maxEnd = -Infinity;
  let completedAll = true;
  for (const s of rows) {
    const a = hmToMinutes(s.start);
    let b = hmToMinutes(s.end);
    if (b < a) b += 24 * 60;
    if (a < minStart) minStart = a;
    if (b > maxEnd) maxEnd = b;
    const key = timesheetSessionReviewKey(s, dateObj);
    if (!key || !feedbackKeys.has(key)) completedAll = false;
  }
  const spanMin = Math.max(0, maxEnd - minStart);
  const bufferMin = 15;
  const dayName = String(rows[0].day || "").trim();
  if (spanMin < 120 && dayName && dayName !== "Sunday") {
    minStart -= bufferMin;
    maxEnd += bufferMin;
  }
  const hours = Number((Math.max(0, maxEnd - minStart) / 60).toFixed(2));
  return { hours, completed: completedAll };
}

function computeWorkerPay(window, rosterKey, feedbackKeys) {
  const boot = window.StaffDashboardSpreadsheetAdapter.bootstrap({
    staffId: rosterKey,
    source: window.STAFF_DASHBOARD_SOURCE,
  });
  const sessions = boot.sessionsModel || [];
  const dates = eachDateInclusive(parseIso(PERIOD_START), parseIso(PERIOD_END));
  const entries = [];
  for (const dateObj of dates) {
    const dateKey = isoDate(dateObj);
    const dayRows = sessionsForCalendarDate(sessions, dateObj).filter((s) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "closed" || st === "available") return false;
      return normStaff(s.staffId) === normStaff(rosterKey);
    });
    if (!dayRows.length) continue;
    const { hours, completed } = dayPayableHours(dayRows, dateObj, feedbackKeys);
    if (hours > 0 && completed) {
      entries.push({
        date: dateKey,
        day: WEEKDAY[dateObj.getDay()],
        hours,
        completed: true,
      });
    }
  }
  const totalHours = Number(entries.reduce((a, e) => a + e.hours, 0).toFixed(2));
  return { entries, totalHours, staffName: boot.staffName || rosterKey };
}

function minimalPdfBytes(title) {
  const text = String(title || "Timesheet").slice(0, 120);
  const content = `BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n" + objs.join("");
  const xref = [];
  let pos = 0;
  for (const part of ["%PDF-1.4\n", ...objs]) {
    xref.push(pos);
    pos += part.length;
  }
  let xrefStart = body.length;
  body += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    const off = xref[i];
    body += String(off).padStart(10, "0") + " 00000 n \n";
  }
  body += `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(body);
}

async function fetchFeedbackKeySet(admin, userId, rosterSessionKeys) {
  const since = new Date();
  since.setDate(since.getDate() - 150);
  const sinceStr = since.toISOString().slice(0, 10);
  const keys = new Set();
  const { data: own } = await admin
    .from("session_feedback")
    .select("portal_session_key")
    .eq("submitted_by_user_id", userId)
    .not("portal_session_key", "is", null)
    .gte("session_date", sinceStr);
  for (const r of own || []) {
    const k = String(r.portal_session_key || "").trim();
    if (k) keys.add(k);
  }
  const peerDates = [
    ...new Set(
      rosterSessionKeys
        .map((k) => String(k || "").split("|")[0])
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].slice(0, 90);
  if (rosterSessionKeys.length && peerDates.length) {
    const { data: peer } = await admin
      .from("session_feedback")
      .select("portal_session_key")
      .in("session_date", peerDates)
      .not("portal_session_key", "is", null);
    for (const r of peer || []) {
      const k = String(r.portal_session_key || "").trim();
      if (k && rosterSessionKeys.includes(k)) keys.add(k);
    }
  }
  if (rosterSessionKeys.length) {
    const { data: rpc } = await admin.rpc("portal_feedback_submitted_keys_for_sessions", {
      p_keys: rosterSessionKeys.slice(0, 800),
    });
    for (const k of rpc || []) {
      const s = String(k || "").trim();
      if (s) keys.add(s);
    }
  }
  return keys;
}

async function main() {
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = readPayrollCronSecret();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rosterWin = loadRosterWindow();

  console.log("=== 1) Exclude Andres + teflon from June payroll ===");
  const { data: excludeProfiles } = await admin
    .from("staff_profiles")
    .select("id, username, full_name")
    .in("username", EXCLUDE_PAYROLL);
  for (const p of excludeProfiles || []) {
    const { error } = await admin.from("staff_payroll_start").upsert(
      {
        user_id: p.id,
        start_month: "2027-01-01",
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`payroll_start ${p.username}: ${error.message}`);
    console.log("  excluded:", p.full_name);
  }

  console.log("=== 2) Clear June penalties + zero timesheet penalties ===");
  await admin.from("staff_timesheet_penalties").delete().eq("missed_month", PERIOD_MONTH);
  await admin
    .from("staff_timesheets")
    .update({ is_late: false, penalty_amount: 0 })
    .eq("period_month", PERIOD_MONTH);
  const { data: juneTs } = await admin
    .from("staff_timesheets")
    .select("id, total_cost")
    .eq("period_month", PERIOD_MONTH);
  for (const row of juneTs || []) {
    const gross = Number(row.total_cost || 0);
    await admin
      .from("staff_timesheets")
      .update({ net_cost: gross, is_late: false, penalty_amount: 0 })
      .eq("id", row.id);
  }

  console.log("=== 3) Dedupe duplicate June staff_timesheets (keep latest) ===");
  const { data: allJune } = await admin
    .from("staff_timesheets")
    .select("id, submitted_by_user_id, created_at")
    .eq("period_month", PERIOD_MONTH)
    .order("created_at", { ascending: true });
  const latestByUser = new Map();
  for (const r of allJune || []) {
    latestByUser.set(r.submitted_by_user_id, r.id);
  }
  const toDelete = (allJune || [])
    .filter((r) => latestByUser.get(r.submitted_by_user_id) !== r.id)
    .map((r) => r.id);
  if (toDelete.length) {
    await admin.from("staff_timesheets").delete().in("id", toDelete);
    console.log("  removed duplicate rows:", toDelete.length);
  }

  console.log("=== 4) Backfill missing June timesheets ===");
  const { data: workerProfiles } = await admin
    .from("staff_profiles")
    .select("id, username, full_name")
    .in(
      "username",
      BACKFILL.map((w) => w.username),
    );
  const profileByUser = new Map((workerProfiles || []).map((p) => [p.username, p]));

  const dates = eachDateInclusive(parseIso(PERIOD_START), parseIso(PERIOD_END));

  for (const w of BACKFILL) {
    const prof = profileByUser.get(w.username);
    if (!prof) {
      console.warn("  skip missing profile:", w.username);
      continue;
    }
    const { data: existing } = await admin
      .from("staff_timesheets")
      .select("id")
      .eq("submitted_by_user_id", prof.id)
      .eq("period_month", PERIOD_MONTH)
      .maybeSingle();
    if (existing) {
      console.log("  already has payroll row:", w.username);
      continue;
    }

    const boot = rosterWin.StaffDashboardSpreadsheetAdapter.bootstrap({
      staffId: w.rosterKey,
      source: rosterWin.STAFF_DASHBOARD_SOURCE,
    });
    const rosterKeys = collectRosterSessionKeys(boot.sessionsModel, dates);
    const feedbackSet = await fetchFeedbackKeySet(admin, prof.id, rosterKeys);

    const { entries, totalHours, staffName } = computeWorkerPay(
      rosterWin,
      w.rosterKey,
      feedbackSet,
    );

    const { data: rateRow } = await admin
      .from("staff_pay_rates")
      .select("hourly_rate, role_label")
      .eq("user_id", prof.id)
      .maybeSingle();
    const hourly = Number(rateRow?.hourly_rate || 0);
    const gross = hourly > 0 ? Number((totalHours * hourly).toFixed(2)) : null;

    if (!totalHours || totalHours <= 0) {
      console.warn("  no payable hours for", w.username, "- skipping import");
      continue;
    }

    await admin.from("staff_timesheet_imports").delete().eq("period_month", PERIOD_MONTH).eq("user_id", prof.id);

    const { error: impErr } = await admin.from("staff_timesheet_imports").insert({
      user_id: prof.id,
      period_month: PERIOD_MONTH,
      name: prof.full_name || staffName,
      role: rateRow?.role_label || null,
      pay_type: "timesheet",
      total_hours: totalHours,
      gross,
      note: "Admin backfill June 2026 (completed sessions only)",
    });
    if (impErr) throw new Error(`import ${w.username}: ${impErr.message}`);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${prof.id}/timesheet/${ts}_Junes_Timesheet.pdf`;
    const logoDataUrl = loadTimesheetLogoDataUrl(root);
    const pdf = buildFormattedTimesheetPdfBytes({
      employeeName: prof.full_name || staffName,
      roleLabel: rateRow?.role_label || "",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      submittedDate: formatIsoDmy(new Date().toISOString().slice(0, 10)),
      statusLabel: "On time",
      entries: entries.map((e) =>
        Object.assign({}, e, { rate: hourly, completed: true }),
      ),
      hourlyRate: hourly,
      totalHours,
      totalCost: gross,
      pendingCost: 0,
      potentialCost: gross,
      logoDataUrl,
    });
    const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error(`upload ${w.username}: ${upErr.message}`);

    const { error: docErr } = await admin.from("documents").insert({
      user_id: prof.id,
      document_type: "timesheet",
      category: "finance",
      title: "June's Timesheet",
      related_date: PERIOD_END,
      file_url: storagePath,
      source_page: "timesheet",
    });
    if (docErr) throw new Error(`document ${w.username}: ${docErr.message}`);

    console.log(`  backfilled ${w.username}: ${totalHours}h · £${gross ?? "?"}`);
  }

  const fnUrl = `${url.replace(/\/$/, "")}/functions/v1/payroll-monthly-report`;

  console.log("=== 5) Preview June payroll ===");
  const previewRes = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payroll-cron-secret": cronSecret,
    },
    body: JSON.stringify({ month: "2026-06", mode: "preview" }),
  });
  const preview = await previewRes.json();
  if (!previewRes.ok || !preview.ok) {
    console.error(JSON.stringify(preview, null, 2));
    throw new Error("Preview failed");
  }
  console.log(
    "  submitted:",
    preview.summary?.submitted,
    "missing:",
    preview.summary?.notSubmitted,
    "penalties £",
    preview.summary?.totals?.penalty,
  );
  if (preview.missing?.length) {
    console.log(
      "  still missing:",
      preview.missing.map((m) => m.name).join(", "),
    );
  }

  console.log("=== 6) Send to accountant ===");
  const sendRes = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payroll-cron-secret": cronSecret,
    },
    body: JSON.stringify({ month: "2026-06", mode: "send" }),
  });
  const sent = await sendRes.json();
  if (!sendRes.ok || !sent.ok) {
    console.error(JSON.stringify(sent, null, 2));
    throw new Error("Send failed");
  }
  console.log("  emailed:", sent.emailedTo || sent.to || "ok");
  console.log("  penalties recorded on send:", sent.penaltiesRecorded ?? 0);
  console.log(JSON.stringify({ ok: true, summary: sent.summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
