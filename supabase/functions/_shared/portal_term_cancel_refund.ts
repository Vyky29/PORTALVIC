// @ts-nocheck — Edge Function shared helper.
// Quote a rest-of-term Cancel service: unused prepaid, 10% admin (min £25, max £100),
// and the one parent message. LA / NHS do not pay the admin charge.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gbp(n: number): string {
  const v = round2(Number(n) || 0);
  if (Math.abs(v - Math.round(v)) < 0.001) return "£" + String(Math.round(v));
  return "£" + v.toFixed(2);
}

function norm(s: unknown): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstName(s: unknown): string {
  const t = clean(s, 80);
  return t.split(" ")[0] || "";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_NAME = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function parseInvoiceDates(raw: unknown, anchorIso: string): string[] {
  const year0 = Number(String(anchorIso || "").slice(0, 4)) || 2026;
  const anchorMonth = Number(String(anchorIso || "").slice(5, 7)) || 9;
  const text = String(raw || "").replace(/\b20\d{2}\b/g, " ");
  const parts = text.split(";");
  const out: string[] = [];
  for (const part of parts) {
    const monTok = part.trim().match(/([A-Za-z]+)\s*$/);
    if (!monTok) continue;
    const key = monTok[1].toLowerCase();
    const mon = MONTHS[key] || MONTHS[key.slice(0, 3)];
    if (!mon) continue;
    let year = year0;
    if (mon <= 7 && anchorMonth >= 9) year = year0 + 1;
    const days = part.match(/\b\d{1,2}\b/g) || [];
    for (const d of days) {
      const day = Number(d);
      if (day < 1 || day > 31) continue;
      out.push(year + "-" + pad(mon) + "-" + pad(day));
    }
  }
  return out;
}

function isCrashLine(line: Record<string, unknown>): boolean {
  const h = norm(
    String(line.description || "") + " " + String(line.service_key || "") + " " + String(line.detail || ""),
  );
  return h.includes("crash") || h.includes("summer");
}

function lineMatchesService(line: Record<string, unknown>, service: string, weekday: string): boolean {
  if (isCrashLine(line)) return false;
  const h = norm(
    String(line.description || "") + " " + String(line.service_key || "") + " " + String(line.detail || ""),
  );
  const svc = norm(service);
  const head = svc.split(" ")[0] || "";
  const svcHit = !!(svc && (h.includes(svc) || h.includes(head) || norm(line.service_key).includes(head)));
  const dayHit = !weekday || h.includes(norm(weekday));
  return svcHit && dayHit;
}

function feeApplies(vatMode: string, funding: string, method: string): boolean {
  const f = norm(funding + " " + method + " " + vatMode);
  if (/\bnhs\b/.test(f) || f.includes("ehcp") || f.includes("sbs")) return false;
  if (f.includes("local authority") || f.includes("direct payment")) return false;
  if (/(^| )la( |$)/.test(f) || f.includes("la funded") || f.includes("la managed")) return false;
  return true;
}

function adminFee(unused: number, apply: boolean): number {
  if (!apply || unused <= 0) return 0;
  const ten = round2(unused * 0.1);
  let fee = Math.min(100, Math.max(25, ten));
  if (fee > unused) fee = unused;
  return round2(fee);
}

function datesLabel(isos: string[]): string {
  const groups: { mon: number; days: number[] }[] = [];
  isos.forEach(function (iso) {
    const mon = Number(iso.slice(5, 7));
    const day = Number(iso.slice(8, 10));
    const last = groups[groups.length - 1];
    if (!last || last.mon !== mon) groups.push({ mon: mon, days: [day] });
    else last.days.push(day);
  });
  return groups
    .map(function (g) {
      const name = MONTH_NAME[g.mon] || "";
      const days = g.days;
      if (days.length === 1) return days[0] + " " + name;
      if (days.length === 2) return days[0] + " and " + days[1] + " " + name;
      return days.slice(0, -1).join(", ") + " and " + days[days.length - 1] + " " + name;
    })
    .join(", ");
}

function longDate(iso: string): string {
  const mon = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const year = iso.slice(0, 4);
  return day + " " + (MONTH_NAME[mon] || "") + " " + year;
}

function placeLine(weekday: string, timeSlot: string, venue: string, instructor: string): string {
  const time = clean(timeSlot, 40).replace(/\s*[–—]\s*/g, "-").replace(/\s+to\s+/i, "-");
  const bits = [weekday, time, venue].filter(Boolean);
  let s = bits.join(", ");
  const who = firstName(instructor);
  if (who) s += ", with " + who;
  return s;
}

function buildMessage(q: Record<string, unknown>): string {
  const parent = String(q.parent_first || "there");
  const child = String(q.child_first || "your child");
  const service = String(q.service_short || "session");
  const weekday = String(q.weekday || "");
  const from = String(q.from_label || "");
  const place = String(q.place_label || "");
  const lines = [
    "Hi " + parent + ",",
    "",
    "This is ClubSENsational.",
    "",
    "We confirm that " + child + "'s " + weekday + " " + service + " place is cancelled from " + from + ".",
    "",
    "Place: " + place + ".",
  ];
  if (!q.confident) {
    lines.push("", "We will confirm any refund separately.");
  } else if (Number(q.delivered_count) > 0) {
    lines.push(
      "",
      child + " has already attended " + String(q.delivered_label) + ". Those sessions stay as they are.",
    );
  }
  if (q.confident && Number(q.paid_gbp) > 0) {
    lines.push(
      "",
      "You paid " + gbp(Number(q.paid_gbp)) + " towards this. " +
        gbp(Number(q.delivered_gbp)) + " covers the sessions already done. " +
        gbp(Number(q.unused_gbp)) + " was paid for sessions that will not take place.",
    );
  }
  if (q.confident && Number(q.fee_gbp) > 0) {
    lines.push(
      "",
      "We keep an administration charge of " + gbp(Number(q.fee_gbp)) +
        " (10% of that unused amount, as in our terms).",
    );
  }
  if (q.confident && Number(q.refund_gbp) > 0) {
    lines.push(
      "",
      "We will refund " + gbp(Number(q.refund_gbp)) +
        ". The refund goes back the same way you paid. It can take a few days.",
    );
  } else if (q.confident && Number(q.paid_gbp) > 0 && Number(q.refund_gbp) <= 0) {
    lines.push("", "No refund is due.");
  }
  if (q.confident && Number(q.uncollected_gbp) > 0) {
    const due = q.uncollected_due ? " due on " + longDate(String(q.uncollected_due)) : "";
    lines.push("", "The rest of the invoice, " + gbp(Number(q.uncollected_gbp)) + due + ", will not be collected.");
  }
  lines.push("", "Thank you,", "ClubSENsational");
  return lines.join("\n");
}

type Quote = Record<string, unknown>;

export async function quoteTermCancelRefund(
  admin: SupabaseClient,
  input: {
    client_name?: string;
    service?: string;
    weekday?: string;
    time_slot?: string;
    venue?: string;
    instructors?: string;
    anchor_date?: string;
  },
): Promise<Quote> {
  const clientName = clean(input.client_name, 120);
  const service = clean(input.service, 80);
  const weekday = clean(input.weekday, 20);
  const anchor = clean(input.anchor_date, 10);
  const base: Quote = {
    ok: true,
    confident: false,
    client_name: clientName,
    service: service,
    service_short: norm(service).split(" ")[0] || "session",
    weekday: weekday,
    time_slot: clean(input.time_slot, 40),
    venue: clean(input.venue, 80),
    instructors: clean(input.instructors, 80),
    anchor_date: anchor,
    place_label: placeLine(weekday, clean(input.time_slot, 40), clean(input.venue, 80), clean(input.instructors, 80)),
    from_label: weekday && anchor ? weekday + " " + longDate(anchor) : anchor,
    parent_first: "",
    child_first: firstName(clientName),
    contact_id: "",
    parent_mobile: "",
    parent_email: "",
    invoice_id: "",
    invoice_number: "",
    paid_gbp: 0,
    delivered_count: 0,
    delivered_label: "",
    delivered_gbp: 0,
    unused_gbp: 0,
    fee_gbp: 0,
    refund_gbp: 0,
    uncollected_gbp: 0,
    uncollected_due: "",
    fee_applies: false,
    void_schedule: false,
    message: "",
  };
  if (!clientName || !anchor) {
    base.reason = "missing_fields";
    base.message = buildMessage(base);
    return base;
  }

  const { data: pax } = await admin
    .from("portal_participants")
    .select("contact_id, parent_person_id, display_name")
    .ilike("display_name", clientName)
    .limit(1)
    .maybeSingle();
  const contactId = clean(pax?.contact_id, 120);
  base.contact_id = contactId;
  base.child_first = firstName(pax?.display_name || clientName) || base.child_first;

  if (contactId) {
    const { data: parent } = await admin
      .from("portal_parent_contacts")
      .select("parent_first_name, parent_display, email, mobile, funding_label, child_first_name")
      .eq("contact_id", contactId)
      .limit(1)
      .maybeSingle();
    if (parent) {
      base.parent_first = firstName(parent.parent_first_name || parent.parent_display) || "there";
      base.parent_mobile = clean(parent.mobile, 40);
      base.parent_email = clean(parent.email, 200);
      base.funding_label = clean(parent.funding_label, 80);
      if (parent.child_first_name) base.child_first = firstName(parent.child_first_name);
    }
  }

  if (!contactId) {
    base.reason = "no_contact";
    base.message = buildMessage(base);
    return base;
  }

  const { data: invoices } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_method_hint, vat_mode, billing_term, line_items, payment_schedule, due_date",
    )
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);

  let best: { inv: Record<string, unknown>; line: Record<string, unknown> } | null = null;
  for (const inv of invoices || []) {
    const st = String(inv.payment_status || "").toLowerCase();
    if (st === "void" || st === "cancelled" || st === "draft") continue;
    const items = Array.isArray(inv.line_items) ? inv.line_items : [];
    for (const line of items) {
      if (!line || typeof line !== "object") continue;
      if (!lineMatchesService(line as Record<string, unknown>, service, weekday)) continue;
      const dates = parseInvoiceDates((line as Record<string, unknown>).dates, anchor);
      const covers = dates.some((d) => d >= anchor) || dates.length === 0;
      if (!covers && dates.length) continue;
      best = { inv: inv as Record<string, unknown>, line: line as Record<string, unknown> };
      break;
    }
    if (best) break;
  }

  if (!best) {
    base.reason = "no_invoice_line";
    base.message = buildMessage(base);
    return base;
  }

  const line = best.line;
  const inv = best.inv;
  const unit = Number(line.unit_price_gbp) || 0;
  const qty = Number(line.quantity) || 0;
  const serviceAmount = round2(Number(line.amount_gbp) || unit * qty);
  const dates = parseInvoiceDates(line.dates, anchor).filter((d, i, a) => a.indexOf(d) === i).sort();
  if (!dates.length || unit <= 0) {
    base.reason = "no_session_dates";
    base.invoice_number = clean(inv.invoice_number, 40);
    base.message = buildMessage(base);
    return base;
  }
  const delivered = dates.filter((d) => d < anchor);
  const deliveredGbp = round2(delivered.length * unit);
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  let kept = 0;
  for (const other of items) {
    if (!other || other === line) continue;
    if (lineMatchesService(other as Record<string, unknown>, service, weekday)) continue;
    kept += Number((other as Record<string, unknown>).amount_gbp) || 0;
  }
  kept = round2(kept);
  const paidInvoice = round2(Number(inv.amount_paid_gbp) || 0);
  const paidService = round2(Math.max(0, Math.min(serviceAmount, paidInvoice - kept)));
  const unused = round2(Math.max(0, paidService - deliveredGbp));
  const apply = feeApplies(
    String(inv.vat_mode || ""),
    String(base.funding_label || ""),
    String(inv.payment_method_hint || ""),
  );
  const fee = adminFee(unused, apply);
  const refund = round2(Math.max(0, unused - fee));
  const uncollected = round2(Math.max(0, serviceAmount - paidService));
  const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
  const pending = schedule.filter((r) => r && String(r.status || "").toLowerCase() !== "paid" && String(r.status || "").toLowerCase() !== "void");
  const pendingSum = round2(pending.reduce((s: number, r: { amount_gbp?: number }) => s + (Number(r.amount_gbp) || 0), 0));
  const pendingDue = pending
    .map((r: { due_date?: string }) => String(r.due_date || "").slice(0, 10))
    .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()[0] || "";
  const voidSchedule = uncollected > 0 && Math.abs(pendingSum - uncollected) < 0.05;

  base.confident = true;
  base.invoice_id = clean(inv.id, 60);
  base.invoice_number = clean(inv.invoice_number, 40);
  base.paid_gbp = paidService;
  base.delivered_count = delivered.length;
  base.delivered_label = datesLabel(delivered);
  base.delivered_gbp = deliveredGbp;
  base.unused_gbp = unused;
  base.fee_applies = apply && fee > 0;
  base.fee_gbp = fee;
  base.refund_gbp = refund;
  base.uncollected_gbp = uncollected;
  base.uncollected_due = pendingDue;
  base.void_schedule = voidSchedule;
  base.service_amount_gbp = serviceAmount;
  base.message = buildMessage(base);
  return base;
}
