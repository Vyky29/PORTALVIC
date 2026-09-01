/**
 * Erik Ndregjoni (176) · Agata — office soft hold until 31 Aug 2026 23:59 London.
 * Auto-release (MADRE + in_class) from 1 Sep 2026 00:00 if still unpaid / no re-enrol.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-erik-hold-until-sep1.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-erik-hold-until-sep1.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { upsertSoftHold } from "../../supabase/functions/_shared/portal_payment_holds.ts";
import {
  OFFICE_HOLD_SEP1_DEADLINE_ISO,
  OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
  officeHoldSep1CaseIsSettled,
} from "../../supabase/functions/_shared/portal_office_hold_release_sep1.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "176";
const PARENT_PERSON_ID = "5797478";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: contact, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, parent_display, parent_person_id, in_class, email, mobile")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (cErr || !contact) throw new Error(cErr?.message || "missing contact 176");

const settled = await officeHoldSep1CaseIsSettled(admin, CONTACT_ID);
console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("contact", contact);
console.log("settled?", settled);
console.log(`Hold until ${OFFICE_HOLD_SEP1_DEADLINE_ISO} 23:59 London`);
console.log(`Auto-release from ${OFFICE_HOLD_SEP1_LIVE_FROM_ISO} 00:00 London if still unsettled`);

const holdNote =
  `Office 24 Aug 2026 · Soft hold: Agata may complete re-enrol + pay by ${OFFICE_HOLD_SEP1_DEADLINE_ISO} 23:59 Europe/London. Place auto-releases ${OFFICE_HOLD_SEP1_LIVE_FROM_ISO} 00:00 if unpaid / no re-enrol.`;

if (!APPLY) {
  console.log("\nWould upsert soft hold + keep in_class=true.");
  console.log("Also ensure contact 176 is in UNPAID_AUG15_EXCLUDE_CONTACTS (code).");
  Deno.exit(0);
}

if (settled.settled) {
  console.log("Already settled — soft hold still stamped for audit, no release path needed.");
}

const hold = await upsertSoftHold(admin, {
  contactId: CONTACT_ID,
  parentPersonId: contact.parent_person_id || PARENT_PERSON_ID,
  notes: holdNote,
  actorUserId: null,
  bumpReminder: false,
});
console.log("Soft hold", hold.id, hold.status);

// Keep place visible until Sep 1 job runs.
await admin
  .from("portal_parent_contacts")
  .update({ in_class: true, updated_at: new Date().toISOString() })
  .eq("contact_id", CONTACT_ID);
await admin
  .from("portal_participants")
  .update({ in_class: true, updated_at: new Date().toISOString() })
  .eq("contact_id", CONTACT_ID);

console.log(
  JSON.stringify(
    {
      ok: true,
      contact_id: CONTACT_ID,
      hold_id: hold.id,
      deadline: OFFICE_HOLD_SEP1_DEADLINE_ISO,
      release_from: OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
      settled,
    },
    null,
    2,
  ),
);
