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

async function get(qs) {
  const r = await fetch(`${url}/rest/v1/${qs}`, { headers: h });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 600)}`);
  return j;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSunMulti1230(row) {
  const day = norm(row.day || row.dayName || row.day_label);
  const venue = norm(row.venue);
  const time = norm(row.time_slot || row.timeSlot || row.time_label || row.time);
  const svc = norm(row.service || row.service_name || row.serviceType);
  if (!day.includes("sun")) return false;
  if (!venue.includes("swimfarm")) return false;
  if (!(svc.includes("multi") || time.includes("multi"))) return false;
  return time.includes("12.30") || time.includes("12:30");
}

console.log("=== Erik invoices (contact 176) ===");
const inv = await get(
  "portal_parent_invoice_share?select=invoice_number,payment_status,amount_paid_gbp,share_status,created_at,line_description,billing_term,ready_by,notes&contact_id=eq.176&order=created_at.desc&limit=10",
);
console.log(JSON.stringify(inv, null, 2));

console.log("\n=== Erik reenrol submissions ===");
try {
  const reen = await get(
    "portal_reenrol_submissions?select=id,status,created_at,updated_at,meta&contact_id=eq.176&order=created_at.desc&limit=5",
  );
  console.log(JSON.stringify(reen, null, 2));
} catch (e) {
  console.log("reenrol err:", e.message);
}

console.log("\n=== MADRE autumn doc ===");
const madreRows = await get(
  "portal_madre_document?select=term_key,revision,updated_at,document&order=updated_at.desc&limit=10",
);
for (const m of madreRows) {
  console.log(m.term_key, "rev", m.revision, m.updated_at);
}

const autumn =
  madreRows.find((m) => /autumn|2627|2026-27/i.test(String(m.term_key))) || madreRows[0];
const doc = autumn?.document || {};

console.log("\n=== Erik in MADRE? ===");
const erikHits = [];
function walk(obj, trail) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${trail}[${i}]`));
    return;
  }
  const blob = JSON.stringify(obj);
  if (/erik|ndregjoni/i.test(blob)) erikHits.push({ trail, obj });
  for (const [k, v] of Object.entries(obj)) walk(v, trail ? `${trail}.${k}` : k);
}
walk(doc, "");
console.log(
  erikHits.slice(0, 5).map((x) => ({
    trail: x.trail,
    preview: JSON.stringify(x.obj).slice(0, 300),
  })),
);

console.log("\n=== Sun Multi 12.30 SwimFarm clients in MADRE ===");
const sunClients = new Map();
function collectClients(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach(collectClients);
    return;
  }
  const name = obj.client_name || obj.clientName || obj.name;
  if (name && isSunMulti1230(obj)) {
    sunClients.set(String(name).trim(), obj);
  }
  for (const v of Object.values(obj)) collectClients(v);
}
collectClients(doc);
console.log([...sunClients.keys()].sort().join("\n") || "(none matched)");

console.log("\n=== portal_roster_rows Erik ever Sun 12.30 ===");
const erikRows = await get(
  "portal_roster_rows?select=session_date,client_name,time_slot,status,service,venue,day&or=(client_name.ilike.*Erik*,client_name.ilike.*Ndregjoni*)&day=eq.Sunday&order=session_date.desc&limit=20",
);
console.log(JSON.stringify(erikRows, null, 2));

console.log("\n=== Recent Sun 12.30 SwimFarm roster rows ===");
const sunRows = await get(
  "portal_roster_rows?select=session_date,client_name,time_slot,status,service,venue&day=eq.Sunday&venue=ilike.*SwimFarm*&time_slot=ilike.*12.30*&order=session_date.desc&limit=40",
);
const byClient = {};
for (const r of sunRows || []) {
  byClient[r.client_name] = byClient[r.client_name] || r;
}
console.log(Object.keys(byClient).sort().join(", ") || "(none)");

console.log("\n=== booking reservations Sun SwimFarm ===");
const res = await get(
  "portal_booking_slot_reservations?select=participant_name,parent_name,status,service_name,venue,day_label,time_label,notes,created_at&venue=ilike.*SwimFarm*&day_label=ilike.*Sun*&order=created_at.desc&limit=30",
);
for (const r of res || []) {
  if (/12\.?30|12:30/i.test(String(r.time_label || ""))) {
    console.log(r.participant_name, "|", r.parent_name, "|", r.status, "|", r.time_label, "|", r.notes);
  }
}
