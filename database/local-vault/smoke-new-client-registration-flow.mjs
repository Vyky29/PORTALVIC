#!/usr/bin/env node
/**
 * New-client Booking Portal → registration smoke (Portal live).
 *
 * Checks:
 *   1) portal-booking-offer returns weekly slots
 *   2) submit client_registration with booking_request.slot_id
 *   3) portal_participant_documents.payload_json.booking_request.slot_id
 *   4) portal_booking_slot_reservations pending row linked to document
 *   5) offer taken for that slot increases by ≥1
 *   6) parent portal OTP/session still unavailable for this email (no auto-access)
 *   7) cleanup smoke rows
 *
 *   node database/local-vault/smoke-new-client-registration-flow.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY
 * in local-secrets/secrets.env (or env).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const results = [];
const SMOKE_EMAIL = `smoke-reg-${Date.now()}@clubsensational.test`;
const SMOKE_PARTICIPANT = `Smoke Reg ${Date.now().toString(36).slice(-5)}`;
const SLOT_ID =
  "live-climbing-westway-sunday-15-00-3-00-4-00";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function log(step, ok, detail) {
  const row = { step, ok: !!ok, detail: detail || "" };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = readEnv("SUPABASE_ANON_KEY");
if (!serviceKey || !anonKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fnBase = url.replace(/\/$/, "") + "/functions/v1";

/** Minimal valid PDF bytes. */
function tinyPdf() {
  const s =
    "%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 100 700 Td (smoke) Tj ET\nendstream\nendobj\n3 0 obj<< /Type /Page /Parent 4 0 R /Contents 2 0 R >>endobj\n4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj\nxref\n0 6\ntrailer<< /Root 5 0 R /Size 6 >>\nstartxref\n0\n%%EOF\n";
  return Buffer.from(s, "utf8");
}

