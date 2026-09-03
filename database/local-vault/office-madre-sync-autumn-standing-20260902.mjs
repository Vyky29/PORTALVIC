/**
 * Align portal_madre_document (summer-2026) with Autumn standing truth so
 * staff / admin / booking / parent all read the same seats.
 *
 * - Sun climbing: Scott out → open 12–1; Alex open 2–3; Carlos open 2–3 (60')
 * - Sun Multi: Erik on Berta/John hub 12.30–1.15 + Aurora/Dan pool 1.15–2
 * - Standing week 13–17 Jul: Acton Tue/Thu boards (Luliya open 4; Simon open 4.30;
 *   Javier Rayan Ta / Kareena; Roberto Yossi; Karo; clear Youssef/Simon Tue Acton)
 *
 *   node database/local-vault/office-madre-sync-autumn-standing-20260902.mjs
 *   APPLY=1 node database/local-vault/office-madre-sync-autumn-standing-20260902.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
function normTime(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".")
    .replace(/\s+/g, " ");
}
function isEmptyClient(name) {
  const u = norm(name).toUpperCase();
  return (
    !u ||
    u === "NO PARTICIPANT" ||
    u === "NO CLIENT" ||
    u === "CLOSED" ||
    u === "HOLD WAITLIST"
  );
}
function isScott(name) {
  return /^scott\b/i.test(norm(name));
}
function isErik(name) {
  return /^erik\b/i.test(norm(name));
}
function staffKeyOf(s) {
  return String(s?.staffKey || s?.staffName || "")
    .trim()
    .toLowerCase();
}

function findStaff(week, ...keys) {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  return Object.values(week.staff || {}).find((s) => s && want.has(staffKeyOf(s))) || null;
}

function ensureDay(staff, weekday) {
  if (!staff.days) staff.days = [];
  let day = staff.days.find((d) => d && d.weekday === weekday);
  if (!day) {
    day = { weekday, slots: [], sessionDate: null };
    staff.days.push(day);
  }
  if (!Array.isArray(day.slots)) day.slots = [];
  return day;
}

function upsertSlot(day, patch, matchFn) {
  const idx = day.slots.findIndex(matchFn);
  if (idx >= 0) {
    day.slots[idx] = { ...day.slots[idx], ...patch };
    return "update";
  }
  day.slots.push({ ...patch });
  return "insert";
}

function removeSlots(day, pred) {
  const before = day.slots.length;
  day.slots = day.slots.filter((sl) => !pred(sl));
  return before - day.slots.length;
}

function aquaticActonTemplate(time, client, instructors, area) {
  return {
    area: area || "Lane (DE)",
    venue: "Acton",
    service: "Aquatic Activity",
    pool_note: area || "Lane (DE)",
    time_slot: time,
    client_name: client,
    instructors: instructors,
  };
}

function climbTemplate(time, client, instructors) {
  return {
    area: "Wall",
    venue: "Westway",
    service: "Climbing Activity",
    pool_note: "Wall",
    time_slot: time,
    client_name: client,
    instructors: instructors,
  };
}

function multiTemplate(time, client, instructors, area) {
  return {
    area,
    venue: "SwimFarm",
    service: "Multi-Activity",
    pool_note: area,
    time_slot: time,
    client_name: client,
    instructors: instructors,
  };
}

const log = [];

function note(msg) {
  log.push(msg);
}

/** Sunday climbing: drop Scott; ensure Alex 12–1 + 2–3 open; Carlos 2–3 open 60'. */
function patchSundayClimbing(week) {
  const alex = findStaff(week, "alex");
  const carlos = findStaff(week, "carlos");
  for (const s of [alex, carlos]) {
    if (!s) continue;
    const day = (s.days || []).find((d) => d && d.weekday === "Sunday");
    if (!day) continue;
    for (const sl of day.slots || []) {
      if (!/climb/i.test(sl.service || "") || !/westway/i.test(sl.venue || "")) continue;
      if (isScott(sl.client_name)) {
        sl.client_name = "NO PARTICIPANT";
        note(`${week.start} ${staffKeyOf(s)} Sun climb ${sl.time_slot}: Scott → open`);
      }
    }
  }
  if (alex) {
    const day = ensureDay(alex, "Sunday");
    // drop aquatic-style half opens 2–2.30 / 2.30–3 if present
    removeSlots(
      day,
      (sl) =>
        /climb/i.test(sl.service || "") &&
        /westway/i.test(sl.venue || "") &&
        (/^2\s*to\s*2\.?30\b/i.test(normTime(sl.time_slot)) ||
          /^2\.?30\s*to\s*3\b/i.test(normTime(sl.time_slot))),
    );
    for (const time of ["12 to 1", "2 to 3"]) {
      const hit = (day.slots || []).find(
        (sl) =>
          /climb/i.test(sl.service || "") &&
          /westway/i.test(sl.venue || "") &&
          normTime(sl.time_slot) === normTime(time),
      );
      if (hit) {
        if (!isEmptyClient(hit.client_name) && !isScott(hit.client_name)) continue;
        if (norm(hit.client_name).toUpperCase() !== "NO PARTICIPANT") {
          hit.client_name = "NO PARTICIPANT";
          note(`${week.start} alex Sun climb ${time}: → open`);
        }
      } else {
        day.slots.push(climbTemplate(time, "NO PARTICIPANT", "ALEX"));
        note(`${week.start} alex Sun climb ${time}: insert open`);
      }
    }
  }
  if (carlos) {
    const day = ensureDay(carlos, "Sunday");
    removeSlots(
      day,
      (sl) =>
        /climb/i.test(sl.service || "") &&
        /westway/i.test(sl.venue || "") &&
        (/^2\s*to\s*2\.?30\b/i.test(normTime(sl.time_slot)) ||
          /^2\.?30\s*to\s*3\b/i.test(normTime(sl.time_slot))),
    );
    const hit = (day.slots || []).find(
      (sl) =>
        /climb/i.test(sl.service || "") &&
        /westway/i.test(sl.venue || "") &&
        normTime(sl.time_slot) === "2 to 3",
    );
    if (hit) {
      if (isEmptyClient(hit.client_name) || isScott(hit.client_name)) {
        hit.client_name = "NO PARTICIPANT";
        hit.time_slot = "2 to 3";
      }
    } else {
      day.slots.push(climbTemplate("2 to 3", "NO PARTICIPANT", "CARLOS"));
      note(`${week.start} carlos Sun climb 2 to 3: insert open`);
    }
  }
}

