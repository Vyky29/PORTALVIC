/**
 * Reshape live Ealing year INV-Ps for office review:
 * - Header: Client ID + Service + Slot + Venue + Reference (no PO, no payment plan)
 * - Lines: service name + weekday plural + Dates (time once in Slot header)
 * - Tinashe Mon/Wed at £345/session (£690/week)
 *
 * Dry-run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-ealing-year-invp-reshape.ts
 *
 * Apply + download PDFs:
 *   APPLY=1 DOWNLOAD=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-ealing-year-invp-reshape.ts
 *
 * Optional PO overrides (otherwise PO omitted on PDF until you seed them):
 *   PO_steven=… PO_samer=… PO_amar-rai=… etc.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  formatEalingPdfHeaderMarker,
  regeneratePortalInvoiceSharePdf,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
  buildInvoiceSlotHeader,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DOWNLOAD = (Deno.env.get("DOWNLOAD") || "") === "1" || APPLY;
const ONLY = (Deno.env.get("ONLY") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const OUT_DIR =
  Deno.env.get("OUT_DIR") ||
  "database/local-vault/private/ealing-year-invp-review";
const READY_LIKE = "office_funder_2627_ealing_year_%";
const YEAR_LABEL = `Academic year ${REENROL_ACADEMIC_YEAR.replace("-", "/")}`;
const INVOICE_DATE =
  (Deno.env.get("INVOICE_DATE") || "").trim() ||
  new Date().toISOString().slice(0, 10);
const YEAR_DUE_DATE = "2027-07-23";
const DEFAULT_VENUE = "SwimFarm Centre";

/** Fill when you have Ealing PO numbers — also overridable via env PO_<clientKey>. */
const PO_BY_KEY: Record<string, string> = {
  steven: Deno.env.get("PO_steven") || "",
  samer: Deno.env.get("PO_samer") || "",
  "amar-rai": Deno.env.get("PO_amar-rai") || "",
  "aydaan-ah": Deno.env.get("PO_aydaan-ah") || "",
  tinashe: Deno.env.get("PO_tinashe") || "",
  "amaar-ah": Deno.env.get("PO_amaar-ah") || "",
  "adaam-ah": Deno.env.get("PO_adaam-ah") || "",
};

/** Canonical Ealing billing Client IDs (seed-la-nhs-client-ids-regen-pdfs). */
const CLIENT_ID_BY_KEY: Record<string, string> = {
  "adaam-ah": "721303",
  "amaar-ah": "782835",
  "aydaan-ah": "780469",
  "amar-rai": "626186",
  samer: "972515",
  steven: "719915",
  tinashe: Deno.env.get("CLIENT_ID_tinashe") || "514985",
  "yousef-al": "790419",
};

/** Session clock overrides (same time all days — e.g. Tinashe Mon+Wed). */
const TIME_BY_KEY: Record<string, string> = {
  tinashe: Deno.env.get("TIME_tinashe") || "4 to 6.30 pm",
};

/** When LA Services string omits a clock (e.g. "Monday" only), fill from roster/office. */
const SLOT_TIME_BY_CLIENT_DAY: Record<string, Record<string, string>> = {
  "adaam-ah": { monday: "6 to 6.30" },
};

function fillMissingSlotTimes(slots: ParsedSlot[], clientKey: string): ParsedSlot[] {
  const map = SLOT_TIME_BY_CLIENT_DAY[clientKey];
  if (!map) return slots;
  return (slots || []).map((s) => {
    if (s?.timeSlot) return s;
    const day = String(s?.day || "").toLowerCase();
    const t = map[day];
    return t ? { ...s, timeSlot: t } : s;
  });
}

