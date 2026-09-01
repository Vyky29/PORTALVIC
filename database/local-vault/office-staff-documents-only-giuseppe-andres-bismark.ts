/**
 * Giuseppe, Andres, Bismark — documents-only staff portal (no roster / participants).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-staff-documents-only-giuseppe-andres-bismark.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const RUN_MIGRATION = (Deno.env.get("RUN_MIGRATION") || "") === "1";
const USERS = ["giuseppe", "andres", "bismark"];

function loadEnv(p: string) {
  try {
    for (const line of Deno.readTextFileSync(p).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

if (RUN_MIGRATION) {
  const sqlPath = new URL(
    "../migrations/20260827100000_portal_staff_documents_only_access.sql",
    import.meta.url,
  ).pathname;
  const sql = readFileSync(sqlPath, "utf8");
  console.log("RUN_MIGRATION: apply via Supabase SQL editor or supabase db push:");
  console.log(sqlPath);
  console.log(sql.slice(0, 400) + "...");
}

const { data: rows, error } = await admin
  .from("staff_profiles")
  .select("id, username, full_name, is_active")
  .or(USERS.map((u) => `username.ilike.${u}`).join(","));
if (error) throw new Error(error.message);

console.log("Matched staff_profiles:");
for (const r of rows || []) {
  console.log(" ", r.username, r.full_name, "active:", r.is_active);
}

if (!APPLY) {
  console.log("\nDry run. Would clear staff_participant_access for these users.");
  console.log("Optional: RUN_MIGRATION=1 prints SQL for portal_staff_access column.");
  Deno.exit(0);
}

for (const u of USERS) {
  const row = (rows || []).find((r) => String(r.username || "").toLowerCase() === u);
  if (!row?.id) {
    console.warn("SKIP missing profile:", u);
    continue;
  }
  const patch: Record<string, unknown> = { is_active: true };
  const { error: upErr } = await admin.from("staff_profiles").update(patch).eq("id", row.id);
  if (upErr) throw new Error(`${u}: ${upErr.message}`);
  const { error: accessErr } = await admin
    .from("staff_profiles")
    .update({ portal_staff_access: "documents_only" })
    .eq("id", row.id);
  if (accessErr && !/portal_staff_access/i.test(accessErr.message)) {
    throw new Error(`${u} portal_staff_access: ${accessErr.message}`);
  }
  if (accessErr) {
    console.warn(`${u}: portal_staff_access column not ready — frontend username gate still applies`);
  }
  const { error: delErr } = await admin
    .from("staff_participant_access")
    .delete()
    .eq("staff_id", row.id);
  if (delErr) throw new Error(`${u} access delete: ${delErr.message}`);
  console.log("OK", u, row.id);
}

console.log("\nDone. Frontend gate also lists these usernames until profiles reload.");