async function fetchOffer() {
  const res = await fetch(`${fnBase}/portal-booking-offer`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function slotTaken(offerJson, slotId) {
  const slots = [
    ...(offerJson.MOCK_SLOTS || []),
    ...((offerJson.slots || [])),
  ];
  const hit = slots.find((s) => String(s.id) === slotId);
  return hit ? { found: true, taken: Number(hit.taken) || 0, capacity: Number(hit.capacity) || 0 } : { found: false, taken: 0, capacity: 0 };
}

async function main() {
  let docId = null;
  let reservationId = null;
  let takenBefore = 0;

  try {
    const offer1 = await fetchOffer();
    log(
      "offer_live",
      offer1.res.ok && offer1.json && offer1.json.ok,
      `status=${offer1.res.status} weekly=${offer1.json?.stats?.weekly_slots ?? "?"}`,
    );
    const before = slotTaken(offer1.json || {}, SLOT_ID);
    takenBefore = before.taken;
    log(
      "slot_in_offer",
      before.found,
      before.found
        ? `${SLOT_ID} taken=${before.taken}/${before.capacity}`
        : `missing ${SLOT_ID}`,
    );

    const bookingRequest = {
      from: "bookingportal",
      slot_id: SLOT_ID,
      service: "climbing",
      service_name: "Climbing",
      venue: "Westway",
      day: "Sunday",
      time: "3.00 – 4.00",
      activity: null,
      booking_mode: "weekly",
    };

    const fd = new FormData();
    fd.append("form_type", "client_registration");
    fd.append("participant_name", SMOKE_PARTICIPANT);
    fd.append("participant_dob", "2015-06-01");
    fd.append("parent_name", "Smoke Parent");
    fd.append("parent_email", SMOKE_EMAIL);
    fd.append("parent_phone", "+447700900123");
    fd.append(
      "payload",
      JSON.stringify({
        relationship: "Mother",
        booking_request: bookingRequest,
        smoke: true,
      }),
    );
    fd.append(
      "pdf",
      new Blob([tinyPdf()], { type: "application/pdf" }),
      "smoke-registration.pdf",
    );

    const submitRes = await fetch(`${fnBase}/portal-parent-form-submit`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: fd,
    });
    const submitJson = await submitRes.json().catch(() => ({}));
    docId = submitJson.id || null;
    reservationId = submitJson.reservation_id || null;
    log(
      "form_submit",
      submitRes.ok && submitJson.ok && !!docId,
      `id=${docId || "?"} slot_held=${!!submitJson.slot_held} reservation=${reservationId || "?"}`,
    );

    if (docId) {
      const { data: doc, error: docErr } = await admin
        .from("portal_participant_documents")
        .select("id, status, payload_json, parent_email, participant_name")
        .eq("id", docId)
        .maybeSingle();
      const br = doc?.payload_json?.booking_request;
      log(
        "payload_slot_persisted",
        !docErr && br && String(br.slot_id) === SLOT_ID,
        docErr
          ? docErr.message
          : `status=${doc?.status} slot=${br?.slot_id || "missing"}`,
      );
    } else {
      log("payload_slot_persisted", false, "no document id");
    }

    if (reservationId || docId) {
      let q = admin
        .from("portal_booking_slot_reservations")
        .select("id, slot_id, status, document_id, parent_email, hold_expires_at")
        .eq("status", "pending")
        .eq("slot_id", SLOT_ID);
      if (reservationId) q = q.eq("id", reservationId);
      else q = q.eq("document_id", docId);
      const { data: holds, error: holdErr } = await q.limit(1);
      const hold = (holds || [])[0];
      if (!reservationId && hold) reservationId = hold.id;
      log(
        "slot_reservation_row",
        !holdErr && hold && hold.status === "pending" && hold.document_id === docId,
        holdErr
          ? holdErr.message
          : hold
            ? `id=${hold.id} expires=${hold.hold_expires_at}`
            : "no pending reservation (table missing or edge not deployed?)",
      );
    } else {
      log("slot_reservation_row", false, "no ids from submit");
    }

    const offer2 = await fetchOffer();
    const after = slotTaken(offer2.json || {}, SLOT_ID);
    const bumped =
      after.found &&
      (reservationId ? after.taken >= takenBefore + 1 : after.taken >= takenBefore);
    log(
      "offer_seat_hold",
      !!reservationId && bumped,
      `taken ${takenBefore} → ${after.taken} (pending_holds=${offer2.json?.stats?.pending_slot_holds ?? "?"})`,
    );

    const { data: contacts } = await admin
      .from("portal_parent_contacts")
      .select("id, email")
      .ilike("email", SMOKE_EMAIL)
      .limit(3);
    log(
      "no_auto_portal_contact",
      !(contacts || []).length,
      (contacts || []).length
        ? `unexpected contact ${(contacts || []).map((c) => c.id).join(",")}`
        : "no contact for smoke email (admin must provision after validate)",
    );
  } finally {
    // Cleanup smoke artefacts so seats are not permanently held.
    try {
      if (reservationId) {
        await admin
          .from("portal_booking_slot_reservations")
          .update({
            status: "released",
            released_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: "smoke_cleanup",
          })
          .eq("id", reservationId);
      }
      if (docId) {
        const { data: doc } = await admin
          .from("portal_participant_documents")
          .select("pdf_storage_path, photo_storage_path")
          .eq("id", docId)
          .maybeSingle();
        const paths = [doc?.pdf_storage_path, doc?.photo_storage_path].filter(Boolean);
        if (paths.length) {
          await admin.storage.from("participant-documents").remove(paths);
        }
        await admin.from("portal_participant_documents").delete().eq("id", docId);
      }
      log("cleanup", true, `doc=${docId || "n/a"} reservation=${reservationId || "n/a"}`);
    } catch (e) {
      log("cleanup", false, String(e && e.message ? e.message : e));
    }
  }

  const failed = results.filter((r) => !r.ok && r.step !== "cleanup");
  const outPath = path.join(
    root,
    "database/local-vault/tmp/smoke-new-client-registration-flow-report.json",
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        smoke_email: SMOKE_EMAIL,
        participant: SMOKE_PARTICIPANT,
        slot_id: SLOT_ID,
        results,
        ok: failed.length === 0,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${outPath}`);
  console.log(failed.length ? `FAILED (${failed.length})` : "ALL PASS");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
