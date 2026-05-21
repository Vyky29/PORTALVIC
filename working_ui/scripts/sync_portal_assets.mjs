/**
 * Sync database/ JS + working_ui root app modules + brand rasters into working_ui/portal/.
 * Editable sources stay in database/; deploy serves portal/ from Vercel (working_ui outputDirectory).
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { DATABASE_DIR, PORTAL_DIR, WORKING_UI_DIR } from "./portal_paths.mjs";

const DATABASE_JS = [
  "auth-handler.js",
  "supabase-client.js",
  "auth-map.js",
  "term_from_timetable.js",
  "staff_dashboard_spreadsheet_bundle.js",
  "staff_dashboard_spreadsheet_adapter.js",
  "clients_info_embed.js",
];

const ROOT_JS_MOVE_TO_PORTAL = [
  "admin-portal-documents.js",
  "venue_review_app.js",
  "lead_feedback_report_app.js",
  "termreview_app.js",
  "swtermreview_app.js",
  "observation_portal_app.js",
  "staff_performance_review_app.js",
  "portal_documents.js",
  "portal_return_and_shell.js",
  "portal_brand.js",
  "announcements_scripts.js",
];

const SERVICE_WORKER_COPY = "clubsensational-portal-sw.js";

const RASTER_FILES = [
  "F-02-1.png",
  "F-06-1.png",
  "Logo-CS-azul.png",
  "SWProgramme.png",
  "Programme.png",
  "logoPDF.jpg",
  "logoPDF.png",
];

const MIN_IMAGE_BYTES = 200;

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function moveWorkingUiRootJsToPortal(name) {
  const from = path.join(WORKING_UI_DIR, name);
  const to = path.join(PORTAL_DIR, name);
  if (!fs.existsSync(from)) return;
  if (path.resolve(from) === path.resolve(to)) return;
  copyFile(from, to);
  fs.unlinkSync(from);
}

function syncRasterIntoPortal() {
  let ok = 0;
  let miss = 0;
  for (const out of RASTER_FILES) {
    const dest = path.join(PORTAL_DIR, out);
    const localFrom = path.join(WORKING_UI_DIR, out);
    if (fs.existsSync(localFrom) && fs.statSync(localFrom).size >= MIN_IMAGE_BYTES) {
      copyFile(localFrom, dest);
      ok++;
    } else if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_IMAGE_BYTES) {
      ok++;
    } else {
      console.warn("sync_portal_assets: missing raster (add to working_ui/ or portal/):", out);
      miss++;
    }
  }
  return { ok, miss };
}

export async function syncPortalAssets() {
  fs.mkdirSync(PORTAL_DIR, { recursive: true });
  let dbN = 0;
  for (const f of DATABASE_JS) {
    const from = path.join(DATABASE_DIR, f);
    const to = path.join(PORTAL_DIR, f);
    if (!fs.existsSync(from)) {
      console.warn("sync_portal_assets: missing database file:", from);
      continue;
    }
    copyFile(from, to);
    dbN++;
  }

  let moved = 0;
  for (const f of ROOT_JS_MOVE_TO_PORTAL) {
    const from = path.join(WORKING_UI_DIR, f);
    if (!fs.existsSync(from)) continue;
    moveWorkingUiRootJsToPortal(f);
    moved++;
  }

  const swFrom = path.join(WORKING_UI_DIR, SERVICE_WORKER_COPY);
  if (fs.existsSync(swFrom)) {
    copyFile(swFrom, path.join(PORTAL_DIR, SERVICE_WORKER_COPY));
  }

  const raster = syncRasterIntoPortal();

  console.log("sync_portal_assets:", {
    databaseCopied: dbN,
    rootAppsMovedToPortal: moved,
    serviceWorkerCopied: fs.existsSync(swFrom),
    rasterPresent: raster.ok,
    rasterMissing: raster.miss,
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await syncPortalAssets();
