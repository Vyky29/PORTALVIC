#!/usr/bin/env node
/**
 * One-off: deliver Web Push for the "High temperatures" announcements that the
 * Edge Function skipped (on_ack_action = portal_permissions was in-app only).
 * Sends to each target user's portal subscription, then records the dedupe ledger.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

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

const url = readEnv("SUPABASE_URL");
const admin = createClient(url, readEnv("SUPABASE_SERVICE_ROLE_KEY"));
const openBase = readEnv("PORTAL_PUSH_OPEN_URL").replace(/\/$/, "");
webpush.setVapidDetails(
  readEnv("VAPID_SUBJECT"),
  readEnv("VAPID_PUBLIC_KEY"),
  readEnv("VAPID_PRIVATE_KEY")
);

const DRY = process.argv.includes("--dry");

const { data: anns, error } = await admin
  .from("portal_staff_announcements")
  .select("id,title,body,target_user_id,delivery_scope,on_ack_action,created_at")
  .ilike("title", "%High temperatures%")
  .order("created_at", { ascending: true });

if (error) {
  console.error("announcements error", error);
  process.exit(1);
}

function clamp(s, max = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

const results = [];
for (const a of anns || []) {
  const uid = String(a.target_user_id || "").trim();
  if (!uid) {
    results.push({ id: a.id.slice(0, 8), ok: false, reason: "no target_user_id" });
    continue;
  }

  const { data: already } = await admin
    .from("portal_webpush_announcement_sent")
    .select("announcement_id")
    .eq("announcement_id", a.id)
    .maybeSingle();
  if (already) {
    results.push({ id: a.id.slice(0, 8), ok: true, skipped: "already in ledger" });
    continue;
  }

  const { data: subs } = await admin
    .from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .eq("user_id", uid)
    .eq("register_app", "portal");

  if (!subs || !subs.length) {
    results.push({ id: a.id.slice(0, 8), user: uid.slice(0, 8), ok: false, reason: "no subscription" });
    continue;
  }

  const payload = JSON.stringify({
    title: clamp(a.title, 80) || "clubSENsational",
    body: clamp(a.body),
    url: `${openBase}?portalOpen=alerts`,
    portalOpen: "alerts",
  });

  let sent = 0;
  for (const s of subs) {
    if (DRY) {
      sent++;
      continue;
    }
    try {
      await webpush.sendNotification(s.subscription_json, payload, {
        TTL: 86400,
        urgency: "high",
      });
      sent++;
    } catch (e) {
      const st = e && e.statusCode;
      results.push({ id: a.id.slice(0, 8), user: uid.slice(0, 8), ok: false, status: st, reason: String(e && e.message || e) });
      if (st === 404 || st === 410) {
        await admin
          .from("portal_push_subscriptions")
          .delete()
          .eq("user_id", uid)
          .eq("endpoint", s.endpoint);
      }
    }
  }

  if (sent > 0 && !DRY) {
    await admin.from("portal_webpush_announcement_sent").insert({ announcement_id: a.id });
  }
  results.push({ id: a.id.slice(0, 8), user: uid.slice(0, 8), ok: sent > 0, sent });
}

console.log(JSON.stringify({ dry: DRY, count: (anns || []).length, results }, null, 2));
