/**
 * Sync MADRE standing week 2026-07-13 weekdays to match local_dc_staff_week.html
 * (Autumn board truth — same seats as Mon 7 Sep / Fri boards + standing EXTRA).
 *
 *   node database/local-vault/office-madre-sync-local-board-mon-fri.mjs
 *   APPLY=1 node database/local-vault/office-madre-sync-local-board-mon-fri.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";
const TERM = "summer-2026";
const STANDING = "2026-07-13";
const ISO = {
  Monday: "2026-07-13",
  Tuesday: "2026-07-14",
  Wednesday: "2026-07-15",
  Thursday: "2026-07-16",
  Friday: "2026-07-17",
  Saturday: "2026-07-18",
};

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
    day = { weekday, slots: [], sessionDate: ISO[weekday] || null };
    staff.days.push(day);
  }
  if (!Array.isArray(day.slots)) day.slots = [];
  if (ISO[weekday]) day.sessionDate = ISO[weekday];
  return day;
}
function clearDayServices(day, pred) {
  const before = day.slots.length;
  day.slots = day.slots.filter((sl) => !pred(sl));
  return before - day.slots.length;
}
function isDc(sl) {
  return /day\s*centre/i.test(sl.service || "");
}
function isActonAquatic(sl) {
  return /acton/i.test(sl.venue || "") && /aquatic/i.test(sl.service || "");
}
function isNortholtAquatic(sl) {
  return /northolt/i.test(sl.venue || "") && /aquatic/i.test(sl.service || "");
}
function isTinashe(sl) {
  return /tinashe/i.test(String(sl.client_name || ""));
}

function dc(time, client, instructors, area) {
  return {
    area: area || "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: area || "Hub Room",
    time_slot: time,
    client_name: client,
    instructors,
  };
}
function aquatic(venue, time, client, instructors, area) {
  return {
    area: area || (venue === "Acton" ? "Lane (DE)" : "Teaching Pool"),
    venue,
    service: "Aquatic Activity",
    pool_note: area || (venue === "Acton" ? "Lane (DE)" : "Teaching Pool"),
    time_slot: time,
    client_name: client,
    instructors,
  };
}
function bespoke(time, client, instructors) {
  return {
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Bespoke Programme",
    pool_note: "Hub Room",
    time_slot: time,
    client_name: client,
    instructors,
  };
}

const notes = [];
function note(m) {
  notes.push(m);
  console.log(m);
}

function setDcDay(staff, weekday, rows) {
  if (!staff) return;
  const d = ensureDay(staff, weekday);
  clearDayServices(d, isDc);
  for (const r of rows) d.slots.push(dc(r.time, r.client, r.instr, r.area));
}

function rebuildMonday(week) {
  const roberto = findStaff(week, "roberto");
  const michelle = findStaff(week, "michelle");
  const luliya = findStaff(week, "luliya", "lulia");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  const youssef = findStaff(week, "youssef");
  const dan = findStaff(week, "dan");
  const godsway = findStaff(week, "godsway");
  const john = findStaff(week, "john");
  const bismark = findStaff(week, "bismark");
  const giuseppe = findStaff(week, "giuseppe");

  setDcDay(roberto, "Monday", [
    { time: "11 to 1", client: "Emanuel", instr: "ROBERTO" },
    { time: "1 to 3", client: "Fadi", instr: "ROBERTO" },
  ]);
  setDcDay(michelle, "Monday", [{ time: "11 to 4", client: "Ikram", instr: "MICHELLE" }]);
  setDcDay(luliya, "Monday", [{ time: "11 to 3", client: "Ikram", instr: "LULIYA" }]);
  setDcDay(victor, "Monday", []);
  setDcDay(raul, "Monday", [
    { time: "11 to 1", client: "Timi", instr: "RAUL" },
    { time: "1 to 4", client: "Emanuel", instr: "RAUL" },
  ]);
  setDcDay(youssef, "Monday", [{ time: "12.30 to 3", client: "Fadi", instr: "YOUSSEF" }]);
  note("Mon DC = local Autumn (Victor OFF)");

  if (roberto) {
    const d = ensureDay(roberto, "Monday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 5.30", "Adam P", "ROBERTO"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "Steven", "ROBERTO"));
    d.slots.push(aquatic("Acton", "6 to 6.30", "Mario", "ROBERTO"));
  }
  if (youssef) {
    const d = ensureDay(youssef, "Monday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 4.30", "CLOSED", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "4.30 to 5", "Eddie Mc", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "5 to 5.30", "NO PARTICIPANT", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "5.30 to 6.30", "Abodi Pa", "YOUSSEF"));
  }
  if (luliya) {
    const d = ensureDay(luliya, "Monday");
    clearDayServices(d, isNortholtAquatic);
    d.slots.push(aquatic("Northolt", "4.30 to 5", "NO PARTICIPANT", "LULIYA"));
    d.slots.push(aquatic("Northolt", "5 to 5.30", "Gemma", "LULIYA"));
    d.slots.push(aquatic("Northolt", "5.30 to 6", "Zayana", "LULIYA"));
    d.slots.push(aquatic("Northolt", "6 to 6.30", "Yamik", "LULIYA"));
  }
  if (dan) {
    const d = ensureDay(dan, "Monday");
    clearDayServices(d, isNortholtAquatic);
    d.slots.push(
      Object.assign(aquatic("Northolt", "4.30 to 5", "Rayden Rana (trial)", "DAN"), {
        participant_info: "trial",
      }),
    );
    d.slots.push(aquatic("Northolt", "5 to 5.30", "Amar Rai", "DAN"));
    d.slots.push(aquatic("Northolt", "5.30 to 6", "Amar Rai", "DAN"));
    d.slots.push(aquatic("Northolt", "6 to 6.30", "Adaam Ah", "DAN"));
  }
  note("Mon AS Acton/Northolt = local EXTRA");

  for (const [st, name] of [
    [godsway, "GODSWAY"],
    [john, "JOHN"],
    [raul, "RAUL"],
  ]) {
    if (!st) {
      note(`MISSING ${name} Mon Tinashe`);
      continue;
    }
    const d = ensureDay(st, "Monday");
    clearDayServices(d, isTinashe);
    d.slots.push(bespoke("4.30 to 6", "Tinashe", name));
  }
  for (const st of [bismark, giuseppe]) {
    if (!st) continue;
    const n = clearDayServices(ensureDay(st, "Monday"), isTinashe);
    if (n) note(`Mon ${staffKeyOf(st)} cleared Tinashe (${n})`);
  }
  note("Mon Hub Tinashe = Godsway + John + Raul");
}

function rebuildTuesday(week) {
  const roberto = findStaff(week, "roberto");
  const michelle = findStaff(week, "michelle");
  const luliya = findStaff(week, "luliya", "lulia");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  const youssef = findStaff(week, "youssef");

  setDcDay(roberto, "Tuesday", [
    { time: "11 to 12", client: "ACAT", instr: "ROBERTO" },
    { time: "12.30 to 3", client: "Fadi", instr: "ROBERTO" },
  ]);
  setDcDay(michelle, "Tuesday", [{ time: "11 to 4", client: "Ikram", instr: "MICHELLE" }]);
  setDcDay(luliya, "Tuesday", [{ time: "11 to 3", client: "Ikram", instr: "LULIYA" }]);
  setDcDay(victor, "Tuesday", [
    { time: "12.30 to 3", client: "Fadi", instr: "VICTOR" },
    { time: "3 to 4", client: "Ikram", instr: "VICTOR" },
  ]);
  setDcDay(raul, "Tuesday", []);
  setDcDay(youssef, "Tuesday", []);
  note("Tue DC = local Autumn (Roberto ACAT 11-12 + Fadi 12.30-3; Michelle Ikram 11-4; Raul OFF)");
}

function rebuildWednesday(week) {
  const roberto = findStaff(week, "roberto");
  const michelle = findStaff(week, "michelle");
  const luliya = findStaff(week, "luliya", "lulia");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  const youssef = findStaff(week, "youssef");
  const godsway = findStaff(week, "godsway");
  const john = findStaff(week, "john");
  const bismark = findStaff(week, "bismark");
  const giuseppe = findStaff(week, "giuseppe");
  const javier = findStaff(week, "javier");
  const dan = findStaff(week, "dan");

  setDcDay(roberto, "Wednesday", [
    { time: "11 to 12.30", client: "Emanuel", instr: "ROBERTO" },
    { time: "12.30 to 3", client: "Fadi", instr: "ROBERTO" },
  ]);
  setDcDay(michelle, "Wednesday", [{ time: "11 to 4", client: "Ikram", instr: "MICHELLE" }]);
  setDcDay(luliya, "Wednesday", [{ time: "11 to 3", client: "Ikram", instr: "LULIYA" }]);
  setDcDay(victor, "Wednesday", [
    { time: "12.30 to 3", client: "Emanuel", instr: "VICTOR" },
    { time: "3 to 4", client: "Ikram", instr: "VICTOR" },
  ]);
  setDcDay(raul, "Wednesday", [
    { time: "12.30 to 3", client: "Fadi", instr: "RAUL" },
    { time: "3 to 4", client: "Emanuel", instr: "RAUL" },
  ]);
  setDcDay(youssef, "Wednesday", []);
  note("Wed DC = local Autumn");

  if (javier) {
    const d = ensureDay(javier, "Wednesday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 5", "Cyrus", "JAVIER"));
    d.slots.push(aquatic("Acton", "5 to 5.30", "NO PARTICIPANT", "JAVIER"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "NO PARTICIPANT", "JAVIER"));
    d.slots.push(aquatic("Acton", "6 to 6.30", "Kayden", "JAVIER"));
  }
  if (youssef) {
    const d = ensureDay(youssef, "Wednesday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 4.30", "NO PARTICIPANT", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "4.30 to 5.30", "Stephanie", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "NO PARTICIPANT", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "6 to 6.30", "NO PARTICIPANT", "YOUSSEF"));
  }
  if (dan) {
    const d = ensureDay(dan, "Wednesday");
    clearDayServices(d, isNortholtAquatic);
    d.slots.push(aquatic("Northolt", "4.30 to 5", "Tyson", "DAN"));
    d.slots.push(aquatic("Northolt", "5 to 5.30", "Ruben", "DAN"));
    d.slots.push(aquatic("Northolt", "5.30 to 6", "Amar Rai", "DAN"));
    d.slots.push(aquatic("Northolt", "6 to 6.30", "Mia", "DAN"));
  }
  if (luliya) {
    const d = ensureDay(luliya, "Wednesday");
    clearDayServices(d, isNortholtAquatic);
    d.slots.push(aquatic("Northolt", "4.30 to 5", "Vithura", "LULIYA"));
    d.slots.push(aquatic("Northolt", "5 to 5.30", "Amar Rai", "LULIYA"));
    d.slots.push(aquatic("Northolt", "5.30 to 6", "Amber", "LULIYA"));
    d.slots.push(aquatic("Northolt", "6 to 6.30", "NO PARTICIPANT", "LULIYA"));
  }
  note("Wed AS Acton/Northolt = local EXTRA");

  for (const [st, name] of [
    [godsway, "GODSWAY"],
    [john, "JOHN"],
    [raul, "RAUL"],
  ]) {
    if (!st) continue;
    const d = ensureDay(st, "Wednesday");
    clearDayServices(d, isTinashe);
    d.slots.push(bespoke("4.30 to 6", "Tinashe", name));
  }
  for (const st of [bismark, giuseppe]) {
    if (!st) continue;
    const n = clearDayServices(ensureDay(st, "Wednesday"), isTinashe);
    if (n) note(`Wed ${staffKeyOf(st)} cleared Tinashe (${n})`);
  }
  note("Wed Hub Tinashe = Godsway + John + Raul");
}

function rebuildThursday(week) {
  const roberto = findStaff(week, "roberto");
  const michelle = findStaff(week, "michelle");
  const luliya = findStaff(week, "luliya", "lulia");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  const youssef = findStaff(week, "youssef");
  const simon = findStaff(week, "simon");
  const javier = findStaff(week, "javier");
  const aurora = findStaff(week, "aurora");

  setDcDay(roberto, "Thursday", [{ time: "12.30 to 3", client: "Fadi", instr: "ROBERTO" }]);
  setDcDay(youssef, "Thursday", [{ time: "12.30 to 3", client: "Fadi", instr: "YOUSSEF" }]);
  setDcDay(michelle, "Thursday", []);
  setDcDay(luliya, "Thursday", []);
  setDcDay(victor, "Thursday", []);
  setDcDay(raul, "Thursday", []);
  note("Thu DC = Roberto+Youssef Fadi only");

  if (roberto) {
    const d = ensureDay(roberto, "Thursday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 4.30", "Tom", "ROBERTO"));
    d.slots.push(aquatic("Acton", "4.30 to 5", "Yassir", "ROBERTO"));
    d.slots.push(aquatic("Acton", "5 to 5.30", "Yossi", "ROBERTO"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "Yunis Hussein", "ROBERTO"));
    d.slots.push(aquatic("Acton", "6 to 6.30", "Maiyar", "ROBERTO"));
  }
  if (simon) {
    const d = ensureDay(simon, "Thursday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 4.30", "Elijah", "SIMON"));
    d.slots.push(aquatic("Acton", "4.30 to 5", "NO PARTICIPANT", "SIMON"));
    d.slots.push(aquatic("Acton", "5 to 5.30", "Yuri", "SIMON"));
    d.slots.push(aquatic("Acton", "5.30 to 6.30", "Joelle", "SIMON"));
  }
  if (javier) {
    const d = ensureDay(javier, "Thursday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 5", "Ayman", "JAVIER"));
    d.slots.push(aquatic("Acton", "5 to 5.30", "Khalid Ab", "JAVIER"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "NO PARTICIPANT", "JAVIER"));
    d.slots.push(aquatic("Acton", "6 to 6.30", "NO PARTICIPANT", "JAVIER"));
  }
  if (aurora) {
    const d = ensureDay(aurora, "Thursday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 4.30", "CLOSED", "AURORA"));
    d.slots.push(aquatic("Acton", "4.30 to 5.30", "Aqsa", "AURORA"));
    d.slots.push(aquatic("Acton", "5.30 to 6.30", "Joelle", "AURORA"));
  }
  note("Thu Acton AS = Yunis+Maiyar Roberto; Joelle 5.30-6.30 Aurora+Simon");
}

function rebuildFriday(week) {
  const roberto = findStaff(week, "roberto");
  const michelle = findStaff(week, "michelle");
  const luliya = findStaff(week, "luliya", "lulia");
  const victor = findStaff(week, "victor");
  const raul = findStaff(week, "raul");
  const youssef = findStaff(week, "youssef");
  const godsway = findStaff(week, "godsway");
  const john = findStaff(week, "john");
  const bismark = findStaff(week, "bismark");
  const giuseppe = findStaff(week, "giuseppe");

  setDcDay(roberto, "Friday", [
    { time: "11 to 1", client: "Emanuel", instr: "ROBERTO" },
    { time: "1 to 3", client: "Fadi", instr: "ROBERTO" },
  ]);
  setDcDay(michelle, "Friday", [{ time: "11 to 4", client: "Ikram", instr: "MICHELLE" }]);
  setDcDay(luliya, "Friday", [{ time: "11 to 4", client: "Ikram", instr: "LULIYA" }]);
  setDcDay(victor, "Friday", [
    { time: "11 to 1", client: "Timi", instr: "VICTOR" },
    { time: "1 to 4", client: "Emanuel", instr: "VICTOR" },
  ]);
  setDcDay(raul, "Friday", [
    { time: "11 to 1", client: "Timi", instr: "RAUL" },
    { time: "1 to 4", client: "Emanuel", instr: "RAUL" },
  ]);
  setDcDay(youssef, "Friday", [{ time: "12.30 to 3", client: "Fadi", instr: "YOUSSEF" }]);
  note("Fri DC = local Autumn");

  if (roberto) {
    const d = ensureDay(roberto, "Friday");
    clearDayServices(d, isActonAquatic);
    clearDayServices(d, isTinashe);
    d.slots.push(bespoke("4.30 to 6", "Tinashe", "ROBERTO"));
  }
  if (youssef) {
    const d = ensureDay(youssef, "Friday");
    clearDayServices(d, isActonAquatic);
    d.slots.push(aquatic("Acton", "4 to 5.30", "Adam Pi", "YOUSSEF"));
    d.slots.push(aquatic("Acton", "5.30 to 6", "Amaar Ah", "YOUSSEF"));
  }
  for (const st of [godsway, john, bismark, giuseppe, raul]) {
    if (!st) continue;
    const n = clearDayServices(ensureDay(st, "Friday"), isTinashe);
    if (n) note(`Fri ${staffKeyOf(st)} cleared Tinashe (${n})`);
  }
  note("Fri Hub Tinashe = Roberto; Acton = Youssef");
}

function rebuildSaturday(week) {
  const youssef = findStaff(week, "youssef");
  if (!youssef) return;
  const d = ensureDay(youssef, "Saturday");
  clearDayServices(d, isActonAquatic);
  d.slots.push(aquatic("Acton", "9.30 to 10", "NO PARTICIPANT", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "10 to 10.30", "NO PARTICIPANT", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "10.30 to 11", "Emani", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "11 to 11.30", "NO PARTICIPANT", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "11.30 to 12", "NO PARTICIPANT", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "12 to 12.30", "Saaib", "YOUSSEF"));
  d.slots.push(aquatic("Acton", "12.30 to 1", "NO PARTICIPANT", "YOUSSEF"));
  note("Sat Acton = local EXTRA (Youssef)");
}

const { data, error } = await sb
  .from("portal_madre_document")
  .select("term_key, revision, document, updated_at")
  .eq("term_key", TERM)
  .maybeSingle();
if (error || !data) throw new Error(error?.message || "MADRE missing");

const doc = structuredClone(data.document);
const week = (doc.weeks || []).find((w) => w.start === STANDING);
if (!week) throw new Error("standing week 2026-07-13 missing");

rebuildMonday(week);
rebuildTuesday(week);
rebuildWednesday(week);
rebuildThursday(week);
rebuildFriday(week);
rebuildSaturday(week);

const prevRev = data.revision;
const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.lastLiveFoldNote =
  "office_sync:local_dc_staff_week standing weekdays 2026-09-03";
(doc.revisionNotes = doc.revisionNotes || []).push(
  `rev ${nextRev}: MADRE standing 2026-07-13 weekdays = local_dc_staff_week (Mon Victor OFF; Hub Mon/Wed Godsway/John/Raul; Fri Roberto Tinashe + Youssef Acton; DC Tue-Fri Autumn)`,
);

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/madre-sync-local-board-mon-fri-dry.json",
  JSON.stringify({ prevRev, nextRev, notes, apply: APPLY }, null, 2),
);

console.log("\nprev", prevRev, "→", nextRev, "notes", notes.length);
if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write MADRE.");
  process.exit(0);
}

const { data: up, error: upErr } = await sb
  .from("portal_madre_document")
  .update({
    revision: nextRev,
    document: doc,
    updated_at: new Date().toISOString(),
  })
  .eq("term_key", TERM)
  .eq("revision", prevRev)
  .select("revision")
  .maybeSingle();
if (upErr) throw new Error(upErr.message);
if (!up) throw new Error("revision conflict — re-run");
console.log("MADRE written revision", up.revision);

const localPath = resolve("working_ui/portal/roster_term_master.json");
if (existsSync(localPath)) {
  writeFileSync(localPath, JSON.stringify(doc, null, 2) + "\n");
  console.log("mirrored", localPath);
}
