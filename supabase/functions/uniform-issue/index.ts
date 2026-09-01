// @ts-nocheck — Edge Function (Deno).
//
// uniform-issue
// -------------
// Create issue row(s), dual ack fields, decrement stock, insert movement.
// Rejects if stock insufficient. Issuer must be manager/TL/admin (or admin JWT).

import {
  ISSUE_TYPES,
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

  const action = cleanText(body.action, 32).toLowerCase();

  // Staff confirms receipt of an existing issue line (typed name + timestamp).
  if (action === "staff_ack" || action === "ack") {
    const issueId = cleanText(body.issue_id || body.issueId, 64);
    const ackName =
      cleanText(body.staff_ack_name || body.staffAckName || body.ack_name, 120) ||
      cleanText(actor.fullName, 120);
    if (!issueId || !ackName) {
      return uniformJson(400, { ok: false, error: "issue_and_ack_name_required" });
    }
    const { data: issue } = await sb
      .from("uniform_issues")
      .select("id, staff_profile_id, staff_ack_at, status")
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) {
      return uniformJson(404, { ok: false, error: "issue_not_found" });
    }
    if (String(issue.status) !== "issued") {
      return uniformJson(409, { ok: false, error: "issue_not_active" });
    }
    const isOwner = String(issue.staff_profile_id) === String(actor.profileId);
    if (!isOwner && !actor.canIssue) {
      return uniformJson(403, { ok: false, error: "forbidden" });
    }
    if (issue.staff_ack_at) {
      return uniformJson(200, { ok: true, already_acked: true, issue });
    }
    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await sb
      .from("uniform_issues")
      .update({
        staff_ack_name: ackName,
        staff_ack_at: now,
        updated_at: now,
      })
      .eq("id", issueId)
      .select("*")
      .maybeSingle();
    if (upErr || !updated) {
      return uniformJson(500, {
        ok: false,
        error: upErr?.message || "ack_failed",
      });
    }
    return uniformJson(200, { ok: true, issue: updated });
  }

  if (!actor.canIssue) {
    return uniformJson(403, { ok: false, error: "issuer_role_required" });
  }

  const staffProfileId = cleanText(body.staff_profile_id || body.staffId, 64);
  const itemId = cleanText(body.item_id || body.itemId, 64);
  const size = cleanText(body.size, 8).toUpperCase();
  const qty = Math.max(1, Math.min(20, Number(body.qty) || 1));
  const issueType = cleanText(body.issue_type || body.issueType || "initial", 32);
  const reason = cleanText(body.reason, 500) || null;
  const chargeApplies = body.charge_applies === true || body.chargeApplies === true;
  const chargeGbp = chargeApplies
    ? Math.max(0, Number(body.charge_gbp ?? body.chargeGbp ?? 5) || 5)
    : 0;

  const issuerAckName =
    cleanText(body.issuer_ack_name || body.issuerAckName, 120) ||
    cleanText(actor.fullName, 120);
  const staffAckName = cleanText(body.staff_ack_name || body.staffAckName, 120);
  const staffAckNow =
    body.staff_ack_now === true ||
    body.staffAckNow === true ||
    Boolean(staffAckName);

  if (!staffProfileId || !itemId) {
    return uniformJson(400, { ok: false, error: "staff_and_item_required" });
  }
  if (!UNIFORM_SIZES.has(size)) {
    return uniformJson(400, { ok: false, error: "invalid_size" });
  }
  if (!ISSUE_TYPES.has(issueType)) {
    return uniformJson(400, { ok: false, error: "invalid_issue_type" });
  }
  if (!issuerAckName) {
    return uniformJson(400, { ok: false, error: "issuer_ack_name_required" });
  }

  const { data: staffRow } = await sb
    .from("staff_profiles")
    .select("id, full_name, is_active")
    .eq("id", staffProfileId)
    .maybeSingle();
  if (!staffRow || staffRow.is_active === false) {
    return uniformJson(404, { ok: false, error: "staff_not_found" });
  }

  const { data: item } = await sb
    .from("uniform_items")
    .select("id, name, sku_code, active")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.active === false) {
    return uniformJson(404, { ok: false, error: "item_not_found" });
  }

  const now = new Date().toISOString();
  const stock = await adjustStockLevel(sb, itemId, size, -qty);
  if (!stock.ok) {
    return uniformJson(409, { ok: false, error: stock.error });
  }

  const insertRow: Record<string, unknown> = {
    staff_profile_id: staffProfileId,
    item_id: itemId,
    size,
    qty,
    issue_type: issueType,
    issued_at: now,
    reason,
    charge_applies: chargeApplies,
    charge_gbp: chargeGbp,
    issuer_staff_id: actor.profileId,
    issuer_ack_name: issuerAckName,
    issuer_ack_at: now,
    status: "issued",
  };
  if (staffAckNow && staffAckName) {
    insertRow.staff_ack_name = staffAckName;
    insertRow.staff_ack_at = now;
  }

  const { data: issue, error: insErr } = await sb
    .from("uniform_issues")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (insErr || !issue) {
    // Best-effort rollback stock
    await adjustStockLevel(sb, itemId, size, qty);
    return uniformJson(500, {
      ok: false,
      error: insErr?.message || "issue_insert_failed",
    });
  }

  const { error: movErr } = await sb.from("uniform_stock_movements").insert({
    item_id: itemId,
    size,
    delta: -qty,
    reason: "issue",
    issue_id: issue.id,
    actor_user_id: actor.userId,
    note: `${issueType}: ${item.name} ${size} x${qty} → ${staffRow.full_name || staffProfileId}`,
  });
  if (movErr) {
    console.error("[uniform-issue] movement insert failed", movErr);
  }

  return uniformJson(200, {
    ok: true,
    issue,
    current_qty: stock.current,
    item: { id: item.id, name: item.name, sku_code: item.sku_code },
  });
});
