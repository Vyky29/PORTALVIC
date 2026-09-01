/**
 * Week 27–31 Jul — Roberto starts 11 Mon/Wed/Fri:
 *   Mon/Fri: Timi 11–1 (Hub→Big Pool) · Yaqoub 1–2 · Emanuel 2–4
 *   Wed:     Emanuel 11–1 (Hub→Big Pool) · Yaqoub 1–2 · Emanuel 2–4
 *            (no Acton PM — Acton is Tue only)
 * Fri: add Youssef Emanuel 11–1 (Hub→Big Pool). Fadi still holiday.
 *
 *   node database/local-vault/patch-madre-roberto-mwf-timi-emanuel-youssef-fri.mjs
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
const WED = "2026-07-29";
const FRI = "2026-07-31";
const WD = {
  [MON]: "Monday",
  [WED]: "Wednesday",
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

function dropClients(day, re) {
  day.slots = (day.slots || []).filter(
    (s) => !re.test(String(s.client_name || "").trim()),
  );
}

function dropActon(day) {
  day.slots = (day.slots || []).filter(
    (s) => !/acton/i.test(String(s.venue || "")),
  );
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

function snap(st, iso) {
  const d = (st.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  return (d?.slots || []).map(
    (s) =>
      `${s.time_slot} ${s.client_name} ${s.venue}/${s.area || s.pool_note || ""}`,
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
if (!week) throw new Error("week missing " + WEEK_START);

const roberto = findStaff(week, "roberto");
const victor = findStaff(week, "victor");
const raul = findStaff(week, "raul");
const youssef = findStaff(week, "youssef");
if (!roberto || !victor || !raul || !youssef) throw new Error("staff missing");

const infos = {
  timi: infoFromDoc(doc, /^timi/i),
  emanuel: infoFromDoc(doc, /^emanuel/i),
  yaqoub: infoFromDoc(doc, /^yaqoub/i),
  tinashe: infoFromDoc(doc, /^tinashe$/i),
};

// --- Roberto Mon/Wed/Fri ---
for (const iso of [MON, WED, FRI]) {
  const d = ensureDay(roberto, iso);
  dropClients(d, /^(timi|emanuel|yaqoub|saaib|adam\s*p)/i);
  dropActon(d);
  if (iso === WED) {
    d.slots.push(special11to1("Emanuel", "ROBERTO", infos.emanuel));
  } else {
    d.slots.push(special11to1("Timi", "ROBERTO", infos.timi));
  }
  d.slots.push(yaqoubSlot(infos.yaqoub));
  d.slots.push(emanuel2to4(infos.emanuel));
  sortSlots(d);
}

// --- Wed: Raul loses Emanuel morning (Roberto has him); keep Tinashe ---
{
  const d = ensureDay(raul, WED);
  dropClients(d, /^emanuel/i);
  if (!(d.slots || []).some((s) => /^tinashe$/i.test(String(s.client_name || "")))) {
    d.slots.push({
      area: "Small Pool",
      venue: "SwimFarm",
      service: "Aquatic Activity",
      pool_note: "Small Pool",
      time_slot: "1 to 1.30",
      client_name: "Tinashe",
      instructors: "RAUL",
      participant_info: infos.tinashe,
    });
  }
  sortSlots(d);
}

// --- Mon: Raul keeps Emanuel 11–1 + Tinashe (Roberto has Timi) ---
{
  const d = ensureDay(raul, MON);
  dropClients(d, /^(emanuel|tinashe)$/i);
  d.slots.push(special11to1("Emanuel", "RAUL", infos.emanuel));
  d.slots.push({
    area: "Small Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Small Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: infos.tinashe,
  });
  sortSlots(d);
}

// --- Fri: Raul loses Emanuel (Youssef takes him); keep Tinashe ---
{
  const d = ensureDay(raul, FRI);
  dropClients(d, /^emanuel/i);
  if (!(d.slots || []).some((s) => /^tinashe$/i.test(String(s.client_name || "")))) {
    d.slots.push({
      area: "Small Pool",
      venue: "SwimFarm",
      service: "Aquatic Activity",
      pool_note: "Small Pool",
      time_slot: "1 to 1.30",
      client_name: "Tinashe",
      instructors: "RAUL",
      participant_info: infos.tinashe,
    });
  }
  sortSlots(d);
}

// --- Victor Mon/Wed/Fri: Emanuel 1–2 only (no Timi — Roberto has him Mon/Fri) ---
for (const iso of [MON, WED, FRI]) {
  const d = ensureDay(victor, iso);
  dropClients(d, /^(timi|emanuel)$/i);
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

// --- Youssef Fri: Emanuel 11–1 (Fadi holiday this week) ---
{
  const d = ensureDay(youssef, FRI);
  dropClients(d, /^(emanuel|fadi|timi|ikram|casa|home|manager)$/i);
  d.slots.push(special11to1("Emanuel", "YOUSSEF", infos.emanuel));
  sortSlots(d);
}

const summary = {
  mon: {
    roberto: snap(roberto, MON),
    raul: snap(raul, MON),
    victor: snap(victor, MON),
  },
  wed: {
    roberto: snap(roberto, WED),
    raul: snap(raul, WED),
    victor: snap(victor, WED),
  },
  fri: {
    roberto: snap(roberto, FRI),
    raul: snap(raul, FRI),
    victor: snap(victor, FRI),
    youssef: snap(youssef, FRI),
  },
};

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${nextRev}: Roberto M/W/F from 11 — Timi Mon/Fri · Emanuel Wed; Yaqoub 1–2 + Emanuel 2–4; Fri +Youssef Emanuel 11–1; Wed no Acton`,
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
