#!/usr/bin/env node
/** Read PORTAL_PUSH_WEBHOOK_SECRET from env, local-secrets/secrets.env, or secrets.template.env. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

export function readPushWebhookSecret() {
  if (process.env.PORTAL_PUSH_WEBHOOK_SECRET?.trim()) {
    return process.env.PORTAL_PUSH_WEBHOOK_SECRET.trim();
  }
  const candidates = [
    path.join(root, "local-secrets/secrets.env"),
    path.join(__dirname, "secrets.template.env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("PORTAL_PUSH_WEBHOOK_SECRET="));
    const val = line ? line.slice("PORTAL_PUSH_WEBHOOK_SECRET=".length).trim() : "";
    if (val) return val;
  }
  throw new Error(
    "PORTAL_PUSH_WEBHOOK_SECRET missing — export it or add to local-secrets/secrets.env",
  );
}
