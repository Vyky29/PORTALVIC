/**
 * Genera ELEMENTOR/MEDIOS/admin_embed.html + admin_dashboard.elementor.html (solo iframe, sin script).
 * URL y ?v= salen de scripts/portal_admin_medios.mjs
 */
import fs from "fs";
import path from "path";
import { PORTAL_ADMIN_MEDIOS_BASE, PORTAL_ADMIN_MEDIOS_V } from "./portal_admin_medios.mjs";
import { ELEMENTOR_MEDIOS_DIR, WORKING_UI_DIR } from "./elementor_medios_paths.mjs";
import { syncElementorMediosDatabaseAssets } from "./sync_elementor_medios_database_assets.mjs";

const root = WORKING_UI_DIR;
const fragmentPath = path.join(root, "admin_dashboard.html");
const outPath = path.join(ELEMENTOR_MEDIOS_DIR, "admin_embed.html");
const elementorPath = path.join(ELEMENTOR_MEDIOS_DIR, "admin_dashboard.elementor.html");

await syncElementorMediosDatabaseAssets();

const fragment = fs.readFileSync(fragmentPath, "utf8").trim();
/* admin_dashboard.html vive en working_ui/ (fallback ELEMENTOR/MEDIOS/…). En Medios todo va plano en …/2026/05/. */
const fragmentForMediosEmbed = fragment.replace(
  '<script src="ELEMENTOR/MEDIOS/clients_payments_portal_data.js"></script>',
  '<script src="clients_payments_portal_data.js"></script>'
);

const parentShellHideScript = `<script>
  (function portalInjectParentWpShellHide(){
    try{
      if(window.parent === window) return;
      var PH = window.parent;
      var h1 = "";
      var h2 = "";
      try{ h1 = String(window.location.hostname || "").replace(/^www\\./, "").toLowerCase(); }catch(_){}
      try{ h2 = String(PH.location.hostname || "").replace(/^www\\./, "").toLowerCase(); }catch(_){ return; }
      if(!h1 || h1 !== h2) return;
      var pdoc = PH.document;
      var html = pdoc.documentElement;
      if(!html) return;
      html.classList.add("portal-app-shell");
      var css =
        "html.portal-app-shell body.admin-bar{padding-top:0!important;margin-top:0!important}"+
        "html.portal-app-shell #wpadminbar,"+
        "html.portal-app-shell #masthead,"+
        "html.portal-app-shell header#masthead,"+
        "html.portal-app-shell .site-header,"+
        "html.portal-app-shell #site-header,"+
        "html.portal-app-shell .site-header-wrap,"+
        "html.portal-app-shell .ast-primary-header-bar,"+
        "html.portal-app-shell .ast-above-header,"+
        "html.portal-app-shell .ast-above-header-wrap,"+
        "html.portal-app-shell .elementor-location-header,"+
        "html.portal-app-shell .elementor-location-footer,"+
        "html.portal-app-shell #colophon,"+
        "html.portal-app-shell footer.site-footer,"+
        "html.portal-app-shell .site-footer,"+
        "html.portal-app-shell #footer,"+
        "html.portal-app-shell .site-bottom-footer-inner-wrap,"+
        "html.portal-app-shell .footer-widget-area{"+
        "display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;pointer-events:none!important}"+
        "html.portal-app-shell .site-content,"+
        "html.portal-app-shell #content,"+
        "html.portal-app-shell .site-main,"+
        "html.portal-app-shell #primary{margin-top:0!important;padding-top:0!important}"+
        "html.portal-app-shell #page,"+
        "html.portal-app-shell .site{margin-top:0!important;padding-top:0!important}"+
        "html.portal-app-shell,html.portal-app-shell body{max-width:100vw!important;overflow:hidden!important;height:100%!important}"+
        "html.portal-app-shell #page,"+
        "html.portal-app-shell .site,"+
        "html.portal-app-shell .site-content,"+
        "html.portal-app-shell #content,"+
        "html.portal-app-shell #primary,"+
        "html.portal-app-shell .site-main{max-width:none!important;width:100%!important;overflow:hidden!important}"+
        "html.portal-app-shell body,html.portal-app-shell #page{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}"+
        "html.portal-app-shell .elementor-section.elementor-section-boxed>.elementor-container{max-width:none!important;width:100%!important}"+
        "html.portal-app-shell .elementor-section > .elementor-container{max-width:none!important}"+
        "html.portal-app-shell .e-con,html.portal-app-shell .e-con-inner,html.portal-app-shell .elementor-widget-wrap{max-width:none!important}"+
        "html.portal-app-shell .elementor-widget-shortcode .elementor-widget-container,"+
        "html.portal-app-shell .elementor-widget-shortcode{width:100%!important;max-width:none!important;padding-left:0!important;padding-right:0!important}"+
        "html.portal-app-shell iframe[title=\\\"clubSENsational Admin\\\"],"+
        "html.portal-app-shell iframe[src*=\\\"admin_embed.html\\\"]{"+
        "position:fixed!important;left:0!important;right:0!important;width:100vw!important;max-width:100vw!important;"+
        "top:var(--wp-admin--admin-bar--height,0px)!important;"+
        "height:calc(100dvh - var(--wp-admin--admin-bar--height,0px))!important;"+
        "max-height:calc(100dvh - var(--wp-admin--admin-bar--height,0px))!important;"+
        "border:0!important;margin:0!important;padding:0!important;display:block!important;"+
        "box-sizing:border-box!important;z-index:2147483000!important;background:#f1f5f9!important}";
      var st = pdoc.getElementById("portal-hide-wp-chrome-parent");
      if(!st){
        st = pdoc.createElement("style");
        st.id = "portal-hide-wp-chrome-parent";
        (pdoc.head || html).appendChild(st);
      }
      st.textContent = css;
      var pb = pdoc.body;
      if(pb){
        pb.style.margin = "0";
        try{ pb.style.paddingTop = "0"; }catch(_){}
      }
    }catch(_e){}
  })();
  </script>`;

