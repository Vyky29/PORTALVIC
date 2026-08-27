/**
 * Tom Eriksson (89) · Kirstin — travelling; will confirm + pay by end of August.
 * Soft hold + move Autumn flexi first half due date to 29 Aug 2026 (INV-P-0349).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-tom-soft-hold-due-aug29.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-tom-soft-hold-due-aug29.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { upsertSoftHold } from "../../supabase/functions/_shared/portal_payment_holds.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "89";
const PARENT_PERSON_ID = "1795640";
const INV = "INV-P-0349";
const NEW_DUE = "2026-08-29";
const HALF2_DUE = "2026-10-26";

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

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, next_instalment_due, payment_status, payment_schedule, notes",
  )
  .eq("invoice_number", INV)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr) throw invErr;
if (!inv) throw new Error(`Missing ${INV}`);
if (String(inv.payment_status).toLowerCase() === "paid") {
  throw new Error(`${INV} already paid`);
}

const schedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    status: "pending",
    paid_at: null,
    due_date: NEW_DUE,
    paid_via: null,
    amount_gbp: 350,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    status: "pending",
    paid_at: null,
    due_date: HALF2_DUE,
    paid_via: null,
    amount_gbp: 350,
  },
];

const holdNote =
  "Office 15 Aug 2026 · Soft hold: family travelling; will message + pay by end of August (due 29 Aug). Do not chase aggressively until then.";

console.log("Plan:");
console.log(`  ${INV} due ${inv.due_date} → ${NEW_DUE}`);
console.log(`  Soft hold on contact ${CONTACT_ID}`);
console.log(`  Reenrol office_note`);

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1.");
  Deno.exit(0);
}

const noteExtra =
  `Office 15 Aug 2026 · Travelling — soft hold; 1st half due moved to ${NEW_DUE}.`;
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    due_date: NEW_DUE,
    next_instalment_due: NEW_DUE,
    payment_schedule: schedule,
    notes: [String(inv.notes || "").trim(), noteExtra].filter(Boolean).join(" · ").slice(0, 800),
    updated_at: new Date().toISOString(),
  })
  .eq("id", inv.id);
if (upErr) throw upErr;
console.log("Invoice due updated", INV, NEW_DUE);

const hold = await upsertSoftHold(admin, {
  contactId: CONTACT_ID,
  parentPersonId: PARENT_PERSON_ID,
  invoiceShareId: String(inv.id),
  notes: holdNote,
  actorUserId: null,
  bumpReminder: false,
});
console.log("Soft hold", hold.id, hold.status);

const { data: sub, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (subErr) throw subErr;
if (sub?.id && sub.payload && typeof sub.payload === "object") {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const note = String(payload.office_note || "");
  payload.office_note =
    `${note} · 2026-08-15: soft hold — travelling; will confirm + pay by end Aug; INV-P-0349 1st half due ${NEW_DUE}.`.trim();
  const { error: pErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", sub.id);
  if (pErr) throw pErr;
  console.log("Reenrol office_note updated");
}

console.log(JSON.stringify({ ok: true, invoice: INV, due: NEW_DUE, hold_id: hold.id }, null, 2));
