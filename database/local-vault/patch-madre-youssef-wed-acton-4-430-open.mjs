/**
 * Wednesday Acton aquatic: open Youssef 4–4.30 as NO PARTICIPANT (available).
 * Was CLOSED on standing weeks — Booking Portal showed Fully booked (only Javier/Cyrus).
 *
 *   node database/local-vault/patch-madre-youssef-wed-acton-4-430-open.mjs
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
  const k = timeKey(t);
  return (
    /^4(\.00)?\s*to\s*4\.30$/.test(k) ||
    /^16(\.00)?\s*(-|to)\s*16\.30$/.test(k)
  );
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
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
    area: "Teaching Pool",
    pool_note: "Teaching Pool",
    instructors: "YOUSSEF",
    participant_info: "",
  };
}

function patchWeek(week) {
  const youssef = findStaff(week, "youssef");
  if (!youssef) return null;
  const log = [];
  for (const day of youssef.days || []) {
    if (norm(day.weekday) !== "Wednesday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    day.slots = Array.isArray(day.slots) ? day.slots : [];
    let hit = null;
    const kept = [];
    for (const s of day.slots) {
      if (isActonAquatic(s) && isFourToFourThirty(s.time_slot)) {
        if (!hit) {
          hit = s;
          kept.push(s);
        }
        // Drop duplicate 16–16.30 encodings of the same band.
      } else {
        kept.push(s);
      }
    }
    day.slots = kept;
    if (hit) {
      const before = norm(hit.client_name);
      hit.client_name = "NO PARTICIPANT";
      hit.time_slot = TIME;
      hit.service = AQ;
      hit.venue = "Acton";
      hit.instructors = "YOUSSEF";
      if (!norm(hit.area)) hit.area = "Teaching Pool";
      if (before.toUpperCase() !== "NO PARTICIPANT") {
        log.push(`${iso} ${before} → NO PARTICIPANT`);
      }
    } else {
      day.slots.push(openSlotTemplate());
      sortSlots(day);
      log.push(`${iso} added NO PARTICIPANT`);
    }
  }
  return log.length ? { week: isoWeekLabel(week), log } : null;
}

function isoWeekLabel(week) {
  for (const st of week.staff || []) {
    for (const d of st?.days || []) {
      const iso = norm(d.sessionDate).slice(0, 10);
      if (iso) return iso;
    }
  }
  return "?";
}

const getDoc = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers },
).then((r) => r.json());
const row = getDoc?.[0];
if (!row?.document) {
  console.error("MADRE missing", getDoc);
  process.exit(1);
}
const prevRev = Number(row.revision) || 0;
const doc = row.document;
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
  const note = `rev ${prevRev + 1}: Youssef Wed Acton 4–4.30 CLOSED → NO PARTICIPANT (open)`;
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
        sample: summaries.slice(0, 4),
      },
      null,
      2,
    ),
  );
}

async function upsertStanding() {
  const q =
    url +
    "/rest/v1/portal_roster_rows?" +
    new URLSearchParams({
      day: "eq.Wednesday",
      time_slot: `eq.${TIME}`,
      instructors: "eq.YOUSSEF",
      venue: "eq.Acton",
      session_date: "is.null",
      select: "id,client_name,status",
      limit: "1",
    });
  const existing = await fetch(q, { headers }).then((r) => r.json());
  const payload = {
    client_name: "NO PARTICIPANT",
    day: "Wednesday",
    time_slot: TIME,
    instructors: "YOUSSEF",
    service: AQ,
    area: "Teaching Pool",
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

// Deactivate duplicate 16:xx standing/dated opens that confuse capacity keys.
async function deactivateDuplicateSixteen() {
  const q =
    url +
    "/rest/v1/portal_roster_rows?" +
    new URLSearchParams({
      day: "eq.Wednesday",
      venue: "eq.Acton",
      or: "(time_slot.eq.16 - 16.30,time_slot.eq.16 to 16.30)",
      instructors: "ilike.*youssef*",
      select: "id,client_name,time_slot,session_date,status",
    });
  const rows = await fetch(q, { headers }).then((r) => r.json());
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const patch = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${r.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "inactive",
        updated_by: OFFICE_USER,
        updated_at: new Date().toISOString(),
      }),
    });
    out.push({ id: r.id, time: r.time_slot, ok: patch.ok });
  }
  return out;
}

const roster = await upsertStanding();
console.log("roster_rows", roster);
const dups = await deactivateDuplicateSixteen();
console.log("deactivate 16xx dups", dups);

const anon = get("SUPABASE_ANON_KEY");
const offer = await fetch(url + "/functions/v1/portal-booking-offer", {
  headers: {
    Authorization: "Bearer " + anon,
    apikey: anon,
    Accept: "application/json",
  },
}).then((r) => r.json());
const slot = (offer.MOCK_SLOTS || []).find((s) =>
  String(s.id || "").includes("aquatic-acton-wednesday-16-00"),
);
console.log("offer Wed 4.00 Acton", {
  madre_revision: offer.madre_revision,
  capacity: slot?.capacity,
  taken: slot?.taken,
  left: (slot?.capacity || 0) - (slot?.taken || 0),
  instructors: slot?.instructors,
});
