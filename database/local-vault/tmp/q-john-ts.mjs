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
    ) {
      v = v.slice(1, -1);
    }
    if (v) return v;
  }
  throw new Error("missing " + key);
}

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: prof, error } = await admin
  .from("staff_profiles")
  .select("id,username,full_name,email_personal,app_role")
  .or(
    "username.ilike.john,username.ilike.John,full_name.ilike.%Kyei%,email_personal.ilike.%johnnyosti%",
  );
if (error) throw error;
console.log("profiles", JSON.stringify(prof, null, 2));
const id =
  (prof || []).find((p) => String(p.username || "").toLowerCase() === "john")?.id ||
  (prof || [])[0]?.id;
if (!id) process.exit(1);

const { data: rates } = await admin.from("staff_pay_rates").select("*").eq("user_id", id);
const { data: rr } = await admin.from("staff_role_rates").select("*").eq("user_id", id);
console.log("pay_rates", rates);
console.log("role_rates", rr);

const { data: ts } = await admin
  .from("staff_timesheets")
  .select("id,period_month,total_hours,total_cost,status,submitted_on,role_label")
  .eq("submitted_by_user_id", id)
  .order("period_month", { ascending: false })
  .limit(8);
console.log("timesheets", ts);

const { data: docs } = await admin
  .from("documents")
  .select("id,title,document_type,category,related_date,created_at,user_id")
  .eq("user_id", id)
  .eq("document_type", "timesheet")
  .order("created_at", { ascending: false })
  .limit(8);
console.log("docs", docs);

const { data: offs } = await admin
  .from("staff_unavailability")
  .select("off_date,reason")
  .eq("staff_id", id)
  .gte("off_date", "2026-06-25")
  .lte("off_date", "2026-07-17");
console.log("offs", offs);
