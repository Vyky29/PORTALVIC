/**
 * One-off: consolidate legacy re-enrolment instalment invoices into one invoice
 * per participant + term.
 *
 * The keeper invoice contains:
 *   - the full term amount;
 *   - full-term quantities and per-service line items;
 *   - an embedded payment_schedule made from the old invoice rows.
 *
 * Old rows remain as hidden payment trackers because existing GoCardless
 * payments reference their share IDs. The webhook rolls those payments into
 * the keeper invoice using the marker written to notes.
 *
 * Dry run (default):
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/consolidate-reenrolment-term-invoices.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/consolidate-reenrolment-term-invoices.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import type { PortalInvoiceLineItem } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const MARKER_PREFIX = "Consolidated payment tracker:";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type TermKey = "autumn" | "spring" | "summer";
type ShareRow = {
  id: string;
  document_id: string;
  invoice_number: string;
  contact_id: string;
  amount_gbp: number;
  amount_paid_gbp: number;
  due_date: string | null;
  payment_status: string;
  paid_at: string | null;
  paid_via: string | null;
  payment_method_hint: string | null;
  payment_schedule: unknown;
  billing_term: string | null;
  reference_text: string | null;
  line_items: unknown;
  notes: string | null;
  created_at: string;
  gocardless_payment_id: string | null;
  share_status: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function termFromRow(row: ShareRow): TermKey | null {
  const stored = String(row.billing_term || "").toLowerCase();
  if (stored === "autumn" || stored === "spring" || stored === "summer") return stored;
  const ref = String(row.reference_text || "").toLowerCase();
  if (/\(autumn\)|autumn term/.test(ref)) return "autumn";
  if (/\(spring\)|spring term/.test(ref)) return "spring";
  if (/\(summer\)|summer term/.test(ref)) return "summer";
  return null;
}
function termLabel(term: TermKey): string {
  return term.charAt(0).toUpperCase() + term.slice(1) + " term 26/27";
}
function hasSchedule(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length > 0;
}
function appendMarker(notes: unknown, targetId: string): string {
  const clean = String(notes || "")
    .replace(new RegExp(`\\n?${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[0-9a-f-]+`, "ig"), "")
    .trim();
  return [clean, `${MARKER_PREFIX} ${targetId}`].filter(Boolean).join("\n\n").slice(0, 800);
}

function aggregateLines(rows: ShareRow[]): PortalInvoiceLineItem[] {
  const byKey = new Map<string, PortalInvoiceLineItem>();
  for (const row of rows) {
    const lines = Array.isArray(row.line_items)
      ? (row.line_items as Array<Record<string, unknown>>)
      : [];
    for (const raw of lines) {
      const key = String(raw.service_key || raw.description || "").trim();
      const amount = Number(raw.amount_gbp);
      const qty = Number(raw.quantity);
      if (!key || !Number.isFinite(amount) || !Number.isFinite(qty) || qty <= 0) continue;
      const prev = byKey.get(key);
      if (prev) {
        prev.quantity = round2(prev.quantity + qty);
        prev.amount_gbp = round2(prev.amount_gbp + amount);
        prev.unit_price_gbp = round4(prev.amount_gbp / prev.quantity);
      } else {
        byKey.set(key, {
          service_key: key,
          description: String(raw.description || "Service"),
          detail: raw.detail ? String(raw.detail) : null,
          quantity: round2(qty),
          unit_price_gbp: Number(raw.unit_price_gbp) || round4(amount / qty),
          amount_gbp: round2(amount),
          xero_item_code: raw.xero_item_code ? String(raw.xero_item_code) : null,
        });
      }
    }
  }
  const lines = Array.from(byKey.values()).map((line) => {
    // Instalment rows used fractional quantities rounded to 2dp (e.g.
    // 3.67 × 3 payments = 11.01). Restore the real full-term session count.
    const nearest = Math.round(line.quantity);
    if (Math.abs(line.quantity - nearest) <= 0.05) {
      line.quantity = nearest;
      line.unit_price_gbp = round4(line.amount_gbp / nearest);
    }
    return line;
  });
  return lines.sort((a, b) => {
    if (a.service_key === "GC_FEE") return 1;
    if (b.service_key === "GC_FEE") return -1;
    return a.service_key.localeCompare(b.service_key);
  });
}

const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,document_id,invoice_number,contact_id,amount_gbp,amount_paid_gbp,due_date,payment_status,paid_at,paid_via,payment_method_hint,payment_schedule,billing_term,reference_text,line_items,notes,created_at,gocardless_payment_id,share_status",
  )
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void")
  .order("created_at", { ascending: true })
  .limit(300);
if (error) throw error;

// Only legacy rows without an embedded schedule. Serine/Zakariya are already correct.
const legacy = (data || []).filter((r) => !hasSchedule(r.payment_schedule)) as ShareRow[];
const groups = new Map<string, ShareRow[]>();
for (const row of legacy) {
  const term = termFromRow(row);
  if (!term) {
    console.log(`${row.invoice_number}: no term — skipped`);
    continue;
  }
  const key = `${row.contact_id}|${term}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(row);
}

let keepers = 0;
let hidden = 0;
let failed = 0;

for (const [key, unsortedRows] of groups) {
  const [, term] = key.split("|") as [string, TermKey];
  const rows = unsortedRows.slice().sort((a, b) => {
    const dueCmp = String(a.due_date || "").localeCompare(String(b.due_date || ""));
    return dueCmp || a.invoice_number.localeCompare(b.invoice_number);
  });
  const keeper = rows[0];
  const lines = aggregateLines(rows);
  if (!lines.length) {
    console.log(`${key}: no line items — skipped`);
    continue;
  }

  const amount = round2(rows.reduce((sum, r) => sum + Number(r.amount_gbp || 0), 0));
  const amountPaid = round2(rows.reduce((sum, r) => sum + Number(r.amount_paid_gbp || 0), 0));
  const schedule = rows.map((r, i) => ({
    seq: i + 1,
    label: String(r.reference_text || `Payment ${i + 1}`).replace(/\s+26\/27$/i, "").slice(0, 120),
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
    amount_gbp: round2(Number(r.amount_gbp)),
    status: String(r.payment_status).toLowerCase() === "paid" ? "paid" : "pending",
    paid_at: r.paid_at || null,
    paid_via: r.paid_via || null,
  }));
  const firstPending = schedule.find((r) => r.status !== "paid");
  const allPaid = schedule.every((r) => r.status === "paid");
  const anyPaid = schedule.some((r) => r.status === "paid");
  const anyPartial = rows.some((r) => String(r.payment_status).toLowerCase() === "partial");
  const status = allPaid ? "paid" : anyPaid || anyPartial ? "partial" : "unpaid";
  const reference = termLabel(term);
  const markerNotes = appendMarker(keeper.notes, keeper.id);

  console.log(
    `${reference} · c${keeper.contact_id}: keep ${keeper.invoice_number}; ` +
      `${rows.length} payment row(s), £${amount}, ${lines.length} service line(s)`,
  );
  console.log(
    "  " +
      lines.map((l) => `${l.description} ×${l.quantity} = £${l.amount_gbp}`).join(" | "),
  );
  if (!APPLY) continue;

  const { error: keeperErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: amount,
      amount_paid_gbp: amountPaid,
      payment_status: status,
      paid_at: allPaid ? rows.map((r) => r.paid_at).filter(Boolean).sort().at(-1) || null : null,
      paid_via: allPaid ? rows.map((r) => r.paid_via).filter(Boolean).at(-1) || null : null,
      due_date: firstPending?.due_date || schedule[0]?.due_date || null,
      next_instalment_due: firstPending?.due_date || null,
      payment_schedule: schedule,
      billing_term: term,
      reference_text: reference,
      line_items: lines,
      quantity: 1,
      unit_price_gbp: amount,
      notes: markerNotes,
      share_status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", keeper.id);
  if (keeperErr) {
    failed++;
    console.log(`  ${keeper.invoice_number}: keeper update failed — ${keeperErr.message}`);
    continue;
  }

  for (const tracker of rows.slice(1)) {
    const { error: trackerErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        share_status: "hidden",
        ready_at: null,
        notes: appendMarker(tracker.notes, keeper.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tracker.id);
    if (trackerErr) {
      failed++;
      console.log(`  ${tracker.invoice_number}: hide failed — ${trackerErr.message}`);
    } else {
      hidden++;
    }
  }

  const regen = await regeneratePortalInvoiceSharePdf(admin, keeper.id);
  if (!regen.ok) {
    failed++;
    console.log(`  ${keeper.invoice_number}: PDF failed — ${regen.error}`);
  } else {
    keepers++;
    console.log(`  ${keeper.invoice_number}: consolidated + PDF regenerated`);
  }
}

console.log(
  APPLY
    ? `Done — ${keepers} term invoice(s), ${hidden} old tracker(s) hidden, ${failed} failure(s).`
    : `Dry run — ${groups.size} term group(s). Set APPLY=1 to write.`,
);
