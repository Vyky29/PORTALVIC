// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-credits-list
// Parent sees credit/refund ledger for a participant (+ family open totals).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function moneySum(rows: { amount_gbp?: number | string | null }[]): number | null {
  let any = false;
  let sum = 0;
  for (const r of rows) {
    if (r.amount_gbp == null || r.amount_gbp === "") continue;
    const n = Number(r.amount_gbp);
    if (!Number.isFinite(n)) continue;
    any = true;
    sum += n;
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return parentPortalJsonInvalid(500);

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const session = await resolveParentPortalSession(req, supabase);
    if (!session) return parentPortalJsonInvalid();

    let body: { contact_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const contactId = clean(body.contact_id, 120);
    if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

    const { data: participant } = await supabase
      .from("portal_participants")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!participant) {
      const fallback = await supabase
        .from("portal_parent_contacts")
        .select("contact_id")
        .eq("parent_person_id", session.parent_person_id)
        .eq("contact_id", contactId)
        .maybeSingle();
      if (!fallback.data) return parentPortalJsonInvalid(403);
    }

    const { data: rows, error } = await supabase
      .from("portal_parent_family_credits")
      .select(
        "id, contact_id, participant_display, kind, status, amount_gbp, currency, service_label, session_date, notes, source, created_at, closed_at, close_notes",
      )
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[parent-portal-credits-list]", error.message);
      return parentPortalJsonInvalid(500);
    }

    const list = rows || [];
    const openCredits = list.filter((r) => r.kind === "credit" && r.status === "open");
    const openRefunds = list.filter((r) => r.kind === "refund" && r.status === "open");

    return json(200, {
      ok: true,
      entries: list,
      summary: {
        open_credit_count: openCredits.length,
        open_refund_count: openRefunds.length,
        open_credit_gbp: moneySum(openCredits),
        open_refund_gbp: moneySum(openRefunds),
      },
    });
  } catch (e) {
    console.error("[parent-portal-credits-list]", e);
    return parentPortalJsonInvalid(500);
  }
});
