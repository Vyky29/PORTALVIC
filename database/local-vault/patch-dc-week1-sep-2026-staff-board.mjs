/**
 * Day Centre staff dashboards — Tue 1 → Fri 4 Sep 2026.
 * Replaces active Day Centre portal_roster_rows for those dates from
 * AUTUMN_DAY_CENTRE_BOARD (standing Autumn DC, incl. Michelle Tue Manager,
 * Victor Wed Emanuel, Fri Victor/Raul end 15:00).
 *
 * Mon 31 Aug 2026 = closed (bank holiday) — not written.
 *
 *   APPLY=1 node database/local-vault/patch-dc-week1-sep-2026-staff-board.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1";

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(ROOT, "local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL || process.env.PORTAL_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL / service role key");

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function sb(method, pathQs, body) {
  const r = await fetch(`${url}/rest/v1/${pathQs}`, {
    method,
    headers:
      method === "GET"
        ? { apikey: key, Authorization: `Bearer ${key}` }
        : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${method} ${pathQs} → ${r.status}: ${text}`);
  return data;
}

function row(date, day, staff, client, time, area) {
  return {
    session_date: date,
    day,
    venue: "SwimFarm",
    service: "Day Centre",
    area: area || (String(client).toLowerCase() === "manager" ? "Hub · Manager" : "Hub Room"),
    instructors: staff,
    client_name: client,
    time_slot: time,
    status: "active",
    created_by: ADMIN_UID,
    updated_by: ADMIN_UID,
  };
}

/** Week of first teaching days after BH Mon 31 Aug — matches AUTUMN_DAY_CENTRE_BOARD. */
const DATES = [
  { date: "2026-09-01", day: "Tuesday", key: "tuesday" },
  { date: "2026-09-02", day: "Wednesday", key: "wednesday" },
  { date: "2026-09-03", day: "Thursday", key: "thursday" },
  { date: "2026-09-04", day: "Friday", key: "friday" },
];

/** Mirror of working_ui/portal/portal_roster_canonical.js AUTUMN_DAY_CENTRE_BOARD (DC only). */
const BOARD = {
  tuesday: [
    {
      staff: "ROBERTO",
      clients: [
        { name: "Ikram", time: "11 to 12.30" },
        { name: "Fadi", time: "12.30 to 3" },
      ],
    },
    {
      staff: "MICHELLE",
      clients: [
        { name: "Manager", time: "11 to 12.30" },
        { name: "Ikram", time: "12.30 to 4" },
      ],
    },
    { staff: "LULIYA", clients: [{ name: "Ikram", time: "11 to 3" }] },
    {
      staff: "VICTOR",
      clients: [
        { name: "Fadi", time: "12.30 to 3" },
        { name: "Ikram", time: "3 to 4" },
      ],
    },
    /* Raul OFF Tue; Youssef no DC */
  ],
  wednesday: [
    {
      staff: "ROBERTO",
      clients: [
        { name: "Emanuel", time: "11 to 12.30" },
        { name: "Fadi", time: "12.30 to 3" },
      ],
    },
    { staff: "MICHELLE", clients: [{ name: "Ikram", time: "11 to 4" }] },
    { staff: "LULIYA", clients: [{ name: "Ikram", time: "11 to 3" }] },
    {
      staff: "VICTOR",
      clients: [
        { name: "Emanuel", time: "12.30 to 3" },
        { name: "Ikram", time: "3 to 4" },
      ],
    },
    {
      staff: "RAUL",
      clients: [
        { name: "Fadi", time: "12.30 to 3" },
        { name: "Emanuel", time: "3 to 4" },
      ],
    },
  ],
  thursday: [
    { staff: "ROBERTO", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
    { staff: "YOUSSEF", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
  ],
  friday: [
    {
      staff: "ROBERTO",
      clients: [
        { name: "Emanuel", time: "11 to 1" },
        { name: "Fadi", time: "1 to 3" },
      ],
    },
    { staff: "MICHELLE", clients: [{ name: "Ikram", time: "11 to 4" }] },
    { staff: "LULIYA", clients: [{ name: "Ikram", time: "11 to 4" }] },
    {
      staff: "VICTOR",
      clients: [
        { name: "Timi", time: "11 to 1" },
        { name: "Emanuel", time: "1 to 3" },
      ],
    },
    {
      staff: "RAUL",
      clients: [
        { name: "Timi", time: "11 to 1" },
        { name: "Emanuel", time: "1 to 3" },
      ],
    },
    {
      staff: "YOUSSEF",
      clients: [
        { name: "Fadi", time: "12.30 to 3" },
        { name: "Emanuel", time: "3 to 4" },
      ],
    },
  ],
};

const WANT = [];
for (const d of DATES) {
  for (const col of BOARD[d.key] || []) {
    for (const c of col.clients || []) {
      WANT.push(row(d.date, d.day, col.staff, c.name, c.time));
    }
  }
}

console.log("DC instructor dashboards — Tue 1 → Fri 4 Sep 2026:");
for (const r of WANT) {
  console.log(
    `  ${r.session_date} ${r.instructors} · ${r.client_name} · ${r.time_slot}`
  );
}
console.log(`Total rows: ${WANT.length}`);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write.");
  process.exit(0);
}

const dateList = DATES.map((d) => d.date).join(",");
const existing = await sb(
  "GET",
  `portal_roster_rows?select=id&session_date=in.(${dateList})&status=eq.active&service=eq.Day Centre`
);
for (const r of existing || []) {
  await sb("DELETE", `portal_roster_rows?id=eq.${r.id}`);
}
console.log(`Cleared ${(existing || []).length} old DC rows.`);

const inserted = await sb("POST", "portal_roster_rows", WANT);
console.log(`Inserted ${inserted.length} DC rows for instructor dashboards. Done.`);
