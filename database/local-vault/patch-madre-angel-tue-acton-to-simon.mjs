/**
 * Standing Tuesday Acton aquatic: Angel → Simon (Cayra, Rayan Ta, Richard + opens).
 * Removes Angel from Tuesday Acton swimming on all MADRE weeks that still have him.
 *
 *   node database/local-vault/patch-madre-angel-tue-acton-to-simon.mjs
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
    (s) => String(s.staffKey || "").toLowerCase() === want,
  );
}

function ensureStaff(week, key, name) {
  let st = findStaff(week, key);
  if (st) return st;
  const staffKey = String(key).toLowerCase();
  week.staff = week.staff || {};
  st = {
    staffKey,
    staffName: name,
    name,
    days: [],
  };
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
  const rank = (t) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 8) h += 12;
    return h * 60 + mi;
  };
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function isTueActonAquatic(day, slot) {
  const wd = norm(day.weekday);
  const iso = norm(day.sessionDate).slice(0, 10);
  if (wd !== "Tuesday") return false;
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  // Keep unnamed historic rows that still sit on Acton Tue under Angel.
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return !!iso;
}

function cloneSlot(slot) {
  return JSON.parse(JSON.stringify(slot));
}

function patchWeek(week) {
  const angel = findStaff(week, "angel");
  if (!angel) return null;
  const simon = ensureStaff(week, "simon", "Simon");
  const moved = [];
  const angelDaysKeep = [];

  for (const day of angel.days || []) {
    const iso = norm(day.sessionDate).slice(0, 10);
    const wd = norm(day.weekday);
    const keep = [];
    const transfer = [];
    for (const slot of day.slots || []) {
      if (isTueActonAquatic(day, slot)) transfer.push(slot);
      else keep.push(slot);
    }
    if (!transfer.length) {
      angelDaysKeep.push(day);
      continue;
    }
    const simonDay = ensureDay(simon, iso, wd || "Tuesday");
    // Drop any existing Simon Acton aquatic opens on this Tuesday so Angel's
    // column replaces the empty Simon seat (UI showed Simon 4.30 open only).
    simonDay.slots = (simonDay.slots || []).filter((s) => {
      if (!/acton/i.test(norm(s.venue))) return true;
      const svc = norm(s.service);
      if (svc && !/aquatic|swim/i.test(svc)) return true;
      return false;
    });
    for (const slot of transfer) {
      const c = cloneSlot(slot);
      if (!norm(c.service)) c.service = "Aquatic Activity";
      if (!norm(c.venue)) c.venue = "Acton";
      simonDay.slots.push(c);
      moved.push(`${iso} ${c.time_slot} ${c.client_name}`);
    }
    sortSlots(simonDay);
    if (keep.length) {
      day.slots = keep;
      angelDaysKeep.push(day);
    }
  }

  angel.days = angelDaysKeep;
  // If Angel has no remaining days, drop the staff entry.
  if (!(angel.days || []).length) {
    const key = String(angel.staffKey || "angel").toLowerCase();
    if (week.staff && week.staff[key]) delete week.staff[key];
    else {
      for (const [k, st] of Object.entries(week.staff || {})) {
        if (String(st.staffKey || "").toLowerCase() === "angel") {
          delete week.staff[k];
        }
      }
    }
  }

  return { week: `${week.start || "?"}–${week.end || "?"}`, moved };
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
  if (s && s.moved.length) summaries.push(s);
}

if (!summaries.length) {
  console.log("Nothing to patch — Angel has no Tuesday Acton aquatic slots.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Angel Tue Acton aquatic → Simon (Cayra / Rayan Ta / Richard)`;
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
      sample: summaries.slice(-2),
      movedTotal: summaries.reduce((n, s) => n + s.moved.length, 0),
    },
    null,
    2,
  ),
);
