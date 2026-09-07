/**
 * Diagnose Joel seats in MADRE / roster / overrides.
 *   npx -y deno run -A database/local-vault/office-joel-diagnose.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
loadEnv(resolve("local-secrets/secrets.env"));

function isExactJoel(name: unknown) {
  const n = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  return n === "joel" || n.startsWith("joel ");
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

const { data, error } = await sb
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (error) {
  console.error(error);
  Deno.exit(1);
}
const doc = (data as { document?: unknown; revision?: number })?.document;
console.log("rev", (data as { revision?: number })?.revision);
const hits: Array<Record<string, unknown>> = [];
function walk(node: unknown, path: string) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, path + "[" + i + "]"));
    return;
  }
  const o = node as Record<string, unknown>;
  if (isExactJoel(o.client_name)) {
    hits.push({
      path,
      t: o.time_slot,
      c: o.client_name,
      v: o.venue,
      i: o.instructors,
    });
  }
  for (const [k, v] of Object.entries(o)) walk(v, path + "." + k);
}
walk(doc, "document");
console.log("madre joel hits", hits.length, hits.slice(0, 40));

const { data: rows } = await sb
  .from("portal_roster_rows")
  .select("id,client_name,session_date,time_slot,instructors,venue,status,day")
  .ilike("client_name", "joel%")
  .order("session_date", { ascending: false })
  .limit(50);
console.log(
  "roster joel exact",
  (rows || []).filter((r) => isExactJoel(r.client_name)),
);

const { data: ovs } = await sb
  .from("schedule_overrides")
  .select(
    "id,session_date,override_type,status,anchor_client_id,anchor_staff_id,anchor_start,payload",
  )
  .gte("session_date", "2026-06-01")
  .order("session_date", { ascending: false })
  .limit(800);
const joelOvs = (ovs || []).filter((o) => {
  if (isExactJoel(o.anchor_client_id)) return true;
  const s = JSON.stringify(o.payload || {}).toLowerCase();
  return (
    (s.includes('"joel"') ||
      s.includes("joel ") ||
      /[^a-z]joel[^a-z]|\"joel\"|^joel/.test(s)) &&
    !s.includes("joelle")
  );
});
console.log("overrides joel-ish", joelOvs.length, joelOvs.slice(0, 25));
