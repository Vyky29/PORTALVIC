/**
 * Resend finish-booking link for Ahmad / Malaz (doc already accepted).
 * Mint new token, email + WhatsApp, print URL.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-resend-ahmad-malaz-finish-link.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  finishBookingUrl,
  mintFinishBookingToken,
  notifyParentFinishBooking,
} from "../../supabase/functions/_shared/portal_booking_finish.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DOC_ID = "23aeda8f-9da4-40c1-a2c9-d7e7bc0049af";
const LEAD_ID = "80a37043-baf5-4acc-a7f8-879d5d7fe10e";

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

async function main() {
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const { data: doc, error } = await admin
    .from("portal_participant_documents")
    .select(
      "id, participant_name, parent_name, parent_email, parent_phone, status",
    )
    .eq("id", DOC_ID)
    .maybeSingle();
  if (error) throw error;
  if (!doc) throw new Error("document_not_found");
  console.log("doc", {
    id: doc.id,
    status: doc.status,
    participant: doc.participant_name,
    parent: doc.parent_name,
    email: doc.parent_email,
    phone: doc.parent_phone,
  });

  const { data: holds } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, status, service_name, venue, day_label, time_label")
    .eq("document_id", DOC_ID)
    .in("status", ["validated", "pending"])
    .order("created_at", { ascending: false })
    .limit(1);
  const hold = holds?.[0] || null;
  const slotSummary = hold
    ? [hold.service_name, hold.venue, hold.day_label, hold.time_label]
      .filter(Boolean)
      .join(" · ")
    : "Aquatic Activity · Acton · Wednesday · 4.00 – 4.30";
  console.log("reservation", hold?.id || null, slotSummary);

  if (!APPLY) {
    console.log("Dry run. Set APPLY=1 to mint + send WhatsApp/email.");
    return;
  }

  // Also revoke funding_saved / scope_saved leftovers from newer flow.
  await admin
    .from("portal_booking_completion_tokens")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("document_id", DOC_ID)
    .in("status", [
      "pending",
      "funding_saved",
      "scope_saved",
      "choices_saved",
      "awaiting_payment",
      "la_office",
    ]);

  const minted = await mintFinishBookingToken(admin, {
    leadId: LEAD_ID,
    documentId: DOC_ID,
    reservationId: hold ? String(hold.id) : null,
  });
  const url = finishBookingUrl(minted.rawToken);
  console.log("new_url", url);
  console.log("token_id", minted.tokenId, "expires", minted.expiresAt);

  const notify = await notifyParentFinishBooking({
    parentName: doc.parent_name,
    parentEmail: doc.parent_email,
    parentPhone: doc.parent_phone,
    participantName: doc.participant_name,
    slotSummary,
    rawToken: minted.rawToken,
    admin,
  });
  await admin
    .from("portal_booking_completion_tokens")
    .update({
      finish_link_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", minted.tokenId);

  console.log("notify", notify);
  console.log("DONE — parent should use:", url);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
