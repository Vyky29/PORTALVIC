/**
 * Wed 22 Jul 2026 — Luliya sick (requested day off) + Day Centre rota change.
 *
 * Michelle  11–16 Ikram
 * Victor    11–15 Ikram
 * Youssef   11–16 Emanuel
 * Raul      12.30–15 Fadi
 * Roberto   12.30–13 Fadi · 13–14 Zakariya · 14–15 Fadi · 15–16 Ikram
 * Luliya    clear slots + staff_unavailability (Time off requested)
 *
 *   node database/local-vault/patch-madre-wed-2026-07-22-luliya-off-rota.mjs
 *   python database/roster_review/sync_roster_madre_to_portal.py
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

const ISO = "2026-07-22";
const WEEK_START = "2026-07-20";
const LULIYA_ID = "a103a7cf-5984-42c1-bde7-17cba2938c2f";

function staffList(week) {
  const s = week.staff;
  if (Array.isArray(s)) return s;
  return Object.values(s || {});
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return staffList(week).find((s) => String(s.staffKey || "").toLowerCase() === want);
}

function ensureDay(st, iso) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) return d;
  d = { weekday: "Wednesday", sessionDate: iso, slots: [] };
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
    for (const st of staffList(w)) {
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

function hubSlot({ time_slot, client_name, instructors, participant_info, segments, area, service, pool_note }) {
  const slot = {
    area: area || "Hub Room",
    venue: "SwimFarm",
    service: service || "Day Centre",
    pool_note: pool_note || area || "Hub Room",
    time_slot,
    client_name,
    instructors,
    participant_info: participant_info || "",
  };
  if (segments?.length) slot.segments = segments;
  return slot;
}

function patchWeek(week, info) {
  const michelle = findStaff(week, "michelle");
  const victor = findStaff(week, "victor");
  const youssef = findStaff(week, "youssef");
  const raul = findStaff(week, "raul");
  const roberto = findStaff(week, "roberto");
  const lulia = findStaff(week, "lulia");
  if (!michelle || !victor || !youssef || !raul || !roberto || !lulia) {
    throw new Error(
      "missing staff " +
        JSON.stringify({
          michelle: !!michelle,
          victor: !!victor,
          youssef: !!youssef,
          raul: !!raul,
          roberto: !!roberto,
          lulia: !!lulia,
        }),
    );
  }

  // Luliya off
  const ld = ensureDay(lulia, ISO);
  ld.slots = [];
  ld.weekday = "Wednesday";
  ld.sessionDate = ISO;

  // Michelle 11–16 Ikram
  const md = ensureDay(michelle, ISO);
  md.slots = [
    hubSlot({
      time_slot: "11 to 4",
      client_name: "Ikram",
      instructors: "MICHELLE",
      participant_info: info.ikram,
      segments: [
        { area: "Day Centre", time_slot: "11 to 12" },
        { area: "Big Pool", time_slot: "12 to 1" },
        { area: "Day Centre", time_slot: "1 to 4" },
      ],
    }),
  ];

  // Victor 11–15 Ikram
  const vd = ensureDay(victor, ISO);
  vd.slots = [
    hubSlot({
      time_slot: "11 to 3",
      client_name: "Ikram",
      instructors: "VICTOR",
      participant_info: info.ikram,
      segments: [
        { area: "Day Centre", time_slot: "11 to 12" },
        { area: "Big Pool", time_slot: "12 to 1" },
        { area: "Day Centre", time_slot: "1 to 3" },
      ],
    }),
  ];

  // Youssef 11–16 Emanuel
  const yd = ensureDay(youssef, ISO);
  yd.slots = [
    hubSlot({
      time_slot: "11 to 4",
      client_name: "Emanuel",
      instructors: "YOUSSEF",
      participant_info: info.emanuel,
      segments: [
        { area: "Day Centre", time_slot: "11 to 12" },
        { area: "Big Pool", time_slot: "12 to 1" },
        { area: "Day Centre", time_slot: "1 to 4" },
      ],
    }),
  ];

  // Raul 12.30–15 Fadi
  const rd = ensureDay(raul, ISO);
  rd.slots = [
    hubSlot({
      time_slot: "12.30 to 3",
      client_name: "Fadi",
      instructors: "RAUL",
      participant_info: info.fadi,
    }),
  ];

  // Roberto blocks
  const rod = ensureDay(roberto, ISO);
  rod.slots = [
    hubSlot({
      time_slot: "12.30 to 1",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: info.fadi,
      area: "Hub Room",
    }),
    hubSlot({
      time_slot: "1 to 2",
      client_name: "Zakariya",
      instructors: "ROBERTO",
      participant_info: info.zakariya,
      area: "Big Pool",
      service: "Aquatic Activity",
      pool_note: "Big Pool",
    }),
    hubSlot({
      time_slot: "2 to 3",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: info.fadi,
    }),
    hubSlot({
      time_slot: "3 to 4",
      client_name: "Ikram",
      instructors: "ROBERTO",
      participant_info: info.ikram,
    }),
  ];
  sortSlots(rod);

  return {
    michelle: md.slots.map((s) => s.time_slot + " " + s.client_name),
    victor: vd.slots.map((s) => s.time_slot + " " + s.client_name),
    youssef: yd.slots.map((s) => s.time_slot + " " + s.client_name),
    raul: rd.slots.map((s) => s.time_slot + " " + s.client_name),
    roberto: rod.slots.map((s) => s.time_slot + " " + s.client_name),
    lulia: ld.slots.length,
  };
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

const info = {
  ikram: infoFromDoc(doc, /^ikram$/i),
  emanuel: infoFromDoc(doc, /^emanuel/i),
  fadi: infoFromDoc(doc, /^fadi$/i),
  zakariya: infoFromDoc(doc, /^zakariya$/i),
};

const summary = patchWeek(week, info);

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Wed 22 — Luliya OFF (sick/requested); Michelle+Victor Ikram; Youssef Emanuel 11–4; Raul Fadi 12.30–3; Roberto Fadi/Zak/Fadi/Ikram`,
);

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
    }),
  },
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}

/* Local MADRE */
const local = JSON.parse(fs.readFileSync(LOCAL_MADRE, "utf8"));
const localWeek = (local.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!localWeek) throw new Error("local week missing");
patchWeek(localWeek, info);
local.meta = local.meta || {};
local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
local.meta.notes.push(
  `rev ${nextRev}: Wed 22 — Luliya OFF (sick/requested); Michelle+Victor Ikram; Youssef Emanuel 11–4; Raul Fadi 12.30–3; Roberto Fadi/Zak/Fadi/Ikram`,
);
fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");

/* Requested day off */
const off = await fetch(url + "/rest/v1/staff_unavailability", {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    name_key: "lulia",
    staff_name: "Aida Luliya",
    staff_id: LULIYA_ID,
    off_date: ISO,
    reason: "Time off requested — Sick",
  }),
});
const offBody = await off.json();
if (!off.ok) {
  // try upsert via on_conflict query
  const off2 = await fetch(
    url + "/rest/v1/staff_unavailability?on_conflict=name_key,off_date",
    {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        name_key: "lulia",
        staff_name: "Aida Luliya",
        staff_id: LULIYA_ID,
        off_date: ISO,
        reason: "Time off requested — Sick",
      }),
    },
  );
  const b2 = await off2.json();
  if (!off2.ok) {
    console.error("unavailability failed", off.status, offBody, off2.status, b2);
    process.exit(1);
  }
  console.log("unavailability", b2);
} else {
  console.log("unavailability", offBody);
}

console.log(JSON.stringify({ ok: true, revision: nextRev, summary }, null, 2));