const VENUE_BY_KEY: Record<string, string> = {
  tinashe: Deno.env.get("VENUE_tinashe") || DEFAULT_VENUE,
};

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");
loadEnvFile("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clean(v: unknown, max = 160): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}
function titleCaseDay(day: string): string {
  const d = clean(day, 20).toLowerCase();
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}
function naturalDays(days: string[]): string {
  const ordered = [...days].sort(
    (a, b) =>
      WEEKDAY_ORDER.indexOf(a.toLowerCase()) -
      WEEKDAY_ORDER.indexOf(b.toLowerCase()),
  );
  if (ordered.length <= 1) return ordered[0] || "";
  if (ordered.length === 2) return `${ordered[0]} and ${ordered[1]}`;
  return `${ordered.slice(0, -1).join(", ")} and ${ordered[ordered.length - 1]}`;
}
function pickClientId(data: Record<string, unknown>, clientKey: string): string {
  if (Object.prototype.hasOwnProperty.call(CLIENT_ID_BY_KEY, clientKey)) {
    return clean(CLIENT_ID_BY_KEY[clientKey] || "", 80);
  }
  const fromData = clean(
    data["Client Id"] || data["Client ID"] || data.client_id || data.clientId,
    80,
  );
  if (/^\d{4,}$/.test(fromData)) return fromData;
  return "";
}
function pickPo(data: Record<string, unknown>, clientKey: string): string {
  if (Object.prototype.hasOwnProperty.call(PO_BY_KEY, clientKey)) {
    // Explicit map entry wins even when blank (clears a wrong NHS PO on Ealing).
    return clean(PO_BY_KEY[clientKey] || "", 80);
  }
  return clean(data.PO || data.po || data["PO Number"] || data.po_number, 80);
}

function forceSessionPrice(slots: ParsedSlot[], price: number): ParsedSlot[] {
  return (slots || []).map((s) => {
    const sessions = s.sessions || { autumn: 0, spring: 0, summer: 0, annual: 0 };
    return {
      ...s,
      pricePerSession: price,
      termTotals: {
        autumn: round2(price * num(sessions.autumn)),
        spring: round2(price * num(sessions.spring)),
        summer: round2(price * num(sessions.summer)),
        annual: round2(price * num(sessions.annual)),
      },
    };
  });
}

function forceSessionTime(slots: ParsedSlot[], timeSlot: string): ParsedSlot[] {
  const t = clean(timeSlot, 40);
  if (!t) return slots;
  return (slots || []).map((s) => {
    const next = { ...s, timeSlot: t };
    // Rebuild label so PDF description does not keep the old sheet clock.
    const mins = s.durationMin ? `${s.durationMin}' ` : "";
    const svc = String(s.serviceType || "")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/Programme/i, "Programme");
    const day = String(s.day || "").trim();
    const dayBit = day ? `, ${day}s` : "";
    next.displayLabel = `${mins}${svc}${dayBit}`.replace(/\s+/g, " ").trim();
    return next;
  });
}

/** Service title + "Mondays" detail; clock lives in the PDF Slot header. */
function toEalingLineLayout(lines: PortalInvoiceLineItem[]): PortalInvoiceLineItem[] {
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

function buildEalingHeader(
  slots: ParsedSlot[],
  clientKey: string,
): { service: string; slot: string; venue: string } {
  const services: string[] = [];
  for (const s of slots || []) {
    if (!s || s.isDayCentre) continue;
    const mins = s.durationMin ? `${s.durationMin}' ` : "";
    const svc = String(s.serviceType || "Programme")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/Programme/i, "Programme");
    const title = `${mins}${svc}`.replace(/\s+/g, " ").trim();
    if (title && !services.includes(title)) services.push(title);
  }
  const service = services.join(" / ") || "Programme";
  const slot = buildInvoiceSlotHeader(slots, {
    skipDayCentre: true,
    globalTimeOverride: TIME_BY_KEY[clientKey] || "",
  });
  const venue = VENUE_BY_KEY[clientKey] || DEFAULT_VENUE;
  return { service, slot, venue };
}

/** Academic year 2026/27 calendar years on each term block. */
function ealingTermLabel(term: "autumn" | "spring" | "summer"): string {
  if (term === "autumn") return "Autumn Term 2026";
  if (term === "spring") return "Spring Term 2027";
  return "Summer Term 2027";
}

const productMap = await loadProductMap(admin);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, share_status, payment_status, ready_by, amount_gbp, line_items, contact_id, notes, document_id",
  )
  .like("ready_by", READY_LIKE)
  .order("invoice_number");
if (error) throw new Error(error.message);

const rows = (shares || []).filter((r) => {
  const st = clean(r.share_status, 40).toLowerCase();
  const pay = clean(r.payment_status, 40).toLowerCase();
  if (!(st === "ready" && pay !== "void")) return false;
  if (!ONLY.length) return true;
  const marker = clean(r.ready_by, 160);
  const key = marker.replace(/^office_funder_2627_ealing_year_/, "").toLowerCase();
  return ONLY.includes(key);
});

