#!/usr/bin/env node
/** Remove literal-copy family summaries so edge AI regenerates with specialist prompt. */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const STALE = new Set([
  "fallback-no-openai",
  "fallback-positive-only",
  "fallback-needs-ai",
  "fallback-empty",
]);

const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const since = "2026-06-01";

const { data: shares, error: shareErr } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, review_model, admin_edited_at, source_fingerprint, reviewed_at")
  .gte("reviewed_at", since);
if (shareErr) {
  console.error(shareErr);
  process.exit(1);
}

const toDelete = (shares || [])
  .filter((s) => {
    if (s.admin_edited_at) return false;
    if (STALE.has(String(s.review_model || ""))) return true;
    if (String(s.source_fingerprint || "").startsWith("backfill-")) return true;
    return false;
  })
  .map((s) => s.session_feedback_id);

console.log("Stale shares to clear:", toDelete.length);
if (!toDelete.length) process.exit(0);

for (let i = 0; i < toDelete.length; i += 100) {
  const chunk = toDelete.slice(i, i + 100);
  const { error } = await sb
    .from("portal_parent_feedback_share")
    .delete()
    .in("session_feedback_id", chunk);
  if (error) {
    console.error(error);
    process.exit(1);
  }
}
console.log("Done. Open admin Sessions hub (hard refresh) to regenerate with AI.");
