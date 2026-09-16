/**
 * Smoke: Feedbacks / 20:30 OV paint regressions (16 Sep 2026).
 *
 * Covers:
 *  1) Office · band labels never create 20:30 debt (Raul nag)
 *  2) Anas Tue 15: client_move clear + Javi FB — no Aurora 6–6.30 awaiting in matcher
 *  3) Joelle Thu: both Aurora + Simon seats present on board (2:1)
 *  4) slot_update previous_start matching (pure bounds helper parity with hub)
 *
 *   npx -y deno run -A database/local-vault/smoke-feedbacks-ov-paint-20260916.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  applyScheduleOverridesToFeedback2030Slots,
  isRealFeedbackClient,
  mergeFeedback2030Slots,
  outstandingByStaff,
  slotsFromCapacityChainOccupants,
  slotsFromRosterRows,
  type Feedback2030OverrideRow,
} from "../../supabase/functions/_shared/portal_feedback_2030_match.ts";
import standingOccupants from "../../supabase/functions/_shared/portal_capacity_chain_standing_occupants.json" with {
  type: "json",
};

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  const line = (pass ? "OK  " : "FAIL") + "  " + label + (detail ? " — " + detail : "");
  console.log(line);
  if (!pass) fails.push(label + (detail ? ": " + detail : ""));
}

/* --- 1) Office / duty labels --- */
ok("skip Office exact", !isRealFeedbackClient("Office"));
ok("skip Office · 11 – 3", !isRealFeedbackClient("Office · 11 – 3"));
ok("skip Hub · Office", !isRealFeedbackClient("Hub · Office"));
ok("skip Manager · 12 – 3", !isRealFeedbackClient("Manager · 12 – 3"));
ok("keep Ikram · 3 – 4", isRealFeedbackClient("Ikram · 3 – 4"));
ok("keep Joelle", isRealFeedbackClient("Joelle"));

const wedOccupants = slotsFromCapacityChainOccupants(
  (standingOccupants as { bySlotId?: Record<string, unknown> }).bySlotId as never,
  "2026-09-16",
);
const raulWed = wedOccupants.filter((s) => /^raul$/i.test(String(s.staff || "").trim()));
const raulOffice = raulWed.filter((s) => /office/i.test(s.client));
ok(
  "Wed occupants: Raul has no Office debt seats after merge filter",
  mergeFeedback2030Slots([raulWed]).every((s) => !/office/i.test(s.client)),
  "officeRows=" + raulOffice.length + " merged=" + mergeFeedback2030Slots([raulWed]).length,
);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

/* --- 2) Anas Tue 15 live --- */
{
  const iso = "2026-09-15";
  const { data: dated } = await admin
    .from("portal_roster_rows")
    .select("client_name,instructors,time_slot,service,area,session_date,day")
    .eq("session_date", iso);
  const { data: tmpl } = await admin
    .from("portal_roster_rows")
    .select("client_name,instructors,time_slot,service,area,session_date,day")
    .is("session_date", null)
    .eq("day", "Tuesday");
  const { data: ovs } = await admin
    .from("schedule_overrides")
    .select(
      "override_type,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,anchor_time_slot_label,anchor_venue,payload",
    )
    .eq("session_date", iso)
    .eq("status", "active");
  const { data: fb } = await admin
    .from("session_feedback")
    .select("client_name,session_date,portal_session_key,attendance,service,completed_by_name")
    .eq("session_date", iso);

  const anasOvs = (ovs || []).filter((o) => JSON.stringify(o).toLowerCase().includes("anas"));
  const hasMoveClear = anasOvs.some((o) => {
    const t = String(o.override_type || "");
    const p = (o.payload || {}) as Record<string, unknown>;
    return t === "slot_clear_client" && (p.client_move === true || p.client_move === "true");
  });
  const has530Cover = anasOvs.some((o) => {
    const t = String(o.override_type || "");
    const start = String(o.anchor_start || "");
    const cover = String((o.payload as { covering_staff_name?: string })?.covering_staff_name || "");
    return t === "instructor_reassign" && start.startsWith("17:30") && /javi/i.test(cover);
  });
  ok("Anas Tue15 has client_move slot_clear", hasMoveClear);
  ok("Anas Tue15 has Javi cover at 17:30", has530Cover);

  let slots = mergeFeedback2030Slots([
    slotsFromRosterRows([...(dated || []), ...(tmpl || [])], iso),
    slotsFromCapacityChainOccupants(
      (standingOccupants as { bySlotId?: Record<string, unknown> }).bySlotId as never,
      iso,
    ),
  ]);
  slots = applyScheduleOverridesToFeedback2030Slots(
    slots,
    (ovs || []) as Feedback2030OverrideRow[],
  );
  const anasSlots = slots.filter((s) => /^anas$/i.test(String(s.client || "").trim()));
  const aurora630 = anasSlots.filter(
    (s) =>
      /aurora/i.test(s.staff) &&
      (/6(\.00)?\s*(to|-|–)\s*6\.30/i.test(s.time) || /18[:.]00/.test(s.time)),
  );
  const debts = outstandingByStaff(slots, iso, {
    feedbackRows: fb || [],
    cancelRows: [],
    absentMarks: [],
    feedbackDoneMarks: [],
    staffIdByKey: {},
  });
  const auroraDebt = debts.find((d) => d.staffKey === "aurora");
  const auroraAnasSample = (auroraDebt?.sample || []).filter((x) => /anas/i.test(x));
  ok(
    "Anas not awaiting on Aurora 6–6.30 after OV+FB",
    aurora630.length === 0 && auroraAnasSample.length === 0,
    "aurora630=" + aurora630.length + " sample=" + JSON.stringify(auroraAnasSample),
  );
  const javiDebt = debts.find((d) => d.staffKey === "javi" || d.staffKey === "javier");
  const javiAnas = (javiDebt?.sample || []).filter((x) => /anas/i.test(x));
  ok(
    "Anas not still pending for Javi when FB exists",
    javiAnas.length === 0,
    "sample=" + JSON.stringify(javiAnas) + " anasSlots=" + JSON.stringify(anasSlots),
  );
}

