// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-tide-match-upload
// Parse Tide CSV credits, upsert rows, score against open INV-P.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { bestMatchForRow, parseTideCsv } from "../_shared/tide_match.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let csvText = "";
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return portalAdminJson(400, { ok: false, error: "bad_form" });
    }
    const file = form.get("file") || form.get("csv");
    if (file && typeof file === "object" && "text" in file) {
      csvText = await (file as File).text();
    } else {
      csvText = clean(form.get("csv_text"), 2_000_000);
    }
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    csvText = String(body.csv_text || body.csv || "");
  }

  if (!csvText.trim()) {
    return portalAdminJson(400, { ok: false, error: "csv_required" });
  }
  if (csvText.length > 2_500_000) {
    return portalAdminJson(413, { ok: false, error: "csv_too_large" });
  }

  const parsed = parseTideCsv(csvText);
  if (parsed.error && !parsed.rows.length) {
    return portalAdminJson(400, {
      ok: false,
      error: parsed.error,
      message:
        parsed.error === "csv_missing_columns"
          ? "CSV needs Amount and Description/Reference columns (Date optional)."
          : "Could not parse CSV.",
    });
  }

  const { data: shares } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, contact_id, reference_text, parent_reported_ref, payment_status, share_status, tide_matched_tx_id",
    )
    .eq("share_status", "ready")
    .in("payment_status", ["unpaid", "pending_confirmation", "partial"]);

  const contactIds = Array.from(
    new Set((shares || []).map((s) => clean(s.contact_id, 120)).filter(Boolean)),
  );
  const nameByContact: Record<string, string> = {};
  if (contactIds.length) {
    const { data: parts } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of parts || []) {
      const cid = clean(p.contact_id, 120);
      nameByContact[cid] =
        clean(p.display_name, 120) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    }
  }

  const alreadyMatched = new Set(
    (shares || [])
      .map((s) => clean(s.tide_matched_tx_id, 120))
      .filter(Boolean),
  );

  const candidates = (shares || [])
    .filter((s) => !s.tide_matched_tx_id)
    .map((s) => ({
      id: String(s.id),
      invoice_number: s.invoice_number,
      amount_gbp: s.amount_gbp,
      contact_id: s.contact_id,
      reference_text: s.reference_text,
      parent_reported_ref: s.parent_reported_ref,
      display_name: nameByContact[clean(s.contact_id, 120)] || null,
    }));

  const batchId = `up-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let strong = 0;
  let medium = 0;
  let none = 0;

  for (const row of parsed.rows) {
    if (alreadyMatched.has(row.tide_tx_id)) continue;

    const { data: existing } = await admin
      .from("portal_tide_bank_matches")
      .select("id, status")
      .eq("tide_tx_id", row.tide_tx_id)
      .maybeSingle();

    if (existing && (existing.status === "confirmed" || existing.status === "ignored")) {
      continue;
    }

    const best = bestMatchForRow(row, candidates);
    if (best.score === "strong") strong++;
    else if (best.score === "medium") medium++;
    else none++;

    const patch = {
      tide_tx_id: row.tide_tx_id,
      booking_date: row.booking_date,
      amount_gbp: row.amount_gbp,
      reference_raw: row.reference_raw || null,
      suggested_invoice_share_id: best.invoice?.id || null,
      score: best.score,
      status: "suggested",
      upload_batch_id: batchId,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await admin
        .from("portal_tide_bank_matches")
        .update(patch)
        .eq("id", existing.id);
      if (!error) updated++;
    } else {
      const { error } = await admin.from("portal_tide_bank_matches").insert({
        ...patch,
        created_at: now,
      });
      if (!error) inserted++;
    }

    // Prevent same invoice claimed twice in one upload (prefer first strong).
    if (best.invoice && best.score !== "none") {
      const idx = candidates.findIndex((c) => c.id === best.invoice!.id);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  return portalAdminJson(200, {
    ok: true,
    batch_id: batchId,
    parsed: parsed.rows.length,
    skipped: parsed.skipped,
    inserted,
    updated,
    scores: { strong, medium, none },
  });
});
