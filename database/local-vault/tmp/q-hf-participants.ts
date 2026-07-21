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

const { data: la } = await admin
  .from("client_payments")
  .select("client_key, client_name, parent_name, sheet, data")
  .eq("sheet", "LA")
  .limit(300);

const hf = (la || []).filter((r) => {
  const d = (r.data || {}) as Record<string, unknown>;
  const blob = `${JSON.stringify(d)} ${r.client_name}`.toLowerCase();
  return /h&f|hammersmith|fulham|lbhf/.test(blob);
});

console.log("=== H&F LA client_payments rows ===");
for (const r of hf) {
  const d = (r.data || {}) as Record<string, unknown>;
  console.log(
    JSON.stringify({
      name: r.client_name,
      key: r.client_key,
      funder: d.Funder || d.Funding,
      status: d["Payment status"],
      services: d.Services,
    }),
  );
}

const mentioned = [
  "Elijah",
  "Faris",
  "Stephanie",
  "Abodi",
  "Saaib",
  "Saiib",
  "Simon",
  "Matthias",
  "Yassir",
  "Adam",
];

const { data: pax } = await admin
  .from("portal_participants")
  .select("contact_id, display_name, first_name, last_name, dob_iso")
  .or(
    mentioned
      .map((n) => `display_name.ilike.%${n}%`)
      .join(","),
  )
  .limit(50);

console.log("\n=== Matching portal participants ===");
for (const p of pax || []) {
  const age = ageFromDob(p.dob_iso ? String(p.dob_iso) : null);
  console.log(
    JSON.stringify({
      contact_id: p.contact_id,
      name: p.display_name,
      dob: p.dob_iso,
      age,
      band: age == null ? "?" : age < 18 ? "child" : "adult",
    }),
  );
}

// Also find ALL portal participants whose funding looks H&F / LA managed
const { data: contacts } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, funding_label, parent_display")
  .or("funding_label.ilike.%H&F%,funding_label.ilike.%hammersmith%,funding_label.ilike.%fulham%,funding_label.ilike.%LA%")
  .limit(100);
console.log("\n=== portal_parent_contacts funding matches ===");
for (const c of contacts || []) {
  console.log(JSON.stringify(c));
}
