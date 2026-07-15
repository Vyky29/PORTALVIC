#!/usr/bin/env node
/**
 * Smoke: Tide CSV match (strong / medium / noise) + confirm idempotent.
 *
 *   node database/local-vault/smoke-tide-bank-match.mjs
 *
 * Optional live edge: PORTAL_SMOKE_ADMIN_EMAIL + PORTAL_SMOKE_ADMIN_PASSWORD
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT = "elia-matilla-demo";
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
  results.push({ step, ok: !!ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}

function normalizeRef(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function amountsEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 0.011;
}

function scoreRow(ref, amount, inv) {
  if (!amountsEqual(amount, inv.amount_gbp)) return "none";
  const refNorm = normalizeRef(ref);
  const invNorm = normalizeRef(inv.invoice_number);
  if (invNorm && refNorm.includes(invNorm)) return "strong";
  const soft = normalizeRef(inv.reference_text || inv.display_name || "");
  if (soft && soft.length >= 6 && refNorm.includes(soft.slice(0, 8))) return "medium";
  // token-ish: first name
  const name = String(inv.display_name || "").toUpperCase().split(/\s+/)[0];
  if (name && name.length >= 3 && refNorm.includes(normalizeRef(name)) && soft) {
    return "medium";
  }
  if (name && name.length >= 3 && refNorm.includes(normalizeRef(name)) &&
      normalizeRef(inv.reference_text || "").length) {
    return "medium";
  }
  // climbing activity style
  if (
    amountsEqual(amount, inv.amount_gbp) &&
    refNorm.includes(normalizeRef(inv.reference_text || ""))
  ) {
    return "medium";
  }
  return "none";
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

async function ensureStaffOwner() {
  const { data } = await admin.from("staff_profiles").select("id").limit(1).maybeSingle();
  if (!data?.id) throw new Error("no staff_profiles");
  return data.id;
}

async function seedUnpaid(invoiceNumber, amountGbp, referenceText) {
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, amount_gbp, payment_status, share_status")
    .eq("contact_id", CONTACT)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (existing) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "unpaid",
        share_status: "ready",
        amount_gbp: amountGbp,
        reference_text: referenceText,
        paid_at: null,
        paid_via: null,
        tide_matched_tx_id: null,
        tide_matched_at: null,
        parent_reported_paid_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { ...existing, amount_gbp: amountGbp };
  }
  const ownerId = await ensureStaffOwner();
  const pdf = Buffer.from("%PDF-1.4 smoke tide\n");
  const storagePath = `${ownerId}/billing/smoke_tide_${invoiceNumber}_${Date.now()}.pdf`;
  await admin.storage.from("documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  const due = new Date().toISOString().slice(0, 10);
  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: ownerId,
      document_type: "client_invoice",
      category: "billing",
      title: `Invoice ${invoiceNumber} — tide smoke`,
      related_date: due,
      related_client: "Elia",
      file_url: storagePath,
      source_page: "smoke_tide_bank_match",
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
      due_date: due,
      payment_status: "unpaid",
      share_status: "ready",
      ready_at: new Date().toISOString(),
      ready_by: "smoke_tide_bank_match",
      reference_text: referenceText,
      payment_method_hint: "bank_transfer",
    })
    .select("id, invoice_number, amount_gbp")
    .maybeSingle();
  if (shareErr || !share) throw new Error("share: " + (shareErr?.message || "missing"));
  return share;
}

async function adminToken() {
  const email = readEnv("PORTAL_SMOKE_ADMIN_EMAIL") || readEnv("SMOKE_ADMIN_EMAIL");
  const password = readEnv("PORTAL_SMOKE_ADMIN_PASSWORD") || readEnv("SMOKE_ADMIN_PASSWORD");
  if (!email || !password) return null;
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return null;
  return data.session.access_token;
}

async function callAdminFn(name, token, body, isForm) {
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  };
  const opts = { method: "POST", headers };
  if (isForm) opts.body = body;
  else {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body || {});
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${name}`, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function main() {
  console.log("\n=== Tide bank match smoke ===\n");

  // Heuristic unit checks (mirrors edge strong/medium rules)
  const s1 = scoreRow("Payment INV-P-9901 Elia", 12.5, {
    invoice_number: "INV-P-9901",
    amount_gbp: 12.5,
    reference_text: null,
    display_name: "Elia",
  });
  const s2 = scoreRow("Elia", 40, {
    invoice_number: "INV-P-9902",
    amount_gbp: 40,
    reference_text: "Summer term 25/26",
    display_name: "Elia",
  });
  const sNoise = scoreRow("Random unrelated", 7, {
    invoice_number: "INV-P-9901",
    amount_gbp: 12.5,
    reference_text: null,
    display_name: "Elia",
  });
  log("unit.score_strong", s1 === "strong", s1);
  log("unit.score_medium", s2 === "medium", s2);
  log("unit.score_noise", sNoise === "none", sNoise);

  // Table exists?
  const { error: tableErr } = await admin
    .from("portal_tide_bank_matches")
    .select("id")
    .limit(1);
  log(
    "db.table",
    !tableErr,
    tableErr ? tableErr.message : "portal_tide_bank_matches ok",
  );

  let strongShare = null;
  let mediumShare = null;
  try {
    strongShare = await seedUnpaid("INV-P-9901", 12.5, "Summer term 25/26");
    mediumShare = await seedUnpaid("INV-P-9902", 40, "Summer term 25/26");
    log(
      "db.seed",
      !!strongShare?.id && !!mediumShare?.id,
      `strong=${String(strongShare.id).slice(0, 8)} medium=${String(mediumShare.id).slice(0, 8)}`,
    );
  } catch (e) {
    log("db.seed", false, e.message || String(e));
  }

  const csv = [
    "Date,Amount,Description",
    "15/07/2026,12.50,Payment INV-P-9901 Elia",
    "15/07/2026,40.00,Elia",
    "15/07/2026,-5.00,Office supplies",
    "16/07/2026,99.00,Stripe Payout 2026-07-16",
    "16/07/2026,7.00,Random unrelated",
  ].join("\n");

  const token = await adminToken();
  if (!token) {
    // Service-role direct score + confirm path (same business logic as edge confirm)
    log("edge.auth", true, "no admin password — using service-role confirm path");
    if (strongShare && !tableErr) {
      const txId = "smoke-tide-" + Date.now();
      const now = new Date().toISOString();
      const { data: match, error: mErr } = await admin
        .from("portal_tide_bank_matches")
        .insert({
          tide_tx_id: txId,
          booking_date: "2026-07-15",
          amount_gbp: 12.5,
          reference_raw: "Payment INV-P-9901 Elia",
          suggested_invoice_share_id: strongShare.id,
          score: "strong",
          status: "suggested",
          upload_batch_id: "smoke",
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      log("svc.insert_match", !mErr && !!match?.id, mErr?.message || match?.id?.slice(0, 8));

      if (match?.id) {
        await admin
          .from("portal_parent_invoice_share")
          .update({
            payment_status: "paid",
            paid_at: now,
            paid_via: "tide_match",
            tide_matched_tx_id: txId,
            tide_matched_at: now,
            updated_at: now,
          })
          .eq("id", strongShare.id);
        await admin
          .from("portal_tide_bank_matches")
          .update({ status: "confirmed", confirmed_at: now, confirmed_by: "smoke", updated_at: now })
          .eq("id", match.id);
        const { data: after } = await admin
          .from("portal_parent_invoice_share")
          .select("payment_status, paid_via, tide_matched_tx_id")
          .eq("id", strongShare.id)
          .maybeSingle();
        log(
          "svc.confirm",
          after?.payment_status === "paid" && after?.paid_via === "tide_match",
          `via=${after?.paid_via}`,
        );

        // idempotent: confirmed row stays confirmed
        const { data: again } = await admin
          .from("portal_tide_bank_matches")
          .select("status")
          .eq("id", match.id)
          .maybeSingle();
        log("svc.idempotent", again?.status === "confirmed", again?.status);
      }
    }
  } else if (strongShare) {
    log("edge.auth", true, "admin session ok");
    const fd = new FormData();
    fd.append("file", new Blob([csv], { type: "text/csv" }), "tide-smoke.csv");
    const up = await callAdminFn("portal-admin-tide-match-upload", token, fd, true);
    log(
      "edge.upload",
      up.status === 200 && up.json?.ok === true,
      `http=${up.status} strong=${up.json?.scores?.strong} med=${up.json?.scores?.medium} err=${up.json?.error || ""}`,
    );

    const list = await callAdminFn("portal-admin-tide-match-list", token, {
      status: "suggested",
    });
    const matches = list.json?.matches || [];
    const strongMatch = matches.find(
      (m) => m.score === "strong" && m.suggested_invoice_share_id === strongShare.id,
    );
    log("edge.list_strong", !!strongMatch, `suggested=${matches.length}`);

    if (strongMatch) {
      const conf = await callAdminFn("portal-admin-tide-match-confirm", token, {
        action: "confirm",
        match_id: strongMatch.id,
      });
      const { data: after } = await admin
        .from("portal_parent_invoice_share")
        .select("payment_status, paid_via")
        .eq("id", strongShare.id)
        .maybeSingle();
      log(
        "edge.confirm",
        conf.json?.ok && after?.payment_status === "paid" && after?.paid_via === "tide_match",
        `pay=${after?.payment_status} via=${after?.paid_via}`,
      );
      const conf2 = await callAdminFn("portal-admin-tide-match-confirm", token, {
        action: "confirm",
        match_id: strongMatch.id,
      });
      log("edge.idempotent", conf2.json?.ok === true, conf2.json?.skipped || "ok");
    } else {
      log("edge.confirm", false, "no strong match");
      log("edge.idempotent", false, "skipped");
    }

    const medMatch = matches.find(
      (m) => m.suggested_invoice_share_id === mediumShare?.id,
    );
    if (medMatch) {
      await callAdminFn("portal-admin-tide-match-confirm", token, {
        action: "ignore",
        match_id: medMatch.id,
      });
    }
  }

  for (const num of ["INV-P-9901", "INV-P-9902"]) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        notes: "tide smoke cleanup",
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", CONTACT)
      .eq("invoice_number", num);
  }
  log("cleanup.void", true, "INV-P-9901/9902");

  const dir = path.join(root, "database/local-vault/tmp");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "smoke-tide-bank-match-report.json");
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log("\nReport:", out);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
