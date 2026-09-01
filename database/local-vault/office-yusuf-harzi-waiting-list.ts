/**
 * Office — Yusuf Harzi (parent Rawda Said) stays on the WAITING LIST.
 *
 * Background: his registration form asked for Aquatic Activity / Acton / Monday
 * 5.00-5.30 and the office created a provisional hold so the family could finish
 * booking. Sevitha reported the family actually wanted Multi-Activity at SwimFarm
 * and put them on that waiting list, and on 14 Aug 2026 the office confirmed:
 * do not place him in a slot, leave him on the waiting list.
 *
 * What this does:
 *   1. Releases any PENDING slot reservation for this family (frees the public seat).
 *   2. Sets the booking lead to waiting_list (booking_status + client_status).
 *   3. Marks the registration document payload as waiting_list so the admin row
 *      no longer reads as a live slot request.
 *   4. Reports existing waiting-list entries. It only creates one when you name the
 *      slot explicitly with WAITLIST_SLOT, so we never invent the wrong list.
 *
 *   npx -y deno run -A database/local-vault/office-yusuf-harzi-waiting-list.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-yusuf-harzi-waiting-list.ts
 *
 * Optional, only if the dry run shows no waiting-list entry yet:
 *   WAITLIST_SLOT=swimfarm_multi_sunday APPLY=1 npx -y deno run -A \
 *     database/local-vault/office-yusuf-harzi-waiting-list.ts
 *   WAITLIST_SLOT=acton_aquatic_monday  APPLY=1 npx -y deno run -A \
 *     database/local-vault/office-yusuf-harzi-waiting-list.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const WAITLIST_SLOT = (Deno.env.get("WAITLIST_SLOT") || "").trim();

const PARENT_EMAIL = "rawda_said@yahoo.co.uk";
const PARENT_NAME = "Rawda Said";
const PARENT_MOBILE = "07476407735";
const PARTICIPANT = "Yusuf Harzi";
const DOC_PDF_PATH = "client_registration/2026-08-12T18-14-22_Yusuf_Harzi_office_rebuild/form.pdf";

/** The two candidate lists. Keys match WAITLIST_SLOT. */
const SLOT_CHOICES: Record<string, Record<string, string>> = {
  swimfarm_multi_sunday: {
    service_key: "multi",
    service_label: "Multi-Activity",
    venue: "SwimFarm",
    day_name: "Sunday",
    time_label: "12.30 - 2.00",
    slot_id: "live-multi-swimfarm-sunday-12-30-12-30-2-00",
  },
  acton_aquatic_monday: {
    service_key: "aquatic",
    service_label: "Aquatic Activity",
    venue: "Acton",
    day_name: "Monday",
    time_label: "5.00 - 5.30",
    slot_id: "live-aquatic-acton-monday-17-00-5-00-5-30",
  },
};

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

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!serviceKey) {
  console.error(
    "No SUPABASE_SERVICE_ROLE_KEY. Run this where local-secrets/secrets.env exists, " +
      "or export the key first.",
  );
  Deno.exit(1);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  serviceKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const nowIso = new Date().toISOString();
console.log(APPLY ? "APPLY" : "DRY RUN");

/* ------------------------------------------------------------- 0. read ---- */

const { data: doc, error: docErr } = await admin
  .from("portal_participant_documents")
  .select("id, participant_name, parent_name, parent_email, payload_json, status")
  .eq("pdf_storage_path", DOC_PDF_PATH)
  .maybeSingle();
if (docErr) throw new Error(docErr.message);
if (!doc) throw new Error(`registration document not found at ${DOC_PDF_PATH}`);

const { data: leads, error: leadErr } = await admin
  .from("portal_booking_leads")
  .select("id, parent_name, email, mobile, booking_status, client_status, registration_status")
  .ilike("email", PARENT_EMAIL);
if (leadErr) throw new Error(leadErr.message);
const lead = (leads || [])[0] || null;

const { data: holds, error: holdErr } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, slot_id, service_name, venue, day_label, time_label, status, hold_expires_at, notes")
  .or(`document_id.eq.${doc.id},parent_email.ilike.${PARENT_EMAIL}`);
if (holdErr) throw new Error(holdErr.message);

const { data: waits, error: waitErr } = await admin
  .from("portal_waitlist_entries")
  .select("id, participant_name, parent_name, email, service_label, venue, day_name, time_label, slot_id, status, created_at")
  .ilike("email", PARENT_EMAIL);
if (waitErr) throw new Error(waitErr.message);

console.log("\nDocument:", {
  id: doc.id,
  participant: doc.participant_name,
  status: doc.status,
});
console.log("Lead:", lead ? {
  id: lead.id,
  booking_status: lead.booking_status,
  client_status: lead.client_status,
} : "none found");
console.log("Slot reservations:", holds);
console.log("Waiting-list entries:", waits);

const pendingHolds = (holds || []).filter((h) => String(h.status) === "pending");
const activeWaits = (waits || []).filter((w) => String(w.status) === "active");

/* --------------------------------------------------------- 1. plan/apply -- */

const plan: string[] = [];

for (const h of pendingHolds) {
  plan.push(`release hold ${h.id} (${h.service_name} ${h.venue} ${h.day_label} ${h.time_label})`);
}
if (lead && (lead.booking_status !== "waiting_list" || lead.client_status !== "waiting_list")) {
  plan.push(
    `lead ${lead.id}: booking_status ${lead.booking_status} -> waiting_list, ` +
      `client_status ${lead.client_status} -> waiting_list`,
  );
}
plan.push(`document ${doc.id}: payload office_placement -> waiting_list`);

let creatingWaitlist: Record<string, string> | null = null;
if (!activeWaits.length) {
  if (WAITLIST_SLOT && SLOT_CHOICES[WAITLIST_SLOT]) {
    creatingWaitlist = SLOT_CHOICES[WAITLIST_SLOT];
    plan.push(
      `create waiting-list entry: ${creatingWaitlist.service_label} ${creatingWaitlist.venue} ` +
        `${creatingWaitlist.day_name} ${creatingWaitlist.time_label}`,
    );
  } else {
    plan.push(
      "NO active waiting-list entry found and WAITLIST_SLOT not set -> not creating one. " +
        `Re-run with WAITLIST_SLOT=${Object.keys(SLOT_CHOICES).join(" | ")} if you want one.`,
    );
  }
} else {
  plan.push(
    `keep existing waiting-list entry: ${activeWaits
      .map((w) => `${w.service_label} ${w.venue} ${w.day_name} ${w.time_label}`)
      .join(" / ")}`,
  );
}

console.log("\nPlan:");
for (const p of plan) console.log("  -", p);

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to write.");
  Deno.exit(0);
}

