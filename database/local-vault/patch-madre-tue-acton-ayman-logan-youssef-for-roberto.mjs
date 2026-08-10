/**
 * Tuesday Acton aquatic standing:
 * - Ayman: Youssef 4.30–5 → Javier 4.30–5
 * - Logan: Youssef 5–5.30 → Simon 5–5.30
 * - Serine: Roberto → Youssef (Youssef replaces Roberto Tue Acton)
 * - Roberto: leave Tuesday Acton (floating) — no open seats left behind
 *
 *   node database/local-vault/patch-madre-tue-acton-ayman-logan-youssef-for-roberto.mjs
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
    (s) => s && String(s.staffKey || "").toLowerCase() === want,
  );
}

function isActonAquatic(slot) {
  if (!/acton/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".")
    .replace(/\s+/g, " ");
}

function isNamedClient(name) {
  const u = norm(name).toUpperCase();
  if (!u) return false;
  if (
    u === "NO PARTICIPANT" ||
    u === "NO CLIENT" ||
    u === "CLOSED" ||
    u === "HOME" ||
    u === "MANAGER" ||
    /shadow/i.test(u)
  ) {
    return false;
  }
  return true;
}

function clientMatches(name, re) {
  return re.test(norm(name));
}

function startMin(t) {
  const m = timeKey(t).match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return 9999;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 8) h += 12;
  return h * 60 + mi;
}

function endMin(t) {
  const s = timeKey(t);
  const m = s.match(
    /(\d{1,2})(?:[.:](\d{2}))?\s*(?:to|-|–)\s*(\d{1,2})(?:[.:](\d{2}))?/,
  );
  if (!m) return startMin(t) + 30;
  let h = +m[3];
  const mi = m[4] ? +m[4] : 0;
  if (h >= 1 && h <= 8) h += 12;
  return h * 60 + mi;
}

function coversBand(slotTime, bandStart, bandEnd) {
  const a = startMin(slotTime);
  const b = endMin(slotTime);
  return a < bandEnd && b > bandStart;
}

function findDay(st, iso) {
  return (st.days || []).find(
    (d) => String(d.sessionDate || "").slice(0, 10) === iso,
  );
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function setOrReplaceBand(day, bandStart, bandEnd, timeLabel, clientName, info) {
  // Remove slots that overlap this half-hour band (Acton aquatic only).
  day.slots = (day.slots || []).filter((s) => {
    if (!isActonAquatic(s)) return true;
    return !coversBand(s.time_slot, bandStart, bandEnd);
  });
  const slot = {
    client_name: clientName,
    time_slot: timeLabel,
    service: "Aquatic Activity",
    venue: "Acton",
    area: "",
    pool_note: "",
  };
  if (info) slot.participant_info = info;
  day.slots.push(slot);
  sortSlots(day);
}

function takeNamedSlot(day, nameRe) {
  const slots = day.slots || [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!isActonAquatic(s)) continue;
    if (!clientMatches(s.client_name, nameRe)) continue;
    const [taken] = slots.splice(i, 1);
    return taken;
  }
  return null;
}

function patchTuesdayDay(week, iso) {
  const javier = findStaff(week, "javier");
  const youssef = findStaff(week, "youssef");
  const simon = findStaff(week, "simon");
  const roberto = findStaff(week, "roberto");
  if (!javier || !youssef || !simon) return null;

  const jDay = findDay(javier, iso);
  const yDay = findDay(youssef, iso);
  const sDay = findDay(simon, iso);
  const rDay = roberto ? findDay(roberto, iso) : null;
  if (!jDay || !yDay || !sDay) return null;
  if (!jDay.slots) jDay.slots = [];
  if (!yDay.slots) yDay.slots = [];
  if (!sDay.slots) sDay.slots = [];

  const log = [];

  // 1) Ayman Youssef → Javier 4.30–5
  const ayman = takeNamedSlot(yDay, /^ayman$/i);
  if (ayman) {
    setOrReplaceBand(
      jDay,
      16 * 60 + 30,
      17 * 60,
      "4.30 to 5",
      norm(ayman.client_name) || "Ayman",
      ayman.participant_info,
    );
    log.push("Ayman → Javier 4.30–5");
  }

  // 2) Logan Youssef → Simon 5–5.30
  const logan = takeNamedSlot(yDay, /^logan$/i);
  if (logan) {
    setOrReplaceBand(
      sDay,
      17 * 60,
      17 * 60 + 30,
      "5 to 5.30",
      norm(logan.client_name) || "Logan",
      logan.participant_info,
    );
    log.push("Logan → Simon 5–5.30");
  }

  // 3) Serine Roberto → Youssef; strip Roberto Tue Acton (no open leftovers)
  if (rDay) {
    const serine = takeNamedSlot(rDay, /^serine$/i);
    if (serine) {
      // Place Serine as 4.30–5.30 on Youssef (replaces the freed Ayman/Logan band).
      setOrReplaceBand(
        yDay,
        16 * 60 + 30,
        17 * 60 + 30,
        "4.30 to 5.30",
        norm(serine.client_name) || "Serine",
        serine.participant_info,
      );
      log.push("Serine → Youssef 4.30–5.30");
    }
    // Remove ALL remaining Roberto Acton aquatic on this Tuesday (opens included).
    const before = (rDay.slots || []).length;
    rDay.slots = (rDay.slots || []).filter((s) => !isActonAquatic(s));
    const removed = before - rDay.slots.length;
    if (removed) log.push(`Roberto Acton Tue cleared (${removed} slots)`);
    if (!(rDay.slots || []).length) {
      roberto.days = (roberto.days || []).filter(
        (d) => String(d.sessionDate || "").slice(0, 10) !== iso,
      );
    }
  }

  sortSlots(jDay);
  sortSlots(yDay);
  sortSlots(sDay);
  return log;
}

function patchWeek(week) {
  const logs = [];
  const dates = new Set();
  for (const st of Object.values(week.staff || {})) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (norm(day.weekday) !== "Tuesday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (!iso) continue;
      dates.add(iso);
    }
  }
  for (const iso of [...dates].sort()) {
    const log = patchTuesdayDay(week, iso);
    if (log && log.length) logs.push({ iso, log });
  }
  return logs;
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
  const logs = patchWeek(week);
  if (logs.length) summaries.push({ week: `${week.start}–${week.end}`, logs });
}

if (!summaries.length) {
  console.log("Nothing to patch");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Tue Acton Ayman→Javier, Logan→Simon, Serine Roberto→Youssef; Roberto floating (no opens)`;
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

// Cancel Roberto Tue Acton open templates (exact instructor) — no floating opens.
const rrH = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const tpl = await fetch(
  url +
    "/rest/v1/portal_roster_rows?instructors=eq.ROBERTO&day=eq.Tuesday&venue=ilike.*Acton*&status=eq.active&client_name=eq.NO PARTICIPANT&select=id,time_slot",
  { headers: rrH },
).then((r) => r.json());
if (Array.isArray(tpl) && tpl.length) {
  const ids = tpl.map((r) => r.id);
  const c = await fetch(url + `/rest/v1/portal_roster_rows?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    headers: rrH,
    body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
  });
  console.log("cancelled Roberto Tue Acton open templates", c.status, tpl.length);
}

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeks: summaries.length,
      sample: summaries.slice(-1),
    },
    null,
    2,
  ),
);
