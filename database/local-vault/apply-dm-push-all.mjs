#!/usr/bin/env node
/**
 * Apply DM chat + incoming-call Web Push on Portal (cklpnwhlqsulpmkipmqb) via Supabase CLI.
 *
 * Usage (from repo root):
 *   node database/local-vault/apply-dm-push-all.mjs
 *   node database/local-vault/apply-dm-push-all.mjs --secrets   # also sync push/VAPID edge secrets
 *   node database/local-vault/apply-dm-push-all.mjs --deploy    # also redeploy push edge functions
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const envPath = path.join(__dirname, "secrets.template.env");
const args = new Set(process.argv.slice(2));

function run(cmd, opts = {}) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function readEnv(key) {
  if (!fs.existsSync(envPath)) throw new Error("Missing " + envPath);
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error(key + " not found in secrets.template.env");
  return line.slice(key.length + 1).trim();
}

/** web-push private key must be JWK `d` (base64url). Optional 32-byte hex if it matches public. */
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
  const { webcrypto } = await import("crypto");
  await webcrypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d, x, y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function main() {
  run("node database/local-vault/apply-chat-admin-push.mjs");
  run("node database/local-vault/apply-incoming-call-push.mjs");

  run("npx supabase db query --linked -f database/local-vault/step-chat-admin-push.local.sql");
  run("npx supabase db query --linked -f database/local-vault/step-incoming-call-push.local.sql");

  run(
    'npx supabase db query --linked "select tgname, tgrelid::regclass as on_table from pg_trigger where not tgisinternal and tgname in (\'portal-staff-dm-admin-chat-push\',\'portal-ceo-group-admin-chat-push\',\'portal-staff-dm-incoming-call-push\',\'portal-ceo-group-incoming-call-push\') order by 1;"',
  );

  if (args.has("--secrets")) {
    const vapidPublic = readEnv("VAPID_PUBLIC_KEY");
    const vapidPrivate = normalizeVapidPrivateKey(readEnv("VAPID_PRIVATE_KEY"));
    await assertVapidKeyPair(vapidPublic, vapidPrivate);
    const pairs = [
      ["PORTAL_PUSH_WEBHOOK_SECRET", readEnv("PORTAL_PUSH_WEBHOOK_SECRET")],
      ["VAPID_PUBLIC_KEY", vapidPublic],
      ["VAPID_PRIVATE_KEY", vapidPrivate],
      ["VAPID_SUBJECT", readEnv("VAPID_SUBJECT")],
      ["PORTAL_PUSH_OPEN_URL", readEnv("PORTAL_PUSH_OPEN_URL")],
      ["PORTAL_PUSH_ADMIN_OPEN_URL", readEnv("PORTAL_PUSH_ADMIN_OPEN_URL")],
    ];
    const setArgs = pairs
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
      .join(" ");
    run(`npx supabase secrets set ${setArgs}`);
  }

  if (args.has("--deploy")) {
    run(
      "npx supabase functions deploy portal-push-dispatch-admin-alert --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
    );
    run(
      "npx supabase functions deploy portal-push-dispatch-incoming-call --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
    );
  }

  console.log("\nDone. Re-test: Victor → Raul DM with Raul portal fully closed (PWA on iPhone).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