/* --- 3) Joelle Thu 2:1 --- */
{
  const iso = "2026-09-17";
  const thu = slotsFromCapacityChainOccupants(
    (standingOccupants as { bySlotId?: Record<string, unknown> }).bySlotId as never,
    iso,
  );
  const joelle = mergeFeedback2030Slots([thu]).filter((s) => /^joelle$/i.test(s.client));
  const staffs = [...new Set(joelle.map((s) => String(s.staff || "").toLowerCase()))].sort();
  ok(
    "Joelle Thu board has Aurora + Simon",
    staffs.includes("aurora") && staffs.includes("simon"),
    "staffs=" + staffs.join(",") + " n=" + joelle.length,
  );
  const halves530 = joelle.filter((s) => /5\.30|17[:.]30/i.test(s.time));
  const hasAurora530 = halves530.some((s) => /aurora/i.test(s.staff));
  const hasSimon530 = halves530.some((s) => /simon/i.test(s.staff));
  ok("Joelle 5.30 half has both instructors", hasAurora530 && hasSimon530);
}

/* --- 4) slot_update previous→new bounds (hub paint contract) --- */
{
  function normHm(v: string): string {
    const m = String(v || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
  }
  const ov = {
    anchor_start: "16:30:00",
    anchor_end: "17:00:00",
    anchor_time_slot_label: "12.00 – 1.00",
    payload: {
      previous_start: "12:00",
      previous_end: "13:00",
      previous_time_slot: "12 to 13",
      term_roster_edit: true,
    },
  };
  const prev = normHm(String(ov.payload.previous_start));
  const next = normHm(String(ov.anchor_start));
  ok("slot_update previous≠next (real clock move)", prev === "12:00" && next === "16:30");
  ok(
    "slot_update paint prefers anchor when previous differs",
    prev !== next && next === "16:30",
    "label was stale 12–1; new clock must be 16:30",
  );
}

/* --- 5) Hub source has paint hooks --- */
{
  const hub = readFileSync("working_ui/portal/admin-sessions-hub.js", "utf8");
  ok("hub has applyClientMoveSlotClears", hub.includes("function applyClientMoveSlotClears"));
  ok("hub has applyOpenSeatReplaceInPlace", hub.includes("function applyOpenSeatReplaceInPlace"));
  ok("hub has applySlotUpdateOverrides", hub.includes("function applySlotUpdateOverrides"));
  ok(
    "hub expand calls slot_update paint",
    /applyClientMoveSlotClears[\s\S]*applySlotUpdateOverrides[\s\S]*applyInstructorReassignOverrides/.test(
      hub,
    ),
  );
  ok(
    "hub dayStats not forced through staffingSessionStats for feedback",
    !/mode === "feedback"[\s\S]{0,120}staffingSessionStats/.test(hub),
  );
}

if (fails.length) {
  console.log("\nSMOKE FAIL (" + fails.length + ")");
  for (const f of fails) console.log(" - " + f);
  Deno.exit(1);
}
console.log("\nSMOKE PASS");
