/**
 * Read-only: participants + funder sheet rows (client_payments) whose name matches a pattern.
 * Shows contact id, participant name, funding label, and the sheet client key / Client ID / PO the
 * invoice PDF will use.
 *
 *   npx -y deno run -A database/local-vault/office-portal-participant-funding-lookup-20261015.ts "Ibrahim"
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const pattern = Deno.args.find((a) => !a.startsWith("--")) || "";
if (!pattern) Deno.exit(1);
const re = new RegExp(pattern, "i");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: parts, error: pErr } = await admin.from("portal_participants").select("*");
if (pErr) console.log("participants:", pErr.message);
const { data: contacts } = await admin.from("portal_parent_contacts").select("contact_id, parent_display, funding_label");
for (const p of (parts || []).filter((x: any) => re.test(JSON.stringify(x)))) {
  const name = p.display_name || p.full_name || p.name || [p.first_name, p.last_name].filter(Boolean).join(" ");
  const c = (contacts || []).find((x: any) => String(x.contact_id) === String(p.contact_id));
  console.log(`PARTICIPANT ${name} | contact ${p.contact_id} | parent ${c?.parent_display || "-"} | funding ${c?.funding_label || "-"}`);
}

const { data: pays, error: cErr } = await admin
  .from("client_payments")
  .select("sheet, client_key, client_name, parent_name, data, imported_at");
if (cErr) console.log("client_payments:", cErr.message);
for (const r of (pays || []).filter((x: any) => re.test(`${x.client_name} ${x.parent_name} ${x.client_key}`))) {
  const d = (r.data || {}) as Record<string, unknown>;
  const pick = (re2: RegExp) => Object.entries(d).filter(([k]) => re2.test(k)).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(
    `SHEET ${r.sheet} | key ${r.client_key} | ${r.client_name} | parent ${r.parent_name || "-"} | ${pick(/client.?id|^id$|po/i)} | imported ${String(r.imported_at || "").slice(0, 10)}`,
  );
}
