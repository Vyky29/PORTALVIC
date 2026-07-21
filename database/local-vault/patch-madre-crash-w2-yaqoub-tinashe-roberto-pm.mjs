/**
 * MADRE summer-2026 week Mon 27 – Fri 31 Jul 2026:
 *   Mon/Wed/Fri (27, 29, 31):
 *     Roberto: Yaqoub Aquatic 12–1 (SwimFarm) · Fadi Day Centre 1–3
 *     Raul: Tinashe Aquatic 1–1.30 (SwimFarm)
 *     Roberto PM Acton: Saaib 4.30–5 · Adam P 5–6.30
 *
 *   node database/local-vault/patch-madre-crash-w2-yaqoub-tinashe-roberto-pm.mjs
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

const WEEK_START = "2026-07-27";
const CRASH_DAYS = ["2026-07-27", "2026-07-29", "2026-07-31"];
const WD = {
  "2026-07-27": "Monday",
  "2026-07-28": "Tuesday",
  "2026-07-29": "Wednesday",
  "2026-07-30": "Thursday",
  "2026-07-31": "Friday",
};

function findStaff(week, key) {
  const want = String(key).toLowerCase();
  return (week.staff || []).find(
    (s) => String(s.staffKey || "").toLowerCase() === want,
  );
}

function ensureDay(st, iso) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) return d;
  d = { weekday: WD[iso], sessionDate: iso, slots: [] };
  st.days.push(d);
  return d;
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

function startMinutes(timeSlot) {
  const m = String(timeSlot || "")
    .toLowerCase()
    .match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 7) h += 12;
  return h * 60 + mi;
}

function keepOtherAfternoon(slot) {
  const n = String(slot.client_name || "").trim().toLowerCase();
  if (/^(saaib|adam\s*p|adam\s*pi|adam\s*pilcher)$/i.test(n)) return false;
  const mins = startMinutes(slot.time_slot);
  return mins == null || mins >= 15 * 60;
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

function infoFromClientsCsv(nameRe) {
  try {
    const raw = fs.readFileSync(
      "/Users/victor/cursor/PORTALVIC/database/clients_info_machine.csv",
      "utf8",
    );
    const lines = raw.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const name = line.split(",").pop()?.replace(/^"|"$/g, "").trim() || "";
      if (nameRe.test(name)) {
        const q = line.match(/^"([\s\S]*)",[^,]*$/);
        return q ? q[1].replace(/""/g, '"') : "";
      }
    }
  } catch (_) {}
  return "";
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;
const notes = [];

const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!week) throw new Error("week missing " + WEEK_START);

const fadiInfo = infoFromDoc(doc, /^fadi$/i);
const tinasheInfo =
  infoFromDoc(doc, /^tinashe$/i) || infoFromClientsCsv(/^tinashe$/i);
const yaqoubInfo =
  infoFromDoc(doc, /^yaqoub$/i) || infoFromClientsCsv(/^yaqoub$/i);
const saaibInfo =
  infoFromDoc(doc, /^saaib$/i) || infoFromClientsCsv(/^saaib$/i);
const adamInfo =
  infoFromDoc(doc, /^adam\s*p/i) || infoFromClientsCsv(/^adam\s*p/i);

const roberto = findStaff(week, "roberto");
const raul = findStaff(week, "raul");
if (!roberto) throw new Error("roberto missing");
if (!raul) throw new Error("raul missing");

let alreadyOk = true;
for (const iso of CRASH_DAYS) {
  const rd = (roberto.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  const hasYaq = (rd?.slots || []).some(
    (s) =>
      /^yaqoub$/i.test(String(s.client_name || "")) &&
      /^12\s*to\s*1$/i.test(String(s.time_slot || "").replace(/\./g, "")),
  );
  const hasSaaib = (rd?.slots || []).some(
    (s) =>
      /^saaib$/i.test(String(s.client_name || "")) &&
      /4\.?30\s*to\s*5/i.test(String(s.time_slot || "")),
  );
  const hasAdam = (rd?.slots || []).some(
    (s) =>
      /^adam\s*p/i.test(String(s.client_name || "")) &&
      /^5\s*to\s*6\.?30/i.test(String(s.time_slot || "")),
  );
  const rad = (raul.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  const hasTin = (rad?.slots || []).some(
    (s) =>
      /^tinashe$/i.test(String(s.client_name || "")) &&
      /^1\s*to\s*1\.?30/i.test(String(s.time_slot || "")),
  );
  if (!hasYaq || !hasSaaib || !hasAdam || !hasTin) alreadyOk = false;
}
if (alreadyOk) {
  console.log("noop — already applied", { revision: prevRev });
  process.exit(0);
}

for (const iso of CRASH_DAYS) {
  const d = ensureDay(roberto, iso);
  const keep = (d.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^(fadi|yaqoub|saaib|adam\s*p|adam\s*pi|adam\s*pilcher)$/i.test(n)) {
      return false;
    }
    return keepOtherAfternoon(s);
  });
  d.slots = [
    ...keep,
    {
      area: "Big Pool",
      venue: "SwimFarm",
      service: "Aquatic Activity",
      pool_note: "Big Pool",
      time_slot: "12 to 1",
      client_name: "Yaqoub",
      instructors: "ROBERTO",
      participant_info: yaqoubInfo,
    },
    {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "1 to 3",
      client_name: "Fadi",
      instructors: "ROBERTO",
      participant_info: fadiInfo,
    },
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "4.30 to 5",
      client_name: "Saaib",
      instructors: "ROBERTO",
      participant_info: saaibInfo,
    },
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "5 to 6.30",
      client_name: "Adam P",
      instructors: "ROBERTO",
      participant_info: adamInfo,
    },
  ];
  sortSlots(d);
  notes.push(
    `${iso} roberto: Yaqoub 12–1 · Fadi 1–3 · Saaib 4.30–5 Acton · Adam P 5–6.30 Acton`,
  );
}

for (const iso of CRASH_DAYS) {
  const d = ensureDay(raul, iso);
  /* Drop HOME/CASA placeholders and any prior Tinashe on these crash days. */
  d.slots = (d.slots || []).filter((s) => {
    const n = String(s.client_name || "").trim().toLowerCase();
    if (/^(tinashe|casa|home)$/i.test(n)) return false;
    /* Mon Emanuel block that covers 1–1.30 conflicts with Tinashe swim. */
    if (
      /^emanuel/i.test(n) &&
      /12\.?30\s*to\s*4/i.test(String(s.time_slot || ""))
    ) {
      return false;
    }
    /* Fri full-day HOME already removed via casa/home. */
    if (/^manager$/i.test(n) && iso === "2026-07-29") {
      /* Keep manager around Tinashe: split later. */
      return false;
    }
    return true;
  });

  if (iso === "2026-07-29") {
    d.slots.push({
      area: "Hub · Manager",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub · Manager",
      time_slot: "11 to 1",
      client_name: "MANAGER",
      instructors: "RAUL",
      participant_info: "",
    });
    d.slots.push({
      area: "Hub · Manager",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub · Manager",
      time_slot: "1.30 to 4",
      client_name: "MANAGER",
      instructors: "RAUL",
      participant_info: "",
    });
  }

  d.slots.push({
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 1.30",
    client_name: "Tinashe",
    instructors: "RAUL",
    participant_info: tinasheInfo,
  });
  sortSlots(d);
  notes.push(`${iso} raul: Tinashe Aquatic 1–1.30`);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Crash W2 Mon/Wed/Fri — Yaqoub 12–1 Roberto, Tinashe 1–1.30 Raul, Roberto Acton Saaib 4.30–5 + Adam P 5–6.30`,
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
console.log({ prevRev, nextRev: out[0].revision, notes });
