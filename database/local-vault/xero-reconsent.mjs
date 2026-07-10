#!/usr/bin/env node
/**
 * One-off Xero OAuth consent for Portal invoice push + payment write-back.
 *
 * Scopes: accounting.payments + accounting.invoices + accounting.contacts
 *
 * Usage:
 *   node database/local-vault/xero-reconsent.mjs
 *
 * Opens http://localhost:8787 — click Authorize, then paste/update secrets.
 */
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "private", "parent-portal-secrets.env");
const PORT = 8787;
const REDIRECT = `http://localhost:${PORT}/xero-callback`;
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.payments",
  "accounting.invoices",
  "accounting.contacts",
].join(" ");

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function upsertEnv(path, patch) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [k, v] of Object.entries(patch)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text = text.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(path, text);
}

const env = loadEnv(ENV_PATH);
const clientId = env.XERO_CLIENT_ID;
const clientSecret = env.XERO_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET in", ENV_PATH);
  process.exit(1);
}

const authorizeUrl =
  "https://login.xero.com/identity/connect/authorize?" +
  new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: SCOPES,
    state: "portal",
  }).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Xero re-consent</title>
      <p><a href="${authorizeUrl}">Authorize Xero (payments + invoices + contacts)</a></p>
      <p>Redirect URI must be registered on the Xero app: <code>${REDIRECT}</code></p>`);
    return;
  }
  if (url.pathname !== "/xero-callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("OAuth error: " + (err || "missing code"));
    return;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
    }).toString(),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.refresh_token) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(tokenJson, null, 2));
    return;
  }

  const connRes = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: "Bearer " + tokenJson.access_token },
  });
  const connections = await connRes.json().catch(() => []);
  const tenantId =
    (Array.isArray(connections) && connections[0]?.tenantId) || env.XERO_TENANT_ID || "";

  upsertEnv(ENV_PATH, {
    XERO_REFRESH_TOKEN: tokenJson.refresh_token,
    ...(tenantId ? { XERO_TENANT_ID: tenantId } : {}),
  });

  console.log("\nUpdated", ENV_PATH);
  console.log("scope:", tokenJson.scope || "(none in response)");
  console.log("tenant:", tenantId || "(unchanged)");
  console.log("\nNow run:");
  console.log(
    `  npx supabase secrets set XERO_REFRESH_TOKEN="${tokenJson.refresh_token}"${
      tenantId ? ` XERO_TENANT_ID="${tenantId}"` : ""
    } --project-ref cklpnwhlqsulpmkipmqb`,
  );

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Xero OK</title>
    <h1>Xero consent saved</h1>
    <p>Refresh token written to local vault. Copy the <code>supabase secrets set</code> command from the terminal.</p>
    <p>Scope: <code>${String(tokenJson.scope || "").replace(/</g, "")}</code></p>`);
  setTimeout(() => process.exit(0), 500);
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT}`);
  console.log("Open:", `http://localhost:${PORT}/`);
  console.log("Authorize URL:\n", authorizeUrl);
  const open =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(open, [`http://localhost:${PORT}/`], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
});
