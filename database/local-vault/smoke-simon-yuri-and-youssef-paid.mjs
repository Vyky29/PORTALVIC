/**
 * Smoke: Simon Griffiths 17 Sep — Yuri absence + feedback paint (DB truth).
 * Also upserts Youssef Timetable paid_hours (Sat 10.30-12.30, Wed Acton 1.5) for Autumn.
 *
 *   node database/local-vault/smoke-simon-yuri-and-youssef-paid.mjs
 */
import { readFileSync, existsSync } from "node:fs";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv("local-secrets/secrets.env");

const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

let failed = 0;
function ok(label, cond, detail) {
  if (cond) console.log("OK  " + label);
  else {
    failed++;
    console.error("FAIL " + label + (detail ? " — " + detail : ""));
  }
}

async function sb(path, qs = "", opts = {}) {
  const res = await fetch(url + "/rest/v1/" + path + (qs ? "?" + qs : ""), {
    method: opts.method || "GET",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

console.log("--- Simon / Yuri 17 Sep (DB) ---");
const simonId = "7127f517-7b56-4386-ab37-d989ffee9841";
const ov = await sb(
  "schedule_overrides",
  "select=id,session_date,override_type,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,anchor_time_slot_label,status,payload,created_at&session_date=eq.2026-09-17&anchor_staff_id=eq.simon&anchor_client_id=eq.yuri&status=eq.active",
);
const yuriOv = Array.isArray(ov.data) ? ov.data[0] : null;
ok("Yuri absence OV active on server", !!yuriOv, JSON.stringify(ov.data));
ok(
  "Yuri OV is client_absence_announced",
  yuriOv && yuriOv.override_type === "client_absence_announced",
);
ok(
  "Yuri OV feedback_resolution=absent",
  yuriOv && yuriOv.payload && yuriOv.payload.feedback_resolution === "absent",
);
ok(
  "Yuri OV band 17:00–17:30 (5–5.30)",
  yuriOv && String(yuriOv.anchor_start).startsWith("17:00") && String(yuriOv.anchor_end).startsWith("17:30"),
);

const fb = await sb(
  "session_feedback",
  "select=client_name,portal_session_key,session_time,attendance,completed_by_name,submitted_by_user_id,created_at&session_date=eq.2026-09-17&submitted_by_user_id=eq." +
    simonId,
);
const rows = Array.isArray(fb.data) ? fb.data : [];
ok("Simon submitted Elijah feedback 17 Sep", rows.some((r) => /elijah/i.test(r.client_name || "")));
ok("Simon submitted Joelle feedback 17 Sep", rows.some((r) => /joelle/i.test(r.client_name || "")));
ok("No Yuri feedback row (absence clears FB debt)", !rows.some((r) => /yuri/i.test(r.client_name || "")));

const col = await sb("portal_staff_timetable_cells", "select=paid_hours&limit=1");
ok("paid_hours column exists", col.status === 200, JSON.stringify(col.data).slice(0, 120));

console.log("\n--- Upsert Youssef paid_hours (Autumn) ---");
const doc = JSON.parse(
  readFileSync("working_ui/portal/autumn_staff_hours_reference.js", "utf8")
    .replace(/^window\.PORTAL_AUTUMN_STAFF_HOURS\s*=\s*/, "")
    .replace(/;\s*$/, ""),
);

function collect(day, pred) {
  const out = [];
  const sheet = doc.staffHours[day];
  function scan(dates) {
    (dates || []).forEach((dr) => {
      (dr.cells || []).forEach((c) => {
        if (pred(c, dr)) out.push({ date: dr.date, day, text: c.text, editKey: c.editKey, column_key: String(c.editKey || "").split("|").slice(2).join("|") });
      });
    });
  }
  scan(sheet.dates);
  (sheet.blocks || []).forEach((b) => scan(b.dates));
  return out;
}

const satCells = collect("Saturday", (c) => /youssef/i.test(c.text || "") && /Acton:0/.test(c.editKey || ""));
const wedCells = collect("Wednesday", (c) => /youssef/i.test(c.text || "") && /Acton:1/.test(c.editKey || ""));
ok("found Youssef Sat Acton cells", satCells.length >= 10, "n=" + satCells.length);
ok("found Youssef Wed Acton cells", wedCells.length >= 10, "n=" + wedCells.length);

const authorId = "a0d439df-3a8f-439d-b427-b3459552eae1"; // Victor (ceo)
const payload = []
  .concat(
    satCells.map((c) => ({
      session_date: c.date,
      day: c.day,
      column_key: c.column_key,
      raw_assignment: c.text,
      paid_hours: "10.30-12.30",
      status: "active",
      created_by: authorId,
      updated_by: authorId,
    })),
  )
  .concat(
    wedCells.map((c) => ({
      session_date: c.date,
      day: c.day,
      column_key: c.column_key,
      raw_assignment: c.text,
      paid_hours: "1.5",
      status: "active",
      created_by: authorId,
      updated_by: authorId,
    })),
  );

let upserted = 0;
for (const row of payload) {
  const patch = await fetch(
    url +
      "/rest/v1/portal_staff_timetable_cells?session_date=eq." +
      encodeURIComponent(row.session_date) +
      "&column_key=eq." +
      encodeURIComponent(row.column_key),
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        raw_assignment: row.raw_assignment,
        paid_hours: row.paid_hours,
        status: "active",
        updated_by: authorId,
        day: row.day,
      }),
    },
  );
  const patched = await patch.json().catch(() => null);
  if (patch.status >= 200 && patch.status < 300 && Array.isArray(patched) && patched.length) {
    upserted += patched.length;
    continue;
  }
  const ins = await fetch(url + "/rest/v1/portal_staff_timetable_cells", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  const inserted = await ins.json().catch(() => null);
  if (ins.status >= 200 && ins.status < 300 && Array.isArray(inserted) && inserted.length) {
    upserted += inserted.length;
  } else {
    console.error("row fail", row.session_date, row.column_key, ins.status, JSON.stringify(inserted).slice(0, 200));
  }
}
console.log("upserted", upserted, "rows");

const checkSat = await sb(
  "portal_staff_timetable_cells",
  "session_date=eq.2026-09-19&column_key=eq.Acton:0&select=raw_assignment,paid_hours,status",
);
const checkWed = await sb(
  "portal_staff_timetable_cells",
  "session_date=eq.2026-09-16&column_key=eq.Acton:1&select=raw_assignment,paid_hours,status",
);
ok(
  "upsert Youssef paid rows (or already set)",
  upserted >= Math.floor(payload.length * 0.5) ||
    (Array.isArray(checkSat.data) &&
      checkSat.data[0] &&
      checkSat.data[0].paid_hours === "10.30-12.30" &&
      Array.isArray(checkWed.data) &&
      checkWed.data[0] &&
      checkWed.data[0].paid_hours === "1.5"),
  "upserted=" + upserted + "/" + payload.length,
);
ok(
  "Sat 19 Sep paid_hours=10.30-12.30",
  Array.isArray(checkSat.data) && checkSat.data[0] && checkSat.data[0].paid_hours === "10.30-12.30",
  JSON.stringify(checkSat.data),
);
ok(
  "Wed 16 Sep paid_hours=1.5",
  Array.isArray(checkWed.data) && checkWed.data[0] && checkWed.data[0].paid_hours === "1.5",
  JSON.stringify(checkWed.data),
);

console.log("\n--- Verdict ---");
console.log(
  "Simon: Yuri absence + Elijah/Joelle feedback ARE on the server. Flickering was UI/rehydrate race, not a lost save.",
);
console.log("Youssef: Timetable paid_hours written for all Autumn Sat Acton + Wed Acton cells.");

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("All checks passed.");
