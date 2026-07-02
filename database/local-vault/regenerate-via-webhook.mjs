#!/usr/bin/env node
/** Regenerate family summaries via deployed sanitize edge function (uses OpenAI on Supabase). */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const STALE = new Set([
  "fallback-no-openai",
  "fallback-positive-only",
  "fallback-needs-ai",
  "fallback-empty",
  "openai-error",
]);

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

const since = "2026-06-01";
const { data: shares } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, review_model, admin_edited_at")
  .gte("reviewed_at", since);

const staleIds = [
  ...new Set(
    (shares || [])
      .filter((s) => {
        if (s.admin_edited_at) return false;
        const model = String(s.review_model || "");
        if (STALE.has(model)) return true;
        if (model.startsWith("openai-http-")) return true;
        if (model.endsWith("-empty")) return true;
        return false;
      })
      .map((s) => s.session_feedback_id),
  ),
];

console.log("Stale shares to regenerate:", staleIds.length);
if (!staleIds.length) process.exit(0);

const rows = [];
for (let i = 0; i < staleIds.length; i += 80) {
  const chunk = staleIds.slice(i, i + 80);
  const { data } = await sb
    .from("session_feedback")
    .select(
      "id, client_name, client_id, service, session_date, attendance, positive_feedback, relevant_information, engagement_rating, engagement_patterns, client_emotions",
    )
    .in("id", chunk);
  rows.push(...(data || []));
}

const fnUrl = `${secrets.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/portal-parent-feedback-sanitize`;
const webhookSecret = edge.PORTAL_PUSH_WEBHOOK_SECRET;
const CONCURRENCY = 1;
const DELAY_MS = 1200;
let ok = 0;
let approved = 0;

async function sanitizeRow(row) {
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
  if (!res.ok || !body.ok) {
    console.warn("fail", row.id, row.client_name, res.status, body);
    return;
  }
  ok++;
  if (body.share_status === "approved") approved++;
}

for (let i = 0; i < rows.length; i += CONCURRENCY) {
  const chunk = rows.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map((row) => sanitizeRow(row)));
  if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  if ((i + CONCURRENCY) % 25 === 0 || i + CONCURRENCY >= rows.length) {
    console.log("Progress", Math.min(i + CONCURRENCY, rows.length), "/", rows.length, "ok:", ok, "approved:", approved);
  }
}

const fadiId = "61339f9f-46b7-4fd7-b98f-c5a5382e3b4b";
const { data: fadi } = await sb
  .from("portal_parent_feedback_share")
  .select("parent_message, review_model, share_status")
  .eq("session_feedback_id", fadiId)
  .maybeSingle();
if (fadi) {
  const msg = String(fadi.parent_message || "");
  console.log("\nFadi 30 Jun:", fadi.share_status, fadi.review_model);
  console.log(msg);
}
