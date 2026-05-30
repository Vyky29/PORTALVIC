// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
//
// payroll-monthly-report
// -----------------------
// Builds a single monthly payroll PDF (one row per worker: hours, rate, gross,
// late penalty, net, status) plus a "not submitted yet" list, and emails it to
// the accountant + admin so they can process payslips.
//
// Payroll cycle is 25 -> 24. This report is meant to run on the 24th at 00:00
// (deadline cut-off) and covers the month that is closing (period_month = first
// day of the current month). At that moment it is a clean snapshot:
//   - "To process": timesheets already submitted for this month (on time, by the
//     23rd). Late carry-overs from the previous cycle also show here with a £5
//     penalty and status "Late" (they are paid this month).
//   - "Not submitted": workers who missed the 24th 00:00 deadline. They are NOT
//     processed this month; a £5 late penalty applies to their next timesheet
//     (paid the following month).
//
// Auth (either one):
//   - header  x-payroll-cron-secret: <PAYROLL_CRON_SECRET>   (pg_cron)
//   - header  Authorization: Bearer <user JWT>               (signed-in admin/ceo,
//     used by the "Payroll report" page so the secret never reaches the browser)
//
// Optional JSON body / query:
//   month   "YYYY-MM"   -> override the payroll month (default: current month)
//   mode    "preview"   -> build PDF and return it as base64 (NO email, NO penalties)
//           "record"    -> record no-submission penalties only (NO email, NO PDF)
//           "send"      -> email the PDF + record no-submission penalties (default)
//   dryRun  true        -> return JSON summary only (no PDF, no email, no penalties)
//
// Deploy with verify_jwt disabled (auth is enforced in-function):
//   supabase functions deploy payroll-monthly-report --no-verify-jwt
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

