/**
 * Record that Youssef already has 1 x Grey Mixed Cotton T-Shirt size L.
 *
 *   node database/local-vault/office-uniform-issue-youssef-grey-tshirt-l.mjs
 *   APPLY=1 node database/local-vault/office-uniform-issue-youssef-grey-tshirt-l.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const NOTE = "Office record: Youssef has grey T-shirt L";
const SKU = "STAFF_GREY_TSHIRT";
const SIZE = "L";
const QTY = 1;

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

const url =
  process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function findStaff(rows, username) {
  const u = username.toLowerCase();
  return (rows || []).find(
    (s) => String(s.username || "").toLowerCase() === u,
  );
}

async function main() {
  const { data: item, error: iErr } = await sb
    .from("uniform_items")
    .select("id, sku_code, name")
    .eq("sku_code", SKU)
    .maybeSingle();
  if (iErr) throw iErr;
  if (!item) throw new Error("sku missing: " + SKU);

  const { data: staffRows, error: sErr } = await sb
    .from("staff_profiles")
    .select("id, full_name, username, is_active")
    .eq("is_active", true);
  if (sErr) throw sErr;

  const youssef = findStaff(staffRows, "youssef");
  if (!youssef) throw new Error("staff missing: youssef");
  const issuer =
    findStaff(staffRows, "berta") || findStaff(staffRows, "michelle");
  if (!issuer) throw new Error("issuer profile missing");

  const { data: existing, error: eErr } = await sb
    .from("uniform_issues")
    .select("id, size, qty, status, issued_at, reason, item_id")
    .eq("staff_profile_id", youssef.id)
    .eq("status", "issued");
  if (eErr) throw eErr;

  const already = (existing || []).filter(
    (r) => r.item_id === item.id && r.size === SIZE,
  );
  console.log("Youssef:", youssef.full_name, youssef.username, youssef.id);
  console.log("Open issues:", existing || []);
  console.log("Matching grey T-shirt L already issued:", already.length);

  const { data: level, error: lvErr } = await sb
    .from("uniform_stock_levels")
    .select("id, current_qty")
    .eq("item_id", item.id)
    .eq("size", SIZE)
    .maybeSingle();
  if (lvErr) throw lvErr;
  if (!level) throw new Error("stock level missing " + SKU + " " + SIZE);
  console.log("Stock", SKU, SIZE, "current=", level.current_qty);

  if (already.length) {
    console.log("Already on Youssef's ledger. Nothing to write.");
    return;
  }
  if (Number(level.current_qty) < QTY) {
    throw new Error(
      `insufficient stock ${SKU} ${SIZE}: need ${QTY}, have ${level.current_qty}`,
    );
  }

  console.log(
    `Plan: ${SKU} ${SIZE} x${QTY} → ${youssef.username} (issuer ${issuer.username})`,
  );
  if (!APPLY) {
    console.log("Dry run OK. Re-run with APPLY=1 to write.");
    return;
  }

  const now = new Date().toISOString();
  const { data: lvNow, error: lvNowErr } = await sb
    .from("uniform_stock_levels")
    .select("id, current_qty")
    .eq("id", level.id)
    .maybeSingle();
  if (lvNowErr) throw lvNowErr;
  const before = Number(lvNow.current_qty);
  if (before < QTY) {
    throw new Error(`insufficient ${SKU} ${SIZE}: ${before} < ${QTY}`);
  }

  const { data: issue, error: issErr } = await sb
    .from("uniform_issues")
    .insert({
      staff_profile_id: youssef.id,
      item_id: item.id,
      size: SIZE,
      qty: QTY,
      issue_type: "initial",
      issued_at: now,
      reason: NOTE,
      charge_applies: false,
      charge_gbp: 0,
      issuer_staff_id: issuer.id,
      issuer_ack_name: issuer.full_name || issuer.username,
      issuer_ack_at: now,
      staff_ack_name: youssef.full_name || youssef.username,
      staff_ack_at: now,
      status: "issued",
    })
    .select("*")
    .maybeSingle();
  if (issErr) throw issErr;

  const { error: upErr } = await sb
    .from("uniform_stock_levels")
    .update({ current_qty: before - QTY, updated_at: now })
    .eq("id", level.id);
  if (upErr) throw upErr;

  await sb.from("uniform_stock_movements").insert({
    item_id: item.id,
    size: SIZE,
    delta: -QTY,
    reason: "issue",
    issue_id: issue.id,
    actor_user_id: issuer.id,
    note: `${NOTE}: ${item.name} ${SIZE} x${QTY} → ${youssef.full_name}`,
  });

  console.log("ISSUED", {
    issue_id: issue.id,
    sku: SKU,
    size: SIZE,
    qty: QTY,
    stock_after: before - QTY,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
