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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 300)}`);
  return j;
}

console.log("=== Kabir reservations ===");
const rows = await get("portal_booking_slot_reservations?select=*&or=(participant_name.ilike.*Kabir*,parent_name.ilike.*Sran*,parent_email.ilike.*rav.sran*)&order=created_at.desc&limit=15");
for (const r of rows||[]) {
  console.log({
    status: r.status,
    participant: r.participant_name,
    service: r.service_name,
    venue: r.venue,
    day: r.day_label,
    time: r.time_label,
    date: r.date_iso,
    hold_expires_at: r.hold_expires_at,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

console.log("\nnow", new Date().toISOString());
console.log("\n=== expired pay holds recently ===");
const exp = await get("portal_booking_slot_reservations?select=participant_name,status,hold_expires_at,notes,updated_at,service_name,time_label&notes.ilike.*pay_hold*&order=updated_at.desc&limit=20");
for (const r of exp||[]) console.log(r.status, r.participant_name, r.hold_expires_at, r.notes, r.updated_at);

console.log("\n=== Sun Multi available/hold after Erik ===");
console.log(await get("portal_roster_rows?select=session_date,client_name,time_slot,status,service,venue&session_date=gte.2026-09-07&day=eq.Sunday&service=ilike.*Multi*&or=(time_slot.ilike.*12.30*,time_slot.ilike.*12:30*)&limit=20"));
