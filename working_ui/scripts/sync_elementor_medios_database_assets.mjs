/**
 * Rellena working_ui/ELEMENTOR/MEDIOS con todo el JS (y PNG/JPG de marca) que debe existir en …/uploads/2026/05/
 *
 * - Copia desde database/: auth + supabase + auth-map + spreadsheet + term + clients_info
 * - Mueve desde la raíz de working_ui/ los bundles de portales (solo quedan en MEDIOS)
 * - Copia clubsensational-portal-sw.js
 * - Descarga raster (PNG/JPG) desde el sitio público si fetch está disponible (coloca copias planas en MEDIOS)
 *
 * La fuente editable de auth/supabase/auth-map sigue en database/.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { PORTAL_ADMIN_MEDIOS_BASE } from "./portal_admin_medios.mjs";
import {
  DATABASE_DIR,
  ELEMENTOR_MEDIOS_DIR,
  WORKING_UI_DIR,
} from "./elementor_medios_paths.mjs";

const DATABASE_JS = [
  "auth-handler.js",
  "supabase-client.js",
  "auth-map.js",
  "term_from_timetable.js",
  "staff_dashboard_spreadsheet_bundle.js",
  "staff_dashboard_spreadsheet_adapter.js",
  "clients_info_embed.js",
];

/** Única copia en repo: working_ui/ELEMENTOR/MEDIOS (subir a Medios). */
const ROOT_JS_MOVE_TO_MEDIOS = [
  "venue_review_app.js",
  "lead_feedback_report_app.js",
  "termreview_app.js",
  "swtermreview_app.js",
  "observation_portal_app.js",
  "staff_performance_review_app.js",
  "portal_documents.js",
  "portal_return_and_shell.js",
  "announcements_scripts.js",
];

const SERVICE_WORKER_COPY = "clubsensational-portal-sw.js";

/** Intenta varias URLs (03 histórico, 05 plano) → un solo nombre en MEDIOS. */
const RASTER_FETCHES = [
  {
    out: "F-02-1.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/F-02-1.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/03/F-02-1.png",
      "https://clubsensational.org/wp-content/uploads/2026/03/F-02-1.png",
    ],
  },
  {
    out: "F-06-1.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/F-06-1.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/03/F-06-1.png",
    ],
  },
  {
    out: "Logo-CS-azul.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/Logo-CS-azul.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/03/Logo-CS-azul.png",
    ],
  },
  {
    out: "SWProgramme.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/SWProgramme.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/05/SWProgramme.png",
    ],
  },
  {
    out: "Programme.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/Programme.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/03/Programme.png",
    ],
  },
  {
    out: "logoPDF.jpg",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/logoPDF.jpg`,
      "https://www.clubsensational.org/wp-content/uploads/2026/05/logoPDF.jpg",
    ],
  },
  {
    out: "logoPDF.png",
    urls: [
      `${PORTAL_ADMIN_MEDIOS_BASE}/logoPDF.png`,
      "https://www.clubsensational.org/wp-content/uploads/2026/05/logoPDF.png",
    ],
  },
];

const MIN_IMAGE_BYTES = 200;

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function moveWorkingUiRootJsToMedios(name) {
  const from = path.join(WORKING_UI_DIR, name);
  const to = path.join(ELEMENTOR_MEDIOS_DIR, name);
  if (!fs.existsSync(from)) {
    return;
  }
  if (path.resolve(from) === path.resolve(to)) return;
  copyFile(from, to);
  fs.unlinkSync(from);
}

async function fetchRasterIntoMedios() {
  const hasFetch = typeof fetch === "function";
  if (!hasFetch) {
    console.warn("sync_elementor_medios: fetch no disponible; solo copias locales de PNG/JPG");
  }
  let ok = 0;
  let miss = 0;
  for (const { out, urls } of RASTER_FETCHES) {
    const dest = path.join(ELEMENTOR_MEDIOS_DIR, out);
    const localFrom = path.join(WORKING_UI_DIR, out);
    if (fs.existsSync(localFrom)) {
      try {
        if (fs.statSync(localFrom).size >= MIN_IMAGE_BYTES) {
          copyFile(localFrom, dest);
          ok++;
          continue;
        }
      } catch {
        /* fall through to fetch */
      }
    }
    if (!hasFetch) {
      console.warn("sync_elementor_medios: no hay copia local ni fetch para", out);
      miss++;
      continue;
    }
    let wrote = false;
    for (const url of urls) {
      try {
        const r = await fetch(url, { redirect: "follow" });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < MIN_IMAGE_BYTES) continue;
        fs.writeFileSync(dest, buf);
        wrote = true;
        ok++;
        break;
      } catch {
        /* try next */
      }
    }
    if (!wrote) {
      console.warn("sync_elementor_medios: no se pudo descargar", out);
      miss++;
    }
  }
  return { ok, miss };
}

export async function syncElementorMediosDatabaseAssets() {
  fs.mkdirSync(ELEMENTOR_MEDIOS_DIR, { recursive: true });
  let dbN = 0;
  for (const f of DATABASE_JS) {
    const from = path.join(DATABASE_DIR, f);
    const to = path.join(ELEMENTOR_MEDIOS_DIR, f);
    if (!fs.existsSync(from)) {
      console.warn("sync_elementor_medios: missing database file:", from);
      continue;
    }
    copyFile(from, to);
    dbN++;
  }

  let moved = 0;
  for (const f of ROOT_JS_MOVE_TO_MEDIOS) {
    const from = path.join(WORKING_UI_DIR, f);
    if (!fs.existsSync(from)) continue;
    moveWorkingUiRootJsToMedios(f);
    moved++;
  }

  const swFrom = path.join(WORKING_UI_DIR, SERVICE_WORKER_COPY);
  if (fs.existsSync(swFrom)) {
    copyFile(swFrom, path.join(ELEMENTOR_MEDIOS_DIR, SERVICE_WORKER_COPY));
  }

  const raster = await fetchRasterIntoMedios();

  console.log("sync_elementor_medios:", {
    databaseCopied: dbN,
    rootAppsMovedToMedios: moved,
    serviceWorkerCopiedToMedios: fs.existsSync(swFrom),
    rasterDownloaded: raster.ok,
    rasterMissing: raster.miss,
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await syncElementorMediosDatabaseAssets();
