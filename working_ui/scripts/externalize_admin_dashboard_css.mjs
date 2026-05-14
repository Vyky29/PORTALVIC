import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PORTAL_ADMIN_MEDIOS_BASE, PORTAL_ADMIN_MEDIOS_V } from "./portal_admin_medios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "..", "admin_dashboard.html");

const linkBlock = `  <!-- Estilos: hoja externa (HTML liviano para Elementor; ver comentario en <head>). -->
  <link rel="stylesheet" href="${PORTAL_ADMIN_MEDIOS_BASE}/admin_dashboard.css?v=${PORTAL_ADMIN_MEDIOS_V}" />
`;

let html = fs.readFileSync(htmlPath, "utf8");

/* Primer bloque grande <style> del admin (tras charset) → <link> a Medios/FTP. */
const re =
  /(<meta charset="UTF-8" \/>\n)  <!-- Estilos:[\s\S]*?\n  <style>[\s\S]*?<\/style>\n(?=  <meta name="viewport")/;

if (!re.test(html)) {
  console.error(
    "Pattern not found: expected <meta charset> then <!-- Estilos --> + <style>…</style> before <meta name=\"viewport\"."
  );
  process.exit(1);
}

html = html.replace(re, `$1${linkBlock}`);
fs.writeFileSync(htmlPath, html, "utf8");
console.log("Externalized CSS in admin_dashboard.html", {
  htmlBytes: Buffer.byteLength(html, "utf8"),
});
