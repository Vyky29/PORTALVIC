/**
 * Week 27–31 Jul: Yaqoub Big Pool Mon/Wed/Fri (not Tue).
 * Tue Roberto = Acton only 4.30–6.30 (Saaib + Adam P).
 *
 *   node database/local-vault/patch-madre-yaqoub-mon-wed-fri-roberto-tue-acton.mjs
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
const YAQOUB_DAYS = ["2026-07-27", "2026-07-29", "2026-07-31"];
const TUE = "2026-07-28";

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

function isMorningSlot(slot) {
  const m = String(slot.time_slot || "")
    .toLowerCase()
    .match(/^(\d{1,2})/);
  if (!m) return false;
  let h = +m[1];
  if (h >= 1 && h <= 7) h += 12;
  return h < 16; // before 4pm
}

function patchWeek(week, yaqoubInfo, saaibInfo, adamInfo) {
  const roberto = findStaff(week, "roberto");
  if (!roberto) throw new Error("roberto missing");

  // Clear Yaqoub from all week days, then set Mon/Wed/Fri
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

  // Tuesday: only Acton PM (drop morning slots for Roberto)
  const tue = ensureDay(roberto, TUE);
  dropClient(tue, /^yaqoub$/i);
  tue.slots = (tue.slots || []).filter((s) => !isMorningSlot(s));
  // ensure Acton PM present
  const hasSaaib = tue.slots.some((s) =>
    /^saaib$/i.test(String(s.client_name || "").trim()),
  );
  const hasAdam = tue.slots.some((s) =>
    /^adam\s*p/i.test(String(s.client_name || "").trim()),
  );
  if (!hasSaaib) {
    tue.slots.push({
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "4.30 to 5",
      client_name: "Saaib",
      instructors: "ROBERTO",
      participant_info: saaibInfo,
    });
  }
  if (!hasAdam) {
    tue.slots.push({
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "5 to 6.30",
      client_name: "Adam P",
      instructors: "ROBERTO",
      participant_info: adamInfo,
    });
  }
  sortSlots(tue);

  const snap = (iso) => {
    const d = (roberto.days || []).find(
      (x) => String(x.sessionDate || "").slice(0, 10) === iso,
    );
    return (d?.slots || []).map(
      (s) => `${s.time_slot} ${s.client_name} ${s.venue}/${s.area || s.pool_note}`,
    );
  };
  return {
    mon: snap("2026-07-27"),
    tue: snap("2026-07-28"),
    wed: snap("2026-07-29"),
    thu: snap("2026-07-30"),
    fri: snap("2026-07-31"),
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

const summary = patchWeek(
  week,
  infoFromDoc(doc, /^yaqoub/i),
  infoFromDoc(doc, /^saaib/i),
  infoFromDoc(doc, /^adam\s*p/i),
);

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Yaqoub Big Pool Mon/Wed/Fri; Roberto Tue Acton only 4.30–6.30`;
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
patchWeek(
  localWeek,
  infoFromDoc(doc, /^yaqoub/i),
  infoFromDoc(doc, /^saaib/i),
  infoFromDoc(doc, /^adam\s*p/i),
);
local.meta = local.meta || {};
local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
local.meta.notes.push(note);
local.meta.revision = nextRev;
fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");

console.log({ prevRev, nextRev: out[0].revision, summary });
