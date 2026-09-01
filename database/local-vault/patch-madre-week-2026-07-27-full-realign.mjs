/**
 * Week 27–31 Jul full realign:
 *   Mon/Wed SwimFarm same:
 *     Raul Timi 11–1 + Tinashe 1–1.30
 *     Roberto Emanuel 11–1 · Yaqoub 1–2 · Emanuel 2–4
 *     Victor Emanuel 1–2
 *     Michelle+Luliya Ikram 11–4
 *   Tue: Raul/Victor OFF; Roberto Acton only 4.30–6.30
 *   Wed: SwimFarm = Mon + Roberto Acton PM
 *   Thu: everyone OFF
 *   Fri:
 *     Youssef+Luliya Ikram SPECIAL 11–4
 *     Roberto Emanuel 11–1 · Yaqoub 1–2
 *     Raul Timi 11–1 · Tinashe 1–1.30
 *
 *   node database/local-vault/patch-madre-week-2026-07-27-full-realign.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const LOCAL_MADRE = path.join(root, "working_ui/portal/roster_term_master.json");

const env = fs.readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8");
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

const WEEK_START = "2026-07-27";
const MON = "2026-07-27";
const TUE = "2026-07-28";
const WED = "2026-07-29";
const THU = "2026-07-30";
const FRI = "2026-07-31";
const WD = {
  [MON]: "Monday",
  [TUE]: "Tuesday",
  [WED]: "Wednesday",
  [THU]: "Thursday",
  [FRI]: "Friday",
};

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) => String(s.staffKey || "").toLowerCase() === want,
  );
}

function ensureDay(st, iso) {
  st.days = Array.isArray(st.days) ? st.days : [];
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

function infoFromDoc(doc, clientRe) {
  for (const w of doc.weeks || []) {
    for (const st of w.staff || []) {
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

function clearDay(st, iso) {
  const d = ensureDay(st, iso);
  d.slots = [];
  return d;
}

function special11to1(client, instructors, info) {
  return {
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "11 to 1",
    client_name: client,
    instructors,
    participant_info: info,
    segments: [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
    ],
  };
}

function tinasheSlot(info) {
  return {
    area: "Small Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Small Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: info,
  };
}

function yaqoubSlot(info) {
  return {
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 2",
    client_name: "Yaqoub",
    instructors: "ROBERTO",
    participant_info: info,
  };
}

function emanuel2to4(info) {
  return {
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "2 to 4",
    client_name: "Emanuel",
    instructors: "ROBERTO",
    participant_info: info,
  };
}

function actonSlots(saaibInfo, adamInfo) {
  return [
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "4.30 to 5",
      client_name: "Saaib",
      instructors: "ROBERTO",
      participant_info: saaibInfo,
    },
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "5 to 6.30",
      client_name: "Adam P",
      instructors: "ROBERTO",
      participant_info: adamInfo,
    },
  ];
}

function ikramPlain(instructors, info, segs) {
  const s = {
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "11 to 4",
    client_name: "Ikram",
    instructors,
    participant_info: info,
  };
  if (segs) s.segments = segs;
  return s;
}

const IKRAM_SPECIAL_SEGS = [
  { time_slot: "11 to 12", area: "Day Centre" },
  { time_slot: "12 to 1", area: "Big Pool" },
  { time_slot: "1 to 4", area: "Day Centre" },
];

function snap(st, iso) {
  const d = (st.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  return (d?.slots || []).map(
    (s) =>
      `${s.time_slot} ${s.client_name} ${s.venue}/${s.area || s.pool_note || ""}${
        s.segments ? " SPECIAL" : ""
      }`,
  );
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;

const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!week) throw new Error("week missing");

const staff = {
  michelle: findStaff(week, "michelle"),
  lulia: findStaff(week, "lulia"),
  youssef: findStaff(week, "youssef"),
  raul: findStaff(week, "raul"),
  roberto: findStaff(week, "roberto"),
  victor: findStaff(week, "victor"),
};
for (const [k, v] of Object.entries(staff)) {
  if (!v) throw new Error("missing " + k);
}

const infos = {
  timi: infoFromDoc(doc, /^timi/i),
  emanuel: infoFromDoc(doc, /^emanuel/i),
  yaqoub: infoFromDoc(doc, /^yaqoub/i),
  tinashe: infoFromDoc(doc, /^tinashe$/i),
  ikram: infoFromDoc(doc, /^ikram/i),
  saaib: infoFromDoc(doc, /^saaib$/i),
  adam: infoFromDoc(doc, /^adam\s*p/i),
};

function setSwimFarmMonWed(iso) {
  // Michelle + Luliya Ikram
  for (const [st, name] of [
    [staff.michelle, "MICHELLE"],
    [staff.lulia, "LULIYA"],
  ]) {
    const d = clearDay(st, iso);
    d.slots.push(
      ikramPlain(name, infos.ikram, [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Small Pool" },
        { time_slot: "1 to 4", area: "Day Centre" },
      ]),
    );
    sortSlots(d);
  }

  // Raul: Timi 11–1 + Tinashe
  {
    const d = clearDay(staff.raul, iso);
    d.slots.push(special11to1("Timi", "RAUL", infos.timi));
    d.slots.push(tinasheSlot(infos.tinashe));
    sortSlots(d);
  }

  // Roberto SwimFarm
  {
    const d = clearDay(staff.roberto, iso);
    d.slots.push(special11to1("Emanuel", "ROBERTO", infos.emanuel));
    d.slots.push(yaqoubSlot(infos.yaqoub));
    d.slots.push(emanuel2to4(infos.emanuel));
    sortSlots(d);
  }

  // Victor: Emanuel 1–2
  {
    const d = clearDay(staff.victor, iso);
    d.slots.push({
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "1 to 2",
      client_name: "Emanuel",
      instructors: "VICTOR",
      participant_info: infos.emanuel,
    });
    sortSlots(d);
  }

  // Youssef off Mon/Wed SwimFarm DC (holiday week — clear)
  clearDay(staff.youssef, iso);
}

// --- Mon ---
setSwimFarmMonWed(MON);

// --- Tue: Raul/Victor OFF; Roberto Acton only; keep Michelle+Luliya Ikram if present ---
clearDay(staff.raul, TUE);
clearDay(staff.victor, TUE);
clearDay(staff.youssef, TUE);
{
  const d = clearDay(staff.roberto, TUE);
  d.slots.push(...actonSlots(infos.saaib, infos.adam));
  sortSlots(d);
}
// Michelle+Luliya Tue: leave Ikram if they had it, or clear? User only named R/V/Roberto off.
// Keep Michelle+Luliya Tue Ikram plain
for (const [st, name] of [
  [staff.michelle, "MICHELLE"],
  [staff.lulia, "LULIYA"],
]) {
  const d = clearDay(st, TUE);
  d.slots.push(ikramPlain(name, infos.ikram));
  sortSlots(d);
}

// --- Wed = Mon SwimFarm + Roberto Acton ---
setSwimFarmMonWed(WED);
{
  const d = ensureDay(staff.roberto, WED);
  d.slots.push(...actonSlots(infos.saaib, infos.adam));
  sortSlots(d);
}

// --- Thu: everyone OFF ---
for (const st of Object.values(staff)) clearDay(st, THU);

// --- Fri ---
clearDay(staff.michelle, FRI); // only Youssef+Luliya on Ikram
clearDay(staff.victor, FRI);
{
  const d = clearDay(staff.lulia, FRI);
  d.slots.push(
    ikramPlain("LULIYA", infos.ikram, IKRAM_SPECIAL_SEGS),
  );
  sortSlots(d);
}
{
  const d = clearDay(staff.youssef, FRI);
  d.slots.push(
    ikramPlain("YOUSSEF", infos.ikram, IKRAM_SPECIAL_SEGS),
  );
  sortSlots(d);
}
{
  const d = clearDay(staff.roberto, FRI);
  d.slots.push(special11to1("Emanuel", "ROBERTO", infos.emanuel));
  d.slots.push(yaqoubSlot(infos.yaqoub));
  sortSlots(d);
}
{
  const d = clearDay(staff.raul, FRI);
  d.slots.push(special11to1("Timi", "RAUL", infos.timi));
  d.slots.push(tinasheSlot(infos.tinashe));
  sortSlots(d);
}

const summary = {};
for (const iso of [MON, TUE, WED, THU, FRI]) {
  summary[iso] = {};
  for (const [k, st] of Object.entries(staff)) {
    const rows = snap(st, iso);
    if (rows.length) summary[iso][k] = rows;
  }
}

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${nextRev}: Week 27–31 — Mon=Wed SwimFarm (Raul Timi); Tue R/V off Roberto Acton; Wed +Acton; Thu all off; Fri Youssef+Luliya Ikram SPECIAL, Roberto Em/Yaq, Raul Timi/Tinashe`,
);

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
    }),
  },
);
const body = await put.json();
if (!put.ok) {
  console.error(body);
  throw new Error("PATCH failed " + put.status);
}

fs.writeFileSync(LOCAL_MADRE, JSON.stringify(doc, null, 2) + "\n");
console.log(JSON.stringify({ prevRev, nextRev, summary }, null, 2));
