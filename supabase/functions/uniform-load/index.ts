// @ts-nocheck — Edge Function (Deno).
//
// uniform-load
// ------------
// Staff: own issues + catalog (+ pending ack).
// Issuer/admin: stock matrix, movements, staff list filter, all issues.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
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
    body = {};
  }

  const staffFilter = cleanText(body.staff_profile_id || body.staffId, 64);
  const mode = cleanText(body.mode || (actor.isAdminView ? "admin" : "staff"), 20);

  const { data: items, error: itemsErr } = await sb
    .from("uniform_items")
    .select("id, sku_code, name, category, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (itemsErr) {
    return uniformJson(500, { ok: false, error: itemsErr.message });
  }

  const { data: levels, error: levelsErr } = await sb
    .from("uniform_stock_levels")
    .select("id, item_id, size, opening_qty, current_qty, updated_at");
  if (levelsErr) {
    return uniformJson(500, { ok: false, error: levelsErr.message });
  }

  const itemIds = (items || []).map((i) => i.id);

  // Issued qty still out (status = issued) per item+size
  const issuedOut: Record<string, number> = {};
  if (itemIds.length) {
    const { data: openIssues } = await sb
      .from("uniform_issues")
      .select("item_id, size, qty")
      .eq("status", "issued")
      .in("item_id", itemIds);
    for (const row of openIssues || []) {
      const k = `${row.item_id}|${row.size}`;
      issuedOut[k] = (issuedOut[k] || 0) + Number(row.qty || 0);
    }
  }

  // Stock-in totals from movements
  const stockInTotals: Record<string, number> = {};
  const preOutTotals: Record<string, number> = {};
  if (itemIds.length) {
    const { data: movAgg } = await sb
      .from("uniform_stock_movements")
      .select("item_id, size, delta, reason")
      .in("item_id", itemIds)
      .in("reason", ["stock_in", "pre_portal_stock_out"]);
    for (const m of movAgg || []) {
      const k = `${m.item_id}|${m.size}`;
      if (m.reason === "stock_in") {
        stockInTotals[k] = (stockInTotals[k] || 0) + Number(m.delta || 0);
      } else if (m.reason === "pre_portal_stock_out") {
        preOutTotals[k] = (preOutTotals[k] || 0) + Math.abs(Number(m.delta || 0));
      }
    }
  }

  const matrix = (levels || []).map((lv) => {
    const k = `${lv.item_id}|${lv.size}`;
    const item = (items || []).find((i) => i.id === lv.item_id);
    return {
      item_id: lv.item_id,
      sku_code: item?.sku_code || "",
      name: item?.name || "",
      category: item?.category || "",
      size: lv.size,
      opening_qty: Number(lv.opening_qty || 0),
      stock_in_qty: stockInTotals[k] || 0,
      pre_portal_out_qty: preOutTotals[k] || 0,
      issued_open_qty: issuedOut[k] || 0,
      current_qty: Number(lv.current_qty || 0),
    };
  });

  const totals = matrix.reduce(
    (acc, row) => {
      acc.opening += row.opening_qty;
      acc.current += row.current_qty;
      acc.stock_in += row.stock_in_qty;
      acc.pre_out += row.pre_portal_out_qty;
      acc.issued_open += row.issued_open_qty;
      return acc;
    },
    { opening: 0, current: 0, stock_in: 0, pre_out: 0, issued_open: 0 },
  );

  // Own / filtered issues
  let issuesQuery = sb
    .from("uniform_issues")
    .select(
      "id, staff_profile_id, item_id, size, qty, issue_type, issued_at, reason, " +
        "charge_applies, charge_gbp, staff_ack_name, staff_ack_at, " +
        "issuer_staff_id, issuer_ack_name, issuer_ack_at, status, returned_at, return_note, created_at",
    )
    .order("issued_at", { ascending: false })
    .limit(500);

  if (mode !== "admin" || !actor.isAdminView) {
    issuesQuery = issuesQuery.eq("staff_profile_id", actor.profileId);
  } else if (staffFilter) {
    issuesQuery = issuesQuery.eq("staff_profile_id", staffFilter);
  }

  const { data: issues, error: issuesErr } = await issuesQuery;
  if (issuesErr) {
    return uniformJson(500, { ok: false, error: issuesErr.message });
  }

  const staffIds = Array.from(
    new Set((issues || []).map((i) => i.staff_profile_id).filter(Boolean)),
  );
  let staffMap: Record<string, { id: string; full_name: string; username: string }> = {};
  if (staffIds.length) {
    const { data: staffRows } = await sb
      .from("staff_profiles")
      .select("id, full_name, username")
      .in("id", staffIds);
    for (const s of staffRows || []) {
      staffMap[s.id] = {
        id: s.id,
        full_name: String(s.full_name || ""),
        username: String(s.username || ""),
      };
    }
  }

  const issuesOut = (issues || []).map((iss) => {
    const item = (items || []).find((i) => i.id === iss.item_id);
    const staff = staffMap[iss.staff_profile_id];
    return {
      ...iss,
      item_name: item?.name || "",
      sku_code: item?.sku_code || "",
      staff_name: staff?.full_name || "",
      staff_username: staff?.username || "",
      pending_staff_ack: !iss.staff_ack_at,
      pending_issuer_ack: !iss.issuer_ack_at,
    };
  });

  let movements: unknown[] = [];
  let staffDirectory: unknown[] = [];
  if (actor.isAdminView && mode === "admin") {
    let movQ = sb
      .from("uniform_stock_movements")
      .select(
        "id, item_id, size, delta, reason, issue_id, actor_user_id, note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (staffFilter) {
      const issueIds = (issues || []).map((i) => i.id);
      if (issueIds.length) movQ = movQ.in("issue_id", issueIds);
      else movQ = movQ.eq("issue_id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: mov } = await movQ;
    movements = (mov || []).map((m) => {
      const item = (items || []).find((i) => i.id === m.item_id);
      return {
        ...m,
        item_name: item?.name || "",
        sku_code: item?.sku_code || "",
      };
    });

    const { data: dir } = await sb
      .from("staff_profiles")
      .select("id, full_name, username, staff_role, app_role, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(500);
    staffDirectory = dir || [];
  }

  return uniformJson(200, {
    ok: true,
    actor: {
      profile_id: actor.profileId,
      full_name: actor.fullName,
      username: actor.username,
      can_issue: actor.canIssue,
      is_admin_view: actor.isAdminView,
    },
    items: items || [],
    matrix,
    totals,
    seed_banner: {
      opening: 130,
      stock_out: 17,
      current: 113,
      note: "Baseline from office sheet at go-live (Opening 130 / Out 17 / Current 113).",
    },
    issues: issuesOut,
    movements,
    staff_directory: staffDirectory,
    default_initial: {
      sku_code: "STAFF_GREY_TSHIRT",
      qty: 2,
      label: "2 x Grey Mixed Cotton T-Shirts (size chosen at issue)",
    },
  });
});
