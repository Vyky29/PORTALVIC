/**
 * Patrick — Climbing Sunday Westway 12–1 must stay booked on standing MADRE.
 *
 * Booking offer capacity comes from the latest non-crash Sunday (2026-07-12),
 * not from invoices. On that date Alex's 12–1 was NO PARTICIPANT while Serine
 * filled Carlos's line → offer showed 1/2 open even though Patrick has Autumn
 * climb on invoice.
 *
 *   node database/local-vault/patch-madre-patrick-sun-climb-12-1.mjs
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
const TARGET_DATE = "2026-07-12";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isClimb12to1(slot) {
  const t = norm(slot.time_slot).toLowerCase();
  return (
    t === "12 to 1" ||
    t === "12.00 – 1.00" ||
    t === "12.00 - 1.00" ||
    /^12(\.00)?\s*(to|–|-)\s*1(\.00)?$/.test(t)
  );
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

/** Pull Patrick profile text from an earlier Sunday climb seat if present. */
let patrickInfo = "";
let patrickInstr = "ALEX";
for (const week of doc.weeks || []) {
  for (const st of week.staff || []) {
    if (!st) continue;
    for (const day of st.days || []) {
      for (const slot of day.slots || []) {
        if (!slot) continue;
        if (!/^patrick$/i.test(norm(slot.client_name))) continue;
        if (!/climb/i.test(norm(slot.service))) continue;
        if (slot.participant_info && !patrickInfo) {
          patrickInfo = String(slot.participant_info);
        }
        if (slot.instructors) patrickInstr = String(slot.instructors);
      }
    }
  }
}

const log = [];
for (const week of doc.weeks || []) {
  for (const st of week.staff || []) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (norm(day.sessionDate).slice(0, 10) !== TARGET_DATE) continue;
      for (const slot of day.slots || []) {
        if (!slot || !/climb/i.test(norm(slot.service))) continue;
        if (!isClimb12to1(slot)) continue;
        if (!/no\s*participant/i.test(norm(slot.client_name))) continue;
        const before = norm(slot.client_name);
        slot.client_name = "Patrick";
        slot.instructors = slot.instructors || patrickInstr;
        if (patrickInfo) slot.participant_info = patrickInfo;
        if (!slot.venue) slot.venue = "Westway";
        if (!slot.area) slot.area = "Wall";
        if (!slot.pool_note) slot.pool_note = "Wall";
        log.push(
          `${TARGET_DATE} ${day.weekday || "Sunday"} ${st.staffKey} ${slot.time_slot}: ${before} → Patrick (instr ${slot.instructors})`,
        );
      }
    }
  }
}

if (!log.length) {
  console.log("Nothing to patch — no empty Climbing 12–1 on", TARGET_DATE);
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Patrick restored on standing Sunday Climbing Westway 12–1 (Jul 12 open seat) so booking offer matches Autumn invoice seat`,
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

console.log("Patched MADRE rev", prevRev, "→", nextRev);
for (const line of log) console.log(" ", line);
console.log("revision now", out[0].revision);
