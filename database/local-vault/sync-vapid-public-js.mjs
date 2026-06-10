#!/usr/bin/env node
/**
 * Write working_ui/portal/portal-vapid-public.js from local VAPID_PUBLIC_KEY.
 * Frontend public key MUST match Supabase Edge secret VAPID_PUBLIC_KEY.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { webcrypto } from "crypto";

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

function normalizeVapidPrivateKey(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, "hex").toString("base64url");
  }
  return t;
}

async function assertVapidKeyPair(publicKey, privateKey) {
  const pubBytes = Buffer.from(String(publicKey || "").trim(), "base64url");
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256 point (base64url)");
  }
  const x = pubBytes.slice(1, 33).toString("base64url");
  const y = pubBytes.slice(33, 65).toString("base64url");
  const d = normalizeVapidPrivateKey(privateKey);
  await webcrypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d, x, y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

const publicKey = readEnv("VAPID_PUBLIC_KEY");
const privateKey = readEnv("VAPID_PRIVATE_KEY");
await assertVapidKeyPair(publicKey, privateKey);
const keyId = process.env.PORTAL_VAPID_KEY_ID || "20260610-v4";
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
