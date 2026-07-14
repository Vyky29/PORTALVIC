// @ts-nocheck — Edge Function (Deno).
//
// portal-parent-weekly-notes-generate
// -----------------------------------
// Auto Saturday→Friday weekly notes + optional WhatsApp notify.
// Admin does NOT need to press anything — crons call this.
//
// Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET) or admin JWT.
//
// POST JSON:
//   mode?: "cron" | "early" | "backfill" | "contact"
//   week_start?: "YYYY-MM-DD"
//   contact_ids?: string[]
//   force?: boolean
//   notify?: boolean          // default true for cron/early; false for backfill
//   force_hour?: boolean
//   from_date? / through_date? for backfill
//
// Crons:
//   - Weekday evening (London ~20:00): mode=early  → Mon–Wed-only kids once their week is done
//   - Saturday morning (London ~09:00): mode=cron → everyone for the week that just ended

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyPortalAdminAccessToken } from "../_shared/portal_admin_auth.ts";
import {
  fridayWeekEnd,
  generateWeeklyNoteForContact,
  listWeekStartsInclusive,
  londonTodayIso,
  saturdayWeekStart,
  addDaysIso,
} from "../_shared/parent_weekly_notes.ts";
import { notifyParentWeeklyNoteReady } from "../_shared/parent_weekly_notes_notify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function londonHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  }).format(d);
  return Number(h);
}

function londonWeekdayMon1(d = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] || 0;
}

