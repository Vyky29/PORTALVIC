/**
 * Incrusta CSS en admin_dashboard.html (bloque <style>).
 * Si Elementor da 500 al guardar, usa en su lugar:
 *   node working_ui/scripts/build_admin_dashboard_styles_loader.mjs
 * (HTML pequeño + ELEMENTOR/MEDIOS/admin_dashboard.styles.loader.js en Medios).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "..", "admin_dashboard.html");
const cssPath = path.join(__dirname, "..", "css", "admin_dashboard.css");

/**
 * Shrink CSS for Elementor/WordPress POST limits (not “line count”: total bytes).
 * Strips block comments + whitespace; keeps calc(), !important, combinators.
 */
function minifyCssForAdminInline(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

const cssRaw = fs.readFileSync(cssPath, "utf8").trim();
const css = minifyCssForAdminInline(cssRaw);
let html = fs.readFileSync(htmlPath, "utf8");

const linkRe =
  /<link rel="stylesheet" href="https:\/\/www\.clubsensational\.org\/wp-content\/uploads\/2026\/05\/admin_dashboard\.css\?v=[^"]+"\s*\/>/;

const inlineStyleRe =
  /(<meta charset="UTF-8" \/>\n)  <!--[\s\S]*?-->\n  <style>[\s\S]*?<\/style>\n(?=  <meta name="viewport")/;

const styleBlock = `<style>\n${css}\n</style>`;

if (linkRe.test(html)) {
  html = html.replace(
    linkRe,
    `  <!-- Estilos: incrustados + minificados (sin Medios para .css). -->\n  ${styleBlock}`
  );
} else if (inlineStyleRe.test(html)) {
  html = html.replace(
    inlineStyleRe,
    `$1  <!-- Estilos: incrustados + minificados (sin Medios para .css). -->\n  ${styleBlock}\n`
  );
} else {
  console.error(
    "Expected <link> to admin_dashboard.css OR inline <style> block after charset — nothing matched."
  );
  process.exit(1);
}

fs.writeFileSync(htmlPath, html, "utf8");
console.log("Inlined minified CSS into admin_dashboard.html", {
  cssRawChars: cssRaw.length,
  cssMinChars: css.length,
  htmlBytes: Buffer.byteLength(html, "utf8"),
});
