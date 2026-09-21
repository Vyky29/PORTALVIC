import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(ROOT, "local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}` };

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function clientKind(clientName) {
  const up = norm(clientName).toUpperCase();
  if (!up) return "skip";
  if (["CLOSED", "NO CLIENT", "CASA", "HOME", "MANAGER", "OFF"].includes(up)) return "skip";
  if (["NO PARTICIPANT", "NOPARTICIPANT", "OPEN", "AVAILABLE", "FREE"].includes(up)) {
    return "open";
  }
  return "booked";
}

function clientKey(clientName) {
  return norm(clientName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toMinutes(h, m, ampm) {
  let hh = h;
  const ap = String(ampm || "").toLowerCase();
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  if (!ap && hh >= 1 && hh <= 8) hh += 12;
  return hh * 60 + m;
}

function parseTimeSlot(raw) {
  const s = norm(raw);
  const range = s.match(
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i,
  );
  if (!range) return { sortTime: "00:00", timeLabel: s, startMin: 0, endMin: 0 };
  const a = toMinutes(Number(range[1]), Number(range[2] || 0), range[3]);
  const b = toMinutes(Number(range[4]), Number(range[5] || 0), range[6] || range[3]);
  const h24 = Math.floor(a / 60);
  const m = a % 60;
  return {
    sortTime: `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    timeLabel: s,
    startMin: a,
    endMin: b,
  };
}

function slotMidMinutes(startMin, endMin) {
  if (!endMin || endMin <= startMin) return startMin + 30;
  return (startMin + endMin) / 2;
}

const CRASH = new Set();
for (let d = 20; d <= 31; d++) CRASH.add(`2026-07-${String(d).padStart(2, "0")}`);

const madre = (
  await fetch(`${url}/rest/v1/portal_madre_document?select=document&term_key=eq.summer-2026`, {
    headers: h,
  }).then((r) => r.json())
)[0].document;

const rows = [];
for (const w of madre.weeks || []) {
  const weekStart = norm(w.start).slice(0, 10);
  const weekEnd = norm(w.end).slice(0, 10);
  for (const st of w.staff || []) {
    if (!st) continue;
    const staffName = norm(st.staffName ?? st.staffKey).toUpperCase();
    for (const d of st.days || []) {
      if (!d) continue;
      const iso = norm(d.sessionDate).slice(0, 10);
      if (iso && weekStart && weekEnd && !(weekStart <= iso && iso <= weekEnd)) continue;
      for (const s of d.slots || []) {
        if (!s) continue;
        const cn = norm(s.client_name);
        const up = cn.toUpperCase();
        if (!cn || up === "CASA" || up === "MANAGER") continue;
        rows.push({
          client_name: cn,
          day: d.weekday,
          instructors: staffName,
          service: norm(s.service),
          time_slot: norm(s.time_slot),
          venue: norm(s.venue || "SwimFarm"),
          session_date: d.sessionDate,
        });
      }
    }
  }
}

const byKey = new Map();
const latestBySvd = new Map();

for (const row of rows) {
  if (!/multi/i.test(row.service)) continue;
  if (!/swimfarm/i.test(row.venue)) continue;
  if (!/sun/i.test(norm(row.day))) continue;
  const kind = clientKind(row.client_name);
  if (kind === "skip") continue;
  const { sortTime, timeLabel, startMin, endMin } = parseTimeSlot(row.time_slot);
  const iso = norm(row.session_date).slice(0, 10);
  if (!iso || CRASH.has(iso)) continue;

  const svd = `multi|SwimFarm|Sunday`;
  const prevMax = latestBySvd.get(svd);
  if (!prevMax || iso > prevMax) latestBySvd.set(svd, iso);

  const key = `multi|SwimFarm|Sunday|${sortTime}|${timeLabel}`;
  let dateMap = byKey.get(key);
  if (!dateMap) {
    dateMap = new Map();
    byKey.set(key, dateMap);
  }
  let bucket = dateMap.get(iso);
  if (!bucket) {
    bucket = { booked: 0, open: 0, instructors: new Set(), bookedKeys: new Set() };
    dateMap.set(iso, bucket);
  }
  if (norm(row.instructors)) bucket.instructors.add(norm(row.instructors));
  if (kind === "booked") {
    bucket.booked += 1;
    const k = clientKey(row.client_name);
    if (k) bucket.bookedKeys.add(k);
  } else {
    bucket.open += 1;
  }
}

const sunSwim = [];
for (const [key, dateMap] of byKey.entries()) {
  const dates = [...dateMap.keys()].sort();
  if (!dates.length) continue;
  const ref = dates[dates.length - 1];
  const svdLatest = latestBySvd.get("multi|SwimFarm|Sunday") || ref;
  if (ref < svdLatest) continue;
  const bucket = dateMap.get(ref);
  const parts = key.split("|");
  const timeLabel = parts[4];
  const sortTime = parts[3];
  const { startMin, endMin } = parseTimeSlot(timeLabel.replace(/ – /g, " to "));
  sunSwim.push({
    key,
    sortTime,
    timeLabel,
    ref,
    taken: Math.min(bucket.bookedKeys.size || bucket.booked, 6),
    bookedKeys: [...bucket.bookedKeys],
    open: bucket.open,
    booked: bucket.booked,
    mid: slotMidMinutes(startMin, endMin),
  });
}

sunSwim.sort((a, b) => a.mid - b.mid);
const ref = sunSwim.map((s) => s.ref).sort().pop();
console.log("Latest Sunday ref:", ref);

const bands = [
  { label: "9.30 – 11.00", min: 0, max: 660 },
  { label: "11.00 – 12.30", min: 660, max: 750 },
  { label: "12.30 – 2.00", min: 750, max: 9999 },
];

for (const band of bands) {
  const parts = sunSwim.filter((s) => s.mid >= band.min && s.mid < band.max && s.ref === ref);
  const keys = new Set();
  for (const p of parts) for (const k of p.bookedKeys) keys.add(k);
  const fragMax = Math.max(0, ...parts.map((s) => s.taken));
  const fragSum = parts.reduce((n, s) => n + s.taken, 0);
  const uniqueTaken = keys.size;
  const taken = Math.min(6, uniqueTaken > 0 ? uniqueTaken : Math.max(fragMax, Math.min(6, fragSum)));
  console.log(`\n=== ${band.label} ===`);
  console.log("uniqueTaken", uniqueTaken, "taken", taken, "fragMax", fragMax, "fragSum", fragSum);
  console.log("keys:", [...keys].sort().join(", "));
  for (const p of parts) {
    console.log(" ", p.timeLabel, "| taken", p.taken, "| keys", p.bookedKeys.join(", "));
  }
}
