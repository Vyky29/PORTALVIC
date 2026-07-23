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
import {
  isHammersmithFulhamFunder,
  laBillToAdminNote,
  resolveHfBandOverride,
  resolveHfBillToProfile,
  type LaBillToProfile,
} from "./portal_la_bill_to.ts";

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
  | "la_managed"
  | "nhs_managed";

const FUNDING_CATEGORY_LABELS: Record<InvoiceFundingCategory, string> = {
  parent_private: "Privately",
  /** Parent pays; LA funds the package — VAT exempt (not Private 20%). */
  parent_direct_payment: "Direct Payment Private",
  la_managed: "LA managed",
  nhs_managed: "NHS managed",
};

export function invoiceFundingCategoryLabel(category: InvoiceFundingCategory): string {
  return FUNDING_CATEGORY_LABELS[category] || category;
}

/**
 * Funding first (not VAT):
 * Privately · Direct Payment Private (exempt) · LA managed · NHS managed.
 * Sheet DIRECT_PAYMENTS beats a wrong re-enrol "privately_funded" choice.
 * Never infer DP from vat_mode=exempt alone.
 */
export function invoiceFundingCategory(input: {
  vatMode?: PortalInvoiceVatMode;
  paymentMethodHint?: string;
  fundingLabel?: string;
  paymentSheet?: string;
  /** Re-enrol choices_2627.funding_code */
  fundingCode?: string;
  /** Re-enrol choices_2627.billing_mode */
  billingMode?: string;
}): InvoiceFundingCategory {
  const hint = clean(input.paymentMethodHint, 40).toLowerCase();
  const sheet = clean(input.paymentSheet, 40).toUpperCase();
  const label = clean(input.fundingLabel, 120).toLowerCase();
  const code = clean(input.fundingCode, 60).toLowerCase();
  const billing = clean(input.billingMode, 40).toLowerCase();
  const blob = `${code} ${billing} ${label}`;
  const isDirectPaymentLabel =
    /direct.?payment/.test(label) ||
    label.includes("supported with funds") ||
    label.includes("using funds from la") ||
    label.includes("funds from the la") ||
    label.includes("funds from la") ||
    label.includes("parent (exempt") ||
    label.includes("care package") ||
    label.includes("ehcp");

  if (
    /\bnhs\b/.test(blob) ||
    /\bsbs\b/.test(blob) ||
    blob.includes("nhs-funded") ||
    blob.includes("funded by nhs")
  ) {
    return "nhs_managed";
  }

  // Office payment sheet is source of truth over re-enrol form mistakes.
  if (sheet === "DIRECT_PAYMENTS" || billing === "direct_payments" || code === "la_direct_payments") {
    return "parent_direct_payment";
  }
  if (isDirectPaymentLabel) {
    return "parent_direct_payment";
  }

  if (
    billing === "funder_invoice" ||
    code === "la_managed" ||
    hint === "la_funded" ||
    sheet === "LA"
  ) {
    return "la_managed";
  }

  if (
    billing === "private" ||
    code === "privately_funded" ||
    code === "private" ||
    (label.includes("private") && !isDirectPaymentLabel) ||
    sheet === "PARENTS"
  ) {
    return "parent_private";
  }

  if (hint === "la_funded" || sheet === "LA") return "la_managed";
  return "parent_private";
}

function normalizeNameKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type LaFunderBillTo = {
  name: string;
  lines: string[];
  paymentEmail: string | null;
  paymentCcEmail: string | null;
  paymentInstruction: string | null;
  profileKey: string | null;
  adminNote: string | null;
};

