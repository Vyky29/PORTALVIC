// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-invoices-list
// Admin list of shared / draft client invoices for families.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { evaluateOwnArrangementBuffer } from "../_shared/portal_payment_holds.ts";
import {
  invoiceFundingCategory,
  invoiceFundingCategoryLabel,
  resolveParticipantInvoiceFunding,
} from "../_shared/portal_invoice_funding.ts";
import {
  namesMatch,
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
} from "../_shared/reenrolment_catalog.ts";

const BUCKET = "documents";
const CURRENT_BILLING_TERM = "autumn";

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function termLabel(term: string): string {
  const t = clean(term, 20).toLowerCase();
  if (t === "year" || t === "annual") return "Year 26/27";
  if (t === "autumn") return "Autumn 26/27";
  if (t === "spring") return "Spring 27";
  if (t === "summer") return "Summer 27";
  return t || "Term";
}

function normalizeBillingAmountKey(raw: unknown): "year" | "autumn" | "spring" | "summer" {
  const t = clean(raw, 20).toLowerCase();
  if (t === "year" || t === "annual") return "year";
  if (t === "spring") return "spring";
  if (t === "summer") return "summer";
  return "autumn";
}

function payloadTermTotals(payload: unknown): {
  autumn: number;
  spring: number;
  summer: number;
  annual: number;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const tt = (payload as Record<string, unknown>).term_totals;
  if (!tt || typeof tt !== "object") return null;
  const o = tt as Record<string, unknown>;
  const autumn = round2(num(o.autumn));
  const spring = round2(num(o.spring));
  const summer = round2(num(o.summer));
  let annual = round2(num(o.annual));
  if (!annual) annual = round2(autumn + spring + summer);
  if (annual <= 0 && autumn <= 0 && spring <= 0 && summer <= 0) return null;
  return { autumn, spring, summer, annual };
}

function termTotalsFromPaymentContext(ctx: ReturnType<typeof paymentRowToContext>): {
  autumn: number;
  spring: number;
  summer: number;
  annual: number;
} {
  let autumn = 0;
  let spring = 0;
  let summer = 0;
  let annual = 0;
  for (const slot of ctx.weeklySlots || []) {
    autumn += num(slot.termTotals?.autumn);
    spring += num(slot.termTotals?.spring);
    summer += num(slot.termTotals?.summer);
    annual += num(slot.termTotals?.annual);
  }
  for (const slot of ctx.dayCentreSlots || []) {
    autumn += num(slot.termTotals?.autumn);
    spring += num(slot.termTotals?.spring);
    summer += num(slot.termTotals?.summer);
    annual += num(slot.termTotals?.annual);
  }
  annual = round2(annual || autumn + spring + summer);
  return {
    autumn: round2(autumn),
    spring: round2(spring),
    summer: round2(summer),
    annual,
  };
}

