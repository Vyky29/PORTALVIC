/**
 * Smoke: office credit auto-apply + cancellation decision queue (case_kind).
 *
 *   npx -y deno run -A database/local-vault/smoke-finance-credit-auto-apply-20260917.ts
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ ANON for optional admin edge).
 * Optional: PORTAL_SMOKE_ADMIN_EMAIL + PORTAL_SMOKE_ADMIN_PASSWORD to hit absence-decide live.
 *
 * Uses Elia demo contact. Seeds a throwaway INV-P + credit; cleans up after.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  applyOpenCreditToInvoice,
  findNextInvoiceForCreditApply,
} from "../../supabase/functions/_shared/portal_family_credit_apply.ts";

const CONTACT = "elia-matilla-demo";
const PARENT = "parent-victor-matilla-demo";
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const INV_A = `SMOKE-AC-${stamp}-A`;
const INV_B = `SMOKE-AC-${stamp}-B`;
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function loadEnv(p: string) {
  try {
    const text = Deno.readTextFileSync(p);
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2].trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* missing file ok */
  }
}

loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

function log(step: string, ok: boolean, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}

const url = Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
if (!serviceKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cleanupIds: {
  invoices: string[];
  credits: string[];
  reports: string[];
} = { invoices: [], credits: [], reports: [] };

async function seedUnpaid(
  invoiceNumber: string,
  amountGbp: number,
  opts?: { hidden?: boolean; term?: string },
) {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 21);
  const dueIso = due.toISOString().slice(0, 10);
  const { data: owner } = await admin.from("staff_profiles").select("id").limit(1).maybeSingle();
  if (!owner?.id) throw new Error("no staff_profiles for document owner");

  const pdf = new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 40 120 Td (${invoiceNumber}) Tj ET\nendstream endobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n`,
  );
  const storagePath = `${owner.id}/billing/smoke_${invoiceNumber}.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error("upload: " + upErr.message);

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: owner.id,
      document_type: "client_invoice",
      category: "billing",
      title: `Invoice ${invoiceNumber} — smoke auto-credit`,
      related_date: dueIso,
      related_client: "Elia",
      file_url: storagePath,
      source_page: "smoke_finance_credit_auto_apply",
    })
    .select("id")
    .maybeSingle();
  if (docErr || !doc) throw new Error("doc: " + (docErr?.message || "missing"));

  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .insert({
      document_id: doc.id,
      contact_id: CONTACT,
      invoice_number: invoiceNumber,
      amount_gbp: amountGbp,
      due_date: dueIso,
      payment_status: "unpaid",
      share_status: opts?.hidden ? "hidden" : "ready",
      ready_at: opts?.hidden ? null : new Date().toISOString(),
      ready_by: "smoke_finance_credit_auto",
      created_via: "portal",
      billing_term: opts?.term || "spring",
      payment_method_hint: "bank_transfer",
      notes: "smoke finance credit auto-apply — safe to void",
    })
    .select("id, invoice_number, amount_gbp, share_status, payment_status, billing_term")
    .maybeSingle();
  if (error || !data) throw new Error("seed invoice: " + (error?.message || "missing"));
  cleanupIds.invoices.push(data.id);
  return data;
}

async function cleanup() {
  for (const id of cleanupIds.credits) {
    await admin.from("portal_parent_family_credits").delete().eq("id", id);
  }
  for (const id of cleanupIds.reports) {
    await admin.from("portal_parent_absence_reports").delete().eq("id", id);
  }
  for (const id of cleanupIds.invoices) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        share_status: "hidden",
        notes: "smoke voided",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
}

async function adminToken(): Promise<string | null> {
  const email = Deno.env.get("PORTAL_SMOKE_ADMIN_EMAIL") || Deno.env.get("SMOKE_ADMIN_EMAIL") || "";
  const password = Deno.env.get("PORTAL_SMOKE_ADMIN_PASSWORD") || Deno.env.get("SMOKE_ADMIN_PASSWORD") || "";
  if (!email || !password || !anonKey) return null;
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return null;
  return data.session.access_token;
}

