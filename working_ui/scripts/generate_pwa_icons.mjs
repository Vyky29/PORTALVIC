/**
 * Regenerate PWA install icons from working_ui/FOOTERLOGO.png → portal/app-icon/*.png
 * Run after replacing FOOTERLOGO: node working_ui/scripts/generate_pwa_icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "FOOTERLOGO.png");
const OUT = path.join(ROOT, "portal", "app-icon");
const PORTAL_COPY = path.join(ROOT, "portal", "FOOTERLOGO.png");

const py = `
from PIL import Image
from pathlib import Path

SRC = Path(r"${SRC.replace(/\\/g, "\\\\")}")
OUT = Path(r"${OUT.replace(/\\/g, "\\\\")}")
PORTAL_COPY = Path(r"${PORTAL_COPY.replace(/\\/g, "\\\\")}")
BG = (244, 248, 251, 255)

if not SRC.is_file():
    raise SystemExit("Missing FOOTERLOGO.png at " + str(SRC))

src = Image.open(SRC).convert("RGBA")
OUT.mkdir(parents=True, exist_ok=True)
PORTAL_COPY.parent.mkdir(parents=True, exist_ok=True)
src.save(PORTAL_COPY, optimize=True)

def fit_square(size, maskable=False):
    pad_ratio = 0.12 if maskable else 0.06
    pad = max(8, int(size * pad_ratio))
    inner = size - pad * 2
    ratio = min(inner / src.width, inner / src.height)
    nw, nh = max(1, int(src.width * ratio)), max(1, int(src.height * ratio))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas

for name, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("apple-touch-icon.png", 180, False),
    ("icon-maskable-192.png", 192, True),
    ("icon-maskable-512.png", 512, True),
]:
    fit_square(size, maskable).convert("RGB").save(OUT / name, optimize=True)
    print("wrote", OUT / name)

print("OK", SRC.stat().st_size, "bytes")
`;

if (!fs.existsSync(SRC)) {
  console.error("Missing", SRC);
  process.exit(1);
}

const r = spawnSync("python", ["-c", py], { stdio: "inherit", cwd: ROOT });
process.exit(r.status === 0 ? 0 : 1);
