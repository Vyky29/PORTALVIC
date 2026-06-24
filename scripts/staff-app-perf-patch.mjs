#!/usr/bin/env node
/**
 * Staff dashboard perf patch: externalize inline JS + keep synchronous script order.
 * Dynamic chunk loader removed — iPad/PWA was blank with async injection.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VER = "20260625-john-acton-today";

const STAFF_DASHBOARD_CORE_SCRIPTS = [
  "staff-dashboard-topbar.js",
  "staff-dashboard-feedback.js",
  "staff-dashboard-calendar.js",
  "staff-dashboard-term.js",
  "staff-dashboard-participants.js",
  "staff-dashboard-today.js",
  "staff-dashboard-ui.js",
];

/** Staff-only: loaded early in parallel via staff-app-boot.js (not blocking core). */
const STAFF_DEFERRED_TIER_PATTERNS = [
  /  <script src="\/portal\/clients_info_embed\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/clients_gender_embed\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_staff_lead_aquatic_slots\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_participant_identity\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_participant_general_hydrate\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_staff_gender_embed\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_swimming_instructor_menus\.js[^"]*"><\/script>\n/g,
  /  <script src="\/portal\/portal_staff_photos\.js[^"]*"><\/script>\n/g,
];

function stripDeferredFromTierBlock(tierBlock, staffApp) {
  let block = String(tierBlock || "")
    .replace(/  <link rel="stylesheet" href="\/portal\/portal_ghost_view\.css[^"]*" \/>\n/g, "")
    .replace(/  <script src="\/portal\/portal-ghost-view\.js[^"]*"><\/script>\n/g, "")
    .replace(/  <link rel="stylesheet" href="\/portal\/portal_achievements\.css[^"]*" \/>\n/g, "")
    .replace(/  <script src="\/portal\/portal_wellbeing_review_reminder\.js[^"]*"><\/script>\n/g, "");
  if (staffApp) {
    for (const re of STAFF_DEFERRED_TIER_PATTERNS) {
      block = block.replace(re, "");
    }
  }
  return block;
}

function extractScriptAfterMarker(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return { html, extracted: null };
  const tagStart = html.lastIndexOf("<script", idx);
  if (tagStart < 0) return { html, extracted: null };
  const contentStart = html.indexOf(">", tagStart) + 1;
  const closeIdx = html.indexOf("</script>", contentStart);
  if (closeIdx < 0) return { html, extracted: null };
  const extracted = html.slice(contentStart, closeIdx).trim();
  const htmlNext = html.slice(0, tagStart) + html.slice(closeIdx + "</script>".length);
  return { html: htmlNext, extracted };
}

function stripLegacyAuthBootstrap(html) {
  let next = html;
  next = next.replace(
    /  <script>\n    \(function \(\) \{\n      window\.portalResolveLoginHref = function \(\) \{[\s\S]*?\}\)\(\);\n<\/script>\n  <script src="\/portal\/portal-logout-bind\.js"><\/script>\n  <script>\n    \(function \(\) \{\n      var s = document\.createElement\("script"\);[\s\S]*?\}\)\(\);\n  <\/script>\n/g,
    ""
  );
  next = next.replace(
    /  <script src="\/portal\/staff-app-chunks\.js[^"]*"><\/script>\n/g,
    ""
  );
  return next;
}

function buildSyncScriptTail(tierBlock) {
  const coreTags = STAFF_DASHBOARD_CORE_SCRIPTS.map(
    (f) => `  <script src="/portal/${f}?v=${VER}"></script>\n`,
  ).join("");
  return (
    tierBlock +
    `  <script src="/portal/staff-dashboard-dock-boot.js?v=${VER}"></script>\n` +
    coreTags +
    `  <script src="/portal/staff-dashboard-auth-bridge.js?v=${VER}"></script>\n` +
    `  <script src="/portal/staff-dashboard-rehydrate.js?v=${VER}"></script>\n` +
    `  <script src="/portal/portal-logout-bind.js"></script>\n` +
    `  <script type="module" src="/portal/staff-dashboard-auth-supabase.js?v=${VER}"></script>\n` +
    `  <script src="/portal/staff-dashboard-achievements-boot.js?v=${VER}"></script>\n`
  );
}

