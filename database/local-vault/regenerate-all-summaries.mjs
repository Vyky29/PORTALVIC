#!/usr/bin/env node
/**
 * Regenerate ALL family summaries (specialist AI prompt).
 * Skips rows an admin manually edited. Throttled to avoid OpenAI 429.
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        let v = l.slice(i + 1);
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return [l.slice(0, i), v];
      }),
  );
}

const secrets = loadEnv(new URL("../../local-secrets/secrets.env", import.meta.url));
const edge = loadEnv(new URL("../../local-secrets/edge-secrets.env", import.meta.url));
const sb = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_ROLE_KEY);

const FEEDBACK_SELECT =
  "id, client_name, client_id, service, session_date, attendance, positive_feedback, relevant_information, engagement_rating, engagement_patterns, client_emotions";

const fnUrl = `${secrets.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/portal-parent-feedback-sanitize`;
const webhookSecret = edge.PORTAL_PUSH_WEBHOOK_SECRET;
const DELAY_MS = 400;
const MAX_RETRIES = 2;
const STARTUP_WAIT_MS = 0;

function hasNotes(row) {
  return (
    String(row.positive_feedback || "").trim().length > 0 ||
    String(row.relevant_information || "").trim().length > 0
  );
}

console.log("Loading existing shares for resume…");
const { data: existingShares } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, review_model, share_status, parent_message, admin_edited_at");

const adminEdited = new Set(
  (existingShares || []).filter((s) => s.admin_edited_at).map((s) => s.session_feedback_id),
);
const done = new Set(
  (existingShares || [])
    .filter((s) => {
      if (s.admin_edited_at) return false;
      const model = String(s.review_model || "");
      const msg = String(s.parent_message || "").trim();
      return s.share_status === "approved" && msg.length >= 15 && model === "fallback-specialist-rules";
    })
    .map((s) => s.session_feedback_id),
);
console.log("Admin-edited (skip):", adminEdited.size, "| Already done:", done.size);

console.log("Loading all session feedback with notes…");
const allRows = [];
const pageSize = 400;
for (let from = 0; ; from += pageSize) {
  const { data, error } = await sb
    .from("session_feedback")
    .select(FEEDBACK_SELECT)
    .order("session_date", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  if (!data?.length) break;
  for (const row of data) {
    if (hasNotes(row) && !adminEdited.has(row.id) && !done.has(row.id)) allRows.push(row);
  }
  if (data.length < pageSize) break;
}

console.log("Rows to regenerate:", allRows.length);
if (!allRows.length) process.exit(0);

if (STARTUP_WAIT_MS > 0) {
  console.log("Waiting", STARTUP_WAIT_MS / 1000, "s for OpenAI rate limit cooldown…");
  await new Promise((r) => setTimeout(r, STARTUP_WAIT_MS));
}

const ids = allRows.map((r) => r.id);
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  await sb
    .from("portal_parent_feedback_share")
    .delete()
    .in("session_feedback_id", chunk)
    .is("admin_edited_at", null);
}
if (ids.length) console.log("Cleared shares for rows being regenerated.");
else console.log("Nothing left to regenerate.");

let ok = 0;
let approved = 0;
let failed = 0;

async function sanitizeRow(row, attempt = 0) {
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secrets.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: secrets.SUPABASE_SERVICE_ROLE_KEY,
      "x-portal-webhook-secret": webhookSecret,
    },
    body: JSON.stringify({
      type: "INSERT",
      table: "session_feedback",
      record: row,
    }),
  });
  const body = await res.json().catch(() => ({}));

  if ((!res.ok || !body.ok) && attempt < MAX_RETRIES) {
    const wait = 4000 * (attempt + 1);
    console.warn("retry", row.client_name, row.session_date, "in", wait, "ms");
    await new Promise((r) => setTimeout(r, wait));
    return sanitizeRow(row, attempt + 1);
  }

  if (!res.ok || !body.ok) {
    failed++;
    console.warn("fail", row.id, row.client_name, row.session_date, res.status, body);
    return;
  }

  ok++;
  if (body.share_status === "approved") approved++;

  const { data: share } = await sb
    .from("portal_parent_feedback_share")
    .select("review_model, share_status")
    .eq("session_feedback_id", row.id)
    .maybeSingle();
  if (share?.review_model?.startsWith("openai-http-429") && attempt < MAX_RETRIES) {
    await sb.from("portal_parent_feedback_share").delete().eq("session_feedback_id", row.id);
    const wait = 15000 * (attempt + 1);
    console.warn("429 stored, retry", row.client_name, "in", wait, "ms");
    await new Promise((r) => setTimeout(r, wait));
    return sanitizeRow(row, attempt + 1);
  }
}

const t0 = Date.now();
for (let i = 0; i < allRows.length; i++) {
  await sanitizeRow(allRows[i]);
  if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  if ((i + 1) % 20 === 0 || i + 1 === allRows.length) {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(
      `[${elapsed}s] ${i + 1}/${allRows.length} ok:${ok} approved:${approved} failed:${failed}`,
    );
  }
}

const { data: models } = await sb.from("portal_parent_feedback_share").select("review_model, share_status");
const summary = {};
for (const r of models || []) {
  const k = `${r.review_model}/${r.share_status}`;
  summary[k] = (summary[k] || 0) + 1;
}
console.log("\nFinal share models:", JSON.stringify(summary, null, 2));
console.log("Done in", Math.round((Date.now() - t0) / 1000), "s");

const fadiId = "61339f9f-46b7-4fd7-b98f-c5a5382e3b4b";
const { data: fadi } = await sb
  .from("portal_parent_feedback_share")
  .select("parent_message, review_model, share_status")
  .eq("session_feedback_id", fadiId)
  .maybeSingle();
if (fadi) {
  console.log("\nFadi 30 Jun:", fadi.share_status, fadi.review_model);
  console.log(String(fadi.parent_message || ""));
}
