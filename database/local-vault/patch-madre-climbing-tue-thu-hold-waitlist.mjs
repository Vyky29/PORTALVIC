/**
 * Open Climbing @ Westway after-school hold seats (waitlist probe):
 *   - Tuesday 4–5 + 5–6 → Andres, client "HOLD WAITLIST"
 *   - Thursday 4–5 + 5–6 → Angel, client "HOLD WAITLIST"
 *
 * Booked (fictitious) so Booking Portal / Services treat the hours as full →
 * parents join the waiting list. Staff dashboards skip HOLD WAITLIST clients
 * (see staff_dashboard_spreadsheet_adapter.js) until a real name replaces them.
 *
 * Standing weeks only (before crash 2026-07-20).
 *
 *   node database/local-vault/patch-madre-climbing-tue-thu-hold-waitlist.mjs
 */
import fs from "fs";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8",
);
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const url = get("SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const headers = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const CRASH_FROM = "2026-07-20";
const HOLD = "HOLD WAITLIST";
const SERVICE = "Climbing Activity";
const VENUE = "Westway";
const AREA = "Wall";
const TIMES = ["4 to 5", "5 to 6"];

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".");
}

function addDaysIso(iso, days) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayLongFromIso(iso) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date(iso + "T12:00:00Z").getUTCDay()];
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  const list = Array.isArray(week.staff)
    ? week.staff
    : Object.values(week.staff || {});
  return list.find((s) => s && String(s.staffKey || "").toLowerCase() === want);
}

function ensureStaff(week, key, name) {
  let st = findStaff(week, key);
  if (st) {
    st.staffName = st.staffName || name;
    st.days = Array.isArray(st.days) ? st.days : [];
    return st;
  }
  const staffKey = String(key).toLowerCase();
  st = { staffKey, staffName: name, days: [], venues: [VENUE] };
  if (Array.isArray(week.staff)) week.staff.push(st);
  else {
    week.staff = week.staff || {};
    week.staff[staffKey] = st;
  }
  return st;
}

function sortSlots(day) {
  const rank = (t) => {
    const m = timeKey(t).match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 8) h += 12;
    return h * 60 + mi;
  };
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function holdSlot(time, instructorToken) {
  return {
    client_name: HOLD,
    time_slot: time,
    service: SERVICE,
    venue: VENUE,
    area: AREA,
    pool_note: AREA,
    instructors: instructorToken,
    participant_info:
      "Office hold seat — waitlist probe. Not a real client. Replace with a real name when booked.",
  };
}

function isTargetClimbHold(slot, time) {
  if (!/westway/i.test(norm(slot.venue))) return false;
  if (!/climb/i.test(norm(slot.service))) return false;
  return timeKey(slot.time_slot) === timeKey(time);
}

function ensureDaySlots(staff, weekday, sessionDate, instructorToken) {
  const log = [];
  if (sessionDate >= CRASH_FROM) return log;
  staff.days = Array.isArray(staff.days) ? staff.days : [];
  let day = staff.days.find(
    (d) =>
      norm(d.weekday) === weekday &&
      norm(d.sessionDate).slice(0, 10) === sessionDate,
  );
  if (!day) {
    day = { weekday, sessionDate, slots: [] };
    staff.days.push(day);
    log.push(`+ day ${weekday} ${sessionDate}`);
  }
  day.slots = Array.isArray(day.slots) ? day.slots : [];
  for (const time of TIMES) {
    let hit = day.slots.find((s) => isTargetClimbHold(s, time));
    if (hit) {
      const before = norm(hit.client_name);
      hit.client_name = HOLD;
      hit.service = SERVICE;
      hit.venue = VENUE;
      hit.area = AREA;
      hit.pool_note = AREA;
      hit.instructors = instructorToken;
      if (!hit.participant_info) {
        hit.participant_info =
          "Office hold seat — waitlist probe. Not a real client. Replace with a real name when booked.";
      }
      if (before !== HOLD) log.push(`${sessionDate} ${time}: ${before || "(empty)"} → ${HOLD}`);
    } else {
      day.slots.push(holdSlot(time, instructorToken));
      log.push(`${sessionDate} ${time}: added ${HOLD}`);
    }
  }
  sortSlots(day);
  return log;
}

