#!/usr/bin/env -S deno run -A
/**
 * Portal day-ops smoke suite — run after Overview / Feedbacks / finish-booking changes.
 *
 * Covers the gaps that bit us mid-Sep 2026:
 *  - Feedbacks OV paint + Office 20:30 + Angel covers
 *  - Finish-booking instructor fold (Reggie ≠ Aurora)
 *  - Overview Office duty cards + expandable seats
 *  - Feedback 20:30 shared cover resolution
 *  - Fadi DC standing hygiene
 *
 *   npx -y deno run -A database/local-vault/smoke-portal-day-ops-suite-20260917.ts
 */
import { existsSync } from "node:fs";

type Smoke = { name: string; cmd: string[]; optional?: boolean };

const SMOKES: Smoke[] = [
  {
    name: "feedbacks-ov-paint",
    cmd: ["npx", "-y", "deno", "run", "-A", "database/local-vault/smoke-feedbacks-ov-paint-20260916.ts"],
  },
  {
    name: "finish-booking-fold-instructors",
    cmd: [
      "npx",
      "-y",
      "deno",
      "run",
      "-A",
      "database/local-vault/smoke-finish-booking-fold-instructors-20260917.ts",
    ],
  },
  {
    name: "overview-board-contracts",
    cmd: [
      "npx",
      "-y",
      "deno",
      "run",
      "-A",
      "database/local-vault/smoke-overview-board-contracts-20260917.ts",
    ],
  },
  {
    name: "feedback-2030-shared",
    cmd: ["npx", "-y", "deno", "run", "-A", "database/local-vault/smoke-feedback-2030-shared-20260909.ts"],
  },
  {
    name: "fadi-dc-standing",
    cmd: ["npx", "-y", "deno", "run", "-A", "database/local-vault/smoke-fadi-dc-standing-20260911.ts"],
  },
  {
    name: "b3-parent-board-standing",
    cmd: ["node", "database/local-vault/smoke-b3-parent-board-standing.mjs"],
    optional: true,
  },
];

const results: Array<{ name: string; ok: boolean; optional?: boolean; code: number }> = [];

console.log("=== portal day-ops smoke suite ===\n");

for (const s of SMOKES) {
  const scriptPath = s.cmd[s.cmd.length - 1];
  if (!existsSync(scriptPath) && s.optional) {
    console.log(`SKIP  ${s.name} (missing ${scriptPath})`);
    continue;
  }
  console.log(`\n--- ${s.name} ---`);
  const proc = new Deno.Command(s.cmd[0], {
    args: s.cmd.slice(1),
    cwd: Deno.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    env: Deno.env.toObject(),
  });
  const out = await proc.output();
  const code = out.code;
  const passed = code === 0;
  results.push({ name: s.name, ok: passed, optional: s.optional, code });
  if (!passed && !s.optional) {
    console.log(`\nSUITE STOPPED on required smoke: ${s.name} (exit ${code})`);
    break;
  }
}

console.log("\n=== suite summary ===");
let hardFail = 0;
for (const r of results) {
  const tag = r.ok ? "PASS" : r.optional ? "FAIL(optional)" : "FAIL";
  console.log(`${tag}  ${r.name}`);
  if (!r.ok && !r.optional) hardFail++;
}

if (hardFail) {
  console.log(`\nSUITE FAIL (${hardFail} required)`);
  Deno.exit(1);
}
console.log("\nSUITE PASS");
