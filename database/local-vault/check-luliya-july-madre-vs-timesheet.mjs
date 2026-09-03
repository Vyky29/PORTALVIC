#!/usr/bin/env node
/**
 * Read-only: Luliya July timesheet (25 Jun-31 Jul) vs Madré summer-2026 client slots.
 * Usage: node database/local-vault/check-luliya-july-madre-vs-timesheet.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const TIMESHEET_ID = "b48f2566-8181-491d-8473-67f9f904307e";
const FROM = "2026-06-25";
const TO = "2026-07-31";

function readEnv(key) {
  for (const rel of [
    "local-secrets/secrets.env",
    "database/local-vault/private/parent-portal-secrets.env",
  ]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (!line) continue;
    let v = line.slice(key.length + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v) return v;
  }
  throw new Error("missing " + key);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isLuliyaToken(tok) {
  const n = norm(tok);
  return (
    n === "luliya" ||
    n === "lulia" ||
    n === "aidaluliya" ||
    n.startsWith("luliya") ||
    n.startsWith("lulia")
  );
}

function instructorsIncludeLuliya(instr) {
  const raw = String(instr || "");
  if (!raw.trim()) return false;
  return raw.split(/[,+/|&]+/).some((p) => isLuliyaToken(p.trim()));
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rangeHours(aStr, bStr) {
  const parse = (t) => {
    const s = String(t || "")
      .trim()
      .toLowerCase()
      .replace(/\./g, ":");
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    let h = Number(m[1]);
    let min = Number(m[2] || 0);
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  };
  const a = parse(aStr);
  const b = parse(bStr);
  if (a == null || b == null || b <= a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

function parseTimeRange(tr) {
  const s = String(tr || "")
    .replace(/–|—/g, "-")
    .replace(/\s+to\s+/i, "-");
  const m = s.match(
    /(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)/,
  );
  if (!m) return { hours: null, label: String(tr || "") };
  return { hours: rangeHours(m[1], m[2]), label: `${m[1]}-${m[2]}` };
}

function classifyService(svc, venue, area) {
  const s = `${svc} ${venue} ${area}`.toLowerCase();
  if (/day\s*centre|daycentre/.test(s)) return "DC";
  if (/aquatic|swim|pool|teaching/.test(s)) return "SI";
  if (/multi|bespoke|hub/.test(s)) return "SW";
  if (/climb/.test(s)) return "CL";
  return "OTH";
}

const url = readEnv("SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: ts, error: tsErr } = await sb
  .from("staff_timesheets")
  .select("*")
  .eq("id", TIMESHEET_ID)
  .maybeSingle();
if (tsErr) throw tsErr;
if (!ts) throw new Error("timesheet not found");

console.log(
  "Timesheet keys:",
  Object.keys(ts)
    .filter((k) => k !== "entries")
    .join(", "),
);

const tsByDate = new Map();
for (const e of ts.entries || []) {
  const d = String(e.date || "").slice(0, 10);
  if (!d) continue;
  if (!tsByDate.has(d)) tsByDate.set(d, []);
  tsByDate.get(d).push({
    role: String(e.role || ""),
    hours: Number(e.hours || 0),
    venue: String(e.venue || ""),
    note: String(e.note || ""),
    service: String(e.service || e.service_label || ""),
  });
}

const { data: madreRow, error: mErr } = await sb
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (mErr) throw mErr;
if (!madreRow?.document) throw new Error("madre missing");

const doc = madreRow.document;
const madre = [];

for (const week of doc.weeks || []) {
  const weekStart = String(week.start || week.weekStart || "").slice(0, 10);
  const startDow = weekStart
    ? new Date(weekStart + "T12:00:00Z").getUTCDay()
    : 1;
  const nameToOffset = {
    monday: (1 - startDow + 7) % 7,
    tuesday: (2 - startDow + 7) % 7,
    wednesday: (3 - startDow + 7) % 7,
    thursday: (4 - startDow + 7) % 7,
    friday: (5 - startDow + 7) % 7,
    saturday: (6 - startDow + 7) % 7,
    sunday: (0 - startDow + 7) % 7,
  };

  // week.staff is an object keyed by staffKey (not an array)
  const staffEntries = Array.isArray(week.staff)
    ? week.staff.map((s, i) => [String(i), s])
    : Object.entries(week.staff || {});

  for (const [staffKey, st] of staffEntries) {
    if (!st) continue;
    const staffName = String(st.staffKey || st.name || staffKey || "");
    const staffIsLuliya = isLuliyaToken(staffName);
    for (const day of st.days || []) {
      if (!day) continue;
      const dayName = String(day.weekday || day.day || day.name || "");
      const off = nameToOffset[dayName.toLowerCase()];
      const dateIso = String(
        day.sessionDate || day.date || day.iso || (off != null && weekStart ? addDays(weekStart, off) : ""),
      ).slice(0, 10);
      for (const slot of day.slots || []) {
        if (!slot) continue;
        const instr = String(slot.instructors || "").trim();
        // Count if on Luliya's staff column OR named as instructor on another column
        if (!staffIsLuliya && !instructorsIncludeLuliya(instr)) continue;
        // Avoid double-count when Luliya column also lists herself as instructor:
        // only collect from her staff column when staffIsLuliya; from other columns only when instructors match and staff is not her
        if (!staffIsLuliya && !instructorsIncludeLuliya(instr)) continue;
        if (staffIsLuliya) {
          // include all slots on her rota column (client slots assigned to her)
        } else if (!instructorsIncludeLuliya(instr)) {
          continue;
        } else {
          // slot on someone else's column that lists Luliya as co-instructor — include once
        }
        const status = String(
          slot.status || day.status || "active",
        ).toLowerCase();
        const tr = parseTimeRange(slot.time_slot || slot.time || "");
        madre.push({
          date: dateIso,
          dayName,
          client: String(slot.client_name || slot.client || "").trim(),
          venue: String(slot.venue || "").trim(),
          area: String(slot.area || "").trim(),
          service: String(slot.service || "").trim(),
          time: String(slot.time_slot || "").trim(),
          hours: tr.hours,
          status,
          instructors: instr || staffName,
          via: staffIsLuliya ? "staffColumn" : "coInstructor",
        });
      }
    }
  }
}

if (Array.isArray(doc.staffShifts)) {
  for (const sh of doc.staffShifts) {
    if (!sh) continue;
    const keyName = sh.staffKey || sh.staff_key || sh.name || "";
    if (!isLuliyaToken(keyName) && !instructorsIncludeLuliya(keyName)) continue;
    const d = String(sh.date || sh.session_date || "").slice(0, 10);
    if (!d) continue;
    const tr = parseTimeRange(sh.time_range || sh.time_slot || sh.time || "");
    madre.push({
      date: d,
      dayName: "",
      client: String(sh.client_name || sh.client || "").trim(),
      venue: String(sh.venue || "").trim(),
      area: String(sh.area || "").trim(),
      service: String(sh.service || "").trim(),
      time: String(sh.time_range || sh.time_slot || "").trim(),
      hours: tr.hours,
      status: String(sh.status || "active").toLowerCase(),
      instructors: String(keyName),
    });
  }
}

const madreInRange = madre
  .filter((r) => r.date >= FROM && r.date <= TO)
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

const madreByDate = new Map();
for (const r of madreInRange) {
  if (!madreByDate.has(r.date)) madreByDate.set(r.date, []);
  madreByDate.get(r.date).push(r);
}

const allDates = new Set([...madreByDate.keys(), ...tsByDate.keys()]);
const sortedDates = [...allDates].filter((d) => d >= FROM && d <= TO).sort();

console.log(
  `Madré summer-2026 rev ${madreRow.revision} | Luliya slots ${FROM}→${TO}: ${madreInRange.length}`,
);
console.log(
  `Timesheet ${TIMESHEET_ID} total_hours=${ts.total_hours} total_cost=${ts.total_cost} status=${ts.status || "?"}`,
);
console.log("\n=== DAY-BY-DAY ===");

const gaps = [];
const notes = [];

for (const d of sortedDates) {
  const mSlots = (madreByDate.get(d) || []).filter(
    (r) => !/cancel/i.test(r.status),
  );
  const mCancel = (madreByDate.get(d) || []).filter((r) =>
    /cancel/i.test(r.status),
  );
  const tRows = tsByDate.get(d) || [];
  const tsHours = tRows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
  const tsRoles =
    tRows
      .map(
        (r) =>
          `${r.role}:${r.hours}h@${r.venue || r.service || "?"}${r.note ? " (" + r.note + ")" : ""}`,
      )
      .join("; ") || "(no timesheet line)";

  const clients = mSlots.map((s) => {
    const kind = classifyService(s.service, s.venue, s.area);
    return `${s.client || "—"} [${kind}] ${s.time} ${s.venue}${s.area ? "/" + s.area : ""} (${s.service})`;
  });

  const windows = mSlots.map((s) => ({
    kind: classifyService(s.service, s.venue, s.area),
    ...parseTimeRange(s.time),
    client: s.client,
    venue: s.venue,
    service: s.service,
    time: s.time,
  }));

  let expectSW = 0;
  let expectSI = 0;
  const dcWins = windows.filter((w) => w.kind === "DC");
  const siWins = windows.filter((w) => w.kind === "SI");
  const swWins = windows.filter((w) => w.kind === "SW" || w.kind === "OTH");
  if (dcWins.length) {
    expectSW = Math.max(...dcWins.map((w) => w.hours || 0), 0) || 5;
  } else if (swWins.length) {
    expectSW = swWins.reduce((a, w) => a + (w.hours || 0), 0);
  }
  if (siWins.length) {
    const seen = new Set();
    for (const w of siWins) {
      const k = w.time || `${w.hours}`;
      if (seen.has(k)) continue;
      seen.add(k);
      expectSI += w.hours || 2;
    }
  }

  const tsSW = tRows
    .filter((r) => /support/i.test(r.role))
    .reduce((a, r) => a + r.hours, 0);
  const tsSI = tRows
    .filter((r) => /swim/i.test(r.role))
    .reduce((a, r) => a + r.hours, 0);
  const tsOff = tRows.some((r) => /day off/i.test(r.role));

  let flag = "";
  if (mSlots.length === 0 && tsHours > 0) {
    flag = "TS_ONLY";
    notes.push(
      `${d}: timesheet has ${tsHours}h but no active Madré client slots for Luliya`,
    );
  } else if (mSlots.length > 0 && tsHours === 0 && !tsOff) {
    flag = "MISSING_TS";
    gaps.push({ d, clients, expectSW, expectSI, mSlots });
  } else if (mSlots.length > 0 && tsOff) {
    flag = "OFF_BUT_ROSTER";
    gaps.push({
      d,
      clients,
      expectSW,
      expectSI,
      mSlots,
      note: "timesheet Day off but Madré has slots",
    });
  } else if (mSlots.length > 0) {
    const swDiff = Math.round((expectSW - tsSW) * 100) / 100;
    const siDiff = Math.round((expectSI - tsSI) * 100) / 100;
    if (swDiff >= 1 || siDiff >= 1) {
      flag = "SHORT";
      gaps.push({
        d,
        clients,
        expectSW,
        expectSI,
        tsSW,
        tsSI,
        swDiff,
        siDiff,
        mSlots,
      });
    } else if (swDiff <= -1 || siDiff <= -1) {
      flag = "EXTRA_TS";
    } else {
      flag = "OK";
    }
  } else if (mCancel.length && tsHours === 0) {
    flag = "CANCELLED_OK";
  } else {
    flag = tsHours ? "TS_ONLY" : "EMPTY";
  }

  const clientLine = clients.length
    ? clients.join(" || ")
    : mCancel.length
      ? `(cancelled only: ${mCancel.map((c) => c.client).join(", ")})`
      : "—";
  console.log(
    `${d} [${flag}] madre:${mSlots.length}c ts:${tsHours}h (SW${tsSW}/SI${tsSI} expect SW${expectSW}/SI${expectSI})`,
  );
  console.log(`  clients: ${clientLine}`);
  console.log(`  timesheet: ${tsRoles}`);
}

console.log("\n=== GAPS / SHORTFALLS ===");
if (!gaps.length) console.log("None flagged by heuristic.");
for (const g of gaps) {
  console.log(
    `${g.d}: expect SW${g.expectSW} SI${g.expectSI} | ts SW${g.tsSW ?? 0} SI${g.tsSI ?? 0} | ${g.note || ""}`,
  );
  for (const c of g.clients || []) console.log("   -", c);
}

console.log("\n=== NOTES (TS without Madré slots) ===");
if (!notes.length) console.log("None.");
notes.forEach((n) => console.log(n));

console.log(
  "\nMadré active dates:",
  [...madreByDate.entries()]
    .filter(([, slots]) => slots.some((s) => !/cancel/i.test(s.status)))
    .map(([d]) => d)
    .join(", "),
);
console.log(
  "Timesheet work dates:",
  [...tsByDate.entries()]
    .filter(([, rows]) => rows.some((r) => r.hours > 0))
    .map(([d]) => d)
    .join(", "),
);
