// @ts-nocheck — Edge Function (Deno).
//
// uniform-return
// --------------
// Mark issue returned; restock increments stock + movement; scrap records
// return_scrap with delta 0 (audit only).

import {
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

  const issueId = cleanText(body.issue_id || body.issueId, 64);
  const disposition = cleanText(
    body.disposition || body.return_mode || "restock",
    32,
  ).toLowerCase();
  const note = cleanText(body.note || body.return_note, 500) || null;

  if (!issueId) {
    return uniformJson(400, { ok: false, error: "issue_id_required" });
  }
  if (disposition !== "restock" && disposition !== "scrap") {
    return uniformJson(400, { ok: false, error: "invalid_disposition" });
  }

  const { data: issue, error: findErr } = await sb
    .from("uniform_issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (findErr) {
    return uniformJson(500, { ok: false, error: findErr.message });
  }
  if (!issue) {
    return uniformJson(404, { ok: false, error: "issue_not_found" });
  }
  if (String(issue.status) !== "issued") {
    return uniformJson(409, { ok: false, error: "already_returned" });
  }

  const now = new Date().toISOString();
  const newStatus =
    disposition === "restock" ? "returned_restock" : "returned_scrap";
  let currentQty: number | null = null;

  if (disposition === "restock") {
    const stock = await adjustStockLevel(
      sb,
      String(issue.item_id),
      String(issue.size),
      Number(issue.qty) || 1,
    );
    if (!stock.ok) {
      return uniformJson(500, { ok: false, error: stock.error });
    }
    currentQty = stock.current;
  }

  const { data: updated, error: upErr } = await sb
    .from("uniform_issues")
    .update({
      status: newStatus,
      returned_at: now,
      return_note: note,
      updated_at: now,
    })
    .eq("id", issueId)
    .eq("status", "issued")
    .select("*")
    .maybeSingle();

  if (upErr || !updated) {
    // Rollback restock if we already incremented
    if (disposition === "restock") {
      await adjustStockLevel(
        sb,
        String(issue.item_id),
        String(issue.size),
        -(Number(issue.qty) || 1),
      );
    }
    return uniformJson(500, {
      ok: false,
      error: upErr?.message || "return_update_failed",
    });
  }

  const delta =
    disposition === "restock" ? Number(issue.qty) || 1 : 0;
  await sb.from("uniform_stock_movements").insert({
    item_id: issue.item_id,
    size: issue.size,
    delta,
    reason: disposition === "restock" ? "return_restock" : "return_scrap",
    issue_id: issue.id,
    actor_user_id: actor.userId,
    note: note || (disposition === "restock" ? "Returned to stock" : "Returned — scrap / not restocked"),
  });

  return uniformJson(200, {
    ok: true,
    issue: updated,
    current_qty: currentQty,
  });
});
