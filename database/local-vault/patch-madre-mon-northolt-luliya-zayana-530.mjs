/**
 * Monday Northolt: Luliya 5.30–6 → Zayana (Autumn keep; was Dan in summer).
 *
 *   node database/local-vault/patch-madre-mon-northolt-luliya-zayana-530.mjs
 */
import fs from "fs";
import vm from "vm";

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
const AQ = "Aquatic Activity";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeKey(t) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".");
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

function covers530(t) {
  return startMin(t) < 18 * 60 && endMin(t) > 17 * 60 + 30;
}

function isNortholtAquatic(slot) {
  if (!/northolt/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  return true;
}

function findStaff(week, keys) {
  const want = keys.map((k) => String(k).toLowerCase());
  return Object.entries(week.staff || {}).find(([k, s]) => {
    if (!s) return false;
    const sk = String(s.staffKey || k || "").toLowerCase();
    return want.includes(sk);
  })?.[1];
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function loadZayanaInfo() {
  const paths = [
    "working_ui/portal/clients_info_embed.js",
    "working_ui/clients_info_embed.js",
    "database/local-vault/tmp/asset-check/clients_info_embed.js",
  ];
  for (const p of paths) {
    try {
      const ctx = { window: {} };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(p, "utf8"), ctx);
      const rows =
        ctx.window.PORTAL_CLIENTS_INFO_ROWS ||
        ctx.PORTAL_CLIENTS_INFO_ROWS ||
        [];
      const z = rows.find((r) => /zayana/i.test(String(r.client_name || "")));
      if (z && z.client_info) return String(z.client_info);
    } catch {
      /* try next */
    }
  }
  return "";
}

function patchWeek(week, zInfo) {
  const luliya = findStaff(week, ["luliya", "lulia"]);
  if (!luliya) return null;
  const log = [];
  for (const day of luliya.days || []) {
    if (norm(day.weekday) !== "Monday") continue;
    const iso = norm(day.sessionDate).slice(0, 10);
    if (!iso) continue;
    const northolt = (day.slots || []).filter(isNortholtAquatic);
    if (!northolt.length) continue;

    let hit = null;
    day.slots = (day.slots || []).filter((s) => {
      if (!isNortholtAquatic(s)) return true;
      const t = timeKey(s.time_slot);
      // Only remove exact 5.30–6 slices (not Gemma 5–5.30 or Yamik 6–6.30).
      if (/^5\.30\s*to\s*6(\.00)?$/.test(t) || /^17\.30\s*to\s*18(\.00)?$/.test(t)) {
        hit = s;
        return false;
      }
      return true;
    });

    day.slots.push({
      client_name: "Zayana",
      time_slot: "5.30 to 6",
      service: AQ,
      venue: "Northolt",
      area: hit?.area || "Teaching Pool",
      pool_note: hit?.pool_note || "",
      instructors: "LULIYA",
      participant_info: zInfo || hit?.participant_info || "",
    });
    sortSlots(day);
    log.push(`${iso} Luliya 5.30–6 → Zayana${hit ? ` (was ${hit.client_name})` : " (added)"}`);
  }
  return log.length
    ? { week: `${week.start || "?"}–${week.end || "?"}`, log }
    : null;
}

const zInfo = loadZayanaInfo();
console.log("zayana info chars", zInfo.length);

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
  const s = patchWeek(week, zInfo);
  if (s) summaries.push(s);
}

if (!summaries.length) {
  console.log("Nothing to patch.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Mon Northolt Luliya 5.30–6 → Zayana (Autumn keep)`,
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

const w = (doc.weeks || []).find((x) =>
  String(x.start || "").startsWith("2026-07-13"),
);
const st = findStaff(w || {}, ["luliya", "lulia"]);
for (const day of st?.days || []) {
  if (String(day.sessionDate || "").slice(0, 10) !== "2026-07-13") continue;
  for (const s of day.slots || []) {
    if (!/northolt/i.test(String(s.venue || ""))) continue;
    console.log("luliya", s.time_slot, s.client_name);
  }
}

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      days: summaries.flatMap((s) => s.log),
    },
    null,
    2,
  ),
);
