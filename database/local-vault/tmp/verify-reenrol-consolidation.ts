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

const { data: ready, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,contact_id,amount_gbp,payment_status,share_status,billing_term,reference_text,line_items,payment_schedule,next_instalment_due,notes,document_id",
  )
  .eq("created_via", "reenrolment")
  .eq("share_status", "ready")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

const issues: string[] = [];
for (const r of ready || []) {
  const schedule = Array.isArray(r.payment_schedule) ? r.payment_schedule : [];
  const lines = Array.isArray(r.line_items) ? r.line_items : [];
  if (!schedule.length) issues.push(`${r.invoice_number}: no schedule`);
  if (!lines.length) issues.push(`${r.invoice_number}: no lines`);
  const schedTotal = Math.round(
    schedule.reduce((s: number, x: Record<string, unknown>) => s + Number(x.amount_gbp || 0), 0) * 100,
  ) / 100;
  if (Math.abs(schedTotal - Number(r.amount_gbp)) > 0.01) {
    issues.push(`${r.invoice_number}: schedule £${schedTotal} != invoice £${r.amount_gbp}`);
  }
}

const byContactTerm = new Map<string, string[]>();
for (const r of ready || []) {
  const key = `${r.contact_id}|${r.billing_term || r.reference_text}`;
  const list = byContactTerm.get(key) || [];
  list.push(r.invoice_number);
  byContactTerm.set(key, list);
}
for (const [key, nums] of byContactTerm) {
  if (nums.length > 1) issues.push(`${key}: duplicate ready invoices ${nums.join(", ")}`);
}

const { count: hiddenCount } = await admin
  .from("portal_parent_invoice_share")
  .select("id", { count: "exact", head: true })
  .eq("created_via", "reenrolment")
  .eq("share_status", "hidden")
  .like("notes", "%Consolidated payment tracker:%");

console.log(JSON.stringify({
  ready_count: ready?.length || 0,
  hidden_trackers: hiddenCount || 0,
  issues,
  sample_0079: (ready || []).find((r) => r.invoice_number === "INV-P-0079"),
}, null, 2));
