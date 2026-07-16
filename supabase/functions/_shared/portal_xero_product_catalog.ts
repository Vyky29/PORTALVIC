/**
 * Portal programme keys → Xero Item codes (VAT taxable vs exempt).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";
import {
  formatServiceTypeLabel,
  normalizeServiceType,
  type ParsedSlot,
} from "./reenrolment_catalog.ts";

export type PortalInvoiceLineItem = {
  service_key: string;
  description: string;
  quantity: number;
  unit_price_gbp: number;
  amount_gbp: number;
  xero_item_code: string | null;
};

export type ProductMapRow = {
  service_key: string;
  label: string;
  xero_item_code_vat: string | null;
  xero_item_code_exempt: string | null;
  sort_order: number;
  notes: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Standard duration bucket for Xero product keys. */
export function durationBucket(durationMin: number): number {
  const d = Math.max(1, Math.round(Number(durationMin) || 30));
  if (d <= 35) return 30;
  if (d <= 52) return 45;
  if (d <= 75) return 60;
  return 90;
}

/** Canonical map key from a re-enrol slot (e.g. AQUATIC_30, CLIMBING_60). */
export function serviceKeyFromSlot(slot: Pick<ParsedSlot, "serviceType" | "durationMin">): string {
  const t = normalizeServiceType(slot.serviceType || "");
  const bucket = durationBucket(slot.durationMin || 30);

  if (t.includes("AQUATIC") || t.includes("SWIM") || t === "SW") {
    return `AQUATIC_${bucket}`;
  }
  if (t.includes("CLIMB") || t === "CL") {
    return `CLIMBING_${bucket}`;
  }
  if (t.includes("MULTI") || t === "MA" || t.includes("S&C")) {
    return `MULTI_${bucket}`;
  }
  if (t.includes("PHYSICAL") || t.includes("FITNESS")) {
    return `PHYSICAL_${bucket}`;
  }
  if (t.includes("BESPOKE") || t === "BS") {
    return `BESPOKE_${bucket}`;
  }
  if (t.includes("COUNSEL")) {
    return `COUNSELLING_${bucket}`;
  }
  const slug = t.replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return slug ? `${slug}_${bucket}` : `SERVICE_${bucket}`;
}

export function lineDescriptionForSlot(
  slot: Pick<ParsedSlot, "serviceType" | "durationMin" | "displayLabel" | "day">,
): string {
  const label = formatServiceTypeLabel(slot.serviceType || "");
  const mins = durationBucket(slot.durationMin || 30);
  const day = String(slot.day || "").trim();
  const extra = String(slot.displayLabel || "").trim();
  if (extra && extra.length > 20) {
    return extra.slice(0, 240);
  }
  return day ? `${mins}' ${label} — ${day}` : `${mins}' ${label}`;
}

export async function loadProductMap(
  admin: SupabaseClient,
): Promise<Map<string, ProductMapRow>> {
  const { data } = await admin
    .from("portal_xero_product_map")
    .select("service_key, label, xero_item_code_vat, xero_item_code_exempt, sort_order, notes")
    .order("sort_order", { ascending: true });
  const out = new Map<string, ProductMapRow>();
  for (const row of data || []) {
    if (!row?.service_key) continue;
    out.set(String(row.service_key), row as ProductMapRow);
  }
  return out;
}

export function xeroItemCodeForService(
  map: ProductMapRow | undefined,
  vatMode: PortalInvoiceVatMode,
): string | null {
  if (!map) return null;
  if (vatMode === "exempt") {
    return map.xero_item_code_exempt || map.xero_item_code_vat || null;
  }
  return map.xero_item_code_vat || map.xero_item_code_exempt || null;
}

export type ReenrolLineBuildInput = {
  slots: ParsedSlot[];
  weeklyChoices?: Record<string, { choice?: string }> | null;
  term: "autumn" | "spring" | "summer";
  vatMode: PortalInvoiceVatMode;
  productMap: Map<string, ProductMapRow>;
};

/** Build per-service invoice lines for one billing term from kept weekly slots. */
export function buildReenrolTermLineItems(input: ReenrolLineBuildInput): PortalInvoiceLineItem[] {
  const choices = input.weeklyChoices || {};
  const byKey = new Map<
    string,
    { service_key: string; description: string; sessions: number; termTotal: number }
  >();

  for (const slot of input.slots || []) {
    if (!slot || slot.isDayCentre) continue;
    const id = String(slot.id || "");
    const choice = id && choices[id] ? String(choices[id].choice || "keep").toLowerCase() : "keep";
    if (choice === "withdraw") continue;

    const termTotal = Number(slot.termTotals?.[input.term] || 0);
    if (!Number.isFinite(termTotal) || termTotal <= 0) continue;

    const service_key = serviceKeyFromSlot(slot);
    const description = lineDescriptionForSlot(slot);
    const sessions = Number(slot.sessions?.[input.term] || 0);
    const prev = byKey.get(service_key);
    if (prev) {
      prev.sessions += sessions > 0 ? sessions : 1;
      prev.termTotal = round2(prev.termTotal + termTotal);
      if (description.length > prev.description.length) prev.description = description;
    } else {
      byKey.set(service_key, {
        service_key,
        description,
        sessions: sessions > 0 ? sessions : 1,
        termTotal: round2(termTotal),
      });
    }
  }

  const lines: PortalInvoiceLineItem[] = [];
  for (const agg of byKey.values()) {
    const mapRow = input.productMap.get(agg.service_key);
    const label = mapRow?.label || agg.description.split("—")[0].trim();
    const qty = Math.max(1, agg.sessions);
    const unit = round4(agg.termTotal / qty);
    lines.push({
      service_key: agg.service_key,
      description: label || agg.description,
      quantity: qty,
      unit_price_gbp: unit,
      amount_gbp: agg.termTotal,
      xero_item_code: xeroItemCodeForService(mapRow, input.vatMode),
    });
  }

  lines.sort((a, b) => a.service_key.localeCompare(b.service_key));
  return lines;
}

export function lineItemsToDescription(lines: PortalInvoiceLineItem[]): string {
  if (!lines.length) {
    return "Structured activity support delivered across aquatic environments for a SEND participant.";
  }
  return lines
    .map((l) => `${l.description} — GBP ${l.amount_gbp.toFixed(2)}`)
    .join("\n");
}
