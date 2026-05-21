import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "admin_dashboard.html");
const raw = fs.readFileSync(p, "utf8");
const lines = raw.split(/\n/).map((l) => l.replace(/\r$/, ""));
const out = [];
let i = 0;

while (i < lines.length) {
  if (i === 12 && lines[i].includes("portal-hide-wp-chrome")) {
    out.push('  <link rel="stylesheet" href="admin_dashboard.css" />');
    while (i < lines.length && !/^\s*<\/style>\s*$/.test(lines[i])) i++;
    if (i < lines.length) i++;
    continue;
  }
  if (i === 68 && /^\s*<style>\s*$/.test(lines[i])) {
    while (i < lines.length && !/^\s*<\/style>\s*$/.test(lines[i])) i++;
    if (i < lines.length) i++;
    continue;
  }
  if (i === 3664 && /^\s*<script>\s*$/.test(lines[i])) {
    out.push('  <script src="portal/admin_dashboard.app_.js"></script>');
    i++;
    while (i < lines.length && !/^\s*<\/script>\s*$/.test(lines[i])) i++;
    if (i < lines.length) i++;
    continue;
  }
  out.push(lines[i]);
  i++;
}

fs.writeFileSync(p, out.join("\n"), "utf8");
console.log("written", p, "lines", out.length, "was", lines.length);
