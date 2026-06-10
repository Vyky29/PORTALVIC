#!/usr/bin/env node
/** Send a test Web Push to a staff user by username (service role + local VAPID). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";
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

function normPriv(raw) {
  const t = String(raw || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, "hex").toString("base64url");
  }
  return t;
}

const username = String(process.argv[2] || "teflon").trim().toLowerCase();
const url = readEnv("SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const vapidPublic = readEnv("VAPID_PUBLIC_KEY");
const vapidPrivate = normPriv(readEnv("VAPID_PRIVATE_KEY"));
const vapidSubject = readEnv("VAPID_SUBJECT");

webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
const admin = createClient(url, serviceKey);

const { data: prof, error: profErr } = await admin
  .from("staff_profiles")
  .select("id,username,full_name")
  .ilike("username", username)
  .maybeSingle();
if (profErr || !prof?.id) {
  console.error("profile not found", username, profErr?.message || "");
  process.exit(1);
}

const { data: subs, error: subErr } = await admin
  .from("portal_push_subscriptions")
  .select("endpoint,subscription_json,updated_at")
  .eq("user_id", prof.id)
  .order("updated_at", { ascending: false });
if (subErr) {
  console.error("subs query failed", subErr.message);
  process.exit(1);
}
if (!subs?.length) {
  console.log(
    JSON.stringify({
      ok: false,
      username: prof.username,
      userId: prof.id,
      reason: "no-subscriptions",
      hint: "Register on staff_dashboard → Alerts → Register this device on the recipient phone.",
    })
  );
  process.exit(2);
}

const payload = JSON.stringify({
  title: "Test · clubSENsational",
  body: "Push test from test-push-to-user.mjs",
  url: "/staff_dashboard.html?portal_open=internal_chat",
  portalOpen: "chat",
  tag: "portal-push-test-" + Date.now(),
  requireInteraction: true,
});

let sent = 0;
let failed = 0;
const results = [];
for (const row of subs) {
  const raw = row.subscription_json || {};
  const endpoint = String(raw.endpoint || row.endpoint || "").trim();
  const keys = raw.keys || {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    failed++;
    results.push({ endpoint: endpoint.slice(0, 40), ok: false, reason: "bad-keys" });
    continue;
  }
  try {
    await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload, {
      TTL: 120,
      urgency: "high",
    });
    sent++;
    results.push({ endpoint: endpoint.slice(0, 40), ok: true });
  } catch (e) {
    failed++;
    results.push({
      endpoint: endpoint.slice(0, 40),
      ok: false,
      status: e?.statusCode || null,
      message: String(e?.body || e?.message || e).slice(0, 120),
    });
  }
}

console.log(
  JSON.stringify({
    ok: sent > 0,
    username: prof.username,
    userId: prof.id,
    sent,
    failed,
    subs: subs.length,
    results,
  })
);
