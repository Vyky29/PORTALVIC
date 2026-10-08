// @ts-nocheck — After mark_refunded: Xero credit note + optional parent notify.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "./xero_oauth_store.ts";
import { xeroCreateRefundCreditNote } from "./xero_credit_notes.ts";
import { notifyParentRefundPaidOut } from "./portal_refund_payout_notify.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseInvoiceNumber(notes: unknown, linked: unknown): string | null {
  const fromCol = clean(linked, 40);
  if (/^INV-P-\d{4}$/.test(fromCol)) return fromCol;
  const m = String(notes || "").match(/INV-P-\d{4}/);
  return m ? m[0] : null;
}

function creditNoteHint(invoiceNumber: string, entryId: string): string {
  const base = invoiceNumber.replace(/^INV-P-/, "CN-P-");
  return `${base}-R${String(entryId).slice(0, 4)}`;
}

export type SettleRefundOpts = {
  notifyParent?: boolean;
  sentByUserId?: string | null;
  sentByEmail?: string | null;
  linkedInvoiceNumber?: string | null;
  skipXero?: boolean;
};

export async function settleFamilyRefundAfterPayout(
  admin: SupabaseClient,
  entry: Record<string, unknown>,
  opts: SettleRefundOpts = {},
): Promise<Record<string, unknown>> {
  const entryId = clean(entry.id, 80);
  const kind = clean(entry.kind, 20);
  if (kind !== "refund") return { ok: false, error: "not_a_refund" };

  const amount = Number(entry.amount_gbp) || 0;
  const cid = clean(entry.contact_id, 120);
  const existingCn = clean(entry.xero_credit_note_id, 80);

  let linkedInv =
    clean(opts.linkedInvoiceNumber, 40) ||
    parseInvoiceNumber(entry.notes, entry.linked_invoice_number);

  if (!linkedInv && cid && amount > 0) {
    const { data: guess } = await admin
      .from("portal_parent_invoice_share")
      .select("invoice_number, amount_gbp, payment_status")
      .eq("contact_id", cid)
      .eq("payment_status", "paid")
      .order("paid_at", { ascending: false })
      .limit(8);
    const hit = (guess || []).find(
      (r) => Math.abs(Number(r.amount_gbp) - amount) < 0.01,
    );
    if (hit) linkedInv = clean(hit.invoice_number, 40);
    else if ((guess || []).length === 1) linkedInv = clean(guess![0].invoice_number, 40);
  }

  const result: Record<string, unknown> = {
    ok: true,
    linked_invoice_number: linkedInv,
    xero: null,
    notify: null,
  };

  if (!opts.skipXero && !existingCn && linkedInv && amount > 0) {
    await xeroHydrateRefreshFromDb(admin);

    const { data: share } = await admin
      .from("portal_parent_invoice_share")
      .select(
        "invoice_number, xero_invoice_id, vat_mode, line_description, contact_id",
      )
      .eq("invoice_number", linkedInv)
      .maybeSingle();

    const xeroInvId = clean(share?.xero_invoice_id, 80);
    if (!share || !xeroInvId) {
      result.xero = { ok: false, error: "invoice_not_in_xero", invoice: linkedInv };
    } else {
      const { data: parents } = await admin
        .from("portal_parent_contacts")
        .select("parent_display, email, xero_contact_id")
        .eq("contact_id", cid)
        .limit(1);
      const parent = parents?.[0];

      const cnRes = await xeroCreateRefundCreditNote(admin, {
        contactId: cid,
        parentName: clean(parent?.parent_display, 120) || "Parent / carer",
        parentEmail: clean(parent?.email, 200) || null,
        existingXeroContactId: clean(parent?.xero_contact_id, 80) || null,
        amountGbp: amount,
        vatMode: clean(share.vat_mode, 20) || "vat_20",
        lineDescription:
          `Refund — ${clean(entry.participant_display, 80)} · ${clean(entry.service_label, 80) || linkedInv}`.slice(
            0,
            4000,
          ),
        reference: `Portal refund · ${linkedInv}`,
        invoiceXeroId: xeroInvId,
        creditNoteNumberHint: creditNoteHint(linkedInv, entryId),
        dateIso: new Date().toISOString().slice(0, 10),
      });

      result.xero = cnRes;
      if (cnRes.ok) {
        await admin
          .from("portal_parent_family_credits")
          .update({
            linked_invoice_number: linkedInv,
            xero_credit_note_id: cnRes.xero_credit_note_id,
            xero_credit_note_number: cnRes.xero_credit_note_number,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entryId);
        await xeroPersistRefreshToDb(admin);
      }
    }
  } else if (existingCn) {
    result.xero = { ok: true, skipped: true, xero_credit_note_id: existingCn };
  }

  const alreadyNotified = !!entry.refund_notify_sent_at;
  if (opts.notifyParent && !alreadyNotified) {
    const notify = await notifyParentRefundPaidOut(admin, {
      contactId: cid,
      participantDisplay: clean(entry.participant_display, 120),
      amountGbp: amount,
      creditNoteNumber: clean(entry.xero_credit_note_number, 40) ||
        (result.xero && (result.xero as Record<string, unknown>).xero_credit_note_number),
      invoiceNumber: linkedInv,
      sentByUserId: opts.sentByUserId,
      sentByEmail: opts.sentByEmail,
    });
    result.notify = notify;
    if (notify.ok) {
      await admin
        .from("portal_parent_family_credits")
        .update({
          refund_notify_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", entryId);
    }
  } else if (opts.notifyParent && alreadyNotified) {
    result.notify = { ok: false, skipped: "already_notified" };
  }

  return result;
}