/** Sunday Multi: Erik on hub 12.30–1.15 + pool 1.15–2 (Berta/John + Aurora/Dan). */
function patchSundayErik(week) {
  const hubStaff =
    findStaff(week, "berta") || findStaff(week, "john");
  const poolStaff =
    findStaff(week, "aurora") || findStaff(week, "dan") || findStaff(week, "youssef");

  function putErik(staff, time, area, instructors) {
    if (!staff) return;
    const day = ensureDay(staff, "Sunday");
    // Clear Erik from wrong Sunday Multi slots on this staff
    for (const sl of day.slots || []) {
      if (!/multi/i.test(sl.service || "")) continue;
      if (isErik(sl.client_name) && normTime(sl.time_slot) !== normTime(time)) {
        sl.client_name = "NO PARTICIPANT";
        note(`${week.start} ${staffKeyOf(staff)} clear Erik off ${sl.time_slot}`);
      }
    }
    const hit = (day.slots || []).find(
      (sl) =>
        /multi/i.test(sl.service || "") &&
        /swimfarm/i.test(sl.venue || "") &&
        normTime(sl.time_slot) === normTime(time),
    );
    if (hit) {
      if (!isErik(hit.client_name)) {
        // Only overwrite empties / hold — don't steal another named child
        if (!isEmptyClient(hit.client_name)) {
          note(
            `${week.start} ${staffKeyOf(staff)} ${time}: keep ${hit.client_name} (Erik not forced)`,
          );
          return;
        }
        hit.client_name = "Erik";
        hit.instructors = instructors;
        hit.area = area;
        hit.pool_note = area;
        note(`${week.start} ${staffKeyOf(staff)} ${time}: → Erik`);
      }
    } else {
      day.slots.push(multiTemplate(time, "Erik", instructors, area));
      note(`${week.start} ${staffKeyOf(staff)} ${time}: insert Erik`);
    }
  }

  putErik(hubStaff, "12.30 to 1.15", "Hub Room", String(hubStaff?.staffKey || "BERTA").toUpperCase());
  putErik(poolStaff, "1.15 to 2", "Big Pool", String(poolStaff?.staffKey || "AURORA").toUpperCase());
}

