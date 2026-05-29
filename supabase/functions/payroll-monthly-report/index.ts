// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
//
// payroll-monthly-report
// -----------------------
// Builds a single monthly payroll PDF (one row per worker: hours, rate, gross,
// late penalty, net, status) plus a "not submitted yet" list, and emails it to
// the accountant + admin so they can process payslips.
//
// Payroll cycle is 25 -> 24. This report is meant to run on the 24th and covers
// the month that is closing (period_month = first day of the current month).
// Workers who submitted on time (by the 23rd) have penalty 0; late carry-overs
// from the previous cycle appear here with a £5 penalty and status "Late".
//
// Trigger (POST) with header:  x-payroll-cron-secret: <PAYROLL_CRON_SECRET>
// Optional JSON body / query:
//   month   "YYYY-MM"  -> override the payroll month (default: current month)
//   dryRun  true       -> return JSON summary, do NOT send the email
//
// Required env vars:
//   SUPABASE_URL                 (auto)
//   SUPABASE_SERVICE_ROLE_KEY    (auto)
//   PAYROLL_CRON_SECRET          shared secret required on every request
//   RESEND_API_KEY               Resend API key (https://resend.com)
//   PAYROLL_REPORT_FROM          verified sender, e.g. "ClubSENsational Payroll <payroll@clubsensational.org>"
//   PAYROLL_REPORT_TO            comma-separated recipients (accountant, admin)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payroll-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch (_) {
    return "";
  }
}

function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);
}

function firstOfMonthIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabelFromIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function resolveTargetMonthIso(raw: string): string {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
  return firstOfMonthIso(new Date());
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}

interface WorkerRow {
  userId: string;
  name: string;
  role: string;
  hours: number;
  rate: number | null;
  gross: number | null;
  penalty: number;
  net: number | null;
  isLate: boolean;
}

/** Keep the latest timesheet per worker for the target month (handles re-submissions). */
function dedupeLatest(rows: any[]): any[] {
  const byUser = new Map<string, any>();
  for (const r of rows || []) {
    const uid = String(r.submitted_by_user_id || "");
    if (!uid) continue;
    const prev = byUser.get(uid);
    if (!prev || String(r.created_at || "") > String(prev.created_at || "")) {
      byUser.set(uid, r);
    }
  }
  return [...byUser.values()];
}