const portalMediosCaptureScriptLoadErrors = `<script>
  (function portalMediosCaptureScriptLoadErrors(){
    window.__PORTAL_MEDIOS_BASE = "${PORTAL_ADMIN_MEDIOS_BASE}/";
    window.__PORTAL_MEDIOS_V = "${PORTAL_ADMIN_MEDIOS_V}";
    window.__PORTAL_MEDIOS_SCRIPT_ERRORS = [];
    function escHtml(s){
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    }
    window.portalReportMediosScriptError = function (label, src) {
      try {
        var row = { label: String(label || "script"), src: String(src || ""), t: Date.now() };
        window.__PORTAL_MEDIOS_SCRIPT_ERRORS.push(row);
        var id = "portal-medios-script-error-banner";
        var el = document.getElementById(id);
        var item =
          '<div style="margin:6px 0;overflow-wrap:break-word;font-size:12px">' +
          "<strong>" +
          escHtml(row.label) +
          "</strong><br>" +
          '<a href="' +
          escHtml(row.src) +
          '" target="_blank" rel="noopener" style="color:#7dd3fc;text-decoration:underline">' +
          escHtml(row.src) +
          "</a>" +
          "</div>";
        if (!el) {
          el = document.createElement("div");
          el.id = id;
          el.setAttribute("role", "alert");
          el.style.cssText =
            "position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#450a0a;color:#fecaca;padding:10px 14px;font:13px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.45);max-height:42vh;overflow:auto";
          el.innerHTML =
            '<strong style="display:block;margin-bottom:6px">Medios: no se pudo cargar un .js (404, nombre distinto o red)</strong>' +
            '<p style="margin:0 0 8px;opacity:.95;max-width:56rem;overflow-wrap:break-word">' +
            'El bundle del admin debe estar como <code style="background:rgba(0,0,0,.28);padding:2px 6px;border-radius:4px">admin_dashboard.app_.js</code> ' +
            '(WordPress Medios suele añadir el guión bajo antes de <code style="background:rgba(0,0,0,.28);padding:2px 6px;border-radius:4px">.js</code>). ' +
            'Sube desde <code style="background:rgba(0,0,0,.28);padding:2px 6px;border-radius:4px">working_ui/ELEMENTOR/MEDIOS/</code> a ' +
            '<code style="background:rgba(0,0,0,.28);padding:2px 6px;border-radius:4px">wp-content/uploads/2026/05/</code> con ese nombre exacto.</p>' +
            '<div data-portal-err-list="1"></div>';
          (document.body || document.documentElement).appendChild(el);
        }
        var list = el.querySelector("[data-portal-err-list]");
        if (list) list.insertAdjacentHTML("beforeend", item);
      } catch (_e) {}
    };
    window.addEventListener(
      "error",
      function (ev) {
        try {
          var t = ev && ev.target;
          if (!t || String(t.tagName || "").toUpperCase() !== "SCRIPT") return;
          var src = t.src || "";
          if (!src || src.indexOf("/wp-content/uploads/2026/05/") === -1) return;
          if (typeof window.portalReportMediosScriptError === "function") {
            window.portalReportMediosScriptError("Fallo al cargar script (revisa consola Network)", src);
          }
        } catch (_e2) {}
      },
      true
    );
  })();
  </script>`;

const doc = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light" />
  <title>clubSENsational · Admin</title>
${parentShellHideScript}
${portalMediosCaptureScriptLoadErrors}
</head>
<body style="margin:0;padding:0;background:#f1f5f9">
${fragmentForMediosEmbed}
</body>
</html>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, doc, "utf8");

const embedUrl = `${PORTAL_ADMIN_MEDIOS_BASE}/admin_embed.html?v=${PORTAL_ADMIN_MEDIOS_V}`;
const elementorSnippet = `<iframe src="${embedUrl}" title="clubSENsational Admin" loading="lazy" style="width:100%;min-height:100dvh;border:0;display:block;background:#f1f5f9"></iframe>
`;
fs.writeFileSync(elementorPath, elementorSnippet, "utf8");

console.log("Wrote", outPath, { bytes: Buffer.byteLength(doc, "utf8") });
console.log("Wrote", elementorPath, { bytes: Buffer.byteLength(elementorSnippet, "utf8"), embedUrl });
