/**
 * Patch live MADRE (summer-2026) for Monday 2026-07-13 to match ops truth.
 * Also reactivates Lulia→Roberto shadowing override that day.
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

const DAY = "2026-07-13";

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => String(s.staffKey || "").toLowerCase() === want
  );
}

function findDay(st, iso) {
  return (st.days || []).find((d) => String(d.sessionDate || "").slice(0, 10) === iso);
}

function ensureDay(st, iso, weekday) {
  let d = findDay(st, iso);
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
  st.days = st.days || [];
  st.days.push(d);
  return d;
}

function cloneSlot(base, patch) {
  return Object.assign({}, base || {}, patch);
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
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
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

// --- Dan: Zayana → NO PARTICIPANT ---
{
  const st = findStaff(week, "dan");
  const d = findDay(st, DAY);
  const z = (d.slots || []).find((s) => /zayana/i.test(s.client_name || ""));
  if (z) {
    z.client_name = "NO PARTICIPANT";
    z.participant_info = "";
    notes.push("dan: Zayana → NO PARTICIPANT");
  } else {
    notes.push("dan: Zayana already absent");
  }
}

// --- Raul: Emanuel 12.30-4 → 1-4 ---
{
  const st = findStaff(week, "raul");
  const d = findDay(st, DAY);
  const em = (d.slots || []).find((s) => /emanuel/i.test(s.client_name || ""));
  if (em) {
    em.time_slot = "1 to 4";
    notes.push("raul: Emanuel → 1 to 4");
  }
  // Ensure Timi 11-1 stays
  const timi = (d.slots || []).find((s) => /timi/i.test(s.client_name || ""));
  if (timi && String(timi.time_slot).replace(/\s+/g, "") !== "11to1") {
    timi.time_slot = "11 to 1";
    notes.push("raul: Timi → 11 to 1");
  }
  sortSlots(d);
}

// --- Lulia: Ikram 11-3 + shadowing Roberto 4.30-6.30 ---
{
  const st = findStaff(week, "lulia") || findStaff(week, "luliya");
  const d = ensureDay(st, DAY, "Monday");
  let ikram = (d.slots || []).find((s) => /ikram/i.test(s.client_name || ""));
  if (!ikram) {
    ikram = {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "11 to 3",
      client_name: "Ikram",
      instructors: "LULIYA",
      participant_info: "",
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
        { time_slot: "1 to 3", area: "Day Centre" },
      ],
    };
    d.slots.push(ikram);
    notes.push("lulia: added Ikram 11 to 3");
  } else {
    ikram.time_slot = "11 to 3";
    ikram.service = "Day Centre";
    ikram.area = "Hub Room";
    ikram.pool_note = "Hub Room";
    ikram.venue = ikram.venue || "SwimFarm";
    ikram.segments = [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
      { time_slot: "1 to 3", area: "Day Centre" },
    ];
    notes.push("lulia: Ikram → 11 to 3 (special card segments)");
  }
  // Drop any other morning slots that conflict
  d.slots = (d.slots || []).filter((s) => {
    if (/ikram/i.test(s.client_name || "")) return s === ikram;
    if (/shadow/i.test(s.client_name || "") || /shadow/i.test(s.service || "")) return false;
    return true;
  });
  d.slots.push({
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
  });
  notes.push("lulia: + shadowing Roberto 4.30 to 6.30");
  sortSlots(d);
}

// --- Michelle: ensure Ikram 11-4 only ---
{
  const st = findStaff(week, "michelle");
  const d = findDay(st, DAY);
  if (d) {
    d.slots = (d.slots || []).filter((s) => /ikram/i.test(s.client_name || ""));
    let ik = d.slots[0];
    if (!ik) {
      ik = {
        area: "Hub Room",
        venue: "SwimFarm",
        service: "Day Centre",
        pool_note: "Hub Room",
        time_slot: "11 to 4",
        client_name: "Ikram",
        instructors: "MICHELLE",
        participant_info: "",
      };
      d.slots = [ik];
    } else {
      ik.time_slot = "11 to 4";
      ik.service = "Day Centre";
      ik.area = "Hub Room";
      ik.pool_note = "Hub Room";
    }
    notes.push("michelle: Ikram 11 to 4");
  }
}

// --- Roberto: ensure ACAT / Timi / Fadi special / afternoon ---
{
  const st = findStaff(week, "roberto");
  const d = findDay(st, DAY);
  if (d) {
    const byClient = (name) =>
      (d.slots || []).find((s) => new RegExp("^" + name + "$", "i").test(String(s.client_name || "").trim()));
    const acat = byClient("ACAT");
    if (acat) acat.time_slot = "11 to 12";
    let timi = byClient("Timi");
    if (!timi) {
      timi = {
        area: "Hub Room",
        venue: "SwimFarm",
        service: "Day Centre",
        pool_note: "Hub Room",
        time_slot: "12 to 12.30",
        client_name: "Timi",
        instructors: "ROBERTO",
        participant_info: "",
      };
      d.slots.push(timi);
      notes.push("roberto: + Timi 12 to 12.30");
    } else {
      timi.time_slot = "12 to 12.30";
    }
    let fadi = byClient("Fadi");
    if (fadi) {
      fadi.time_slot = "12.30 to 3";
      fadi.service = "Day Centre";
      fadi.area = "Hub Room";
      fadi.pool_note = "Hub Room";
      fadi.segments = [
        { time_slot: "12.30 to 1", area: "Big Pool" },
        { time_slot: "1 to 3", area: "Day Centre" },
      ];
      notes.push("roberto: Fadi 12.30 to 3 + segments");
    }
    // Keep afternoon aquatic as-is (Yunis / Amar Rai / Yamik)
    sortSlots(d);
  }
}

// --- Youssef: Emanuel special stays 11-1, Fadi 1-3, Joel makeup 5-5.30 ---
{
  const st = findStaff(week, "youssef");
  const d = findDay(st, DAY);
  // Pull Joel participant_info from an earlier Monday slot in doc
  let joelInfo = "";
  for (const w of doc.weeks || []) {
    const ys = findStaff(w, "youssef");
    if (!ys) continue;
    for (const day of ys.days || []) {
      const j = (day.slots || []).find(
        (s) => s.client_name === "Joel" && s.participant_info
      );
      if (j) {
        joelInfo = j.participant_info;
        break;
      }
    }
    if (joelInfo) break;
  }
  const em = (d.slots || []).find((s) => /emanuel/i.test(s.client_name || ""));
  if (em) {
    em.time_slot = "11 to 1";
    em.service = "Day Centre";
    em.area = "Hub Room";
    em.pool_note = "Hub Room";
    em.venue = "SwimFarm";
    em.segments = [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
    ];
    notes.push("youssef: Emanuel 11 to 1 + segments");
  }
  let fadi = (d.slots || []).find((s) => /^fadi$/i.test(String(s.client_name || "").trim()));
  if (!fadi) {
    fadi = {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "1 to 3",
      client_name: "Fadi",
      instructors: "YOUSSEF",
      participant_info: "",
    };
    d.slots.push(fadi);
    notes.push("youssef: + Fadi 1 to 3");
  } else {
    fadi.time_slot = "1 to 3";
    fadi.service = "Day Centre";
    fadi.area = "Hub Room";
    fadi.venue = "SwimFarm";
    notes.push("youssef: Fadi confirmed 1 to 3");
  }
  const closed = (d.slots || []).find((s) => String(s.client_name || "").toUpperCase() === "CLOSED");
  if (closed) {
    closed.time_slot = "4 to 4.30";
    closed.service = "Aquatic Activity";
    closed.area = "Teaching Pool";
    closed.venue = "Acton";
  }
  const eddie = (d.slots || []).find((s) => /^eddie/i.test(s.client_name || ""));
  if (eddie) {
    eddie.client_name = "Eddie";
    eddie.time_slot = "4.30 to 5";
  }
  let joel = (d.slots || []).find(
    (s) =>
      /^joel$/i.test(String(s.client_name || "").trim()) ||
      (s.time_slot === "5 to 5.30" && /NO PARTICIPANT/i.test(s.client_name || ""))
  );
  if (joel) {
    joel.client_name = "Joel";
    joel.time_slot = "5 to 5.30";
    joel.service = "Aquatic Activity";
    joel.area = "Teaching Pool";
    joel.venue = "Acton";
    joel.pool_note = "Teaching Pool";
    joel.instructors = "YOUSSEF";
    if (joelInfo) joel.participant_info = joelInfo;
    joel.makeup = true;
    notes.push("youssef: 5 to 5.30 → Joel (makeup)");
  }
  const abodi = (d.slots || []).find((s) => /abodi/i.test(s.client_name || ""));
  if (abodi) abodi.time_slot = "5.30 to 6.30";
  sortSlots(d);
}

// --- staffShifts for Mon 13 ---
{
  const shifts = doc.staffShifts?.rows || [];
  const keep = shifts.filter((r) => String(r.session_date).slice(0, 10) !== DAY);
  const add = (row) => keep.push(Object.assign({ session_date: DAY, day: "Monday" }, row));
  // rebuild day rows from known workers
  const existingOthers = shifts.filter((r) => String(r.session_date).slice(0, 10) !== DAY);
  doc.staffShifts.rows = existingOthers;
  const mon = [
    { staff_key: "angel", staff_name: "Angel", venue: "Acton", time_range: "4-6.30", raw_assignment: "Angel 4-6.30" },
    { staff_key: "bismark", staff_name: "Bismark", venue: "SwimFarm", time_range: "4.15-6.15", raw_assignment: "Bismark 4.15-6.15" },
    { staff_key: "dan", staff_name: "Dan", venue: "Northolt", time_range: "4.30-6.30", raw_assignment: "Dan 4.30-6.30" },
    { staff_key: "giuseppe", staff_name: "Giuseppe", venue: "SwimFarm", time_range: "4.15-6.15", raw_assignment: "Giuseppe 4.15-6.15" },
    { staff_key: "john", staff_name: "John", venue: "SwimFarm", time_range: "4.15-6.15", raw_assignment: "John 4.15-6.15" },
    { staff_key: "luliya", staff_name: "Luliya", venue: "SwimFarm", time_range: "11-3", raw_assignment: "Luliya 11-3" },
    { staff_key: "luliya", staff_name: "Luliya", venue: "Northolt", time_range: "4.30-6.30", raw_assignment: "Luliya shadowing Roberto 4.30-6.30" },
    { staff_key: "michelle", staff_name: "Michelle", venue: "SwimFarm", time_range: "11-4", raw_assignment: "Michelle 11-4" },
    { staff_key: "raul", staff_name: "Raul", venue: "SwimFarm", time_range: "11-4", raw_assignment: "Raul 11-4" },
    { staff_key: "roberto", staff_name: "Roberto", venue: "SwimFarm", time_range: "11-3", raw_assignment: "Roberto 11-3" },
    { staff_key: "roberto", staff_name: "Roberto", venue: "Northolt", time_range: "4.30-6.30", raw_assignment: "Roberto 4.30-6.30" },
    { staff_key: "sandra", staff_name: "Sandra", venue: "Westway", time_range: "4-6", raw_assignment: "Sandra 4-6" },
    { staff_key: "victor", staff_name: "Victor", venue: "SwimFarm", time_range: "11-4", raw_assignment: "Victor 11-4" },
    { staff_key: "youssef", staff_name: "Youssef", venue: "SwimFarm", time_range: "11-3", raw_assignment: "Youssef 11-3" },
    { staff_key: "youssef", staff_name: "Youssef", venue: "Acton", time_range: "4-6.30", raw_assignment: "Youssef 4-6.30" },
  ];
  for (const r of mon) add(r);
  doc.staffShifts.rows.sort(
    (a, b) =>
      String(a.session_date).localeCompare(String(b.session_date)) ||
      String(a.staff_key).localeCompare(String(b.staff_key))
  );
  notes.push("staffShifts: rebuilt Mon 13 (no godsway/berta/simon)");
}

doc.meta = doc.meta || {};
doc.meta.lastEditedAt = new Date().toISOString();
doc.meta.lastLiveFoldAt = doc.meta.lastEditedAt;
doc.meta.lastLiveFoldNote = "manual patch Mon 2026-07-13 roster truth";

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

// Reactivate Lulia shadowing override
const ov = await fetch(
  url +
    "/rest/v1/schedule_overrides?id=eq.2e923130-11ee-4221-938a-87cd85e25edc",
  {
    headers,
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
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
console.log("shadowing override", ov.ok ? "active" : ovBody);

// Verify Mon 13 summary
const verify = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers: { apikey: key, Authorization: "Bearer " + key } }
);
const vdoc = (await verify.json())[0].document;
const vw = vdoc.weeks.find((w) => w.start <= DAY && w.end >= DAY);
const want = ["dan", "lulia", "michelle", "raul", "roberto", "youssef"];
for (const key of want) {
  const st = findStaff(vw, key) || findStaff(vw, key === "lulia" ? "luliya" : key);
  const d = findDay(st, DAY);
  console.log(
    "\n" + (st?.staffName || key),
    (d?.slots || []).map((s) => s.time_slot + ":" + s.client_name).join(" | ")
  );
}