async function callAdminFn(name: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function main() {
  console.log("\n=== Finance credit auto-apply smoke ===\n");
  console.log("contact", CONTACT, "stamp", stamp);

  const { data: part } = await admin
    .from("portal_participants")
    .select("contact_id, parent_person_id, display_name")
    .eq("contact_id", CONTACT)
    .maybeSingle();
  log(
    "prep.parent_link",
    !!part?.parent_person_id,
    part ? `${part.display_name} → ${part.parent_person_id}` : "missing",
  );

  // --- A) Residual: credit £40 vs invoice £15 → invoice paid, credit open £25
  let invA: { id: string; amount_gbp: number } | null = null;
  try {
    invA = await seedUnpaid(INV_A, 15, { term: "spring" });
    log("seed.invoice_a", !!invA?.id, `${INV_A} £15 ready`);
  } catch (e) {
    log("seed.invoice_a", false, String((e as Error).message || e));
  }

  let creditId = "";
  try {
    const { data: credit, error } = await admin
      .from("portal_parent_family_credits")
      .insert({
        parent_person_id: PARENT,
        contact_id: CONTACT,
        participant_display: part?.display_name || "Elia",
        kind: "credit",
        status: "open",
        amount_gbp: 40,
        currency: "GBP",
        service_label: "Smoke auto-apply",
        session_date: new Date().toISOString().slice(0, 10),
        notes: "smoke residual + auto-apply",
        source: "admin",
      })
      .select("id, amount_gbp, status")
      .maybeSingle();
    if (error || !credit) throw new Error(error?.message || "credit insert failed");
    creditId = credit.id;
    cleanupIds.credits.push(creditId);
    log("seed.credit_40", true, creditId.slice(0, 8));
  } catch (e) {
    log("seed.credit_40", false, String((e as Error).message || e));
  }

  if (invA && creditId) {
    const next = await findNextInvoiceForCreditApply(admin, CONTACT, {
      allowHidden: true,
      preferInvoiceId: invA.id,
    });
    log(
      "pick.next_invoice",
      !!next && String(next.id) === invA.id,
      next
        ? `${next.invoice_number} ${next.share_status} £${next.amount_gbp}`
        : "none",
    );

    const applied = await applyOpenCreditToInvoice(admin, {
      creditId,
      invoiceId: invA.id,
      contactId: CONTACT,
      allowHidden: true,
      actor: "office_auto",
    });
    log(
      "apply.residual",
      applied.ok === true &&
        applied.payment_status === "paid" &&
        Number(applied.credit_residual_gbp) === 25 &&
        applied.credit_status === "open",
      JSON.stringify({
        ok: applied.ok,
        pay: applied.payment_status,
        residual: applied.credit_residual_gbp,
        credit_status: applied.credit_status,
        err: applied.error,
      }),
    );

    const { data: liveCredit } = await admin
      .from("portal_parent_family_credits")
      .select("status, amount_gbp")
      .eq("id", creditId)
      .maybeSingle();
    log(
      "db.credit_after_partial",
      liveCredit?.status === "open" && Number(liveCredit?.amount_gbp) === 25,
      JSON.stringify(liveCredit),
    );

    const { data: liveInv } = await admin
      .from("portal_parent_invoice_share")
      .select("payment_status, paid_via, amount_gbp")
      .eq("id", invA.id)
      .maybeSingle();
    log(
      "db.invoice_a_paid",
      liveInv?.payment_status === "paid" && liveInv?.paid_via === "credit",
      JSON.stringify(liveInv),
    );
  }

  // --- B) Auto-apply loop onto hidden invoice
  let invB: { id: string } | null = null;
  try {
    invB = await seedUnpaid(INV_B, 20, { hidden: true, term: "summer" });
    log("seed.invoice_b_hidden", !!invB?.id, `${INV_B} £20 hidden`);
  } catch (e) {
    log("seed.invoice_b_hidden", false, String((e as Error).message || e));
  }

  if (creditId && invB) {
    const nextHidden = await findNextInvoiceForCreditApply(admin, CONTACT, {
      allowHidden: true,
      preferInvoiceId: invB.id,
    });
    log(
      "pick.hidden_preferred",
      !!nextHidden && String(nextHidden.id) === invB.id,
      nextHidden
        ? `${nextHidden.invoice_number} ${nextHidden.share_status} £${nextHidden.amount_gbp}`
        : "none",
    );

    // Apply directly to the smoke hidden INV-P (avoid auto-loop hitting real Elia invoices).
    const appliedB = await applyOpenCreditToInvoice(admin, {
      creditId,
      invoiceId: invB.id,
      contactId: CONTACT,
      allowHidden: true,
      actor: "office_auto",
    });
    log(
      "apply.hidden_invoice",
      appliedB.ok === true && appliedB.payment_status === "paid",
      JSON.stringify({
        ok: appliedB.ok,
        pay: appliedB.payment_status,
        residual: appliedB.credit_residual_gbp,
        credit_status: appliedB.credit_status,
        err: appliedB.error,
      }),
    );

    const { data: liveB } = await admin
      .from("portal_parent_invoice_share")
      .select("payment_status, share_status, paid_via, amount_gbp")
      .eq("id", invB.id)
      .maybeSingle();
    log(
      "db.invoice_b_paid_hidden",
      liveB?.payment_status === "paid" &&
        liveB?.share_status === "hidden" &&
        liveB?.paid_via === "credit",
      JSON.stringify(liveB),
    );

    const { data: liveCredit2 } = await admin
      .from("portal_parent_family_credits")
      .select("status, amount_gbp")
      .eq("id", creditId)
      .maybeSingle();
    // £40 − £15 − £20 = £5 residual open
    log(
      "db.credit_after_hidden",
      liveCredit2?.status === "open" && Number(liveCredit2?.amount_gbp) === 5,
      JSON.stringify(liveCredit2),
    );

    // Leave £5 residual open — do NOT auto-loop onto real Elia invoices.
    log(
      "auto.skip_real_invoices",
      true,
      "residual £5 left on smoke credit (deleted in cleanup) — auto-loop not run against live INV-Ps",
    );
  }

  // --- C) Cancellation case_kind row in same queue
  let reportId = "";
  try {
    const sessionDate = new Date().toISOString().slice(0, 10);
    const serviceLabel = `Smoke cancel ${stamp}`;
    const { data: report, error } = await admin
      .from("portal_parent_absence_reports")
      .insert({
        parent_person_id: PARENT,
        contact_id: CONTACT,
        participant_display: part?.display_name || "Elia",
        session_date: sessionDate,
        service_label: serviceLabel,
        session_time: "5 to 5.30",
        status: "pending_review",
        case_kind: "cancellation",
        reason_code: "club_cancelled",
        reason_text: "Smoke · Office cancel · Club cancelled session",
        proof_deadline: sessionDate,
        payload: { source: "smoke", case_kind: "cancellation" },
      })
      .select("id, status, case_kind, reason_code")
      .maybeSingle();
    if (error || !report) throw new Error(error?.message || "report insert failed");
    reportId = report.id;
    cleanupIds.reports.push(reportId);
    log(
      "queue.cancel_row",
      report.case_kind === "cancellation" && report.status === "pending_review",
      JSON.stringify(report),
    );
  } catch (e) {
    log("queue.cancel_row", false, String((e as Error).message || e));
  }

  // --- D) Optional live Edge: Add cancelled + decide credit
  const token = await adminToken();
  if (!token) {
    log(
      "edge.absence_decide",
      true,
      "SKIP — set PORTAL_SMOKE_ADMIN_EMAIL + PORTAL_SMOKE_ADMIN_PASSWORD to exercise live decide",
    );
  } else if (reportId) {
    const decided = await callAdminFn("portal-admin-parent-absence-decide", token, {
      report_id: reportId,
      action: "approve",
      outcome: "none",
      notes: "smoke decide none (no money)",
    });
    log(
      "edge.absence_decide_none",
      decided.status === 200 && decided.json?.ok === true,
      `http=${decided.status} ${JSON.stringify(decided.json).slice(0, 180)}`,
    );
  }

  // Cleanup
  try {
    await cleanup();
    log("cleanup", true, `voided ${cleanupIds.invoices.length} inv · deleted credits/reports`);
  } catch (e) {
    log("cleanup", false, String((e as Error).message || e));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${failed.length ? "FAIL" : "PASS"} — ${results.length - failed.length}/${results.length} ===\n`);
  try {
    await Deno.mkdir("database/local-vault/tmp", { recursive: true });
    await Deno.writeTextFile(
      "database/local-vault/tmp/smoke-finance-credit-auto-apply-20260917.json",
      JSON.stringify({ stamp, contact: CONTACT, results }, null, 2),
    );
  } catch {
    /* ignore */
  }
  Deno.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  cleanup().finally(() => Deno.exit(1));
});
