#!/usr/bin/env node
/**
 * Vercel build step: replace %%PB6%% with STAFF_PROFILE_PORTAL_BRIDGE_SECRET.
 * Same value must be set in Supabase Edge Function secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "working_ui");
const PLACEHOLDER = "%%PB6%%";
const secret = String(process.env.STAFF_PROFILE_PORTAL_BRIDGE_SECRET || "").trim();

if (!secret || secret.length < 16) {
  console.warn(
    "[inject-portal-bridge-secret] STAFF_PROFILE_PORTAL_BRIDGE_SECRET missing or too short — leaving %%PB6%% placeholders (bridge fallback disabled until env is set).",
  );
} else {
  console.log(
    `[inject-portal-bridge-secret] Injecting bridge secret (${secret.length} chars) into working_ui/*.html and portal-static-bootstrap.js`,
  );
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (extname(name) === ".html" || name === "portal-static-bootstrap.js") {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT);
let touched = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!src.includes(PLACEHOLDER)) continue;
  const next = secret && secret.length >= 16 ? src.split(PLACEHOLDER).join(secret) : src;
  if (next !== src) {
    writeFileSync(file, next, "utf8");
    touched++;
  }
}

console.log(`[inject-portal-bridge-secret] Updated ${touched} file(s).`);
