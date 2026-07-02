#!/usr/bin/env node
/** One-off: refresh portal_parent_feedback_share rows stuck as fallback-no-openai (empty). */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: broken, error } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, admin_edited_at")
  .eq("review_model", "fallback-no-openai");
if (error) {
  console.error(error);
  process.exit(1);
}

const ids = (broken || [])
  .filter((r) => !r.admin_edited_at)
  .map((r) => r.session_feedback_id);
console.log("Broken shares to refresh:", ids.length);
if (!ids.length) process.exit(0);

const { data: feedback } = await sb
  .from("session_feedback")
  .select("id, positive_feedback, relevant_information")
  .in("id", ids);

let updated = 0;
let hidden = 0;
for (const fb of feedback || []) {
  const positive = String(fb.positive_feedback || "").trim();
  const patch =
    positive.length >= 15
      ? {
          share_status: "approved",
          parent_message: positive.slice(0, 2000),
          review_model: "fallback-positive-only",
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          share_status: "hidden",
          parent_message: null,
          review_model: "fallback-empty",
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
  const { error: updErr } = await sb
    .from("portal_parent_feedback_share")
    .update(patch)
    .eq("session_feedback_id", fb.id)
    .eq("review_model", "fallback-no-openai");
  if (updErr) {
    console.warn("update failed", fb.id, updErr.message);
    continue;
  }
  if (patch.share_status === "approved") updated++;
  else hidden++;
}
console.log("Approved with positive draft:", updated, "hidden (no notes):", hidden);
