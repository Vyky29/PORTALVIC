#!/usr/bin/env node
/**
 * Apply corrected June 2026 payroll imports for the 5 backfilled workers.
 * Period: 25 May – 24 Jun 2026. Roster-based (no feedback filter).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
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

/** Victor-confirmed totals (Youssef dual-role recalc 2026-06-30). */
const CORRECTIONS = [
  {
    username: "Bismark",
    name: "Bismark Gyan",
    role: "Support Worker 3 · Climbing Instructor 3",
    total_hours: 37,
    gross: 886,
    note: "June 2026 roster: 11×2h bespoke SW + 2×5h Sun SW multi + 1×5h Sun climbing @ £30",
  },
  {
    username: "Dan",
    name: "Dan Clarke",
    role: "Swimming Instructor 3",
    total_hours: 36.5,
    gross: 1022,
    note: "June 2026 roster: all shifts; Mon/Wed 2h band (not 1.5h)",
  },
  {
    username: "Godsway",
    name: "Godsway Yatofo",
    role: "Support Worker 1",
    total_hours: 13,
    gross: 234,
    note: "June 2026 roster: 4×2h Wed bespoke + 1×5h Sun multi (5h pay rule)",
  },
  {
    username: "John",
    name: "John Kyei-Fram",
    role: "Service Lead",
    total_hours: 31,
    gross: 930,
    note: "June 2026 roster: all scheduled shifts",
  },
  {
    username: "Youssef",
    name: "Youssef Moustafa",
    role: "Swimming Instructor 1 · Support Worker 1",
    total_hours: 56,
    gross: 1260,
    note: "June 2026 roster: 21h SW @ £20 + 35h swim @ £24 (Mon/Wed DC 3+1h + 2h pm; Fri DC 4+1h; Wed 24 all SW am)",
  },
];

function readEnv(k) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
  if (!line) throw new Error("missing " + k);
  return line.slice(k.length + 1).trim();
}

async function resolvePdfEntries(admin, prof, c) {
  const { data: ts } = await admin
    .from("staff_timesheets")
    .select("entries, hourly_rate_used, total_hours, total_cost")
    .eq("submitted_by_user_id", prof.id)
    .eq("period_month", PERIOD_MONTH)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ts && Array.isArray(ts.entries) && ts.entries.length) {
    return {
      entries: ts.entries.map((e) => ({
        date: String(e.date || "").slice(0, 10),
        day: String(e.day || ""),
        hours: Number(e.hours || 0),
        service: String(e.service || e.service_label || e.role || "Shift"),
        serviceLabel: String(e.service_label || e.service || e.role || "Shift"),
        role: String(e.role || ""),
        note: String(e.note || ""),
        completed: e.completed !== false,
      })),
      hourlyRate: ts.hourly_rate_used != null ? Number(ts.hourly_rate_used) : c.gross / c.total_hours,
      totalHours: ts.total_hours != null ? Number(ts.total_hours) : c.total_hours,
      totalCost: ts.total_cost != null ? Number(ts.total_cost) : c.gross,
    };
  }
  return {
    entries: [],
    hourlyRate: c.gross / c.total_hours,
    totalHours: c.total_hours,
    totalCost: c.gross,
  };
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const usernames = CORRECTIONS.map((c) => c.username);
  const { data: profiles, error: pErr } = await admin
    .from("staff_profiles")
    .select("id, username, full_name")
    .in("username", usernames);
  if (pErr) throw pErr;
  const byUser = new Map((profiles || []).map((p) => [p.username, p]));

  console.log("=== 1) Update staff_timesheet_imports (June 2026) ===");
  for (const c of CORRECTIONS) {
    const prof = byUser.get(c.username);
    if (!prof) throw new Error("missing profile: " + c.username);
    const { error } = await admin
      .from("staff_timesheet_imports")
      .update({
        total_hours: c.total_hours,
        gross: c.gross,
        role: c.role,
        note: c.note,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", prof.id)
      .eq("period_month", PERIOD_MONTH);
    if (error) throw new Error(`import ${c.username}: ${error.message}`);
    console.log(`  ${c.username}: ${c.total_hours}h · £${c.gross.toFixed(2)}`);
  }

  console.log("=== 2) Replace June Timesheet PDFs in Documents ===");
  const logoDataUrl = loadTimesheetLogoDataUrl(root);
  for (const c of CORRECTIONS) {
    const prof = byUser.get(c.username);
    const { data: docs } = await admin
      .from("documents")
      .select("id, file_url, title")
      .eq("user_id", prof.id)
      .eq("document_type", "timesheet")
      .eq("category", "finance")
      .ilike("title", "%june%timesheet%");
    for (const doc of docs || []) {
      if (doc.file_url) await admin.storage.from("documents").remove([doc.file_url]);
      await admin.from("documents").delete().eq("id", doc.id);
    }
    const fig = await resolvePdfEntries(admin, prof, c);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${prof.id}/timesheet/${ts}_Junes_Timesheet.pdf`;
    const pdf = buildFormattedTimesheetPdfBytes({
      employeeName: c.name || prof.full_name,
      roleLabel: c.role || "",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      submittedDate: formatIsoDmy(new Date().toISOString().slice(0, 10)),
      statusLabel: "On time",
      entries: fig.entries.map((e) => Object.assign({}, e, { rate: fig.hourlyRate, completed: true })),
      hourlyRate: fig.hourlyRate,
      totalHours: fig.totalHours,
      totalCost: fig.totalCost,
      pendingCost: 0,
      potentialCost: fig.totalCost,
      logoDataUrl,
    });
    const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error(`upload ${c.username}: ${upErr.message}`);
    const { error: docErr } = await admin.from("documents").insert({
      user_id: prof.id,
      document_type: "timesheet",
      category: "finance",
      title: "June's Timesheet",
      related_date: "2026-06-24",
      file_url: storagePath,
      source_page: "timesheet",
    });
    if (docErr) throw new Error(`document ${c.username}: ${docErr.message}`);
    console.log(`  ${c.username}: PDF refreshed`);
  }

  console.log("=== 3) Remove Bismark phantom July timesheet + penalty ===");
  const bismark = byUser.get("Bismark");
  if (bismark) {
    await admin.from("staff_timesheet_penalties").delete().eq("user_id", bismark.id).eq("missed_month", "2026-07-01");
    const { data: julyRows } = await admin
      .from("staff_timesheets")
      .select("id, file_url")
      .eq("submitted_by_user_id", bismark.id)
      .eq("period_month", "2026-07-01");
    for (const row of julyRows || []) {
      await admin.from("staff_timesheets").delete().eq("id", row.id);
    }
    console.log(`  deleted ${(julyRows || []).length} July staff_timesheets row(s)`);
  }

  console.log("=== 4) Verify ===");
  const ids = [...byUser.values()].map((p) => p.id);
  const { data: verify } = await admin
    .from("staff_timesheet_imports")
    .select("name, total_hours, gross, note")
    .eq("period_month", PERIOD_MONTH)
    .in("user_id", ids)
    .order("name");
  console.table(verify);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
