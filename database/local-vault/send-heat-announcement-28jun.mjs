#!/usr/bin/env node
/** Send heat announcement to remaining Sunday staff + Teflon (individual). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function readEnv(key) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

const TITLE = "High temperatures today — Sunday 28 June";
const BODY = `Today is forecast to be very warm. Please take extra care on shift:

• Drink water regularly.
• Watch participants closely for signs of overheating, including flushed face, dizziness, unusual tiredness, headache, or feeling faint.
• Encourage participants to drink water during sessions.
• If anyone, staff or participant, feels unwell, tell your lead or the office straight away.

Please confirm once read.`;

const TARGET_USERNAMES = [
  "Luliya",
  "Youssef",
  "Roberto",
  "John",
  "Bismark",
  "Carlos",
];

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"));

const { data: adminRow, error: adminErr } = await admin
  .from("staff_profiles")
  .select("id,username,full_name,app_role")
  .in("app_role", ["admin", "ceo"])
  .limit(1)
  .maybeSingle();

if (adminErr || !adminRow?.id) {
  console.error("No admin/ceo profile for created_by", adminErr);
  process.exit(1);
}

const { data: staff, error: staffErr } = await admin
  .from("staff_profiles")
  .select("id,username,full_name,app_role")
  .in("username", TARGET_USERNAMES);

if (staffErr) {
  console.error("staff_profiles error", staffErr);
  process.exit(1);
}

const byUser = Object.create(null);
(staff || []).forEach((s) => {
  byUser[String(s.username || "").trim().toLowerCase()] = s;
});

const results = [];
for (const uname of TARGET_USERNAMES) {
  const prof = byUser[String(uname).trim().toLowerCase()];
  if (!prof?.id) {
    results.push({ username: uname, ok: false, error: "profile not found" });
    continue;
  }
  const row = {
    created_by: adminRow.id,
    title: TITLE,
    body: BODY,
    message_type: "announcement",
    priority: "normal",
    audience_scope: "all_staff",
    delivery_scope: "single_user",
    target_staff_role: null,
    target_user_id: prof.id,
    on_ack_action: "portal_permissions",
  };
  const { data, error } = await admin
    .from("portal_staff_announcements")
    .insert([row])
    .select("id,title,target_user_id,created_at")
    .single();
  if (error) {
    results.push({
      username: uname,
      name: prof.full_name,
      ok: false,
      error: error.message,
    });
    continue;
  }
  results.push({
    username: uname,
    name: prof.full_name,
    ok: true,
    id: data.id,
    created_at: data.created_at,
  });
}

console.log(JSON.stringify({ created_by: adminRow.username, results }, null, 2));
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
