/**
 * MADRE summer-2026 week Mon 20 – Fri 24 Jul 2026 (rev 215+):
 *   Roberto: Zakariya Aquatic 1–2 (Mon–Thu) · Fadi 12.30–1 + 2–3 around him
 *   Alex: Patrick Climb 11–12 · Zakariya Climb 12–1 (Mon–Thu Westway)
 *
 * Applied live as rev 215 on 2026-07-20. Idempotent.
 *
 *   node database/local-vault/patch-madre-roberto-zak-alex-crash-w1.mjs
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

const WEEK_START = "2026-07-20";
const ZAK_DAYS = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];
const WD = {
  "2026-07-20": "Monday",
  "2026-07-21": "Tuesday",
  "2026-07-22": "Wednesday",
  "2026-07-23": "Thursday",
  "2026-07-24": "Friday",
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

function keepAfternoonOnly(slot) {
  const t = String(slot.time_slot || "").toLowerCase();
  const m = t.match(/^(\d{1,2})/);
  if (!m) return true;
  let h = +m[1];
  if (h >= 1 && h <= 7) h += 12;
  return h >= 15;
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
const notes = [];

const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!week) throw new Error("week missing " + WEEK_START);

const fadiInfo = infoFromDoc(doc, /^fadi$/i);
const zakInfo = infoFromDoc(doc, /^zakariya$/i);
const patrickInfo = infoFromDoc(doc, /^patrick$/i);
const roberto = findStaff(week, "roberto");
if (!roberto) throw new Error("roberto missing");

let alreadyOk = true;
for (const iso of ZAK_DAYS) {
  const d = (roberto.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  const hasZak = (d?.slots || []).some(
    (s) =>
      /^zakariya$/i.test(String(s.client_name || "")) &&
      /^1\s*to\s*2/i.test(String(s.time_slot || "")),
  );
  if (!hasZak) alreadyOk = false;
}
const alex = findStaff(week, "alex");
if (
  !alex ||
  !(alex.days || []).some((d) =>
    (d.slots || []).some(
      (s) =>
        /^patrick$/i.test(String(s.client_name || "")) &&
        /11\s*to\s*12/i.test(String(s.time_slot || "")),
    ),
  )
) {
  alreadyOk = false;
}
if (alreadyOk) {
  console.log("noop — Roberto Zak 1–2 + Alex Patrick/Zak already set", {
    revision: prevRev,
  });
  process.exit(0);
}

for (const iso of ZAK_DAYS) {
  const d = ensureDay(roberto, iso);
  const afternoon = (d.slots || []).filter(
    (s) =>
      keepAfternoonOnly(s) &&
      !/^(fadi|zakariya|acat)$/i.test(String(s.client_name || "").trim()),
  );
  const firstArea =
    (d.slots || [])
      .find((s) => /^fadi$/i.test(String(s.client_name || "")))
      ?.segments?.find((g) =>
        /12\.?30\s*to\s*1/i.test(String(g.time_slot || "")),
      )?.area || "Small Pool";

  d.slots = [
    ...afternoon,
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
        { time_slot: "12.30 to 1", area: firstArea },
        { time_slot: "2 to 3", area: "Day Centre" },
      ],
    },
    {
      area: "Big Pool",
      venue: "SwimFarm",
      service: "Aquatic Activity",
      pool_note: "Big Pool",
      time_slot: "1 to 2",
      client_name: "Zakariya",
      instructors: "ROBERTO",
      participant_info: zakInfo,
    },
  ];
  sortSlots(d);
  notes.push(`${iso} roberto: Fadi 12.30–1 · Zak 1–2 · Fadi 2–3`);
}

{
  const iso = "2026-07-24";
  const d = ensureDay(roberto, iso);
  const afternoon = (d.slots || []).filter(
    (s) =>
      keepAfternoonOnly(s) &&
      !/^(fadi|zakariya|acat)$/i.test(String(s.client_name || "").trim()),
  );
  d.slots = [
    ...afternoon,
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
  ];
  sortSlots(d);
  notes.push(`${iso} roberto: Fadi 12.30–3 (no Zak — Fri)`);
}

let alexSt = findStaff(week, "alex");
if (!alexSt) {
  alexSt = {
    staffKey: "alex",
    staffName: "Alex",
    venues: ["Westway"],
    days: [],
  };
  week.staff.push(alexSt);
  notes.push("added alex staff block to week 20–24 Jul");
}
alexSt.venues = Array.from(new Set([...(alexSt.venues || []), "Westway"]));

for (const iso of ZAK_DAYS) {
  const d = ensureDay(alexSt, iso);
  d.slots = (d.slots || []).filter(
    (s) => !/^(patrick|zakariya)$/i.test(String(s.client_name || "").trim()),
  );
  d.slots.push(
    {
      area: "Wall",
      venue: "Westway",
      service: "Climbing Activity",
      pool_note: "Wall",
      time_slot: "11 to 12",
      client_name: "Patrick",
      instructors: "ALEX",
      participant_info: patrickInfo,
    },
    {
      area: "Wall",
      venue: "Westway",
      service: "Climbing Activity",
      pool_note: "Wall",
      time_slot: "12 to 1",
      client_name: "Zakariya",
      instructors: "ALEX",
      participant_info: zakInfo,
    },
  );
  sortSlots(d);
  notes.push(`${iso} alex: Patrick 11–12 · Zakariya 12–1`);
}
ensureDay(alexSt, "2026-07-24");

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Roberto Zak 1–2 Mon–Thu 20–23; Alex Patrick 11–12 + Zak 12–1 Westway`,
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
console.log({ prevRev, nextRev: out[0].revision, notes });