for (const h of pendingHolds) {
  const { error } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "released",
      released_at: nowIso,
      updated_at: nowIso,
      notes: [String(h.notes || "").trim(), "Office 14 Aug 2026: family stays on waiting list - seat released."]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 2000),
    })
    .eq("id", h.id);
  if (error) throw new Error(`release ${h.id}: ${error.message}`);
  console.log("RELEASED hold", h.id);
}

if (lead) {
  const { error } = await admin
    .from("portal_booking_leads")
    .update({
      booking_status: "waiting_list",
      client_status: "waiting_list",
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", lead.id);
  if (error) throw new Error(`lead ${lead.id}: ${error.message}`);
  console.log("LEAD -> waiting_list", lead.id);
}

{
  const payload = {
    ...((doc.payload_json || {}) as Record<string, unknown>),
    office_placement: "waiting_list",
    office_placement_note:
      "Office 14 Aug 2026: not placed in a slot - stays on the waiting list. The Acton Monday slot in the form was the parent's original request only.",
  };
  const { error } = await admin
    .from("portal_participant_documents")
    .update({ payload_json: payload })
    .eq("id", doc.id);
  if (error) throw new Error(`document ${doc.id}: ${error.message}`);
  console.log("DOCUMENT payload marked waiting_list", doc.id);
}

if (creatingWaitlist) {
  const { data: ins, error } = await admin
    .from("portal_waitlist_entries")
    .insert({
      lead_id: lead?.id || null,
      participant_name: PARTICIPANT,
      parent_name: PARENT_NAME,
      email: PARENT_EMAIL,
      mobile: PARENT_MOBILE,
      ...creatingWaitlist,
      note: "Added by office 14 Aug 2026 - registration complete, no slot placed.",
      source: "office",
      status: "active",
      updated_at: nowIso,
    })
    .select("id, service_label, venue, day_name, time_label, slot_id")
    .maybeSingle();
  if (error) throw new Error(`waitlist insert: ${error.message}`);
  console.log("WAITLIST created", ins);
}

console.log("\nDone.");