function isoForWeekday(week, weekday) {
  const list = Array.isArray(week.staff)
    ? week.staff
    : Object.values(week.staff || {});
  for (const st of list) {
    if (!st) continue;
    for (const d of st.days || []) {
      if (norm(d.weekday) !== weekday) continue;
      const iso = norm(d.sessionDate).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    }
  }
  const start = norm(week.start).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  // week.start is Monday in this MADRE doc.
  const offset =
    {
      Monday: 0,
      Tuesday: 1,
      Wednesday: 2,
      Thursday: 3,
      Friday: 4,
      Saturday: 5,
      Sunday: 6,
    }[weekday] ?? null;
  if (offset == null) return "";
  const iso = addDaysIso(start, offset);
  return weekdayLongFromIso(iso) === weekday ? iso : "";
}

function patchWeek(week) {
  const start = norm(week.start).slice(0, 10);
  if (start >= CRASH_FROM) return null;
  const tue = isoForWeekday(week, "Tuesday");
  const thu = isoForWeekday(week, "Thursday");
  const log = [];
  if (tue && tue < CRASH_FROM) {
    const andres = ensureStaff(week, "andres", "Andres");
    log.push(...ensureDaySlots(andres, "Tuesday", tue, "ANDRES"));
  }
  if (thu && thu < CRASH_FROM) {
    const angel = ensureStaff(week, "angel", "Angel");
    log.push(...ensureDaySlots(angel, "Thursday", thu, "ANGEL"));
  }
  return log.length
    ? { week: `${week.start || "?"}–${week.end || "?"}`, log }
    : null;
}

async function upsertStanding(day, time, instructor) {
  const q =
    url +
    "/rest/v1/portal_roster_rows?" +
    new URLSearchParams({
      day: `eq.${day}`,
      time_slot: `eq.${time}`,
      instructors: `eq.${instructor}`,
      venue: `eq.${VENUE}`,
      service: `eq.${SERVICE}`,
      session_date: "is.null",
      select: "id,client_name,status",
      limit: "1",
    });
  const existing = await fetch(q, { headers }).then((r) => r.json());
  const payload = {
    client_name: HOLD,
    day,
    time_slot: time,
    instructors: instructor,
    service: SERVICE,
    area: AREA,
    venue: VENUE,
    session_date: null,
    status: "active",
    updated_by: OFFICE_USER,
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(existing) && existing[0]?.id) {
    const id = existing[0].id;
    const patch = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!patch.ok) throw new Error(`patch roster ${id}: ${await patch.text()}`);
    return { id, action: "update", day, time, instructor };
  }
  const ins = await fetch(url + "/rest/v1/portal_roster_rows", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      created_by: OFFICE_USER,
      created_at: new Date().toISOString(),
    }),
  });
  if (!ins.ok) throw new Error(`insert roster: ${await ins.text()}`);
  const created = await ins.json();
  return { id: created?.[0]?.id, action: "insert", day, time, instructor };
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = structuredClone(rows[0].document);

const summaries = [];
for (const week of doc.weeks || []) {
  const s = patchWeek(week);
  if (s) summaries.push(s);
}

if (!summaries.length) {
  console.log("Nothing to patch in MADRE.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note =
  `rev ${prevRev + 1}: Climbing Westway hold waitlist — Andres Tue 4–6 + Angel Thu 4–6 (HOLD WAITLIST; hidden on staff dash until real client)`;
doc.meta.notes.push(note);

const nextRev = prevRev + 1;
const put = await fetch(
  url +
    `/rest/v1/portal_madre_document?term_key=eq.summer-2026&revision=eq.${prevRev}`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      document: doc,
      revision: nextRev,
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    }),
  },
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}

const rosterOps = [];
for (const time of TIMES) {
  rosterOps.push(await upsertStanding("Tuesday", time, "ANDRES"));
  rosterOps.push(await upsertStanding("Thursday", time, "ANGEL"));
}

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      sample: summaries.slice(0, 2),
      roster_rows: rosterOps,
    },
    null,
    2,
  ),
);

// Verify latest standing Tuesday / Thursday
const verify = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers },
).then((r) => r.json());
const vDoc = verify?.[0]?.document;
function sampleStaffDay(key, weekday, iso) {
  for (const week of vDoc?.weeks || []) {
    const st = findStaff(week, key);
    if (!st) continue;
    for (const day of st.days || []) {
      if (String(day.sessionDate || "").slice(0, 10) !== iso) continue;
      if (norm(day.weekday) !== weekday) continue;
      return (day.slots || [])
        .filter((s) => /climb/i.test(String(s.service || "")))
        .map((s) => `${s.time_slot}: ${s.client_name}`);
    }
  }
  return null;
}
console.log("verify Andres Tue 2026-07-07", sampleStaffDay("andres", "Tuesday", "2026-07-07"));
console.log("verify Angel Thu 2026-07-09", sampleStaffDay("angel", "Thursday", "2026-07-09"));
