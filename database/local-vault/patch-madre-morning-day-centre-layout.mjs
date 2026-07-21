/**
 * Align morning Day Centre cards on staff dashboards (MADRE summer-2026):
 *
 * Roberto: NO ACAT · Fadi 12.30–3 special (12.30–1 pool/DC + 1–3 Day Centre).
 *          No Zakariya midweek (crash week Zak is Alex climb + SwimFarm special).
 * Youssef: Emanuel 11–2 special (with swimming) · Fadi 2–3
 * Michelle / Lulia: Ikram 11–4
 * Victor: Timi 11–1 · Fadi 1–2 · Emanuel 2–4
 *
 * Applies to MADRE weeks from 2026-07-13 through 2026-07-31 (incl. crash).
 *
 *   node database/local-vault/patch-madre-morning-day-centre-layout.mjs
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

function ensureDay(st, iso, weekday) {
  let d = (st.days || []).find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
  st.days = st.days || [];
  st.days.push(d);
  return d;
}

function weekdayName(iso) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const [y, m, d] = iso.split("-").map(Number);
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function sortSlots(day) {
  const rank = (t) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + mi;
  };
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function infoFromDoc(doc, clientRe) {
  for (const w of doc.weeks || []) {
    for (const st of Object.values(w.staff || {})) {
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

function isMorningDcClient(name) {
  const n = String(name || "").trim().toLowerCase();
  return /^(acat|fadi|timi|emanuel|ikram|zakariya|casa|home|manager)$/i.test(n);
}

function keepAfternoon(slot) {
  const t = String(slot.time_slot || "").toLowerCase();
  const m = t.match(/^(\d{1,2})/);
  if (!m) return true;
  let h = +m[1];
  if (h >= 1 && h <= 7) h += 12;
  return h >= 15; // keep 3pm+ aquatic / other
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

const fadiInfo = infoFromDoc(doc, /^fadi$/i);
const emInfo = infoFromDoc(doc, /^emanuel/i);
const timiInfo = infoFromDoc(doc, /^timi/i);
const ikramInfo = infoFromDoc(doc, /^ikram/i);
const weeks = (doc.weeks || []).filter((w) => {
  const end = String(w.end || "").slice(0, 10);
  return end >= "2026-07-13";
});

for (const week of weeks) {
  const start = String(week.start || "").slice(0, 10);
  const end = String(week.end || "").slice(0, 10);
  for (
    let t = new Date(start + "T12:00:00Z");
    t.toISOString().slice(0, 10) <= end;
    t.setUTCDate(t.getUTCDate() + 1)
  ) {
    const iso = t.toISOString().slice(0, 10);
    const wd = t.getUTCDay(); // 0 Sun … 6 Sat
    if (wd === 0 || wd === 6) continue;
    const dayName = weekdayName(iso);

    // --- Roberto ---
    {
      const st = findStaff(week, "roberto");
      if (st) {
        const d = ensureDay(st, iso, dayName);
        d.slots = (d.slots || []).filter((s) => {
          const n = String(s.client_name || "").trim();
          if (/^acat$/i.test(n)) {
            notes.push(`${iso} roberto: removed ACAT`);
            return false;
          }
          if (/^zakariya$/i.test(n)) return false;
          if (/^fadi$/i.test(n)) return false;
          if (/^timi$/i.test(n) && !keepAfternoon(s)) return false;
          return true;
        });
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "12.30 to 3",
          client_name: "Fadi",
          instructors: "ROBERTO",
          participant_info: fadiInfo,
          segments: [
            { time_slot: "12.30 to 1", area: "Big Pool" },
            { time_slot: "1 to 3", area: "Day Centre" },
          ],
        });
        sortSlots(d);
        notes.push(`${iso} roberto: Fadi 12.30–3 (no Zakariya)`);
      }
    }

    // --- Youssef ---
    {
      const st = findStaff(week, "youssef");
      if (st) {
        const d = ensureDay(st, iso, dayName);
        const afternoon = (d.slots || []).filter((s) => keepAfternoon(s) && !isMorningDcClient(s.client_name));
        const morningKeep = (d.slots || []).filter(
          (s) => !keepAfternoon(s) && !isMorningDcClient(s.client_name) && !/^closed$/i.test(s.client_name || "")
        );
        // On crash weeks youssef may only have morning DC — still set cards.
        d.slots = afternoon.concat(morningKeep);
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "11 to 2",
          client_name: "Emanuel",
          instructors: "YOUSSEF",
          participant_info: emInfo,
          segments: [
            { time_slot: "11 to 12", area: "Day Centre" },
            { time_slot: "12 to 2", area: "Big Pool" },
          ],
        });
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "2 to 3",
          client_name: "Fadi",
          instructors: "YOUSSEF",
          participant_info: fadiInfo,
        });
        sortSlots(d);
        notes.push(`${iso} youssef: Emanuel 11–2 + Fadi 2–3`);
      }
    }

    // --- Michelle ---
    {
      const st = findStaff(week, "michelle");
      if (st) {
        const d = ensureDay(st, iso, dayName);
        d.slots = (d.slots || []).filter((s) => keepAfternoon(s) && !/^ikram$/i.test(s.client_name || ""));
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "11 to 4",
          client_name: "Ikram",
          instructors: "MICHELLE",
          participant_info: ikramInfo,
        });
        sortSlots(d);
        notes.push(`${iso} michelle: Ikram 11–4`);
      }
    }

    // --- Lulia / Luliya ---
    {
      const st = findStaff(week, "lulia") || findStaff(week, "luliya");
      if (st) {
        const d = ensureDay(st, iso, dayName);
        const shadow = (d.slots || []).filter(
          (s) =>
            /shadow/i.test(s.client_name || "") ||
            /shadow/i.test(s.service || "") ||
            keepAfternoon(s)
        );
        d.slots = shadow.filter((s) => !/^ikram$/i.test(s.client_name || ""));
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "11 to 4",
          client_name: "Ikram",
          instructors: String(st.staffKey || "LULIYA").toUpperCase() === "LULIA" ? "LULIYA" : "LULIYA",
          participant_info: ikramInfo,
        });
        sortSlots(d);
        notes.push(`${iso} lulia: Ikram 11–4`);
      }
    }

    // --- Victor ---
    {
      const st = findStaff(week, "victor");
      if (st) {
        const d = ensureDay(st, iso, dayName);
        const afternoon = (d.slots || []).filter(
          (s) => keepAfternoon(s) && !isMorningDcClient(s.client_name)
        );
        d.slots = afternoon;
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "11 to 1",
          client_name: "Timi",
          instructors: "VICTOR",
          participant_info: timiInfo,
        });
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "1 to 2",
          client_name: "Fadi",
          instructors: "VICTOR",
          participant_info: fadiInfo,
        });
        d.slots.push({
          area: "Hub Room",
          venue: "SwimFarm",
          service: "Day Centre",
          pool_note: "Hub Room",
          time_slot: "2 to 4",
          client_name: "Emanuel",
          instructors: "VICTOR",
          participant_info: emInfo,
        });
        sortSlots(d);
        notes.push(`${iso} victor: Timi 11–1 · Fadi 1–2 · Emanuel 2–4`);
      }
    }
  }
}

doc.meta = doc.meta || {};
doc.meta.lastEditedAt = new Date().toISOString();
doc.meta.lastLiveFoldAt = doc.meta.lastEditedAt;
doc.meta.lastLiveFoldNote =
  "Morning Day Centre layout: Roberto Fadi special (no ACAT, no Zakariya); Youssef Emanuel 11–2; Michelle/Lulia Ikram 11–4; Victor Timi/Fadi/Emanuel";

const newRev = prevRev + 1;
const patch = await fetch(url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026", {
  headers,
  method: "PATCH",
  body: JSON.stringify({
    document: doc,
    revision: newRev,
    updated_at: new Date().toISOString(),
  }),
});
const patched = await patch.json();
if (!patch.ok) {
  console.error(patched);
  throw new Error("madre patch failed " + patch.status);
}
console.log("MADRE revision", prevRev, "→", newRev);
console.log("Changes:", notes.length);
notes.slice(0, 40).forEach((n) => console.log(" -", n));
if (notes.length > 40) console.log(" ... +" + (notes.length - 40) + " more");

// Verify crash Mon 20
const v = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers: { apikey: key, Authorization: "Bearer " + key } }
);
const vdoc = (await v.json())[0].document;
const vw = vdoc.weeks.find((w) => w.start === "2026-07-20");
const DAY = "2026-07-20";
for (const key of ["roberto", "youssef", "michelle", "lulia", "victor"]) {
  const st = findStaff(vw, key) || findStaff(vw, key === "lulia" ? "luliya" : key);
  const d = (st?.days || []).find((x) => x.sessionDate === DAY);
  console.log(
    "\n" + key,
    (d?.slots || [])
      .map((s) => s.time_slot + ":" + s.client_name + (s.segments ? "[seg]" : ""))
      .join(" | ")
  );
}
