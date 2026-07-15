// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
//
// portal-push-subscribe-family
// ----------------------------
// Family portal: store Web Push subscription keyed by parent_person_id.
// Auth: x-parent-portal-session (same as parent-portal-messages-list).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: parentPortalCorsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: parentPortalCorsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return parentPortalJsonInvalid(500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, admin);
  if (!session?.parent_person_id) {
    return parentPortalJsonInvalid();
  }

  let body: { subscription?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const sub = body?.subscription;
  const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint : "";
  const keys = sub && sub.keys && typeof sub.keys === "object"
    ? sub.keys as Record<string, unknown>
    : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return new Response(JSON.stringify({ error: "Invalid subscription payload" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const userAgent = String(req.headers.get("user-agent") || "").slice(0, 400) || null;
  const parentPersonId = String(session.parent_person_id);

  const row = {
    parent_person_id: parentPersonId,
    endpoint,
    subscription_json: sub,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await admin.from("portal_family_push_subscriptions").upsert(
    row,
    { onConflict: "parent_person_id,endpoint" },
  );

  if (upErr) {
    console.error("[portal-push-subscribe-family]", upErr);
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  let pruned = 0;
  try {
    const { data: rows, error: listErr } = await admin
      .from("portal_family_push_subscriptions")
      .select("endpoint, updated_at")
      .eq("parent_person_id", parentPersonId)
      .order("updated_at", { ascending: false });
    if (!listErr && rows?.length) {
      const keep = new Set<string>([endpoint]);
      for (const r of rows) {
        const ep = String((r as { endpoint?: string }).endpoint ?? "").trim();
        if (!ep || keep.has(ep)) continue;
        if (keep.size >= 3) {
          const { error: delErr } = await admin
            .from("portal_family_push_subscriptions")
            .delete()
            .eq("parent_person_id", parentPersonId)
            .eq("endpoint", ep);
          if (!delErr) pruned++;
        } else {
          keep.add(ep);
        }
      }
    }
  } catch (e) {
    console.warn("[portal-push-subscribe-family] prune", e);
  }

  return new Response(JSON.stringify({ ok: true, pruned }), {
    status: 200,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
});
