/**
 * Resolve VAT mode + Client Id / PO for family invoices from portal contact + client_payments.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  normalizeFundingSource,
  normalizeInvoiceType,
  paymentClientKeyForParticipant,
  paymentRowToContext,
} from "./reenrolment_catalog.ts";
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function pickPo(data: Record<string, unknown>): string {
  for (const key of ["PO", "po", "Po", "purchase_order", "Purchase Order", "order_no", "Order No"]) {
    const s = clean(data[key], 80);
    if (s) return s;
  }
  return "";
}

function pickClientId(data: Record<string, unknown>, fallback: string): string {
  for (const key of [
    "Client Id",
    "Client ID",
    "client_id",
    "ClientId",
    "CFK ID",
    "cfk_id",
  ]) {
    const s = clean(data[key], 80);
    if (s) return s;
  }
  return fallback;
}

export type ParticipantInvoiceFunding = {
  vatMode: PortalInvoiceVatMode;
  fundingLabel: string;
  clientId: string;
  po: string;
  source: "funding_label" | "client_payments" | "default_private";
  /** client_payments.sheet: PARENTS | LA | DIRECT_PAYMENTS | … */
  paymentSheet: string;
};

export type InvoiceFundingCategory =
  | "parent_private"
  | "parent_direct_payment"
  | "la_managed";

const FUNDING_CATEGORY_LABELS: Record<InvoiceFundingCategory, string> = {
  parent_private: "Parents · Private (VAT 20%)",
  parent_direct_payment: "Parents · Direct Payment (exempt)",
  la_managed: "LA manages invoice (exempt)",
};

export function invoiceFundingCategoryLabel(category: InvoiceFundingCategory): string {
  return FUNDING_CATEGORY_LABELS[category] || category;
}

/** Who manages the invoice and VAT route for admin + parent portal. */
export function invoiceFundingCategory(input: {
  vatMode: PortalInvoiceVatMode;
  paymentMethodHint?: string;
  fundingLabel?: string;
  paymentSheet?: string;
}): InvoiceFundingCategory {
  const hint = clean(input.paymentMethodHint, 40).toLowerCase();
  const sheet = clean(input.paymentSheet, 40).toUpperCase();
  const label = clean(input.fundingLabel, 120).toLowerCase();

  if (hint === "la_funded" || sheet === "LA") {
    return "la_managed";
  }
  if (
    sheet === "DIRECT_PAYMENTS" ||
    input.vatMode === "exempt" ||
    label.includes("direct payment") ||
    label.includes("care package") ||
    label.includes("ehcp")
  ) {
    return "parent_direct_payment";
  }
  return "parent_private";
}

function normalizeNameKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Bill-to for LA-managed invoices: the funding authority (from client_payments
 * Funder/Funding), never the parent. Parents don't see or own these invoices.
 */
export async function resolveLaFunderBillTo(
  admin: SupabaseClient,
  opts: { contactId: string; displayName: string },
): Promise<{ name: string; lines: string[] }> {
  const displayName = clean(opts.displayName, 120);

  let paymentRow: Record<string, unknown> | null = null;
  const preferredKey = paymentClientKeyForParticipant(displayName);
  if (preferredKey) {
    const { data: keyed } = await admin
      .from("client_payments")
      .select("client_key, client_name, data")
      .eq("client_key", preferredKey)
      .maybeSingle();
    if (keyed) paymentRow = keyed as Record<string, unknown>;
  }
  if (!paymentRow && displayName) {
    const { data: byName } = await admin
      .from("client_payments")
      .select("client_key, client_name, data")
      .ilike("client_name", displayName)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byName) paymentRow = byName as Record<string, unknown>;
  }
  if (!paymentRow && displayName) {
    // Sheets often store short names ("Adam P" for "Adam Pilcher") — prefix match.
    const target = normalizeNameKey(displayName);
    const { data: laRows } = await admin
      .from("client_payments")
      .select("client_key, client_name, data, sheet")
      .in("sheet", ["LA", "DIRECT_PAYMENTS"])
      .limit(400);
    let best: Record<string, unknown> | null = null;
    let bestLen = 0;
    for (const row of laRows || []) {
      const candidate = normalizeNameKey(row.client_name);
      if (!candidate || candidate.length < 4) continue;
      if (target.startsWith(candidate) || candidate.startsWith(target)) {
        if (candidate.length > bestLen) {
          best = row as Record<string, unknown>;
          bestLen = candidate.length;
        }
      }
    }
    if (best) paymentRow = best;
  }

  const data =
    paymentRow?.data && typeof paymentRow.data === "object"
      ? (paymentRow.data as Record<string, unknown>)
      : {};
  const funder = clean(data["Funder"], 120) || clean(data["Funding"], 120);
  if (funder) return { name: funder, lines: ["UNITED KINGDOM"] };

  // Generic labels ("LA funded", "exempt") are not an authority name.
  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("funding_label")
    .eq("contact_id", clean(opts.contactId, 120))
    .maybeSingle();
  const label = clean(contact?.funding_label, 120);
  const generic = /^(la|nhs|ehcp|la funded|nhs funded|exempt|funded|local authority)$/i;
  const name = label && !generic.test(label) ? label : "Local Authority";
  return { name, lines: ["UNITED KINGDOM"] };
}

