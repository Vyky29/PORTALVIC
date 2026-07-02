#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

for (const name of ["Fadi", "Ikram"]) {
  const { data: fb } = await sb
    .from("session_feedback")
    .select("id, client_name, session_date, positive_feedback, relevant_information, created_at")
    .ilike("client_name", name)
    .eq("session_date", "2026-06-30")
    .limit(3);
  console.log("\n===", name, "30 Jun ===");
  console.log(JSON.stringify(fb, null, 2));
  if (fb?.length) {
    const { data: sh } = await sb
      .from("portal_parent_feedback_share")
      .select("*")
      .in("session_feedback_id", fb.map((r) => r.id));
    console.log("shares:", JSON.stringify(sh, null, 2));
  }
}
