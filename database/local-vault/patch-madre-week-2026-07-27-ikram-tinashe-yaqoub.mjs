/**
 * Week Mon 27 – Fri 31 Jul 2026:
 *   Ikram Monday = SPECIAL card (DC + swim midday)
 *   Tinashe Mon/Wed/Fri = Small Pool 1–1.30 (Raul)
 *   Yaqoub Big Pool Mon–Wed (Roberto) — not Thu/Fri
 *
 *   node database/local-vault/patch-madre-week-2026-07-27-ikram-tinashe-yaqoub.mjs
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
const WD = {
  "2026-07-27": "Monday",
  "2026-07-28": "Tuesday",
  "2026-07-29": "Wednesday",
  "2026-07-30": "Thursday",
  "2026-07-31": "Friday",
};
const TINASHE_DAYS = ["2026-07-27", "2026-07-29", "2026-07-31"];
const YAQOUB_DAYS = ["2026-07-27", "2026-07-28", "2026-07-29"];

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

function dropClient(day, re) {
  day.slots = (day.slots || []).filter(
    (s) => !re.test(String(s.client_name || "").trim()),
  );
}

function setIkramSpecialMon(michelle, lulia, ikramInfo) {
  const iso = "2026-07-27";
  for (const st of [michelle, lulia]) {
    if (!st) continue;
    const d = ensureDay(st, iso);
    for (const s of d.slots || []) {
      if (!/^ikram$/i.test(String(s.client_name || "").trim())) continue;
      s.area = "Hub Room";
      s.venue = "SwimFarm";
      s.service = "Day Centre";
      s.pool_note = "Hub Room";
      s.time_slot = "11 to 4";
      s.participant_info = ikramInfo || s.participant_info || "";
      s.segments = [
        { time_slot: "11 to 12", area: "Day Centre" },
        { time_slot: "12 to 1", area: "Big Pool" },
        { time_slot: "1 to 4", area: "Day Centre" },
      ];
      s.instructors = "LULIYA, MICHELLE";
    }
    sortSlots(d);
  }
}

function setTinasheSmallPool(raul, tinasheInfo) {
  for (const iso of TINASHE_DAYS) {
    const d = ensureDay(raul, iso);
    dropClient(d, /^tinashe$/i);
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
}

function setYaqoubMonTueWed(roberto, yaqoubInfo) {
  // clear Yaqoub from all week days first
  for (const iso of Object.keys(WD)) {
    const d = ensureDay(roberto, iso);
    dropClient(d, /^yaqoub$/i);
    sortSlots(d);
  }
  for (const iso of YAQOUB_DAYS) {
    const d = ensureDay(roberto, iso);
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
    sortSlots(d);
  }
}

function patchWeek(week, infos) {
  const michelle = findStaff(week, "michelle");
  const lulia = findStaff(week, "lulia") || findStaff(week, "luliya");
  const raul = findStaff(week, "raul");
  const roberto = findStaff(week, "roberto");
  if (!michelle || !raul || !roberto) {
    throw new Error("missing michelle/raul/roberto");
  }
  setIkramSpecialMon(michelle, lulia, infos.ikram);
  setTinasheSmallPool(raul, infos.tinashe);
  setYaqoubMonTueWed(roberto, infos.yaqoub);

  const snap = (st, iso) => {
    const d = (st.days || []).find(
      (x) => String(x.sessionDate || "").slice(0, 10) === iso,
    );
    return (d?.slots || [])
      .filter((s) =>
        /^(ikram|tinashe|yaqoub)$/i.test(String(s.client_name || "").trim()),
      )
      .map(
        (s) =>
          `${s.time_slot} ${s.client_name} ${s.area || s.pool_note}${
            s.segments ? " SPECIAL" : ""
          }`,
      );
  };
  return {
    mon: {
      michelle: snap(michelle, "2026-07-27"),
      raul: snap(raul, "2026-07-27"),
      roberto: snap(roberto, "2026-07-27"),
    },
    tue: { roberto: snap(roberto, "2026-07-28") },
    wed: {
      raul: snap(raul, "2026-07-29"),
      roberto: snap(roberto, "2026-07-29"),
    },
    fri: {
      raul: snap(raul, "2026-07-31"),
      roberto: snap(roberto, "2026-07-31"),
    },
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
  ikram: infoFromDoc(doc, /^ikram$/i),
  tinashe: infoFromDoc(doc, /^tinashe$/i),
  yaqoub: infoFromDoc(doc, /^yaqoub/i),
};

const summary = patchWeek(week, infos);

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Week 27–31 — Ikram Mon SPECIAL; Tinashe Small Pool Mon/Wed/Fri 1–1.30; Yaqoub Big Pool Mon–Wed 1–2`;
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

console.log({ prevRev, nextRev: out[0].revision, summary });
