#!/usr/bin/env node
/**
 * Build clubSENsational Staff — static app bundle for a dedicated Vercel project.
 * Output: dist/clubsensational-staff/
 *
 * Env (Vercel Production):
 *   CLUBSENSATIONAL_STAFF_ORIGIN — e.g. https://clubsensational-staff.vercel.app
 *   PORTAL_ADMIN_ORIGIN — main ops portal, e.g. https://portalvic.vercel.app
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { patchStaffAppPerf } from "./staff-app-perf-patch.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SOURCE = join(REPO_ROOT, "working_ui");
const OUT = join(REPO_ROOT, "dist", "clubsensational-staff");

const STAFF_ORIGIN = String(
  process.env.CLUBSENSATIONAL_STAFF_ORIGIN || "https://clubsensational-staff.vercel.app",
).replace(/\/$/, "");
const ADMIN_ORIGIN = String(
  process.env.PORTAL_ADMIN_ORIGIN || "https://portalvic.vercel.app",
).replace(/\/$/, "");

const EXCLUDE_FILES = new Set([
  "admin_dashboard.html",
  "ceo_dashboard.html",
  "company_insights.html",
  "office_portal.html",
  "portal_choose.html",
  "roster_term_master_review.html",
]);

const EXCLUDE_DIRS = new Set(["archive", "OTROS", "scripts"]);

function shouldSkip(relPath) {
  const parts = relPath.split("/");
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  const base = parts[parts.length - 1];
  if (EXCLUDE_FILES.has(base)) return true;
  return false;
}

function copyTree(srcDir, destDir, rel = "") {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const relPath = rel ? `${rel}/${name}` : name;
    if (shouldSkip(relPath)) continue;
    const from = join(srcDir, name);
    const to = join(destDir, name);
    const st = statSync(from);
    if (st.isDirectory()) {
      copyTree(from, to, relPath);
    } else {
      cpSync(from, to);
    }
  }
}

function patchHtml(filePath, patches) {
  let src = readFileSync(filePath, "utf8");
  let changed = false;
  for (const [from, to] of patches) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) writeFileSync(filePath, src, "utf8");
}

function patchBootstrap(filePath) {
  let src = readFileSync(filePath, "utf8");
  src = src.replace(
    /window\.PORTAL_CANONICAL_ORIGIN\s*=\s*\n\s*window\.PORTAL_CANONICAL_ORIGIN \|\| "https:\/\/portalvic\.vercel\.app";/,
    `window.PORTAL_CANONICAL_ORIGIN =\n    window.PORTAL_CANONICAL_ORIGIN || "${STAFF_ORIGIN}";`,
  );
  src = src.replace(
    /if \(\/portalvic\\\.vercel\\\.app\$\/i\.test\(here\)\)/g,
    'if (/clubsensational-staff\\.vercel\\.app$/i.test(here) || /portalvic\\.vercel\\.app$/i.test(here))',
  );
  src = src.replace(
    /if \(\/portalvic\\\.vercel\\\.app\$\/i\.test\(host\)\) return false;/,
    'if (/clubsensational-staff\\.vercel\\.app$/i.test(host)) return false;\n      if (/portalvic\\.vercel\\.app$/i.test(host)) return false;',
  );
  writeFileSync(filePath, src, "utf8");
}

function writeStaffAppConfig(destDir) {
  const js = `(function (global) {
  "use strict";
  global.PORTAL_STAFF_APP = true;
  global.PORTAL_PRODUCT_NAME = "clubSENsational Staff";
  global.PORTAL_CANONICAL_ORIGIN = global.PORTAL_CANONICAL_ORIGIN || "${STAFF_ORIGIN}";
  global.PORTAL_ADMIN_PORTAL_ORIGIN = "${ADMIN_ORIGIN}";
  var adminOrigin = String(global.PORTAL_ADMIN_PORTAL_ORIGIN || "").replace(/\\/$/, "");
  if (adminOrigin) {
    global.PORTAL_ADMIN_DASHBOARD_URL = adminOrigin + "/admin_dashboard.html";
    global.PORTAL_CEO_DASHBOARD_URL = adminOrigin + "/ceo_dashboard.html";
    global.PORTAL_OFFICE_DASHBOARD_URL = adminOrigin + "/office_portal.html";
    global.PORTAL_CHOOSE_URL = adminOrigin + "/portal_choose.html";
  }
  global.PORTAL_STAFF_DASHBOARD_URL = "staff_dashboard.html";
  global.PORTAL_LEAD_DASHBOARD_URL = "staff_dashboard.html";
  global.portalStaffAppBlocksPassiveLoginRedirect = function (url) {
    try {
      var dest = new URL(String(url || ""), global.location.href);
      return dest.origin !== global.location.origin;
    } catch (_) {
      return false;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
`;
  writeFileSync(join(destDir, "staff-app-config.js"), js, "utf8");
}

function injectStaffConfigScript(htmlPath) {
  const tag =
    '<script src="/staff-app-config.js?v=20260614-clubsensational-staff"></script>\n  ';
  const bootTag =
    '<script src="/portal/staff-app-boot.js?v=20260624-staff-boot8"></script>\n  ';
  const hintTag =
    '<script src="/portal/staff-app-install-hint.js?v=20260624-staff-install"></script>\n  ';
  let src = readFileSync(htmlPath, "utf8");
  if (src.includes("staff-app-config.js")) return;
  const isLogin = /login\.html$/i.test(htmlPath);
  const inject = isLogin ? tag + bootTag + hintTag : tag;
  if (src.includes('portal_auth_page_gate.js')) {
    src = src.replace(
      '<script src="/portal/portal_auth_page_gate.js',
      inject + '<script src="/portal/portal_auth_page_gate.js',
    );
  } else {
    src = src.replace("<head>", "<head>\n  " + inject.trim());
  }
  writeFileSync(htmlPath, src, "utf8");
}

function writeAdminRedirectStubs(destDir) {
  var pages = [
    "admin_dashboard.html",
    "ceo_dashboard.html",
    "office_portal.html",
    "portal_choose.html",
  ];
  pages.forEach(function (page) {
    var target = ADMIN_ORIGIN + "/" + page;
    writeFileSync(
      join(destDir, page),
      "<!DOCTYPE html>\n<html lang=\"en-GB\">\n<head>\n<meta charset=\"UTF-8\" />\n<meta http-equiv=\"refresh\" content=\"0;url=" +
        target +
        "\" />\n<title>clubSENsational — Admin portal</title>\n<script>location.replace(" +
        JSON.stringify(target) +
        ");</script>\n</head>\n<body><p>Admin tools live on the operations portal. <a href=\"" +
        target +
        "\">Continue</a></p></body>\n</html>\n",
      "utf8",
    );
  });
}

console.log("[build-clubsensational-staff] Source:", SOURCE);
console.log("[build-clubsensational-staff] Output:", OUT);
console.log("[build-clubsensational-staff] Staff origin:", STAFF_ORIGIN);
console.log("[build-clubsensational-staff] Admin portal:", ADMIN_ORIGIN);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
copyTree(SOURCE, OUT);

writeStaffAppConfig(OUT);
writeAdminRedirectStubs(OUT);
injectStaffConfigScript(join(OUT, "login.html"));
injectStaffConfigScript(join(OUT, "staff_dashboard.html"));

patchHtml(join(OUT, "login.html"), [
  [
    "<!-- PORTALVIC · Vercel static deploy (working_ui/) -->",
    "<!-- clubSENsational Staff · dedicated Vercel deploy -->",
  ],
  ['<meta name="apple-mobile-web-app-title" content="Portal" />', '<meta name="apple-mobile-web-app-title" content="Staff" />'],
  ["<title>clubSENsational Portal — Sign in</title>", "<title>clubSENsational Staff — Sign in</title>"],
  [
    '<link rel="manifest" href="/login.webmanifest?v=20260625-manifest-fix" />',
    '<link rel="manifest" href="/clubsensational-staff-login.webmanifest?v=20260614-staff" />',
  ],
  ['<h1 class="login-portal-text" id="loginBrandTitle">Portal</h1>', '<h1 class="login-portal-text" id="loginBrandTitle">Staff</h1>'],
  [
    '<p id="login-updated-msg" class="login-updated-msg"',
    '<p id="login-staff-admin-hint" class="login-updated-msg" style="margin-bottom:12px">Operations admin? Open <a href="https://portalvic.vercel.app/login.html">portalvic.vercel.app</a>.</p>\n      <p id="login-updated-msg" class="login-updated-msg"',
  ],
]);

patchHtml(join(OUT, "staff_dashboard.html"), [
  [
    '<link rel="manifest" href="/staff-dashboard.webmanifest?v=20260625-manifest-fix" />',
    '<link rel="manifest" href="/clubsensational-staff-dashboard.webmanifest?v=20260614-staff" />',
  ],
  ["<title>clubSENsational Staff Dashboard</title>", "<title>clubSENsational Staff</title>"],
]);

const bootstrapPath = join(OUT, "portal-static-bootstrap.js");
if (existsSync(bootstrapPath)) patchBootstrap(bootstrapPath);

const manifestPath = join(OUT, "clubsensational-staff-dashboard.webmanifest");
if (existsSync(manifestPath)) {
  let m = readFileSync(manifestPath, "utf8");
  if (!m.includes(STAFF_ORIGIN)) {
    /* start_url stays relative — fine for PWA on staff origin */
  }
}

console.log("[build-clubsensational-staff] Done. Files under", relative(REPO_ROOT, OUT));

patchStaffAppPerf(OUT, { staffApp: true });
