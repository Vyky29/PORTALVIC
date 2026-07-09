#!/usr/bin/env node
/**
 * Vercel build router — same repo, multiple Vercel projects.
 * Uses VERCEL_PROJECT_NAME to pick the deploy bundle:
 *   clubsensational-staff → staff app only (dist/clubsensational-staff)
 *   anything else         → full portal (working_ui)
 *
 * Output is always dist/deploy/ (single outputDirectory in vercel.json).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { patchStaffAppPerf } from "./staff-app-perf-patch.mjs";
import { stampCacheBust, resolveDeployVersion } from "./stamp-cache-bust.mjs";

const ROOT = join(import.meta.dirname, "..");
const DEPLOY = join(ROOT, "dist", "deploy");
const project = String(process.env.VERCEL_PROJECT_NAME || "").toLowerCase();
const isStaff =
  project === "clubsensational-staff" ||
  project.includes("clubsensational-staff") ||
  String(process.env.CLUBSENSATIONAL_STAFF_APP || "").trim() === "1";

console.log("[vercel-build] VERCEL_PROJECT_NAME =", project || "(unset)");
console.log("[vercel-build] mode =", isStaff ? "clubsensational-staff" : "portal");

execSync("node scripts/inject-portal-bridge-secret.mjs", {
  cwd: ROOT,
  stdio: "inherit",
});

if (existsSync(DEPLOY)) rmSync(DEPLOY, { recursive: true, force: true });
mkdirSync(DEPLOY, { recursive: true });

if (isStaff) {
  execSync("node scripts/build-clubsensational-staff.mjs", {
    cwd: ROOT,
    stdio: "inherit",
  });
  cpSync(join(ROOT, "dist", "clubsensational-staff"), DEPLOY, { recursive: true });
  cpSync(join(DEPLOY, "login.html"), join(DEPLOY, "index.html"));
} else {
  cpSync(join(ROOT, "working_ui"), DEPLOY, { recursive: true });
  patchStaffAppPerf(DEPLOY, {
    staffApp: false,
    deferStaffHeavyScripts: true,
    injectStaffBoot: true,
  });
}

// Rewrite every asset cache-bust token (…?v=…) to this deploy's version so a
// new deploy always invalidates JS/CSS/image caches — no reinstall needed.
const deployVersion = resolveDeployVersion();
const stamp = stampCacheBust(DEPLOY, deployVersion);
console.log(
  "[vercel-build] cache-bust stamp:",
  stamp.version,
  "→",
  stamp.replacements,
  "refs in",
  stamp.files,
  "files",
);

console.log("[vercel-build] Ready:", DEPLOY);
