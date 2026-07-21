import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
      : "";
  } catch {
    return "";
  }
}

function phoneKey(raw: unknown): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `44${d.slice(1)}`;
  if (d.length === 10 && d.startsWith("7")) d = `44${d}`;
  return d;
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: contacts, error: contactsError } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, parent_display, child_display, mobile, in_class")
  .eq("in_class", true)
  .limit(5000);
if (contactsError) throw contactsError;

const { data: inbound, error: inboundError } = await admin
  .from("portal_parent_whatsapp_inbound")
  .select("from_phone, created_at")
  .limit(10000);
if (inboundError) throw inboundError;

const inboundPhones = new Set((inbound || []).map((r) => phoneKey(r.from_phone)).filter(Boolean));
const byPhone = new Map<
  string,
  { parent: string; children: Set<string>; mobile: string; contactIds: Set<string> }
>();

for (const row of contacts || []) {
  const key = phoneKey(row.mobile);
  if (!key) continue;
  let recipient = byPhone.get(key);
  if (!recipient) {
    recipient = {
      parent: String(row.parent_display || "").trim(),
      children: new Set<string>(),
      mobile: `+${key}`,
      contactIds: new Set<string>(),
    };
    byPhone.set(key, recipient);
  }
  if (!recipient.parent && row.parent_display) {
    recipient.parent = String(row.parent_display).trim();
  }
  if (row.child_display) recipient.children.add(String(row.child_display).trim());
  if (row.contact_id) recipient.contactIds.add(String(row.contact_id));
}

const noInbound = [...byPhone.entries()]
  .filter(([key]) => !inboundPhones.has(key))
  .map(([, r]) => ({
    parent: r.parent || "Parent / carer",
    children: [...r.children].sort().join(", "),
    mobile: r.mobile,
    contact_ids: [...r.contactIds],
  }))
  .sort((a, b) => a.parent.localeCompare(b.parent));

console.log(JSON.stringify({
  active_unique_mobile_families: byPhone.size,
  unique_api_inbound_phones: inboundPhones.size,
  active_families_with_api_inbound: [...byPhone.keys()].filter((p) => inboundPhones.has(p)).length,
  recipients_without_api_inbound: noInbound.length,
  recipients: noInbound,
}, null, 2));
