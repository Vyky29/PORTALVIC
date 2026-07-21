/**
 * Patch live MADRE (summer-2026) for Wednesday 2026-07-15 morning Day Centre.
 *
 * - Ikram: Michelle + Luliya special card (11–12 DC / 12–1 swim / 1–4 DC).
 *   Luliya Day Centre ends 11–3; Michelle covers full 11–4.
 * - Emanuel: Youssef 11–1 (Mon-style special) then Raul 1–4. No Timi.
 * - Youssef: Emanuel → 1, Fadi 1–3; then Acton afternoon.
 * - Roberto: Fadi 12.30–3 special card; then Northolt afternoon.
 * - Luliya: afternoon shadowing Roberto (reactivate override).
 * - Victor: drop stale Fadi copy.
 */
import fs from "fs";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8"
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

const DAY = "2026-07-15";
const WEEKDAY = "Wednesday";

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) =>
      String(s.staffKey || "").toLowerCase() === want ||
      String(s.staffName || "").toLowerCase() === want
  );
}

function findDay(st, iso) {
  return (st?.days || []).find((d) => String(d.sessionDate || "").slice(0, 10) === iso);
}

function ensureDay(st, iso, weekday) {
  let d = findDay(st, iso);
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
  st.days = st.days || [];
  st.days.push(d);
  return d;
}

function sortSlots(day) {
  const rank = (t) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + mi;
  };
  day.slots = day.slots || [];
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function keepAfternoonNonDc(slots) {
  return (slots || []).filter((s) => {
    const name = String(s.client_name || "");
    const svc = String(s.service || "").toLowerCase();
    const t = String(s.time_slot || "").toLowerCase();
    if (/ikram|emanuel|fadi|timi|manager/i.test(name)) return false;
    if (svc === "day centre") return false;
    if (/shadow/i.test(name) || /shadow/i.test(svc)) return false;
    // keep evening Acton/Northolt etc.
    return true;
  });
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers }
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;
const week = (doc.weeks || []).find(
  (w) => String(w.start).slice(0, 10) <= DAY && String(w.end).slice(0, 10) >= DAY
);
if (!week) throw new Error("week missing");

const notes = [];

// Snapshot participant_info for Ikram / Emanuel / Fadi
function findInfo(clientRe) {
  for (const w of doc.weeks || []) {
    for (const st of w.staff || []) {
      for (const day of st.days || []) {
        const hit = (day.slots || []).find(
          (s) => clientRe.test(String(s.client_name || "")) && s.participant_info
        );
        if (hit) return hit.participant_info;
      }
    }
  }
  return "";
}
const ikramInfo = findInfo(/ikram/i);
const emanuelInfo = findInfo(/emanuel/i);
const fadiInfo = findInfo(/^fadi$/i);

// --- Michelle: Ikram 11-4 special ---
{
  const st = findStaff(week, "michelle");
  const d = ensureDay(st, DAY, WEEKDAY);
  const afternoon = keepAfternoonNonDc(d.slots);
  d.slots = [
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "11 to 4",
      client_name: "Ikram",
      instructors: "LULIYA, MICHELLE",
      participant_info: ikramInfo,
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
        { time_slot: "1 to 4", area: "Day Centre" },
      ],
    },
    ...afternoon,
  ];
  sortSlots(d);
  notes.push("michelle: Ikram 11 to 4 special (w/ Luliya)");
}

// --- Luliya: Ikram 11-3 special + shadowing Roberto 16:30-18:30 ---
{
  const st = findStaff(week, "lulia") || findStaff(week, "luliya");
  const d = ensureDay(st, DAY, WEEKDAY);
  const afternoon = keepAfternoonNonDc(d.slots).filter(
    (s) => !/shadow/i.test(String(s.client_name || "") + String(s.service || ""))
  );
  d.slots = [
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "11 to 3",
      client_name: "Ikram",
      instructors: "LULIYA, MICHELLE",
      participant_info: ikramInfo,
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
        { time_slot: "1 to 3", area: "Day Centre" },
      ],
    },
    {
      area: "Teaching Pool",
      venue: "Northolt",
      service: "Shadowing",
      pool_note: "Teaching Pool",
      time_slot: "4.30 to 6.30",
      client_name: "SHADOWING",
      instructors: "LULIYA",
      participant_info: "",
      shadowing_host: "Roberto",
      shadowing_label: "Shadowing Roberto",
    },
    ...afternoon,
  ];
  sortSlots(d);
  notes.push("luliya: Ikram 11 to 3 special + shadowing Roberto 4.30-6.30");
}

// --- Youssef: Emanuel 11-1 special, Fadi 1-3, keep Acton ---
{
  const st = findStaff(week, "youssef");
  const d = ensureDay(st, DAY, WEEKDAY);
  const afternoon = keepAfternoonNonDc(d.slots);
  d.slots = [
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "11 to 1",
      client_name: "Emanuel",
      instructors: "YOUSSEF",
      participant_info: emanuelInfo,
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
      ],
    },
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "1 to 3",
      client_name: "Fadi",
      instructors: "YOUSSEF",
      participant_info: fadiInfo,
    },
    ...afternoon,
  ];
  sortSlots(d);
  notes.push("youssef: Emanuel 11-1 special + Fadi 1-3 + Acton kept");
}

