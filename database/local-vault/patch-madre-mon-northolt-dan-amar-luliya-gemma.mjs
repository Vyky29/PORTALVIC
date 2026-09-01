/**
 * Monday Northolt aquatic (standing):
 *   Dan 5–6        → Amar Rai
 *   Luliya 5–5.30  → Gemma
 *   Luliya 5.30–6  → NO PARTICIPANT
 *
 *   node database/local-vault/patch-madre-mon-northolt-dan-amar-luliya-gemma.mjs
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

/** Overlaps the 5:00–6:00 window (exclusive of 4.30–5 and 6–6.30 edges). */
function overlapsFiveToSix(t) {
  return startMin(t) < 18 * 60 && endMin(t) > 17 * 60;
}

function isNortholtAquatic(slot) {
  if (!/northolt/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
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

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function clientRe(re) {
  return (name) => re.test(norm(name));
}

function takeInfo(slots, nameRe) {
  for (const s of slots) {
    if (nameRe.test(norm(s.client_name)) && s.participant_info) {
      return s.participant_info;
    }
  }
  return "";
}

function patchWeek(week) {
  const dan = findStaff(week, ["dan"]);
  const luliya = findStaff(week, ["luliya", "lulia"]);
  if (!dan || !luliya) return null;
  const log = [];

  // Collect participant_info from anywhere in the week first.
  const allSlots = [];
  for (const st of [dan, luliya]) {
    for (const d of st.days || []) allSlots.push(...(d.slots || []));
  }
  const amarInfo = takeInfo(allSlots, /amar\s*rai/i);
  const gemmaInfo = takeInfo(allSlots, /^gemma$/i);

  const danDays = new Map();
  for (const day of dan.days || []) {
    if (norm(day.weekday) !== "Monday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    if (!iso) continue;
    danDays.set(iso, day);
  }
  const luliyaDays = new Map();
  for (const day of luliya.days || []) {
    if (norm(day.weekday) !== "Monday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    if (!iso) continue;
    luliyaDays.set(iso, day);
  }

  const isos = new Set([...danDays.keys(), ...luliyaDays.keys()]);
  for (const iso of isos) {
    const dDay = danDays.get(iso);
    const lDay = luliyaDays.get(iso);
    if (!dDay && !lDay) continue;

    const hasNortholt =
      (dDay && (dDay.slots || []).some(isNortholtAquatic)) ||
      (lDay && (lDay.slots || []).some(isNortholtAquatic));
    if (!hasNortholt) continue;

    // Strip 5–6 band Northolt aquatic from both.
    const strip = (day) => {
      if (!day) return [];
      const kept = [];
      const removed = [];
      for (const s of day.slots || []) {
        if (isNortholtAquatic(s) && overlapsFiveToSix(s.time_slot)) {
          removed.push(s);
        } else {
          kept.push(s);
        }
      }
      day.slots = kept;
      return removed;
    };
    const removed = [...strip(dDay), ...strip(lDay)];
    if (!removed.length) continue;

    const infoAmar =
      takeInfo(removed, /amar\s*rai/i) || amarInfo || "";
    const infoGemma = takeInfo(removed, /^gemma$/i) || gemmaInfo || "";

    if (dDay) {
      dDay.slots.push({
        client_name: "Amar Rai",
        time_slot: "5 to 6",
        service: AQ,
        venue: "Northolt",
        area: "",
        pool_note: "",
        instructors: "DAN",
        participant_info: infoAmar,
      });
      sortSlots(dDay);
    }
    if (lDay) {
      lDay.slots.push({
        client_name: "Gemma",
        time_slot: "5 to 5.30",
        service: AQ,
        venue: "Northolt",
        area: "",
        pool_note: "",
        instructors: "LULIYA",
        participant_info: infoGemma,
      });
      lDay.slots.push({
        client_name: "NO PARTICIPANT",
        time_slot: "5.30 to 6",
        service: AQ,
        venue: "Northolt",
        area: "",
        pool_note: "",
        instructors: "LULIYA",
        participant_info: "",
      });
      sortSlots(lDay);
    }
    log.push(iso);
  }

  return log.length
    ? { week: `${week.start || "?"}–${week.end || "?"}`, days: log }
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
const note =
  `rev ${prevRev + 1}: Mon Northolt Dan 5–6 Amar Rai; Luliya 5–5.30 Gemma + 5.30–6 open`;
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

// Verify sample week
const verifyWeek = (doc.weeks || []).find((w) =>
  String(w.start || "").startsWith("2026-07-13"),
);
function dumpStaff(st, label) {
  if (!st) return;
  for (const day of st.days || []) {
    if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-13") continue;
    for (const s of day.slots || []) {
      if (!/northolt/i.test(String(s.venue || ""))) continue;
      console.log(label, s.time_slot, s.client_name);
    }
  }
}
dumpStaff(findStaff(verifyWeek || {}, ["dan"]), "dan");
dumpStaff(findStaff(verifyWeek || {}, ["luliya", "lulia"]), "luliya");

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      days: summaries.flatMap((s) => s.days),
    },
    null,
    2,
  ),
);
void clientRe;
