/**
 * Wednesday Northolt aquatic: remove Roberto; Dan + Luliya only.
 *
 *   Dan:    Tyson, Ruben, Amar Rai, Mia
 *   Luliya: Vithura, Amar Rai, NO PARTICIPANT, Amber
 *
 *   node database/local-vault/patch-madre-wed-northolt-drop-roberto-dan-luliya.mjs
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
const VENUE = "Northolt";

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

function endMin(t) {
  const s = timeKey(t);
  const m = s.match(
    /(\d{1,2})(?:[.:](\d{2}))?\s*(?:to|-|–)\s*(\d{1,2})(?:[.:](\d{2}))?/,
  );
  if (!m) return startMin(t) + 30;
  let h = +m[3];
  const mi = m[4] ? +m[4] : 0;
  if (h >= 1 && h <= 8) h += 12;
  return h * 60 + mi;
}

/** Afternoon swim window 4:00–6:30 (includes long shadowing bands). */
function overlapsAfternoonSwim(t) {
  return startMin(t) < 18 * 60 + 30 && endMin(t) > 16 * 60;
}

function isNortholt(slot) {
  return /northolt/i.test(norm(slot.venue));
}

function isNortholtAquaticOrShadow(slot) {
  if (!isNortholt(slot)) return false;
  const svc = norm(slot.service);
  const client = norm(slot.client_name);
  if (/shadow/i.test(client)) return true;
  if (svc && !/aquatic|swim/i.test(svc) && !/shadow/i.test(svc)) return false;
  return true;
}

function findStaff(week, keys) {
  const want = keys.map((k) => String(k).toLowerCase());
  return Object.entries(week.staff || {}).find(([k, s]) => {
    if (!s) return false;
    const sk = String(s.staffKey || k || "").toLowerCase();
    return want.includes(sk);
  })?.[1];
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

function takeInfo(slots, nameRe) {
  for (const s of slots || []) {
    if (nameRe.test(norm(s.client_name)) && s.participant_info) {
      return s.participant_info;
    }
  }
  return "";
}

function slot(client, time, instructor, info) {
  return {
    client_name: client,
    time_slot: time,
    service: AQ,
    venue: VENUE,
    area: "",
    pool_note: "",
    instructors: instructor,
    participant_info: info || "",
  };
}

function patchWeek(week) {
  const dan = findStaff(week, ["dan"]);
  const luliya = findStaff(week, ["luliya", "lulia"]);
  const roberto = findStaff(week, ["roberto"]);
  if (!dan && !luliya && !roberto) return null;

  const bag = [];
  for (const st of [dan, luliya, roberto]) {
    if (!st) continue;
    for (const d of st.days || []) bag.push(...(d.slots || []));
  }
  const info = {
    tyson: takeInfo(bag, /^tyson$/i),
    ruben: takeInfo(bag, /^ruben$/i),
    amar: takeInfo(bag, /amar\s*rai/i),
    mia: takeInfo(bag, /^mia$/i),
    vithura: takeInfo(bag, /^vithura$/i),
    amber: takeInfo(bag, /^amber$/i),
  };

  const isos = new Set();
  for (const st of [dan, luliya, roberto]) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (norm(day.weekday) !== "Wednesday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (!iso) continue;
      if ((day.slots || []).some(isNortholtAquaticOrShadow)) isos.add(iso);
    }
  }
  if (!isos.size) return null;

  const log = [];
  for (const iso of [...isos].sort()) {
    // Remove Roberto Northolt afternoon aquatic/shadow.
    if (roberto) {
      for (const day of roberto.days || []) {
        if (norm(day.sessionDate).slice(0, 10) !== iso) continue;
        const before = (day.slots || []).length;
        day.slots = (day.slots || []).filter(
          (s) => !(isNortholtAquaticOrShadow(s) && overlapsAfternoonSwim(s.time_slot)),
        );
        if (day.slots.length !== before) log.push(`${iso} roberto cleared`);
      }
    }

    // Rebuild Dan afternoon Northolt aquatic.
    if (dan) {
      const day = ensureDay(dan, iso, "Wednesday");
      day.slots = (day.slots || []).filter(
        (s) => !(isNortholtAquaticOrShadow(s) && overlapsAfternoonSwim(s.time_slot)),
      );
      day.slots.push(
        slot("Tyson", "4.30 to 5", "DAN", info.tyson),
        slot("Ruben", "5 to 5.30", "DAN", info.ruben),
        slot("Amar Rai", "5.30 to 6", "DAN", info.amar),
        slot("Mia", "6 to 6.30", "DAN", info.mia),
      );
      sortSlots(day);
      log.push(`${iso} dan set`);
    }

    // Rebuild Luliya afternoon Northolt (drop shadowing block).
    if (luliya) {
      const day = ensureDay(luliya, iso, "Wednesday");
      day.slots = (day.slots || []).filter(
        (s) => !(isNortholtAquaticOrShadow(s) && overlapsAfternoonSwim(s.time_slot)),
      );
      day.slots.push(
        slot("Vithura", "4.30 to 5", "LULIYA", info.vithura),
        slot("Amar Rai", "5 to 5.30", "LULIYA", info.amar),
        slot("NO PARTICIPANT", "5.30 to 6", "LULIYA", ""),
        slot("Amber", "6 to 6.30", "LULIYA", info.amber),
      );
      sortSlots(day);
      log.push(`${iso} luliya set`);
    }
  }

  // Drop empty Roberto Wednesday days / staff if no days left.
  if (roberto) {
    roberto.days = (roberto.days || []).filter((d) => (d.slots || []).length);
  }

  return log.length
    ? { week: `${week.start || "?"}–${week.end || "?"}`, log }
    : null;
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
  `rev ${prevRev + 1}: Wed Northolt drop Roberto; Dan Tyson/Ruben/Amar/Mia; Luliya Vithura/Amar/open/Amber`,
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

const w = (doc.weeks || []).find((x) => String(x.start || "").startsWith("2026-07-13"));
function dump(keys, label) {
  const st = findStaff(w || {}, keys);
  if (!st) return;
  for (const day of st.days || []) {
    if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-15") continue;
    for (const s of day.slots || []) {
      if (!/northolt/i.test(String(s.venue || ""))) continue;
      console.log(label, s.time_slot, s.client_name);
    }
  }
}
dump(["dan"], "dan");
dump(["luliya", "lulia"], "luliya");
dump(["roberto"], "roberto");

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      sample: summaries.slice(-1),
    },
    null,
    2,
  ),
);
