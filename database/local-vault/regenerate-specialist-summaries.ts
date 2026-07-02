#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read
/**
 * Regenerate family summaries with the specialist OpenAI prompt (not literal staff copy).
 * Skips rows an admin has manually edited.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeAndCacheParentFeedbackShare } from "../../supabase/functions/_shared/parent_feedback_sanitize_job.ts";
import { parentSummaryModelNeedsRefresh } from "../../supabase/functions/_shared/parent_feedback_sanitize.ts";

const envPath = new URL("../../local-secrets/secrets.env", import.meta.url);
const envText = await Deno.readTextFile(envPath);
for (const line of envText.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  Deno.env.set(line.slice(0, i), line.slice(i + 1));
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const since = "2026-06-01";
const { data: fb } = await sb
  .from("session_feedback")
  .select(
    "id, client_name, client_id, service, session_date, attendance, positive_feedback, relevant_information, engagement_rating, engagement_patterns, client_emotions",
  )
  .gte("session_date", since)
  .order("session_date", { ascending: false });

const ids = (fb || []).map((r) => r.id);
const { data: shares } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, review_model, admin_edited_at, source_fingerprint")
  .in("session_feedback_id", ids);

const shareById = new Map((shares || []).map((s) => [s.session_feedback_id, s]));
const { data: participants } = await sb
  .from("portal_participants")
  .select("contact_id, display_name, first_name, last_name");

const toRun = (fb || []).filter((row) => {
  const pos = String(row.positive_feedback || "").trim();
  const rel = String(row.relevant_information || "").trim();
  if (!pos && !rel) return false;
  const sh = shareById.get(row.id);
  if (sh?.admin_edited_at) return false;
  if (!sh) return true;
  if (parentSummaryModelNeedsRefresh(sh.review_model)) return true;
  if (String(sh.source_fingerprint || "").startsWith("backfill-")) return true;
  return false;
});

console.log("Regenerating", toRun.length, "of", (fb || []).length, "since", since);

let ok = 0;
let approved = 0;
const CONCURRENCY = 4;
for (let i = 0; i < toRun.length; i += CONCURRENCY) {
  const chunk = toRun.slice(i, i + CONCURRENCY);
  const results = await Promise.all(
    chunk.map((row) => sanitizeAndCacheParentFeedbackShare(sb, row, participants || [])),
  );
  for (const r of results) {
    if (r.ok) ok++;
    if (r.share_status === "approved") approved++;
  }
  if ((i + CONCURRENCY) % 20 === 0 || i + CONCURRENCY >= toRun.length) {
    console.log("Progress", Math.min(i + CONCURRENCY, toRun.length), "/", toRun.length);
  }
}

console.log("Done. ok:", ok, "approved:", approved);

// Spot-check Fadi 30 Jun
const fadiId = "61339f9f-46b7-4fd7-b98f-c5a5382e3b4b";
const { data: fadi } = await sb
  .from("portal_parent_feedback_share")
  .select("parent_message, review_model, share_status")
  .eq("session_feedback_id", fadiId)
  .maybeSingle();
if (fadi) {
  const msg = String(fadi.parent_message || "");
  console.log("\nFadi 30 Jun:", fadi.share_status, fadi.review_model);
  console.log(msg.slice(0, 400) + (msg.length > 400 ? "…" : ""));
}
