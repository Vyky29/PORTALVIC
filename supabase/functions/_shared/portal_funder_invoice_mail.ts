/**
 * Monthly funder invoices to Sevitha at admin@.
 * Day 20: NHS. Day 25: H&F and NHS/ILA.
 * NHS/ILA is the ILA monthly pack (ready_by tinashe-nhs, or funding label NHS ILA).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "./portal_parent_messaging.ts";

export const SEVITHA_ADMIN_TO = "admin@clubsensational.org";

export type FunderPack = "hf" | "nhs" | "nhs_ila";

type ShareRow = {
  id: string;
  invoice_number: string;
  ready_by: string | null;
  reference_text: string | null;
  amount_gbp: number | null;
  payment_status: string | null;
  document_id: string | null;
  contact_id: string | null;
  notes: string | null;
};

export function londonYmd(now = new Date()): { day: number; ym: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = Number(get("day"));
  const ym = `${get("year")}-${get("month")}`;
  return { day, ym };
}

/** 20 = NHS. 25 = H&F and NHS/ILA. Other days send nothing. */
export function packsDueOnLondonDay(day: number): FunderPack[] | null {
  if (day === 20) return ["nhs"];
  if (day === 25) return ["hf", "nhs_ila"];
  return null;
}

export function monthLabelFromYm(ym: string): string {
  const [ys, ms] = ym.split("-");
  const d = new Date(Date.UTC(Number(ys), Number(ms) - 1, 15));
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return `${month} ${ys}`;
}

