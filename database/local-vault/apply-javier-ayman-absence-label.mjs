/**
 * Apply Ayman absence label fix (disable updated_by trigger via SQL over PostgREST isn't possible;
 * use Postgres connection string when present, else instruct db push).
 */
import fs from "fs";
import { spawnSync } from "child_process";

const root = "/Users/victor/cursor/PORTALVIC";
const env = fs.readFileSync(root + "/local-secrets/secrets.env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

const sql = fs.readFileSync(
  root + "/database/local-vault/step-2026-07-13-javier-ayman-absence-label.sql",
  "utf8"
);

const dbUrl =
  get("DATABASE_URL") ||
  get("SUPABASE_DB_URL") ||
  get("POSTGRES_URL") ||
  get("SUPABASE_POSTGRES_URL");

if (!dbUrl) {
  // Fallback: raw REST won't work (updated_by trigger). Try npx supabase.
  console.log("No DATABASE_URL — trying npx supabase db execute / db push");
  const push = spawnSync(
    "npx",
    ["supabase", "db", "query", "-f", "database/local-vault/step-2026-07-13-javier-ayman-absence-label.sql"],
    { cwd: root, encoding: "utf8", shell: false }
  );
  console.log(push.stdout || "");
  console.error(push.stderr || "");
  process.exit(push.status || 1);
}

const psql = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});
console.log(psql.stdout || "");
console.error(psql.stderr || "");
process.exit(psql.status || 0);
