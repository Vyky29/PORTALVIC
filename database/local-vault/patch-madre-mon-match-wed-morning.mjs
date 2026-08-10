/**
 * Mon 27 Jul morning = Wed 29 Jul morning:
 *   Michelle+Luliya Ikram 11–4 (Hub → Small Pool 12–1 → Hub)
 *   Raul Emanuel 11–1 (Hub → Big Pool 12–1)
 *   Raul Tinashe 1–1.30 Small Pool
 *   Roberto Yaqoub 1–2 Big Pool
 *   Victor Emanuel 1–2 Hub
 *   Roberto Emanuel 2–4 Hub
 * (no Roberto/Victor 11–1 SPECIAL; no Timi)
 *
 *   node database/local-vault/patch-madre-mon-match-wed-morning.mjs
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

const MON = "2026-07-27";
const WED = "2026-07-29";
const WEEK_START = "2026-07-27";

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) => String(s.staffKey || "").toLowerCase() === want,
  );
}

function ensureDay(st, iso, weekday) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
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

function cloneSlot(s, instructors) {
  const out = JSON.parse(JSON.stringify(s));
  if (instructors) out.instructors = instructors;
  return out;
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

const michelle = findStaff(week, "michelle");
const lulia = findStaff(week, "lulia");
const raul = findStaff(week, "raul");
const roberto = findStaff(week, "roberto");
const victor = findStaff(week, "victor");
if (!michelle || !lulia || !raul || !roberto || !victor) {
  throw new Error("staff missing");
}

const emanuelInfo = infoFromDoc(doc, /^emanuel/i);
const tinasheInfo = infoFromDoc(doc, /^tinashe$/i);
const yaqoubInfo = infoFromDoc(doc, /^yaqoub/i);
const ikramInfo = infoFromDoc(doc, /^ikram/i);

// Template: Wed Michelle Ikram segments (Small Pool 12–1)
const wedMich = ensureDay(michelle, WED, "Wednesday");
const wedIkram = (wedMich.slots || []).find((s) =>
  /^ikram/i.test(String(s.client_name || "")),
);

const ikramSegs = wedIkram?.segments || [
  { time_slot: "11 to 12", area: "Day Centre" },
  { time_slot: "12 to 1", area: "Small Pool" },
  { time_slot: "1 to 4", area: "Day Centre" },
];

for (const [st, key] of [
  [michelle, "MICHELLE"],
  [lulia, "LULIYA"],
]) {
  const d = ensureDay(st, MON, "Monday");
  d.slots = (d.slots || []).filter(
    (s) => !/^ikram/i.test(String(s.client_name || "").trim()),
  );
  d.slots.push({
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "11 to 4",
    client_name: "Ikram",
    instructors: key,
    participant_info: ikramInfo || wedIkram?.participant_info || "",
    segments: JSON.parse(JSON.stringify(ikramSegs)),
  });
  sortSlots(d);
}

// Raul Mon = Wed pattern
{
  const d = ensureDay(raul, MON, "Monday");
  d.slots = (d.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^emanuel/.test(n)) return false;
    if (/^tinashe$/.test(n)) return false;
    if (/^(casa|home|manager)$/.test(n)) return false;
    return true;
  });
  d.slots.push({
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "11 to 1",
    client_name: "Emanuel",
    instructors: "RAUL",
    participant_info: emanuelInfo,
    segments: [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
    ],
  });
  d.slots.push({
    area: "Small Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Small Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: tinasheInfo,
  });
  sortSlots(d);
}

// Roberto Mon: drop morning Emanuel; keep Yaqoub 1–2 + Emanuel 2–4
{
  const d = ensureDay(roberto, MON, "Monday");
  d.slots = (d.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    const t = String(s.time_slot || "").toLowerCase();
    if (/^emanuel/.test(n) && /11\s*to\s*1/.test(t)) return false;
    if (/^yaqoub/.test(n)) return false;
    if (/^emanuel/.test(n) && /2\s*to\s*4/.test(t)) return false;
    if (/^(casa|home)$/.test(n)) return false;
    return true;
  });
  d.slots.push({
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 2",
    client_name: "Yaqoub",
    instructors: "ROBERTO",
    participant_info: yaqoubInfo,
  });
  d.slots.push({
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "2 to 4",
    client_name: "Emanuel",
    instructors: "ROBERTO",
    participant_info: emanuelInfo,
  });
  sortSlots(d);
}

// Victor Mon: drop Timi 11–1; keep Emanuel 1–2 only
{
  const d = ensureDay(victor, MON, "Monday");
  d.slots = (d.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^timi/.test(n)) return false;
    if (/^emanuel/.test(n)) return false;
    if (/^(casa|home)$/.test(n)) return false;
    return true;
  });
  d.slots.push({
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "1 to 2",
    client_name: "Emanuel",
    instructors: "VICTOR",
    participant_info: emanuelInfo,
  });
  sortSlots(d);
}

const summary = {
  michelle: snap(michelle, MON),
  lulia: snap(lulia, MON),
  raul: snap(raul, MON),
  roberto: snap(roberto, MON),
  victor: snap(victor, MON),
};

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const nextRev = prevRev + 1;
doc.meta.notes.push(
  `rev ${nextRev}: Mon 27 morning = Wed 29 — Raul Emanuel 11–1 · Ikram Small Pool 12–1 · no Timi/Roberto AM`,
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
