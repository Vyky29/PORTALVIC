/**
 * Ensure Anas Ismail (7560101 / client_key anas) has weekly service lines
 * so parent portal Next session / Calendar / Absent see Tue Acton Aurora 6–6.30.
 *
 * Matches INV-P-0340 + portal_re_enrolment_submissions keep slot.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-service-lines-tue-aurora.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-service-lines-tue-aurora.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const row = {
  client_key: "anas",
  client_name: "Anas Ismail",
  client_name_norm: "anas ismail",
  sessions: [
    {
      day: "Tuesday",
      service: "Aquatic Activity",
      timeSlot: "6 to 6.30",
      durationMin: 30,
      venue: "Acton",
      instructor: "AURORA",
      area: "",
    },
  ],
  services_count: 1,
  source: "office_fix_anas_2026_27",
  term_label: "2026/27 Autumn",
  validated: true,
};

console.log("=== Anas service_lines upsert ===");
console.log(JSON.stringify({ APPLY, row }, null, 2));

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const { data, error } = await admin
  .from("portal_participant_service_lines")
  .upsert(row, { onConflict: "client_key" })
  .select("client_key, client_name, services_count, sessions")
  .single();
if (error) throw new Error(error.message);
console.log("OK", JSON.stringify(data, null, 2));
