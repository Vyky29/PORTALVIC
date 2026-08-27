import {
  buildInvoiceSlotHeader,
  type ParsedSlot,
} from "./reenrolment_catalog.ts";
import type { PortalInvoiceLineItem } from "./portal_xero_product_catalog.ts";

const DEFAULT_VENUE = "SwimFarm Centre";

/** Per-client venue overrides (H&F LA). */
export const HF_VENUE_BY_CLIENT_KEY: Record<string, string> = {
  "abodi-patel": "Acton",
};

function clean(v: unknown, max = 160): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function titleCaseDay(day: string): string {
  const d = clean(day, 20).toLowerCase();
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Service / slot / venue block for H&F LA PDF header. */
export function buildHfLaHeader(
  slots: ParsedSlot[],
  clientKey: string,
): { service: string; slot: string; venue: string } {
  const services: string[] = [];
  const venues: string[] = [];
  for (const s of slots || []) {
    if (!s) continue;
    const mins = s.durationMin ? `${s.durationMin}' ` : "";
    const svc = String(s.serviceType || "Programme")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/Programme/i, "Programme");
    const title = `${mins}${svc}`.replace(/\s+/g, " ").trim();
    if (title && !services.includes(title)) services.push(title);
    const v = clean(s.venue, 80);
    if (v && !venues.includes(v)) venues.push(v);
  }
  const service = services.join(" / ") || "Programme";
  const slot = buildInvoiceSlotHeader(slots);
  const venue =
    HF_VENUE_BY_CLIENT_KEY[clientKey] ||
    (venues.length === 1 ? venues[0] : venues.join(" / ")) ||
    DEFAULT_VENUE;
  return { service, slot, venue };
}

/** Strip times from description; move weekday into detail column. */
export function toHfLaLineLayout(
  lines: PortalInvoiceLineItem[],
): PortalInvoiceLineItem[] {
  return (lines || []).map((li) => {
    let description = clean(li.description, 200);
    let detail = clean(li.detail, 80);
    const dayTail = description.match(
      /,\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?)(?:\s+.+)?$/i,
    );
    if (dayTail && dayTail.index != null) {
      const dayWord = dayTail[1];
      const plural = /s$/i.test(dayWord) ? dayWord : `${dayWord}s`;
      detail = titleCaseDay(plural);
      description = description.slice(0, dayTail.index).trim();
    }
    description = description
      .replace(
        /\s*[-–—,]?\s*\d{1,2}(?:[.:]\d{1,2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?:[.:]\d{1,2})?\s*(?:am|pm)?/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
    return {
      ...li,
      description: description || clean(li.description, 200),
      detail: detail || null,
    };
  });
}

/** Replace or prepend [[hf:…]] marker in share notes. */
export function mergeHfPdfHeaderMarker(
  notes: string,
  marker: string,
): string {
  const raw = String(notes || "");
  const stripped = raw.replace(/\[\[hf:[^\]]+\]\]\s*/gi, "").trim();
  const hdr = clean(marker, 400);
  if (!hdr) return stripped;
  return stripped ? `${hdr} ${stripped}` : hdr;
}