export function patchStaffAppPerf(deployDir, options = {}) {
  const staffApp = options.staffApp === true;
  const deferHeavyScripts = staffApp || options.deferStaffHeavyScripts === true;
  const injectStaffBoot = staffApp || options.injectStaffBoot === true;
  const htmlPath = join(deployDir, "staff_dashboard.html");
  const portalDir = join(deployDir, "portal");
  let html = readFileSync(htmlPath, "utf8");

  const extBlockRe =
    /  <script src="\/portal\/term_from_timetable\.js[\s\S]*?<script src="\/portal\/portal_sheet_back\.js[^"]*"><\/script>\n/;
  const tierMatch = html.match(extBlockRe);
  if (!tierMatch) {
    console.warn("[staff-app-perf-patch] tier script block not found — skipping");
    return;
  }
  const tierBlock = stripDeferredFromTierBlock(tierMatch[0], deferHeavyScripts);
  const alreadyExtracted = html.includes("staff-dashboard-topbar.js");

  const extractions = [
    { file: "staff-dashboard-core.js", marker: "/** Real calendar weekday for “Today”" },
    { file: "staff-dashboard-rehydrate.js", marker: 'var DAY_NAMES = ["Sunday","Monday"' },
    { file: "staff-dashboard-achievements-boot.js", marker: "(function portalAchievementsBootstrap()" },
  ];

  if (!alreadyExtracted) {
    for (const item of extractions) {
      const r = extractScriptAfterMarker(html, item.marker);
      if (!r.extracted) {
        console.warn("[staff-app-perf-patch] missing marker for", item.file);
        continue;
      }
      html = r.html;
      writeFileSync(join(portalDir, item.file), r.extracted + "\n", "utf8");
      console.log("[staff-app-perf-patch] wrote", item.file, "(" + r.extracted.length + " bytes)");
    }

    html = stripLegacyAuthBootstrap(html);
    html = html.replace(
      /<script src="\/portal\/staff-dashboard-dock-boot\.js[^"]*"><\/script>\n/g,
      "",
    );
    html = html.replace(extBlockRe, buildSyncScriptTail(tierBlock));
  } else {
    html = html.replace(extBlockRe, tierBlock);
    console.log("[staff-app-perf-patch] staff dashboard modules already external — skip inline extraction");
  }

  if (staffApp) {
    html = html.replace(
      '<script defer src="/portal/portal_admin_surface_map.js?v=20260609-admin-surface"></script>\n',
      ""
    );
    html = html.replace(
      '<script defer src="/portal/portal_web_push_support.js?v=20260619-inflight-fix"></script>\n',
      ""
    );
    html = html.replace(
      '<script defer src="/portal/portal_ensure_web_push.js?v=20260619-inflight-fix"></script>\n',
      ""
    );
    html = html.replace(
      "<script defer src=\"/portal/portal_alerts_notifications_ui.js?v=20260619-inflight-fix\"></script>\n",
      ""
    );

    if (!html.includes("staff-app-boot.js")) {
      html = html.replace(
        '<script src="/staff-app-config.js?v=20260614-clubsensational-staff"></script>',
        '<script src="/staff-app-config.js?v=20260614-clubsensational-staff"></script>\n  <script src="/portal/staff-app-boot.js?v=20260624-staff-perf14"></script>'
      );
    }

    html = html.replace(
      /  <script src="\/portal\/portal_orientation_lock\.js[^"]*"><\/script>\n  <script src="\/portal\/portal_venue_report_schedule\.js[^"]*"><\/script>\n/g,
      ""
    );

    html = html.replace(
      '<meta name="apple-mobile-web-app-title" content="CS Portal" />',
      '<meta name="apple-mobile-web-app-title" content="Staff" />'
    );

    html = html.replace(
      '<script src="/portal/portal_dashboard_lazy_scripts.js?v=20260617-staff-perf"></script>\n',
      '<script defer src="/portal/portal_dashboard_lazy_scripts.js?v=20260617-staff-perf"></script>\n'
    );
    html = html.replace(
      '<link rel="stylesheet" href="/portal/contract-preview.css?v=20260622-sign" />\n',
      '<link rel="stylesheet" href="/portal/contract-preview.css?v=20260622-sign" media="print" onload="this.media=\'all\'" />\n' +
        '  <noscript><link rel="stylesheet" href="/portal/contract-preview.css?v=20260622-sign" /></noscript>\n'
    );
  }

  if (injectStaffBoot && !staffApp && !html.includes("staff-app-boot.js")) {
    html = html.replace(
      '<script src="/portal/portal_auth_page_gate.js',
      '<script src="/portal/staff-app-boot.js?v=20260624-staff-perf14"></script>\n  <script src="/portal/portal_auth_page_gate.js'
    );
    if (deferHeavyScripts) {
      html = html.replace(
        /  <script src="\/portal\/portal_orientation_lock\.js[^"]*"><\/script>\n  <script src="\/portal\/portal_venue_report_schedule\.js[^"]*"><\/script>\n/g,
        ""
      );
    }
  }

  writeFileSync(htmlPath, html, "utf8");
  console.log(
    "[staff-app-perf-patch]",
    staffApp ? "staff-app" : "portalvic",
    "staff_dashboard.html size:",
    html.length
  );
}
