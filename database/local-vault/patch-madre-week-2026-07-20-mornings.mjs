/**
 * Day Centre mornings week Mon 20 – Fri 24 Jul 2026 (per Victor).
 *
 *   node database/local-vault/patch-madre-week-2026-07-20-mornings.mjs
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

const WEEK_START = "2026-07-20";
const DAYS = {
  mon: "2026-07-20",
  tue: "2026-07-21",
  wed: "2026-07-22",
  thu: "2026-07-23",
  fri: "2026-07-24",
};
const WD = {
  "2026-07-20": "Monday",
  "2026-07-21": "Tuesday",
  "2026-07-22": "Wednesday",
  "2026-07-23": "Thursday",
  "2026-07-24": "Friday",
};

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => String(s.staffKey || "").toLowerCase() === want
  );
}

function ensureDay(st, iso) {
  st.days = Array.isArray(st.days) ? st.days : Object.values(st.days || {});
  let d = st.days.find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) return d;
  d = { weekday: WD[iso], sessionDate: iso, slots: [] };
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
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function keepAfternoon(slot) {
  const t = String(slot.time_slot || "").toLowerCase();
  const m = t.match(/^(\d{1,2})/);
  if (!m) return true;
  let h = +m[1];
  if (h >= 1 && h <= 7) h += 12;
  return h >= 15;
}

function isMorningDcClient(name) {
  const n = String(name || "").trim().toLowerCase();
  return /^(acat|fadi|timi|emanuel|ikram|zakariya|casa|home|manager|cyrus|shadowing|shadow)$/i.test(
    n
  );
}

function clearMorningDc(day) {
  day.slots = (day.slots || []).filter(
    (s) => keepAfternoon(s) && !isMorningDcClient(s.client_name)
  );
}

function slot(o) {
  return Object.assign(
    {
      venue: "SwimFarm",
      pool_note: o.area || "",
      participant_info: o.participant_info || "",
    },
    o
  );
}

function infoFromDoc(doc, clientRe) {
  for (const w of doc.weeks || []) {
    for (const st of Object.values(w.staff || {})) {
      for (const day of st.days || []) {
        for (const s of day.slots || []) {
          if (clientRe.test(String(s.client_name || "")) && s.participant_info) {
            return s.participant_info;
          }
        }
      }
    }
  }
  return "";
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
const notes = [];

const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START
);
if (!week) throw new Error("week missing " + WEEK_START);

const fadiInfo = infoFromDoc(doc, /^fadi$/i);
const emInfo = infoFromDoc(doc, /^emanuel/i);
const timiInfo = infoFromDoc(doc, /^timi/i);
const ikramInfo = infoFromDoc(doc, /^ikram/i);
const roberto = findStaff(week, "roberto");
const youssef = findStaff(week, "youssef");
const michelle = findStaff(week, "michelle");
const luliya = findStaff(week, "lulia") || findStaff(week, "luliya");
const victor = findStaff(week, "victor");
const raul = findStaff(week, "raul");

/** Roberto mornings: Fadi only (no Zakariya — crash week Zak is with Alex / SwimFarm special). */
function setRobertoFadi(iso, fadiFirstArea) {
  const d = ensureDay(roberto, iso);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: fadiInfo,
      segments: [
        { time_slot: "12.30 to 1", area: fadiFirstArea },
        { time_slot: "1 to 3", area: "Day Centre" },
      ],
    })
  );
  sortSlots(d);
  notes.push(`${iso} roberto: Fadi 12.30–1 (${fadiFirstArea}) · Fadi 1–3 (no Zak)`);
}

function setRobertoFri(iso) {
  const d = ensureDay(roberto, iso);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: fadiInfo,
      segments: [
        { time_slot: "12.30 to 1", area: "Big Pool" },
        { time_slot: "1 to 3", area: "Day Centre" },
      ],
    })
  );
  sortSlots(d);
  notes.push(`${iso} roberto: Fadi 12.30–1 Big Pool · Fadi 1–3 (no Zak)`);
}

function setYoussefEmanuelFadi(iso) {
  const d = ensureDay(youssef, iso);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "11 to 2",
      client_name: "Emanuel",
      instructors: "YOUSSEF",
      participant_info: emInfo,
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
        { time_slot: "1 to 2", area: "Day Centre" },
      ],
    })
  );
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "2 to 3",
      client_name: "Fadi",
      instructors: "YOUSSEF",
      participant_info: fadiInfo,
    })
  );
  sortSlots(d);
  notes.push(`${iso} youssef: Emanuel 11–2 special · Fadi 2–3`);
}

function setYoussefFri(iso) {
  const d = ensureDay(youssef, iso);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "11 to 1",
      client_name: "Emanuel",
      instructors: "YOUSSEF",
      participant_info: emInfo,
      segments: [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
      ],
    })
  );
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "1 to 3",
      client_name: "Fadi",
      instructors: "YOUSSEF",
      participant_info: fadiInfo,
    })
  );
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "3 to 4",
      client_name: "Emanuel",
      instructors: "YOUSSEF",
      participant_info: emInfo,
    })
  );
  sortSlots(d);
  notes.push(`${iso} youssef: Emanuel 11–1 special · Fadi 1–3 · Emanuel 3–4`);
}

function setIkram(st, iso, withSpecial) {
  const d = ensureDay(st, iso);
  clearMorningDc(d);
  const key = String(st.staffKey || "").toUpperCase();
  const inst = key === "MICHELLE" ? "MICHELLE" : "LULIYA";
  const s = slot({
    area: "Hub Room",
    service: "Day Centre",
    time_slot: "11 to 4",
    client_name: "Ikram",
    instructors: inst,
    participant_info: ikramInfo,
  });
  if (withSpecial) {
    s.segments = [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
      { time_slot: "1 to 4", area: "Day Centre" },
    ];
  }
  d.slots.push(s);
  sortSlots(d);
  notes.push(
    `${iso} ${String(st.staffKey)}: Ikram 11–4 ${withSpecial ? "SPECIAL" : "plain DC"}`
  );
}

