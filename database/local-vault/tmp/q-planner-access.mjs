#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function readEnv(key) {
  for (const rel of [
    "local-secrets/secrets.env",
    "database/local-vault/private/parent-portal-secrets.env",
  ]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (!line) continue;
    let v = line.slice(key.length + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (v) return v;
  }
  throw new Error("missing " + key);
}

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const keys = [
  "alex",
  "andres",
  "bismark",
  "carlos",
  "sandra",
  "giuseppe",
  "godsway",
  "john",
  "roberto",
  "luliya",
  "lulia",
  "youssef",
  "michelle",
  "victor",
  "raul",
  "palankas",
  "javi",
];

const { data: profs, error } = await admin
  .from("staff_profiles")
  .select("id,username,full_name,app_role,is_active");
if (error) throw error;

const want = new Set(keys);
const matched = (profs || []).filter((p) =>
  want.has(String(p.username || "").trim().toLowerCase()),
);
console.log("profiles", JSON.stringify(matched, null, 2));

const { data: access } = await admin.from("staff_participant_access").select("*");
console.log("access", JSON.stringify(access, null, 2));

// Probe check constraint by attempting insert of tinashe for sandra then rollback via delete
const sandra = matched.find((p) => String(p.username).toLowerCase() === "sandra");
if (sandra) {
  const { error: insErr } = await admin
    .from("staff_participant_access")
    .insert({ staff_id: sandra.id, participant_slug: "tinashe" });
  console.log("tinashe insert probe:", insErr ? insErr.message : "OK");
  if (!insErr) {
    await admin
      .from("staff_participant_access")
      .delete()
      .eq("staff_id", sandra.id)
      .eq("participant_slug", "tinashe");
  }
  const { error: coreErr } = await admin
    .from("staff_participant_access")
    .insert({ staff_id: sandra.id, participant_slug: "core" });
  console.log("core insert probe:", coreErr ? coreErr.message : "OK");
  if (!coreErr) {
    await admin
      .from("staff_participant_access")
      .delete()
      .eq("staff_id", sandra.id)
      .eq("participant_slug", "core");
  }
  const { error: fadiErr } = await admin
    .from("staff_participant_access")
    .insert({ staff_id: sandra.id, participant_slug: "fadi" });
  console.log("fadi insert probe:", fadiErr ? fadiErr.message : "OK");
  if (!fadiErr) {
    await admin
      .from("staff_participant_access")
      .delete()
      .eq("staff_id", sandra.id)
      .eq("participant_slug", "fadi");
  }
}
