#!/usr/bin/env node
/**
 * Staff dashboard perf patch: externalize inline JS + phased chunk loader.
 * clubsensational-staff: full patch (boot, branding, defer web push).
 * portalvic: same chunk split without staff-app-only head changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VER = "20260623-staff-perf2";

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

function stripTrailingStaffBootstrap(html) {
  return html.replace(
    /(<script src="\/portal\/staff-app-chunks\.js[^"]*"><\/script>\n)[\s\S]*?(?=<\/body>)/,
    "$1\n"
  );
}

export function patchStaffAppPerf(deployDir, options = {}) {
  const staffApp = options.staffApp !== false;
  const htmlPath = join(deployDir, "staff_dashboard.html");
  const portalDir = join(deployDir, "portal");
  let html = readFileSync(htmlPath, "utf8");

  const extBlockRe =
    /  <script src="\/portal\/term_from_timetable\.js[\s\S]*?<script src="\/portal\/portal_sheet_back\.js[^"]*"><\/script>\n/;
  html = html.replace(
    extBlockRe,
    '  <script src="/portal/staff-app-chunks.js?v=' + VER + '"></script>\n'
  );

  const extractions = [
    { file: "staff-dashboard-core.js", marker: "/** Real calendar weekday for “Today”" },
    { file: "staff-dashboard-rehydrate.js", marker: 'var DAY_NAMES = ["Sunday","Monday"' },
    { file: "staff-dashboard-achievements-boot.js", marker: "(function portalAchievementsBootstrap()" },
  ];

  for (const item of extractions) {
    const r = extractScriptAfterMarker(html, item.marker);
    if (!r.extracted) continue;
    html = r.html;
    writeFileSync(join(portalDir, item.file), r.extracted + "\n", "utf8");
    console.log("[staff-app-perf-patch] wrote", item.file, "(" + r.extracted.length + " bytes)");
  }

  html = stripTrailingStaffBootstrap(html);

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
        '<script src="/staff-app-config.js?v=20260614-clubsensational-staff"></script>\n  <script src="/portal/staff-app-boot.js?v=' +
          VER +
          '"></script>'
      );
    }

    html = html.replace(
      '<meta name="apple-mobile-web-app-title" content="CS Portal" />',
      '<meta name="apple-mobile-web-app-title" content="Staff" />'
    );
  }

  writeFileSync(htmlPath, html, "utf8");
  console.log(
    "[staff-app-perf-patch]",
    staffApp ? "staff-app" : "portalvic",
    "staff_dashboard.html size:",
    html.length
  );
}
