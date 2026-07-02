#!/usr/bin/env node
/**
 * 1) Ensure Calendar 2026/27 announcement is informational (no signature).
 * 2) Ensure annual profile announcement exists.
 * 3) Send annual profile reminder + Web Push to staff/leads who have not confirmed in 2026.
 *
 *   node database/local-vault/send-annual-profile-reminder.mjs --dry
 *   node database/local-vault/send-annual-profile-reminder.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const CALENDAR_ANN_ID = "a0270001-0001-4000-8000-0000000a2701";
const PROFILE_ANN_ID = "a0260001-0001-4000-8000-0000000a2601";
const CAMPAIGN_START = "2026-01-01T00:00:00Z";
const CAMPAIGN_START_MS = Date.parse(CAMPAIGN_START);

const CALENDAR_BODY = `Term dates and calendar for the 2026/27 academic year.

This is for your reference only — you do not need to sign anything.

Open Quick Menu → Reference → Calendar 2026/27 to see Day Centre (Mon–Fri) and Weekly & Weekend Sessions.

Download PDF to My Documents is optional whenever you want a copy for your records.`;

const PROFILE_ANN_BODY = `Before the new academic year, we need every team member to confirm their contact details on file.

Open Quick Menu → Annual profile check-in (you are already signed in to the portal). Check your home address, mobile number, emergency contact, and whether you want the same shifts as last year or something different.

The notice will disappear from your dashboard once you submit the form.`;

const REMINDER_TITLE = "Reminder: annual profile check-in";
const REMINDER_BODY = `Please confirm your contact details for the new academic year.

Open the portal → Quick Menu → Annual profile check-in (or Alerts → New Announcement → Open annual profile).

The notice clears automatically when you submit the form.`;

function readEnv(key) {
  const line = fs
    .readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

function profileComplete(confirmedAt) {
  if (!confirmedAt) return false;
  const t = Date.parse(String(confirmedAt));
  return Number.isFinite(t) && t >= CAMPAIGN_START_MS;
}

function calendarNeedsFix(row) {
  if (!row) return true;
  const body = String(row.body || "");
  const ack = String(row.on_ack_action || "").trim();
  if (ack && ack !== "null") return true;
  if (/sign below|when you sign|automatically in your my documents folder/i.test(body)) {
    return true;
  }
  if (!/for your reference only|you do not need to sign/i.test(body)) return true;
  return false;
}

async function dispatchPush(record) {
  const url = readEnv("SUPABASE_URL").replace(/\/$/, "");
  const secret = readEnv("PORTAL_PUSH_WEBHOOK_SECRET");
  const res = await fetch(
    `${url}/functions/v1/portal-push-dispatch-announcement`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-portal-webhook-secret": secret,
      },
      body: JSON.stringify({
        type: "INSERT",
        table: "portal_staff_announcements",
        record,
      }),
    }
  );
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function ensureCalendarAnnouncement(admin, DRY, report) {
  const { data: calRow, error: calErr } = await admin
    .from("portal_staff_announcements")
    .select("id,title,body,on_ack_action")
    .eq("id", CALENDAR_ANN_ID)
    .maybeSingle();
  if (calErr) {
    console.error("calendar fetch", calErr);
    process.exit(1);
  }

  if (calendarNeedsFix(calRow)) {
    report.calendar = { action: "update", before: calRow || null };
    if (!DRY) {
      const { error: upErr } = await admin
        .from("portal_staff_announcements")
        .update({ body: CALENDAR_BODY, on_ack_action: null })
        .eq("id", CALENDAR_ANN_ID);
      if (upErr) {
        console.error("calendar update failed", upErr);
        process.exit(1);
      }
      report.calendar.updated = true;
    }
  } else {
    report.calendar = { action: "ok", title: calRow.title };
  }
}

async function ensureProfileAnnouncement(admin, adminRow, DRY, report) {
  const { data: profAnn, error: profErr } = await admin
    .from("portal_staff_announcements")
    .select("id,title,on_ack_action")
    .eq("id", PROFILE_ANN_ID)
    .maybeSingle();
  if (profErr) {
    console.error("profile announcement fetch", profErr);
    process.exit(1);
  }

  if (!profAnn) {
    report.profileAnn = { action: "insert" };
    if (!DRY) {
      const { error: insAnnErr } = await admin.from("portal_staff_announcements").upsert(
        {
          id: PROFILE_ANN_ID,
          created_by: adminRow.id,
          title: "Annual profile check-in — please update your details",
          body: PROFILE_ANN_BODY,
          message_type: "announcement",
          priority: "high",
          audience_scope: "all_staff",
          delivery_scope: "everyone",
          on_ack_action: "annual_profile",
        },
        { onConflict: "id" }
      );
      if (insAnnErr) {
        console.error("profile announcement upsert failed", insAnnErr);
        process.exit(1);
      }
      report.profileAnn.inserted = true;
    }
  } else {
    report.profileAnn = {
      action: "ok",
      id: profAnn.id,
      title: profAnn.title,
      on_ack_action: profAnn.on_ack_action,
    };
  }
}

async function main() {
  const DRY = process.argv.includes("--dry");
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: adminRow, error: adminErr } = await admin
    .from("staff_profiles")
    .select("id,username")
    .in("app_role", ["admin", "ceo"])
    .limit(1)
    .maybeSingle();
  if (adminErr || !adminRow?.id) {
    console.error("No admin profile for created_by", adminErr);
    process.exit(1);
  }

  const report = { dry: DRY, calendar: null, profileAnn: null, reminders: [] };

  await ensureCalendarAnnouncement(admin, DRY, report);
  await ensureProfileAnnouncement(admin, adminRow, DRY, report);

  const { data: staff, error: staffErr } = await admin
    .from("staff_profiles")
    .select("id,username,full_name,app_role,profile_last_confirmed_at,is_active")
    .in("app_role", ["staff", "lead"])
    .order("full_name");
  if (staffErr) {
    console.error("staff_profiles", staffErr);
    process.exit(1);
  }

  const pending = (staff || []).filter((p) => {
    if (p.is_active === false) return false;
    return !profileComplete(p.profile_last_confirmed_at);
  });

  report.pendingCount = pending.length;
  report.doneCount = (staff || []).length - pending.length;

  for (const prof of pending) {
    const entry = {
      username: prof.username,
      name: prof.full_name,
      id: prof.id,
    };

    if (DRY) {
      entry.ok = true;
      entry.dry = true;
      report.reminders.push(entry);
      continue;
    }

    const row = {
      created_by: adminRow.id,
      title: REMINDER_TITLE,
      body: REMINDER_BODY,
      message_type: "reminder",
      priority: "high",
      audience_scope: "all_staff",
      delivery_scope: "single_user",
      target_staff_role: null,
      target_user_id: prof.id,
      reminder_category: "notes",
      on_ack_action: null,
    };

    const { data: inserted, error: insErr } = await admin
      .from("portal_staff_announcements")
      .insert([row])
      .select("*")
      .single();

    if (insErr) {
      entry.ok = false;
      entry.error = insErr.message;
      report.reminders.push(entry);
      continue;
    }

    entry.ok = true;
    entry.announcementId = inserted.id;

    try {
      const push = await dispatchPush(inserted);
      entry.push = push.json;
      entry.pushOk = push.ok;
    } catch (e) {
      entry.pushOk = false;
      entry.pushError = String(e && e.message ? e.message : e);
    }

    report.reminders.push(entry);
  }

  console.log(JSON.stringify(report, null, 2));
  const failed = report.reminders.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
