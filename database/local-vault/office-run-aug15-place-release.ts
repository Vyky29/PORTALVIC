/**
 * Live APPLY unpaid Aug-15 place release (Karo, Kareena, Yunis, Shire, Mia, …).
 *   APPLY=1 npx -y deno run -A database/local-vault/office-run-aug15-place-release.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runUnpaidAug15PlaceRelease } from "../../supabase/functions/_shared/portal_reenrol_release_unpaid_aug15.ts";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const dry = await runUnpaidAug15PlaceRelease(admin, { force: true, dry_run: true });
console.log("DRY", JSON.stringify(dry, null, 2));

if (!APPLY) {
  console.log("Re-run with APPLY=1 to write MADRE + in_class + hide invoices.");
  Deno.exit(0);
}

const live = await runUnpaidAug15PlaceRelease(admin, { force: true, dry_run: false });
mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/aug15-place-release-live.json",
  JSON.stringify(live, null, 2),
);
console.log("LIVE", JSON.stringify(live, null, 2));

if (live.ok && live.release_contacts?.length) {
  for (const cid of live.release_contacts) {
    const { data: c } = await admin
      .from("portal_parent_contacts")
      .select("child_display, parent_display, in_class")
      .eq("contact_id", cid)
      .maybeSingle();
    const { data: p } = await admin
      .from("portal_participants")
      .select("in_class")
      .eq("contact_id", cid)
      .maybeSingle();
    console.log("released", c?.child_display, {
      contact_in_class: c?.in_class,
      pax_in_class: p?.in_class,
    });
  }
}
