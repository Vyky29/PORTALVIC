/**
 * Unify Wed 16 Ayman finish-booking OVs to short roster id "ayman" / "Ayman"
 * so Overview + Staff Today do not paint a second "Ayman El Bakry" card.
 *
 * APPLY=1 npx -y deno run -A database/local-vault/office-ayman-unify-slug-ov-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ACTOR = "d365ab5c-e190-461a-a390-31e54b0b066f";

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

const sb = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

const { data: ovs, error } = await sb
  .from("schedule_overrides")
  .select("id, session_date, anchor_start, anchor_end, payload, status, reason")
  .eq("status", "active")
  .eq("override_type", "client_replace_in_slot")
  .gte("session_date", "2026-09-16")
  .ilike("anchor_staff_id", "javier%");
if (error) {
  console.error(error);
  Deno.exit(1);
}

const hits = (ovs || []).filter((o) => {
  const p = (o.payload || {}) as Record<string, unknown>;
  const blob = JSON.stringify(p).toLowerCase();
  return blob.includes("ayman");
});

console.log("hits", hits.length);
for (const o of hits) {
  const p = { ...((o.payload || {}) as Record<string, unknown>) };
  console.log(o.id, o.session_date, o.anchor_start, p.replacement_client_name, p.replacement_client_id);
  p.replacement_client_id = "ayman";
  p.to_client_id = "ayman";
  p.replacement_client_name = "Ayman";
  p.to_client_name = "Ayman";
  if (!APPLY) continue;
  /* Delete+insert avoids updated_by null trigger under service role. */
  const { data: full } = await sb.from("schedule_overrides").select("*").eq("id", o.id).maybeSingle();
  if (!full) continue;
  const { error: delErr } = await sb.from("schedule_overrides").delete().eq("id", o.id);
  if (delErr) {
    console.error("del", delErr);
    Deno.exit(1);
  }
  const row = { ...full, payload: p, created_by: ACTOR, updated_by: ACTOR };
  delete (row as { id?: string }).id;
  const { error: insErr } = await sb.from("schedule_overrides").insert(row);
  if (insErr) {
    console.error("ins", insErr);
    Deno.exit(1);
  }
  console.log("rewrote", o.session_date, o.anchor_start);
}

if (!APPLY) console.log("Dry run. Re-run APPLY=1");
else console.log("done");
