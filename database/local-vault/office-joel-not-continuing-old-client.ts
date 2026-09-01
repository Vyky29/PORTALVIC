/**
 * Joel Hibbert-Nixon (390) — not continuing Autumn 26/27 → old client.
 *
 * - Re-enrol submission → not_continuing / withdraw Mon Aquatic
 * - in_class = false (participants + contacts)
 * - Hide office-created 26/27 term invoices INV-P-0142..0144
 * - MADRE seat released via REENROL_RELEASE_RULES (Joel → NO PARTICIPANT)
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-joel-not-continuing-old-client.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-joel-not-continuing-old-client.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureReenrolUnconfirmedReleasedOnMadre } from "../../supabase/functions/_shared/portal_reenrol_release_madre.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "390";
const CHILD = "Joel Hibbert-Nixon";
const REENROL_ACADEMIC_YEAR = "2026-27";
const NOTE =
  "Office 23 Jul 2026 — Anthony: Joel not continuing Autumn 26/27. Marked old client; place released.";

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

const payload = {
  source: "office",
  not_continuing: true,
  office_note: NOTE,
  choices: {
    weekly: {
      "pub-0": { choice: "withdraw", alternative: null },
    },
    day_centre: null,
    enrolment_cadence: "not_continuing",
    enrolment_cadence_label: "Not continuing 2026/27",
  },
  weekly_slots_snapshot: [
    {
      id: "pub-0",
      raw: "30' AQUATIC ACTIVITY (Monday)",
      serviceType: "AQUATIC ACTIVITY",
      durationMin: 30,
      day: "Monday",
      venue: "Acton",
      isWeekend: false,
      isDayCentre: false,
      pricePerSession: 50,
      timeSlot: "5 to 5.30",
      sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
      termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
    },
  ],
  term_totals: { autumn: 0, spring: 0, summer: 0, annual: 0 },
  declarations: { accurate: true, terms: true, office_proxy: true },
};

console.log(`=== ${CHILD} (${CONTACT_ID}) → not continuing / old client ===`);
if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write.");
  console.log("Would: update reenrol, in_class=false, hide INV-P-0142..0144, release MADRE Joel");
  Deno.exit(0);
}

const { data: existingSubs, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, submitted_at")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR);
if (subErr) throw new Error(subErr.message);

if (existingSubs?.length) {
  const { error } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", existingSubs[0].id);
  if (error) throw new Error(`reenrol update: ${error.message}`);
  console.log("Reenrol submission updated", existingSubs[0].id);
} else {
  const { data: inserted, error } = await admin
    .from("portal_re_enrolment_submissions")
    .insert({
      academic_year: REENROL_ACADEMIC_YEAR,
      participant_contact_id: CONTACT_ID,
      participant_name: CHILD,
      parent_first_name: "Anthony",
      parent_last_name: "Davis",
      parent_person_id: "7522257",
      source: "link",
      payload,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(`reenrol insert: ${error?.message}`);
  console.log("Reenrol submission inserted", inserted.id);
}

const now = new Date().toISOString();
{
  const { error } = await admin
    .from("portal_participants")
    .update({ in_class: false, updated_at: now })
    .eq("contact_id", CONTACT_ID);
  if (error) throw new Error(`participants: ${error.message}`);
  console.log("portal_participants.in_class = false");
}
{
  const { error } = await admin
    .from("portal_parent_contacts")
    .update({ in_class: false, updated_at: now })
    .eq("contact_id", CONTACT_ID);
  if (error) throw new Error(`contacts: ${error.message}`);
  console.log("portal_parent_contacts.in_class = false");
}

{
  const { data: invs, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, share_status, amount_gbp, payment_status")
    .eq("contact_id", CONTACT_ID)
    .in("invoice_number", ["INV-P-0142", "INV-P-0143", "INV-P-0144"]);
  if (error) throw new Error(`invoices list: ${error.message}`);
  for (const inv of invs || []) {
    if (inv.share_status === "hidden") {
      console.log("Already hidden", inv.invoice_number);
      continue;
    }
    const { error: uErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        share_status: "hidden",
        notes: NOTE,
        updated_at: now,
      })
      .eq("id", inv.id);
    if (uErr) throw new Error(`hide ${inv.invoice_number}: ${uErr.message}`);
    console.log("Hidden", inv.invoice_number, `£${inv.amount_gbp}`, inv.payment_status);
  }
}

{
  const { data: pay } = await admin
    .from("client_payments")
    .select("id, data")
    .eq("client_key", "joel")
    .maybeSingle();
  if (pay?.id) {
    const data = { ...(pay.data as Record<string, unknown> || {}) };
    data["Re-enrol 26/27"] = "Not continuing (office 23 Jul 2026 · Anthony) — old client";
    data.Notes = [String(data.Notes || data.Note || "").trim(), "NOT CONTINUING 2026/27 — old client"]
      .filter(Boolean)
      .join(" · ");
    const { error } = await admin
      .from("client_payments")
      .update({ data })
      .eq("id", pay.id);
    if (error) throw new Error(`client_payments: ${error.message}`);
    console.log("client_payments joel noted");
  } else {
    console.log("client_payments joel row missing — skipped");
  }
}

const release = await ensureReenrolUnconfirmedReleasedOnMadre(admin, { force: true });
if (!release.ok) throw new Error(`madre release: ${release.error}`);
console.log(
  "MADRE release",
  release.skipped ? `skipped (${release.reason})` : `changed ${release.changed}`,
  "rev",
  release.revision,
);
if (release.notes?.length) {
  for (const n of release.notes.filter((x) => /joel/i.test(x))) console.log(" -", n);
}

console.log("Done.");
