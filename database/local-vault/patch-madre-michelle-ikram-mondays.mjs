/**
 * Fix Michelle Monday Day Centre across ALL MADRE week blocks.
 * Stale copies still had Emanuel 11–12.30 + Ikram 12.30–4; live flatten
 * merged those with the correct Ikram 11–4 and Michelle saw 3 Today cards.
 *
 * Target Mondays: 2026-06-29, 2026-07-06, 2026-07-13 (+ any later Mon still split).
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

const TARGET_ISOS = new Set([
  "2026-06-29",
  "2026-07-06",
  "2026-07-13",
  "2026-07-20",
  "2026-07-27",
]);

function isSplitMichelleMonday(slots) {
  const list = Array.isArray(slots) ? slots : [];
  const hasEm =
    list.some((s) => /emanuel/i.test(String(s.client_name || ""))) &&
    list.some((s) => {
      const t = String(s.time_slot || "").replace(/\s+/g, "").toLowerCase();
      return /emanuel/i.test(String(s.client_name || "")) &&
        (t === "11to12.30" || t === "11to12" || t === "11to12:30");
    });
  const hasIkPartial = list.some((s) => {
    if (!/ikram/i.test(String(s.client_name || ""))) return false;
    const t = String(s.time_slot || "").replace(/\s+/g, "").toLowerCase();
    return t === "12.30to4" || t === "12:30to4" || t === "12to4";
  });
  return hasEm || hasIkPartial || list.length !== 1 ||
    !list.some((s) => {
      if (!/ikram/i.test(String(s.client_name || ""))) return false;
      const t = String(s.time_slot || "").replace(/\s+/g, "").toLowerCase();
      return t === "11to4";
    });
}

function ikramSlotTemplate(from) {
  const base = from && /ikram/i.test(String(from.client_name || "")) ? from : null;
  return Object.assign({}, base || {}, {
    area: "Hub Room",
    venue: "SwimFarm",
    service: "Day Centre",
    pool_note: "Hub Room",
    time_slot: "11 to 4",
    client_name: "Ikram",
    instructors: "LULIYA, MICHELLE",
    participant_info: (base && base.participant_info) || "",
    segments: [
      { time_slot: "11 to 12", area: "Day Centre" },
      { time_slot: "12 to 1", area: "Big Pool" },
      { time_slot: "1 to 4", area: "Day Centre" },
    ],
  });
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
let fixed = 0;

(doc.weeks || []).forEach((week, wi) => {
  const staff = Object.values(week.staff || {});
  const michelle = staff.find(
    (s) => String(s.staffKey || "").toLowerCase() === "michelle"
  );
  if (!michelle) return;
  (michelle.days || []).forEach((d) => {
    const iso = String(d.sessionDate || d.session_date || "").slice(0, 10);
    if (!TARGET_ISOS.has(iso)) return;
    if (String(d.weekday || "") && String(d.weekday) !== "Monday") return;
    if (!isSplitMichelleMonday(d.slots)) {
      notes.push(`week${wi} ${iso}: already Ikram 11-4`);
      return;
    }
    const prevIk = (d.slots || []).find((s) =>
      /ikram/i.test(String(s.client_name || ""))
    );
    d.slots = [ikramSlotTemplate(prevIk)];
    fixed += 1;
    notes.push(`week${wi} ${iso}: → Ikram 11 to 4 only`);
  });
});

if (!fixed) {
  console.log("No Michelle Monday splits left to fix.");
  console.log(notes.join("\n"));
  process.exit(0);
}

const patch = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026",
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      document: doc,
      revision: prevRev + 1,
      updated_at: new Date().toISOString(),
    }),
  }
);
const body = await patch.text();
if (!patch.ok) {
  console.error(patch.status, body);
  process.exit(1);
}
console.log("OK revision", prevRev, "→", prevRev + 1, "fixed", fixed);
console.log(notes.join("\n"));

// Cancel stale dated portal_roster_rows that still assign Michelle Emanuel/Ikram splits.
const cancelIds = [
  "9f9a07fd-4cbc-48e9-b5ab-8b6cfc7b3484", // Emanuel Michelle 2026-06-29
  "821da18b-018e-44aa-b5de-b8fdef30363c", // Ikram Michelle 12-4 2026-06-29
];
const c = await fetch(
  url + `/rest/v1/portal_roster_rows?id=in.(${cancelIds.join(",")})`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    }),
  }
);
console.log("roster cancel", c.status, await c.text());
