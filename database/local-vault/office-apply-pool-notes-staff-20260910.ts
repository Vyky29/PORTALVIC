/**
 * Push Autumn pool/area notes from the compare snapshot onto portal_roster_rows
 * so staff Today / Overview pick them up (weekly templates).
 *
 *   npx -y deno run -A database/local-vault/office-pool-notes-july-autumn-20260910.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-apply-pool-notes-staff-20260910.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ROOT = Deno.cwd();
const SNAP = path.join(ROOT, "database/local-vault/tmp/pool-notes-july-autumn.json");

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function isSkipName(name: string) {
  const n = String(name || "").trim().toLowerCase();
  return !n ||
    n === "no participant" ||
    n === "no client" ||
    n === "closed" ||
    n === "available" ||
    n === "manager" ||
    n === "office" ||
    n === "home" ||
    n === "casa";
}

function isPoolish(slot: { service?: string; venue?: string; autumn?: string; july?: string }) {
  const svc = String(slot.service || "").toLowerCase();
  const ven = String(slot.venue || "").toLowerCase();
  if (/day centre|day center/.test(svc)) return false;
  if (/bespoke/.test(svc)) return false;
  if (/aquatic|multi|climb|physical|fitness/.test(svc)) return true;
  return /acton|northolt|swimfarm|westway/.test(ven);
}

const snap = JSON.parse(readFileSync(SNAP, "utf8")) as {
  slots: Array<{
    day: string;
    venue: string;
    time: string;
    staff: string;
    client: string;
    service: string;
    july: string;
    autumn: string;
    dated: string;
  }>;
};

const { data: actorRow } = await admin
  .from("portal_roster_rows")
  .select("created_by")
  .not("created_by", "is", null)
  .limit(1);
const actorId = String(actorRow?.[0]?.created_by || "");

const seen = new Set<string>();
const jobs: Array<Record<string, string>> = [];
for (const s of snap.slots || []) {
  if (s.dated) continue;
  if (isSkipName(s.client)) continue;
  if (!isPoolish(s)) continue;
  const area = String(s.autumn || s.july || "").trim();
  if (!area) continue;
  const key = [
    s.day.toLowerCase(),
    s.client.toLowerCase(),
    s.time.toLowerCase(),
    s.staff.toLowerCase(),
    s.venue.toLowerCase(),
  ].join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  jobs.push({
    client_name: s.client,
    day: s.day,
    time_slot: s.time,
    instructors: s.staff,
    service: s.service,
    area,
    venue: s.venue,
  });
}

console.log("templates", jobs.length, APPLY ? "APPLY" : "dry-run");
const sample = jobs.filter((j) => /acton/i.test(j.venue) && /thu/i.test(j.day));
console.log("thu acton", sample.map((j) => `${j.time_slot} ${j.instructors} ${j.client_name} → ${j.area}`));

if (!APPLY) {
  console.log("Set APPLY=1 to write portal_roster_rows.");
  Deno.exit(0);
}
if (!actorId) {
  console.error("no actor id");
  Deno.exit(1);
}

let updated = 0;
let inserted = 0;
let skippedSame = 0;
for (const row of jobs) {
  const payload = {
    ...row,
    session_date: null as string | null,
    status: "active",
    created_by: actorId,
    updated_by: actorId,
  };
  let found = await admin
    .from("portal_roster_rows")
    .select("id, area, instructors")
    .eq("status", "active")
    .eq("client_name", row.client_name)
    .eq("time_slot", row.time_slot)
    .eq("day", row.day)
    .eq("instructors", row.instructors)
    .eq("venue", row.venue)
    .is("session_date", null)
    .maybeSingle();
  if (found.error && found.error.code !== "PGRST116") {
    console.warn("lookup", row.client_name, found.error.message);
    continue;
  }
  /* Instructor case variants (Roberto vs ROBERTO) — same standing seat. */
  if (!found.data?.id) {
    const loose = await admin
      .from("portal_roster_rows")
      .select("id, area, instructors")
      .eq("status", "active")
      .eq("client_name", row.client_name)
      .eq("time_slot", row.time_slot)
      .eq("day", row.day)
      .eq("venue", row.venue)
      .is("session_date", null)
      .limit(8);
    const hit = (loose.data || []).find((r) =>
      String(r.instructors || "").trim().toLowerCase() ===
        String(row.instructors || "").trim().toLowerCase()
    );
    if (hit) found = { data: hit, error: null };
  }
  if (found.data?.id) {
    if (String(found.data.area || "") === row.area) {
      skippedSame++;
      continue;
    }
    const upd = await admin.from("portal_roster_rows").update({
      area: row.area,
      service: row.service,
      instructors: row.instructors,
      updated_by: actorId,
    }).eq("id", found.data.id);
    if (upd.error) console.warn("update", row.client_name, upd.error.message);
    else updated++;
  } else {
    const ins = await admin.from("portal_roster_rows").insert(payload);
    if (ins.error) console.warn("insert", row.client_name, row.instructors, ins.error.message);
    else inserted++;
  }
}
console.log(JSON.stringify({ updated, inserted, skippedSame, actorId }, null, 2));
