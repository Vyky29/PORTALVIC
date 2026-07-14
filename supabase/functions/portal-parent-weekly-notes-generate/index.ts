// @ts-nocheck — Edge Function (Deno).
//
// portal-parent-weekly-notes-generate
// -----------------------------------
// Build Saturday→Friday weekly notes for the family portal from filtered (or raw) feedback.
// Celebratory plain-language AI summary.
//
// Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET) or admin JWT.
//
// POST JSON:
//   mode?: "cron" | "early" | "backfill" | "contact"
//   week_start?: "YYYY-MM-DD"   // any day in week → normalised to Saturday
//   contact_ids?: string[]
//   force?: boolean
//   from_date?: "YYYY-MM-DD"    // backfill window start (inclusive)
//   through_date?: "YYYY-MM-DD" // backfill window end (inclusive)
//
// Cron (Saturday London morning): summarise the week that just ended (previous Sat–Fri).
// Early (weekday): only Mon–Wed-only attendees whose last expected day has passed.

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
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = clean(body.mode, 40).toLowerCase() || "cron";
  const force = !!body.force;
  const today = londonTodayIso();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "misconfigured" });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Saturday cron: only run around London morning unless force_hour / admin backfill.
  if (mode === "cron" && !body.force_hour && !force) {
    const wd = londonWeekdayMon1();
    const hour = londonHour();
    if (wd !== 6) {
      return json(200, { ok: true, skipped: true, reason: "not_saturday", weekday: wd });
    }
    if (hour < 8 || hour > 11) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "outside_saturday_morning",
        london_hour: hour,
      });
    }
  }

  let weekStarts: string[] = [];
  if (mode === "backfill") {
    const from = clean(body.from_date, 10) || "2026-06-01";
    const through = clean(body.through_date, 10) || today;
    weekStarts = listWeekStartsInclusive(from, through);
  } else if (mode === "early") {
    // Current week — only early-eligible kids.
    weekStarts = [saturdayWeekStart(today)];
  } else if (mode === "contact" && clean(body.week_start, 10)) {
    weekStarts = [saturdayWeekStart(clean(body.week_start, 10))];
  } else {
    // cron default: the week that ended yesterday (Fri) when run on Sat =
    // week_start = today - 7 if today is Sat, else previous completed week.
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

  const allowEarly = mode === "early" || mode === "backfill" || mode === "contact" || force;
  const results: Record<string, unknown>[] = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const weekStart of weekStarts) {
    for (const p of participants) {
      const display =
        clean(p.display_name, 200) ||
        [clean(p.first_name, 80), clean(p.last_name, 80)].filter(Boolean).join(" ");
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
        // For backfill of completed weeks, pretend "today" is after week_end
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
      if (result.skipped) {
        skipped += 1;
      } else {
        generated += 1;
      }
      if (results.length < 80) results.push(result);
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
    results,
  });
});
