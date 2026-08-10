/**
 * Ikram Day Centre Wed 1 Jul 2026 is 11–4 (not 11–3).
 * Fix cancellation reports + schedule overrides, and ensure Michelle + Luliya
 * July timesheet rows for that day are 5h / 11–4 with totals recalculated.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read \
 *     database/local-vault/patch-ikram-jul1-11to4-paid.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const SESSION_DATE = "2026-07-01";
const PERIOD = "2026-07-01";
const LULIYA_ID = "a103a7cf-5984-42c1-bde7-17cba2938c2f";
const MICHELLE_ID = "4ae392bb-edd1-4aea-88bb-19eedc2a03c1";
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1"; // Victor

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fixEntry(e: Record<string, unknown>): boolean {
  const date = String(e.date || "");
  if (date !== SESSION_DATE) return false;
  const label = String(e.service_label || e.service || "");
  const isIkram = /ikram/i.test(label) || /day centre/i.test(label);
  if (!isIkram) return false;
  let changed = false;
  if (Number(e.hours) !== 5) {
    e.hours = 5;
    changed = true;
  }
  if (/11\s*[–-]\s*3|11 to 3/i.test(label) || !/11\s*[–-]\s*4|11 to 4/i.test(label)) {
    e.service_label = "Day Centre (SwimFarm) · Ikram 11–4";
    changed = true;
  }
  if (e.service && String(e.service) !== "Day Centre") {
    e.service = "Day Centre";
    changed = true;
  }
  return changed;
}

function recomputeTotals(entries: Array<Record<string, unknown>>, rateFallback: number) {
  let hours = 0;
  let cost = 0;
  for (const e of entries) {
    if (e.dayOff) continue;
    const h = Number(e.hours) || 0;
    const r = Number(e.rate) || rateFallback;
    hours += h;
    cost += h * r;
  }
  return { hours: round2(hours), cost: round2(cost) };
}

// 1) schedule_overrides
const { data: overrides, error: oErr } = await admin
  .from("schedule_overrides")
  .select("*")
  .eq("session_date", SESSION_DATE)
  .eq("anchor_client_id", "ikram")
  .eq("override_type", "slot_clear_client")
  .eq("status", "active");
if (oErr) throw oErr;

for (const row of overrides || []) {
  const needs =
    row.anchor_end !== "16:00:00" ||
    row.anchor_time_slot_label !== "11 to 4" ||
    !String(row.reason || "").includes("11–4");
  console.log("override", row.anchor_staff_id, {
    end: row.anchor_end,
    label: row.anchor_time_slot_label,
    reason: row.reason,
    needs,
  });
  if (!needs || !APPLY) continue;
  const payload = { ...(row.payload || {}) };
  payload.note = "Ikram Day Centre cancelled — staff still paid 11–4";
  const { error } = await admin
    .from("schedule_overrides")
    .update({
      anchor_end: "16:00:00",
      anchor_time_slot_label: "11 to 4",
      reason: "Ikram Day Centre 11–4 cancelled (paid) · Luliya/Michelle",
      payload,
      updated_by: ADMIN_UID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) console.error("override update failed", error.message);
  else console.log("  → fixed override", row.anchor_staff_id);
}

// 2) cancellation_reports
const { data: reports, error: rErr } = await admin
  .from("cancellation_reports")
  .select("*")
  .eq("session_date", SESSION_DATE)
  .eq("client_name", "Ikram");
if (rErr) throw rErr;

for (const row of reports || []) {
  const needs =
    row.session_time !== "11 to 4" ||
    !String(row.notes || "").includes("11–4");
  console.log("report", row.submitted_by_name, {
    session_time: row.session_time,
    notes: row.notes,
    needs,
  });
  if (!needs || !APPLY) continue;
  const { error } = await admin
    .from("cancellation_reports")
    .update({
      session_time: "11 to 4",
      notes: "Admin: Ikram cancelled — staff paid for 11–4 Day Centre",
    })
    .eq("id", row.id);
  if (error) console.error("report update failed", error.message);
  else console.log("  → fixed report", row.submitted_by_name);
}

// 3) Michelle + Luliya July timesheets
for (const [name, userId] of [
  ["Luliya", LULIYA_ID],
  ["Michelle", MICHELLE_ID],
] as const) {
  const { data: ts, error } = await admin
    .from("staff_timesheets")
    .select("id,entries,total_hours,total_cost,net_cost,submitted_by_name")
    .eq("submitted_by_user_id", userId)
    .eq("period_month", PERIOD)
    .maybeSingle();
  if (error) throw error;
  if (!ts) {
    console.log(name, "no July timesheet");
    continue;
  }
  const entries = Array.isArray(ts.entries)
    ? structuredClone(ts.entries) as Array<Record<string, unknown>>
    : [];
  const dayRows = entries.filter((e) => String(e.date) === SESSION_DATE);
  console.log(name, "Jul1 rows before:", dayRows.map((e) => ({
    hours: e.hours,
    label: e.service_label,
    rate: e.rate,
  })));
  let changed = false;
  for (const e of entries) {
    if (fixEntry(e)) changed = true;
  }
  // If no Ikram row exists but they have an empty/wrong Jul1 DC row, still try label match on hours=4
  if (!dayRows.some((e) => /ikram/i.test(String(e.service_label || "")))) {
    for (const e of entries) {
      if (String(e.date) !== SESSION_DATE) continue;
      if (Number(e.hours) === 4 && /day centre|swimfarm/i.test(`${e.service} ${e.service_label} ${e.venue}`)) {
        e.hours = 5;
        e.service_label = "Day Centre (SwimFarm) · Ikram 11–4";
        e.service = "Day Centre";
        changed = true;
      }
    }
  }
  // Michelle: Jul 1 paid cancel was missing from timesheet — add 5h Ikram 11–4
  if (name === "Michelle" && !dayRows.length) {
    const rate = 30;
    entries.push({
      day: "Wednesday",
      date: SESSION_DATE,
      note: "Ikram Day Centre cancelled (paid) 11–4",
      role: "Service Lead",
      hours: 5,
      manual: true,
      service: "Day Centre",
      completed: true,
      dayOff: false,
      late_hold: false,
      feedback_late: false,
      rate,
      venue: "SwimFarm",
      service_label: "Day Centre (SwimFarm) · Ikram 11–4",
    });
    entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    changed = true;
    console.log(name, "→ will ADD Jul1 Ikram 11–4 (5h)");
  }
  const rateFallback = name === "Michelle" ? 30 : 18;
  const rate = Number(dayRows[0]?.rate) || rateFallback;
  const { hours, cost } = recomputeTotals(entries, rate);
  console.log(name, {
    changed,
    oldHours: ts.total_hours,
    oldCost: ts.total_cost,
    newHours: hours,
    newCost: cost,
    jul1After: entries.filter((e) => String(e.date) === SESSION_DATE).map((e) => ({
      hours: e.hours,
      label: e.service_label,
    })),
  });
  if (!changed) {
    console.log(name, "already correct (or no Jul1 Ikram row to bump)");
    continue;
  }
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("staff_timesheets")
    .update({
      entries,
      total_hours: hours,
      total_cost: cost,
      net_cost: cost,
      expected_hours: hours,
    })
    .eq("id", ts.id);
  if (upErr) {
    // triggers sometimes block — try RPC-free SQL via force pattern used elsewhere
    console.error(name, "update failed:", upErr.message);
  } else {
    console.log(name, "→ timesheet totals updated");
  }
}

console.log(APPLY ? "Applied." : "Dry run. Re-run APPLY=1 to write.");
