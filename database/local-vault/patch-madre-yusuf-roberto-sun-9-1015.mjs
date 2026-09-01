/**
 * Yusuf Ah Sunday with Roberto: staff MADRE must be Aquatic 9–9.30 Big Pool +
 * Multi 9.30–10.15 Big Pool (one staff card via sundayFeedbackMerges → 9–10.15).
 * Admin/invoice split 9–9.30 / 9.30–11 stays in service lines — not Roberto on Hub to 11.
 *
 * Also restore Bismark Hub Yusuf to 10.15–11 (was wrongly 9.30–11 overlapping Roberto).
 *
 * Weeks: ending 2026-07-05 and 2026-07-12.
 *
 *   node database/local-vault/patch-madre-yusuf-roberto-sun-9-1015.mjs
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
  return (week.staff || []).find(
    (s) => String(s.staffKey || "").toLowerCase() === want
  );
}

function isYusuf(slot) {
  return /yusuf/i.test(String((slot && slot.client_name) || ""));
}

function patchRobertoSunday(day, weekEnd, notes) {
  if (!day || !Array.isArray(day.slots)) return 0;
  const before = day.slots.filter(isYusuf);
  if (!before.length) return 0;
  const template = before[0];
  const rest = day.slots.filter((s) => !isYusuf(s));
  const aquatic = {
    ...template,
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "9 to 9.30",
    client_name: "Yusuf Ah",
    instructors: "ROBERTO",
  };
  const multi = {
    ...template,
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Multi-Activity",
    pool_note: "Big Pool",
    time_slot: "9.30 to 10.15",
    client_name: "Yusuf Ah",
    instructors: "ROBERTO",
  };
  day.slots = [aquatic, multi, ...rest];
  notes.push(
    `Roberto Sun week ${weekEnd}: Yusuf ${before
      .map((s) => `${s.time_slot}/${s.area}/${s.service}`)
      .join(" + ")} → 9–9.30 Aquatic Big Pool + 9.30–10.15 Multi Big Pool`
  );
  return 1;
}

function patchBismarkYusufHub(day, weekEnd, notes) {
  if (!day || !Array.isArray(day.slots)) return 0;
  let n = 0;
  for (const slot of day.slots) {
    if (!isYusuf(slot)) continue;
    if (!/multi/i.test(String(slot.service || ""))) continue;
    if (!/hub/i.test(String(slot.area || ""))) continue;
    if (String(slot.time_slot || "").trim() === "10.15 to 11") continue;
    const prev = slot.time_slot;
    slot.time_slot = "10.15 to 11";
    notes.push(
      `Bismark week ${weekEnd}: Yusuf Hub ${prev} → 10.15 to 11`
    );
    n += 1;
  }
  return n;
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

for (const weekEnd of ["2026-07-05", "2026-07-12"]) {
  const week = (doc.weeks || []).find((w) => String(w.end || "").slice(0, 10) === weekEnd);
  if (!week) {
    notes.push(`week ${weekEnd} missing`);
    continue;
  }
  const rob = findStaff(week, "roberto");
  const bis = findStaff(week, "bismark");
  if (rob && Array.isArray(rob.days) && rob.days[5]) {
    patchRobertoSunday(rob.days[5], weekEnd, notes);
  } else {
    notes.push(`Roberto Sunday missing week ${weekEnd}`);
  }
  if (bis && Array.isArray(bis.days)) {
    for (const day of bis.days) {
      patchBismarkYusufHub(day, weekEnd, notes);
    }
  }
}

if (!notes.some((n) => n.includes("→"))) {
  throw new Error("nothing patched: " + JSON.stringify(notes));
}

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.updated_at = new Date().toISOString();
doc.meta.notes = (doc.meta.notes || []).concat(notes).slice(-40);

const patch = await fetch(
  url +
    `/rest/v1/portal_madre_document?term_key=eq.summer-2026&revision=eq.${prevRev}`,
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
