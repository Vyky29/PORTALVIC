/**
 * Joel Hibbert-Nixon — OLD (not continuing Autumn 26/27).
 * Scrub MADRE + portal_roster_rows so Mon Acton Aquatic 5–5.30 (Youssef) is No participant.
 * Exact Joel only — never Joelle.
 *
 *   npx -y deno run -A database/local-vault/office-joel-scrub-autumn-open-seat.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-joel-scrub-autumn-open-seat.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = Deno.env.get("APPLY") === "1";
const NOTE =
  "Office 7 Sep 2026 — Joel OLD / not continuing Autumn; seat → No participant (open).";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log(`=== Scrub Joel → No participant (APPLY=${APPLY ? "1" : "0"}) ===`);

const { data: rosterRows, error: rosterErr } = await admin
  .from("portal_roster_rows")
  .select(
    "id, client_name, day, instructors, service, area, time_slot, venue, session_date, status",
  )
  .ilike("client_name", "joel%");
if (rosterErr) throw rosterErr;

const joelRoster = (rosterRows || []).filter(
  (r) => isExactJoel(r.client_name) && String(r.status || "active") === "active",
);
console.log(
  "active portal_roster_rows Joel",
  joelRoster.map((r) => ({
    id: r.id,
    d: r.session_date,
    t: r.time_slot,
    i: r.instructors,
    v: r.venue,
  })),
);

const { data: madre, error: madreErr } = await admin
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (madreErr) throw madreErr;

let madreChanged = 0;
function scrubMadreNode(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(scrubMadreNode);
  const o = { ...(node as Record<string, unknown>) };
  if (isExactJoel(o.client_name)) {
    o.client_name = "No participant";
    delete o.makeup;
    madreChanged++;
  }
  for (const k of Object.keys(o)) {
    o[k] = scrubMadreNode(o[k]);
  }
  return o;
}
const scrubbedDoc = scrubMadreNode(
  structuredClone((madre as { document?: unknown })?.document || {}),
);
console.log("madre Joel slots to open", madreChanged, "rev", (madre as { revision?: number })?.revision);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write.");
  Deno.exit(0);
}

for (const r of joelRoster) {
  const { error } = await admin
    .from("portal_roster_rows")
    .update({
      client_name: "No participant",
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
  if (error) throw error;
  console.log("roster → No participant", r.id, r.session_date, r.time_slot);
}

if (madreChanged > 0) {
  const rev = Number((madre as { revision?: number })?.revision || 0) + 1;
  const { error } = await admin
    .from("portal_madre_document")
    .update({
      document: scrubbedDoc,
      revision: rev,
      updated_at: new Date().toISOString(),
    })
    .eq("term_key", "summer-2026");
  if (error) throw error;
  console.log("madre scrubbed → rev", rev, "slots", madreChanged, NOTE);
}

console.log("Done.");
