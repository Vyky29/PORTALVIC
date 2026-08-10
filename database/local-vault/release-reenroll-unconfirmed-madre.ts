/**
 * Apply post-deadline MADRE seat release (same rules as booking-offer auto).
 *
 * Dry run (no write):
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/release-reenroll-unconfirmed-madre.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/release-reenroll-unconfirmed-madre.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  applyReenrolReleaseRulesToMadre,
  ensureReenrolUnconfirmedReleasedOnMadre,
  MADRE_TERM_KEY,
} from "../../supabase/functions/_shared/portal_reenrol_release_madre.ts";
import type { MadreDoc } from "../../supabase/functions/_shared/portal_madre_fold_logic.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: row, error } = await admin
  .from("portal_madre_document")
  .select("revision, document, updated_at")
  .eq("term_key", MADRE_TERM_KEY)
  .maybeSingle();
if (error || !row?.document) throw new Error(error?.message || "madre_missing");

const previewDoc = structuredClone(row.document) as MadreDoc;
const preview = applyReenrolReleaseRulesToMadre(previewDoc);
console.log("revision", row.revision, row.updated_at);
console.log("would_change", preview.changed, "mia_acton", preview.miaPlacedOnActon);
console.log("sample_notes", preview.notes.slice(0, 40));

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write MADRE.");
  Deno.exit(0);
}

const result = await ensureReenrolUnconfirmedReleasedOnMadre(admin, { force: true });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) Deno.exit(1);
