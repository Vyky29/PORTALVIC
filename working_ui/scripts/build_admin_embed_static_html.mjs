/**
 * Build portal/admin_embed.html from admin_dashboard.html (same-origin static deploy).
 */
import fs from "fs";
import path from "path";
import { PORTAL_DIR, WORKING_UI_DIR } from "./portal_paths.mjs";
import { PORTAL_STATIC_BASE, PORTAL_STATIC_V } from "./portal_static.mjs";
import { syncPortalAssets } from "./sync_portal_assets.mjs";

const adminPath = path.join(WORKING_UI_DIR, "admin_dashboard.html");
const outPath = path.join(PORTAL_DIR, "admin_embed.html");

await syncPortalAssets();

let html = fs.readFileSync(adminPath, "utf8");
html = html.replace(
  '<script src="portal/clients_payments_portal_data.js"></script>',
  ""
);

const shellCss =
  "<style>" +
  "html.portal-app-shell,html.portal-app-shell body{margin:0;padding:0;overflow-x:hidden;max-width:100vw}" +
  "html.portal-app-shell .admin-shell{min-height:100dvh}" +
  "</style>";

const bootScript = `<script>
  (function () {
    window.__PORTAL_STATIC_BASE = "${PORTAL_STATIC_BASE}/";
    window.__PORTAL_STATIC_V = "${PORTAL_STATIC_V}";
    window.__PORTAL_STATIC_SCRIPT_ERRORS = [];
    window.addEventListener("error", function (ev) {
      var t = ev && ev.target;
      if (!t || t.tagName !== "SCRIPT") return;
      var src = t.getAttribute("src") || t.src || "";
      if (!src || src.indexOf("/${PORTAL_STATIC_BASE}/") === -1) return;
      window.__PORTAL_STATIC_SCRIPT_ERRORS.push({ src: src, message: (ev.message || "") });
    }, true);
  })();
</script>`;

if (!html.includes("portal-app-shell")) {
  html = html.replace("<html", '<html class="portal-app-shell"');
}
if (!html.includes("__PORTAL_STATIC_BASE")) {
  html = html.replace("</head>", shellCss + bootScript + "</head>");
}

fs.writeFileSync(outPath, html, "utf8");
console.log("Wrote", outPath);