function londonParts(): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = f.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** True once the 24th (00:00 London) of the target month has arrived/passed. */
function deadlinePassedForMonth(targetMonthIso: string): boolean {
  const tY = Number(targetMonthIso.slice(0, 4));
  const tM = Number(targetMonthIso.slice(5, 7));
  const now = londonParts();
  if (now.y !== tY) return now.y > tY;
  if (now.m !== tM) return now.m > tM;
  return now.d >= 24;
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
  hours: number | null;
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
  const [
    { data: tsRaw, error: tsErr },
    { data: rates },
    { data: roleRates },
    { data: profs },
    { data: importRaw },
    { data: importStartRaw },
    { data: contractIdRaw },
  ] = await Promise.all([
      supabase
        .from("staff_timesheets")
        .select(
          "submitted_by_user_id, submitted_by_name, role_label, total_hours, hourly_rate_used, total_cost, penalty_amount, net_cost, is_late, created_at"
        )
        .eq("period_month", targetMonthIso)
        .order("created_at", { ascending: true }),
      supabase.from("staff_pay_rates").select("user_id, role_label, hourly_rate"),
      supabase.from("staff_role_rates").select("user_id, role, is_primary"),
      supabase.from("staff_profiles").select("id, full_name, username"),
      supabase
        .from("staff_timesheet_imports")
        .select("user_id, period_month, name, role, pay_type, total_hours, gross")
        .eq("period_month", targetMonthIso),
      supabase.from("staff_payroll_start").select("user_id, start_month"),
      // Contract/invoice people across ALL months (paid outside the timesheet flow,
      // e.g. Roberto/Victor/Raul). They never get a timesheet line or a late penalty.
      supabase.from("staff_timesheet_imports").select("user_id").eq("pay_type", "contract"),
    ]);
  if (tsErr) throw tsErr;

  const contractUserIds = new Set<string>();
  for (const c of contractIdRaw || []) {
    const id = String(c.user_id || "");
    if (id) contractUserIds.add(id);
  }

  // Workers only become "expected" from their payroll start month onwards, so a
  // new hire / returner is not flagged "not submitted" (or penalised) earlier.
  const startById = new Map<string, string>();
  for (const r of importStartRaw || []) {
    const id = String(r.user_id || "");
    const sm = String(r.start_month || "");
    if (id && sm) startById.set(id, sm.slice(0, 10));
  }
  const startedByTarget = (id: string): boolean => {
    const sm = startById.get(String(id));
    return !sm || sm <= targetMonthIso;
  };

  const nameById = new Map<string, string>();
  for (const p of profs || []) {
    const nm = String(p.full_name || p.username || "").trim();
    if (p.id && nm) nameById.set(String(p.id), nm);
  }

  // Contract people are paid by invoice/payslip (extra hours included there), so
  // their portal submissions never appear as a separate timesheet line or penalty.
  const submitted = dedupeLatest(tsRaw || []).filter(
    (r) => !contractUserIds.has(String(r.submitted_by_user_id || ""))
  );
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

  // Expected-staff universe = everyone who has a pay rate (legacy single rate
  // OR any multi-role rate). Prefer the multi-role primary role for the label.
  const expected = new Map<string, string>();
  for (const r of rates || []) {
    const id = String(r.user_id || "");
    if (id) expected.set(id, String(r.role_label || "").trim());
  }
  for (const rr of roleRates || []) {
    const id = String(rr.user_id || "");
    if (!id) continue;
    if (!expected.has(id)) expected.set(id, "");
    if (rr.is_primary) expected.set(id, String(rr.role || "").trim() || expected.get(id) || "");
  }

  // Merge hand-imported figures (months that exist only as PDFs / contract pay).
  // A real portal submission always wins over an import for the same user.
  const importRows = importRaw || [];
  const importedTimesheetIds = new Set<string>();
  const contractIds = new Set<string>();
  const contracts: { name: string; role: string; gross: number | null }[] = [];

  for (const im of importRows) {
    const uid = String(im.user_id || "");
    const name = (uid && nameById.get(uid)) || String(im.name || "Unknown");
    const role = String(im.role || (uid ? expected.get(uid) || "" : "")).trim();
    const gross = im.gross == null ? null : Number(im.gross);
    if (String(im.pay_type || "timesheet") === "contract") {
      contracts.push({ name, role, gross });
      if (uid) contractIds.add(uid);
      continue;
    }
    if (uid && submittedIds.has(uid)) continue; // portal submission wins
    workers.push({
      userId: uid,
      name,
      role,
      hours: im.total_hours == null ? null : Number(im.total_hours),
      rate: null,
      gross,
      penalty: 0,
      net: gross,
      isLate: false,
    });
    if (uid) importedTimesheetIds.add(uid);
  }

  workers.sort((a, b) => a.name.localeCompare(b.name));
  contracts.sort((a, b) => a.name.localeCompare(b.name));

  const notSubmitted = [...expected.entries()]
    .filter(
      ([id]) =>
        !submittedIds.has(id) &&
        !importedTimesheetIds.has(id) &&
        !contractIds.has(id) &&
        !contractUserIds.has(id) &&
        startedByTarget(id)
    )
    .map(([id, role]) => ({
      userId: id,
      name: nameById.get(id) || id,
      role,
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

  const contractTotal = contracts.reduce((acc, c) => acc + (c.gross || 0), 0);

  return { workers, notSubmitted, totals, contracts, contractTotal };
}

async function fetchLogo(logoUrl: string): Promise<Uint8Array | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(logoUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch (_) {
    return null;
  }
}

async function buildPdf(
  targetMonthIso: string,
  data: Awaited<ReturnType<typeof aggregate>>,
  logoUrl = ""
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fetchLogo(logoUrl);

  const A4: [number, number] = [595.28, 841.89];
  const margin = 40;
  const ink = rgb(0.06, 0.13, 0.22);
  const muted = rgb(0.38, 0.45, 0.54);
  const lineCol = rgb(0.85, 0.89, 0.94);
  const headBg = rgb(0.07, 0.31, 0.47);
  const warn = rgb(0.6, 0.13, 0.13);

  // columns: Name, Role, Gross, Penalty, Net, Status
  const cols = [
    { key: "name", title: "Name", w: 132, align: "left" },
    { key: "role", title: "Role", w: 120, align: "left" },
    { key: "gross", title: "Gross £", w: 62, align: "right" },
    { key: "penalty", title: "Penalty £", w: 60, align: "right" },
    { key: "net", title: "Net £", w: 62, align: "right" },
    { key: "status", title: "Status", w: 56, align: "left" },
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

  // Company logo, centered at the top.
  if (logoBytes) {
    try {
      const img = await pdf.embedPng(logoBytes);
      const logoW = 74;
      const logoH = (img.height / img.width) * logoW;
      page.drawImage(img, { x: (width - logoW) / 2, y: y - logoH, width: logoW, height: logoH });
      y -= logoH + 14;
    } catch (_) {
      // Not a PNG / decode failed — skip the logo, keep the report.
    }
  }

  // Title block
  drawText("MONTHLY PAYROLL REPORT", margin, y - 6, 16, bold, ink);
  y -= 30;
  drawText(`Pay month: ${monthLabelFromIso(targetMonthIso)}  (cycle 25th -> 24th)`, margin, y - 4, 11, font, muted);
  y -= 20;
  drawText(
    `Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}`,
    margin,
    y - 4,
    9,
    font,
    muted
  );
  y -= 30;
  drawText("To process this month (submitted)", margin, y - 4, 12, bold, ink);
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
    drawCell(w.gross == null ? "—" : money(w.gross), 2, baseY, 9, font);
    drawCell(w.penalty ? `-${money(w.penalty)}` : "0.00", 3, baseY, 9, font, w.penalty ? warn : ink);
    drawCell(w.net == null ? "—" : money(w.net), 4, baseY, 9, bold);
    drawCell(w.isLate ? "Late" : "On time", 5, baseY, 9, font, w.isLate ? warn : ink);
    y -= rowH;
    hr(y + 3);
  }

  // Totals row
  ensureRoom(rowH + 4);
  page.drawRectangle({ x: tableX, y: y - rowH + 4, width: tableW, height: rowH, color: rgb(0.95, 0.97, 0.99) });
  const ty = y - 12;
  drawCell("TOTAL", 0, ty, 9, bold);
  drawCell(money(data.totals.gross), 2, ty, 9, bold);
  drawCell(data.totals.penalty ? `-${money(data.totals.penalty)}` : "0.00", 3, ty, 9, bold, data.totals.penalty ? warn : ink);
  drawCell(money(data.totals.net), 4, ty, 9, bold);
  y -= rowH + 10;

  // Not submitted
  ensureRoom(40);
  drawText("Not submitted — do NOT process this month", margin, y - 6, 12, bold, warn);
  y -= 16;
  drawText(
    "Missed the deadline (24th, 00:00). A £5 late penalty applies to their next timesheet (paid next month).",
    margin,
    y - 4,
    8.5,
    font,
    muted
  );
  y -= 16;
  if (!data.notSubmitted.length) {
    drawText("Everyone with a pay rate has submitted.", margin, y - 4, 10, font, muted);
    y -= 16;
  } else {
    for (const n of data.notSubmitted) {
      ensureRoom(16);
      const label = n.role ? `${n.name} — ${n.role}` : n.name;
      drawText(`•  ${clip(label, tableW - 16, font, 10)}`, margin + 2, y - 4, 10, font, ink);
      y -= 15;
    }
  }

  // Contract / invoice people (paid outside the timesheet flow).
  if (data.contracts && data.contracts.length) {
    y -= 12;
    ensureRoom(40);
    drawText("Contract / invoice — paid separately", margin, y - 6, 12, bold, ink);
    y -= 16;
    drawText(
      "Not part of the timesheet total above (fixed contract or self-employed invoice).",
      margin,
      y - 4,
      8.5,
      font,
      muted
    );
    y -= 16;
    for (const c of data.contracts) {
      ensureRoom(16);
      const label = c.role ? `${c.name} — ${c.role}` : c.name;
      drawText(`•  ${clip(label, tableW - 70, font, 10)}`, margin + 2, y - 4, 10, font, ink);
      drawText(c.gross == null ? "—" : `£${money(c.gross)}`, tableX + tableW - 4 - font.widthOfTextAtSize(c.gross == null ? "—" : `£${money(c.gross)}`, 10), y - 4, 10, font, ink);
      y -= 15;
    }
    ensureRoom(16);
    drawText("Contract subtotal", margin + 2, y - 4, 10, bold, ink);
    const ctStr = `£${money(data.contractTotal || 0)}`;
    drawText(ctStr, tableX + tableW - 4 - bold.widthOfTextAtSize(ctStr, 10), y - 4, 10, bold, ink);
    y -= 15;
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

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Supabase env not configured" });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Authorize either by the cron shared-secret OR by a signed-in admin/ceo (the
  // admin dashboard button calls this with the staff member's Supabase JWT, so
  // we never put the cron secret in the browser).
  const cronSecret = env("PAYROLL_CRON_SECRET");
  const providedSecret = req.headers.get("x-payroll-cron-secret") || "";
  let authorized = false;
  let authVia = "";
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    authorized = true;
    authVia = "cron";
  }
  if (!authorized) {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (token) {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        const uid = userData?.user?.id;
        if (uid && !userErr) {
          const { data: prof } = await supabase
            .from("staff_profiles")
            .select("app_role")
            .eq("id", uid)
            .maybeSingle();
          const role = String(prof?.app_role || "").toLowerCase();
          if (role === "admin" || role === "ceo") {
            authorized = true;
            authVia = "admin";
          }
        }
      } catch (_) {
        /* fall through to 401 */
      }
    }
  }
  if (!authorized) return json(401, { ok: false, error: "Unauthorized" });

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
  const mode = String(body.mode || url.searchParams.get("mode") || "").toLowerCase();
  const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl : "";
  const isPreview = mode === "preview";
  const isRecord = mode === "record";
  const targetMonthIso = resolveTargetMonthIso(monthRaw);

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
    contracts: data.contracts.length,
    contractTotal: data.contractTotal,
    totals: data.totals,
  };

  if (dryRun) {
    return json(200, {
      ok: true,
      dryRun: true,
      deadlinePassed: deadlinePassedForMonth(targetMonthIso),
      summary,
      workers: data.workers,
      missing: data.notSubmitted,
      contracts: data.contracts,
    });
  }

  // Record-only: register no-submission penalties without building a PDF or
  // emailing. Intended for a tiny cron at 00:00 on the 24th when email is sent
  // manually (no Resend/DNS needed). Idempotent + deadline-guarded.
  if (isRecord) {
    let penaltiesRecorded = 0;
    // Late penalties only start from June 2026 onwards.
    if (targetMonthIso >= "2026-06-01" && deadlinePassedForMonth(targetMonthIso) && data.notSubmitted.length) {
      const penaltyRows = data.notSubmitted
        .filter((n) => n.userId)
        .map((n) => ({ user_id: n.userId, missed_month: targetMonthIso, amount: 5, reason: "no_timesheet" }));
      if (penaltyRows.length) {
        const { error: penErr } = await supabase
          .from("staff_timesheet_penalties")
          .upsert(penaltyRows, { onConflict: "user_id,missed_month", ignoreDuplicates: true });
        if (penErr) return json(500, { ok: false, error: `Penalty upsert failed: ${penErr.message || penErr}`, summary });
        penaltiesRecorded = penaltyRows.length;
      }
    }
    return json(200, {
      ok: true,
      mode: "record",
      authVia,
      deadlinePassed: deadlinePassedForMonth(targetMonthIso),
      penaltiesRecorded,
      summary,
    });
  }

  // PDF is needed for both preview and send.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPdf(targetMonthIso, data, logoUrl);
  } catch (e) {
    return json(500, { ok: false, error: `PDF failed: ${e?.message || e}` });
  }

  // Preview: hand the PDF back for on-screen review. No email, no penalties.
  if (isPreview) {
    return json(200, {
      ok: true,
      mode: "preview",
      authVia,
      deadlinePassed: deadlinePassedForMonth(targetMonthIso),
      summary,
      workers: data.workers,
      missing: data.notSubmitted,
      contracts: data.contracts,
      filename: `payroll-${targetMonthIso.slice(0, 7)}.pdf`,
      pdfBase64: toBase64(pdfBytes),
    });
  }

  // Send path: record a pending £5 penalty for each worker who missed the
  // deadline. Only once the 24th 00:00 (London) cut-off has passed, so an early
  // run never penalises anyone prematurely. Idempotent via the unique constraint.
  let penaltiesRecorded = 0;
  if (deadlinePassedForMonth(targetMonthIso) && data.notSubmitted.length) {
    const penaltyRows = data.notSubmitted
      .filter((n) => n.userId)
      .map((n) => ({ user_id: n.userId, missed_month: targetMonthIso, amount: 5, reason: "no_timesheet" }));
    if (penaltyRows.length) {
      try {
        const { error: penErr } = await supabase
          .from("staff_timesheet_penalties")
          .upsert(penaltyRows, { onConflict: "user_id,missed_month", ignoreDuplicates: true });
        if (penErr) console.warn("[payroll] penalty ledger upsert failed:", penErr.message || penErr);
        else penaltiesRecorded = penaltyRows.length;
      } catch (e) {
        console.warn("[payroll] penalty ledger upsert threw:", e?.message || e);
      }
    }
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
      ? `<p><strong>${data.notSubmitted.length}</strong> worker(s) did NOT submit by the deadline (24th, 00:00) — please do not process them this month. They are listed in the PDF and a £5 late penalty applies to their next timesheet (paid next month).</p>`
      : `<p>All workers with a pay rate have submitted.</p>`) +
    (data.contracts && data.contracts.length
      ? `<p><strong>${data.contracts.length}</strong> contract/invoice payment(s) listed separately (subtotal £${money(data.contractTotal || 0)}) — not part of the timesheet total.</p>`
      : "") +
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
    return json(200, { ok: true, sent: true, authVia, to: toList, summary, penaltiesRecorded, providerResponse: result });
  } catch (e) {
    return json(502, { ok: false, error: `Email send failed: ${e?.message || e}`, summary });
  }
});
