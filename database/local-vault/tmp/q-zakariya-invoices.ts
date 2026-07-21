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

const { data: pax } = await admin
  .from("portal_participants")
  .select("contact_id, display_name")
  .ilike("display_name", "%zakariya%");
console.log("participants:", JSON.stringify(pax));

const contactId = pax?.[0]?.contact_id;
const { data: invs } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, created_via, billing_term, payment_status, amount_gbp, vat_mode, payment_method_hint, line_items, line_description, reference_text, payment_schedule, amount_paid_gbp",
  )
  .eq("contact_id", contactId)
  .order("created_at", { ascending: true });
for (const inv of invs || []) {
  console.log(
    JSON.stringify(
      {
        id: inv.id,
        n: inv.invoice_number,
        via: inv.created_via,
        term: inv.billing_term,
        status: inv.payment_status,
        amt: inv.amount_gbp,
        paid: inv.amount_paid_gbp,
        vat: inv.vat_mode,
        hint: inv.payment_method_hint,
        lines: Array.isArray(inv.line_items) ? inv.line_items.length : null,
        sched: Array.isArray(inv.payment_schedule) ? inv.payment_schedule.length : null,
        desc: String(inv.line_description || "").slice(0, 120),
      },
      null,
      1,
    ),
  );
}

const { data: subs } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, submitted_at, payload")
  .eq("participant_contact_id", contactId)
  .order("submitted_at", { ascending: false })
  .limit(1);
const payload = subs?.[0]?.payload as Record<string, unknown> | undefined;
const slots = Array.isArray(payload?.weekly_slots_snapshot)
  ? (payload!.weekly_slots_snapshot as Array<Record<string, unknown>>)
  : [];
console.log("submission:", subs?.[0]?.id, subs?.[0]?.submitted_at, "slots:", slots.length);
for (const s of slots) {
  console.log(
    "slot:",
    JSON.stringify({
      id: s.id,
      serviceType: s.serviceType,
      durationMin: s.durationMin,
      day: s.day,
      timeSlot: s.timeSlot,
      venue: s.venue,
      isDayCentre: s.isDayCentre,
      pricePerSession: s.pricePerSession,
      sessions: s.sessions,
      termTotals: s.termTotals,
    }),
  );
}
const choices = payload?.choices as Record<string, unknown> | undefined;
console.log("weekly choices:", JSON.stringify(choices?.weekly ?? null));
console.log("funding:", JSON.stringify(payload?.funding ?? null));
