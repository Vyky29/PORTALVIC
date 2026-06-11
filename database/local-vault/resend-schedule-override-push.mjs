#!/usr/bin/env node
/** Re-dispatch roster Web Push for active schedule_overrides (after dedupe clear). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

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

const ids = process.argv.slice(2).map((x) => String(x || "").trim()).filter(Boolean);
if (!ids.length) {
  console.error("Usage: node resend-schedule-override-push.mjs <override-uuid> [...]");
  process.exit(1);
}

const url = readEnv("SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const secret = readPushWebhookSecret();
const dispatchUrl = `${url.replace(/\/$/, "")}/functions/v1/portal-push-dispatch-schedule-override`;
const admin = createClient(url, serviceKey);

const results = [];
for (const id of ids) {
  const { data: row, error } = await admin
    .from("schedule_overrides")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    results.push({ id, ok: false, error: error?.message || "not found" });
    continue;
  }
  await admin.from("portal_webpush_override_sent").delete().eq("override_id", id);
  const res = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-webhook-secret": secret,
    },
    body: JSON.stringify({
      type: "INSERT",
      table: "schedule_overrides",
      record: row,
      old_record: null,
    }),
  });
  const body = await res.text();
  let parsed = body;
  try {
    parsed = JSON.parse(body);
  } catch (_) {}
  results.push({ id, ok: res.ok, status: res.status, body: parsed });
}

console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
