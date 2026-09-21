/**
 * Wed Acton Javier standing must be:
 *   Cyrus 4–5 · Ayman 5–6 (from Wed 16) · Kayden 6–6.30
 *
 * Clears stale half-hour portal_roster_rows templates that were exploding
 * Staff Today / Team into Cyrus 4–4.30 + 4.30–5 and duplicate Ayman cards.
 *
 *   npx -y deno run -A database/local-vault/office-javier-wed-acton-cyrus-ayman-kayden-20260916.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-javier-wed-acton-cyrus-ayman-kayden-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";

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
loadEnv("database/local-vault/.env");
loadEnv(".env");

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const WANT = [
  {
    client_name: "Cyrus",
    day: "Wednesday",
    time_slot: "4 to 5",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Ayman",
    day: "Wednesday",
    time_slot: "5 to 6",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Kayden",
    day: "Wednesday",
    time_slot: "6 to 6.30",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
];

const { data: existing, error: e1 } = await sb
  .from("portal_roster_rows")
  .select("id, client_name, day, time_slot, instructors, service, area, venue, session_date, status")
  .ilike("day", "Wednesday")
  .ilike("venue", "%acton%")
  .ilike("instructors", "%javier%");
if (e1) {
  console.error(e1);
  Deno.exit(1);
}

console.log("existing Wed Acton Javier rows:", (existing || []).length);
for (const r of existing || []) {
  console.log({
    id: r.id,
    client: r.client_name,
    time: r.time_slot,
    area: r.area,
    date: r.session_date,
  });
}

const ids = (existing || []).map((r) => r.id).filter(Boolean);
if (!APPLY) {
  console.log("\nDry run. Would delete", ids.length, "rows and insert", WANT.length, "standing templates.");
  console.log("Re-run with APPLY=1 to write.");
  Deno.exit(0);
}

if (ids.length) {
  const { error: delErr } = await sb.from("portal_roster_rows").delete().in("id", ids);
  if (delErr) {
    console.error("delete failed", delErr);
    Deno.exit(1);
  }
  console.log("deleted", ids.length);
}

const { data: inserted, error: insErr } = await sb
  .from("portal_roster_rows")
  .insert(WANT)
  .select("id, client_name, time_slot, area");
if (insErr) {
  console.error("insert failed", insErr);
  Deno.exit(1);
}
console.log("inserted", inserted);
console.log("done");
