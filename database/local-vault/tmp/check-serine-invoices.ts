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

const contactId = "58";

const { data: invs, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, billing_term, payment_schedule, line_items, line_description, notes, created_via, reference_text, payment_method_hint, vat_mode",
  )
  .eq("contact_id", contactId)
  .order("created_at", { ascending: true });
console.log("invErr", invErr?.message);
console.log("inv count", invs?.length);
for (const inv of invs || []) {
  console.log(
    JSON.stringify(
      {
        id: inv.id,
        n: inv.invoice_number,
        amt: inv.amount_gbp,
        paid: inv.amount_paid_gbp,
        status: inv.payment_status,
        term: inv.billing_term,
        via: inv.created_via,
        hint: inv.payment_method_hint,
        vat: inv.vat_mode,
        sched: inv.payment_schedule,
        lines: inv.line_items,
        desc: String(inv.line_description || "").slice(0, 220),
        notes: inv.notes,
        ref: inv.reference_text,
      },
      null,
      2,
    ),
  );
}

const { data: credits, error: cErr } = await admin
  .from("portal_parent_family_credits")
  .select("*")
  .or(`contact_id.eq.${contactId},parent_person_id.eq.${contactId}`)
  .order("created_at", { ascending: false })
  .limit(30);
console.log("credErr", cErr?.message);
console.log("credits", JSON.stringify(credits, null, 2));

// also by parent_person_id from participant
const { data: pax } = await admin
  .from("portal_participants")
  .select("contact_id, display_name, parent_person_id")
  .eq("contact_id", contactId)
  .maybeSingle();
console.log("pax", pax);
if (pax?.parent_person_id) {
  const { data: credits2 } = await admin
    .from("portal_parent_family_credits")
    .select("*")
    .eq("parent_person_id", pax.parent_person_id)
    .order("created_at", { ascending: false })
    .limit(30);
  console.log("credits by parent", JSON.stringify(credits2, null, 2));
}
