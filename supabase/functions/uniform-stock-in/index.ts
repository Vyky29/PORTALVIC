// @ts-nocheck — Edge Function (Deno).
//
// uniform-stock-in
// ----------------
// Admin/issuer only: increase size qty + stock_in movement.

import {
  UNIFORM_SIZES,
  adjustStockLevel,
  cleanText,
  serviceClient,
  uniformCorsHeaders,
  uniformJson,
  verifyUniformActor,
} from "../_shared/portal_uniform.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: uniformCorsHeaders() });
  }
  if (req.method !== "POST") {
    return uniformJson(405, { ok: false, error: "method_not_allowed" });
  }

  const actor = await verifyUniformActor(req);
  if (!actor.ok) {
    return uniformJson(actor.status, { ok: false, error: actor.error });
  }
  if (!actor.canIssue) {
    return uniformJson(403, { ok: false, error: "issuer_role_required" });
  }

  const sb = serviceClient();
  if (!sb) {
    return uniformJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return uniformJson(400, { ok: false, error: "invalid_json" });
  }

  const itemId = cleanText(body.item_id || body.itemId, 64);
  const size = cleanText(body.size, 8).toUpperCase();
  const qty = Math.max(1, Math.min(500, Number(body.qty) || 0));
  const note = cleanText(body.note, 500) || null;

  if (!itemId || !qty) {
    return uniformJson(400, { ok: false, error: "item_and_qty_required" });
  }
  if (!UNIFORM_SIZES.has(size)) {
    return uniformJson(400, { ok: false, error: "invalid_size" });
  }

  const { data: item } = await sb
    .from("uniform_items")
    .select("id, name, sku_code, active")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.active === false) {
    return uniformJson(404, { ok: false, error: "item_not_found" });
  }

  // Ensure level row exists (e.g. if size was never seeded with opening 0)
  const { data: existing } = await sb
    .from("uniform_stock_levels")
    .select("id")
    .eq("item_id", itemId)
    .eq("size", size)
    .maybeSingle();
  if (!existing) {
    const { error: createErr } = await sb.from("uniform_stock_levels").insert({
      item_id: itemId,
      size,
      opening_qty: 0,
      current_qty: 0,
    });
    if (createErr) {
      return uniformJson(500, { ok: false, error: createErr.message });
    }
  }

  const stock = await adjustStockLevel(sb, itemId, size, qty);
  if (!stock.ok) {
    return uniformJson(500, { ok: false, error: stock.error });
  }

  const { error: movErr } = await sb.from("uniform_stock_movements").insert({
    item_id: itemId,
    size,
    delta: qty,
    reason: "stock_in",
    actor_user_id: actor.userId,
    note: note || `Stock in ${item.name} ${size} +${qty}`,
  });
  if (movErr) {
    console.error("[uniform-stock-in] movement failed", movErr);
  }

  return uniformJson(200, {
    ok: true,
    item: { id: item.id, name: item.name, sku_code: item.sku_code },
    size,
    qty_added: qty,
    current_qty: stock.current,
  });
});
