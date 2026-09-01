/**
 * Rayyan Fi / Huma — Multi Sunday SwimFarm seats → NO PARTICIPANT.
 * Huma started booking-portal registration (Aug 6) but no confirmed MADRE seat.
 * Standing template must show open (No participant), not Rayyan.
 *
 * Also clears Rayyan Fi Aquatic Acton Tue (same release).
 *
 *   node database/local-vault/patch-madre-rayyan-multi-no-participant.mjs
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
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const CRASH_FROM = "2026-07-20";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRayyan(name) {
  const n = norm(name).toLowerCase();
  return (
    n === "rayyan" ||
    n === "rayyan fi" ||
    n === "rayyan f" ||
    n === "rayyan fida" ||
    n.indexOf("rayyan fi") === 0 ||
    n.indexOf("rayyan fida") === 0
  );
}

function patchWeek(week) {
  const log = [];
  const list = Array.isArray(week.staff)
    ? week.staff
    : Object.values(week.staff || {});
  for (const st of list) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (!day) continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (iso && iso >= CRASH_FROM) continue;
      for (const slot of day.slots || []) {
        if (!slot || !isRayyan(slot.client_name)) continue;
        const before = norm(slot.client_name);
        slot.client_name = "NO PARTICIPANT";
        slot.participant_info = "";
        log.push(
          `${iso || "?"} ${day.weekday || "?"} ${st.staffKey} ${slot.time_slot} ${slot.service} @ ${slot.venue}: ${before} → NO PARTICIPANT`,
        );
      }
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
  console.log("Nothing to patch — no Rayyan Fi seats left in standing MADRE.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Rayyan Fi → NO PARTICIPANT (Huma booking-portal registration only — no confirmed seat; keep open for waitlist)`,
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
      updated_by: OFFICE_USER,
    }),
  },
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}

// Standing roster_rows templates with Rayyan → NO PARTICIPANT
const q =
  url +
  "/rest/v1/portal_roster_rows?or=(client_name.ilike.*rayyan*)&select=id,client_name,day,time_slot,instructors,service,venue,session_date,status";
const rosterRows = await fetch(q, { headers }).then((r) => r.json());
const rosterOps = [];
for (const r of Array.isArray(rosterRows) ? rosterRows : []) {
  if (!isRayyan(r.client_name)) continue;
  const patch = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${r.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      client_name: "NO PARTICIPANT",
      updated_by: OFFICE_USER,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!patch.ok) throw new Error(`roster ${r.id}: ${await patch.text()}`);
  rosterOps.push({
    id: r.id,
    before: r.client_name,
    day: r.day,
    time: r.time_slot,
    service: r.service,
    venue: r.venue,
  });
}

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      seatsCleared: summaries.reduce((n, s) => n + s.log.length, 0),
      sample: summaries.flatMap((s) => s.log).slice(0, 12),
      roster_rows: rosterOps,
    },
    null,
    2,
  ),
);