/** Standing Tue Acton AS board on week 2026-07-13. */
function patchStandingTuesdayActon(week) {
  if (week.start !== "2026-07-13") return;

  const roberto = findStaff(week, "roberto");
  const luliya = findStaff(week, "luliya", "lulia");
  const javier = findStaff(week, "javier");
  const aurora = findStaff(week, "aurora");
  const youssef = findStaff(week, "youssef");
  const simon = findStaff(week, "simon");

  function replaceActonAquatic(staff, instructors, slots) {
    if (!staff) {
      note(`MISSING staff for ${instructors} Tue Acton`);
      return;
    }
    const day = ensureDay(staff, "Tuesday");
    // keep non-Acton-aquatic (e.g. Luliya DC)
    day.slots = (day.slots || []).filter(
      (sl) => !(/acton/i.test(sl.venue || "") && /aquatic|swim/i.test(sl.service || "")),
    );
    for (const [time, client, area] of slots) {
      day.slots.push(aquaticActonTemplate(time, client, instructors, area));
    }
    note(`${week.start} ${staffKeyOf(staff)} Tue Acton rebuilt (${slots.length} slots)`);
  }

  replaceActonAquatic(roberto, "ROBERTO", [
    ["4 to 4.30", "NO PARTICIPANT", "Lane (DE)"],
    ["4.30 to 5", "NO PARTICIPANT", "Lane (DE)"],
    ["5 to 5.30", "Logan", "Lane (DE)"],
    ["5.30 to 6", "NO PARTICIPANT", "Lane (DE)"],
    ["6 to 6.30", "Richard", "Lane (DE)"],
  ]);
  replaceActonAquatic(luliya, "LULIYA", [
    ["4 to 4.30", "NO PARTICIPANT", "Lane (DE)"],
    ["4.30 to 5.30", "Serine", "Lane (DE)"],
    ["5.30 to 6", "NO PARTICIPANT", "Lane (DE)"],
    ["6 to 6.30", "NO PARTICIPANT", "Lane (DE)"],
  ]);
  replaceActonAquatic(javier, "JAVIER", [
    ["4 to 5", "Ayman", "Lane (DE)"],
    ["5 to 5.30", "Linda", "Lane (SE)"],
    ["5.30 to 6", "Rayan Ta", "Lane (DE)"],
    ["6 to 6.30", "Kareena", "Lane (SE)"],
  ]);
  replaceActonAquatic(aurora, "AURORA", [
    ["4 to 4.30", "CLOSED", "Lane (DE)"],
    ["4.30 to 5", "NO PARTICIPANT", "Lane (DE)"],
    ["5 to 5.30", "Junaid", "Lane (DE)"],
    ["5.30 to 6", "Aydaan Ah", "Lane (DE)"],
    ["6 to 6.30", "Anas", "Lane (DE)"],
  ]);

  // Clear Youssef / Simon Tue Acton aquatic (autumn board has neither)
  for (const s of [youssef, simon]) {
    if (!s) continue;
    const day = (s.days || []).find((d) => d && d.weekday === "Tuesday");
    if (!day) continue;
    const n = removeSlots(
      day,
      (sl) => /acton/i.test(sl.venue || "") && /aquatic|swim/i.test(sl.service || ""),
    );
    if (n) note(`${week.start} ${staffKeyOf(s)} Tue Acton: cleared ${n} summer slots`);
  }
}

