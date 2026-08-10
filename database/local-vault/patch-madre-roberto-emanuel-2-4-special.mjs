/**
 * Roberto Emanuel 2–4 Hub Room → SPECIAL card (segments) Mon + Wed.
 *
 *   node database/local-vault/patch-madre-roberto-emanuel-2-4-special.mjs
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
const DAYS = ["2026-07-27", "2026-07-29"]; // Mon + Wed

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

const summary = {};
for (const iso of DAYS) {
  const d = (roberto.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  if (!d) throw new Error("day missing " + iso);
  let hit = (d.slots || []).find(
    (s) =>
      /^emanuel/i.test(String(s.client_name || "")) &&
      /2\s*to\s*4/i.test(String(s.time_slot || "")),
  );
  if (!hit) {
    // restore slot if missing
    const info =
      (d.slots || []).find((s) => /^emanuel/i.test(String(s.client_name || "")))
        ?.participant_info || "";
    hit = {
      area: "Hub Room",
      venue: "SwimFarm",
      service: "Day Centre",
      pool_note: "Hub Room",
      time_slot: "2 to 4",
      client_name: "Emanuel",
      instructors: "ROBERTO",
      participant_info: info,
    };
    d.slots.push(hit);
  }
  hit.area = "Hub Room";
  hit.venue = "SwimFarm";
  hit.service = "Day Centre";
  hit.pool_note = "Hub Room";
  hit.time_slot = "2 to 4";
  hit.client_name = "Emanuel";
  hit.instructors = "ROBERTO";
  hit.segments = [{ time_slot: "2 to 4", area: "Hub Room" }];
  summary[iso] = {
    time_slot: hit.time_slot,
    client: hit.client_name,
    area: hit.area,
    segments: hit.segments,
  };
}

const nextRev = prevRev + 1;
doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${nextRev}: Roberto Emanuel 2–4 Hub Room SPECIAL card (segments) Mon+Wed`,
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
console.log(JSON.stringify({ prevRev, nextRev, summary }, null, 2));
