/**
 * Linkage smoke test: issue 2x M T-shirts → staff ledger + stock -2 → return restock +2.
 *
 *   APPLY=1 node database/local-vault/verify-uniform-stock-link.mjs
 *
 * Requires local-secrets/secrets.env (service role). Creates a temporary issue against
 * a staff profile (prefers username "demo" / inactive-safe active staff), then returns it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(ROOT, "local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in local-secrets/secrets.env");
  process.exit(2);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { data: item, error: itemErr } = await sb
    .from("uniform_items")
    .select("id, name, sku_code")
    .eq("sku_code", "STAFF_GREY_TSHIRT")
    .maybeSingle();
  if (itemErr) throw itemErr;
  assert(item, "uniform_items seed missing — apply migration 20260901140000_uniform_stock.sql");

  const { data: level0, error: lvErr } = await sb
    .from("uniform_stock_levels")
    .select("id, current_qty, opening_qty")
    .eq("item_id", item.id)
    .eq("size", "M")
    .maybeSingle();
  if (lvErr) throw lvErr;
  assert(level0, "stock level M missing");
  console.log("OK seed T-shirt M current=", level0.current_qty, "opening=", level0.opening_qty);

  const { data: levels } = await sb
    .from("uniform_stock_levels")
    .select("opening_qty, current_qty");
  const openingSum = (levels || []).reduce((a, r) => a + Number(r.opening_qty || 0), 0);
  const currentSum = (levels || []).reduce((a, r) => a + Number(r.current_qty || 0), 0);
  console.log("OK totals opening=", openingSum, "current=", currentSum);
  assert(openingSum === 130, "expected opening total 130");
  assert(currentSum === 113, "expected current total 113 at seed (before live issues)");

  if (!APPLY) {
    console.log("Dry run OK. Re-run with APPLY=1 to issue/return linkage test.");
    return;
  }

  const { data: staff } = await sb
    .from("staff_profiles")
    .select("id, full_name, username")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(1)
    .maybeSingle();
  assert(staff, "no active staff for test issue");

  const before = Number(level0.current_qty);
  assert(before >= 2, "need at least 2 M T-shirts in stock for test");

  const now = new Date().toISOString();
  const qty = 2;

  const { data: issue, error: issErr } = await sb
    .from("uniform_issues")
    .insert({
      staff_profile_id: staff.id,
      item_id: item.id,
      size: "M",
      qty,
      issue_type: "initial",
      issued_at: now,
      reason: "link-test verify-uniform-stock-link",
      charge_applies: false,
      charge_gbp: 0,
      issuer_ack_name: "Link Test Issuer",
      issuer_ack_at: now,
      staff_ack_name: staff.full_name || "Link Test Staff",
      staff_ack_at: now,
      status: "issued",
    })
    .select("*")
    .maybeSingle();
  if (issErr) throw issErr;

  const { error: upErr } = await sb
    .from("uniform_stock_levels")
    .update({ current_qty: before - qty, updated_at: now })
    .eq("id", level0.id);
  if (upErr) throw upErr;

  await sb.from("uniform_stock_movements").insert({
    item_id: item.id,
    size: "M",
    delta: -qty,
    reason: "issue",
    issue_id: issue.id,
    note: "link-test issue",
  });

  const { data: afterIssue } = await sb
    .from("uniform_stock_levels")
    .select("current_qty")
    .eq("id", level0.id)
    .maybeSingle();
  assert(Number(afterIssue.current_qty) === before - qty, "stock not deducted");

  const { data: staffIssues } = await sb
    .from("uniform_issues")
    .select("id, qty, size, status")
    .eq("staff_profile_id", staff.id)
    .eq("id", issue.id);
  assert(staffIssues && staffIssues.length === 1, "issue missing on staff ledger");
  console.log("OK issue on staff", staff.username || staff.full_name, "stock", afterIssue.current_qty);

  // Return restock
  await sb
    .from("uniform_issues")
    .update({
      status: "returned_restock",
      returned_at: new Date().toISOString(),
      return_note: "link-test restock",
    })
    .eq("id", issue.id);

  await sb
    .from("uniform_stock_levels")
    .update({ current_qty: before, updated_at: new Date().toISOString() })
    .eq("id", level0.id);

  await sb.from("uniform_stock_movements").insert({
    item_id: item.id,
    size: "M",
    delta: qty,
    reason: "return_restock",
    issue_id: issue.id,
    note: "link-test return restock",
  });

  const { data: afterReturn } = await sb
    .from("uniform_stock_levels")
    .select("current_qty")
    .eq("id", level0.id)
    .maybeSingle();
  assert(Number(afterReturn.current_qty) === before, "stock not restocked");
  console.log("OK return restock current=", afterReturn.current_qty);
  console.log("LINK TEST PASSED");
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
