/**
 * Thursday Acton aquatic:
 * - Elijah → Simon 4–4.30 (from Aurora or Dan)
 * - Aurora drops 4–4.30 so she starts at 4.30 → only 3 seats at 4pm
 *
 *   node database/local-vault/patch-madre-thu-acton-elijah-to-simon.mjs
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
const AQ = "Aquatic Activity";
const VENUE = "Acton";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".");
}

function startMin(t) {
  const m = timeKey(t).match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return 9999;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 8) h += 12;
  return h * 60 + mi;
}

function isFourToFourThirty(t) {
  return /^4(\.00)?\s*to\s*4\.30$/.test(timeKey(t));
}

function isActonAquatic(slot) {
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
}

function ensureStaff(week, key, name) {
  let st = findStaff(week, key);
  if (st) return st;
  const staffKey = String(key).toLowerCase();
  week.staff = week.staff || {};
  st = { staffKey, staffName: name, name, days: [] };
  week.staff[staffKey] = st;
  return st;
}

function ensureDay(st, iso, weekday) {
  let d = (st.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
  st.days = st.days || [];
  st.days.push(d);
  return d;
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function patchWeek(week) {
  const aurora = findStaff(week, "aurora");
  const dan = findStaff(week, "dan");
  const simon = ensureStaff(week, "simon", "Simon");
  const log = [];
  const byIso = new Map(); // iso -> { info, area }

  function harvest(st, label) {
    if (!st) return;
    for (const day of st.days || []) {
      if (norm(day.weekday) !== "Thursday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      const kept = [];
      for (const s of day.slots || []) {
        if (
          isActonAquatic(s) &&
          isFourToFourThirty(s.time_slot) &&
          /elijah/i.test(norm(s.client_name))
        ) {
          byIso.set(iso, {
            info: s.participant_info || "",
            area: s.area || "",
          });
          log.push(`${iso} Elijah off ${label}`);
          continue;
        }
        kept.push(s);
      }
      day.slots = kept;
    }
  }

  harvest(aurora, "Aurora");
  harvest(dan, "Dan");

  // Aurora: no Acton aquatic 4–4.30 at all (starts 4.30)
  if (aurora) {
    for (const day of aurora.days || []) {
      if (norm(day.weekday) !== "Thursday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      const before = (day.slots || []).length;
      day.slots = (day.slots || []).filter(
        (s) => !(isActonAquatic(s) && isFourToFourThirty(s.time_slot)),
      );
      if ((day.slots || []).length !== before) {
        log.push(`${iso} Aurora drop 4–4.30 (starts 4.30)`);
      }
      // If Aurora still has later Acton aquatic, ensure Elijah day is covered
      if ((day.slots || []).some(isActonAquatic) && !byIso.has(iso)) {
        // Standing week without Elijah harvested — still add Simon Elijah if we have any Elijah info elsewhere
      }
    }
  }

  if (!byIso.size) return null;

  for (const [iso, meta] of byIso) {
    const simonDay = ensureDay(simon, iso, "Thursday");
    simonDay.slots = (simonDay.slots || []).filter(
      (s) => !(isActonAquatic(s) && isFourToFourThirty(s.time_slot)),
    );
    simonDay.slots.push({
      client_name: "Elijah",
      time_slot: "4 to 4.30",
      service: AQ,
      venue: VENUE,
      area: meta.area || "",
      pool_note: "",
      instructors: "SIMON",
      participant_info: meta.info || "",
    });
    sortSlots(simonDay);
    log.push(`${iso} Elijah → Simon 4–4.30`);
  }

  return { week: `${week.start || "?"}–${week.end || "?"}`, log };
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = structuredClone(rows[0].document);

const summaries = [];
for (const week of doc.weeks || []) {
  const s = patchWeek(week);
  if (s) summaries.push(s);
}

if (!summaries.length) {
  console.log("Nothing to patch.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Thu Acton Elijah → Simon 4–4.30; Aurora starts 4.30 (3 seats at 4pm)`,
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

const w = (doc.weeks || []).find((x) =>
  String(x.start || "").startsWith("2026-07-13"),
);
function dump(key, label) {
  const st = findStaff(w || {}, key);
  if (!st) return;
  for (const day of st.days || []) {
    if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-16") continue;
    for (const s of day.slots || []) {
      if (!/acton/i.test(String(s.venue || ""))) continue;
      console.log(label, s.time_slot, s.client_name);
    }
  }
}
dump("aurora", "aurora");
dump("simon", "simon");
dump("javier", "javier");
dump("roberto", "roberto");

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      sample: summaries.slice(-2),
    },
    null,
    2,
  ),
);
