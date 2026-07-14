#!/usr/bin/env node
/**
 * Payment flows smoke test (Portal live).
 *
 * Seeds Elia demo unpaid invoices, mints a parent portal session, then probes:
 *   1) invoices-list (Tide + Stripe/GC flags)
 *   2) bank report-paid → pending_confirmation → admin confirm paid
 *   3) Stripe checkout session create (no card charge)
 *   4) GoCardless setup redirect (no complete mandate)
 *   5) credit apply (partial)
 *   6) crash awaiting_payment invoices exist
 *
 *   node database/local-vault/smoke-parent-payment-flows.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY in local-secrets/secrets.env
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

async function ensureStaffOwner() {
  const { data } = await admin.from("staff_profiles").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id;
  throw new Error("no staff_profiles");
}

async function seedInvoice(invoiceNumber, amountGbp, hint) {
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, payment_status, share_status, amount_gbp, payment_method_hint")
    .eq("contact_id", CONTACT)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (existing && existing.share_status === "ready" && existing.payment_status === "unpaid") {
    return existing;
  }
  if (existing) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "unpaid",
        share_status: "ready",
        amount_gbp: amountGbp,
        payment_method_hint: hint,
        paid_at: null,
        paid_via: null,
        parent_reported_paid_at: null,
        parent_reported_ref: null,
        parent_reported_method: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { ...existing, payment_status: "unpaid", amount_gbp: amountGbp, payment_method_hint: hint };
  }

  const ownerId = await ensureStaffOwner();
  const pdf = Buffer.from(
    `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 40 120 Td (${invoiceNumber}) Tj ET\nendstream endobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n`,
  );
  const stamp = Date.now();
  const storagePath = `${ownerId}/billing/smoke_${invoiceNumber}_${stamp}.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) throw new Error("upload: " + upErr.message);

  const due = new Date();
  due.setDate(due.getDate() + 14);
  const dueIso = due.toISOString().slice(0, 10);

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: ownerId,
      document_type: "client_invoice",
      category: "billing",
      title: `Invoice ${invoiceNumber} — smoke test`,
      related_date: dueIso,
      related_client: "Elia",
      file_url: storagePath,
      source_page: "smoke_parent_payment_flows",
    })
    .select("id")
    .maybeSingle();
  if (docErr || !doc) throw new Error("doc: " + (docErr?.message || "missing"));

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .insert({
      document_id: doc.id,
      contact_id: CONTACT,
      invoice_number: invoiceNumber,
      amount_gbp: amountGbp,
      due_date: dueIso,
      payment_status: "unpaid",
      share_status: "ready",
      ready_at: new Date().toISOString(),
      ready_by: "smoke_parent_payment_flows",
      notes: `Smoke test invoice ${invoiceNumber}`,
      payment_method_hint: hint,
    })
    .select("id, invoice_number, payment_status, share_status, amount_gbp, payment_method_hint")
    .maybeSingle();
  if (shareErr || !share) throw new Error("share: " + (shareErr?.message || "missing"));
  return share;
}

async function ensureOpenCredit() {
  const { data: open } = await admin
    .from("portal_parent_family_credits")
    .select("id, amount_gbp, status, kind")
    .eq("contact_id", CONTACT)
    .eq("kind", "credit")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (open) return open;
  const { data, error } = await admin
    .from("portal_parent_family_credits")
    .insert({
      parent_person_id: PARENT,
      contact_id: CONTACT,
      participant_display: "Elia",
      kind: "credit",
      status: "open",
      amount_gbp: 15,
      currency: "GBP",
      service_label: "Smoke test credit",
      session_date: new Date().toISOString().slice(0, 10),
      notes: "Smoke test credit for payment flows",
      source: "admin",
    })
    .select("id, amount_gbp, status, kind")
    .maybeSingle();
  if (error || !data) throw new Error("credit seed: " + (error?.message || "missing"));
  return data;
}

async function main() {
  console.log("\n=== Parent payment smoke test ===\n");

  // 0) Linkage
  const { data: part } = await admin
    .from("portal_participants")
    .select("contact_id, parent_person_id, display_name")
    .eq("contact_id", CONTACT)
    .maybeSingle();
  log("prep.parent_link", !!part?.parent_person_id, part ? `${part.display_name} → ${part.parent_person_id}` : "missing");

  // 1) Seed unpaid invoices
  let bankInv, stripeInv, creditInv;
  try {
    bankInv = await seedInvoice("SMOKE-BANK-001", 12.5, "bank_transfer");
    stripeInv = await seedInvoice("SMOKE-STRIPE-001", 8.0, "bank_transfer");
    creditInv = await seedInvoice("SMOKE-CREDIT-001", 40.0, "bank_transfer");
    log(
      "prep.seed_unpaid",
      true,
      `bank=${bankInv.id.slice(0, 8)} stripe=${stripeInv.id.slice(0, 8)} credit=${creditInv.id.slice(0, 8)}`,
    );
  } catch (e) {
    log("prep.seed_unpaid", false, e.message);
    writeReport();
    process.exit(1);
  }

  let session;
  try {
    session = await mintParentSession();
    log("prep.mint_session", true, "parent session minted");
  } catch (e) {
    log("prep.mint_session", false, e.message);
    writeReport();
    process.exit(1);
  }

  // 2) List invoices — Tide + Stripe configured flags
  {
    const { status, json } = await callParentFn("parent-portal-invoices-list", session, {
      contact_id: CONTACT,
    });
    const invoices = json?.invoices || json?.data?.invoices || json?.items || [];
    const list = Array.isArray(invoices) ? invoices : [];
    const sample = list.find((i) => i.id === bankInv.id) || list[0];
    const tideOk = !!(
      sample?.tide ||
      sample?.bank ||
      sample?.bank_details ||
      json?.tide ||
      json?.bank_details ||
      sample?.pay_options?.bank_transfer
    );
    const stripeFlag =
      sample?.stripe_available ??
      sample?.card_available ??
      json?.stripe_configured ??
      sample?.pay_options?.card ??
      null;
    const gcFlag =
      sample?.gocardless_available ??
      json?.gocardless_configured ??
      sample?.pay_options?.gocardless ??
      null;
    log(
      "list.invoices",
      status === 200 && list.length > 0,
      `http=${status} count=${list.length} tideish=${tideOk} stripe=${stripeFlag} gc=${gcFlag}`,
    );
    if (status !== 200) {
      log("list.error_body", false, JSON.stringify(json).slice(0, 240));
    }
  }

  // 3) Bank report paid
  {
    const { status, json } = await callParentFn("parent-portal-invoice-report-paid", session, {
      invoice_id: bankInv.id,
      contact_id: CONTACT,
      method: "bank_transfer",
      payment_ref: "SMOKE-REF-BANK",
      notes: "smoke test I've paid",
    });
    const ok =
      status === 200 &&
      (json?.ok === true || json?.invoice?.payment_status === "pending_confirmation");
    log("bank.report_paid", ok, `http=${status} status=${json?.invoice?.payment_status || json?.error}`);

    const { data: after } = await admin
      .from("portal_parent_invoice_share")
      .select("payment_status, parent_reported_ref")
      .eq("id", bankInv.id)
      .maybeSingle();
    log(
      "bank.db_pending",
      after?.payment_status === "pending_confirmation",
      `db=${after?.payment_status} ref=${after?.parent_reported_ref}`,
    );
  }

  // 4) Admin confirm paid (service-role mirror of Mark paid)
  {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "paid",
        paid_at: now,
        paid_via: "admin",
        updated_at: now,
      })
      .eq("id", bankInv.id);
    const { data: paid } = await admin
      .from("portal_parent_invoice_share")
      .select("payment_status, paid_via")
      .eq("id", bankInv.id)
      .maybeSingle();
    log(
      "bank.admin_confirm",
      !error && paid?.payment_status === "paid",
      `db=${paid?.payment_status} via=${paid?.paid_via}`,
    );
  }

  // 5) Stripe checkout session (no charge)
  {
    const { status, json } = await callParentFn("parent-portal-invoice-checkout", session, {
      invoice_id: stripeInv.id,
      contact_id: CONTACT,
      return_origin: "https://www.clubsensational.org",
    });
    const urlOut = json?.checkout_url || json?.url || json?.session_url || "";
    const ok = status === 200 && json?.ok !== false && /https:\/\/checkout\.stripe\.com|https:\/\/www\.stripe\.com/i.test(urlOut);
    // Some responses nest under data
    const nested = json?.data?.checkout_url || json?.data?.url || "";
    const ok2 = ok || (status === 200 && /stripe/i.test(nested + JSON.stringify(json)));
    log(
      "stripe.checkout_create",
      ok2 && status !== 503,
      `http=${status} error=${json?.error || ""} url=${(urlOut || nested || "").slice(0, 60)}`,
    );
    if (status === 503 || json?.error === "stripe_not_configured") {
      log("stripe.configured", false, "STRIPE_SECRET_KEY missing in function env (secrets list showed it — redeploy?)");
    } else if (ok2) {
      log("stripe.configured", true, "Checkout Session created (not completed — no charge)");
    }
  }

  // 6) GoCardless setup
  {
    // Prefer an unpaid invoice with gocardless hint
    const gcInv = await seedInvoice("SMOKE-GC-001", 9.5, "gocardless");
    const { status, json } = await callParentFn("parent-portal-gocardless-setup", session, {
      invoice_id: gcInv.id,
      contact_id: CONTACT,
      return_origin: "https://www.clubsensational.org",
    });
    const flowUrl =
      json?.flow_url ||
      json?.authorisation_url ||
      json?.redirect_url ||
      json?.url ||
      json?.data?.flow_url ||
      "";
    const ok =
      status === 200 &&
      (json?.ok === true || /gocardless\.com/i.test(flowUrl + JSON.stringify(json)));
    log(
      "gocardless.setup",
      ok && status !== 503,
      `http=${status} error=${json?.error || ""} url=${String(flowUrl).slice(0, 70)}`,
    );
  }

  // 7) Credit apply (partial £15 of £40)
  {
    let credit;
    try {
      credit = await ensureOpenCredit();
      log("credit.seed", true, `id=${credit.id.slice(0, 8)} £${credit.amount_gbp}`);
    } catch (e) {
      log("credit.seed", false, e.message);
    }
    if (credit) {
      const { status, json } = await callParentFn("parent-portal-credit-apply-invoice", session, {
        invoice_id: creditInv.id,
        contact_id: CONTACT,
        credit_id: credit.id,
      });
      const { data: after } = await admin
        .from("portal_parent_invoice_share")
        .select("payment_status, amount_gbp")
        .eq("id", creditInv.id)
        .maybeSingle();
      const ok =
        status === 200 &&
        (json?.ok === true ||
          after?.payment_status === "partial" ||
          after?.payment_status === "paid" ||
          Number(after?.amount_gbp) < 40);
      log(
        "credit.apply",
        ok,
        `http=${status} inv=${after?.payment_status} amount=${after?.amount_gbp} err=${json?.error || ""}`,
      );
    }
  }

  // 8) Crash awaiting payment presence
  {
    const { data: holds, error } = await admin
      .from("portal_crash_summer_bookings")
      .select("id, contact_id, status, invoice_share_id")
      .eq("status", "awaiting_payment")
      .limit(5);
    log(
      "crash.awaiting_payment_exists",
      !error && (holds || []).length > 0,
      `count=${(holds || []).length} sample_contact=${holds?.[0]?.contact_id || "-"}`,
    );
    if (holds?.[0]?.invoice_share_id) {
      const { data: inv } = await admin
        .from("portal_parent_invoice_share")
        .select("id, payment_status, share_status, amount_gbp")
        .eq("id", holds[0].invoice_share_id)
        .maybeSingle();
      log(
        "crash.linked_invoice",
        !!inv && inv.share_status === "ready",
        `pay=${inv?.payment_status} amount=${inv?.amount_gbp}`,
      );
    }
  }

  writeReport();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

function writeReport() {
  const out = path.join(root, "database/local-vault/tmp/smoke-parent-payment-flows-report.json");
  try {
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    console.log("\nReport:", out);
  } catch (e) {
    console.warn("Could not write report", e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
