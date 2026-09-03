/**
 * Undo office re-enrol for Agata/Erik (176): void INV-P-0460, delete office
 * submission, restore soft hold until 31 Aug 23:59; release 1 Sep 00:00 if she
 * has not completed re-enrolment herself.
 *
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-agata-undo-office-reenrol-restore-hold.ts
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
const CONTACT = "176";
const PARENT_PERSON_ID = "5797478";
const SUB_ID = "c0cfef19-aab2-4e69-94dd-3d85eea0e592";
const INV = "INV-P-0460";

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

const now = new Date().toISOString();

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, notes")
  .eq("invoice_number", INV)
  .eq("contact_id", CONTACT)
  .maybeSingle();
if (invErr) throw invErr;

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, submitted_at, source")
  .eq("id", SUB_ID)
  .maybeSingle();

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("invoice", inv);
console.log("submission", sub);

if (!APPLY) {
  console.log("Re-run with APPLY=1 to void invoice, delete submission, restore soft hold.");
  Deno.exit(0);
}

if (!inv) throw new Error("missing INV-P-0460");
if (String(inv.payment_status).toLowerCase() === "paid") {
  throw new Error("refusing to void paid invoice");
}

const voidNote =
  `Voided ${now.slice(0, 10)} — office undo: Agata must complete re-enrolment herself; hold until ${OFFICE_HOLD_SEP1_DEADLINE_ISO} 23:59; release ${OFFICE_HOLD_SEP1_LIVE_FROM_ISO} 00:00 if incomplete.`;

const { error: voidErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_status: "void",
    share_status: "hidden",
    notes: `${String(inv.notes || "").trim()} · ${voidNote}`.trim(),
    updated_at: now,
  })
  .eq("id", inv.id);
if (voidErr) throw voidErr;
console.log("voided", INV);

if (sub?.id) {
  const { error: delErr } = await admin
    .from("portal_re_enrolment_submissions")
    .delete()
    .eq("id", SUB_ID)
    .eq("participant_contact_id", CONTACT);
  if (delErr) throw delErr;
  console.log("deleted submission", SUB_ID);
} else {
  console.log("submission already absent");
}

await admin
  .from("portal_parent_contacts")
  .update({
    in_class: true,
    funding_label: null,
    payment_method_label: null,
    updated_at: now,
  })
  .eq("contact_id", CONTACT);
await admin
  .from("portal_participants")
  .update({ in_class: true, updated_at: now })
  .eq("contact_id", CONTACT);

const holdNote =
  `Office 31 Aug 2026 · Soft hold restored: Agata must complete re-enrolment herself by ${OFFICE_HOLD_SEP1_DEADLINE_ISO} 23:59 Europe/London (choose funding + payment). Place auto-releases ${OFFICE_HOLD_SEP1_LIVE_FROM_ISO} 00:00 if incomplete. Invoice/payment after she submits.`;

const hold = await upsertSoftHold(admin, {
  contactId: CONTACT,
  parentPersonId: PARENT_PERSON_ID,
  notes: holdNote,
  actorUserId: "a0d439df-3a8f-439d-b427-b3459552eae1",
  bumpReminder: false,
});
console.log("soft hold", hold.id, hold.status);

const settled = await officeHoldSep1CaseIsSettled(admin, CONTACT);
console.log("settled?", settled);

const { data: checkSub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id")
  .eq("participant_contact_id", CONTACT)
  .eq("academic_year", "2026-27");
const { data: checkInv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, share_status")
  .eq("contact_id", CONTACT)
  .eq("invoice_number", INV);
const { data: openHold } = await admin
  .from("portal_family_payment_holds")
  .select("id, status, notes")
  .eq("contact_id", CONTACT)
  .eq("status", "soft_hold")
  .order("updated_at", { ascending: false })
  .limit(1);

console.log(JSON.stringify({ checkSub, checkInv, openHold, settled }, null, 2));
console.log("DONE");