const { data: laRows } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, data, sheet")
  .eq("sheet", "LA");

type Pack = {
  clientKey: string;
  clientName: string;
  weekly: ParsedSlot[];
  clientId: string;
  po: string;
  header: { service: string; slot: string; venue: string };
};

const packsByKey = new Map<string, Pack>();
for (const row of laRows || []) {
  const data = (row.data || {}) as Record<string, unknown>;
  const funder = clean(data.Funder || data.Funding || data.Paid, 80);
  if (!/ealing/i.test(funder)) continue;
  const clientKey = clean(row.client_key, 80);
  if (!clientKey || packsByKey.has(clientKey)) continue;
  const ctx = paymentRowToContext(row as Record<string, unknown>);
  let weekly = fillMissingSlotTimes(
    (ctx.weeklySlots || []) as ParsedSlot[],
    clientKey,
  );
  if (clientKey === "tinashe") {
    // Sheet Cost £690/week for Mon+Wed → £345/session (catalogue bespoke is wrong).
    weekly = forceSessionPrice(weekly, 345);
  }
  const timeOverride = TIME_BY_KEY[clientKey];
  if (timeOverride) weekly = forceSessionTime(weekly, timeOverride);
  packsByKey.set(clientKey, {
    clientKey,
    clientName: clean(ctx.clientName || row.client_name, 120),
    weekly,
    clientId: pickClientId(data, clientKey),
    po: pickPo(data, clientKey),
    header: buildEalingHeader(weekly, clientKey),
  });
}

