/**
 * Portal static assets under working_ui/portal/ (Vercel outputDirectory sibling paths).
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKING_UI_DIR = path.join(__dirname, "..");
export const PORTAL_DIR = path.join(WORKING_UI_DIR, "portal");
export const REPO_ROOT_DIR = path.join(WORKING_UI_DIR, "..");
export const DATABASE_DIR = path.join(REPO_ROOT_DIR, "database");
