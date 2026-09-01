/**
 * Saturday Acton aquatic (Youssef): Matthias 11–12 → two opens 11–11.30 + 11.30–12.
 * Desired Autumn standing:
 *   9.30–10 open, 10–10.30 open, 10.30–11 Emani, 11–11.30 open, 11.30–12 open,
 *   12–12.30 Saaib, 12.30–1 open
 *
 *   node database/local-vault/patch-madre-sat-acton-youssef-matthias-to-open.mjs
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

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function isSatActonAquatic(day, slot) {
  if (norm(day.weekday) !== "Saturday") return false;
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function openSlot(time, area) {
  return {
    client_name: "NO PARTICIPANT",
    time_slot: time,
    service: AQ,
    venue: "Acton",
    area: area || "Teaching Pool",
    pool_note: "",
    instructors: "YOUSSEF",
    participant_info: "",
  };
}

function patchWeek(week) {
  const youssef = findStaff(week, "youssef");
  if (!youssef) return null;
  const log = [];
  for (const day of youssef.days || []) {
    const iso = norm(day.sessionDate).slice(0, 10);
    let changed = false;
    const kept = [];
    for (const s of day.slots || []) {
      if (!isSatActonAquatic(day, s)) {
        kept.push(s);
        continue;
      }
      const t = timeKey(s.time_slot);
      const client = norm(s.client_name);
      // Matthias hour → two opens
      if (
        /^11(\.00)?\s*to\s*12(\.00)?$/.test(t) &&
        /matthias/i.test(client)
      ) {
        kept.push(openSlot("11 to 11.30", s.area));
        kept.push(openSlot("11.30 to 12", s.area));
        changed = true;
        continue;
      }
      // Already-split Matthias half-hours → open
      if (
        (/^11(\.00)?\s*to\s*11\.30$/.test(t) ||
          /^11\.30\s*to\s*12(\.00)?$/.test(t)) &&
        /matthias/i.test(client)
      ) {
        kept.push(openSlot(s.time_slot.replace(/11\.00/, "11"), s.area));
        changed = true;
        continue;
      }
      kept.push(s);
    }
    if (changed) {
      day.slots = kept;
      sortSlots(day);
      log.push(`${iso} Matthias → opens 11–11.30 + 11.30–12`);
    }
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
  `rev ${prevRev + 1}: Sat Acton Youssef Matthias 11–12 → opens (keep Emani + Saaib)`,
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
  String(x.start || "").startsWith("2026-07-06"),
);
const st = findStaff(w || {}, "youssef");
for (const day of st?.days || []) {
  if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-11") continue;
  for (const s of day.slots || []) {
    if (!/acton/i.test(String(s.venue || ""))) continue;
    console.log(s.time_slot, s.client_name);
  }
}

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