console.log(`\nEaling year INV-Ps to reshape: ${rows.length}`);
console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}${DOWNLOAD ? " + DOWNLOAD" : ""}\n`);

const missingPo: string[] = [];
const planned: Array<{
  inv: string;
  clientKey: string;
  client: string;
  oldTotal: number;
  newTotal: number;
  sessions: number;
  clientId: string;
  po: string;
  header: { service: string; slot: string; venue: string };
  lines: PortalInvoiceLineItem[];
}> = [];

for (const share of rows) {
  const marker = clean(share.ready_by, 160);
  const clientKey = marker.replace(/^office_funder_2627_ealing_year_/, "");
  const pack = packsByKey.get(clientKey);
  if (!pack) {
    console.log("SKIP no_pack", share.invoice_number, clientKey);
    continue;
  }
  if (!pack.po) missingPo.push(`${pack.clientName} (${clientKey})`);

  const weeklyChoices: Record<string, { choice: string }> = {};
  for (const slot of pack.weekly) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }

  let lineItems: PortalInvoiceLineItem[] = [];
  for (const t of ["autumn", "spring", "summer"] as const) {
    const termLines = toEalingLineLayout(
      buildReenrolTermLineItems({
        slots: pack.weekly,
        weeklyChoices,
        term: t,
        vatMode: "exempt",
        productMap,
      }),
    ).map((li) => ({
      ...li,
      description: `${clean(li.description, 160)}, ${ealingTermLabel(t)}`,
    }));
    lineItems = lineItems.concat(termLines);
  }
  const newTotal = round2(lineItems.reduce((s, li) => s + num(li.amount_gbp), 0));
  const sessions = lineItems.reduce((s, li) => s + num(li.quantity), 0);
  planned.push({
    inv: clean(share.invoice_number, 40),
    clientKey,
    client: pack.clientName,
    oldTotal: num(share.amount_gbp),
    newTotal,
    sessions,
    clientId: pack.clientId || "—",
    po: pack.po || "—",
    header: pack.header,
    lines: lineItems,
  });

  console.log(
    [
      clean(share.invoice_number, 40),
      pack.clientName,
      `£${num(share.amount_gbp)} → £${newTotal}`,
      `sess=${sessions}`,
      `ClientID=${pack.clientId || "—"}`,
      `PO=${pack.po || "MISSING"}`,
      `lines=${lineItems.length}`,
    ].join(" | "),
  );
  console.log(
    `   HDR Service=${pack.header.service} | Slot=${pack.header.slot} | Venue=${pack.header.venue}`,
  );
  for (const li of lineItems) {
    console.log(
      `   ${li.description} · ${li.detail || ""} · x${li.quantity} · £${li.amount_gbp} · ${String(li.dates || "").slice(0, 70)}`,
    );
  }
}

if (missingPo.length && false) {
  // Ealing year INV-Ps intentionally omit the PO line on the PDF.
  console.log("\nWARNING — missing PO numbers:");
  for (const m of missingPo) console.log("  -", m);
}

if (!APPLY) {
  console.log("\nDry-run only. Re-run with APPLY=1 DOWNLOAD=1 when ready.");
  Deno.exit(0);
}

if (DOWNLOAD) await ensureDir(OUT_DIR);

for (const share of rows) {
  const marker = clean(share.ready_by, 160);
  const clientKey = marker.replace(/^office_funder_2627_ealing_year_/, "");
  const plan = planned.find((p) => p.clientKey === clientKey);
  const pack = packsByKey.get(clientKey);
  if (!plan || !pack) continue;

  const description = lineItemsToDescription(plan.lines, { fundedProvision: true });
  const qty = plan.lines.reduce((s, li) => s + num(li.quantity), 0) || 1;
  // Marker first so regenerate's notes merge (slice 800) cannot drop it.
  const hdrMarker = formatEalingPdfHeaderMarker(pack.header);
  const notes =
    `${hdrMarker} ${marker} · ${pack.clientName} · Ealing year · no payment plan on PDF · ` +
    `ClientID ${pack.clientId || "—"} · PO ${pack.po || "—"} · ` +
    `la_funded · dates from TERM_DATE_WINDOWS`;

  // Sync Client Id / PO onto client_payments so regeneratePortalInvoiceSharePdf resolves them.
  {
    const { data: payRows } = await admin
      .from("client_payments")
      .select("id, data")
      .eq("sheet", "LA")
      .eq("client_key", clientKey)
      .limit(1);
    const row = payRows?.[0];
    if (row?.id) {
      const data = { ...((row.data as Record<string, unknown>) || {}) };
      if (pack.clientId) {
        data["Client Id"] = pack.clientId;
        data["Client ID"] = pack.clientId;
      }
      if (pack.po) {
        data.PO = pack.po;
        data.po = pack.po;
      } else {
        // Clear stale PO (e.g. NHS PO wrongly stored on Ealing row).
        delete data.PO;
        delete data.po;
        delete data["PO Number"];
      }
      if (clientKey === "adaam-ah") {
        data.Services =
          "90' Multi-Activity, Sunday - 12.30 to 2 · 30' Aquatic Activity, Monday - 6 to 6.30";
      }
      await admin.from("client_payments").update({ data }).eq("id", row.id);
    }
  }

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: plan.newTotal,
      quantity: qty,
      unit_price_gbp: round2(plan.newTotal / qty),
      line_items: plan.lines,
      line_description: description,
      payment_schedule: [],
      next_instalment_due: null,
      due_date: YEAR_DUE_DATE,
      payment_method_hint: "la_funded",
      reference_text: YEAR_LABEL,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("UPDATE FAIL", plan.inv, upErr.message);
    continue;
  }

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id), {
    invoiceDateIso: INVOICE_DATE,
  });
  if (!pdf?.ok) {
    console.error("PDF FAIL", plan.inv, pdf);
    continue;
  }
  console.log("OK", plan.inv, `£${plan.newTotal}`, "pdf regenerated");

  if (!DOWNLOAD) continue;
  const { data: share2 } = await admin
    .from("portal_parent_invoice_share")
    .select("document_id")
    .eq("id", share.id)
    .maybeSingle();
  const docId = clean(share2?.document_id, 80);
  if (!docId) continue;
  const { data: doc } = await admin
    .from("documents")
    .select("file_url")
    .eq("id", docId)
    .maybeSingle();
  const path = clean(doc?.file_url, 240);
  if (!path) continue;
  const { data: blob, error: dlErr } = await admin.storage.from("documents").download(path);
  if (dlErr || !blob) {
    console.error("DL FAIL", plan.inv, dlErr?.message);
    continue;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName = `${plan.inv}__${plan.client.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
  const outPath = join(OUT_DIR, fileName);
  await Deno.writeFile(outPath, bytes);
  console.log("  →", outPath, `(${bytes.byteLength} bytes)`);
}

console.log("\nDone. Review PDFs locally before any email.");
if (missingPo.length) {
  console.log("Still missing PO for:", missingPo.join(", "));
}