export async function resolveParticipantInvoiceFunding(
  admin: SupabaseClient,
  opts: { contactId: string; displayName: string },
): Promise<ParticipantInvoiceFunding> {
  const contactId = clean(opts.contactId, 120);
  const displayName = clean(opts.displayName, 120);

  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("funding_label, contact_id")
    .eq("contact_id", contactId)
    .maybeSingle();

  const fundingLabel = clean(contact?.funding_label, 120);
  const fl = fundingLabel.toLowerCase();
  if (
    fl &&
    (fl.includes("la") ||
      fl.includes("nhs") ||
      fl.includes("ehcp") ||
      fl.includes("exempt") ||
      fl.includes("direct payment") ||
      fl.includes("local authority") ||
      fl.includes("care package"))
  ) {
    return {
      vatMode: "exempt",
      fundingLabel,
      clientId: contactId,
      po: "",
      source: "funding_label",
      paymentSheet: "",
    };
  }
  if (
    fl &&
    (fl.includes("private") || fl.includes("vat") || fl.includes("pf") || fl.includes("parent"))
  ) {
    return {
      vatMode: "vat_20",
      fundingLabel,
      clientId: contactId,
      po: "",
      source: "funding_label",
      paymentSheet: "",
    };
  }

  const preferredKey = paymentClientKeyForParticipant(displayName);
  let paymentRow: Record<string, unknown> | null = null;
  if (preferredKey) {
    const { data: keyed } = await admin
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
      .eq("client_key", preferredKey)
      .maybeSingle();
    if (keyed) paymentRow = keyed as Record<string, unknown>;
  }
  if (!paymentRow && displayName) {
    const { data: byName } = await admin
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
      .ilike("client_name", displayName)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byName) paymentRow = byName as Record<string, unknown>;
  }

  if (paymentRow) {
    const ctx = paymentRowToContext(paymentRow);
    const data =
      paymentRow.data && typeof paymentRow.data === "object"
        ? (paymentRow.data as Record<string, unknown>)
        : {};
    const fundNorm = normalizeFundingSource(ctx.fundingSource);
    const vat =
      ctx.vatCode === "exempt" ||
      /local authority|nhs|direct payment/i.test(fundNorm) ||
      String(paymentRow.sheet || "").toUpperCase() === "LA"
        ? "exempt"
        : "vat_20";
    // If sheet PARENTS and vat empty → private (vat_20).
    const vatRaw = normalizeInvoiceType(String(data.vat || data.VAT || ""));
    const finalVat: PortalInvoiceVatMode =
      String(paymentRow.sheet || "").toUpperCase() === "LA"
        ? "exempt"
        : vatRaw.code === "exempt"
          ? "exempt"
          : vat;
    return {
      vatMode: finalVat,
      fundingLabel: fundNorm || ctx.fundingSource || (finalVat === "exempt" ? "LA / NHS" : "Private"),
      clientId: pickClientId(data, clean(paymentRow.client_key, 80) || contactId),
      po: pickPo(data),
      source: "client_payments",
      paymentSheet: clean(paymentRow.sheet, 40),
    };
  }

  return {
    vatMode: "vat_20",
    fundingLabel: fundingLabel || "Private",
    clientId: contactId,
    po: "",
    source: "default_private",
    paymentSheet: "",
  };
}
