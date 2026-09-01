/**
 * Sunday SwimFarm aquatic: Roberto open 2.30–3.30 → 2.30–3
 * (Services was rendering an extra empty 3–3.30 row from the 60′ open).
 *
 *   node database/local-vault/patch-madre-roberto-sun-swimfarm-open-230-3.mjs
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

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".");
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return Object.values(week.staff || {}).find(
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
}

function patchWeek(week) {
  const roberto = findStaff(week, "roberto");
  if (!roberto) return null;
  const log = [];
  for (const day of roberto.days || []) {
    if (norm(day.weekday) !== "Sunday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    for (const s of day.slots || []) {
      if (!/swim/i.test(norm(s.venue))) continue;
      if (!/aquatic|swim/i.test(norm(s.service) || "aquatic")) continue;
      const t = timeKey(s.time_slot);
      const client = norm(s.client_name);
      if (
        (/^2\.30\s*to\s*3\.30$/.test(t) || /^14\.30\s*to\s*15\.30$/.test(t)) &&
        (/^no participant$/i.test(client) || !client)
      ) {
        s.time_slot = "2.30 to 3";
        s.client_name = "NO PARTICIPANT";
        log.push(`${iso} 2.30–3.30 → 2.30–3`);
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
  console.log("Nothing to patch.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Roberto Sun SwimFarm aquatic open 2.30–3.30 → 2.30–3`,
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
      weeksPatched: summaries.length,
      sample: summaries.slice(-2),
    },
    null,
    2,
  ),
);
