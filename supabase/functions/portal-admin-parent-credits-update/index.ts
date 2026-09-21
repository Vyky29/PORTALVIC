// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-credits-update
// mark_refunded | mark_applied | cancel | create (manual ledger row).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { autoApplyOpenCreditToNextInvoices } from "../_shared/portal_family_credit_apply.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 30).toLowerCase();
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const userId = verified.userId || null;

  if (action === "create") {
    const kind = clean(body.kind, 20).toLowerCase();
    if (kind !== "credit" && kind !== "refund") {
      return portalAdminJson(400, { ok: false, error: "kind_required" });
    }
    const parentPersonId = clean(body.parent_person_id, 120);
    const contactId = clean(body.contact_id, 120);
    if (!parentPersonId || !contactId) {
      return portalAdminJson(400, { ok: false, error: "parent_and_contact_required" });
    }
    const amount = parseAmount(body.amount_gbp);
    const { data, error } = await admin
      .from("portal_parent_family_credits")
      .insert({
        parent_person_id: parentPersonId,
        contact_id: contactId,
        participant_display: clean(body.participant_display, 120),
        kind,
        status: "open",
        amount_gbp: amount,
        service_label: clean(body.service_label, 120),
        session_date: clean(body.session_date, 20) || null,
        notes: clean(body.notes, 800) || null,
        source: "admin",
        created_by: userId,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[portal-admin-parent-credits-update] create", error.message);
      return portalAdminJson(500, { ok: false, error: "create_failed" });
    }
    let credit_apply = null;
    if (kind === "credit" && data && data.id && amount != null && amount > 0) {
      try {
        credit_apply = await autoApplyOpenCreditToNextInvoices(admin, data.id);
        if (credit_apply?.final_credit_status) {
          const { data: refreshed } = await admin
            .from("portal_parent_family_credits")
            .select("*")
            .eq("id", data.id)
            .maybeSingle();
          if (refreshed) {
            return portalAdminJson(200, { ok: true, entry: refreshed, credit_apply });
          }
        }
      } catch (err) {
        console.error("[portal-admin-parent-credits-update] auto-apply", err);
        credit_apply = { ok: false, error: "auto_apply_failed" };
      }
    }
    return portalAdminJson(200, { ok: true, entry: data, credit_apply });
  }

  const entryId = clean(body.entry_id, 60);
  if (!entryId) return portalAdminJson(400, { ok: false, error: "entry_id_required" });

  const { data: entry, error: loadErr } = await admin
    .from("portal_parent_family_credits")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (loadErr || !entry) return portalAdminJson(404, { ok: false, error: "not_found" });
  if (entry.status !== "open") {
    return portalAdminJson(409, { ok: false, error: "not_open", status: entry.status });
  }

  // Apply credit to open/partial INV-P (incl. flexi remaining half). If none
  // (or only GoCardless), keep credit open for next term — do not fake-close.
  if (action === "mark_applied") {
    if (entry.kind !== "credit") {
      return portalAdminJson(400, { ok: false, error: "not_a_credit" });
    }
    const notes = clean(body.notes, 800);
    let credit_apply = null;
    try {
      credit_apply = await autoApplyOpenCreditToNextInvoices(admin, entryId);
    } catch (err) {
      console.error("[portal-admin-parent-credits-update] mark_applied auto-apply", err);
      return portalAdminJson(500, { ok: false, error: "auto_apply_failed" });
    }

    const { data: refreshed } = await admin
      .from("portal_parent_family_credits")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    if (refreshed && refreshed.status === "open" && notes) {
      await admin
        .from("portal_parent_family_credits")
        .update({
          notes: refreshed.notes
            ? String(refreshed.notes).slice(0, 700) + " | " + notes
            : notes,
          updated_at: now,
        })
        .eq("id", entryId);
    } else if (
      refreshed &&
      refreshed.status === "applied" &&
      notes &&
      !refreshed.close_notes
    ) {
      await admin
        .from("portal_parent_family_credits")
        .update({
          close_notes: notes,
          closed_by: userId,
          updated_at: now,
        })
        .eq("id", entryId);
    } else if (refreshed && refreshed.status === "open" && credit_apply?.skipped) {
      const holdNote =
        credit_apply.skipped === "gocardless_held_for_spring_mandate" ||
        credit_apply.skipped === "gocardless_held_for_next_term"
          ? "Held for Spring GoCardless mandate (monthly) — not applied to open Autumn GC invoice"
          : credit_apply.skipped === "no_open_invoice"
            ? "No open bank/flexi invoice — credit kept for next term"
            : String(credit_apply.skipped);
      await admin
        .from("portal_parent_family_credits")
        .update({
          notes: refreshed.notes
            ? String(refreshed.notes).slice(0, 650) + " | " + holdNote
            : holdNote,
          updated_at: now,
        })
        .eq("id", entryId);
    }

    const { data: finalEntry } = await admin
      .from("portal_parent_family_credits")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    const skipped = String(credit_apply?.skipped || "");
    return portalAdminJson(200, {
      ok: true,
      entry: finalEntry || refreshed || entry,
      credit_apply,
      applied_to_invoice: !!(
        credit_apply?.applications || []
      ).some((a: { ok?: boolean }) => a && a.ok),
      held_for_next_term:
        finalEntry?.status === "open" &&
        !!(
          skipped === "no_open_invoice" ||
          skipped === "gocardless_held_for_spring_mandate" ||
          skipped === "gocardless_held_for_next_term" ||
          credit_apply?.gocardless_held
        ),
      held_for_spring_gc:
        finalEntry?.status === "open" &&
        !!(
          skipped === "gocardless_held_for_spring_mandate" ||
          skipped === "gocardless_held_for_next_term" ||
          credit_apply?.gocardless_held
        ),
    });
  }

  let nextStatus = "";
  if (action === "mark_refunded") {
    if (entry.kind !== "refund") {
      return portalAdminJson(400, { ok: false, error: "not_a_refund" });
    }
    nextStatus = "refunded";
  } else if (action === "cancel") {
    nextStatus = "cancelled";
  } else {
    return portalAdminJson(400, { ok: false, error: "action_required" });
  }

  const notes = clean(body.notes, 800);
  const patch: Record<string, unknown> = {
    status: nextStatus,
    closed_at: now,
    closed_by: userId,
    close_notes: notes || null,
    updated_at: now,
  };
  const amount = parseAmount(body.amount_gbp);
  if (amount != null && entry.amount_gbp == null) {
    patch.amount_gbp = amount;
  }

  const { data: updated, error } = await admin
    .from("portal_parent_family_credits")
    .update(patch)
    .eq("id", entryId)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    console.error("[portal-admin-parent-credits-update]", error?.message);
    return portalAdminJson(500, { ok: false, error: "update_failed" });
  }

  return portalAdminJson(200, { ok: true, entry: updated });
});
