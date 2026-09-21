/**
 * Sun 6 Sep 2026: void stale Youssef→Emanuel Hub Multi covers.
 * Truth: Youssef OFF; Jack S / Zaid / Eiji / Hazem / Haneef / Rayyan F are Javier's
 * Multi book (slash Javier/Dan/Emmanuel). John covers Emmanuel Hub that day (canonical).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-void-sun6-youssef-emanuel-covers-20260914.ts
 * Apply (SQL — TS APPLY hits updated_by trigger):
 *   npx supabase db query --linked -f database/local-vault/office-void-sun6-youssef-emanuel-covers-20260914.sql
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const REVISION = "office:void-sun6-youssef-emanuel-covers-20260914";
const REASON =
  "Superseded — Sun 6 Youssef OFF; Hub Multi kids are Javier book (John covers Emmanuel)";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

const { data: rows, error } = await admin
  .from("schedule_overrides")
  .select("id,anchor_staff_id,anchor_client_id,payload,reason,status")
  .eq("session_date", "2026-09-06")
  .eq("override_type", "instructor_reassign")
  .eq("status", "active")
  .or("anchor_staff_id.eq.emanuel,anchor_staff_id.eq.emmanuel");

if (error) throw error;

const toVoid = (rows || []).filter((r) => {
  const cov = String(
    (r.payload && (r.payload.covering_staff_id || r.payload.covering_staff_name)) || "",
  )
    .trim()
    .toLowerCase();
  return cov === "youssef" || cov.startsWith("youssef");
});

console.log(
  "to void",
  toVoid.map((r) => ({
    id: r.id,
    staff: r.anchor_staff_id,
    client: r.anchor_client_id,
    cover: r.payload && r.payload.covering_staff_id,
  })),
);

if (!toVoid.length) {
  console.log("nothing to void");
  Deno.exit(0);
}

if (!APPLY) {
  console.log("dry — would cancel", toVoid.length, "rows");
  Deno.exit(0);
}

const ids = toVoid.map((r) => r.id);
console.error(
  "Do not APPLY via this TS file (updated_by trigger). Use:\n" +
    "  npx supabase db query --linked -f database/local-vault/office-void-sun6-youssef-emanuel-covers-20260914.sql",
);
Deno.exit(1);