async function loadLaPaymentRow(
  admin: SupabaseClient,
  displayName: string,
): Promise<Record<string, unknown> | null> {
  let paymentRow: Record<string, unknown> | null = null;

  const tryKey = async (clientKey: string) => {
    if (!clientKey || paymentRow) return;
    const { data: keyed } = await admin
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
      .eq("client_key", clientKey)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (keyed) paymentRow = keyed as Record<string, unknown>;
  };

  const preferredKey = paymentClientKeyForParticipant(displayName);
  await tryKey(preferredKey);
  /* Sheet keys are often compacted (jackw) while aliases emit hyphenated (jack-w). */
  if (!paymentRow && preferredKey.includes("-")) {
    await tryKey(preferredKey.replace(/-/g, ""));
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
  if (!paymentRow && displayName) {
    // Sheets often store short names ("Adam P" / "Jack W") — surname-aware prefix match.
    const target = normalizeNameKey(displayName);
    const targetToks = target.split(/\s+/).filter(Boolean);
    const wantFirst = targetToks[0] || "";
    const wantLast = targetToks.length > 1 ? targetToks[targetToks.length - 1] : "";
    const { data: laRows } = await admin
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
      .in("sheet", ["LA", "DIRECT_PAYMENTS"])
      .limit(400);
    let best: Record<string, unknown> | null = null;
    let bestScore = 0;
    for (const row of laRows || []) {
      const candidate = normalizeNameKey(row.client_name);
      if (!candidate || candidate.length < 4) continue;
      const candToks = candidate
        .split(/\s+/)
        .filter((t) => t && t !== "acat");
      const candLast = candToks.length > 1
        ? candToks[candToks.length - 1]
        : candToks[0] || "";
      let score = 0;
      if (candidate === target) score = 1000;
      else if (target.startsWith(candidate) || candidate.startsWith(target)) {
        score = 100 + candidate.length;
        if (wantLast && candLast && candLast !== wantFirst) {
          if (wantLast === candLast) score += 500;
          else if (wantLast.startsWith(candLast) || candLast.startsWith(wantLast)) {
            score += 400;
          } else if (candLast.length === 1 && wantLast.charAt(0) === candLast) {
            score += 400; /* Walker ↔ W */
          } else {
            score = 0; /* Jack Walker must not match Jack S */
          }
        }
      }
      if (score > bestScore) {
        best = row as Record<string, unknown>;
        bestScore = score;
      }
    }
    if (best) paymentRow = best;
  }
  return paymentRow;
}

function profileToBillTo(profile: LaBillToProfile): LaFunderBillTo {
  return {
    name: profile.name,
    lines: [...profile.lines],
    paymentEmail: profile.paymentEmail,
    paymentCcEmail: profile.paymentCcEmail,
    paymentInstruction: profile.paymentInstruction,
    profileKey: profile.key,
    adminNote: laBillToAdminNote(profile),
  };
}

/**
 * Bill-to for LA-managed invoices: the funding authority, never the parent.
 * H&F splits Children (<18) vs Adult ASC (18+) with fixed council addresses
 * and payment email routing.
 */
export async function resolveLaFunderBillTo(
  admin: SupabaseClient,
  opts: { contactId: string; displayName: string; dobIso?: string | null },
): Promise<LaFunderBillTo> {
  const displayName = clean(opts.displayName, 120);
  const contactId = clean(opts.contactId, 120);

  let dobIso = opts.dobIso ? String(opts.dobIso).slice(0, 10) : null;
  if (!dobIso && contactId) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("dob_iso")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (pax?.dob_iso) dobIso = String(pax.dob_iso).slice(0, 10);
  }

  const paymentRow = await loadLaPaymentRow(admin, displayName);
  const data =
    paymentRow?.data && typeof paymentRow.data === "object"
      ? (paymentRow.data as Record<string, unknown>)
      : {};
  const funder = clean(data["Funder"], 120) || clean(data["Funding"], 120);
  const clientKey = clean(paymentRow?.client_key, 80);

  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("funding_label")
    .eq("contact_id", contactId)
    .maybeSingle();
  const fundingLabel = clean(contact?.funding_label, 120);

  const funderBlob = `${funder} ${fundingLabel} ${clientKey}`;
  const knownHfBand = resolveHfBandOverride(displayName, clientKey);
  if (
    isHammersmithFulhamFunder(funderBlob) ||
    isHammersmithFulhamFunder(funder) ||
    knownHfBand != null
  ) {
    return profileToBillTo(
      resolveHfBillToProfile({
        displayName,
        clientKey,
        dobIso,
      }),
    );
  }

  if (funder) {
    return {
      name: funder,
      lines: ["UNITED KINGDOM"],
      paymentEmail: null,
      paymentCcEmail: null,
      paymentInstruction: null,
      profileKey: null,
      adminNote: null,
    };
  }

  // Generic labels ("LA funded", "exempt") are not an authority name.
  const generic = /^(la|nhs|ehcp|la funded|nhs funded|exempt|funded|local authority)$/i;
  const name = fundingLabel && !generic.test(fundingLabel) ? fundingLabel : "Local Authority";
  return {
    name,
    lines: ["UNITED KINGDOM"],
    paymentEmail: null,
    paymentCcEmail: null,
    paymentInstruction: null,
    profileKey: null,
    adminNote: null,
  };
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

  /* Sheet first — short names (Eiji / Jack W / Yusef) beat contact funding_label. */
  const paymentRow = await loadLaPaymentRow(admin, displayName);

  if (paymentRow) {
    const ctx = paymentRowToContext(paymentRow);
    const data =
      paymentRow.data && typeof paymentRow.data === "object"
        ? (paymentRow.data as Record<string, unknown>)
        : {};
    const fundNorm = normalizeFundingSource(ctx.fundingSource);
    const sheet = clean(paymentRow.sheet, 40);
    const sheetUp = sheet.toUpperCase();
    const vatRaw = normalizeInvoiceType(String(data.vat || data.VAT || ""));
    const finalVat: PortalInvoiceVatMode =
      sheetUp === "LA" || sheetUp === "DIRECT_PAYMENTS"
        ? "exempt"
        : vatRaw.code === "exempt"
          ? "exempt"
          : ctx.vatCode === "exempt" ||
              /local authority|nhs|direct payment/i.test(fundNorm)
            ? "exempt"
            : "vat_20";
    return {
      vatMode: finalVat,
      fundingLabel:
        fundNorm ||
        ctx.fundingSource ||
        clean(data["Funding"], 120) ||
        (finalVat === "exempt" ? "Local Authority" : "Private"),
      clientId: pickClientId(data, clean(paymentRow.client_key, 80) || contactId),
      po: pickPo(data),
      source: "client_payments",
      paymentSheet: sheet,
    };
  }

  // Parent uses LA package funds → Direct Payment Private (exempt), not LA-managed.
  if (
    fl &&
    (/direct.?payment/.test(fl) ||
      fl.includes("using funds from la") ||
      fl.includes("funds from the la") ||
      fl.includes("funds from la") ||
      fl.includes("care package") ||
      fl.includes("ehcp"))
  ) {
    return {
      vatMode: "exempt",
      fundingLabel,
      clientId: contactId,
      po: "",
      source: "funding_label",
      paymentSheet: "DIRECT_PAYMENTS",
    };
  }
  if (
    fl &&
    (fl.includes("nhs") ||
      fl.includes("local authority") ||
      fl.includes("la managed") ||
      fl.includes("la funded") ||
      fl.includes("cwd") ||
      (/\bla\b/.test(fl) && !fl.includes("private")))
  ) {
    return {
      vatMode: "exempt",
      fundingLabel,
      clientId: contactId,
      po: "",
      source: "funding_label",
      paymentSheet: "LA",
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
      paymentSheet: fl.includes("exempt") ? "" : "PARENTS",
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
