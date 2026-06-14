#!/usr/bin/env node
/** Send staff Web Push for outstanding session feedback (manual ops). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

const sessionDate = (process.argv[2] || "2026-06-14").trim().slice(0, 10);

/** Pending counts confirmed with roster + Supabase for Sunday 2026-06-14. */
const TARGETS = [
  {
    userId: "b85cdca7-4c7d-48c3-9bb8-a48c95841a4e",
    name: "Carlos Herrero",
    pending: 5,
    sample: "Hazem, Zaid, Serine, Zakariya, Patrick (climbing)",
  },
  {
    userId: "688afb7d-d5ad-4c9b-a04f-e28ddccda91f",
    name: "Javier Marquez",
    pending: 8,
    sample: "Shire, Samer, Zaid, Hazem, Eiji, Rayyan Fi, Haneef, Shaan",
  },
  {
    userId: "928b62d9-abb6-4e25-8135-a6dd5e44a8f4",
    name: "Alex Stone",
    pending: 1,
    sample: "Yusuf Ah climbing 11-12",
  },
  {
    userId: "c93d7eb1-3ab0-4cdb-9a7f-562632ee8e77",
    name: "Roberto Reali",
    pending: 1,
    sample: "Rodin aquatic 14:00-14:30",
  },
  {
    userId: "09cc34eb-7824-4f54-b4a0-b2b3205425ca",
    name: "Bismark Gyan",
    pending: 1,
    sample: "Yusuf Ah Hub 10:15-11",
  },
];

const url = readEnv("SUPABASE_URL");
const secret = readPushWebhookSecret();
const dispatchUrl =
  `${url.replace(/\/$/, "")}/functions/v1/portal-push-dispatch-outstanding-feedback`;

const payload = {
  sessionDate,
  force: true,
  targets: TARGETS.map(({ userId, pending, sample }) => ({
    userId,
    pending,
    sample,
  })),
};

console.log("Sending outstanding feedback push for", sessionDate, "to:");
for (const t of TARGETS) {
  console.log(`  - ${t.name}: ${t.pending} pending`);
}

const res = await fetch(dispatchUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-portal-webhook-secret": secret,
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
let parsed = text;
try {
  parsed = JSON.parse(text);
} catch (_) {}

console.log(JSON.stringify({ ok: res.ok, status: res.status, body: parsed }, null, 2));
process.exit(res.ok ? 0 : 1);
