/**
 * Cancel Ikram + Fadi Day Centre Mon 1 – Thu 4 Sep 2026.
 * Friday 5 Sep stays normal (no rows written).
 *
 *   APPLY=1 node database/local-vault/patch-ikram-fadi-cancel-sep1-4-2026.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const REVISION = "ops:2026-08-30-ikram-fadi-cancel-sep1-4";
const REASON = "Ikram + Fadi cancelled Mon 1 – Thu 4 Sep 2026 (back Fri 5 Sep)";
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1"; // Victor

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

/** Parse "11 to 4" / "12.30 to 3" → { start, end, label } */
function parseSlot(label) {
  const m = String(label || "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}(?:\.\d{1,2})?)\s*to\s*(\d{1,2}(?:\.\d{1,2})?)$/);
  if (!m) throw new Error(`Bad slot label: ${label}`);
  function toTime(tok) {
    const [h, frac] = tok.split(".");
    const hh = String(Number(h)).padStart(2, "0");
    const mm = frac ? String(Number(frac.padEnd(2, "0").slice(0, 2))).padStart(2, "0") : "00";
    // 12.30 → 12:30; 3 → 15:00 if afternoon DC (handled by callers using 24h convention)
    return `${hh}:${mm}:00`;
  }
  function to24(tok, isEnd) {
    const n = Number(tok);
    // Day Centre: 11–12.xx morning; 1–4 afternoon hours written as 1..4 not 13..16 in labels
    if (n >= 1 && n <= 7) {
      const [h, frac] = tok.split(".");
      const hour = Number(h) + 12;
      const mm = frac
        ? String(Number(frac.padEnd(2, "0").slice(0, 2))).padStart(2, "0")
        : "00";
      return `${String(hour).padStart(2, "0")}:${mm}:00`;
    }
    return toTime(tok);
  }
  return {
    label: String(label).trim(),
    start: to24(m[1], false),
    end: to24(m[2], true),
  };
}

// Autumn Day Centre board (portal_roster_canonical) — Mon–Thu only.
const DAYS = {
  "2026-09-01": [
    { staff: "michelle", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "lulia", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "victor", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "roberto", client: "fadi", name: "Fadi", time: "1 to 3" },
    { staff: "youssef", client: "fadi", name: "Fadi", time: "12.30 to 3" },
  ],
  "2026-09-02": [
    { staff: "roberto", client: "ikram", name: "Ikram", time: "11 to 12.30" },
    { staff: "michelle", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "lulia", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "victor", client: "ikram", name: "Ikram", time: "3 to 4" },
    { staff: "roberto", client: "fadi", name: "Fadi", time: "12.30 to 3" },
    { staff: "victor", client: "fadi", name: "Fadi", time: "12.30 to 3" },
  ],
  "2026-09-03": [
    { staff: "michelle", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "lulia", client: "ikram", name: "Ikram", time: "11 to 4" },
    { staff: "victor", client: "ikram", name: "Ikram", time: "3 to 4" },
    { staff: "victor", client: "fadi", name: "Fadi", time: "12.30 to 3" },
    { staff: "raul", client: "fadi", name: "Fadi", time: "12.30 to 3" },
  ],
  "2026-09-04": [
    { staff: "roberto", client: "fadi", name: "Fadi", time: "12.30 to 3" },
    { staff: "youssef", client: "fadi", name: "Fadi", time: "12.30 to 3" },
  ],
};

const STAFF_META = {
  michelle: {
    id: "4ae392bb-edd1-4aea-88bb-19eedc2a03c1",
    name: "Michelle Emma Caleb",
  },
  lulia: {
    id: "a103a7cf-5984-42c1-bde7-17cba2938c2f",
    name: "Luliya",
  },
  roberto: {
    id: "c93d7eb1-3ab0-4cdb-9a7f-562632ee8e77",
    name: "Roberto Reali",
  },
  victor: {
    id: "a0d439df-3a8f-439d-b427-b3459552eae1",
    name: "Victor",
  },
  raul: {
    id: "69bb3b02-e5f1-4e95-9334-285281d0a190",
    name: "Raul",
  },
  youssef: {
    id: "de59ac92-8ff0-44e4-94c6-884ca161dd73",
    name: "Youssef Moustafa",
  },
};

const overrideRows = [];
const cancelRows = [];

for (const [date, slots] of Object.entries(DAYS)) {
  for (const s of slots) {
    const t = parseSlot(s.time);
    const portalKey = `${date}|${t.start.slice(0, 5)}|${s.client}`;
    overrideRows.push({
      session_date: date,
      anchor_staff_id: s.staff,
      anchor_start: t.start,
      anchor_end: t.end,
      anchor_venue: "SwimFarm",
      anchor_client_id: s.client,
      anchor_time_slot_label: t.label,
      override_type: "slot_clear_client",
      payload: {
        cancelled_by_admin: true,
        client_name: s.name,
        portal_session_key: portalKey,
        feedback_resolution: "cancelled",
        term_roster_edit: true,
      },
      reason: REASON,
      status: "active",
      spreadsheet_revision: REVISION,
      created_by: ADMIN_UID,
      updated_by: ADMIN_UID,
    });
    const meta = STAFF_META[s.staff];
    cancelRows.push({
      submitted_by_user_id: meta.id,
      submitted_by_name: meta.name,
      client_name: s.name,
      session_date: date,
      session_time: t.label,
      cancellation_timing: "Before the session started",
      service: "Day Centre",
      reason_category: "Other",
      notes: REASON,
      portal_session_key: portalKey,
      origin: "term",
    });
  }
}

console.log(
  `Plan: ${overrideRows.length} schedule_overrides + ${cancelRows.length} cancellation_reports`
);
console.log(
  "Dates:",
  Object.keys(DAYS).join(", "),
  "| Fri 2026-09-05 left normal"
);
for (const row of overrideRows) {
  console.log(
    `  ${row.session_date} ${row.anchor_staff_id} · ${row.anchor_client_id} · ${row.anchor_time_slot_label} (${row.anchor_start}-${row.anchor_end})`
  );
}

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write.");
  process.exit(0);
}

