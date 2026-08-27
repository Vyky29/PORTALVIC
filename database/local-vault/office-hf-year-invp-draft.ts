/**
 * H&F 2026/27 year DRAFT INV-Ps (one per client, lines by term).
 * Canonical billing stays on the 11 monthly INV-Ps — these are office drafts only.
 *
 * Haneef: Autumn excluded (mother paid); Spring + Summer only.
 *
 * Dry-run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-hf-year-invp-draft.ts
 *
 * Create / refresh + download PDFs:
 *   APPLY=1 DOWNLOAD=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-hf-year-invp-draft.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  createPortalFamilyInvoice,
  formatHfMonthlyScheduleMarker,
  formatHfPdfHeaderMarker,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolMonthlyLineItems,
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  namesMatch,
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
  "database/local-vault/private/hf-year-invp-draft";
const READY_ROOT = "office_funder_2627";
const YEAR_LABEL = `Academic year ${REENROL_ACADEMIC_YEAR.replace("-", "/")}`;
const INVOICE_DATE =
  (Deno.env.get("INVOICE_DATE") || "").trim() ||
  new Date().toISOString().slice(0, 10);
const YEAR_DUE_DATE = "2027-07-23";
const DEFAULT_VENUE = "SwimFarm Centre";

const MONTHS_11: Array<{
  term: "autumn" | "spring" | "summer";
  label: string;
  ym: string;
}> = [
  { term: "autumn", label: "September 2026", ym: "2026-09" },
  { term: "autumn", label: "October 2026", ym: "2026-10" },
  { term: "autumn", label: "November 2026", ym: "2026-11" },
  { term: "autumn", label: "December 2026", ym: "2026-12" },
  { term: "spring", label: "January 2027", ym: "2027-01" },
  { term: "spring", label: "February 2027", ym: "2027-02" },
  { term: "spring", label: "March 2027", ym: "2027-03" },
  { term: "summer", label: "April 2027", ym: "2027-04" },
  { term: "summer", label: "May 2027", ym: "2027-05" },
  { term: "summer", label: "June 2027", ym: "2027-06" },
  { term: "summer", label: "July 2027", ym: "2027-07" },
];

/** Always include even if LA sheet funder label drifted. */
const ALWAYS_INCLUDE_KEYS = new Set(["haneef"]);

/** Skip terms on the year draft (e.g. autumn already paid privately). */
const SKIP_TERMS_BY_KEY: Record<string, Array<"autumn" | "spring" | "summer">> = {
  haneef: ["autumn"],
};

/** Client ID + PO overrides (seed-la-nhs-client-ids-regen-pdfs). */
const CLIENT_ID_BY_KEY: Record<string, string> = {
  "adam-p": "70416281",
  "abodi-patel": "2744795",
  simon: "2633551",
  yassir: "62016161",
  faris: "2399946",
  saiib: "2741139",
  haneef: "2396503",
  elijah: "2500772",
};
const PO_BY_KEY: Record<string, string> = {
  "adam-p": "FW10561494",
  "abodi-patel": "9005466730",
  simon: "9005737675",
  yassir: "FW10559382",
  faris: "9005739631",
  saiib: "9005705437",
  haneef: "9005711782",
  elijah: "9005753653",
};

const VENUE_BY_KEY: Record<string, string> = {
  "abodi-patel": "Acton",
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
function isHfFunder(funder: string): boolean {
  return /h\s*&\s*f|hammersmith|fulham|\blbhf\b/i.test(funder);
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
    return clean(PO_BY_KEY[clientKey] || "", 80);
  }
  return clean(data.PO || data.po || data["PO Number"] || data.po_number, 80);
}
function draftMarker(clientKey: string): string {
  return `${READY_ROOT}_hf_year_draft_${clientKey}`;
}
function laTermLabel(term: "autumn" | "spring" | "summer"): string {
  if (term === "autumn") return "Autumn Term 2026";
  if (term === "spring") return "Spring Term 2027";
  return "Summer Term 2027";
}

