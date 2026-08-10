/**
 * Tuesday Acton aquatic: open Simon 4–4.30 as NO PARTICIPANT (available).
 * Was CLOSED on standing weeks — Services / Booking should show an open seat.
 *
 *   node database/local-vault/patch-madre-simon-tue-acton-4-430-open.mjs
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
const TIME = "4 to 4.30";
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

function isFourToFourThirty(t) {
  return /^4(\.00)?\s*to\s*4\.30$/.test(timeKey(t));
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

function sortSlots(day) {
  const rank = (t) => {
    const m = timeKey(t).match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 8) h += 12;
    return h * 60 + mi;
  };
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function isActonAquatic(slot) {
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function openSlotTemplate() {
  return {
    client_name: "NO PARTICIPANT",
    time_slot: TIME,
    service: AQ,
    venue: "Acton",
    area: "",
    pool_note: "",
    instructors: "SIMON",
    participant_info: "",
  };
}

function patchWeek(week) {
  const simon = findStaff(week, "simon");
  if (!simon) return null;
  const log = [];
  for (const day of simon.days || []) {
    if (norm(day.weekday) !== "Tuesday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    const actonAquatic = (day.slots || []).filter(isActonAquatic);
    if (!actonAquatic.length) continue;

    let hit = (day.slots || []).find(
      (s) => isActonAquatic(s) && isFourToFourThirty(s.time_slot),
    );
    if (hit) {
      const before = norm(hit.client_name);
      if (/^closed$/i.test(before) || !before || /^no participant$/i.test(before)) {
        hit.client_name = "NO PARTICIPANT";
        hit.service = hit.service || AQ;
        hit.venue = hit.venue || "Acton";
        hit.instructors = "SIMON";
        hit.participant_info = "";
        if (before !== "NO PARTICIPANT") log.push(`${iso} ${before} → NO PARTICIPANT`);
      }
    } else {
      day.slots = day.slots || [];
      day.slots.push(openSlotTemplate());
      sortSlots(day);
      log.push(`${iso} added NO PARTICIPANT`);
    }
  }
  return log.length ? { week: `${week.start || "?"}–${week.end || "?"}`, log } : null;
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
  console.log("Nothing to patch in MADRE.");
} else {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  const note = `rev ${prevRev + 1}: Simon Tue Acton 4–4.30 CLOSED → NO PARTICIPANT (open)`;
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
  console.log(
    JSON.stringify(
      {
        prevRev,
        nextRev: out[0].revision,
        weeksPatched: summaries.length,
        sample: summaries.slice(0, 3),
      },
      null,
      2,
    ),
  );
}

// Standing template row for Booking Portal / Services open seat.
async function upsertStanding() {
  const q =
    url +
    "/rest/v1/portal_roster_rows?" +
    new URLSearchParams({
      day: "eq.Tuesday",
      time_slot: `eq.${TIME}`,
      instructors: "eq.SIMON",
      venue: "eq.Acton",
      session_date: "is.null",
      select: "id,client_name,status",
      limit: "1",
    });
  const existing = await fetch(q, { headers }).then((r) => r.json());
  const payload = {
    client_name: "NO PARTICIPANT",
    day: "Tuesday",
    time_slot: TIME,
    instructors: "SIMON",
    service: AQ,
    area: "",
    venue: "Acton",
    session_date: null,
    status: "active",
    updated_by: OFFICE_USER,
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(existing) && existing[0]?.id) {
    const id = existing[0].id;
    const patch = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!patch.ok) throw new Error(`patch roster ${id}: ${await patch.text()}`);
    return { id, action: "update", before: existing[0] };
  }
  const ins = await fetch(url + "/rest/v1/portal_roster_rows", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      created_by: OFFICE_USER,
      created_at: new Date().toISOString(),
    }),
  });
  if (!ins.ok) throw new Error(`insert roster: ${await ins.text()}`);
  const created = await ins.json();
  return { id: created?.[0]?.id, action: "insert" };
}

const roster = await upsertStanding();
console.log("roster_rows", roster);

// Verify standing week sample
const verify = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers },
).then((r) => r.json());
const vDoc = verify?.[0]?.document;
let sample = null;
for (const week of vDoc?.weeks || []) {
  const simon = findStaff(week, "simon");
  if (!simon) continue;
  for (const day of simon.days || []) {
    if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-14") continue;
    sample = (day.slots || [])
      .filter((s) => /acton/i.test(String(s.venue || "")))
      .map((s) => `${s.time_slot}: ${s.client_name}`);
  }
}
console.log("verify 2026-07-14 Simon Acton", sample);
void ensureStaff;