function bookedFieldsFromTotals(
  totals: { autumn: number; spring: number; summer: number; annual: number } | null | undefined,
  amountKey: "year" | "autumn" | "spring" | "summer",
) {
  const autumn = totals?.autumn || 0;
  const spring = totals?.spring || 0;
  const summer = totals?.summer || 0;
  const annual = totals?.annual || 0;
  const selected =
    amountKey === "year"
      ? annual
      : amountKey === "spring"
        ? spring
        : amountKey === "summer"
          ? summer
          : autumn;
  return {
    booked_annual_gbp: annual || null,
    booked_autumn_gbp: autumn || null,
    booked_spring_gbp: spring || null,
    booked_summer_gbp: summer || null,
    booked_term_gbp: amountKey === "year" ? annual || null : selected || null,
    billing_term: amountKey === "year" ? "year" : amountKey,
    billing_term_label: termLabel(amountKey === "year" ? "year" : amountKey),
    amount_selected_gbp: selected || null,
  };
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

  let body: {
    share_status?: string;
    payment_status?: string;
    contact_id?: string;
    limit?: number;
    filter?: string;
    billing_amount?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const shareFilter = clean(body.share_status, 20).toLowerCase() || "all";
  const payFilter = clean(body.payment_status, 20).toLowerCase() || "all";
  const listFilter = clean(body.filter, 40).toLowerCase();
  const amountKey = normalizeBillingAmountKey(
    (body as { billing_amount?: string }).billing_amount || CURRENT_BILLING_TERM,
  );
  const contactId = clean(body.contact_id, 120);
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 400);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = admin
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, due_date, payment_status, share_status, ready_at, ready_by, notes, created_at, updated_at, payment_method_hint, gocardless_url, payment_link_url, payment_link_surcharge_note, parent_reported_paid_at, parent_reported_ref, parent_reported_method, parent_reported_notes, paid_at, paid_via, xero_invoice_id, xero_payment_id, xero_synced_at, xero_push_status, xero_push_error, created_via, vat_mode, line_description, quantity, unit_price_gbp, reference_text, billing_term, payment_schedule, amount_paid_gbp, next_instalment_due",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (shareFilter === "ready" || shareFilter === "hidden") q = q.eq("share_status", shareFilter);
  if (["unpaid", "paid", "partial", "void", "pending_confirmation"].includes(payFilter)) {
    q = q.eq("payment_status", payFilter);
  }
  if (contactId) q = q.eq("contact_id", contactId);
  if (listFilter === "xero_unsynced") {
    q = q.is("xero_invoice_id", null).in("created_via", ["portal", "reenrolment"]);
  }

  const { data: shares, error } = await q;
  if (error) {
    console.error("[portal-admin-parent-invoices-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const docIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
  const docsById = new Map<string, Record<string, unknown>>();
  if (docIds.length) {
    const { data: docs } = await admin
      .from("documents")
      .select("id, title, related_date, file_url, created_at, related_client, document_type")
      .in("id", docIds);
    for (const d of docs || []) {
      if (d?.id) docsById.set(String(d.id), d);
    }
  }

  const contactIds = [...new Set((shares || []).map((s) => clean(s.contact_id, 120)).filter(Boolean))];
  const nameByContact = new Map<string, string>();
  const parentByContact = new Map<string, string>();
  if (contactIds.length) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of pax || []) {
      const id = clean(p.contact_id, 120);
      const name =
        clean(p.display_name, 120) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (id && name) nameByContact.set(id, name);
    }
    const { data: parents } = await admin
      .from("portal_parent_contacts")
      .select("contact_id, parent_display, parent_first_name, parent_last_name")
      .in("contact_id", contactIds);
    for (const p of parents || []) {
      const id = clean(p.contact_id, 120);
      const name =
        clean(p.parent_display, 120) ||
        [p.parent_first_name, p.parent_last_name].filter(Boolean).join(" ").trim();
      if (id && name) parentByContact.set(id, name);
    }
  }

  const holdByContact = new Map<string, Record<string, unknown>>();
  if (contactIds.length) {
    const { data: holds } = await admin
      .from("portal_family_payment_holds")
      .select(
        "id, contact_id, status, reminder_count, held_session_date, held_session_label, advance_buffer_gbp, updated_at",
      )
      .in("contact_id", contactIds)
      .in("status", ["soft_hold", "session_held", "hard_cut"])
      .order("updated_at", { ascending: false });
    for (const h of holds || []) {
      const cid = clean(h.contact_id, 120);
      if (cid && !holdByContact.has(cid)) holdByContact.set(cid, h);
    }
  }

  const bufferByContact = new Map<string, Record<string, unknown>>();
  for (const cid of contactIds) {
    try {
      const ev = await evaluateOwnArrangementBuffer(admin, cid);
      if (ev.is_own_arrangement) {
        bufferByContact.set(cid, {
          required_gbp: ev.required_gbp,
          available_gbp: ev.available_gbp,
          shortfall_gbp: ev.shortfall_gbp,
          is_low: ev.is_low,
        });
      }
    } catch (err) {
      console.error("[portal-admin-parent-invoices-list] buffer", cid, err);
    }
  }

  // Latest re-enrolment submission per contact (2026-27) for sort + booked totals.
  const reenrolByContact = new Map<
    string,
    { submitted_at: string; totals: ReturnType<typeof payloadTermTotals>; name: string }
  >();
  const reenrolByName = new Map<
    string,
    { submitted_at: string; totals: ReturnType<typeof payloadTermTotals>; contact_id: string }
  >();
  {
    const { data: subs } = await admin
      .from("portal_re_enrolment_submissions")
      .select("participant_contact_id, participant_name, submitted_at, payload")
      .eq("academic_year", REENROL_ACADEMIC_YEAR)
      .order("submitted_at", { ascending: false })
      .limit(500);
    for (const s of subs || []) {
      const cid = clean(s.participant_contact_id, 120);
      const name = clean(s.participant_name, 120);
      const submittedAt = clean(s.submitted_at, 40);
      const totals = payloadTermTotals(s.payload);
      if (cid && !reenrolByContact.has(cid)) {
        reenrolByContact.set(cid, { submitted_at: submittedAt, totals, name });
      }
      const nameKey = name.toLowerCase();
      if (nameKey && !reenrolByName.has(nameKey)) {
        reenrolByName.set(nameKey, { submitted_at: submittedAt, totals, contact_id: cid });
      }
    }
  }

  // LA / Direct Payments payment rows → booked term totals for office-auto clients.
  type LaPayMatch = {
    row: Record<string, unknown>;
    totals: ReturnType<typeof termTotalsFromPaymentContext>;
    sheet: string;
  };
  const laPayByContact = new Map<string, LaPayMatch>();
  {
    const { data: laRows } = await admin
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet, imported_at")
      .in("sheet", ["LA", "DIRECT_PAYMENTS"]);
    const { data: inClassContacts } = await admin
      .from("portal_parent_contacts")
      .select(
        "contact_id, child_display, child_first_name, child_last_name, parent_display, parent_first_name, parent_last_name, funding_label, in_class",
      )
      .eq("in_class", true)
      .limit(500);
    const contacts = (inClassContacts || []).map((c) => {
      const child =
        clean(c.child_display, 120) ||
        [c.child_first_name, c.child_last_name].filter(Boolean).join(" ").trim();
      const parent =
        clean(c.parent_display, 120) ||
        [c.parent_first_name, c.parent_last_name].filter(Boolean).join(" ").trim();
      return {
        contact_id: clean(c.contact_id, 120),
        child,
        parent,
        funding_label: clean(c.funding_label, 120),
      };
    }).filter((c) => c.contact_id && c.child);

    for (const row of laRows || []) {
      const sheet = clean(row.sheet, 40).toUpperCase();
      // Office auto = club invoices the LA (sheet LA). Direct Payments stay parent-visible.
      if (sheet !== "LA") continue;
      const ctx = paymentRowToContext(row as Record<string, unknown>);
      const totals = termTotalsFromPaymentContext(ctx);
      const clientName = clean(ctx.clientName || row.client_name, 120);
      if (!clientName) continue;
      let matched: (typeof contacts)[0] | null = null;
      for (const c of contacts) {
        if (namesMatch(clientName, c.child) || namesMatch(c.child, clientName)) {
          matched = c;
          break;
        }
      }
      if (!matched) continue;
      if (laPayByContact.has(matched.contact_id)) continue;
      laPayByContact.set(matched.contact_id, {
        row: row as Record<string, unknown>,
        totals,
        sheet,
      });
      if (!nameByContact.has(matched.contact_id) && matched.child) {
        nameByContact.set(matched.contact_id, matched.child);
      }
      if (!parentByContact.has(matched.contact_id) && matched.parent) {
        parentByContact.set(matched.contact_id, matched.parent);
      }
    }
  }

  let invoices: Record<string, unknown>[] = [];
  const fundingByContact = new Map<string, Awaited<ReturnType<typeof resolveParticipantInvoiceFunding>>>();
  const invoiceContactIds = new Set<string>();

  for (const share of shares || []) {
    const doc = docsById.get(String(share.document_id)) || {};
    let pdfUrl: string | null = null;
    if (doc.file_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(String(doc.file_url), 3600);
      pdfUrl = signed?.signedUrl || null;
    }
    const cid = clean(share.contact_id, 120);
    if (cid) invoiceContactIds.add(cid);
    const displayName =
      nameByContact.get(cid) || clean(doc.related_client, 120) || "";
    let funding = fundingByContact.get(cid);
    if (!funding) {
      funding = await resolveParticipantInvoiceFunding(admin, {
        contactId: cid,
        displayName,
      });
      fundingByContact.set(cid, funding);
    }
    const fundingCategory = invoiceFundingCategory({
      vatMode: clean(share.vat_mode, 20) === "exempt" ? "exempt" : "vat_20",
      paymentMethodHint: clean(share.payment_method_hint, 40),
      fundingLabel: funding.fundingLabel,
      paymentSheet: funding.paymentSheet,
    });

    const reenrol =
      (cid && reenrolByContact.get(cid)) ||
      reenrolByName.get(displayName.toLowerCase()) ||
      null;
    const laPay = cid ? laPayByContact.get(cid) : null;
    const bookedFromReenrol = reenrol?.totals;
    const bookedFromLa = laPay?.totals || null;
    const bookedTotals = bookedFromReenrol || bookedFromLa || null;
    const booked = bookedFieldsFromTotals(bookedTotals, amountKey);

    invoices.push({
      ...share,
      title: clean(doc.title, 200) || "Invoice",
      related_client: clean(doc.related_client, 120) || nameByContact.get(cid) || "",
      participant_display: nameByContact.get(cid) || clean(doc.related_client, 120) || cid,
      parent_display: parentByContact.get(cid) || "",
      file_url: doc.file_url || null,
      pdf_url: pdfUrl,
      document_created_at: doc.created_at || null,
      payment_hold: holdByContact.get(cid) || null,
      buffer_status: bufferByContact.get(cid) || null,
      funding_category: fundingCategory,
      funding_category_label: invoiceFundingCategoryLabel(fundingCategory),
      funding_label: funding.fundingLabel || null,
      payment_sheet: funding.paymentSheet || null,
      ...booked,
      reenrolment_submitted_at: reenrol?.submitted_at || null,
      is_la_office_auto: fundingCategory === "la_managed" && !reenrol,
    });
  }

  // Synthetic rows for LA sheet clients (office auto) with no family invoice yet.
  const OFFICE_AUTO_SORT_TS = "2026-06-01T12:00:00.000Z";
  for (const [cid, pack] of laPayByContact) {
    if (invoiceContactIds.has(cid)) continue;
    if (listFilter === "xero_unsynced" || listFilter === "buffer_low") continue;
    if (shareFilter === "ready" || payFilter === "paid" || payFilter === "pending_confirmation") {
      continue;
    }
    const displayName = nameByContact.get(cid) || clean(pack.row.client_name, 120) || cid;
    let funding = fundingByContact.get(cid);
    if (!funding) {
      funding = await resolveParticipantInvoiceFunding(admin, {
        contactId: cid,
        displayName,
      });
      fundingByContact.set(cid, funding);
    }
    const fundingCategory = invoiceFundingCategory({
      vatMode: "exempt",
      paymentMethodHint: "la_funded",
      fundingLabel: funding.fundingLabel,
      paymentSheet: pack.sheet || "LA",
    });
    const booked = bookedFieldsFromTotals(pack.totals, amountKey);
    const reenrol = reenrolByContact.get(cid) || null;
    invoices.push({
      id: `la-auto-${cid}`,
      document_id: null,
      contact_id: cid,
      invoice_number: null,
      amount_gbp: booked.amount_selected_gbp || booked.booked_annual_gbp || 0,
      due_date: null,
      payment_status: "unpaid",
      share_status: "hidden",
      ready_at: null,
      ready_by: null,
      notes: "LA office auto re-enrolment — no family INV-P yet",
      created_at: OFFICE_AUTO_SORT_TS,
      updated_at: OFFICE_AUTO_SORT_TS,
      payment_method_hint: "la_funded",
      created_via: "la_office_auto",
      vat_mode: "exempt",
      title: "LA office auto · booked place",
      related_client: displayName,
      participant_display: displayName,
      parent_display: parentByContact.get(cid) || clean(pack.row.parent_name, 120) || "",
      file_url: null,
      pdf_url: null,
      document_created_at: null,
      payment_hold: holdByContact.get(cid) || null,
      buffer_status: bufferByContact.get(cid) || null,
      funding_category: fundingCategory,
      funding_category_label: invoiceFundingCategoryLabel(fundingCategory),
      funding_label: funding.fundingLabel || "LA / NHS",
      payment_sheet: pack.sheet || "LA",
      ...booked,
      reenrolment_submitted_at: reenrol?.submitted_at || OFFICE_AUTO_SORT_TS,
      is_la_office_auto: true,
      xero_invoice_id: null,
      xero_push_status: null,
    });
    invoiceContactIds.add(cid);
  }

  if (listFilter === "buffer_low") {
    invoices = invoices.filter((inv) => inv.buffer_status && (inv.buffer_status as { is_low?: boolean }).is_low);
  }
  if (listFilter === "la_auto") {
    invoices = invoices.filter(
      (inv) =>
        inv.is_la_office_auto === true ||
        inv.created_via === "la_office_auto" ||
        inv.funding_category === "la_managed",
    );
  }

  // Newest re-enrol first (LA office autos share a cohort timestamp).
  invoices.sort((a, b) => {
    const ta = String(a.reenrolment_submitted_at || a.updated_at || "");
    const tb = String(b.reenrolment_submitted_at || b.updated_at || "");
    if (ta !== tb) return tb.localeCompare(ta);
    return String(a.participant_display || "").localeCompare(String(b.participant_display || ""));
  });

  const { count: readyUnpaid } = await admin
    .from("portal_parent_invoice_share")
    .select("id", { count: "exact", head: true })
    .eq("share_status", "ready")
    .eq("payment_status", "unpaid");

  const { count: pendingConfirm } = await admin
    .from("portal_parent_invoice_share")
    .select("id", { count: "exact", head: true })
    .eq("share_status", "ready")
    .eq("payment_status", "pending_confirmation");

  const { count: openHolds } = await admin
    .from("portal_family_payment_holds")
    .select("id", { count: "exact", head: true })
    .in("status", ["soft_hold", "session_held"]);

  const { count: xeroUnsynced } = await admin
    .from("portal_parent_invoice_share")
    .select("id", { count: "exact", head: true })
    .is("xero_invoice_id", null)
    .in("created_via", ["portal", "reenrolment"]);

  const bufferLowContacts = [...bufferByContact.values()].filter((b) => b.is_low).length;
  const laAutoCount = invoices.filter((inv) => inv.created_via === "la_office_auto").length;

  return portalAdminJson(200, {
    ok: true,
    invoices,
    meta: {
      ready_unpaid: readyUnpaid || 0,
      pending_confirmation: pendingConfirm || 0,
      payment_holds_open: openHolds || 0,
      buffer_low_contacts: bufferLowContacts,
      xero_unsynced: xeroUnsynced || 0,
      la_office_auto: laAutoCount,
      billing_term: amountKey === "year" ? "year" : amountKey,
      billing_term_label: termLabel(amountKey === "year" ? "year" : amountKey),
      billing_amount: amountKey,
      academic_year: REENROL_ACADEMIC_YEAR,
    },
  });
});
