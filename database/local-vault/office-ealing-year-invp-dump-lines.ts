/**
 * Dump Ealing year INV-P lines + expected session counts after May 3 BH.
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-sys \
 *     database/local-vault/office-ealing-year-invp-dump-lines.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { collectTermSessionDates } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

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
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");
loadEnvFile("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

const TERMS = ["autumn", "spring", "summer"] as const;
function expectedForDay(day: string): { autumn: number; spring: number; summer: number; year: number } {
  const autumn = collectTermSessionDates("autumn", day).length;
  const spring = collectTermSessionDates("spring", day).length;
  const summer = collectTermSessionDates("summer", day).length;
  return { autumn, spring, summer, year: autumn + spring + summer };
}

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, amount_gbp, line_items, payment_schedule, ready_by, contact_id, share_status, payment_status",
  )
  .ilike("ready_by", "%ealing_year%")
  .order("invoice_number");
if (error) throw new Error(error.message);

const rows = (shares || []).filter((r) => {
  const st = clean(r.share_status, 40).toLowerCase();
  const pay = clean(r.payment_status, 40).toLowerCase();
  return st === "ready" && pay !== "void";
});

const ids = [...new Set(rows.map((r) => clean(r.contact_id, 80)).filter(Boolean))];
const { data: contacts } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, child_first_name, child_last_name")
  .in("contact_id", ids);
const nameBy = new Map(
  (contacts || []).map((c) => [
    String(c.contact_id),
    clean(c.child_display, 120) ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" "),
  ]),
);

for (const s of rows) {
  const name = nameBy.get(clean(s.contact_id, 80)) || "?";
  const lines = Array.isArray(s.line_items) ? (s.line_items as Record<string, unknown>[]) : [];
  const sched = Array.isArray(s.payment_schedule) ? s.payment_schedule : [];
  console.log(`\n=== ${s.invoice_number} · ${name} · £${s.amount_gbp} · BACS ${sched.length} ===`);
  let issues = 0;
  for (const li of lines) {
    const desc = clean(li.description || li.detail || "", 100);
    const q = num(li.quantity ?? li.qty);
    const amt = num(li.amount_gbp ?? li.amount);
    const dayMatch = desc.match(
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i,
    );
    const day = dayMatch ? dayMatch[1].replace(/s$/i, "") : "";
    let flag = "";
    if (day) {
      const exp = expectedForDay(day);
      // Match term by qty
      let want: number | null = null;
      let termHint = "";
      if (q === exp.autumn) {
        want = exp.autumn;
        termHint = "autumn";
      } else if (q === exp.spring) {
        want = exp.spring;
        termHint = "spring";
      } else if (q === exp.summer) {
        want = exp.summer;
        termHint = "summer";
      } else {
        // Guess term by catalogue weights
        if (q === 14) termHint = "autumn?";
        else if (q === 11) termHint = "spring?";
        else if (q === 13) termHint = "summer?";
        want =
          termHint.startsWith("autumn")
            ? exp.autumn
            : termHint.startsWith("spring")
            ? exp.spring
            : termHint.startsWith("summer")
            ? exp.summer
            : null;
      }
      if (want != null && q !== want) {
        flag = ` ← MISMATCH want ${want} (${day} ${termHint || "term"})`;
        issues++;
      } else if (want != null) {
        flag = ` ✓ ${day} ${termHint}`;
      }
    } else if (q === 14 || q === 11 || q === 13) {
      // Weekday line without day in description — check if Monday-affected summer 13
      if (q === 13) flag = " · (no day in desc — if Monday summer should be 12)";
    }
    console.log(`  ${desc}  x${q}  £${amt}${flag}`);
  }
  if (issues) console.log(`  ISSUES: ${issues}`);
  else console.log("  qty checks: OK or day not in description");
}
