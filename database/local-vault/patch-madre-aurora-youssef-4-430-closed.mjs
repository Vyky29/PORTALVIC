/**
 * Aurora + Youssef Acton aquatic 4–4.30: any open/empty seat → CLOSED
 * (same as their standing CLOSED seats; Youssef Wed was still NO PARTICIPANT).
 *
 *   node database/local-vault/patch-madre-aurora-youssef-4-430-closed.mjs
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
const STAFF = new Set(["aurora", "youssef"]);
const AQ = "Aquatic Activity";
const TIME = "4 to 4.30";

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

function isActonAquatic(slot) {
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function isOpenLike(client) {
  const c = norm(client).toLowerCase();
  return (
    !c ||
    c === "no participant" ||
    c === "noclient" ||
    c === "no client" ||
    c === "available" ||
    c === "open"
  );
}

function patchWeek(week) {
  const log = [];
  for (const st of Object.values(week.staff || {})) {
    if (!st) continue;
    const sk = String(st.staffKey || "").toLowerCase();
    if (!STAFF.has(sk)) continue;
    for (const day of st.days || []) {
      const iso = norm(day.sessionDate).slice(0, 10);
      for (const slot of day.slots || []) {
        if (!isActonAquatic(slot) || !isFourToFourThirty(slot.time_slot)) continue;
        const before = norm(slot.client_name);
        if (/^closed$/i.test(before)) continue;
        if (!isOpenLike(before)) {
          log.push(`${iso} ${sk} skip booked "${before}"`);
          continue;
        }
        slot.client_name = "CLOSED";
        slot.service = slot.service || AQ;
        slot.venue = slot.venue || "Acton";
        slot.time_slot = slot.time_slot || TIME;
        slot.instructors = String(st.staffKey || sk).toUpperCase();
        slot.participant_info = "";
        log.push(`${iso} ${sk} ${before || "(empty)"} → CLOSED`);
      }
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
  console.log("Nothing to patch in MADRE (already CLOSED).");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Aurora+Youssef Acton aquatic 4–4.30 open → CLOSED`;
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
      totalLines: summaries.reduce((n, s) => n + s.log.length, 0),
    },
    null,
    2,
  ),
);

/* Mirror into portal_roster_rows for aurora/youssef Acton 4–4.30 opens. */
const rosterQs = new URLSearchParams({
  select:
    "id,session_date,day,time_slot,instructors,client_name,venue,service,status",
  venue: "ilike.*Acton*",
  or: "(instructors.eq.AURORA,instructors.eq.YOUSSEF,instructors.eq.Aurora,instructors.eq.Youssef)",
});
const rosterRes = await fetch(
  url + "/rest/v1/portal_roster_rows?" + rosterQs.toString(),
  { headers: { ...headers, Prefer: "" } },
);
const rosterRows = await rosterRes.json();
if (!Array.isArray(rosterRows)) {
  console.warn("roster fetch failed", rosterRows);
  process.exit(0);
}

const toClose = rosterRows.filter((r) => {
  if (!isFourToFourThirty(r.time_slot)) return false;
  if (!/acton/i.test(norm(r.venue))) return false;
  const svc = norm(r.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  const inst = norm(r.instructors).toLowerCase();
  if (inst !== "aurora" && inst !== "youssef") return false;
  return isOpenLike(r.client_name);
});

let rosterPatched = 0;
for (const r of toClose) {
  const patch = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${r.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      client_name: "CLOSED",
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    }),
  });
  if (patch.ok) rosterPatched += 1;
  else console.warn("roster patch fail", r.id, await patch.text());
}
console.log("portal_roster_rows closed", rosterPatched, "of", toClose.length);