/** Standing Thu Acton AS board on week 2026-07-13. */
function patchStandingThursdayActon(week) {
  if (week.start !== "2026-07-13") return;

  const roberto = findStaff(week, "roberto");
  const simon = findStaff(week, "simon");
  const javier = findStaff(week, "javier");
  const aurora = findStaff(week, "aurora");
  const luliya = findStaff(week, "luliya", "lulia");

  function replaceActonAquatic(staff, instructors, slots) {
    if (!staff) return;
    const day = ensureDay(staff, "Thursday");
    day.slots = (day.slots || []).filter(
      (sl) => !(/acton/i.test(sl.venue || "") && /aquatic|swim/i.test(sl.service || "")),
    );
    for (const [time, client, area] of slots) {
      day.slots.push(aquaticActonTemplate(time, client, instructors, area));
    }
    note(`${week.start} ${staffKeyOf(staff)} Thu Acton rebuilt (${slots.length} slots)`);
  }

  replaceActonAquatic(roberto, "ROBERTO", [
    ["4 to 4.30", "Tom", "Lane (DE)"],
    ["4.30 to 5", "Yassir", "Lane (DE)"],
    ["5 to 5.30", "Yossi", "Lane (DE)"],
    ["5.30 to 6", "NO PARTICIPANT", "Lane (DE)"],
    ["6 to 6.30", "NO PARTICIPANT", "Lane (DE)"],
  ]);
  replaceActonAquatic(simon, "SIMON", [
    ["4 to 4.30", "Elijah", "Lane (SE)"],
    ["4.30 to 5", "NO PARTICIPANT", "Lane (DE)"],
    ["5 to 5.30", "Yuri", "Lane (SE)"],
    ["5.30 to 6", "NO PARTICIPANT", "Lane (DE)"],
    ["6 to 6.30", "NO PARTICIPANT", "Lane (DE)"],
  ]);
  replaceActonAquatic(javier, "JAVIER", [
    ["4 to 5", "Ayman", "Lane (DE)"],
    ["5 to 5.30", "Khalid Ab", "Lane (DE)"],
    ["5.30 to 6", "Karo", "Lane (DE)"],
    ["6 to 6.30", "NO PARTICIPANT", "Lane (DE)"],
  ]);
  replaceActonAquatic(aurora, "AURORA", [
    ["4 to 4.30", "CLOSED", "Lane (DE)"],
    ["4.30 to 5.30", "Aqsa", "Lane (DE)"],
    ["5.30 to 6", "NO PARTICIPANT", "Lane (DE)"],
    ["6 to 6.30", "Maiyar", "Teaching Pool"],
  ]);

  if (luliya) {
    const day = (luliya.days || []).find((d) => d && d.weekday === "Thursday");
    if (day) {
      const n = removeSlots(
        day,
        (sl) => /acton/i.test(sl.venue || "") && /aquatic|swim/i.test(sl.service || ""),
      );
      if (n) note(`${week.start} luliya Thu Acton: cleared ${n} (Simon covers)`);
    }
  }
}

const { data: row, error } = await sb
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (error || !row) {
  console.error(error || "missing madre");
  process.exit(1);
}

const doc = structuredClone(row.document);

for (const week of doc.weeks || []) {
  patchSundayClimbing(week);
  patchSundayErik(week);
  patchStandingTuesdayActon(week);
  patchStandingThursdayActon(week);
}

console.log("Mode:", APPLY ? "APPLY" : "DRY-RUN");
console.log("rev", row.revision, "→", APPLY ? row.revision + 1 : row.revision);
console.log("changes:", log.length);
for (const line of log) console.log(" ", line);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with APPLY=1 to write.");
  process.exit(0);
}

doc.revisionNotes = Array.isArray(doc.revisionNotes) ? doc.revisionNotes : [];
doc.revisionNotes.push({
  at: new Date().toISOString(),
  note:
    "Autumn standing sync 2 Sep 2026: Sun climb Scott out + 60' opens; Erik Multi Berta/Aurora; "
    + "Tue/Thu Acton AS boards (Luliya open 4, Simon open 4.30, Javier Rayan/Kareena, Yossi/Karo)",
});

const nextRev = Number(row.revision) + 1;
const { data: upd, error: upErr } = await sb
  .from("portal_madre_document")
  .update({ document: doc, revision: nextRev })
  .eq("term_key", "summer-2026")
  .eq("revision", row.revision)
  .select("revision")
  .maybeSingle();

if (upErr || !upd) {
  console.error("UPDATE FAIL", upErr || "revision conflict");
  process.exit(1);
}
console.log("UPDATED revision", upd.revision);
