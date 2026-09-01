/**
 * Put Yoan Bekele back on Sunday Aquatic SwimFarm (Roberto 2.30–3.30).
 * Hanna confirmed continuing with Direct Payments — office reenrol + invoices
 * already exist (23 Jul); MADRE seat was released as office-hold → open.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-madre-yoan-sunday-aquatic.mjs
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-madre-yoan-sunday-aquatic.mjs
 */
import fs from "fs";

const APPLY = process.env.APPLY === "1";
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
const CLIENT = "Yoan";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isYoanTargetSlot(st, day, slot) {
  const sk = norm(st.staffKey || st.name).toLowerCase();
  if (sk !== "roberto") return false;
  const wd = norm(day.weekday).toLowerCase();
  if (wd && wd !== "sunday" && !wd.startsWith("sun")) return false;
  if (!/aquatic/i.test(norm(slot.service))) return false;
  if (!/swimfarm|swim.?farm/i.test(norm(slot.venue))) return false;
  const t = norm(slot.time_slot)
    .toLowerCase()
    .replace(/:/g, ".");
  // Historical hold was 2.30–3.30 (sometimes stored as 2.30 to 3).
  if (/^2\.30\s*to\s*3\.30$/.test(t)) return true;
  if (/^2\.30\s*to\s*3$/.test(t)) return true;
  return false;
}

function isReplaceableClient(name) {
  const n = norm(name).toUpperCase();
  if (!n) return true;
  if (n === "NO PARTICIPANT" || n === "CLOSED") return true;
  if (/^BLOCK\b/.test(n) && /YOAN/i.test(n)) return true;
  if (/^YOAN\b/i.test(norm(name))) return true;
  return false;
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
const log = [];

for (const week of doc.weeks || []) {
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
        if (!slot || !isYoanTargetSlot(st, day, slot)) continue;
        const before = norm(slot.client_name);
        if (/^yoan\b/i.test(before) && !/^block/i.test(before)) {
          // already named; still normalise time label
          if (norm(slot.time_slot).toLowerCase().replace(/:/g, ".") !== "2.30 to 3") {
            slot.time_slot = "2.30 to 3";
            log.push(`${iso} ${st.staffKey}: time → 2.30 to 3 (already Yoan)`);
          } else {
            log.push(`${iso} ${st.staffKey}: already Yoan`);
          }
          continue;
        }
        if (!isReplaceableClient(before)) {
          log.push(`${iso} ${st.staffKey} ${slot.time_slot}: SKIP occupied by ${before}`);
          continue;
        }
        slot.client_name = CLIENT;
        slot.participant_info = "";
        slot.time_slot = "2.30 to 3";
        log.push(
          `${iso} ${st.staffKey} ${before || "(empty)"} → ${CLIENT} @ 2.30 to 3`,
        );
      }
    }
  }
}

const filled = log.filter((l) => l.includes("→") && l.includes(CLIENT)).length;
console.log(JSON.stringify({ prevRev, filled, log }, null, 2));

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write MADRE.");
  process.exit(0);
}

if (!filled && !log.some((l) => /already Yoan/.test(l))) {
  throw new Error("nothing to patch");
}

if (filled) {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Yoan → Roberto Aquatic SwimFarm Sun 2.30–3.30 (Hanna continues Direct Payments; office reenrol already on file)`,
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
  console.log("MADRE", prevRev, "→", out[0].revision);
} else {
  console.log("MADRE unchanged (already Yoan)");
}