export function classifyFunderPack(
  readyBy: string,
  fundingLabel: string,
): { ym: string; pack: FunderPack } | null {
  const rb = String(readyBy || "");
  const m = rb.match(/office_funder_2627_(hf|nhs)_month_(\d{4}-\d{2})_/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const ym = m[2];
  if (kind === "hf") return { ym, pack: "hf" };
  const fund = String(fundingLabel || "");
  const ila = /tinashe-nhs|nhs_ila/i.test(rb) ||
    (/ila/i.test(fund) && !/north west/i.test(fund));
  return { ym, pack: ila ? "nhs_ila" : "nhs" };
}

function money(n: number): string {
  return "£" + (Math.round(n * 100) / 100).toFixed(2);
}

function packTitle(pack: FunderPack): string {
  if (pack === "hf") return "H&F";
  if (pack === "nhs_ila") return "NHS/ILA";
  return "NHS";
}

function subjectFor(monthLabel: string, packs: FunderPack[]): string {
  const names = packs.map(packTitle);
  if (names.length === 1) return `${monthLabel} invoices - ${names[0]}`;
  return `${monthLabel} invoices - ${names.join(" and ")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    bin += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(bin);
}

async function alreadySent(
  admin: SupabaseClient,
  ym: string,
  pack: FunderPack,
): Promise<boolean> {
  const { data, error } = await admin
    .from("portal_funder_invoice_mail_log")
    .select("id")
    .eq("ym", ym)
    .eq("pack", pack)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data?.id;
}

export async function sendFunderInvoicesToSevitha(
  admin: SupabaseClient,
  input: { ym: string; packs: FunderPack[]; to?: string },
): Promise<
  | { ok: true; skipped: string; invoices: string[] }
  | { ok: true; sent: true; to: string; invoices: string[] }
  | { ok: false; error: string }
> {
  const ym = String(input.ym || "").trim();
  const packs = input.packs.filter((p) => p === "hf" || p === "nhs" || p === "nhs_ila");
  const to = (input.to || SEVITHA_ADMIN_TO).trim();
  if (!/^\d{4}-\d{2}$/.test(ym) || !packs.length) {
    return { ok: false, error: "bad_month_or_packs" };
  }

  const pending: FunderPack[] = [];
  for (const pack of packs) {
    if (!(await alreadySent(admin, ym, pack))) pending.push(pack);
  }
  if (!pending.length) {
    return { ok: true, skipped: "already_sent", invoices: [] };
  }

  const { data: rows, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, ready_by, reference_text, amount_gbp, payment_status, document_id, contact_id, notes",
    )
    .or(
      `ready_by.like.office_funder_2627_hf_month_${ym}_%,ready_by.like.office_funder_2627_nhs_month_${ym}_%`,
    )
    .neq("payment_status", "void")
    .order("invoice_number");
  if (error) return { ok: false, error: error.message };

  const contactIds = [
    ...new Set((rows || []).map((r) => String(r.contact_id || "")).filter(Boolean)),
  ];
  const nameByContact = new Map<string, string>();
  const fundByContact = new Map<string, string>();
  if (contactIds.length) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of pax || []) {
      const id = String(p.contact_id || "");
      const name = String(p.display_name || "").trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (id && name && !nameByContact.has(id)) nameByContact.set(id, name);
    }
    const { data: parents } = await admin
      .from("portal_parent_contacts")
      .select("contact_id, funding_label")
      .in("contact_id", contactIds);
    for (const p of parents || []) {
      fundByContact.set(String(p.contact_id || ""), String(p.funding_label || ""));
    }
  }

  const picked: Array<ShareRow & { pack: FunderPack; child: string }> = [];
  for (const raw of (rows || []) as ShareRow[]) {
    const classified = classifyFunderPack(
      String(raw.ready_by || ""),
      fundByContact.get(String(raw.contact_id || "")) || "",
    );
    if (!classified || classified.ym !== ym) continue;
    if (!pending.includes(classified.pack)) continue;
    const child = nameByContact.get(String(raw.contact_id || "")) ||
      String(raw.ready_by || "").split("_").pop() || "Client";
    picked.push({ ...raw, pack: classified.pack, child });
  }

  const presentPacks = pending.filter((p) => picked.some((row) => row.pack === p));
  if (!presentPacks.length) {
    return { ok: true, skipped: "no_invoices", invoices: [] };
  }

  const attachments = [];
  for (const row of picked) {
    if (!row.document_id) {
      return { ok: false, error: `${row.invoice_number} has no pdf` };
    }
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("file_url")
      .eq("id", row.document_id)
      .maybeSingle();
    if (docErr) return { ok: false, error: docErr.message };
    const path = String(doc?.file_url || "");
    if (!path) return { ok: false, error: `${row.invoice_number} file missing` };
    const { data: blob, error: dlErr } = await admin.storage.from("documents").download(path);
    if (dlErr || !blob) {
      return { ok: false, error: `${row.invoice_number} download ${dlErr?.message || "failed"}` };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 1000 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      return { ok: false, error: `${row.invoice_number} is not a pdf` };
    }
    attachments.push({
      filename: `${row.invoice_number}.pdf`,
      contentBase64: bytesToBase64(bytes),
      mimeType: "application/pdf",
    });
  }

  const monthLabel = monthLabelFromYm(ym);
  const lines = [`Hi Sevitha,`, ``, `Attached are the ${monthLabel} invoices.`, ``];
  for (const pack of presentPacks) {
    lines.push(packTitle(pack));
    for (const row of picked.filter((r) => r.pack === pack)) {
      lines.push(`- ${row.invoice_number} - ${row.child} - ${money(Number(row.amount_gbp || 0))}`);
    }
    lines.push("");
  }
  const bodyText = lines.join("\n").trim() + "\n";

  const smtp = readParentNotifySmtpConfig();
  if (!smtp) return { ok: false, error: "smtp_not_configured" };

  const mail = await sendEmailWithAttachmentViaSmtp({
    config: smtp,
    to: [to],
    subject: subjectFor(monthLabel, presentPacks),
    html: plainTextToHtml(bodyText),
    replyTo: "admin@clubsensational.org",
    attachments,
  });
  if (!mail.ok) return { ok: false, error: mail.error };

  const sentAt = new Date().toISOString();
  for (const pack of presentPacks) {
    const numbers = picked.filter((r) => r.pack === pack).map((r) => r.invoice_number);
    const { error: logErr } = await admin.from("portal_funder_invoice_mail_log").insert({
      ym,
      pack,
      sent_to: to,
      invoice_numbers: numbers,
      sent_at: sentAt,
    });
    if (logErr && !/duplicate|unique/i.test(logErr.message)) {
      return { ok: false, error: `sent but log failed: ${logErr.message}` };
    }
  }

  return {
    ok: true,
    sent: true,
    to,
    invoices: picked.map((r) => r.invoice_number),
  };
}
