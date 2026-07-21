/**
 * Raul is OFF Day Centre Monday 20 Jul 2026 only.
 * Clears his Mon slots in MADRE week starting 2026-07-20 (keeps Tue–Fri).
 *
 *   node database/local-vault/patch-madre-raul-off-monday-2026-07-20.mjs
 */
import fs from "fs";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8"
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

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => String(s.staffKey || "").toLowerCase() === want
  );
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers }
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;
const notes = [];

const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === "2026-07-20"
);
if (!week) throw new Error("week 2026-07-20 missing");

const raul = findStaff(week, "raul");
if (!raul) throw new Error("Raul missing in week 2026-07-20");

const days = Array.isArray(raul.days) ? raul.days : Object.values(raul.days || {});
let cleared = 0;
for (const day of days) {
  const iso = String(day.sessionDate || day.session_date || day.date || "").slice(0, 10);
  const wd = String(day.weekday || "").toLowerCase();
  const isMon =
    iso === "2026-07-20" ||
    wd === "monday" ||
    (iso === "" && days.indexOf(day) === 0 && String(week.start).slice(0, 10) === "2026-07-20");
  if (!isMon) continue;
  const before = Array.isArray(day.slots) ? day.slots.length : 0;
  day.slots = [];
  cleared += before;
  notes.push(`Raul Mon ${iso || "idx0"} cleared ${before} slot(s)`);
}

if (!cleared) {
  // Indexed days without sessionDate: day 0 = Monday for Mon–Fri weeks.
  const d0 = days[0];
  if (d0 && Array.isArray(d0.slots) && d0.slots.length) {
    notes.push(`Raul Mon idx0 cleared ${d0.slots.length} slot(s) (no sessionDate)`);
    cleared = d0.slots.length;
    d0.slots = [];
    if (!d0.sessionDate) d0.sessionDate = "2026-07-20";
    if (!d0.weekday) d0.weekday = "Monday";
  }
}

if (!cleared) throw new Error("nothing to clear on Raul Monday");

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.updated_at = new Date().toISOString();
doc.meta.notes = (doc.meta.notes || []).concat(notes).slice(-40);

const patch = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026",
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      revision: nextRev,
      document: doc,
      updated_at: new Date().toISOString(),
    }),
  }
);
const body = await patch.text();
if (!patch.ok) throw new Error("patch failed " + patch.status + " " + body);
console.log(JSON.stringify({ ok: true, revision: nextRev, notes }, null, 2));