// Skip duplicates
const existing = await sb(
  "GET",
  "schedule_overrides?select=session_date,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,override_type,status&status=eq.active&session_date=gte.2026-09-01&session_date=lte.2026-09-04&or=(anchor_client_id.eq.ikram,anchor_client_id.eq.fadi)&override_type=eq.slot_clear_client"
);
const existKey = new Set(
  (existing || []).map(
    (r) =>
      `${r.session_date}|${String(r.anchor_staff_id).toLowerCase()}|${String(r.anchor_client_id).toLowerCase()}|${r.anchor_start}|${r.anchor_end}`
  )
);

const toInsertOv = overrideRows.filter((r) => {
  const k = `${r.session_date}|${r.anchor_staff_id}|${r.anchor_client_id}|${r.anchor_start}|${r.anchor_end}`;
  if (existKey.has(k)) {
    console.log("skip existing override", k);
    return false;
  }
  return true;
});

if (toInsertOv.length) {
  const inserted = await sb("POST", "schedule_overrides", toInsertOv);
  console.log(`Inserted ${inserted.length} schedule_overrides`);
} else {
  console.log("No new schedule_overrides to insert");
}

const existingCr = await sb(
  "GET",
  "cancellation_reports?select=session_date,client_name,submitted_by_user_id,portal_session_key&session_date=gte.2026-09-01&session_date=lte.2026-09-04&or=(client_name.ilike.ikram,client_name.ilike.fadi)"
);
const crKey = new Set(
  (existingCr || []).map(
    (r) =>
      `${r.session_date}|${String(r.client_name).toLowerCase()}|${r.submitted_by_user_id}|${r.portal_session_key || ""}`
  )
);
const toInsertCr = cancelRows.filter((r) => {
  const k = `${r.session_date}|${r.client_name.toLowerCase()}|${r.submitted_by_user_id}|${r.portal_session_key}`;
  if (crKey.has(k)) {
    console.log("skip existing cancellation_report", k);
    return false;
  }
  return true;
});

if (toInsertCr.length) {
  const inserted = await sb("POST", "cancellation_reports", toInsertCr);
  console.log(`Inserted ${inserted.length} cancellation_reports`);
} else {
  console.log("No new cancellation_reports to insert");
}

console.log("Done.");
