/**
 * Cache-bust stamper.
 * ------------------
 * Rewrites every asset cache-bust token (…file.ext?v=SOMETHING) in the built
 * output to a single per-deploy version. This guarantees that a new deploy
 * always invalidates the browser/PWA cache for JS/CSS/images, so staff never
 * have to reinstall the app to pick up a new UI version.
 *
 * We only touch `?v=` that directly follows a known static-asset extension, so
 * API query params (e.g. ?staff=…&v=…) are never affected.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Files whose text contents we scan for asset references.
const TEXT_EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest"]);

// Asset extensions that carry a cache-bust token worth rewriting.
const ASSET_EXT = "js|mjs|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|json";

const STAMP_RE = new RegExp(
  "(\\.(?:" + ASSET_EXT + "))\\?v=[^\"'`\\s)>&]+",
  "gi",
);

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      // Skip node_modules / VCS just in case they land in the output.
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(full, out);
    } else if (ent.isFile() && TEXT_EXT.has(extOf(ent.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} dir   Built output directory (e.g. dist/deploy).
 * @param {string} version  Deploy version token (URL-safe).
 * @returns {{files:number, replacements:number, version:string}}
 */
export function stampCacheBust(dir, version) {
  const ver = String(version || "").replace(/[^\w.\-]+/g, "") || String(Date.now());
  const files = walk(dir, []);
  let touched = 0;
  let total = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let count = 0;
    const next = text.replace(STAMP_RE, (_m, ext) => {
      count += 1;
      return ext + "?v=" + ver;
    });
    if (count > 0) {
      try {
        writeFileSync(file, next);
        touched += 1;
        total += count;
      } catch (e) {
        console.warn("[stamp-cache-bust] could not write", file, e && e.message);
      }
    }
  }
  return { files: touched, replacements: total, version: ver };
}

export function resolveDeployVersion() {
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (sha) return sha.slice(0, 8);
  return "b" + Date.now().toString(36);
}
