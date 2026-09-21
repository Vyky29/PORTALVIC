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
  resolveUniformKitOffer,
  serviceClient,
  uniformCorsHeaders,
  uniformJson,
  verifyUniformActor,
} from "../_shared/portal_uniform.ts";

async function createOneIssue(
  sb: ReturnType<NonNullable<typeof serviceClient>>,
  opts: {
    actor: { profileId: string; userId: string };
    staffProfileId: string;
    staffName: string;
    itemId: string;
    itemName: string;
    size: string;
    qty: number;
    issueType: string;
    reason: string | null;
    chargeApplies: boolean;
    chargeGbp: number;
    issuerAckName: string;
    staffAckName: string;
    staffAckNow: boolean;
  },
) {
  const now = new Date().toISOString();
  const stock = await adjustStockLevel(
    sb,
    opts.itemId,
    opts.size,
    -opts.qty,
  );
  if (!stock.ok) return { ok: false as const, error: stock.error };

  const insertRow: Record<string, unknown> = {
    staff_profile_id: opts.staffProfileId,
    item_id: opts.itemId,
    size: opts.size,
    qty: opts.qty,
    issue_type: opts.issueType,
    issued_at: now,
    reason: opts.reason,
    charge_applies: opts.chargeApplies,
    charge_gbp: opts.chargeGbp,
    issuer_staff_id: opts.actor.profileId,
    issuer_ack_name: opts.issuerAckName,
    issuer_ack_at: now,
    status: "issued",
  };
  if (opts.staffAckNow && opts.staffAckName) {
    insertRow.staff_ack_name = opts.staffAckName;
    insertRow.staff_ack_at = now;
  }

  const { data: issue, error: insErr } = await sb
    .from("uniform_issues")
    .insert(insertRow)
    .select("*")
    .maybeSingle();

  if (insErr || !issue) {
    await adjustStockLevel(sb, opts.itemId, opts.size, opts.qty);
    return {
      ok: false as const,
      error: insErr?.message || "issue_insert_failed",
    };
  }

  await sb.from("uniform_stock_movements").insert({
    item_id: opts.itemId,
    size: opts.size,
    delta: -opts.qty,
    reason: "issue",
    issue_id: issue.id,
    actor_user_id: opts.actor.userId,
    note: `${opts.issueType}: ${opts.itemName} ${opts.size} x${opts.qty} → ${opts.staffName}`,
  });

  return { ok: true as const, issue, current_qty: stock.current };
}

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

  // Any staff may request kit (does not deduct stock). Issuers fulfil separately.
  if (action === "request" || action === "staff_request") {
    const itemId = cleanText(body.item_id || body.itemId, 64) || null;
    const sizeRaw = cleanText(body.size, 8).toUpperCase();
    const size = sizeRaw && UNIFORM_SIZES.has(sizeRaw) ? sizeRaw : null;
    const qty = Math.max(1, Math.min(20, Number(body.qty) || 1));
    const requestType = cleanText(
      body.request_type || body.requestType || "initial",
      32,
    ) || "initial";
    const reason = cleanText(body.reason, 500) || null;
    const chargeExpected =
      body.charge_applies === true || body.chargeApplies === true;

    if (!["initial", "replacement", "size_change", "other"].includes(requestType)) {
      return uniformJson(400, { ok: false, error: "invalid_request_type" });
    }
    if (!reason && requestType === "replacement") {
      return uniformJson(400, { ok: false, error: "reason_required" });
    }

    const { data: reqRow, error: reqErr } = await sb
      .from("uniform_requests")
      .insert({
        staff_profile_id: actor.profileId,
        item_id: itemId,
        size,
        qty,
        request_type: requestType,
        reason,
        charge_applies_expected: chargeExpected,
        status: "open",
      })
      .select("*")
      .maybeSingle();
    if (reqErr || !reqRow) {
      return uniformJson(500, {
        ok: false,
        error: reqErr?.message || "request_failed",
      });
    }
    return uniformJson(200, { ok: true, request: reqRow });
  }

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

  // Issue full recommended kit (2+2 or 1+1) for a staff member in one go.
  if (action === "issue_recommended_kit" || action === "recommended_kit") {
    const staffProfileId = cleanText(body.staff_profile_id || body.staffId, 64);
    const size = cleanText(body.size, 8).toUpperCase();
    const sizeSweat =
      cleanText(body.size_sweat || body.sweat_size || body.size, 8).toUpperCase() ||
      size;
    const issuerAckName =
      cleanText(body.issuer_ack_name || body.issuerAckName, 120) ||
      cleanText(actor.fullName, 120);
    const staffAckName = cleanText(body.staff_ack_name || body.staffAckName, 120);
    const staffAckNow =
      body.staff_ack_now === true ||
      body.staffAckNow === true ||
      Boolean(staffAckName);

    if (!staffProfileId || !issuerAckName) {
      return uniformJson(400, {
        ok: false,
        error: "staff_and_issuer_ack_required",
      });
    }
    if (!UNIFORM_SIZES.has(size) || !UNIFORM_SIZES.has(sizeSweat)) {
      return uniformJson(400, { ok: false, error: "invalid_size" });
    }

    const { data: staffRow } = await sb
      .from("staff_profiles")
      .select(
        "id, full_name, username, staff_role, app_role, is_active, uniform_kit_tier",
      )
      .eq("id", staffProfileId)
      .maybeSingle();
    if (!staffRow || staffRow.is_active === false) {
      return uniformJson(404, { ok: false, error: "staff_not_found" });
    }

    const kit = resolveUniformKitOffer(staffRow);
    if (!kit.lines.length) {
      return uniformJson(400, {
        ok: false,
        error: "no_recommended_kit",
        kit,
      });
    }

    const { data: catalog } = await sb
      .from("uniform_items")
      .select("id, name, sku_code, active")
      .eq("active", true);
    const bySku = new Map(
      (catalog || []).map((i) => [String(i.sku_code), i]),
    );

    const created = [];
    for (const line of kit.lines) {
      const item = bySku.get(line.sku_code);
      if (!item) {
        return uniformJson(404, {
          ok: false,
          error: "item_not_found",
          sku_code: line.sku_code,
        });
      }
      const lineSize =
        line.sku_code === "STAFF_GREY_SWEAT" ? sizeSweat : size;
      const one = await createOneIssue(sb, {
        actor,
        staffProfileId,
        staffName: String(staffRow.full_name || staffProfileId),
        itemId: String(item.id),
        itemName: String(item.name),
        size: lineSize,
        qty: line.qty,
        issueType: "initial",
        reason: `Recommended kit (${kit.label})`,
        chargeApplies: false,
        chargeGbp: 0,
        issuerAckName,
        staffAckName,
        staffAckNow,
      });
      if (!one.ok) {
        return uniformJson(409, {
          ok: false,
          error: one.error,
          partial_issues: created,
          kit,
        });
      }
      created.push(one.issue);
    }

    return uniformJson(200, {
      ok: true,
      kit,
      issues: created,
      count: created.length,
    });
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

  const one = await createOneIssue(sb, {
    actor,
    staffProfileId,
    staffName: String(staffRow.full_name || staffProfileId),
    itemId,
    itemName: String(item.name),
    size,
    qty,
    issueType,
    reason,
    chargeApplies,
    chargeGbp,
    issuerAckName,
    staffAckName,
    staffAckNow,
  });
  if (!one.ok) {
    return uniformJson(409, { ok: false, error: one.error });
  }

  return uniformJson(200, {
    ok: true,
    issue: one.issue,
    current_qty: one.current_qty,
    item: { id: item.id, name: item.name, sku_code: item.sku_code },
  });
});