// --- Raul: Emanuel 1-4, no Timi ---
{
  const st = findStaff(week, "raul");
  const d = ensureDay(st, DAY, WEEKDAY);
  const afternoon = keepAfternoonNonDc(d.slots);
  d.slots = [
    {
      area: "Hub · Manager",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub · Manager",
      time_slot: "1 to 4",
      client_name: "Emanuel",
      instructors: "RAUL",
      participant_info: emanuelInfo,
    },
    ...afternoon,
  ];
  sortSlots(d);
  notes.push("raul: Emanuel 1 to 4 (no Timi)");
}

// --- Roberto: Fadi 12.30-3 special, no Timi, keep Northolt ---
{
  const st = findStaff(week, "roberto");
  const d = ensureDay(st, DAY, WEEKDAY);
  const afternoon = keepAfternoonNonDc(d.slots);
  d.slots = [
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: fadiInfo,
      segments: [
        { time_slot: "12.30 to 1", area: "Big Pool" },
        { time_slot: "1 to 3", area: "Day Centre" },
      ],
    },
    ...afternoon,
  ];
  sortSlots(d);
  notes.push("roberto: Fadi 12.30 to 3 special (pool 12.30-1) + Northolt kept");
}

// --- Victor: remove erroneous Fadi ---
{
  const st = findStaff(week, "victor");
  const d = findDay(st, DAY);
  if (d) {
    const before = (d.slots || []).length;
    d.slots = (d.slots || []).filter((s) => !/^fadi$/i.test(String(s.client_name || "").trim()));
    if (d.slots.length !== before) notes.push("victor: removed stale Fadi slot");
  }
}

// staffShifts for Wed 15: day-centre end times + evenings
{
  doc.staffShifts = doc.staffShifts || { rows: [] };
  doc.staffShifts.rows = (doc.staffShifts.rows || []).filter(
    (r) => String(r.session_date || "").slice(0, 10) !== DAY
  );
  const wed = [
    { staff_key: "michelle", staff_name: "Michelle", venue: "SwimFarm", time_range: "11-4", raw_assignment: "Michelle 11-4 (Ikram)" },
    { staff_key: "luliya", staff_name: "Luliya", venue: "SwimFarm", time_range: "11-3", raw_assignment: "Luliya 11-3 (Ikram)" },
    { staff_key: "luliya", staff_name: "Luliya", venue: "Northolt", time_range: "4.30-6.30", raw_assignment: "Luliya shadowing Roberto" },
    { staff_key: "youssef", staff_name: "Youssef", venue: "SwimFarm", time_range: "11-3", raw_assignment: "Youssef 11-3" },
    { staff_key: "youssef", staff_name: "Youssef", venue: "Acton", time_range: "4-6.30", raw_assignment: "Youssef 4-6.30" },
    { staff_key: "roberto", staff_name: "Roberto", venue: "SwimFarm", time_range: "12.30-3", raw_assignment: "Roberto 12.30-3 (Fadi)" },
    { staff_key: "roberto", staff_name: "Roberto", venue: "Northolt", time_range: "4.30-6.30", raw_assignment: "Roberto 4.30-6.30" },
    { staff_key: "raul", staff_name: "Raul", venue: "SwimFarm", time_range: "1-4", raw_assignment: "Raul 1-4 (Emanuel)" },
  ];
  for (const r of wed) {
    doc.staffShifts.rows.push({
      day: WEEKDAY,
      session_date: DAY,
      ...r,
    });
  }
  notes.push("staffShifts: rebuilt Wed 15 Jul morning + evenings");
}

doc.meta = doc.meta || {};
doc.meta.lastEditedAt = new Date().toISOString();
doc.meta.lastLiveFoldAt = doc.meta.lastEditedAt;
doc.meta.lastLiveFoldNote = "manual patch Wed 2026-07-15 Day Centre morning";

const newRev = prevRev + 1;
const patch = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026",
  {
    headers,
    method: "PATCH",
    body: JSON.stringify({
      document: doc,
      revision: newRev,
      updated_at: new Date().toISOString(),
    }),
  }
);
const patched = await patch.json();
if (!patch.ok) {
  console.error(patched);
  throw new Error("madre patch failed " + patch.status);
}
console.log("MADRE revision", prevRev, "→", newRev);
notes.forEach((n) => console.log(" -", n));

// Reactivate Luliya shadowing Roberto on Wed 15
const ov = await fetch(
  url +
    "/rest/v1/schedule_overrides?id=eq.bac09dff-3f15-47a0-912f-028bfd29de0b",
  {
    headers,
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
      reason: "reactivated 2026-07-15: Luliya shadowing Roberto afternoon",
      updated_at: new Date().toISOString(),
      payload: {
        kind: "shadowing",
        note: "",
        label: "Shadowing",
        trainer: "Roberto",
        location: "pool",
      },
    }),
  }
);
const ovBody = await ov.json();
console.log("shadowing override", ov.ok ? "active" : JSON.stringify(ovBody));

// Verify
const verify = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers: { apikey: key, Authorization: "Bearer " + key } }
);
const vdoc = (await verify.json())[0].document;
const vw = vdoc.weeks.find(
  (w) => String(w.start).slice(0, 10) <= DAY && String(w.end).slice(0, 10) >= DAY
);
for (const key of ["michelle", "lulia", "youssef", "raul", "roberto", "victor"]) {
  const st = findStaff(vw, key) || findStaff(vw, key === "lulia" ? "luliya" : key);
  const d = findDay(st, DAY);
  console.log(
    "\n" + (st?.staffName || st?.staffKey || key),
    (d?.slots || [])
      .map(
        (s) =>
          s.time_slot +
          ":" +
          s.client_name +
          (s.segments ? ` [${s.segments.map((x) => x.time_slot + "/" + x.area).join(", ")}]` : "")
      )
      .join(" | ")
  );
}
