// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

const ELIGIBLE = new Set([
  "client_replace_in_slot",
  "client_absence_announced",
  "slot_open",
]);


function rosterKeyFromProfile(username: string, fullName: string): string {
  const raw = (username || "").trim() || (fullName || "").trim();
  if (!raw) return "";
  const first = raw.split(/\s+/).filter(Boolean)[0] ?? raw;
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normSpreadsheetKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function replacementDisplayName(record: Record<string, unknown>): string {
  const raw = record.payload;
  if (!raw || typeof raw !== "object") return "";
  const pl = raw as Record<string, unknown>;
  const a = String(pl.to_client_name ?? "").trim();
  if (a) return a;
  const b = String(pl.replacement_client_name ?? "").trim();
  return b;
}

function pushCopy(
  overrideType: string,
  record?: Record<string, unknown>,
): { title: string; body: string } {
  const t = String(overrideType || "").trim();
  if (t === "client_replace_in_slot") {
    const full = record ? replacementDisplayName(record) : "";
    const who = full.trim();
    if (who) {
      return {
        title: `Make-up: ${who}`,
        body: `${who} is on your roster for a make-up session.`,
      };
    }
    return {
      title: "Make-up session",
      body: "A make-up session was scheduled on your roster.",
    };
  }
  if (t === "client_absence_announced") {
    return {
      title: "Absent participant",
      body: "An absence was recorded on your roster.",
    };
  }
  if (t === "slot_open") {
    return {
      title: "Slot reopened",
      body:
        "A closed block was reopened on your roster. Open that day in the portal to review your schedule.",
    };
  }
  return { title: "Schedule update", body: "Your roster was updated." };
}

type StaffProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  app_role: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const expected = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const got = req.headers.get("x-portal-webhook-secret") ?? "";
  if (!expected || got !== expected) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ??
    "mailto:hello@clubsensational.org";
  const openBase = (Deno.env.get("PORTAL_PUSH_OPEN_URL") ?? "").replace(
    /\/$/,
    "",
  );

  if (
    !supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate || !openBase
  ) {
    console.error(
      "[portal-push-dispatch] missing env (SUPABASE_*, VAPID_*, PORTAL_PUSH_OPEN_URL)",
    );
    return new Response("Server misconfigured", {
      status: 500,
      headers: corsHeaders,
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  if (payload.table !== "schedule_overrides") {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return new Response(JSON.stringify({ skipped: true, reason: "no record" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const status = String(record.status ?? "").trim();
  if (status !== "active") {
    return new Response(JSON.stringify({ skipped: true, reason: "not active" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const overrideType = String(record.override_type ?? "").trim();
  if (!ELIGIBLE.has(overrideType)) {
    return new Response(JSON.stringify({ skipped: true, reason: "type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const overrideId = String(record.id ?? "").trim();
  if (!overrideId) {
    return new Response(JSON.stringify({ skipped: true, reason: "no id" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionDate = String(record.session_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return new Response(JSON.stringify({ skipped: true, reason: "bad date" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: horizonOk, error: hzErr } = await admin.rpc(
    "portal_session_date_in_push_horizon",
    { p_session: sessionDate },
  );
  if (hzErr) {
    console.error("[portal-push-dispatch] horizon rpc", hzErr);
    return new Response(JSON.stringify({ error: hzErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!horizonOk) {
    return new Response(JSON.stringify({ skipped: true, reason: "outside horizon" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anchorKey = normSpreadsheetKey(
    String(record.anchor_staff_id ?? ""),
  );

  const { data: profiles, error: profErr } = await admin.from("staff_profiles")
    .select("id, username, full_name, app_role")
    .in("app_role", ["staff", "lead", "ceo"]);

  if (profErr || !profiles?.length) {
    console.error("[portal-push-dispatch] profiles", profErr);
    return new Response(JSON.stringify({ error: "profiles" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetUserIds = new Set<string>();
  for (const p of profiles as StaffProfile[]) {
    const rk = rosterKeyFromProfile(
      p.username ?? "",
      p.full_name ?? "",
    );
    if (!rk) continue;
    if (rk === anchorKey) targetUserIds.add(p.id);
  }

  if (!targetUserIds.size) {
    return new Response(JSON.stringify({ ok: true, sent: 0, targets: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = [...targetUserIds];
  const { data: subs, error: subErr } = await admin.from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .in("user_id", ids);

  if (subErr) {
    console.error("[portal-push-dispatch] subs", subErr);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!subs?.length) {
    return new Response(
      JSON.stringify({
        ok: true,
        sent: 0,
        targets: ids.length,
        note: "no push subscriptions for targeted users",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error: dedupeErr } = await admin.from("portal_webpush_override_sent")
    .insert({ override_id: overrideId });

  if (dedupeErr) {
    const msg = dedupeErr.message || "";
    if (msg.includes("duplicate") || (dedupeErr as { code?: string }).code === "23505") {
      return new Response(JSON.stringify({ skipped: true, reason: "already sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[portal-push-dispatch] dedupe insert", dedupeErr);
    return new Response(JSON.stringify({ error: dedupeErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const copy = pushCopy(overrideType, record as Record<string, unknown>);
  const body = `${copy.body} Date: ${sessionDate}.`;
  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const pushPayload = JSON.stringify({
    title: copy.title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
  });

  let sent = 0;
  const rows = subs ?? [];
  for (const row of rows) {
    const raw = row.subscription_json;
    if (!raw || typeof raw !== "object") continue;
    try {
      await webpush.sendNotification(
        raw as unknown as webpush.PushSubscription,
        pushPayload,
        { TTL: 86400, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const st = (e as { statusCode?: number })?.statusCode;
      console.warn("[portal-push-dispatch] send fail", st, e);
      if (st === 404 || st === 410) {
        const ep = String(row.endpoint ?? (raw as { endpoint?: string }).endpoint ?? "");
        if (ep) {
          await admin.from("portal_push_subscriptions").delete().eq(
            "user_id",
            row.user_id as string,
          ).eq("endpoint", ep);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, targets: ids.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
