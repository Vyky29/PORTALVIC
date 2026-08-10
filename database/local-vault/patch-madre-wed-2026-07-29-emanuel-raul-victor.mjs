/**
 * Wed 29 Jul 2026 — Emanuel coverage:
 *   Raul 11–1: Day Centre 11–12 + Big Pool swim 12–1 (segments, one slot)
 *   Victor 1–2: Day Centre
 *   Raul keeps Tinashe 1–1.30 Big Pool
 *
 *   node database/local-vault/patch-madre-wed-2026-07-29-emanuel-raul-victor.mjs
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

const ISO = "2026-07-29";
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

function patchWeek(week, emanuelInfo, tinasheInfo) {
  const raul = findStaff(week, "raul");
  const victor = findStaff(week, "victor");
  if (!raul) throw new Error("raul missing");
  if (!victor) throw new Error("victor missing");

  const rd = ensureDay(raul, ISO);
  rd.slots = (rd.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^emanuel/.test(n)) return false;
    if (/^tinashe$/.test(n)) return false;
    if (/^(casa|home|manager)$/.test(n)) return false;
    return true;
  });
  rd.slots.push({
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
  rd.slots.push({
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: tinasheInfo,
  });
  sortSlots(rd);

  const vd = ensureDay(victor, ISO);
  vd.slots = (vd.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^emanuel/.test(n)) return false;
    if (/^(casa|home)$/.test(n)) return false;
    return true;
  });
  vd.slots.push({
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "1 to 2",
    client_name: "Emanuel",
    instructors: "VICTOR",
    participant_info: emanuelInfo,
  });
  sortSlots(vd);

  return { raul: rd.slots, victor: vd.slots };
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

const emanuelInfo = infoFromDoc(doc, /^emanuel/i);
const tinasheInfo = infoFromDoc(doc, /^tinashe$/i);

const summary = patchWeek(week, emanuelInfo, tinasheInfo);

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Wed 29 — Emanuel Raul 11–1 (DC 11–12 + Big Pool 12–1) · Victor 1–2; Tinashe Raul 1–1.30`,
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

/* Keep local MADRE in sync for Vercel bundle */
const local = JSON.parse(fs.readFileSync(LOCAL_MADRE, "utf8"));
const localWeek = (local.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!localWeek) throw new Error("local week missing");
patchWeek(localWeek, emanuelInfo, tinasheInfo);
local.meta = local.meta || {};
local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
local.meta.notes.push(
  `rev ${nextRev}: Wed 29 — Emanuel Raul 11–1 (DC 11–12 + Big Pool 12–1) · Victor 1–2; Tinashe Raul 1–1.30`,
);
fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");

console.log({
  prevRev,
  nextRev: out[0].revision,
  raul: summary.raul.map((s) => `${s.time_slot} ${s.client_name} ${s.area}`),
  victor: summary.victor.map((s) => `${s.time_slot} ${s.client_name} ${s.area}`),
});
