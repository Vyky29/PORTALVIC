// @ts-nocheck — Edge Function (Deno).
//
// uniform-load
// ------------
// Staff: own issues + catalog (+ pending ack).
// Issuer/admin: stock matrix, movements, staff list filter, all issues.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  cleanText,
  resolveUniformKitOffer,
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
    const movIssueIds = Array.from(
      new Set((mov || []).map((m) => m.issue_id).filter(Boolean)),
    );
    const issueMeta: Record<
      string,
      { staff_name: string; staff_username: string; issuer_name: string }
    > = {};
    if (movIssueIds.length) {
      const { data: issRows } = await sb
        .from("uniform_issues")
        .select(
          "id, staff_profile_id, issuer_staff_id, issuer_ack_name, staff_ack_name",
        )
        .in("id", movIssueIds);
      const peopleIds = Array.from(
        new Set(
          (issRows || [])
            .flatMap((r) => [r.staff_profile_id, r.issuer_staff_id])
            .filter(Boolean),
        ),
      );
      const peopleMap: Record<string, { full_name: string; username: string }> =
        {};
      if (peopleIds.length) {
        const { data: people } = await sb
          .from("staff_profiles")
          .select("id, full_name, username")
          .in("id", peopleIds);
        for (const p of people || []) {
          peopleMap[p.id] = {
            full_name: String(p.full_name || ""),
            username: String(p.username || ""),
          };
        }
      }
      for (const r of issRows || []) {
        const st = peopleMap[r.staff_profile_id];
        const iss = r.issuer_staff_id ? peopleMap[r.issuer_staff_id] : null;
        issueMeta[r.id] = {
          staff_name: st?.full_name || String(r.staff_ack_name || ""),
          staff_username: st?.username || "",
          issuer_name:
            String(r.issuer_ack_name || "") ||
            iss?.full_name ||
            "",
        };
      }
    }

    const actorIds = Array.from(
      new Set((mov || []).map((m) => m.actor_user_id).filter(Boolean)),
    );
    const actorMap: Record<string, string> = {};
    if (actorIds.length) {
      const { data: actors } = await sb
        .from("staff_profiles")
        .select("id, full_name, username")
        .in("id", actorIds);
      for (const a of actors || []) {
        actorMap[a.id] = String(a.full_name || a.username || "");
      }
    }

    movements = (mov || []).map((m) => {
      const item = (items || []).find((i) => i.id === m.item_id);
      const meta = m.issue_id ? issueMeta[m.issue_id] : null;
      return {
        ...m,
        item_name: item?.name || "",
        sku_code: item?.sku_code || "",
        staff_name: meta?.staff_name || "",
        staff_username: meta?.staff_username || "",
        issuer_name: meta?.issuer_name || "",
        actor_name: m.actor_user_id ? actorMap[m.actor_user_id] || "" : "",
      };
    });

    const { data: dir } = await sb
      .from("staff_profiles")
      .select(
        "id, full_name, username, staff_role, app_role, is_active, uniform_kit_tier",
      )
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(500);
    staffDirectory = (dir || []).map((s) => {
      const kit = resolveUniformKitOffer(s);
      return {
        ...s,
        kit_tier: kit.tier,
        kit_label: kit.label,
        kit_summary: kit.summary,
        kit_lines: kit.lines,
        kit_swimming_note: kit.swimming_note || null,
      };
    });
  }

  const { data: selfRow } = await sb
    .from("staff_profiles")
    .select("id, username, staff_role, app_role, uniform_kit_tier")
    .eq("id", actor.profileId)
    .maybeSingle();
  const selfKit = resolveUniformKitOffer(
    selfRow || {
      username: actor.username,
      staff_role: actor.staffRole,
      app_role: actor.appRole,
    },
  );

  // Optional: kit for a filtered staff member (admin selecting someone)
  let filterKit = null;
  if (staffFilter) {
    const { data: filt } = await sb
      .from("staff_profiles")
      .select("id, username, staff_role, app_role, uniform_kit_tier, full_name")
      .eq("id", staffFilter)
      .maybeSingle();
    if (filt) {
      const k = resolveUniformKitOffer(filt);
      filterKit = {
        staff_profile_id: filt.id,
        staff_name: filt.full_name,
        ...k,
      };
    }
  }

  let requestsOut: unknown[] = [];
  {
    let reqQ = sb
      .from("uniform_requests")
      .select(
        "id, staff_profile_id, item_id, size, qty, request_type, reason, " +
          "charge_applies_expected, status, created_at, resolved_at, resolve_note",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (!actor.canIssue || mode !== "admin") {
      reqQ = reqQ.eq("staff_profile_id", actor.profileId);
    } else if (staffFilter) {
      reqQ = reqQ.eq("staff_profile_id", staffFilter);
    }
    const { data: reqs } = await reqQ;
    const reqStaffIds = Array.from(
      new Set((reqs || []).map((r) => r.staff_profile_id).filter(Boolean)),
    );
    let reqStaffMap: Record<string, { full_name: string; username: string }> =
      {};
    if (reqStaffIds.length) {
      const { data: rs } = await sb
        .from("staff_profiles")
        .select("id, full_name, username")
        .in("id", reqStaffIds);
      for (const s of rs || []) {
        reqStaffMap[s.id] = {
          full_name: String(s.full_name || ""),
          username: String(s.username || ""),
        };
      }
    }
    requestsOut = (reqs || []).map((r) => {
      const item = (items || []).find((i) => i.id === r.item_id);
      const st = reqStaffMap[r.staff_profile_id];
      return {
        ...r,
        item_name: item?.name || "",
        sku_code: item?.sku_code || "",
        staff_name: st?.full_name || "",
        staff_username: st?.username || "",
      };
    });
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
    issuers: ["Berta", "Roberto", "Michelle", "John"],
    items: items || [],
    matrix,
    totals,
    seed_banner: {
      opening: 130,
      stock_out: 17,
      current: 113,
      note: "Baseline from office sheet at go-live (Opening 130 / Out 17 / Current 113).",
    },
    allocation_policy: {
      day_centre_bespoke: "2 T-shirts + 2 sweatshirts",
      support_zero_hours: "1 T-shirt + 1 sweatshirt",
      swimming:
        "None for now — swimming-specific items to be added to stock later if needed",
    },
    kit_offer: selfKit,
    filter_kit_offer: filterKit,
    issues: issuesOut,
    requests: requestsOut,
    movements,
    staff_directory: staffDirectory,
    default_initial: {
      sku_code: "STAFF_GREY_TSHIRT",
      qty: selfKit.lines[0]?.qty || 0,
      label: selfKit.summary,
      tier: selfKit.tier,
    },
  });
});