function toLaLineLayout(lines: PortalInvoiceLineItem[]): PortalInvoiceLineItem[] {
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

function buildLaHeader(
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
    VENUE_BY_KEY[clientKey] ||
    (venues.length === 1 ? venues[0] : venues.join(" / ")) ||
    DEFAULT_VENUE;
  return { service, slot, venue };
}

function dayCentreTermLines(
  slots: ParsedSlot[],
  term: "autumn" | "spring" | "summer",
): PortalInvoiceLineItem[] {
  const out: PortalInvoiceLineItem[] = [];
  for (const slot of slots || []) {
    if (!slot?.isDayCentre) continue;
    const amount = round2(num(slot.termTotals?.[term]));
    if (amount <= 0) continue;
    const sessions = Math.max(1, num(slot.sessions?.[term]));
    const base =
      clean(slot.displayLabel || slot.serviceType || "Day Centre", 120) ||
      "Day Centre";
    out.push({
      service_key: "DAY_CENTRE",
      description: `${base}, ${laTermLabel(term)}`,
      detail: null,
      dates: "",
      quantity: sessions,
      unit_price_gbp: round2(amount / sessions),
      amount_gbp: amount,
      xero_item_code: null,
    });
  }
  return out;
}

function termsForClient(clientKey: string): Array<"autumn" | "spring" | "summer"> {
  const skip = new Set(SKIP_TERMS_BY_KEY[clientKey] || []);
  return (["autumn", "spring", "summer"] as const).filter((t) => !skip.has(t));
}

/** Real monthly totals from calendar sessions (same rule as live H&F monthly INV-Ps). */
function buildHfMonthlySchedule(input: {
  weekly: ParsedSlot[];
  dayCentre: ParsedSlot[];
  weeklyChoices: Record<string, { choice: string }>;
  clientKey: string;
}): Array<{ label: string; amountGbp: number }> {
  const skipTerms = new Set(SKIP_TERMS_BY_KEY[input.clientKey] || []);
  const allSlots = [...input.weekly, ...input.dayCentre];
  const out: Array<{ label: string; amountGbp: number }> = [];
  for (const m of MONTHS_11) {
    if (skipTerms.has(m.term)) continue;
    const lines = buildReenrolMonthlyLineItems({
      slots: allSlots,
      weeklyChoices: input.weeklyChoices,
      monthYm: m.ym,
      vatMode: "exempt",
      productMap,
    });
    const amount = round2(lines.reduce((s, li) => s + num(li.amount_gbp), 0));
    if (amount <= 0) continue;
    out.push({ label: m.label, amountGbp: amount });
  }
  return out;
}

const productMap = await loadProductMap(admin);

const { data: contacts, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, child_first_name, child_last_name, in_class")
  .eq("in_class", true)
  .limit(500);
if (cErr) throw new Error(cErr.message);

const contactList = (contacts || [])
  .map((c) => {
    const child =
      clean(c.child_display, 120) ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" ").trim();
    return { contact_id: clean(c.contact_id, 120), child };
  })
  .filter((c) => c.contact_id && c.child);

const { data: laRows, error: laErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, data, sheet")
  .in("sheet", ["LA", "DIRECT_PAYMENTS", "ARCHIVED_LA"]);
if (laErr) throw new Error(laErr.message);

/** Hard-coded portal contact when sheet row moved off LA (e.g. Haneef → DP). */
const CONTACT_BY_KEY: Record<string, string> = {
  haneef: "126",
};

type Pack = {
  clientKey: string;
  clientName: string;
  contactId: string;
  weekly: ParsedSlot[];
  dayCentre: ParsedSlot[];
  clientId: string;
  po: string;
  header: { service: string; slot: string; venue: string };
  terms: Array<"autumn" | "spring" | "summer">;
};

const packsByKey = new Map<string, Pack>();
const sortedRows = [...(laRows || [])].sort((a, b) => {
  const score = (sheet: string, key: string) => {
    if (sheet === "LA") return 0;
    if (sheet === "DIRECT_PAYMENTS" && ALWAYS_INCLUDE_KEYS.has(key)) return 1;
    if (sheet === "ARCHIVED_LA") return 2;
    return 9;
  };
  return score(clean(a.sheet, 40), clean(a.client_key, 80)) -
    score(clean(b.sheet, 40), clean(b.client_key, 80));
});

for (const row of sortedRows) {
  const data = (row.data || {}) as Record<string, unknown>;
  const clientKey = clean(row.client_key, 80);
  if (!clientKey || packsByKey.has(clientKey)) continue;
  const funder = clean(data.Funder || data.Funding || data.Paid, 120);
  const forced = ALWAYS_INCLUDE_KEYS.has(clientKey);
  if (!isHfFunder(funder) && !forced) continue;
  if (ONLY.length && !ONLY.includes(clientKey.toLowerCase())) continue;

  const ctx = paymentRowToContext(row as Record<string, unknown>);
  const weekly = (ctx.weeklySlots || []) as ParsedSlot[];
  const dayCentre = (ctx.dayCentreSlots || []) as ParsedSlot[];
  const clientName = clean(ctx.clientName || row.client_name, 120);

  let matched: (typeof contactList)[0] | null = null;
  const forcedContact = CONTACT_BY_KEY[clientKey];
  if (forcedContact) {
    matched = contactList.find((c) => c.contact_id === forcedContact) || null;
  }
  if (!matched) {
    for (const c of contactList) {
      if (namesMatch(clientName, c.child) || namesMatch(c.child, clientName)) {
        matched = c;
        break;
      }
    }
  }
  if (!matched) {
    console.log("SKIP no_contact", clientKey, clientName);
    continue;
  }

  const allSlots = [...weekly, ...dayCentre];
  packsByKey.set(clientKey, {
    clientKey,
    clientName,
    contactId: matched.contact_id,
    weekly,
    dayCentre,
    clientId: pickClientId(data, clientKey),
    po: pickPo(data, clientKey),
    header: buildLaHeader(allSlots, clientKey),
    terms: termsForClient(clientKey),
  });
}

console.log(`\nH&F year draft packs: ${packsByKey.size}`);
console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}${DOWNLOAD ? " + DOWNLOAD" : ""}\n`);

type Plan = {
  clientKey: string;
  clientName: string;
  contactId: string;
  clientId: string;
  po: string;
  header: { service: string; slot: string; venue: string };
  terms: Array<"autumn" | "spring" | "summer">;
  lines: PortalInvoiceLineItem[];
  monthlySchedule: Array<{ label: string; amountGbp: number }>;
  total: number;
  sessions: number;
  marker: string;
};

const plans: Plan[] = [];
for (const pack of packsByKey.values()) {
  const weeklyChoices: Record<string, { choice: string }> = {};
  for (const slot of [...pack.weekly, ...pack.dayCentre]) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }

  let lineItems: PortalInvoiceLineItem[] = [];
  for (const term of pack.terms) {
    const termLines = toLaLineLayout(
      buildReenrolTermLineItems({
        slots: pack.weekly,
        weeklyChoices,
        term,
        vatMode: "exempt",
        productMap,
      }),
    ).map((li) => ({
      ...li,
      description: `${clean(li.description, 160)}, ${laTermLabel(term)}`,
    }));
    lineItems = lineItems.concat(termLines);
    lineItems = lineItems.concat(dayCentreTermLines(pack.dayCentre, term));
  }

  const total = round2(lineItems.reduce((s, li) => s + num(li.amount_gbp), 0));
  const sessions = lineItems.reduce((s, li) => s + num(li.quantity), 0);
  const monthlySchedule = buildHfMonthlySchedule({
    weekly: pack.weekly,
    dayCentre: pack.dayCentre,
    weeklyChoices,
    clientKey: pack.clientKey,
  });
  const marker = draftMarker(pack.clientKey);
  plans.push({
    clientKey: pack.clientKey,
    clientName: pack.clientName,
    contactId: pack.contactId,
    clientId: pack.clientId,
    po: pack.po,
    header: pack.header,
    terms: pack.terms,
    lines: lineItems,
    monthlySchedule,
    total,
    sessions,
    marker,
  });

  console.log(
    [
      pack.clientKey,
      pack.clientName,
      `£${total}`,
      `sess=${sessions}`,
      `terms=${pack.terms.join("+")}`,
      `ClientID=${pack.clientId || "—"}`,
      `PO=${pack.po || "—"}`,
      `lines=${lineItems.length}`,
    ].join(" | "),
  );
  console.log(
    `   HDR Service=${pack.header.service} | Slot=${pack.header.slot} | Venue=${pack.header.venue}`,
  );
  for (const li of lineItems) {
    console.log(
      `   ${li.description} · ${li.detail || ""} · x${li.quantity} · £${li.amount_gbp}`,
    );
  }
  console.log("   Monthly (sessions × fee):");
  for (const m of monthlySchedule) {
    console.log(`     ${m.label}: £${m.amountGbp}`);
  }
}

if (!APPLY) {
  console.log("\nDry-run only. Re-run with APPLY=1 DOWNLOAD=1 when ready.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const { data: existingShares } = await admin
  .from("portal_parent_invoice_share")
  .select("id, ready_by, invoice_number, contact_id, created_at")
  .like("ready_by", `${READY_ROOT}_hf_year_draft_%`)
  .neq("payment_status", "void")
  .order("created_at", { ascending: false });

/** Keep newest share per client_key; void older duplicates from prior regen runs. */
const existingByClientKey = new Map<string, (typeof existingShares)[0]>();
for (const row of existingShares || []) {
  const marker = clean(row.ready_by, 160);
  const clientKey = marker.replace(`${READY_ROOT}_hf_year_draft_`, "");
  if (!clientKey) continue;
  if (!existingByClientKey.has(clientKey)) {
    existingByClientKey.set(clientKey, row);
    continue;
  }
  await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      updated_at: new Date().toISOString(),
      notes: clean(
        `voided — superseded by newer H&F year draft (${clean(row.invoice_number, 40)})`,
        800,
      ),
    })
    .eq("id", row.id);
  console.log("VOID duplicate", clean(row.invoice_number, 40), clientKey);
}

if (DOWNLOAD) await ensureDir(OUT_DIR);

for (const plan of plans) {
  const description = lineItemsToDescription(plan.lines, { fundedProvision: true });
  const qty = plan.lines.reduce((s, li) => s + num(li.quantity), 0) || 1;
  const hdrMarker = formatHfPdfHeaderMarker(plan.header);
  const monthlyMarker = formatHfMonthlyScheduleMarker(plan.monthlySchedule);
  const notes =
    `${hdrMarker} ${monthlyMarker} ${plan.marker} · ${plan.clientName} · H&F year DRAFT · ` +
    `monthly INV-Ps are canonical · ClientID ${plan.clientId || "—"} · PO ${plan.po || "—"} · ` +
    `terms=${plan.terms.join("+")} · la_funded`;

  // Sync Client Id / PO on payments row (LA or DP).
  {
    const { data: payRows } = await admin
      .from("client_payments")
      .select("id, data, sheet")
      .eq("client_key", plan.clientKey)
      .order("updated_at", { ascending: false })
      .limit(3);
    const row =
      payRows?.find((r) => r.sheet === "LA") ||
      payRows?.find((r) => r.sheet === "DIRECT_PAYMENTS") ||
      payRows?.[0];
    if (row?.id) {
      const data = { ...((row.data as Record<string, unknown>) || {}) };
      if (plan.clientId) {
        data["Client Id"] = plan.clientId;
        data["Client ID"] = plan.clientId;
      }
      if (plan.po) {
        data.PO = plan.po;
        data.po = plan.po;
      }
      await admin.from("client_payments").update({ data }).eq("id", row.id);
    }
  }

  const existing = existingByClientKey.get(plan.clientKey);
  let shareId = existing?.id ? String(existing.id) : "";

  if (existing?.id) {
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        amount_gbp: plan.total,
        quantity: qty,
        unit_price_gbp: round2(plan.total / qty),
        line_items: plan.lines,
        line_description: description,
        payment_schedule: [],
        next_instalment_due: null,
        due_date: YEAR_DUE_DATE,
        payment_method_hint: "la_funded",
        reference_text: YEAR_LABEL,
        notes,
        share_status: "hidden",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (upErr) {
      console.error("UPDATE FAIL", plan.clientKey, upErr.message);
      continue;
    }
  } else {
    const created = await createPortalFamilyInvoice(admin, {
      contactId: plan.contactId,
      amountGbp: plan.total,
      dueDateIso: YEAR_DUE_DATE,
      invoiceDateIso: INVOICE_DATE,
      vatMode: "exempt",
      lineDescription: description,
      reference: YEAR_LABEL,
      notes,
      title: `DRAFT · ${plan.clientName} · H&F year ${YEAR_LABEL}`,
      shareStatus: "hidden",
      paymentMethodHint: "la_funded",
      createdVia: "reenrolment",
      ownerUserId: ownerId,
      readyBy: plan.marker,
      clientIdLabel: plan.clientId || null,
      poLabel: plan.po || null,
      omitPoLine: true,
      ealingService: plan.header.service,
      ealingSlot: plan.header.slot,
      ealingVenue: plan.header.venue,
      quantity: qty,
      paymentSchedule: [],
      lineItems: plan.lines,
    });
    if (!created.ok) {
      console.error("CREATE FAIL", plan.clientKey, created.error);
      continue;
    }
    shareId = String((created.invoice as Record<string, unknown>).id || "");
    console.log("CREATED", created.invoiceNumber, plan.clientName, `£${plan.total}`);
  }

  if (!shareId) continue;
  const pdf = await regeneratePortalInvoiceSharePdf(admin, shareId, {
    invoiceDateIso: INVOICE_DATE,
  });
  if (!pdf?.ok) {
    console.error("PDF FAIL", plan.clientKey, pdf);
    continue;
  }
  const invNo = clean(existing?.invoice_number, 40) || plan.clientKey;
  console.log("OK", invNo, plan.clientName, `£${plan.total}`, "pdf regenerated");

  if (!DOWNLOAD) continue;
  const { data: share2 } = await admin
    .from("portal_parent_invoice_share")
    .select("document_id, invoice_number")
    .eq("id", shareId)
    .maybeSingle();
  const docId = clean(share2?.document_id, 80);
  const invoiceNumber = clean(share2?.invoice_number, 40) || plan.clientKey;
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
    console.error("DL FAIL", plan.clientKey, dlErr?.message);
    continue;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName =
    `${invoiceNumber}__${plan.clientName.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
  const outPath = join(OUT_DIR, fileName);
  await Deno.writeFile(outPath, bytes);
  console.log("  →", outPath, `(${bytes.byteLength} bytes)`);
}

console.log("\nDone. H&F year drafts are hidden from parents — monthly INV-Ps stay canonical.");
