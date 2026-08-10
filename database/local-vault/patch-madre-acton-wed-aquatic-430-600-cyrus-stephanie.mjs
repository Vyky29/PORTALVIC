/**
 * Acton Wednesday: Multi-Activity discontinued → Aquatic 30' bands 4–6.30.
 *
 * Javier / Youssef Aquatic:
 *   4–4.30     Cyrus / open
 *   4.30–5     Cyrus / Stephanie
 *   5–5.30     Cyrus / Stephanie
 *   5.30–6     open / open
 *   6–6.30     Kayden / open
 *
 * Clears Acton Multi-Activity on all staff for those Wednesdays.
 *
 *   node database/local-vault/patch-madre-acton-wed-aquatic-430-600-cyrus-stephanie.mjs
 *   APPLY=1 node database/local-vault/patch-madre-acton-wed-aquatic-430-600-cyrus-stephanie.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const LOCAL_MADRE = path.join(root, "working_ui/portal/roster_term_master.json");
const APPLY = process.env.APPLY === "1";

const env = fs.readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const url = get("SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const AQ = "Aquatic Activity";
const BANDS = ["4 to 4.30", "4.30 to 5", "5 to 5.30", "5.30 to 6", "6 to 6.30"];

function rankTime(t) {
  const m = String(t || "")
    .toLowerCase()
    .match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return 9999;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 7) h += 12;
  return h * 60 + mi;
}

function sortSlots(day) {
  day.slots = Array.isArray(day.slots) ? day.slots : [];
  day.slots.sort((a, b) => rankTime(a.time_slot) - rankTime(b.time_slot));
}

function isActon(s) {
  return /acton/i.test(String(s.venue || s.area || ""));
}

function isMulti(s) {
  return /multi/i.test(String(s.service || ""));
}

function isAquatic(s) {
  return /aquatic|swim/i.test(String(s.service || ""));
}

function isWedPmBand(t) {
  const r = rankTime(t);
  return r >= 16 * 60 && r < 18 * 60 + 30;
}

function infoFromDoc(doc, clientRe) {
  for (const w of doc.weeks || []) {
    for (const st of w.staff || []) {
      for (const day of st.days || []) {
        for (const s of day.slots || []) {
          if (clientRe.test(String(s.client_name || "")) && s.participant_info) {
            return s.participant_info;
          }
        }
      }
    }
  }
  return "";
}

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) => String(s.staffKey || "").toLowerCase() === want,
  );
}

function upsertAqSlot(day, opts) {
  const t = opts.time_slot;
  day.slots = Array.isArray(day.slots) ? day.slots : [];
  let slot = day.slots.find(
    (s) =>
      isActon(s) &&
      isAquatic(s) &&
      String(s.time_slot || "").trim().toLowerCase() === t.toLowerCase(),
  );
  if (!slot) {
    slot = {
      area: "Teaching Pool",
      venue: "Acton",
      service: AQ,
      pool_note: "Teaching Pool",
      time_slot: t,
      client_name: opts.client_name,
      instructors: opts.instructors,
      participant_info: opts.participant_info || "",
    };
    day.slots.push(slot);
  } else {
    slot.service = AQ;
    slot.venue = "Acton";
    slot.area = slot.area || "Teaching Pool";
    slot.pool_note = slot.pool_note || "Teaching Pool";
    slot.time_slot = t;
    slot.client_name = opts.client_name;
    slot.instructors = opts.instructors;
    if (opts.participant_info) slot.participant_info = opts.participant_info;
  }
  return slot;
}

function patchWeek(week, cyrusInfo, stephanieInfo, kaydenInfo, notes) {
  const javier = findStaff(week, "javier");
  const youssef = findStaff(week, "youssef");
  if (!javier && !youssef) return false;

  let touched = false;

  // Clear Acton Multi on every staff for Wednesdays that have javier/youssef Acton.
  const wedIsos = new Set();
  for (const st of [javier, youssef].filter(Boolean)) {
    for (const day of st.days || []) {
      const iso = String(day.sessionDate || "").slice(0, 10);
      if (!iso) continue;
      if (new Date(iso + "T12:00:00").getDay() !== 3) continue;
      const hasActon = (day.slots || []).some(isActon);
      if (hasActon) wedIsos.add(iso);
    }
  }
  if (!wedIsos.size) return false;

  for (const st of week.staff || []) {
    for (const day of st.days || []) {
      const iso = String(day.sessionDate || "").slice(0, 10);
      if (!wedIsos.has(iso)) continue;
      const before = (day.slots || []).length;
      day.slots = (day.slots || []).filter((s) => !(isActon(s) && isMulti(s)));
      if (day.slots.length !== before) {
        touched = true;
        notes.push(
          `${iso} ${st.staffKey}: drop Acton Multi (${before - day.slots.length})`,
        );
      }
      sortSlots(day);
    }
  }

  const assign = {
    javier: {
      "4 to 4.30": { client: "Cyrus", info: cyrusInfo },
      "4.30 to 5": { client: "Cyrus", info: cyrusInfo },
      "5 to 5.30": { client: "Cyrus", info: cyrusInfo },
      "5.30 to 6": { client: "NO PARTICIPANT", info: "" },
      "6 to 6.30": { client: "Kayden", info: kaydenInfo },
    },
    youssef: {
      "4 to 4.30": { client: "NO PARTICIPANT", info: "" },
      "4.30 to 5": { client: "Stephanie", info: stephanieInfo },
      "5 to 5.30": { client: "Stephanie", info: stephanieInfo },
      "5.30 to 6": { client: "NO PARTICIPANT", info: "" },
      "6 to 6.30": { client: "NO PARTICIPANT", info: "" },
    },
  };

  for (const [staffKey, map] of Object.entries(assign)) {
    const st = findStaff(week, staffKey);
    if (!st) continue;
    const instr = staffKey.toUpperCase();
    for (const day of st.days || []) {
      const iso = String(day.sessionDate || "").slice(0, 10);
      if (!wedIsos.has(iso)) continue;

      // Drop old Acton aquatic bands in the 4–6.30 window that are not our 30' set
      // (e.g. leftover Multi times wrongly tagged, or odd lengths).
      day.slots = (day.slots || []).filter((s) => {
        if (!isActon(s)) return true;
        if (!isAquatic(s)) return true;
        const t = String(s.time_slot || "").trim();
        if (!isWedPmBand(t)) return true;
        if (BANDS.includes(t)) return true;
        notes.push(`${iso} ${staffKey}: drop odd Acton aq "${t}"`);
        touched = true;
        return false;
      });

      for (const t of BANDS) {
        const want = map[t];
        upsertAqSlot(day, {
          time_slot: t,
          client_name: want.client,
          instructors: instr,
          participant_info: want.info || "",
        });
      }
      sortSlots(day);
      touched = true;
      notes.push(
        `${iso} ${staffKey}: aq 4–6.30 → ` +
          BANDS.map((t) => `${t}=${map[t].client}`).join(", "),
      );
    }
  }

  return touched;
}

const getRes = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await getRes.json();
if (!getRes.ok || !rows?.[0]) {
  console.error(getRes.status, rows);
  process.exit(1);
}
const prevRev = rows[0].revision;
const doc = rows[0].document;
const notes = [];
const cyrusInfo = infoFromDoc(doc, /^cyrus/i);
const stephanieInfo = infoFromDoc(doc, /^stephanie/i);
const kaydenInfo = infoFromDoc(doc, /^kayden/i);

let any = false;
for (const week of doc.weeks || []) {
  if (patchWeek(week, cyrusInfo, stephanieInfo, kaydenInfo, notes)) any = true;
}
if (!any) {
  console.log("No matching Wed Acton javier/youssef weeks found.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note =
  `rev ${prevRev + 1}: Acton Wed Multi dropped; Aquatic 4/4.30/5/5.30/6 — Cyrus 4–5.30 (Javier), Stephanie 4.30–5.30 (Youssef), opens 5.30–6`;
doc.meta.notes.push(note);

console.log({ prevRev, APPLY, noteCount: notes.length, sample: notes.slice(0, 12) });

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write.");
  process.exit(0);
}

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

// Keep local mirror in sync for weeks that exist there.
if (fs.existsSync(LOCAL_MADRE)) {
  const local = JSON.parse(fs.readFileSync(LOCAL_MADRE, "utf8"));
  const localNotes = [];
  for (const week of local.weeks || []) {
    patchWeek(week, cyrusInfo, stephanieInfo, kaydenInfo, localNotes);
  }
  local.meta = local.meta || {};
  local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
  local.meta.notes.push(note);
  local.meta.revision = nextRev;
  fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");
}

// Standing / template portal_roster_rows for Booking Portal + Services open seats.
async function upsertStanding(row) {
  const q =
    url +
    "/rest/v1/portal_roster_rows?" +
    new URLSearchParams({
      status: "eq.active",
      day: "eq.Wednesday",
      time_slot: `eq.${row.time_slot}`,
      instructors: `eq.${row.instructors}`,
      venue: "eq.Acton",
      session_date: "is.null",
      select: "id,client_name",
      limit: "1",
    });
  const existing = await fetch(q, { headers }).then((r) => r.json());
  const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
  const payload = {
    client_name: row.client_name,
    day: "Wednesday",
    time_slot: row.time_slot,
    instructors: row.instructors,
    service: AQ,
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null,
    status: "active",
    created_by: OFFICE_USER,
    updated_by: OFFICE_USER,
  };
  if (Array.isArray(existing) && existing[0]?.id) {
    const id = existing[0].id;
    const res = await fetch(url + `/rest/v1/portal_roster_rows?id=eq.${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`patch roster ${id}: ${await res.text()}`);
    return { id, action: "update" };
  }
  const res = await fetch(url + "/rest/v1/portal_roster_rows", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`insert roster: ${await res.text()}`);
  const created = await res.json();
  return { id: created?.[0]?.id, action: "insert" };
}

const standingPlan = [
  { instructors: "JAVIER", time_slot: "4 to 4.30", client_name: "Cyrus" },
  { instructors: "JAVIER", time_slot: "4.30 to 5", client_name: "Cyrus" },
  { instructors: "JAVIER", time_slot: "5 to 5.30", client_name: "Cyrus" },
  { instructors: "JAVIER", time_slot: "5.30 to 6", client_name: "NO PARTICIPANT" },
  { instructors: "JAVIER", time_slot: "6 to 6.30", client_name: "Kayden" },
  { instructors: "YOUSSEF", time_slot: "4 to 4.30", client_name: "NO PARTICIPANT" },
  { instructors: "YOUSSEF", time_slot: "4.30 to 5", client_name: "Stephanie" },
  { instructors: "YOUSSEF", time_slot: "5 to 5.30", client_name: "Stephanie" },
  { instructors: "YOUSSEF", time_slot: "5.30 to 6", client_name: "NO PARTICIPANT" },
  { instructors: "YOUSSEF", time_slot: "6 to 6.30", client_name: "NO PARTICIPANT" },
];
const rosterResults = [];
for (const row of standingPlan) {
  rosterResults.push({ ...row, ...(await upsertStanding(row)) });
}

console.log({
  ok: true,
  prevRev,
  nextRev: out[0].revision,
  rosterResults,
});
