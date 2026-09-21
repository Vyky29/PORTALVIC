/**
 * Record office uniform handouts (2026-09-01 batch).
 *
 *   APPLY=1 node database/local-vault/office-uniform-issue-2026-09-01-batch.mjs
 *
 * Youssef omitted — qty/SKU unknown.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const NOTE = "Office handout 2026-09-01";

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

/** @type {{ username: string, lines: { sku: string, size: string, qty: number }[] }[]} */
const BATCH = [
  {
    username: "Michelle",
    lines: [
      { sku: "STAFF_GREY_TSHIRT", size: "S", qty: 2 },
      { sku: "STAFF_GREY_SWEAT", size: "M", qty: 1 },
    ],
  },
  {
    username: "Roberto",
    lines: [
      { sku: "STAFF_GREY_SWEAT", size: "XXL", qty: 2 },
      { sku: "STAFF_GREY_TSHIRT", size: "XXL", qty: 2 },
    ],
  },
  {
    username: "Luliya",
    lines: [{ sku: "STAFF_GREY_TSHIRT", size: "M", qty: 2 }],
  },
  {
    username: "Victor",
    lines: [
      { sku: "STAFF_GREY_SWEAT", size: "L", qty: 1 },
      { sku: "MGR_GREY_POLO", size: "L", qty: 1 },
      // "polo yellow" → beige manager polo in catalog
      { sku: "MGR_BEIGE_POLO", size: "L", qty: 1 },
    ],
  },
  {
    username: "Raul",
    lines: [
      { sku: "STAFF_GREY_SWEAT", size: "L", qty: 1 },
      { sku: "MGR_GREY_POLO", size: "XL", qty: 1 },
    ],
  },
];

async function main() {
  const { data: items, error: iErr } = await sb
    .from("uniform_items")
    .select("id, sku_code, name");
  if (iErr) throw iErr;
  const itemBySku = new Map((items || []).map((r) => [r.sku_code, r]));

  const { data: staffRows, error: sErr } = await sb
    .from("staff_profiles")
    .select("id, full_name, username")
    .eq("is_active", true);
  if (sErr) throw sErr;

  function findStaff(username) {
    const u = username.toLowerCase();
    return (staffRows || []).find(
      (s) => String(s.username || "").toLowerCase() === u,
    );
  }

  const issuer = findStaff("Berta") || findStaff("Michelle");
  if (!issuer) throw new Error("issuer profile missing");

  const { data: levels } = await sb
    .from("uniform_stock_levels")
    .select("id, item_id, size, current_qty");

  const need = new Map(); // `${itemId}|${size}` -> qty
  const plan = [];

  for (const row of BATCH) {
    const st = findStaff(row.username);
    if (!st) throw new Error("staff missing: " + row.username);
    for (const line of row.lines) {
      const item = itemBySku.get(line.sku);
      if (!item) throw new Error("sku missing: " + line.sku);
      const lv = (levels || []).find(
        (l) => l.item_id === item.id && l.size === line.size,
      );
      if (!lv) throw new Error(`level missing ${line.sku} ${line.size}`);
      const k = `${item.id}|${line.size}`;
      need.set(k, (need.get(k) || 0) + line.qty);
      plan.push({
        staff: st,
        item,
        size: line.size,
        qty: line.qty,
        levelId: lv.id,
        current: Number(lv.current_qty),
      });
    }
  }

  console.log("=== PLAN ===");
  for (const p of plan) {
    console.log(
      `${p.staff.username}: ${p.item.sku_code} ${p.size} x${p.qty} (stock now ${p.current})`,
    );
  }
  console.log("issuer:", issuer.username, issuer.full_name);
  console.log("Youssef: SKIPPED (unknown items)");

  for (const [k, qty] of need) {
    const [itemId, size] = k.split("|");
    const lv = (levels || []).find(
      (l) => l.item_id === itemId && l.size === size,
    );
    const sku = (items || []).find((i) => i.id === itemId)?.sku_code;
    if (Number(lv.current_qty) < qty) {
      throw new Error(
        `insufficient stock ${sku} ${size}: need ${qty}, have ${lv.current_qty}`,
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry run OK. Re-run with APPLY=1 to write.");
    return;
  }

  const now = new Date().toISOString();
  const created = [];

  for (const p of plan) {
    const { data: lvNow, error: lvErr } = await sb
      .from("uniform_stock_levels")
      .select("id, current_qty")
      .eq("id", p.levelId)
      .maybeSingle();
    if (lvErr) throw lvErr;
    const before = Number(lvNow.current_qty);
    if (before < p.qty) {
      throw new Error(
        `race/insufficient ${p.item.sku_code} ${p.size}: ${before} < ${p.qty}`,
      );
    }

    const { data: issue, error: issErr } = await sb
      .from("uniform_issues")
      .insert({
        staff_profile_id: p.staff.id,
        item_id: p.item.id,
        size: p.size,
        qty: p.qty,
        issue_type: "initial",
        issued_at: now,
        reason: NOTE,
        charge_applies: false,
        charge_gbp: 0,
        issuer_staff_id: issuer.id,
        issuer_ack_name: issuer.full_name || issuer.username,
        issuer_ack_at: now,
        staff_ack_name: p.staff.full_name || p.staff.username,
        staff_ack_at: now,
        status: "issued",
      })
      .select("*")
      .maybeSingle();
    if (issErr) throw issErr;

    const { error: upErr } = await sb
      .from("uniform_stock_levels")
      .update({ current_qty: before - p.qty, updated_at: now })
      .eq("id", p.levelId);
    if (upErr) throw upErr;

    await sb.from("uniform_stock_movements").insert({
      item_id: p.item.id,
      size: p.size,
      delta: -p.qty,
      reason: "issue",
      issue_id: issue.id,
      actor_user_id: issuer.id,
      note: `${NOTE}: ${p.item.name} ${p.size} x${p.qty} → ${p.staff.full_name}`,
    });

    created.push({
      staff: p.staff.username,
      sku: p.item.sku_code,
      size: p.size,
      qty: p.qty,
      stock_after: before - p.qty,
      issue_id: issue.id,
    });
  }

  console.log("\n=== ISSUED ===");
  for (const c of created) {
    console.log(
      `${c.staff}: ${c.sku} ${c.size} x${c.qty} → stock ${c.stock_after}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
