#!/usr/bin/env node
/**
 * Split staff-dashboard-core.js into domain modules (Phase B).
 * Run from repo root: node scripts/split-staff-dashboard-core.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORTAL = join(ROOT, "working_ui", "portal");
const CORE = join(PORTAL, "staff-dashboard-core.js");

const CHUNKS = [
  {
    file: "staff-dashboard-topbar.js",
    start: 0,
    startIncludes: null,
    endIncludes: "const STAFF_DASH_FORCE_SESSIONS_ENDED",
  },
  {
    file: "staff-dashboard-feedback.js",
    startIncludes: "const STAFF_DASH_FORCE_SESSIONS_ENDED",
    endIncludes: "When the landing URL had a valid",
  },
  {
    file: "staff-dashboard-calendar.js",
    startIncludes: "When the landing URL had a valid",
    endIncludes: "function portalGetMergedSessionReviewRecordForRoster",
  },
  {
    file: "staff-dashboard-term.js",
    startIncludes: "function portalGetMergedSessionReviewRecordForRoster",
    endIncludes: "function portalStaffCanBrowseAllParticipants",
  },
  {
    file: "staff-dashboard-participants.js",
    startIncludes: "function portalStaffCanBrowseAllParticipants",
    endIncludes: "function portalStaffClientSessionsOnCalendarDate",
  },
  {
    file: "staff-dashboard-today.js",
    startIncludes: "function portalStaffClientSessionsOnCalendarDate",
    endIncludes: "function renderHeader",
  },
  {
    file: "staff-dashboard-ui.js",
    startIncludes: "function renderHeader",
    endIncludes: null,
  },
];

function findLine(lines, needle, fromIdx = 0) {
  if (!needle) return -1;
  for (let i = fromIdx; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}

function sliceChunk(lines, chunk, prevEnd) {
  const start =
    chunk.startIncludes != null
      ? findLine(lines, chunk.startIncludes, prevEnd)
      : chunk.start;
  if (start < 0) throw new Error("start not found: " + chunk.file + " (" + chunk.startIncludes + ")");
  let end = chunk.endIncludes ? findLine(lines, chunk.endIncludes, start + 1) : lines.length;
  if (chunk.endIncludes && end < 0) throw new Error("end not found: " + chunk.file + " (" + chunk.endIncludes + ")");
  return { start, end, text: lines.slice(start, end).join("\n").trimEnd() + "\n" };
}

const lines = readFileSync(CORE, "utf8").split("\n");
let prevEnd = 0;
const written = [];

for (const chunk of CHUNKS) {
  const { start, end, text } = sliceChunk(lines, chunk, prevEnd);
  const outPath = join(PORTAL, chunk.file);
  writeFileSync(outPath, text, "utf8");
  written.push({ file: chunk.file, lines: end - start });
  prevEnd = end;
  console.log("[split-core]", chunk.file, end - start, "lines");
}

if (prevEnd !== lines.length) {
  const tail = lines.length - prevEnd;
  if (tail > 2) console.warn("[split-core] trailing lines not assigned:", tail);
}

unlinkSync(CORE);
console.log("[split-core] removed staff-dashboard-core.js");

export const STAFF_DASHBOARD_CORE_MODULES = CHUNKS.map((c) => c.file);
export const STAFF_DASHBOARD_CORE_MODULE_PATHS = CHUNKS.map(
  (c) => "/portal/" + c.file
);
