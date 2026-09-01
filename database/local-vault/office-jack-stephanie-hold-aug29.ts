/**
 * Jack Stratton (170) + Stephanie Ng (186): soft hold until 29 Aug 2026.
 * Move Autumn first-instalment due → 2026-08-29 so they are not released for unpaid Aug-15.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-jack-stephanie-hold-aug29.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-jack-stephanie-hold-aug29.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { upsertSoftHold } from "../../supabase/functions/_shared/portal_payment_holds.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  UNPAID_AUG15_EXCLUDE_CONTACTS,
  UNPAID_AUG15_EXCLUDE_INVOICES,
} from "../../supabase/functions/_shared/portal_reenrol_release_unpaid_aug15.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const NEW_DUE = "2026-08-29";

type Target = {
  contactId: string;
  parentPersonId: string | null;
  name: string;
  invoice: string;
};

const TARGETS: Target[] = [
  {
    contactId: "170",
    parentPersonId: null,
    name: "Jack Stratton",
    invoice: "INV-P-0115",
  },
  {
    contactId: "186",
    parentPersonId: null,
    name: "Stephanie Ng",
    invoice: "INV-P-0098",
  },
];

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

console.log(APPLY ? "APPLY" : "DRY");
console.log(
  "Note: also add these contact_ids / invoices to UNPAID_AUG15_EXCLUDE_* in code if cron already live.",
);
console.log("Current exclude contacts", [...UNPAID_AUG15_EXCLUDE_CONTACTS]);
console.log("Current exclude invoices", [...UNPAID_AUG15_EXCLUDE_INVOICES]);

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (${t.contactId}) · ${t.invoice} ===`);

  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, child_display, parent_display, parent_person_id")
    .eq("contact_id", t.contactId)
    .maybeSingle();
  const parentPersonId =
    t.parentPersonId ||
    (contact?.parent_person_id ? String(contact.parent_person_id) : null);

  const { data: inv, error: invErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, due_date, next_instalment_due, payment_status, payment_schedule, notes, amount_paid_gbp",
    )
    .eq("invoice_number", t.invoice)
    .eq("contact_id", t.contactId)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!inv) throw new Error(`Missing ${t.invoice}`);
  if (String(inv.payment_status).toLowerCase() === "paid") {
    console.log("Already paid — skip due move, still set soft hold if needed.");
  }

  const schedule = Array.isArray(inv.payment_schedule)
    ? (inv.payment_schedule as Array<Record<string, unknown>>).map((row) => {
        const due = String(row.due_date || "").slice(0, 10);
        const status = String(row.status || "pending").toLowerCase();
        // Move first pending Aug-15 (or current first pending) due to 29 Aug
        if (status !== "paid" && (due === "2026-08-15" || due === String(inv.due_date || "").slice(0, 10))) {
          return { ...row, due_date: NEW_DUE };
        }
        return row;
      })
    : [];

  // If schedule empty / single due on invoice header only
  const firstPending = schedule.find(
    (r) => String(r.status || "pending").toLowerCase() !== "paid",
  );
  if (firstPending && String(firstPending.due_date).slice(0, 10) !== NEW_DUE) {
    firstPending.due_date = NEW_DUE;
  }

  console.log("BEFORE due", inv.due_date, "paid", inv.amount_paid_gbp, "status", inv.payment_status);
  console.log("AFTER schedule", schedule);

  const holdNote =
    `Office 16 Aug 2026 · Soft hold until ${NEW_DUE}: office extension — do not release place / do not chase aggressively until then.`;

  if (!APPLY) {
    console.log("Would: due →", NEW_DUE, "+ soft hold + office_note");
    continue;
  }

  const noteExtra =
    `Office 16 Aug 2026 · Soft hold; first payment due moved to ${NEW_DUE} (office hold — keep place).`;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      due_date: NEW_DUE,
      next_instalment_due: NEW_DUE,
      payment_schedule: schedule.length ? schedule : inv.payment_schedule,
      notes: [String(inv.notes || "").trim(), noteExtra].filter(Boolean).join(" · ").slice(0, 800),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);
  if (upErr) throw upErr;
  console.log("Invoice due updated", t.invoice, NEW_DUE);

  const hold = await upsertSoftHold(admin, {
    contactId: t.contactId,
    parentPersonId,
    invoiceShareId: String(inv.id),
    notes: holdNote,
    actorUserId: null,
    bumpReminder: false,
  });
  console.log("Soft hold", hold.id, hold.status);

  const { data: sub } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, payload")
    .eq("participant_contact_id", t.contactId)
    .eq("academic_year", REENROL_ACADEMIC_YEAR)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sub?.id && sub.payload && typeof sub.payload === "object") {
    const payload = structuredClone(sub.payload) as Record<string, unknown>;
    const note = String(payload.office_note || "");
    payload.office_note =
      `${note} · 2026-08-16: soft hold until ${NEW_DUE}; ${t.invoice} first due moved (office — keep place).`.trim();
    const { error: pErr } = await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", sub.id);
    if (pErr) throw pErr;
    console.log("Reenrol office_note updated");
  }
}

console.log(
  APPLY
    ? "\nDone. Ensure UNPAID_AUG15_EXCLUDE_CONTACTS includes 170 + 186 (and/or invoices) before cron runs."
    : "\nDry OK. APPLY=1 to write.",
);