type ParticipantRow = {
  contact_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method === "GET") {
    return json(200, {
      ok: true,
      openai: Boolean(Deno.env.get("OPENAI_API_KEY")),
      model: Deno.env.get("PORTAL_OPENAI_MODEL") || "gpt-4o-mini",
      week: "saturday_friday",
      auto: true,
    });
  }

  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const webhookSecret = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const gotSecret = req.headers.get("x-portal-webhook-secret") ?? "";
  const webhookOk = !!webhookSecret && gotSecret === webhookSecret;
  let adminOk = false;
  if (!webhookOk) {
    const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
    adminOk = verified.ok;
  }
  if (!webhookOk && !adminOk) {
    return json(403, { ok: false, error: "forbidden" });
  }

  let body: {
    mode?: string;
    week_start?: string;
    contact_ids?: string[];
    force?: boolean;
    from_date?: string;
    through_date?: string;
    force_hour?: boolean;
    notify?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = clean(body.mode, 40).toLowerCase() || "cron";
  const force = !!body.force;
  const today = londonTodayIso();
  const notifyDefault = mode === "backfill" ? false : true;
  const doNotify = body.notify == null ? notifyDefault : !!body.notify;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "misconfigured" });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Time gates (skipped when force / force_hour / admin contact|backfill).
  if (!body.force_hour && !force && mode !== "backfill" && mode !== "contact") {
    const wd = londonWeekdayMon1();
    const hour = londonHour();
    if (mode === "cron") {
      if (wd !== 6) {
        return json(200, { ok: true, skipped: true, reason: "not_saturday", weekday: wd });
      }
      if (hour < 7 || hour > 11) {
        return json(200, {
          ok: true,
          skipped: true,
          reason: "outside_saturday_morning",
          london_hour: hour,
        });
      }
    }
    if (mode === "early") {
      if (wd < 2 || wd > 5) {
        // Tue–Fri evenings (Mon-only kids wait until Tue).
        return json(200, { ok: true, skipped: true, reason: "not_early_weekday", weekday: wd });
      }
      if (hour < 18 || hour > 21) {
        return json(200, {
          ok: true,
          skipped: true,
          reason: "outside_early_evening",
          london_hour: hour,
        });
      }
    }
  }

  let weekStarts: string[] = [];
  if (mode === "backfill") {
    const from = clean(body.from_date, 10) || "2026-06-01";
    const through = clean(body.through_date, 10) || today;
    weekStarts = listWeekStartsInclusive(from, through);
  } else if (mode === "early") {
    weekStarts = [saturdayWeekStart(today)];
  } else if (mode === "contact" && clean(body.week_start, 10)) {
    weekStarts = [saturdayWeekStart(clean(body.week_start, 10))];
  } else {
    const wd = londonWeekdayMon1();
    if (wd === 6) {
      weekStarts = [addDaysIso(saturdayWeekStart(today), -7)];
    } else {
      weekStarts = [saturdayWeekStart(addDaysIso(today, -7))];
    }
    if (clean(body.week_start, 10)) {
      weekStarts = [saturdayWeekStart(clean(body.week_start, 10))];
    }
  }

  weekStarts = weekStarts.filter(Boolean);
  if (!weekStarts.length) {
    return json(400, { ok: false, error: "no_weeks" });
  }

  let participants: ParticipantRow[] = [];
  const contactFilter = Array.isArray(body.contact_ids)
    ? body.contact_ids.map((c) => clean(c, 80)).filter(Boolean)
    : [];

  if (contactFilter.length) {
    const { data, error } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactFilter);
    if (error) return json(500, { ok: false, error: clean(error.message) });
    participants = (data || []) as ParticipantRow[];
  } else {
    const { data, error } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .eq("in_class", true);
    if (error) return json(500, { ok: false, error: clean(error.message) });
    participants = (data || []) as ParticipantRow[];
  }

  const displayByContact = new Map<string, string>();
  for (const p of participants) {
    const display =
      clean(p.display_name, 200) ||
      [clean(p.first_name, 80), clean(p.last_name, 80)].filter(Boolean).join(" ");
    displayByContact.set(String(p.contact_id), display);
  }

  const allowEarly = mode === "early" || mode === "backfill" || mode === "contact" || force;
  const results: Record<string, unknown>[] = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let notified = 0;
  let notifySkipped = 0;
  let notifyFailed = 0;

  for (const weekStart of weekStarts) {
    for (const p of participants) {
      const display = displayByContact.get(String(p.contact_id)) || "";
      const result = await generateWeeklyNoteForContact(supabase, {
        contactId: String(p.contact_id),
        identity: {
          contactId: String(p.contact_id),
          displayName: display,
          firstName: clean(p.first_name, 80),
          lastName: clean(p.last_name, 80),
        },
        displayName: display,
        weekStart,
        force: force || mode === "backfill",
        allowEarly: allowEarly || mode === "early",
        todayIso:
          mode === "backfill" || force
            ? addDaysIso(fridayWeekEnd(weekStart), 1)
            : today,
      });

      if (!result.ok) {
        failed += 1;
        results.push(result);
        continue;
      }
      if (result.skipped) skipped += 1;
      else generated += 1;
      if (results.length < 80) results.push(result);
    }

    if (!doNotify) continue;

    // Notify any ready notes for this week that have not been pushed yet
    // (covers freshly generated + previously generated-but-unsent).
    const { data: pending } = await supabase
      .from("portal_parent_weekly_notes")
      .select("contact_id, week_start, week_end, body")
      .eq("week_start", weekStart)
      .eq("share_status", "ready")
      .is("notified_at", null);

    for (const row of pending || []) {
      const cid = String(row.contact_id || "");
      if (contactFilter.length && !contactFilter.includes(cid)) continue;
      const display = displayByContact.get(cid) || cid;
      const n = await notifyParentWeeklyNoteReady(supabase, {
        contactId: cid,
        weekStart: String(row.week_start),
        weekEnd: String(row.week_end),
        body: String(row.body || ""),
        displayName: display,
      });
      if (n.ok && !n.skipped) notified += 1;
      else if (n.skipped) notifySkipped += 1;
      else notifyFailed += 1;
      if (results.length < 120) {
        results.push({ notify: true, contact_id: cid, week_start: weekStart, ...n });
      }
    }
  }

  return json(200, {
    ok: true,
    mode,
    weeks: weekStarts,
    participants: participants.length,
    generated,
    skipped,
    failed,
    notify: doNotify,
    notified,
    notify_skipped: notifySkipped,
    notify_failed: notifyFailed,
    results,
  });
});
