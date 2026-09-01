/**
 * Mon 27 Jul 2026 — rota (Victor):
 *   Roberto: Emanuel 11–1 SPECIAL · Yaqoub Big Pool 1–2 · Emanuel 2–4
 *   Victor:  Timi 11–1 SPECIAL · Emanuel 1–2
 *   Raul:    Tinashe 1–1.30 only
 *
 *   node database/local-vault/patch-madre-mon-2026-07-27-roberto-victor-raul.mjs
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

const ISO = "2026-07-27";
const WEEK_START = "2026-07-27";

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
  d = { weekday: "Monday", sessionDate: iso, slots: [] };
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

function patchWeek(week, infos) {
  const roberto = findStaff(week, "roberto");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  if (!roberto || !victor || !raul) {
    throw new Error("missing staff roberto/victor/raul");
  }

  const rd = ensureDay(roberto, ISO);
  dropClients(rd, /^(emanuel|yaqoub|tinashe|timi|zakariya|fadi)$/i);
  rd.slots.push(
    special11to1("Emanuel", "ROBERTO", infos.emanuel),
    {
      area: "Big Pool",
      venue: "SwimFarm",
      service: "Aquatic Activity",
      pool_note: "Big Pool",
      time_slot: "1 to 2",
      client_name: "Yaqoub",
      instructors: "ROBERTO",
      participant_info: infos.yaqoub,
    },
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "2 to 4",
      client_name: "Emanuel",
      instructors: "ROBERTO",
      participant_info: infos.emanuel,
    },
  );
  sortSlots(rd);

  const vd = ensureDay(victor, ISO);
  dropClients(vd, /^(emanuel|timi|yaqoub|tinashe|zakariya|fadi)$/i);
  vd.slots.push(
    special11to1("Timi", "VICTOR", infos.timi),
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "1 to 2",
      client_name: "Emanuel",
      instructors: "VICTOR",
      participant_info: infos.emanuel,
    },
  );
  sortSlots(vd);

  const ad = ensureDay(raul, ISO);
  dropClients(ad, /^(emanuel|timi|yaqoub|tinashe|zakariya|fadi)$/i);
  ad.slots.push({
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: infos.tinashe,
  });
  sortSlots(ad);

  return {
    roberto: rd.slots.map((s) => `${s.time_slot} ${s.client_name} ${s.area}`),
    victor: vd.slots.map((s) => `${s.time_slot} ${s.client_name} ${s.area}`),
    raul: ad.slots.map((s) => `${s.time_slot} ${s.client_name} ${s.area}`),
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

const infos = {
  emanuel: infoFromDoc(doc, /^emanuel/i),
  timi: infoFromDoc(doc, /^timi/i),
  yaqoub: infoFromDoc(doc, /^yaqoub/i),
  tinashe: infoFromDoc(doc, /^tinashe$/i),
};

const summary = patchWeek(week, infos);

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note =
  `rev ${prevRev + 1}: Mon 27 — Roberto Emanuel 11–1 SPECIAL + Yaqoub 1–2 Big Pool + Emanuel 2–4; Victor Timi 11–1 SPECIAL + Emanuel 1–2; Raul Tinashe 1–1.30 only`;
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
    }),
  },
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}

const local = JSON.parse(fs.readFileSync(LOCAL_MADRE, "utf8"));
const localWeek = (local.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!localWeek) throw new Error("local week missing");
patchWeek(localWeek, infos);
local.meta = local.meta || {};
local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
local.meta.notes.push(note);
local.meta.revision = nextRev;
fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");

console.log({
  prevRev,
  nextRev: out[0].revision,
  roberto: summary.roberto,
  victor: summary.victor,
  raul: summary.raul,
});