function setOff(st, iso, label) {
  if (!st) return;
  const d = ensureDay(st, iso);
  clearMorningDc(d);
  sortSlots(d);
  notes.push(`${iso} ${label}: OFF (morning DC cleared)`);
}

if (!roberto || !youssef || !michelle || !luliya || !victor || !raul) {
  throw new Error("missing staff in week");
}

// --- Monday ---
setRobertoFadi(DAYS.mon, "Small Pool");
setYoussefEmanuelFadi(DAYS.mon);
setIkram(michelle, DAYS.mon, true);
setIkram(luliya, DAYS.mon, true);
// Victor Mon already OK — leave Timi/Fadi/Emanuel if present, else set
{
  const d = ensureDay(victor, DAYS.mon);
  const hasTimi = (d.slots || []).some((s) => /^timi$/i.test(s.client_name || ""));
  if (!hasTimi) {
    clearMorningDc(d);
    d.slots.push(
      slot({
        area: "Hub Room",
        service: "Day Centre",
        time_slot: "11 to 1",
        client_name: "Timi",
        instructors: "VICTOR",
        participant_info: timiInfo,
      }),
      slot({
        area: "Hub Room",
        service: "Day Centre",
        time_slot: "1 to 2",
        client_name: "Fadi",
        instructors: "VICTOR",
        participant_info: fadiInfo,
      }),
      slot({
        area: "Hub Room",
        service: "Day Centre",
        time_slot: "2 to 4",
        client_name: "Emanuel",
        instructors: "VICTOR",
        participant_info: emInfo,
      })
    );
    sortSlots(d);
    notes.push(`${DAYS.mon} victor: restored Timi/Fadi/Emanuel`);
  } else {
    notes.push(`${DAYS.mon} victor: kept existing morning`);
  }
}
setOff(raul, DAYS.mon, "raul");

// --- Tuesday ---
setRobertoFadi(DAYS.tue, "Day Centre");
setOff(youssef, DAYS.tue, "youssef");
setOff(victor, DAYS.tue, "victor");
setIkram(michelle, DAYS.tue, false);
setIkram(luliya, DAYS.tue, false);
{
  const d = ensureDay(raul, DAYS.tue);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub · Manager",
      service: "Day Centre",
      time_slot: "11 to 12.30",
      client_name: "MANAGER",
      instructors: "RAUL",
    }),
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "RAUL",
      participant_info: fadiInfo,
    })
  );
  sortSlots(d);
  notes.push(`${DAYS.tue} raul: Manager 11–12.30 · Fadi 12.30–3`);
}

// --- Wednesday ---
setRobertoFadi(DAYS.wed, "Small Pool");
setYoussefEmanuelFadi(DAYS.wed);
setOff(raul, DAYS.wed, "raul");
setIkram(michelle, DAYS.wed, true);
setIkram(luliya, DAYS.wed, true);
{
  const d = ensureDay(victor, DAYS.wed);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub · Manager",
      service: "Day Centre",
      time_slot: "11 to 12.30",
      client_name: "MANAGER",
      instructors: "VICTOR",
    }),
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "12.30 to 2",
      client_name: "Fadi",
      instructors: "VICTOR",
      participant_info: fadiInfo,
    }),
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "2 to 4",
      client_name: "Emanuel",
      instructors: "VICTOR",
      participant_info: emInfo,
    })
  );
  sortSlots(d);
  notes.push(`${DAYS.wed} victor: Manager 11–12.30 · Fadi 12.30–2 · Emanuel 2–4`);
}

// --- Thursday ---
setRobertoFadi(DAYS.thu, "Day Centre");
{
  const d = ensureDay(raul, DAYS.thu);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "RAUL",
      participant_info: fadiInfo,
    })
  );
  sortSlots(d);
  notes.push(`${DAYS.thu} raul: Fadi 12.30–3`);
}
setOff(michelle, DAYS.thu, "michelle");
setOff(luliya, DAYS.thu, "luliya");
setOff(youssef, DAYS.thu, "youssef");
setOff(victor, DAYS.thu, "victor");

// --- Friday ---
setRobertoFri(DAYS.fri);
setYoussefFri(DAYS.fri);
setOff(victor, DAYS.fri, "victor");
setIkram(michelle, DAYS.fri, true);
setIkram(luliya, DAYS.fri, true);
{
  const d = ensureDay(raul, DAYS.fri);
  clearMorningDc(d);
  d.slots.push(
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "11 to 1",
      client_name: "Timi",
      instructors: "RAUL",
      participant_info: timiInfo,
    }),
    slot({
      area: "Hub Room",
      service: "Day Centre",
      time_slot: "1 to 3",
      client_name: "Emanuel",
      instructors: "RAUL",
      participant_info: emInfo,
    })
  );
  sortSlots(d);
  notes.push(`${DAYS.fri} raul: Timi 11–1 · Emanuel 1–3`);
}

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.updated_at = new Date().toISOString();
doc.meta.notes = (doc.meta.notes || []).concat(["week 20–24 Jul mornings"]).concat(notes).slice(-80);

const patch = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026",
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      revision: nextRev,
      document: doc,
      updated_at: new Date().toISOString(),
    }),
  }
);
const body = await patch.text();
if (!patch.ok) throw new Error("patch failed " + patch.status + " " + body);
console.log(JSON.stringify({ ok: true, revision: nextRev, notes }, null, 2));
