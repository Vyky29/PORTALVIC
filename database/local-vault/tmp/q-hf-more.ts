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

function ageFromDob(dob: string | null): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const d = new Date(dob.slice(0, 10) + "T12:00:00");
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const keys = ["abodi", "faris", "adam-p", "adam pilcher", "stephanie", "saaib", "saiib"];
for (const q of keys) {
  const { data: pax } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, dob_iso")
    .ilike("display_name", `%${q.replace("-", " ")}%`)
    .limit(10);
  const { data: pay } = await admin
    .from("client_payments")
    .select("client_key, client_name, sheet, data")
    .or(`client_key.ilike.%${q}%,client_name.ilike.%${q}%`)
    .limit(10);
  console.log("---", q);
  for (const p of pax || []) {
    console.log("pax", JSON.stringify({ ...p, age: ageFromDob(p.dob_iso ? String(p.dob_iso) : null) }));
  }
  for (const r of pay || []) {
    const d = (r.data || {}) as Record<string, unknown>;
    console.log("pay", JSON.stringify({ key: r.client_key, name: r.client_name, sheet: r.sheet, funder: d.Funder || d.Funding }));
  }
}
