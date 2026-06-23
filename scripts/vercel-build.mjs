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

const ROOT = join(import.meta.dirname, "..");
const DEPLOY = join(ROOT, "dist", "deploy");
const project = String(process.env.VERCEL_PROJECT_NAME || "").toLowerCase();
const isStaff = project === "clubsensational-staff";

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
} else {
  cpSync(join(ROOT, "working_ui"), DEPLOY, { recursive: true });
}

console.log("[vercel-build] Ready:", DEPLOY);
