#!/usr/bin/env node
/**
 * Smoke: Crash summer Jul 2026 book → auto INV-P → pay-screen payload.
 *
 * Mirrors last-step UI: portal-crash-summer-book must return invoice_id + pay
 * options before the parent can bank/Stripe pay.
 *
 *   node database/local-vault/smoke-crash-summer-invoice.mjs
 *
 * Cleanup: cancels the smoke hold + marks invoice cancelled so seats free.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT = "elia-matilla-demo";
const PARENT = "parent-victor-matilla-demo";
const results = [];

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

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
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

async function callParentFn(name, sessionToken, body) {
  const res = await fetch(`${fnBase}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "x-parent-portal-session": sessionToken,
    },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { raw: await res.text() };
  }
  return { status: res.status, json };
}

async function mintParentSession() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  await admin
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("parent_person_id", PARENT)
    .is("revoked_at", null);
  const { error } = await admin.from("portal_parent_portal_sessions").insert({
    parent_person_id: PARENT,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error("session mint failed: " + error.message);
  return token;
}

async function cancelSmoke(bookingId, invoiceId) {
  const now = new Date().toISOString();
  if (bookingId) {
    await admin
      .from("portal_crash_summer_booking_lines")
      .update({ status: "cancelled" })
      .eq("booking_id", bookingId);
    await admin
      .from("portal_crash_summer_bookings")
      .update({ status: "cancelled", updated_at: now, hold_expires_at: null })
      .eq("id", bookingId);
  }
  if (invoiceId) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        notes: "Smoke crash cancel " + now,
        updated_at: now,
      })
      .eq("id", invoiceId);
  }
}

async function pickClimbingSlot(session) {
  const { status, json } = await callParentFn("portal-crash-summer-availability", session, {
    contact_id: CONTACT,
    week_id: "w1",
  });
  log(
    "avail.ok",
    status === 200 && json?.ok === true,
    `http=${status} fill=${json?.week1_fill_pct}% weeks=${(json?.weeks_open || []).join(",")}`,
  );
  if (!(status === 200 && json?.ok)) return null;

  const avail = json.availability || {};
  const dates = ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"];
  for (const slotId of ["c1", "c2"]) {
    let free = true;
    for (const d of dates) {
      const day = avail[d]?.climbing?.[slotId];
      // true / { free:true } / remaining>0 — tolerate shape drift
      const ok =
        day === true ||
        day === 1 ||
        (day && typeof day === "object" && (day.free === true || day.remaining > 0 || day.taken === false));
      if (day === false || day === 0 || (day && typeof day === "object" && day.free === false)) {
        free = false;
        break;
      }
      if (day != null && !ok && !(typeof day === "number" && day > 0)) {
        // unknown shape — fall through to DB check
      }
    }
    // Prefer DB: any hold on this slot for any of the 4 dates blocks weekly pack
    const { data: lines } = await admin
      .from("portal_crash_summer_booking_lines")
      .select("id")
      .eq("activity", "climbing")
      .eq("slot_id", slotId)
      .in("session_date", dates)
      .in("status", ["awaiting_payment", "confirmed"])
      .limit(1);
    if ((lines || []).length === 0) {
      log("avail.slot", true, `climbing ${slotId} free for weekly pack`);
      return slotId;
    }
  }
  log("avail.slot", false, "no free climbing weekly slot");
  return null;
}

async function main() {
  console.log("\n=== Crash summer invoice smoke ===\n");
  let bookingId = null;
  let invoiceId = null;

  try {
    const { data: link } = await admin
      .from("portal_participants")
      .select("contact_id, parent_person_id, display_name")
      .eq("contact_id", CONTACT)
      .maybeSingle();
    log(
      "prep.parent",
      !!link && link.parent_person_id === PARENT,
      `${link?.display_name || "?"} → ${link?.parent_person_id || "-"}`,
    );

    const session = await mintParentSession();
    log("prep.session", true, "minted");

    const slotId = await pickClimbingSlot(session);
    if (!slotId) {
      writeReport();
      process.exit(1);
    }

    const { status, json } = await callParentFn("portal-crash-summer-book", session, {
      contact_id: CONTACT,
      week_id: "w1",
      booking_mode: "weekly_pack",
      activities: ["climbing"],
      slots: { climbing: slotId },
    });

    bookingId = json?.booking_id || null;
    invoiceId = json?.invoice_id || null;

    const bookOk =
      status === 200 &&
      json?.ok === true &&
      json?.status === "awaiting_payment" &&
      !!bookingId;
    log(
      "book.hold",
      bookOk,
      `http=${status} booking=${bookingId ? String(bookingId).slice(0, 8) : "-"} err=${json?.error || ""} ${json?.message || ""}`,
    );

    // Critério: last screen gets invoice before pay
    const payScreenOk =
      !!json?.invoice_id &&
      !!json?.invoice_number &&
      Number(json?.amount_gbp) > 0 &&
      json?.pay_in_full_required === true;
    log(
      "book.pay_screen_invoice",
      payScreenOk,
      `inv=${json?.invoice_number || "-"} id=${invoiceId ? String(invoiceId).slice(0, 8) : "-"} £${json?.amount_gbp} pdf=${json?.pdf_url ? "yes" : "no"} emailed=${json?.invoice_emailed}`,
    );

    const bank = json?.bank_transfer || {};
    log(
      "book.bank_options",
      typeof bank === "object" && ("available" in bank || bank.reference_hint),
      `available=${bank.available} ref=${bank.reference_hint || "-"}`,
    );

    const card = json?.card_checkout || {};
    log(
      "book.card_options",
      typeof card === "object" && "available" in card,
      `available=${card.available} charge=${card.charge_gbp ?? "-"}`,
    );

    if (invoiceId) {
      const { data: inv } = await admin
        .from("portal_parent_invoice_share")
        .select(
          "id, invoice_number, amount_gbp, payment_status, share_status, payment_method_hint, ready_by",
        )
        .eq("id", invoiceId)
        .maybeSingle();
      const invOk =
        !!inv &&
        inv.share_status === "ready" &&
        inv.payment_status === "unpaid" &&
        Number(inv.amount_gbp) === Number(json.amount_gbp);
      log(
        "db.invoice_ready",
        invOk,
        `status=${inv?.payment_status}/${inv?.share_status} hint=${inv?.payment_method_hint} ready_by=${inv?.ready_by} £${inv?.amount_gbp}`,
      );

      const { data: booking } = await admin
        .from("portal_crash_summer_bookings")
        .select("id, invoice_share_id, status, amount_gbp")
        .eq("id", bookingId)
        .maybeSingle();
      log(
        "db.booking_linked",
        booking?.invoice_share_id === invoiceId && booking?.status === "awaiting_payment",
        `link=${booking?.invoice_share_id === invoiceId} status=${booking?.status}`,
      );

      // Pay path probe: Stripe Checkout session on the crash invoice (no charge)
      if (card.available) {
        const checkout = await callParentFn("parent-portal-invoice-checkout", session, {
          invoice_id: invoiceId,
          contact_id: CONTACT,
        });
        const checkoutUrl = String(
          checkout.json?.checkout_url || checkout.json?.url || "",
        );
        const urlOk =
          checkout.status === 200 &&
          checkout.json?.ok === true &&
          /checkout\.stripe\.com/i.test(checkoutUrl);
        log(
          "pay.stripe_checkout",
          urlOk,
          `http=${checkout.status} err=${checkout.json?.error || ""} url=${checkoutUrl.slice(0, 48)}`,
        );
      } else {
        log("pay.stripe_checkout", true, "skipped — card unavailable (bank still ok)");
      }
    } else {
      log("db.invoice_ready", false, "no invoice_id from book — last pay screen would be empty");
      log("db.booking_linked", false, "skipped");
      log("pay.stripe_checkout", false, "skipped");
    }
  } catch (e) {
    log("fatal", false, e.message || String(e));
  } finally {
    try {
      await cancelSmoke(bookingId, invoiceId);
      log(
        "cleanup.cancel",
        true,
        `booking=${bookingId ? String(bookingId).slice(0, 8) : "-"} inv=${invoiceId ? String(invoiceId).slice(0, 8) : "-"}`,
      );
    } catch (e) {
      log("cleanup.cancel", false, e.message || String(e));
    }
  }

  writeReport();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

function writeReport() {
  const dir = path.join(root, "database/local-vault/tmp");
  try {
    mkdirSync(dir, { recursive: true });
    const out = path.join(dir, "smoke-crash-summer-invoice-report.json");
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    console.log("\nReport:", out);
  } catch (e) {
    console.warn("Could not write report", e.message);
  }
}

main();
