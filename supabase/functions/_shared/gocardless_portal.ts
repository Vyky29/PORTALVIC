/** Portal-side GoCardless mandate + invoice scheduling helpers. */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  gocardlessCreatePayment,
  gocardlessChargeDate,
} from "./gocardless.ts";
import {
  normalizePaymentSchedule,
  type InvoicePaymentScheduleRow,
} from "./portal_invoice_payment_schedule.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function mandateIsActive(status: string | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "pending_submission" || s === "submitted";
}

export type HouseholdMandateRow = {
  contact_id: string;
  gocardless_mandate_id: string;
  gocardless_customer_id: string | null;
  mandate_status: string;
};

/**
 * Same household (phone last-10 or email) may already have an active mandate
 * on a sibling contact — e.g. Maysoun/Adam Memy vs Adam Mahmmoud.
 */
export async function findActiveHouseholdMandate(
  supabase: SupabaseClient,
  contactId: string,
): Promise<HouseholdMandateRow | null> {
  const cid = clean(contactId, 120);
  if (!cid) return null;
  const { data: me } = await supabase
    .from("portal_parent_contacts")
    .select("contact_id, phone_lookup, email_norm")
    .eq("contact_id", cid)
    .maybeSingle();
  const phone = clean(me?.phone_lookup, 12);
  const email = clean(me?.email_norm, 120).toLowerCase();
  const orParts: string[] = [];
  if (phone.length >= 7) orParts.push(`phone_lookup.eq.${phone}`);
  if (email) orParts.push(`email_norm.eq.${email}`);
  if (!orParts.length) return null;
  const { data: sibs } = await supabase
    .from("portal_parent_contacts")
    .select("contact_id")
    .or(orParts.join(","));
  const ids = [...new Set((sibs || []).map((r) => clean(r.contact_id, 120)).filter(Boolean))];
  if (!ids.length) return null;
  const { data: mans } = await supabase
    .from("portal_parent_gocardless_mandates")
    .select("contact_id, gocardless_mandate_id, gocardless_customer_id, mandate_status")
    .in("contact_id", ids);
  for (const m of mans || []) {
    const mid = clean(m.gocardless_mandate_id, 80);
    if (!mandateIsActive(m.mandate_status) || !mid) continue;
    return {
      contact_id: clean(m.contact_id, 120),
      gocardless_mandate_id: mid,
      gocardless_customer_id: clean(m.gocardless_customer_id, 80) || null,
      mandate_status: String(m.mandate_status || "active"),
    };
  }
  return null;
}

function instalmentIsGcCollect(row: InvoicePaymentScheduleRow): boolean {
  const via = String(row.collect_via || "").toLowerCase();
  if (via === "bank_transfer" || via === "bank") return false;
  // Default unpaid schedule rows on a GC invoice are Direct Debit.
  return true;
}

/**
 * Create GoCardless payments for unpaid Direct Debit instalments only
 * (never the full invoice total in one shot).
 */
export async function scheduleGocardlessPaymentsForContact(
  supabase: SupabaseClient,
  input: {
    contactId: string;
    mandateId: string;
    /** If set, only this invoice; otherwise all unpaid GC invoices. */
    invoiceId?: string | null;
  },
): Promise<{ scheduled: number; errors: string[] }> {
  const contactId = clean(input.contactId, 120);
  const mandateId = clean(input.mandateId, 80);
  if (!contactId || !mandateId) return { scheduled: 0, errors: ["missing_ids"] };

  let q = supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, due_date, payment_status, payment_method_hint, gocardless_payment_id, share_status, payment_schedule",
    )
    .eq("contact_id", contactId)
    .eq("share_status", "ready")
    .in("payment_status", ["unpaid", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false });

  if (input.invoiceId) {
    q = q.eq("id", clean(input.invoiceId, 60));
  } else {
    q = q.eq("payment_method_hint", "gocardless");
  }

  const { data: rows, error } = await q.limit(40);
  if (error) {
    console.error("[scheduleGocardlessPaymentsForContact]", error.message);
    return { scheduled: 0, errors: [error.message] };
  }

  let scheduled = 0;
  const errors: string[] = [];
  for (const row of rows || []) {
    const invNo = clean(row.invoice_number, 40) || "invoice";
    const schedule = normalizePaymentSchedule(row.payment_schedule);
    const now = new Date().toISOString();

    if (schedule.length) {
      let scheduleChanged = false;
      const nextSchedule = schedule.map((r) => ({ ...r }));
      for (const inst of nextSchedule) {
        if (inst.status === "paid") continue;
        if (!instalmentIsGcCollect(inst)) continue;
        if (clean(inst.gocardless_payment_id, 80)) continue;
        const amount = Number(inst.amount_gbp) || 0;
        if (!(amount > 0)) continue;
        const amountPence = Math.round(amount * 100);
        const created = await gocardlessCreatePayment({
          mandateId,
          amountPence,
          description: `clubSENsational ${invNo} · ${clean(inst.label, 40)}`.slice(0, 100),
          chargeDate: gocardlessChargeDate(inst.due_date),
          invoiceShareId: String(row.id),
          contactId,
          invoiceNumber: invNo,
          idempotencyKey: `inv-${row.id}-seq-${inst.seq}`,
        });
        if (!created.ok) {
          errors.push(`${row.id}:seq${inst.seq}:${created.error}:${created.detail || ""}`);
          continue;
        }
        inst.gocardless_payment_id = created.data.id;
        scheduleChanged = true;
        scheduled += 1;
      }
      if (scheduleChanged) {
        const firstPayId = nextSchedule.find((r) =>
          clean(r.gocardless_payment_id, 80)
        )?.gocardless_payment_id || null;
        await supabase
          .from("portal_parent_invoice_share")
          .update({
            payment_schedule: nextSchedule,
            gocardless_mandate_id: mandateId,
            gocardless_payment_id: firstPayId || row.gocardless_payment_id,
            updated_at: now,
          })
          .eq("id", row.id);
      }
      continue;
    }

    // Legacy single-amount invoice (no schedule): one payment for the balance.
    if (clean(row.gocardless_payment_id, 80)) continue;
    const amount = row.amount_gbp != null ? Number(row.amount_gbp) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`${row.id}:bad_amount`);
      continue;
    }
    const amountPence = Math.round(amount * 100);
    const created = await gocardlessCreatePayment({
      mandateId,
      amountPence,
      description: `clubSENsational ${invNo}`.slice(0, 100),
      chargeDate: gocardlessChargeDate(row.due_date),
      invoiceShareId: String(row.id),
      contactId,
      invoiceNumber: invNo,
      idempotencyKey: `inv-${row.id}`,
    });
    if (!created.ok) {
      errors.push(`${row.id}:${created.error}:${created.detail || ""}`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("portal_parent_invoice_share")
      .update({
        gocardless_payment_id: created.data.id,
        gocardless_mandate_id: mandateId,
        updated_at: now,
      })
      .eq("id", row.id)
      .is("gocardless_payment_id", null);
    if (upErr) {
      errors.push(`${row.id}:db:${upErr.message}`);
      continue;
    }
    scheduled += 1;
  }
  return { scheduled, errors };
}

export async function upsertMandateRow(
  supabase: SupabaseClient,
  patch: Record<string, unknown> & { contact_id: string },
) {
  const now = new Date().toISOString();
  const row = { ...patch, updated_at: now };
  const { error } = await supabase.from("portal_parent_gocardless_mandates").upsert(row, {
    onConflict: "contact_id",
  });
  if (error) throw new Error(error.message);
}
