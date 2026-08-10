/**
 * Fri 31 Jul: Roberto Emanuel = same SPECIAL as Mon (Hub 11–12 · Big Pool 12–1 · Hub 2–4).
 * Yaqoub 1–2 unchanged.
 *
 *   node database/local-vault/patch-madre-fri-roberto-emanuel-match-mon.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const LOCAL_MADRE = path.join(root, "working_ui/portal/roster_term_master.json");

const env = fs.readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8");
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
const FRI = "2026-07-31";
const SEGS = [
  { time_slot: "11 to 12", area: "Hub Room" },
  { time_slot: "12 to 1", area: "Big Pool" },
  { time_slot: "2 to 4", area: "Hub Room" },
];

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;
const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
);
if (!week) throw new Error("week missing");

const roberto = (week.staff || []).find(
  (s) => String(s.staffKey || "").toLowerCase() === "roberto",
);
if (!roberto) throw new Error("roberto missing");

const d = (roberto.days || []).find(
  (x) => String(x.sessionDate || "").slice(0, 10) === FRI,
);
if (!d) throw new Error("friday missing");

const info =
  (d.slots || []).find((s) => /^emanuel/i.test(String(s.client_name || "")))
    ?.participant_info || "";

d.slots = (d.slots || []).filter(
  (s) => !/^emanuel/i.test(String(s.client_name || "")),
);
d.slots.unshift({
  area: "Hub Room",
  venue: "SwimFarm",
  service: "Day Centre",
  pool_note: "Hub Room",
  time_slot: "11 to 4",
  client_name: "Emanuel",
  instructors: "ROBERTO",
  participant_info: info,
  segments: SEGS.map((s) => ({ ...s })),
});

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${nextRev}: Fri 31 — Roberto Emanuel SPECIAL match Mon (Hub 11–12 · swim 12–1 · Hub 2–4)`,
);

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
const body = await put.json();
if (!put.ok) {
  console.error(body);
  throw new Error("PATCH failed " + put.status);
}

fs.writeFileSync(LOCAL_MADRE, JSON.stringify(doc, null, 2) + "\n");
const friSlots = d.slots.map((s) => ({
  client: s.client_name,
  time: s.time_slot,
  segments: s.segments,
}));
console.log(JSON.stringify({ prevRev, nextRev, friSlots }, null, 2));
