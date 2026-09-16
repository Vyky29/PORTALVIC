/**
 * Split Ayman Wed 16 hour OV → two 30' OVs (roster already fixed).
 * APPLY=1 npx -y deno run -A database/local-vault/office-ayman-split-hour-ov-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ACTOR = "d365ab5c-e190-461a-a390-31e54b0b066f";
const OV_ID = "50914a81-aa1f-4b91-b757-719e714b3138";

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

const { data: o, error } = await sb.from("schedule_overrides").select("*").eq("id", OV_ID).maybeSingle();
if (error || !o) {
  console.error(error || "missing OV");
  Deno.exit(1);
}
console.log("OV", o.session_date, o.anchor_start, o.anchor_end, o.status);

if (!APPLY) {
  console.log("Dry run. Re-run APPLY=1");
  Deno.exit(0);
}

if (String(o.status) === "active") {
  /* Void updates can null updated_by via trigger under service role — delete instead. */
  const { error: delErr } = await sb.from("schedule_overrides").delete().eq("id", OV_ID);
  if (delErr) {
    console.error("delete", delErr);
    Deno.exit(1);
  }
  console.log("deleted hour OV");
}

const p = (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<string, unknown>;
for (const h of [
  { start: "17:00:00", end: "17:30:00", label: "5 to 5.30" },
  { start: "17:30:00", end: "18:00:00", label: "5.30 to 6" },
]) {
  const { data: exist } = await sb
    .from("schedule_overrides")
    .select("id")
    .eq("session_date", o.session_date)
    .eq("status", "active")
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_start", h.start)
    .eq("anchor_end", h.end)
    .ilike("anchor_staff_id", "javier%")
    .limit(3);
  const already = (exist || []).length > 0;
  if (already) {
    console.log("exists", h.label);
    continue;
  }
  const { error: insOvErr } = await sb.from("schedule_overrides").insert({
    session_date: o.session_date,
    anchor_staff_id: o.anchor_staff_id,
    anchor_start: h.start,
    anchor_end: h.end,
    anchor_venue: o.anchor_venue,
    anchor_client_id: "available",
    anchor_time_slot_label: h.label,
    override_type: "client_replace_in_slot",
    payload: { ...p, aquatic_half_band: true, split_from_hour_ov: OV_ID },
    reason: `Finish booking term · Ayman · Acton · ${h.label} · split from hour OV`,
    status: "active",
    spreadsheet_revision: "finish_booking_half_split",
    created_by: ACTOR,
    updated_by: ACTOR,
  });
  if (insOvErr) {
    console.error("ins", h.label, insOvErr);
    Deno.exit(1);
  }
  console.log("inserted", h.label);
}
console.log("done");
