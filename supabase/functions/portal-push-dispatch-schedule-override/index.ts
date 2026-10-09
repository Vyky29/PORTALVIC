// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
// Deploy: supabase functions deploy portal-push-dispatch-schedule-override --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import {
  normalizeParentPhoneE164,
  sendParentMobileMessage,
  withStaffApiMachineFooter,
} from "../_shared/portal_parent_messaging.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

/** Push to the instructor whose live book changes.
 * - makeup / absence / slot_open → anchor_staff_id
 * - instructor_reassign → covering_staff_id (the worker who gains the session)
 * - instructor_reassign cancelled (was active) → same worker: cover removed
 * - slot_clear_client / slot_close / client_cancelled → that worker (named cover if set)
 * No push for move/reassign clears or COVER NEEDED placeholders. */
const ELIGIBLE = new Set([
  "client_replace_in_slot",
  "client_absence_announced",
  "slot_open",
  "instructor_reassign",
  "slot_clear_client",
  "slot_close",
  "client_cancelled",
  "session_add",
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

function payloadObj(record: Record<string, unknown>): Record<string, unknown> {
  const raw = record.payload;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function prettyClientLabel(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function replacementDisplayName(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const a = String(pl.to_client_name ?? "").trim();
  if (a) return a;
  const b = String(pl.replacement_client_name ?? "").trim();
  return b;
}

function clientDisplayName(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const fromPayload = String(
    pl.to_client_name ?? pl.replacement_client_name ?? "",
  ).trim();
  if (fromPayload) return fromPayload;
  return prettyClientLabel(String(record.anchor_client_id ?? "").trim());
}

function isSessionCancelType(t: string): boolean {
  return t === "slot_clear_client" || t === "slot_close" || t === "client_cancelled";
}

function isNamedBookedClient(record: Record<string, unknown>): boolean {
  const id = String(record.anchor_client_id ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!id) return false;
  return !(
    id === "available" ||
    id === "no_participant" ||
    id === "no_client" ||
    id === "noclient" ||
    id === "closed" ||
    id === "office" ||
    id === "manager" ||
    id === "home" ||
    id === "casa"
  );
}

function isSessionCancelledForInstructor(record: Record<string, unknown>): boolean {
  const t = String(record.override_type ?? "").trim();
  if (!isSessionCancelType(t)) return false;
  const pl = payloadObj(record);
  if (flagTrue(pl.client_move) || flagTrue(pl.day_reassign) || flagTrue(pl.not_makeup)) {
    return false;
  }
  const kind = String(
    pl.replace_kind || pl.booking_kind || pl.clear_kind || pl.session_kind || "",
  ).trim().toLowerCase();
  if (kind === "day_reassign" || kind === "slot_move" || kind === "instructor_day_cover") {
    return false;
  }
  if (!isNamedBookedClient(record)) return false;
  if (t === "client_cancelled" || t === "slot_close") return true;
  return t === "slot_clear_client" && flagTrue(pl.cancelled_by_admin);
}

function coverRosterKey(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const fromId = normSpreadsheetKey(String(pl.covering_staff_id ?? ""));
  if (fromId && fromId !== "coverneeded" && fromId !== "cover_needed") {
    return fromId;
  }
  const fromName = normSpreadsheetKey(String(pl.covering_staff_name ?? ""));
  if (fromName && fromName !== "coverneeded" && !fromName.includes("coverneeded")) {
    return fromName;
  }
  return "";
}

function flagTrue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function isTrialReplace(record?: Record<string, unknown>): boolean {
  if (!record) return false;
  const pl = payloadObj(record);
  if (pl.is_trial === true) return true;
  const k = String(pl.booking_kind || pl.session_kind || "").trim().toLowerCase();
  return k === "trial";
}

function isFinishBookingNewClient(record?: Record<string, unknown>): boolean {
  if (!record) return false;
  if (isTrialReplace(record)) return false;
  const pl = payloadObj(record);
  return flagTrue(pl.finish_booking) || flagTrue(pl.new_client) || flagTrue(pl.term_new_participant);
}

function pushCopy(
  overrideType: string,
  record?: Record<string, unknown>,
): { title: string; body: string } {
  const t = String(overrideType || "").trim();
  const who = record ? clientDisplayName(record) : "";
  if (t === "client_replace_in_slot") {
    const full = record ? replacementDisplayName(record) : "";
    const name = full.trim() || who;
    const trialName = name.replace(/\s*\(\s*trial[^)]*\)\s*/gi, " ").replace(/\s+/g, " ").trim();
    if (isTrialReplace(record)) {
      if (trialName) {
        return {
          title: `New client for trial: ${trialName}`,
          body: `${trialName} is on your roster for a trial.`,
        };
      }
      return {
        title: "New client for trial",
        body: "A trial was added to your roster.",
      };
    }
    if (isFinishBookingNewClient(record)) {
      if (name) {
        return {
          title: `New client: ${name}`,
          body: `${name} is now on your roster as a new client.`,
        };
      }
      return {
        title: "New client",
        body: "A new client was added to your roster.",
      };
    }
    if (name) {
      return {
        title: `Make-up: ${name}`,
        body: `${name} is on your roster for a make-up session.`,
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
      body: who
        ? `${who} was marked absent on your roster.`
        : "An absence was recorded on your roster.",
    };
  }
  if (t === "slot_open") {
    return {
      title: "Slot reopened",
      body:
        "A closed block was reopened on your roster. Open that day in the portal to review your schedule.",
    };
  }
  if (t === "session_add") {
    const pl = record ? payloadObj(record) : {};
    const kind = String(pl.kind || record?.anchor_client_id || "").trim().toLowerCase();
    const when = record ? String(record.anchor_time_slot_label || "").trim() : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const who = String(pl.client_name || pl.to_client_name || "").trim();
    let title = "New session";
    let what = who ? `${who} was added to your day` : "A session was added to your day";
    if (kind === "training") {
      title = "Training";
      what = "A training session was added to your day";
    } else if (kind === "shadowing") {
      title = "Shadowing";
      what = "A shadowing session was added to your day";
    } else if (kind === "meeting") {
      title = "Meeting";
      what = "A meeting was added to your day";
    }
    const bits = [what];
    if (when) bits.push(when);
    if (venue) bits.push(venue);
    return { title: title, body: bits.join(" · ") + "." };
  }
  if (t === "instructor_reassign") {
    const when = record
      ? String(record.anchor_time_slot_label || "").trim()
      : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const removed = record && String(record.status || "").trim() === "cancelled";
    if (removed) {
      const bits = [
        who || "This session",
        "is no longer on your rota",
      ];
      if (when) bits.push(`· ${when}`);
      if (venue) bits.push(`· ${venue}`);
      return {
        title: who ? `Cover removed: ${who}` : "Cover removed",
        body: bits.join(" ") + ". You are not covering this session.",
      };
    }
    const bits = [who || "A participant", "is now on your roster (cover)"];
    if (when) bits.push(`· ${when}`);
    if (venue) bits.push(`· ${venue}`);
    return {
      title: who ? `Cover: ${who}` : "Cover session",
      body: bits.join(" ") + ".",
    };
  }
  if (isSessionCancelType(t)) {
    const when = record
      ? String(record.anchor_time_slot_label || "").trim()
      : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const bits = [
      who || "A session",
      "was cancelled on your roster",
    ];
    if (when) bits.push(`· ${when}`);
    if (venue) bits.push(`· ${venue}`);
    return {
      title: who ? `Session cancelled: ${who}` : "Session cancelled",
      body: bits.join(" ") + ".",
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

function ukDate(iso: string): string {
  const m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || "").slice(0, 10);
  return m[3] + "/" + m[2] + "/" + m[1];
}

function coverEventKey(direction: "assigned" | "removed", rosterKey: string): string {
  return direction + ":" + String(rosterKey || "").slice(0, 80);
}

/** WhatsApp the named cover. Assigned and removed are separate, so undoing the override texts the same worker again. */
async function sendCoverStaffWhatsapp(
  admin: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  userIds: string[],
  direction: "assigned" | "removed",
  rosterKey: string,
) {
  const overrideId = String(record.id ?? "").trim();
  if (!overrideId || !userIds.length || !rosterKey) return;
  const event = coverEventKey(direction, rosterKey);
  const { error: insErr } = await admin.from("portal_cover_whatsapp_sent").insert({
    override_id: overrideId,
    event,
  });
  if (insErr) {
    const code = (insErr as { code?: string }).code || "";
    const msg = insErr.message || "";
    if (code === "23505" || msg.includes("duplicate")) return;
    console.warn("[portal-push-dispatch] cover wa ledger", insErr);
    return;
  }
  const { data: people } = await admin.from("staff_profiles")
    .select("id, full_name, username, phone_e164")
    .in("id", userIds);
  const who = clientDisplayName(record) || "this session";
  const when = String(record.anchor_time_slot_label || "").trim();
  const venue = String(record.anchor_venue || "").trim();
  const line = [ukDate(String(record.session_date || "")), when, venue].filter(Boolean).join(" · ");
  let sent = 0;
  for (const p of people || []) {
    const phone = normalizeParentPhoneE164(String(p.phone_e164 || ""));
    if (!phone) continue;
    const first = String(p.full_name || p.username || "there").trim().split(/\s+/)[0] || "there";
    const body = direction === "removed"
      ? `Hi ${first},\n\nYou are no longer covering ${who}.\n\n${line}.\n\nThat cover was removed.`
      : `Hi ${first},\n\nYou are covering ${who}.\n\n${line}.`;
    const result = await sendParentMobileMessage(phone, withStaffApiMachineFooter(body), {
      kind: "staff_contact_update",
    });
    if (result.ok) sent++;
    else console.warn("[portal-push-dispatch] cover wa", result.error);
  }
  if (!sent) {
    await admin.from("portal_cover_whatsapp_sent").delete().eq("override_id", overrideId).eq("event", event);
  }
}

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
  const oldStatus = String(payload.old_record?.status ?? "").trim();
  const coverRemoved =
    status === "cancelled" &&
    String(record.override_type ?? "").trim() === "instructor_reassign" &&
    (!oldStatus || oldStatus === "active");
  if (status !== "active" && !coverRemoved) {
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
  if (isSessionCancelType(overrideType) &&
    !isSessionCancelledForInstructor(record as Record<string, unknown>)) {
    return new Response(JSON.stringify({ skipped: true, reason: "not instructor cancel" }), {
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

  /** instructor_reassign → covering worker; session cancel prefers named cover else anchor. */
  let targetRosterKey = "";
  if (overrideType === "instructor_reassign") {
    targetRosterKey = coverRosterKey(record as Record<string, unknown>);
    if (!targetRosterKey) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no covering staff" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (isSessionCancelType(overrideType)) {
    targetRosterKey = coverRosterKey(record as Record<string, unknown>) ||
      normSpreadsheetKey(String(record.anchor_staff_id ?? ""));
  } else {
    targetRosterKey = normSpreadsheetKey(String(record.anchor_staff_id ?? ""));
  }
  if (!targetRosterKey) {
    return new Response(JSON.stringify({ ok: true, sent: 0, targets: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const skipPushKey = normSpreadsheetKey(
    String(payloadObj(record as Record<string, unknown>).skip_push_staff_key ?? ""),
  );
  if (
    overrideType === "client_absence_announced" &&
    skipPushKey &&
    skipPushKey === targetRosterKey
  ) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "actor_already_marked" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

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
    const rk = rosterKeyFromProfile(p.username ?? "", p.full_name ?? "");
    if (rk === targetRosterKey) targetUserIds.add(p.id);
  }

  if (!targetUserIds.size) {
    return new Response(JSON.stringify({ ok: true, sent: 0, targets: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = [...targetUserIds];

  if (overrideType === "instructor_reassign") {
    const direction = coverRemoved ? "removed" : "assigned";
    await sendCoverStaffWhatsapp(
      admin,
      record as Record<string, unknown>,
      ids,
      direction,
      targetRosterKey,
    );
    if (!coverRemoved && payload.old_record && typeof payload.old_record === "object") {
      const oldKey = coverRosterKey(payload.old_record as Record<string, unknown>);
      if (oldKey && oldKey !== targetRosterKey) {
        const oldIds: string[] = [];
        for (const p of profiles as StaffProfile[]) {
          if (rosterKeyFromProfile(p.username ?? "", p.full_name ?? "") === oldKey) oldIds.push(p.id);
        }
        if (oldIds.length) {
          await sendCoverStaffWhatsapp(
            admin,
            payload.old_record as Record<string, unknown>,
            oldIds,
            "removed",
            oldKey,
          );
        }
      }
    }
  }

  const { data: subs, error: subErr } = await admin.from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .in("user_id", ids)
    .eq("register_app", "portal");

  if (subErr) {
    console.error("[portal-push-dispatch] subs", subErr);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!subs?.length) {
    if (isSessionCancelType(overrideType)) {
      return new Response(
        JSON.stringify({
          ok: true,
          sent: 0,
          targets: ids.length,
          note: "no push subscriptions",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
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
      if (coverRemoved) {
        const removedEvent = "push_removed";
        const { error: pushLedgerErr } = await admin.from("portal_cover_whatsapp_sent").insert({
          override_id: overrideId,
          event: removedEvent,
        });
        const pushDup = pushLedgerErr &&
          ((pushLedgerErr as { code?: string }).code === "23505" ||
            (pushLedgerErr.message || "").includes("duplicate"));
        if (!pushLedgerErr || !pushDup) {
          if (pushLedgerErr && !pushDup) {
            console.warn("[portal-push-dispatch] cover removed push ledger", pushLedgerErr);
          } else if (subs?.length) {
            const copy = pushCopy(overrideType, record as Record<string, unknown>);
            const notifyUrl = `${openBase}?portalOpen=alerts`;
            const pushPayload = JSON.stringify({
              title: copy.title,
              body: `${copy.body} Date: ${sessionDate}.`,
              url: notifyUrl,
              portalOpen: "alerts",
            });
            for (const row of subs) {
              const raw = row.subscription_json;
              if (!raw || typeof raw !== "object") continue;
              try {
                await webpush.sendNotification(
                  raw as unknown as webpush.PushSubscription,
                  pushPayload,
                  { TTL: 86400, urgency: "high" },
                );
              } catch (e) {
                console.warn("[portal-push-dispatch] cover removed push", e);
              }
            }
          }
        }
      }
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
  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const body = `${copy.body} Date: ${sessionDate}.`;
  const pushPayload = JSON.stringify({
    title: copy.title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
  });

  let sent = 0;
  const rows = subs ?? [];

  for (const row of rows) {
    const userId = String(row.user_id ?? "");
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
            userId,
          ).eq("endpoint", ep);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, targets: ids.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
