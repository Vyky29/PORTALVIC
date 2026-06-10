#!/usr/bin/env node
/**
 * Write working_ui/portal/portal-vapid-public.js from local VAPID_PUBLIC_KEY.
 * Frontend public key MUST match Supabase Edge secret VAPID_PUBLIC_KEY.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outPath = path.join(root, "working_ui/portal/portal-vapid-public.js");

function readEnv(key) {
  const candidates = [
    path.join(root, "local-secrets/secrets.env"),
    path.join(__dirname, "secrets.template.env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    const val = line ? line.slice(key.length + 1).trim() : "";
    if (val) return val;
  }
  throw new Error(`${key} missing in local-secrets/secrets.env`);
}

const publicKey = readEnv("VAPID_PUBLIC_KEY");
const keyId = process.env.PORTAL_VAPID_KEY_ID || "20260610-v3";
const contents = `/** Web Push VAPID public key — must match Supabase Edge secret VAPID_PUBLIC_KEY. */
(function (global) {
  "use strict";
  global.__PORTAL_VAPID_KEY_ID__ = "${keyId}";
  global.__PORTAL_VAPID_PUBLIC_KEY__ =
    "${publicKey}";
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.writeFileSync(outPath, contents);
console.log("Wrote", path.relative(root, outPath), "keyId=", keyId);
