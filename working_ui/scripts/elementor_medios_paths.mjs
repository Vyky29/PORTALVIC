/**
 * Carpeta única de artefactos para subir a WordPress Medios (Elementor /admin).
 * Rutas relativas al directorio working_ui/.
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKING_UI_DIR = path.join(__dirname, "..");
export const ELEMENTOR_MEDIOS_DIR = path.join(WORKING_UI_DIR, "ELEMENTOR", "MEDIOS");
export const REPO_ROOT_DIR = path.join(WORKING_UI_DIR, "..");
export const DATABASE_DIR = path.join(REPO_ROOT_DIR, "database");