async function aggregate(supabase: any, targetMonthIso: string) {
  const [{ data: tsRaw, error: tsErr }, { data: rates }, { data: profs }] = await Promise.all([
    supabase
      .from("staff_timesheets")
      .select(
        "submitted_by_user_id, submitted_by_name, role_label, total_hours, hourly_rate_used, total_cost, penalty_amount, net_cost, is_late, created_at"
      )
      .eq("period_month", targetMonthIso)
      .order("created_at", { ascending: true }),
    supabase.from("staff_pay_rates").select("user_id, role_label, hourly_rate"),
    supabase.from("staff_profiles").select("id, full_name, username"),
  ]);
  if (tsErr) throw tsErr;

  const nameById = new Map<string, string>();
  for (const p of profs || []) {
    const nm = String(p.full_name || p.username || "").trim();
    if (p.id && nm) nameById.set(String(p.id), nm);
  }

  const submitted = dedupeLatest(tsRaw || []);
  const submittedIds = new Set<string>(submitted.map((r) => String(r.submitted_by_user_id || "")));

  const workers: WorkerRow[] = submitted
    .map((r) => {
      const uid = String(r.submitted_by_user_id || "");
      const gross = r.total_cost == null ? null : Number(r.total_cost);
      const penalty = Number(r.penalty_amount || 0);
      const net = r.net_cost == null ? (gross == null ? null : Math.max(0, gross - penalty)) : Number(r.net_cost);
      return {
        userId: uid,
        name: nameById.get(uid) || String(r.submitted_by_name || "Unknown"),
        role: String(r.role_label || "").trim(),
        hours: Number(r.total_hours || 0),
        rate: r.hourly_rate_used == null ? null : Number(r.hourly_rate_used),
        gross,
        penalty,
        net,
        isLate: !!r.is_late,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const notSubmitted = (rates || [])
    .filter((r) => !submittedIds.has(String(r.user_id || "")))
    .map((r) => ({
      name: nameById.get(String(r.user_id)) || String(r.user_id),
      role: String(r.role_label || "").trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totals = workers.reduce(
    (acc, w) => {
      acc.hours += w.hours || 0;
      acc.gross += w.gross || 0;
      acc.penalty += w.penalty || 0;
      acc.net += w.net || 0;
      return acc;
    },
    { hours: 0, gross: 0, penalty: 0, net: 0 }
  );

  return { workers, notSubmitted, totals };
}

async function buildPdf(targetMonthIso: string, data: Awaited<ReturnType<typeof aggregate>>) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const margin = 40;
  const ink = rgb(0.06, 0.13, 0.22);
  const muted = rgb(0.38, 0.45, 0.54);
  const lineCol = rgb(0.85, 0.89, 0.94);
  const headBg = rgb(0.07, 0.31, 0.47);
  const warn = rgb(0.6, 0.13, 0.13);

  // columns: Name, Role, Hours, Rate, Gross, Penalty, Net, Status
  const cols = [
    { key: "name", title: "Name", w: 108, align: "left" },
    { key: "role", title: "Role", w: 86, align: "left" },
    { key: "hours", title: "Hours", w: 40, align: "right" },
    { key: "rate", title: "Rate", w: 42, align: "right" },
    { key: "gross", title: "Gross £", w: 56, align: "right" },
    { key: "penalty", title: "Penalty £", w: 54, align: "right" },
    { key: "net", title: "Net £", w: 56, align: "right" },
    { key: "status", title: "Status", w: 50, align: "left" },
  ];
  const tableX = margin;
  const colX: number[] = [];
  let acc = tableX;
  for (const c of cols) {
    colX.push(acc);
    acc += c.w;
  }
  const tableW = acc - tableX;
  const rowH = 18;

  let page = pdf.addPage(A4);
  let { width, height } = page.getSize();
  let y = height - margin;

  function drawText(text: string, x: number, yy: number, size: number, f = font, color = ink) {
    page.drawText(String(text == null ? "" : text), { x, y: yy, size, font: f, color });
  }
  function drawCell(text: string, ci: number, yy: number, size: number, f = font, color = ink) {
    const c = cols[ci];
    const x = colX[ci];
    const t = String(text == null ? "" : text);
    if (c.align === "right") {
      const tw = f.widthOfTextAtSize(t, size);
      drawText(t, x + c.w - tw - 4, yy, size, f, color);
    } else {
      drawText(clip(t, c.w - 6, f, size), x + 2, yy, size, f, color);
    }
  }
  function clip(t: string, maxW: number, f: any, size: number): string {
    if (f.widthOfTextAtSize(t, size) <= maxW) return t;
    let s = t;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function hr(yy: number) {
    page.drawLine({
      start: { x: tableX, y: yy },
      end: { x: tableX + tableW, y: yy },
      thickness: 0.5,
      color: lineCol,
    });
  }
  function drawHeaderRow() {
    page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, color: headBg });
    for (let i = 0; i < cols.length; i++) {
      drawCell(cols[i].title, i, y - rowH + 9, 9, bold, rgb(1, 1, 1));
    }
    y -= rowH;
  }
  function ensureRoom(extra = rowH) {
    if (y - extra < margin + 30) {
      page = pdf.addPage(A4);
      const sz = page.getSize();
      width = sz.width;
      height = sz.height;
      y = height - margin;
      drawHeaderRow();
    }
  }

  // Title block
  drawText("MONTHLY PAYROLL REPORT", margin, y - 6, 16, bold, ink);
  y -= 22;
  drawText(`Pay month: ${monthLabelFromIso(targetMonthIso)}  (cycle 25th → 24th)`, margin, y - 4, 11, font, muted);
  y -= 16;
  drawText(
    `Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}`,
    margin,
    y - 4,
    9,
    font,
    muted
  );
  y -= 22;

  drawHeaderRow();

  if (!data.workers.length) {
    ensureRoom();
    drawText("No timesheets submitted for this month.", margin + 2, y - 12, 10, font, muted);
    y -= rowH;
  }
  for (const w of data.workers) {
    ensureRoom();
    const baseY = y - 12;
    drawCell(w.name, 0, baseY, 9, font);
    drawCell(w.role, 1, baseY, 9, font, muted);
    drawCell(money(w.hours), 2, baseY, 9, font);
    drawCell(w.rate == null ? "—" : money(w.rate), 3, baseY, 9, font);
    drawCell(w.gross == null ? "—" : money(w.gross), 4, baseY, 9, font);
    drawCell(w.penalty ? `-${money(w.penalty)}` : "0.00", 5, baseY, 9, font, w.penalty ? warn : ink);
    drawCell(w.net == null ? "—" : money(w.net), 6, baseY, 9, bold);
    drawCell(w.isLate ? "Late" : "On time", 7, baseY, 9, font, w.isLate ? warn : ink);
    y -= rowH;
    hr(y + 3);
  }

  // Totals row
  ensureRoom(rowH + 4);
  page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, color: rgb(0.95, 0.97, 0.99) });
  const ty = y - 12;
  drawCell("TOTAL", 0, ty, 9, bold);
  drawCell(money(data.totals.hours), 2, ty, 9, bold);
  drawCell(money(data.totals.gross), 4, ty, 9, bold);
  drawCell(data.totals.penalty ? `-${money(data.totals.penalty)}` : "0.00", 5, ty, 9, bold, data.totals.penalty ? warn : ink);
  drawCell(money(data.totals.net), 6, ty, 9, bold);
  y -= rowH + 10;

  // Not submitted
  drawText("Not submitted yet", margin, y - 6, 12, bold, warn);
  y -= 18;
  if (!data.notSubmitted.length) {
    drawText("Everyone with a pay rate has submitted. ", margin, y - 4, 10, font, muted);
    y -= 16;
  } else {
    for (const n of data.notSubmitted) {
      ensureRoom(16);
      const label = n.role ? `${n.name} — ${n.role}` : n.name;
      drawText(`•  ${clip(label, tableW - 16, font, 10)}`, margin + 2, y - 4, 10, font, ink);
      y -= 15;
    }
  }

  y -= 10;
  drawText(
    "Net = Gross minus any late penalty. The accountant applies tax/NI per each worker's HMRC code.",
    margin,
    y - 4,
    8,
    font,
    muted
  );

  const bytes = await pdf.save();
  return bytes as Uint8Array;
}

async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  filename: string;
  pdfBase64: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: [{ filename: opts.filename, content: opts.pdfBase64 }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const secret = env("PAYROLL_CRON_SECRET");
  if (!secret) return json(500, { ok: false, error: "PAYROLL_CRON_SECRET is not configured" });
  if ((req.headers.get("x-payroll-cron-secret") || "") !== secret) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const url = new URL(req.url);
  const monthRaw = String(body.month || url.searchParams.get("month") || "");
  const dryRun =
    body.dryRun === true || ["1", "true", "yes"].includes(String(url.searchParams.get("dryRun") || "").toLowerCase());
  const targetMonthIso = resolveTargetMonthIso(monthRaw);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Supabase env not configured" });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let data;
  try {
    data = await aggregate(supabase, targetMonthIso);
  } catch (e) {
    return json(500, { ok: false, error: `Aggregate failed: ${e?.message || e}` });
  }

  const summary = {
    month: targetMonthIso,
    monthLabel: monthLabelFromIso(targetMonthIso),
    submitted: data.workers.length,
    notSubmitted: data.notSubmitted.length,
    totals: data.totals,
  };

  if (dryRun) {
    return json(200, { ok: true, dryRun: true, summary, workers: data.workers, missing: data.notSubmitted });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPdf(targetMonthIso, data);
  } catch (e) {
    return json(500, { ok: false, error: `PDF failed: ${e?.message || e}` });
  }

  const apiKey = env("RESEND_API_KEY");
  const from = env("PAYROLL_REPORT_FROM");
  const toList = env("PAYROLL_REPORT_TO")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!apiKey || !from || !toList.length) {
    return json(500, {
      ok: false,
      error: "Email not configured (RESEND_API_KEY / PAYROLL_REPORT_FROM / PAYROLL_REPORT_TO)",
      summary,
    });
  }

  const label = monthLabelFromIso(targetMonthIso);
  const html =
    `<p>Hi,</p><p>Attached is the payroll report for <strong>${label}</strong> (cycle 25th → 24th).</p>` +
    `<p><strong>${data.workers.length}</strong> timesheet(s) submitted · Gross £${money(data.totals.gross)} · ` +
    `Penalties £${money(data.totals.penalty)} · Net £${money(data.totals.net)}.</p>` +
    (data.notSubmitted.length
      ? `<p><strong>${data.notSubmitted.length}</strong> worker(s) have not submitted yet (listed in the PDF).</p>`
      : `<p>All workers with a pay rate have submitted.</p>`) +
    `<p>Net = Gross minus any late penalty. Please apply tax/NI per each worker's HMRC code.</p>`;

  try {
    const result = await sendEmail({
      apiKey,
      from,
      to: toList,
      subject: `Payroll report — ${label}`,
      html,
      filename: `payroll-${targetMonthIso.slice(0, 7)}.pdf`,
      pdfBase64: toBase64(pdfBytes),
    });
    return json(200, { ok: true, sent: true, to: toList, summary, providerResponse: result });
  } catch (e) {
    return json(502, { ok: false, error: `Email send failed: ${e?.message || e}`, summary });
  }
});
