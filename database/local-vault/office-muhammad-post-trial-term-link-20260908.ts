/**
 * Unblock Muhammad/Asli post-trial term booking: soft-hold + trial hold made
 * Northolt Mon 4.30 show FULL. Mint term finish-booking link and WhatsApp.
 *
 *   npx -y deno run -A database/local-vault/office-muhammad-post-trial-term-link-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import {
  mintFinishBookingToken,
  finishBookingUrl,
} from "../../supabase/functions/_shared/portal_booking_finish.ts";
import { bookingPayHoldExpiresAt } from "../../supabase/functions/_shared/portal_booking_pay_hold.ts";

const SEND = Deno.args.includes("--send");
const DOC_ID = "68c3504e-8a81-4d13-9c57-3e04ddae9643";
const TRIAL_RES = "7f161007-6ecf-4725-9c4b-e02ee105aee3";
const SOFT_HOLD = "78714f1f-93f6-4d05-b22a-c3bdd0e8af78";
const OFFER_ID = "2a70ebc1-bc40-47aa-90fa-68bf93652b95";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const now = new Date().toISOString();
const holdExpires = bookingPayHoldExpiresAt();

// 1) Trial seat no longer occupies future capacity
const { error: e1 } = await admin
  .from("portal_booking_slot_reservations")
  .update({
    hold_expires_at: now,
    notes:
      "trial_paid_stripe|booking_kind=trial|instructor=Dan|post_trial_offer_sent_20260908|trial_hold_cleared_for_term_convert",
    updated_at: now,
  })
  .eq("id", TRIAL_RES);
if (e1) throw e1;

// 2) Soft hold → active term pay hold (same parent/slot)
const { error: e2 } = await admin
  .from("portal_booking_slot_reservations")
  .update({
    status: "awaiting_payment",
    hold_expires_at: holdExpires,
    date_iso: "2026-09-14", // next Monday standing
    day_label: "Monday",
    time_label: "4.30 – 5.00",
    venue: "Northolt",
    service_name: "Aquatic Activity",
    notes:
      "post_trial_term_convert|booking_kind=term|pay_hold_30m|office_muhammad_20260908",
    updated_at: now,
    released_at: null,
  })
  .eq("id", SOFT_HOLD);
if (e2) throw e2;

const { data: doc, error: dErr } = await admin
  .from("portal_participant_documents")
  .select("id, participant_name, parent_name, parent_email, parent_phone")
  .eq("id", DOC_ID)
  .single();
if (dErr || !doc) throw dErr || new Error("doc_missing");

const minted = await mintFinishBookingToken(admin, {
  leadId: null,
  documentId: DOC_ID,
  reservationId: SOFT_HOLD,
});
// Pre-set term scope so finish page knows it's term not trial
await admin
  .from("portal_booking_completion_tokens")
  .update({
    choices_json: {
      booking_scope: "term_place",
      booking_kind: "term",
      post_trial_convert: true,
    },
    status: "scope_saved",
    reservation_id: SOFT_HOLD,
    updated_at: now,
  })
  .eq("id", minted.tokenId);

const url = finishBookingUrl(minted.rawToken);
const body =
  `Hi Asli,\n\n` +
  `Sorry — the Booking Portal showed full because we were holding Muhammad's Northolt Monday 4.30-5 place for you.\n\n` +
  `Here is your direct link to finish the term booking and pay (held 30 minutes):\n` +
  `${url}\n\n` +
  `Thanks,\n` +
  `Office | clubSENsational`;

console.log({ url, holdExpires, body });

if (!SEND) {
  console.log("Dry-run. Re-run with --send to WhatsApp.");
  Deno.exit(0);
}

const phone = normalizeParentPhoneE164(String(doc.parent_phone || "07956309898"));
const flat = flattenWhatsappTemplateBody(body);
const wa = await sendParentMessageViaWhatsapp(phone!, flat, { kind: "contact_update" });

await admin.from("portal_parent_notify_log").insert({
  sent_by_email: "system@clubsensational.org",
  kind: "post_trial_term_finish_link_muhammad_20260908",
  channel: "whatsapp",
  parent_phone: phone,
  parent_email: doc.parent_email,
  parent_name: doc.parent_name,
  subject: "Muhammad term finish-booking (post-trial)",
  body_text: body,
  whatsapp_status: wa.ok ? "sent" : "failed",
  whatsapp_message_id: wa.ok ? wa.id : null,
  error_detail: wa.ok ? null : wa.error,
  meta: { soft_hold: SOFT_HOLD, finish_url: url, offer_id: OFFER_ID },
});

await admin
  .from("portal_post_trial_offers")
  .update({
    updated_at: now,
    resolve_note: "term_finish_link_sent",
    meta: {
      catchup: true,
      term_finish_url_sent: true,
      finish_token_id: minted.tokenId,
    },
  })
  .eq("id", OFFER_ID);

console.log(wa.ok ? `SENT ${wa.id}` : `FAIL ${wa.error}`);
