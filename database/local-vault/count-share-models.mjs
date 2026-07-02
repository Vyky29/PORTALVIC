#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb
  .from("portal_parent_feedback_share")
  .select("review_model, share_status")
  .gte("reviewed_at", "2026-06-01");
const counts = {};
for (const r of data || []) {
  const k = String(r.review_model || "?") + " / " + String(r.share_status);
  counts[k] = (counts[k] || 0) + 1;
}
console.log(JSON.stringify(counts, null, 2));
console.log("total", (data || []).length);
