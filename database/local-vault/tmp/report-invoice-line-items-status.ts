/**
 * Report: which portal invoices still lack detailed per-service line items.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, amount_paid_gbp, payment_status, billing_term, created_via, vat_mode, line_items, line_description, reference_text, payment_schedule, created_at",
  )
  .order("created_at", { ascending: true })
  .limit(500);
if (error) throw error;

const names = new Map<string, string>();
{
  const { data: pax } = await admin
    .from("portal_participants")
    .select("contact_id, display_name");
  for (const p of pax || []) names.set(String(p.contact_id), String(p.display_name || ""));
}

const out: Record<string, unknown>[] = [];
for (const r of rows || []) {
  const lines = Array.isArray(r.line_items) ? r.line_items : [];
  out.push({
    n: r.invoice_number,
    contact: r.contact_id,
    name: names.get(String(r.contact_id)) || "",
    amt: r.amount_gbp,
    paid: r.amount_paid_gbp,
    status: r.payment_status,
    term: r.billing_term,
    via: r.created_via,
    vat: r.vat_mode,
    line_count: lines.length,
    sched_count: Array.isArray(r.payment_schedule) ? r.payment_schedule.length : 0,
    ref: String(r.reference_text || "").slice(0, 80),
    desc: String(r.line_description || "").slice(0, 100),
  });
}
console.log(JSON.stringify(out, null, 1));
console.log(
  "TOTAL",
  out.length,
  "| without line items:",
  out.filter((o) => (o.line_count as number) === 0).length,
);
