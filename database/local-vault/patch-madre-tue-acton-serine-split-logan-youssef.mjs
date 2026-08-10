/**
 * Tuesday Acton: Serine split + Logan stays with Youssef
 * - Serine 4.30–5  → Youssef
 * - Serine 5–5.30 → Simon
 * - Logan 5–5.30  → Youssef
 *
 *   node database/local-vault/patch-madre-tue-acton-serine-split-logan-youssef.mjs
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

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
}

function findDay(st, iso) {
  return (st.days || []).find(
    (d) => String(d.sessionDate || "").slice(0, 10) === iso,
  );
}

function isActonAquatic(slot) {
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".")
    .replace(/\s+/g, " ");
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

function coversBand(slotTime, bandStart, bandEnd) {
  return startMin(slotTime) < bandEnd && endMin(slotTime) > bandStart;
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function clientMatches(name, re) {
  return re.test(norm(name));
}

function takeNamed(day, nameRe) {
  const slots = day.slots || [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!isActonAquatic(s)) continue;
    if (!clientMatches(s.client_name, nameRe)) continue;
    return slots.splice(i, 1)[0];
  }
  return null;
}

function clearBand(day, bandStart, bandEnd) {
  day.slots = (day.slots || []).filter((s) => {
    if (!isActonAquatic(s)) return true;
    return !coversBand(s.time_slot, bandStart, bandEnd);
  });
}

function putSlot(day, timeLabel, clientName, info) {
  const slot = {
    client_name: clientName,
    time_slot: timeLabel,
    service: "Aquatic Activity",
    venue: "Acton",
    area: "",
    pool_note: "",
  };
  if (info) slot.participant_info = info;
  day.slots.push(slot);
}

function patchTuesday(week, iso) {
  const youssef = findStaff(week, "youssef");
  const simon = findStaff(week, "simon");
  if (!youssef || !simon) return null;
  const yDay = findDay(youssef, iso);
  const sDay = findDay(simon, iso);
  if (!yDay || !sDay) return null;
  yDay.slots = yDay.slots || [];
  sDay.slots = sDay.slots || [];

  const log = [];
  const B430 = 16 * 60 + 30;
  const B500 = 17 * 60;
  const B530 = 17 * 60 + 30;

  const serineInfo =
    takeNamed(yDay, /^serine$/i) || takeNamed(sDay, /^serine$/i);
  const loganInfo =
    takeNamed(yDay, /^logan$/i) || takeNamed(sDay, /^logan$/i);
  const cayraInfo = takeNamed(sDay, /^cayra$/i);

  clearBand(yDay, B430, B530);
  clearBand(sDay, B500, B530);

  if (cayraInfo) {
    clearBand(sDay, B430, B500);
    putSlot(
      sDay,
      "4.30 to 5",
      norm(cayraInfo.client_name) || "Cayra",
      cayraInfo.participant_info,
    );
  }

  putSlot(
    yDay,
    "4.30 to 5",
    (serineInfo && norm(serineInfo.client_name)) || "Serine",
    serineInfo && serineInfo.participant_info,
  );
  putSlot(
    sDay,
    "5 to 5.30",
    (serineInfo && norm(serineInfo.client_name)) || "Serine",
    serineInfo && serineInfo.participant_info,
  );
  log.push("Serine → Youssef 4.30–5 + Simon 5–5.30");

  putSlot(
    yDay,
    "5 to 5.30",
    (loganInfo && norm(loganInfo.client_name)) || "Logan",
    loganInfo && loganInfo.participant_info,
  );
  log.push("Logan → Youssef 5–5.30");

  sortSlots(yDay);
  sortSlots(sDay);
  return log;
}

function patchWeek(week) {
  const out = [];
  const dates = new Set();
  for (const st of Object.values(week.staff || {})) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (norm(day.weekday) !== "Tuesday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (iso) dates.add(iso);
    }
  }
  for (const iso of [...dates].sort()) {
    const log = patchTuesday(week, iso);
    if (log && log.length) out.push({ iso, log });
  }
  return out;
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
  const logs = patchWeek(week);
  if (logs.length) summaries.push({ week: `${week.start}–${week.end}`, logs });
}

if (!summaries.length) {
  console.log("Nothing to patch");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Tue Acton Serine split Youssef 4.30–5 / Simon 5–5.30; Logan with Youssef`,
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

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeks: summaries.length,
      sample: summaries.slice(-1),
    },
    null,
    2,
  ),
);

const iso = "2026-07-14";
for (const who of ["youssef", "simon"]) {
  for (const week of out[0].document.weeks || []) {
    const st = findStaff(week, who);
    const day = st && findDay(st, iso);
    if (!day) continue;
    const slots = (day.slots || []).filter(isActonAquatic);
    if (!slots.length) continue;
    console.log("\n" + who.toUpperCase());
    slots
      .slice()
      .sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot))
      .forEach((s) => console.log(" ", norm(s.time_slot), norm(s.client_name)));
  }
}
