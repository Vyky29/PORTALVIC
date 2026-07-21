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

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await admin
  .from("portal_parent_notify_log")
  .select("parent_name, client_display, parent_phone, whatsapp_status, error_detail, created_at")
  .eq("kind", "whatsapp_number_change_retry_20260717")
  .order("created_at", { ascending: true });
if (error) throw error;

const counts: Record<string, number> = {};
for (const row of data || []) {
  const key = String(row.whatsapp_status || "unknown");
  counts[key] = (counts[key] || 0) + 1;
}

const failed = (data || []).filter((r) => String(r.whatsapp_status) === "failed");
const stillSent = (data || []).filter((r) => String(r.whatsapp_status) === "sent");

console.log(JSON.stringify({ total: data?.length || 0, counts, failed, still_sent: stillSent }, null, 2));
