#!/usr/bin/env node
/** Generate missing family shares for recent feedback (e.g. Ikram 30 Jun). */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const since = "2026-06-12";
const { data: fb } = await sb
  .from("session_feedback")
  .select("id, client_name, session_date, positive_feedback, relevant_information, client_id")
  .gte("session_date", since)
  .order("session_date", { ascending: false });

const ids = (fb || []).map((r) => r.id);
const { data: shares } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, share_status, parent_message")
  .in("session_feedback_id", ids);

const have = new Map((shares || []).map((s) => [s.session_feedback_id, s]));
let created = 0;
for (const row of fb || []) {
  const pos = String(row.positive_feedback || "").trim();
  const rel = String(row.relevant_information || "").trim();
  if (!pos && !rel) continue;
  const ex = have.get(row.id);
  if (ex && String(ex.share_status) !== "pending" && String(ex.parent_message || "").trim()) continue;
  const message = pos.length >= 15 ? pos.slice(0, 2000) : null;
  const patch = {
    session_feedback_id: row.id,
    contact_id: String(row.client_id || row.client_name || "unknown").toLowerCase(),
    source_fingerprint: "backfill-" + row.id.slice(0, 8),
    parent_message: message,
    share_status: message ? "approved" : "hidden",
    review_model: message ? "fallback-positive-only" : "fallback-empty",
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("portal_parent_feedback_share")
    .upsert(patch, { onConflict: "session_feedback_id" });
  if (error) console.warn(row.client_name, row.session_date, error.message);
  else created++;
}
console.log("Upserted shares:", created);
