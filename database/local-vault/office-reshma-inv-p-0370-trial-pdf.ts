/**
 * Reshma / Rayden Rana · INV-P-0370 — backfill lost booking slot + regen PDF.
 *
 * Root cause: registration saved without booking_request (URL params lost), so no
 * reservation row and invoice only had "Wednesday".
 *
 * Set SLOT_ID to the MADRE slot id from booking portal, e.g.:
 *   live-aquatic-acton-wednesday-17-00-5-00-5-30
 *
 *   SLOT_ID=live-aquatic-acton-wednesday-17-00-5-00-5-30 \
 *   APPLY=1 npx -y deno run -A database/local-vault/office-reshma-inv-p-0370-trial-pdf.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { buildWeeklyOfferFromMadre } from "../../supabase/functions/_shared/portal_booking_seat_helper.ts";
import {
  formatBookingPdfHeaderMarker,
  regeneratePortalInvoiceSharePdf,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  bookingPortalServiceLabel,
  formatTrialSessionReference,
} from "../../supabase/functions/_shared/booking_portal_term_invoices.ts";
import {
  resolveSessionDateIso,
  type PortalBookingRequest,
} from "../../supabase/functions/_shared/portal_booking_context.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "403";
const INVOICE_NUMBER = "INV-P-0370";
const DOC_ID = "98856501-f360-4fac-8b4b-d75a045a14ae";
const TOKEN_ID = "99416c3f-6f15-45f1-944b-2a09c420ea31";
const SLOT_ID = (Deno.env.get("SLOT_ID") || "").trim();

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
loadEnv("database/local-vault/secrets.env");

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function splitParentName(display: string): { first: string; last: string } {
  const parts = clean(display, 200).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function slotFromMadre(admin: ReturnType<typeof createClient>, slotId: string) {
  const { data: madre } = await admin
    .from("portal_madre_document")
    .select("document")
    .eq("term_key", "summer-2026")
    .maybeSingle();
  if (!madre?.document) return null;
  const weekly = buildWeeklyOfferFromMadre(madre.document);
  return weekly.slots.find((s) => String(s.id) === slotId) || null;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: share } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (!share) throw new Error(`${INVOICE_NUMBER} not found`);

const { data: doc } = await admin
  .from("portal_participant_documents")
  .select("id, payload_json, parent_name, parent_email, participant_name")
  .eq("id", DOC_ID)
  .maybeSingle();
if (!doc) throw new Error("registration document not found");

let bookingRequest: PortalBookingRequest | null = null;
const payload =
  doc.payload_json && typeof doc.payload_json === "object"
    ? { ...(doc.payload_json as Record<string, unknown>) }
    : {};

const existing = payload.booking_request;
if (existing && typeof existing === "object" && !Array.isArray(existing)) {
  const br = existing as Record<string, unknown>;
  if (clean(br.slot_id, 160)) {
    bookingRequest = {
      from: "bookingportal",
      slot_id: clean(br.slot_id, 160),
      service_id: clean(br.service || br.service_id, 80) || null,
      service_name: clean(br.service_name, 120) || null,
      venue: clean(br.venue, 80) || null,
      day: clean(br.day || br.day_label, 40) || null,
      time: clean(br.time || br.time_label, 80) || null,
      activity: clean(br.activity, 120) || null,
      booking_mode: clean(br.booking_mode, 40) || null,
      week_id: clean(br.week_id, 40) || null,
      block_id: clean(br.block_id, 40) || null,
      date_iso: clean(br.date_iso || br.date, 10) || null,
      pack: null,
      booking_kind: "trial",
    };
  }
}

if (!bookingRequest && SLOT_ID) {
  const slot = await slotFromMadre(admin, SLOT_ID);
  if (!slot) throw new Error(`slot not found in MADRE: ${SLOT_ID}`);
  bookingRequest = {
    from: "bookingportal",
    slot_id: SLOT_ID,
    service_id: clean(slot.serviceId, 80) || null,
    service_name: "Aquatic Activity",
    venue: clean(slot.venue, 80) || null,
    day: clean(slot.day, 40) || null,
    time: clean(slot.timeLabel, 80) || null,
    activity: clean(slot.activityName, 120) || null,
    booking_mode: clean(slot.bookingMode, 40) || null,
    week_id: clean(slot.weekId, 40) || null,
    block_id: clean(slot.blockId, 40) || null,
    date_iso: clean(slot.dateIso, 10) || null,
    pack: null,
    booking_kind: "trial",
  };
}

if (!bookingRequest) {
  console.error(
    "No booking_request on document and no SLOT_ID env. Pick the slot from booking portal / admin and re-run with SLOT_ID=live-aquatic-...",
  );
  Deno.exit(1);
}

const sessionDateIso = resolveSessionDateIso({
  dateIso: bookingRequest.date_iso,
  day: bookingRequest.day,
  asOfIso: "2026-08-22",
});
const reference = formatTrialSessionReference({
  sessionDateIso,
  day: bookingRequest.day,
  timeLabel: bookingRequest.time,
  asOfIso: "2026-08-22",
});
const bookingService = bookingPortalServiceLabel("AQUATIC_30", bookingRequest.service_name || "Aquatic Activity", {
  isTrial: true,
});
const bookingSlot = [bookingRequest.day, bookingRequest.time].filter(Boolean).join(" ");
const bookingMarker = formatBookingPdfHeaderMarker({
  service: bookingService,
  slot: bookingSlot,
  venue: bookingRequest.venue,
  plan: "One-off payment",
});

let parentNameFromDoc = clean(Deno.env.get("PARENT_DISPLAY"), 200) ||
  clean(doc.parent_name, 200) || "Reshma";
if (!parentNameFromDoc.includes(" ")) {
  const { data: pax } = await admin
    .from("portal_participants")
    .select("last_name")
    .eq("contact_id", CONTACT_ID)
    .maybeSingle();
  const childLast = clean(pax?.last_name, 80);
  if (childLast) parentNameFromDoc = `${parentNameFromDoc} ${childLast}`;
}

let notes = clean(share.notes, 800).replace(/\[\[booking:[^\]]+\]\]/gi, "").trim();
notes = `${notes} ${bookingMarker}`.slice(0, 800);

console.log(APPLY ? "APPLY" : "DRY");
console.log({
  bookingRequest,
  reference,
  bookingSlot,
  venue: bookingRequest.venue,
  parentNameFromDoc,
});

if (!APPLY) {
  console.log("Would backfill document, reservation, share, parent contact, and regen PDF.");
  Deno.exit(0);
}

payload.booking_request = bookingRequest;
await admin
  .from("portal_participant_documents")
  .update({ payload_json: payload })
  .eq("id", DOC_ID);

const parentPatch = splitParentName(parentNameFromDoc);
await admin.from("portal_parent_contacts").update({
  parent_display: parentNameFromDoc,
  parent_first_name: parentPatch.first,
  parent_last_name: parentPatch.last || null,
  updated_at: new Date().toISOString(),
}).eq("contact_id", CONTACT_ID);

const { data: existingRes } = await admin
  .from("portal_booking_slot_reservations")
  .select("id")
  .eq("document_id", DOC_ID)
  .in("status", ["validated", "pending", "awaiting_payment"])
  .limit(1)
  .maybeSingle();

let reservationId = existingRes?.id ? String(existingRes.id) : null;
if (!reservationId) {
  const holdExpires = new Date(Date.now() + 21 * 86400000).toISOString();
  const { data: holdRow, error: holdErr } = await admin
    .from("portal_booking_slot_reservations")
    .insert({
      slot_id: bookingRequest.slot_id,
      service_id: bookingRequest.service_id,
      service_name: bookingRequest.service_name,
      venue: bookingRequest.venue,
      day_label: bookingRequest.day,
      time_label: bookingRequest.time,
      activity: bookingRequest.activity,
      booking_mode: bookingRequest.booking_mode,
      week_id: bookingRequest.week_id,
      block_id: bookingRequest.block_id,
      date_iso: sessionDateIso,
      document_id: DOC_ID,
      participant_name: doc.participant_name,
      parent_name: parentNameFromDoc,
      parent_email: doc.parent_email,
      status: "validated",
      hold_expires_at: holdExpires,
      validated_at: new Date().toISOString(),
      notes: "office_backfill|booking_kind=trial",
    })
    .select("id")
    .single();
  if (holdErr) throw new Error(holdErr.message);
  reservationId = String(holdRow?.id || "");
}

await admin.from("portal_booking_completion_tokens").update({
  reservation_id: reservationId,
  updated_at: new Date().toISOString(),
}).eq("id", TOKEN_ID);

await admin.from("portal_parent_invoice_share").update({
  reference_text: reference,
  notes,
  updated_at: new Date().toISOString(),
}).eq("id", share.id);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
if (!regen.ok) throw new Error(regen.error);
console.log("Done", { reservationId, pdf: regen.pdfStoragePath });
