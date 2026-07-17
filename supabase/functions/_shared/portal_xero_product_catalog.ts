/**
 * Portal programme keys → Xero Item codes (VAT taxable vs exempt).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";
import {
  formatServiceTypeLabel,
  formatTimeSlotLabel,
  normalizeServiceType,
  type ParsedSlot,
} from "./reenrolment_catalog.ts";

export type PortalInvoiceLineItem = {
  service_key: string;
  description: string;
  /** Session day/time/venue shown under the description (e.g. "Sunday 2:00–2:30 · SwimFarm"). */
  detail?: string | null;
  /** Compact term session dates shown below the day/time/venue line. */
  dates?: string | null;
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

/** "Sunday 2:00pm to 2:30pm · SwimFarm" from a weekly slot (day, time, venue). */
export function slotSessionDetail(
  slot: Pick<ParsedSlot, "day" | "timeSlot" | "venue">,
): string {
  const bits = [
    String(slot.day || "").trim(),
    formatTimeSlotLabel(String(slot.timeSlot || "")),
  ]
    .filter(Boolean)
    .join(" ");
  const venue = String(slot.venue || "").trim();
  return [bits, venue].filter(Boolean).join(" · ");
}

type ReenrolTerm = "autumn" | "spring" | "summer";

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const TERM_DATE_WINDOWS: Record<
  ReenrolTerm,
  {
    weekday: { start: string; end: string; closures: Array<[string, string]> };
    weekend: { start: string; end: string; closures: Array<[string, string]> };
  }
> = {
  autumn: {
    weekday: {
      start: "2026-09-05",
      end: "2026-12-18",
      closures: [["2026-10-26", "2026-10-30"]],
    },
    weekend: {
      start: "2026-09-05",
      end: "2026-12-18",
      closures: [
        ["2026-10-24", "2026-10-25"],
        ["2026-10-31", "2026-11-01"],
      ],
    },
  },
  spring: {
    weekday: {
      start: "2027-01-04",
      end: "2027-03-25",
      closures: [["2027-02-15", "2027-02-18"]],
    },
    weekend: {
      start: "2027-01-08",
      end: "2027-03-25",
      closures: [
        ["2027-02-13", "2027-02-14"],
        ["2027-02-20", "2027-02-21"],
      ],
    },
  },
  summer: {
    weekday: {
      start: "2027-04-17",
      end: "2027-07-22",
      closures: [["2027-05-31", "2027-06-03"]],
    },
    weekend: {
      start: "2027-04-17",
      end: "2027-07-12",
      closures: [
        ["2027-05-29", "2027-05-30"],
        ["2027-06-05", "2027-06-06"],
      ],
    },
  },
};

function isoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Compact exact dates for one weekly slot, grouped by month. */
export function slotTermSessionDates(
  term: ReenrolTerm,
  day: string,
  expectedCount: number,
): string | null {
  const dayKey = String(day || "").trim().toLowerCase().replace(/s$/, "");
  const dayIndex = DAY_INDEX[dayKey];
  if (!Number.isInteger(dayIndex)) return null;
  const window = TERM_DATE_WINDOWS[term][dayIndex === 0 || dayIndex === 6 ? "weekend" : "weekday"];
  const start = new Date(`${window.start}T00:00:00Z`);
  const end = new Date(`${window.end}T00:00:00Z`);
  const dates: Date[] = [];
  for (let dt = new Date(start); dt <= end; dt.setUTCDate(dt.getUTCDate() + 1)) {
    if (dt.getUTCDay() !== dayIndex) continue;
    const iso = isoDateUtc(dt);
    if (window.closures.some(([from, to]) => iso >= from && iso <= to)) continue;
    dates.push(new Date(dt));
  }
  const count = Math.max(0, Math.round(Number(expectedCount) || 0));
  const selected = count > 0 ? dates.slice(0, count) : dates;
  if (!selected.length) return null;
  const grouped = new Map<string, number[]>();
  for (const dt of selected) {
    const month = dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    if (!grouped.has(month)) grouped.set(month, []);
    grouped.get(month)!.push(dt.getUTCDate());
  }
  return (
    "Dates: " +
    Array.from(grouped.entries())
      .map(([month, days]) => `${days.join(", ")} ${month}`)
      .join("; ")
  );
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
    {
      service_key: string;
      description: string;
      details: string[];
      sessions: number;
      termTotal: number;
    }
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
    const detail = slotSessionDetail(slot);
    const sessions = Number(slot.sessions?.[input.term] || 0);
    const aggregateKey = `${service_key}\u0000${detail}`;
    const prev = byKey.get(aggregateKey);
    if (prev) {
      prev.sessions += sessions > 0 ? sessions : 1;
      prev.termTotal = round2(prev.termTotal + termTotal);
      if (description.length > prev.description.length) prev.description = description;
      if (detail && !prev.details.includes(detail)) prev.details.push(detail);
    } else {
      byKey.set(aggregateKey, {
        service_key,
        description,
        details: detail ? [detail] : [],
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
      detail: agg.details.join(" · ") || null,
      dates: slotTermSessionDates(
        input.term,
        String(agg.details[0] || "").split(/\s+/)[0] || "",
        qty,
      ),
      quantity: qty,
      unit_price_gbp: unit,
      amount_gbp: agg.termTotal,
      xero_item_code: xeroItemCodeForService(mapRow, input.vatMode),
    });
  }

  lines.sort((a, b) => a.service_key.localeCompare(b.service_key));
  return lines;
}

function fundedEnvironmentForLine(line: PortalInvoiceLineItem): string {
  const key = String(line.service_key || "").toUpperCase();
  const desc = String(line.description || "").toLowerCase();
  if (key.includes("AQUATIC") || /aquatic|swim/.test(desc)) return "aquatic";
  if (key.includes("CLIMB") || /climb/.test(desc)) return "climbing";
  if (key.includes("PHYSICAL") || /physical|movement|fitness/.test(desc)) {
    return "physical activity";
  }
  if (key.includes("MULTI") || /multi.?activity/.test(desc)) return "multi-activity";
  if (key.includes("COUNSELL") || /counsell/.test(desc)) return "counselling";
  if (key.includes("BESPOKE") || /bespoke/.test(desc)) return "bespoke activity";
  if (key.includes("DAY_CENTRE") || /day centre/.test(desc)) return "day centre";
  return "structured activity";
}

function naturalList(values: string[]): string {
  if (values.length <= 1) return values[0] || "structured activity";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

export function fundedProvisionDescriptionLead(lines: PortalInvoiceLineItem[]): string {
  const environments = Array.from(
    new Set((lines || []).map(fundedEnvironmentForLine).filter(Boolean)),
  );
  const environmentPhrase =
    environments.length === 1
      ? `${/^[aeiou]/i.test(environments[0]) ? "an" : "a"} ${environments[0]} environment`
      : `${naturalList(environments)} environments`;
  return (
    `Structured activity support delivered within ${environmentPhrase} for a SEND participant ` +
    "as part of funded provision."
  );
}

export function lineItemsToDescription(
  lines: PortalInvoiceLineItem[],
  opts: { fundedProvision?: boolean } = {},
): string {
  if (!lines.length) {
    return opts.fundedProvision
      ? "Structured activity support delivered within a structured activity environment for a SEND participant as part of funded provision."
      : "Structured activity support delivered for a SEND participant.";
  }
  const lead = opts.fundedProvision
    ? fundedProvisionDescriptionLead(lines)
    : "Structured activity support delivered for a SEND participant.";
  return (
    lead +
    "\n\n" +
    lines
      .map((l) => {
        const detail = String(l.detail || "").trim();
        return `${l.description}${detail ? ` (${detail})` : ""} — GBP ${l.amount_gbp.toFixed(2)}`;
      })
      .join("\n")
  );
}
